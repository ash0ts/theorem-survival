/**
 * Sync the CoreWeave Agent Lens tag catalog for `wandb/theorem-survival` from `agentlens/tags.json`.
 *
 *   pnpm tags            # create missing tags, patch changed criteria/colors
 *   pnpm tags --check    # read-only check
 *   pnpm tags --dist     # print tag distribution over the last 7 days
 */
import { readFileSync } from "node:fs";
import { resolveForgeProject, resolveWandbKey } from "../server/credentials";

const AGENT_LENS_HOST = process.env.AGENT_LENS_BASE_URL ?? "https://agent-pulse.wandb.ai";

interface TagSpec {
  name: string;
  color: string;
  criteria: string;
}
interface TagFile {
  project: string;
  agent_name_filter: string[];
  tags: TagSpec[];
}
interface TagData extends TagSpec {
  id: string;
  agent_name_filter: string[] | null;
  llm_judge_enabled: boolean;
  updated_at: string;
}

const args = new Set(process.argv.slice(2));
const file = JSON.parse(readFileSync(new URL("../agentlens/tags.json", import.meta.url), "utf8")) as TagFile;
const project = process.env.FORGE_PROJECT ?? file.project ?? resolveForgeProject();
const [entity, projectName] = project.split("/");
const key = resolveWandbKey();
if (!key) {
  console.error("No W&B key found (WANDB_API_KEY or ~/.netrc).");
  process.exit(2);
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${AGENT_LENS_HOST}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "X-Wandb-Entity": entity,
      "X-Wandb-Project": projectName,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

const live = (await api<{ data: TagData[] }>("GET", "/tags")).data ?? [];
const byName = new Map(live.map((t) => [t.name, t]));
let drift = 0;

for (const spec of file.tags) {
  const existing = byName.get(spec.name);
  const desired = {
    name: spec.name,
    color: spec.color,
    criteria: spec.criteria,
    agent_name_filter: file.agent_name_filter,
    llm_judge_enabled: true,
  };
  if (!existing) {
    drift += 1;
    if (args.has("--check")) {
      console.log(`missing  ${spec.name}`);
      continue;
    }
    const created = await api<{ data?: TagData } & TagData>("POST", "/tags", desired);
    console.log(`created  ${spec.name}  id=${created.id ?? created.data?.id ?? "?"}`);
    continue;
  }
  const changed =
    existing.criteria !== spec.criteria ||
    existing.color.toLowerCase() !== spec.color.toLowerCase() ||
    !existing.llm_judge_enabled ||
    JSON.stringify(existing.agent_name_filter ?? []) !== JSON.stringify(file.agent_name_filter);
  if (!changed) {
    console.log(`ok       ${spec.name}  id=${existing.id}`);
    continue;
  }
  drift += 1;
  if (args.has("--check")) {
    console.log(`changed  ${spec.name}  id=${existing.id}`);
    continue;
  }
  await api("PATCH", `/tags/${existing.id}`, desired);
  console.log(`updated  ${spec.name}  id=${existing.id}`);
}

if (args.has("--dist")) {
  const now = Date.now();
  const dist = await api<{ data: unknown }>("POST", "/conversation-tags/distribution", {
    after_ms: now - 7 * 86_400_000,
    before_ms: now,
    time_bucket_seconds: 86_400,
  });
  console.log(JSON.stringify(dist.data, null, 2));
}

console.log(
  `\nSaved view: https://forge.coreweave.com/agent-lens/${entity}/${projectName}/conversations?tags=${file.tags
    .map((t) => t.name)
    .join(",")}`,
);
if (args.has("--check") && drift > 0) process.exit(1);
