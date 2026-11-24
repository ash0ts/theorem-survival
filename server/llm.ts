import fs from "node:fs";
import path from "node:path";
import type { ForgeCredentials } from "./credentials";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  latencyMs: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  modelOverride?: string;
}

export const HARD_SPEND_CAP_USD = 24.0;

interface SpendLedger {
  updatedAtUtc: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedUsd: number;
  byModel: Record<
    string,
    { calls: number; inputTokens: number; outputTokens: number; estimatedUsd: number }
  >;
}

const LEDGER_PATH = path.join(process.cwd(), "out", "spend-ledger.json");

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const m = model.toLowerCase();
  // Conservative per-1M-token rates so we stay strictly under the $25 ceiling
  if (m.includes("kimi")) {
    return (inputTokens * 0.6 + outputTokens * 2.5) / 1_000_000;
  }
  return (inputTokens * 0.15 + outputTokens * 0.6) / 1_000_000;
}

export function readSpendLedger(): SpendLedger {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")) as SpendLedger;
    }
  } catch {
    // ignore
  }
  return {
    updatedAtUtc: new Date().toISOString(),
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalEstimatedUsd: 0,
    byModel: {},
  };
}

function recordSpend(model: string, inputTokens: number, outputTokens: number): number {
  const deltaUsd = estimateCostUsd(model, inputTokens, outputTokens);
  const ledger = readSpendLedger();
  ledger.updatedAtUtc = new Date().toISOString();
  ledger.totalCalls += 1;
  ledger.totalInputTokens += inputTokens;
  ledger.totalOutputTokens += outputTokens;
  ledger.totalEstimatedUsd = Number((ledger.totalEstimatedUsd + deltaUsd).toFixed(6));
  const bucket = ledger.byModel[model] ?? {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedUsd: 0,
  };
  bucket.calls += 1;
  bucket.inputTokens += inputTokens;
  bucket.outputTokens += outputTokens;
  bucket.estimatedUsd = Number((bucket.estimatedUsd + deltaUsd).toFixed(6));
  ledger.byModel[model] = bucket;

  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
  return deltaUsd;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chatCompletion(
  creds: ForgeCredentials,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const currentLedger = readSpendLedger();
  if (currentLedger.totalEstimatedUsd >= HARD_SPEND_CAP_USD) {
    throw new Error(
      `Hard spend cap reached ($${currentLedger.totalEstimatedUsd.toFixed(2)} >= $${HARD_SPEND_CAP_USD.toFixed(2)}). Halting inference calls per research/contract.md.`,
    );
  }

  const targetModel = opts.modelOverride ?? creds.model;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.apiKey}`,
    "Content-Type": "application/json",
  };
  if (creds.project) headers["OpenAI-Project"] = creds.project;

  const isGlm = /glm/i.test(targetModel);
  const payload: Record<string, unknown> = {
    model: targetModel,
    temperature: opts.temperature ?? 0.1,
    max_tokens: Math.max(opts.maxTokens ?? 1400, isGlm ? 1400 : 700),
    messages: messages.map((m) => ({
      ...m,
      content: m.content.replace(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
        "\uFFFD",
      ),
    })),
  };
  // Note: zai-org/GLM-5.3-Flash ignores chat_template_kwargs.enable_thinking=false
  // in favor of reasoning_effort="low", and under response_format=json_object can emit
  // 2-token "{}" or {"json":{...}} wrappers. Plain JSON instruction + reasoning_effort="low"
  // avoids both grammar artifacts cleanly.
  if (opts.json !== false && !isGlm) {
    payload.response_format = { type: "json_object" };
  }
  if (creds.provider === "forge-inference") {
    if (isGlm) {
      payload.reasoning_effort = "low";
    } else {
      payload.chat_template_kwargs = { enable_thinking: false };
    }
  }

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t0 = Date.now();
    try {
      const upstream = await fetch(`${creds.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60_000),
      });
      if (!upstream.ok) {
        const detail = await upstream.text();
        if ((upstream.status === 429 || upstream.status >= 500) && attempt < maxAttempts) {
          await sleep(1200 * Math.pow(2, attempt - 1));
          continue;
        }
        throw new Error(`Upstream inference returned ${upstream.status}: ${detail.slice(0, 240)}`);
      }
      const data = (await upstream.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const usedModel = data.model || targetModel;
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;
      const estimatedUsd = recordSpend(usedModel, inputTokens, outputTokens);
      return {
        content: data.choices?.[0]?.message?.content || "",
        model: usedModel,
        inputTokens,
        outputTokens,
        estimatedUsd,
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(1200 * Math.pow(2, attempt - 1));
    }
  }
  throw new Error("Unreachable retry loop exit");
}

function tryParseJsonCandidate(candidate: string): Record<string, unknown> | null {
  const attempts = [
    candidate,
    // Escape bare LaTeX backslashes (\zeta, \pi, \chi, \mathbb) inside JSON strings
    candidate.replace(/\\(?!["\\/bfnrtu])/g, "\\\\"),
  ];
  for (const text of attempts) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (Object.keys(obj).length === 0) return null;
        return obj;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function parseJsonObjectStrict(raw: string): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const direct = tryParseJsonCandidate(trimmed);
  if (direct) return direct;

  // Strip markdown code fences if model wrapped valid JSON in ```json ... ```
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fenced) {
    const inner = tryParseJsonCandidate(fenced[1]);
    if (inner) return inner;
  }

  // Extract outermost JSON object if preceded by brief whitespace/preamble
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParseJsonCandidate(trimmed.slice(firstBrace, lastBrace + 1));
  }
  return null;
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  return parseJsonObjectStrict(raw) ?? { raw };
}
