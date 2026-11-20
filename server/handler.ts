import type { IncomingMessage, ServerResponse } from "node:http";
import { runTheoremAudit, type AuditRequest } from "./auditor";
import { resolveForgeCredentials, type ForgeCredentials } from "./credentials";
import { createTraceRunner, type TraceRunner } from "./tracing";

export interface AuditorServerHandler {
  creds: ForgeCredentials | null;
  tracer: TraceRunner;
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const raw = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64_000) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createAuditorHandler(): AuditorServerHandler {
  const creds = resolveForgeCredentials();
  const tracer = createTraceRunner({ spanProcessor: "simple" });

  return {
    creds,
    tracer,
    async handle(req, res) {
      const url = req.url ?? "";
      if (url === "/api/health" && req.method === "GET") {
        const tracing = await tracer.enabled();
        sendJson(res, 200, {
          ok: true,
          liveServer: true,
          inferenceProvider: creds?.provider ?? "deterministic-only",
          model: creds?.model ?? "deterministic-rule-engine",
          agentLensEnabled: tracing,
          forgeProject: tracer.project,
          agentLensProjectUrl: `https://forge.coreweave.com/agent-lens/${tracer.project}`,
        });
        return true;
      }

      if (url === "/api/audit" && req.method === "POST") {
        const host = req.headers.host ?? "";
        const remote = req.socket.remoteAddress ?? "";
        const isLocal =
          remote === "127.0.0.1" ||
          remote === "::1" ||
          remote === "::ffff:127.0.0.1" ||
          host.startsWith("localhost:") ||
          host.startsWith("127.0.0.1:");
        if (!isLocal) {
          sendJson(res, 403, { error: "Live audit endpoint is restricted to localhost." });
          return true;
        }

        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as AuditRequest;
          if (!body.query || typeof body.query !== "string") {
            sendJson(res, 400, { error: "Missing `query` (arXiv ID or corpus ID)." });
            return true;
          }
          const result = await runTheoremAudit(body, { creds, tracer });
          await tracer.flush();
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return true;
      }

      return false;
    },
  };
}
