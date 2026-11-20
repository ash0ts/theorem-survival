import type { JsonObject, JsonValue, Message } from "@coreweave/forge-sdk/agentlens/tracing";
import { resolveForgeProject, resolveWandbKey } from "./credentials";

export type AttrValue = string | number | boolean;

export interface SpanTimingRecord {
  kind: "tool" | "llm";
  name: string;
  durationMs: number;
  summary: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface TurnTrace {
  conversationId: string;
  spans: SpanTimingRecord[];
  setAttributes(attrs: Record<string, AttrValue | undefined>): void;
  tool<T extends JsonValue>(
    name: string,
    args: JsonObject,
    summarize: (res: T) => string,
    work: () => T | Promise<T>,
  ): Promise<T>;
  llm<T>(
    model: string,
    input: Message[],
    systemInstructions: string[],
    work: () => Promise<T>,
    project: (result: T) => {
      output: string;
      inputTokens?: number;
      outputTokens?: number;
      responseModel?: string;
      summary: string;
    },
  ): Promise<T>;
  output(text: string): void;
}

export interface RunOptions {
  conversationId: string;
  userMessage: string;
  agentVersion?: string;
  model?: string;
  attributes?: Record<string, AttrValue | undefined>;
}

export interface TraceRunner {
  enabled(): Promise<boolean>;
  project: string;
  run<T>(opts: RunOptions, work: (trace: TurnTrace) => Promise<T>): Promise<T>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export const AGENT_NAME = "theorem-survival-auditor";
export const DEFAULT_AGENT_VERSION = "auditor-v2-guarded";

function clean(attrs: Record<string, AttrValue | undefined> | undefined): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function createNoopTrace(conversationId: string): TurnTrace {
  const spans: SpanTimingRecord[] = [];
  return {
    conversationId,
    spans,
    setAttributes() {},
    async tool(name, _args, summarize, work) {
      const t0 = Date.now();
      const res = await work();
      spans.push({
        kind: "tool",
        name,
        durationMs: Date.now() - t0,
        summary: summarize(res),
      });
      return res;
    },
    async llm(model, _input, _sys, work, project) {
      const t0 = Date.now();
      const res = await work();
      const p = project(res);
      spans.push({
        kind: "llm",
        name: p.responseModel ?? model,
        durationMs: Date.now() - t0,
        summary: p.summary,
        inputTokens: p.inputTokens,
        outputTokens: p.outputTokens,
      });
      return res;
    },
    output() {},
  };
}

export interface TraceRunnerOptions {
  enabled?: boolean;
  project?: string;
  apiKey?: string;
  spanProcessor?: "simple" | "batch";
}

export function createTraceRunner(options: TraceRunnerOptions = {}): TraceRunner {
  const project = options.project ?? resolveForgeProject();
  const apiKey = options.apiKey ?? resolveWandbKey();
  const envFlag = (process.env.FORGE_TRACING ?? "1").toLowerCase();
  const wanted = options.enabled ?? !(envFlag === "0" || envFlag === "false");
  let sdk: typeof import("@coreweave/forge-sdk/agentlens/tracing") | null = null;
  let initialized: Promise<boolean> | undefined;

  async function enabled(): Promise<boolean> {
    if (!wanted || !apiKey) return false;
    initialized ??= (async () => {
      try {
        sdk = await import("@coreweave/forge-sdk/agentlens/tracing");
        await sdk.init(project, {
          apiKey,
          serviceName: AGENT_NAME,
          spanProcessor: options.spanProcessor ?? "batch",
        });
        return true;
      } catch (err) {
        console.warn(`[agent-lens] tracing disabled: ${err instanceof Error ? err.message : String(err)}`);
        sdk = null;
        return false;
      }
    })();
    return initialized;
  }

  return {
    project,
    enabled,
    async run(opts, work) {
      if (!(await enabled()) || !sdk) {
        return work(createNoopTrace(opts.conversationId));
      }
      const tracing = sdk;
      return tracing.runIsolated(async () => {
        const spans: SpanTimingRecord[] = [];
        const conversation = tracing.startConversation({
          conversationId: opts.conversationId,
          agentName: AGENT_NAME,
          agentVersion: opts.agentVersion ?? DEFAULT_AGENT_VERSION,
          model: opts.model,
          attributes: clean(opts.attributes),
        });
        const turn = conversation.startTurn({
          userMessage: opts.userMessage,
          agentName: AGENT_NAME,
          agentVersion: opts.agentVersion ?? DEFAULT_AGENT_VERSION,
          model: opts.model,
          attributes: clean(opts.attributes),
        });
        let failure: Error | undefined;
        const trace: TurnTrace = {
          conversationId: opts.conversationId,
          spans,
          setAttributes(attrs) {
            turn.setAttributes(clean(attrs));
          },
          async tool(name, args, summarize, fn) {
            const t0 = Date.now();
            const span = turn.startTool({ name, args });
            try {
              const result = await fn();
              const durationMs = Date.now() - t0;
              span.end({ result });
              spans.push({
                kind: "tool",
                name,
                durationMs,
                summary: summarize(result),
              });
              return result;
            } catch (err) {
              span.end({ error: err instanceof Error ? err : new Error(String(err)) });
              throw err;
            }
          },
          async llm(model, input, systemInstructions, fn, projectResult) {
            const t0 = Date.now();
            const span = turn.startLLM({
              model,
              providerName: "coreweave",
              systemInstructions,
            });
            try {
              const result = await fn();
              const durationMs = Date.now() - t0;
              const p = projectResult(result);
              span.record({
                inputMessages: input,
                outputMessages: [
                  { role: "assistant", parts: [{ type: "text", content: p.output }] },
                ],
                usage: {
                  inputTokens: p.inputTokens,
                  outputTokens: p.outputTokens,
                },
                responseModel: p.responseModel,
              });
              span.end();
              spans.push({
                kind: "llm",
                name: p.responseModel ?? model,
                durationMs,
                summary: p.summary,
                inputTokens: p.inputTokens,
                outputTokens: p.outputTokens,
              });
              return result;
            } catch (err) {
              span.end({ error: err instanceof Error ? err : new Error(String(err)) });
              throw err;
            }
          },
          output(text) {
            turn.record({
              outputMessages: [{ role: "assistant", parts: [{ type: "text", content: text }] }],
            });
          },
        };
        try {
          return await work(trace);
        } catch (err) {
          failure = err instanceof Error ? err : new Error(String(err));
          throw err;
        } finally {
          turn.end(failure ? { error: failure } : undefined);
          conversation.end(failure ? { error: failure } : undefined);
        }
      });
    },
    async flush() {
      if (sdk) await sdk.forceFlush();
    },
    async shutdown() {
      if (sdk) await sdk.shutdown();
    },
  };
}
