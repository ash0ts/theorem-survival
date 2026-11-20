import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Node-only credentials resolver for CoreWeave Forge Serverless Inference & Agent Lens.
 * Never imported by client `src/` modules.
 */
export interface ForgeCredentials {
  apiKey: string;
  baseUrl: string;
  model: string;
  project?: string;
  provider: "forge-inference" | "openai-compatible";
}

export const DEFAULT_FORGE_MODEL = "zai-org/GLM-5.3-Flash";
export const DEFAULT_FORGE_PROJECT = "wandb/theorem-survival";

export function readWandbNetrcKey(): string | undefined {
  try {
    const netrcPath = path.join(os.homedir(), ".netrc");
    if (!fs.existsSync(netrcPath)) return undefined;
    const raw = fs.readFileSync(netrcPath, "utf8");
    const blockMatch = raw.match(/machine\s+api\.wandb\.ai[\s\S]*?(?=\nmachine\s+|\s*$)/);
    if (!blockMatch) return undefined;
    const passMatch = blockMatch[0].match(/password\s+(\S+)/);
    return passMatch?.[1];
  } catch {
    return undefined;
  }
}

export function resolveWandbKey(): string | undefined {
  return process.env.WANDB_API_KEY || readWandbNetrcKey();
}

export function resolveForgeProject(): string {
  return process.env.FORGE_PROJECT || process.env.FORGE_INFERENCE_PROJECT || DEFAULT_FORGE_PROJECT;
}

export function resolveForgeCredentials(): ForgeCredentials | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      project: process.env.OPENAI_PROJECT,
      provider: "openai-compatible",
    };
  }

  const wandbKey = resolveWandbKey();
  if (wandbKey) {
    return {
      apiKey: wandbKey,
      baseUrl: (process.env.FORGE_INFERENCE_BASE_URL || "https://api.inference.wandb.ai/v1").replace(/\/+$/, ""),
      model: process.env.FORGE_INFERENCE_MODEL || DEFAULT_FORGE_MODEL,
      project: resolveForgeProject(),
      provider: "forge-inference",
    };
  }

  return null;
}
