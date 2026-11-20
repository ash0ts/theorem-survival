import http from "node:http";
import { createAuditorHandler } from "./handler";

const port = Number(process.env.PORT || 5181);
const handler = createAuditorHandler();

const server = http.createServer(async (req, res) => {
  const handled = await handler.handle(req, res);
  if (!handled) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found. Use GET /api/health or POST /api/audit." }));
  }
});

server.listen(port, "127.0.0.1", async () => {
  const tracing = await handler.tracer.enabled();
  console.log(`TheoremSurvival auditor listening on http://127.0.0.1:${port}`);
  console.log(`  Inference:  ${handler.creds ? `${handler.creds.provider} (${handler.creds.model})` : "deterministic-only"}`);
  console.log(`  Agent Lens: ${tracing ? `https://forge.coreweave.com/agent-lens/${handler.tracer.project}` : "off"}`);
});
