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
  latencyMs: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export async function chatCompletion(
  creds: ForgeCredentials,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const t0 = Date.now();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.apiKey}`,
    "Content-Type": "application/json",
  };
  if (creds.project) headers["OpenAI-Project"] = creds.project;

  const payload: Record<string, unknown> = {
    model: creds.model,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 900,
    messages,
  };
  if (opts.json !== false) payload.response_format = { type: "json_object" };
  if (creds.provider === "forge-inference") {
    payload.reasoning_effort = "low";
    payload.chat_template_kwargs = { enable_thinking: false };
  }

  const upstream = await fetch(`${creds.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(`Upstream inference returned ${upstream.status}: ${detail.slice(0, 240)}`);
  }
  const data = (await upstream.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    content: data.choices?.[0]?.message?.content || "",
    model: data.model || creds.model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { raw };
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        // fall through
      }
    }
    return { raw };
  }
}
