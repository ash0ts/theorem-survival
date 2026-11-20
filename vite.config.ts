import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createAuditorHandler } from "./server/handler";

function forgeAgentLensAuditorPlugin(): Plugin {
  return {
    name: "theorem-survival-agentlens-proxy",
    configureServer(server) {
      const handler = createAuditorHandler();
      server.middlewares.use(async (req, res, next) => {
        if (!(await handler.handle(req, res))) next();
      });
      server.httpServer?.once("listening", async () => {
        const tracing = await handler.tracer.enabled();
        server.config.logger.info(
          [
            `  Auditor LLM: ${handler.creds ? `${handler.creds.provider} (${handler.creds.model})` : "offline (deterministic fallback)"}`,
            `  Agent Lens:  ${tracing ? `https://forge.coreweave.com/agent-lens/${handler.tracer.project}` : "off"}`,
          ].join("\n"),
        );
      });
    },
  };
}

const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), forgeAgentLensAuditorPlugin()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
