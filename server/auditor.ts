import {
  evaluateTheorem,
  PRESETS,
  THEOREMS,
  type ConjectureType,
  type OutcomeKind,
  type Polarity,
  type Severity,
  type TheoremRecord,
  type WorldState,
} from "../src/data/theorems";
import type { ForgeCredentials } from "./credentials";
import { chatCompletion, parseJsonObject } from "./llm";
import type { SpanTimingRecord, TraceRunner } from "./tracing";

export type AuditorVersion = "auditor-v1-naive" | "auditor-v2-guarded";

export interface ExtractedDependencyItem {
  theorem_label: string;
  conjecture_type: ConjectureType | "GRAND_RH" | "OTHER";
  assumption_polarity: Polarity;
  dependency_severity: Severity | "MENTION_ONLY";
  has_unconditional_fallback: boolean;
  extracted_quote: string;
  remediation_note: string;
}

export interface ExtractionContract {
  has_conditional_dependency: boolean;
  dependencies: ExtractedDependencyItem[];
}

export interface AuditRequest {
  query: string; // arXiv ID (e.g. "2610.27830") or internal ID ("P04")
  presetId?: string;
  worldState?: WorldState;
  agentVersion?: AuditorVersion;
  conversationId?: string;
  noLlm?: boolean;
}

export interface AuditResponse {
  conversationId: string;
  agentLensUrl: string | null;
  project: string;
  agentVersion: AuditorVersion;
  source: "forge-inference" | "deterministic-fallback";
  model: string;
  paper: {
    id: string;
    arxivOrDoi: string;
    title: string;
    authors: string;
    published: string;
    category: string;
    abstractSnippet: string;
    url: string;
  };
  worldState: WorldState;
  presetLabel: string;
  predictedOutcome: OutcomeKind;
  authorAlert: string;
  extraction: ExtractionContract;
  spans: SpanTimingRecord[];
  totalTokens: number;
  wallMs: number;
}

interface ArxivMeta {
  id: string;
  arxivOrDoi: string;
  title: string;
  authors: string;
  published: string;
  category: string;
  abstractText: string;
  url: string;
  matchedKnownId: string | null;
}

function cleanArxivQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf|html)\//i, "")
    .replace(/^arxiv:/i, "")
    .replace(/v\d+$/i, "")
    .trim();
}

function findKnownTheorem(raw: string): TheoremRecord | undefined {
  const q = cleanArxivQuery(raw).toLowerCase();
  return THEOREMS.find(
    (t) =>
      t.id.toLowerCase() === q ||
      (t.arxivId && t.arxivId.toLowerCase() === q) ||
      t.arxivOrDoi.toLowerCase() === q ||
      t.arxivOrDoi.toLowerCase().endsWith(q),
  );
}

function extractXmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

async function fetchArxivMetadata(rawQuery: string): Promise<ArxivMeta> {
  const known = findKnownTheorem(rawQuery);
  const cleaned = cleanArxivQuery(rawQuery);
  const arxivCandidate = known?.arxivId ?? (/^(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})$/i.test(cleaned) ? cleaned : null);

  if (arxivCandidate) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6500);
      const res = await fetch(
        `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivCandidate)}`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (res.ok) {
        const xml = await res.text();
        const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/i);
        if (entryMatch) {
          const entry = entryMatch[1];
          const title = extractXmlTag(entry, "title");
          const summary = extractXmlTag(entry, "summary");
          const published = extractXmlTag(entry, "published").slice(0, 10);
          const authorMatches = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gi)].map((m) =>
            m[1].replace(/\s+/g, " ").trim(),
          );
          const catMatch = entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/i);
          if (title && summary) {
            return {
              id: known?.id ?? `ARXIV_${arxivCandidate}`,
              arxivOrDoi: `arXiv:${arxivCandidate}`,
              title,
              authors: authorMatches.join(", ") || known?.authors || "Unknown",
              published: published || known?.yearLabel || "2026",
              category: catMatch?.[1] || known?.category || "math.NT",
              abstractText: summary,
              url: `https://arxiv.org/abs/${arxivCandidate}`,
              matchedKnownId: known?.id ?? null,
            };
          }
        }
      }
    } catch {
      // Fall through to local verified record if offline or rate-limited
    }
  }

  if (known) {
    return {
      id: known.id,
      arxivOrDoi: known.arxivOrDoi,
      title: known.title,
      authors: known.authors,
      published: known.yearLabel,
      category: known.category,
      abstractText: `${known.extractedQuote} Context: ${known.fallbackSummary}`,
      url: known.url,
      matchedKnownId: known.id,
    };
  }

  throw new Error(
    `Could not resolve "${rawQuery}". Pass a valid arXiv ID (e.g. 2610.27830, 2111.01481, 2609.02882) or corpus ID (P01-P16).`,
  );
}

function heuristicScanClauses(meta: ArxivMeta) {
  const known = meta.matchedKnownId
    ? THEOREMS.find((t) => t.id === meta.matchedKnownId)
    : undefined;

  if (known) {
    return {
      conjectureType: known.conjectureType,
      polarity: known.polarity,
      severity: known.severity,
      hasUnconditionalFallback: known.hasUnconditionalFallback,
      fallbackSummary: known.fallbackSummary,
      theoremLabel: known.theoremLabel,
      extractedQuote: known.extractedQuote.slice(0, 295),
      agentTrapNote: known.agentTrapNote,
    };
  }

  const lower = `${meta.title} ${meta.abstractText}`.toLowerCase();
  const assumesFalse =
    /siegel zero|falsity of the .*riemann|if the riemann hypothesis is false|assuming.*false/.test(lower);
  let conjectureType: ConjectureType = "RH";
  if (/extended riemann|dedekind zeta|kummer/.test(lower)) {
    conjectureType = "ERH";
  } else if (/generalized riemann|generalised riemann|\bgrh\b|dirichlet l-function|siegel zero/.test(lower)) {
    conjectureType = "GRH";
  } else if (/we prove unconditionally|unconditional proof|zero density/.test(lower) && !/assuming/.test(lower)) {
    conjectureType = "DENSITY_BOUND";
  }

  const hasFallback =
    conjectureType === "DENSITY_BOUND" ||
    /unconditional|improves on|sharper bound/.test(lower);

  return {
    conjectureType,
    polarity: (assumesFalse ? "ASSUMES_FALSE" : "ASSUMES_TRUE") as Polarity,
    severity: (hasFallback ? "SHARPENS_BOUND" : "CORE_BLOCKER") as Severity,
    hasUnconditionalFallback: hasFallback,
    fallbackSummary: hasFallback
      ? "Abstract indicates unconditional partial bounds or prior unconditional baseline exist."
      : "No unconditional proof of this exact qualitative statement detected in abstract.",
    theoremLabel: "Main Theorem",
    extractedQuote: meta.abstractText.slice(0, 280),
    agentTrapNote:
      "Verify whether classical RH suffices or whether Dirichlet GRH / Dedekind ERH is invoked in internal lemmas.",
  };
}

const VALID_OUTCOMES = new Set<OutcomeKind>([
  "UPGRADED_UNCONDITIONAL",
  "BOUND_TIGHTENED",
  "STILL_CONDITIONAL",
  "VACUOUS_OR_SUPERSEDED",
  "HYPOTHESIS_FALSIFIED",
]);

export async function runTheoremAudit(
  req: AuditRequest,
  opts: {
    creds: ForgeCredentials | null;
    tracer: TraceRunner;
  },
): Promise<AuditResponse> {
  const t0 = Date.now();
  const agentVersion: AuditorVersion = req.agentVersion ?? "auditor-v2-guarded";
  const preset =
    PRESETS.find((p) => p.id === req.presetId) ??
    PRESETS.find((p) => p.id === "alpoge_rh_grh")!;
  const worldState: WorldState = req.worldState ?? preset.state;
  const cleanId = cleanArxivQuery(req.query).replace(/[^a-zA-Z0-9._-]/g, "-");
  const conversationId =
    req.conversationId ??
    `ts-${agentVersion}-${cleanId}-${preset.id}-${Date.now().toString(36)}`;

  const tracingEnabled = await opts.tracer.enabled();
  const modelName =
    !req.noLlm && opts.creds ? opts.creds.model : "deterministic-rule-engine";

  return opts.tracer.run(
    {
      conversationId,
      agentVersion,
      model: modelName,
      userMessage: `Audit ${req.query} under world-state ${preset.label} (RH=${worldState.rh}, GRH=${worldState.grh}, ERH=${worldState.erh}, siegelZero=${worldState.siegelZero})`,
      attributes: {
        "theorem_survival.query": req.query,
        "theorem_survival.world_preset": preset.id,
        "theorem_survival.agent_version": agentVersion,
        "theorem_survival.rh": worldState.rh,
        "theorem_survival.grh": worldState.grh,
        "theorem_survival.erh": worldState.erh,
      },
    },
    async (trace) => {
      const meta = await trace.tool(
        "fetch_arxiv_metadata",
        { query: req.query },
        (m) => `${m.arxivOrDoi} (${m.category}) — ${m.title.slice(0, 56)}`,
        async () => {
          const m = await fetchArxivMetadata(req.query);
          return {
            id: m.id,
            arxivOrDoi: m.arxivOrDoi,
            title: m.title,
            authors: m.authors,
            published: m.published,
            category: m.category,
            abstractText: m.abstractText,
            url: m.url,
            matchedKnownId: m.matchedKnownId,
          };
        },
      );

      const knownRecord = meta.matchedKnownId
        ? THEOREMS.find((t) => t.id === meta.matchedKnownId)
        : undefined;

      if (agentVersion === "auditor-v1-naive") {
        // Naive v1 baseline: no guardrail tools; asks LLM directly from title + abstract + world-state
        const sys = [
          "You are an academic math paper classifier. Return strict JSON with keys: has_conditional_dependency (boolean), predicted_outcome ('UPGRADED_UNCONDITIONAL' | 'BOUND_TIGHTENED' | 'STILL_CONDITIONAL' | 'VACUOUS_OR_SUPERSEDED' | 'HYPOTHESIS_FALSIFIED'), author_alert (string, 1-2 sentences), and dependencies (array of 1 object with theorem_label, conjecture_type, assumption_polarity, dependency_severity, has_unconditional_fallback, extracted_quote, remediation_note).",
        ];
        const userContent = JSON.stringify({
          paper: {
            id: meta.arxivOrDoi,
            title: meta.title,
            authors: meta.authors,
            category: meta.category,
            abstract: meta.abstractText,
          },
          world_state: worldState,
          note: "Assume Levent Alpöge's Nov 20, 2026 announcement means the Riemann Hypothesis was proved unless world_state says otherwise.",
        });

        if (!req.noLlm && opts.creds) {
          const creds = opts.creds;
          const llmRes = await trace.llm(
            creds.model,
            [{ role: "user", parts: [{ type: "text", content: userContent }] }],
            sys,
            () =>
              chatCompletion(creds, [
                { role: "system", content: sys[0] },
                { role: "user", content: userContent },
              ]),
            (r) => ({
              output: r.content,
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              responseModel: r.model,
              summary: `Naive direct JSON classification (${r.outputTokens} tok)`,
            }),
          );

          const parsed = parseJsonObject(llmRes.content);
          const depsRaw = Array.isArray(parsed.dependencies) ? parsed.dependencies : [];
          const firstDep = (depsRaw[0] ?? {}) as Record<string, unknown>;
          const rawOutcome = String(parsed.predicted_outcome ?? "UPGRADED_UNCONDITIONAL") as OutcomeKind;
          const predictedOutcome: OutcomeKind = VALID_OUTCOMES.has(rawOutcome)
            ? rawOutcome
            : "UPGRADED_UNCONDITIONAL";
          const authorAlert = String(
            parsed.author_alert ?? firstDep.remediation_note ?? "Classified directly from abstract.",
          );

          const extraction: ExtractionContract = {
            has_conditional_dependency: Boolean(parsed.has_conditional_dependency ?? true),
            dependencies: [
              {
                theorem_label: String(firstDep.theorem_label ?? "Main Theorem"),
                conjecture_type: (firstDep.conjecture_type as ConjectureType) ?? "RH",
                assumption_polarity: (firstDep.assumption_polarity as Polarity) ?? "ASSUMES_TRUE",
                dependency_severity: (firstDep.dependency_severity as Severity) ?? "CORE_BLOCKER",
                has_unconditional_fallback: Boolean(firstDep.has_unconditional_fallback ?? false),
                extracted_quote: String(firstDep.extracted_quote ?? meta.abstractText.slice(0, 240)).slice(0, 300),
                remediation_note: String(firstDep.remediation_note ?? authorAlert),
              },
            ],
          };

          trace.setAttributes({
            "theorem_survival.arxiv_id": meta.arxivOrDoi,
            "theorem_survival.category": meta.category,
            "theorem_survival.conjecture_type": extraction.dependencies[0].conjecture_type,
            "theorem_survival.polarity": extraction.dependencies[0].assumption_polarity,
            "theorem_survival.has_fallback": extraction.dependencies[0].has_unconditional_fallback,
            "theorem_survival.outcome": predictedOutcome,
            "theorem_survival.source": "forge-inference",
          });
          trace.output(authorAlert);

          return {
            conversationId,
            agentLensUrl: tracingEnabled
              ? `https://forge.coreweave.com/agent-lens/${opts.tracer.project}/conversations/${conversationId}`
              : null,
            project: opts.tracer.project,
            agentVersion,
            source: "forge-inference",
            model: llmRes.model,
            paper: {
              id: meta.id,
              arxivOrDoi: meta.arxivOrDoi,
              title: meta.title,
              authors: meta.authors,
              published: meta.published,
              category: meta.category,
              abstractSnippet: meta.abstractText.slice(0, 320),
              url: meta.url,
            },
            worldState,
            presetLabel: preset.label,
            predictedOutcome,
            authorAlert,
            extraction,
            spans: trace.spans,
            totalTokens: llmRes.inputTokens + llmRes.outputTokens,
            wallMs: Date.now() - t0,
          };
        }
      }

      // Guarded v2 pipeline: run 3 domain verification tools before synthesis
      const clauseScan = await trace.tool(
        "scan_conditional_clauses",
        { arxivOrDoi: meta.arxivOrDoi, category: meta.category },
        (s) =>
          `${s.polarity === "ASSUMES_FALSE" ? "~" : ""}${s.conjectureType} · fallback=${String(s.hasUnconditionalFallback)}`,
        () => heuristicScanClauses(meta),
      );

      const hopChain = await trace.tool(
        "traverse_citation_hops",
        { id: meta.id, conjectureType: clauseScan.conjectureType },
        (h) => `hop=${h.hopDepth} via ${h.upstreamChain.join(" -> ")}`,
        () => {
          if (knownRecord) {
            return {
              hopDepth: knownRecord.hopDepth,
              upstreamChain: [...knownRecord.upstreamIds, knownRecord.id],
              logicalContainmentNote:
                "ERH (Dedekind zeta_K) and GRH (Dirichlet L) specialize to classical RH on Q, never the reverse.",
            };
          }
          return {
            hopDepth: 1,
            upstreamChain: [`ROOT_${clauseScan.conjectureType}`, meta.arxivOrDoi],
            logicalContainmentNote:
              "Direct assumption extracted from abstract; verify internal lemmas for higher-rank L-functions.",
          };
        },
      );

      const syntheticRecord: TheoremRecord =
        knownRecord ?? {
          id: meta.id,
          shortNodeTitle: meta.title.slice(0, 28),
          arxivOrDoi: meta.arxivOrDoi,
          url: meta.url,
          title: meta.title,
          authors: meta.authors,
          yearLabel: meta.published,
          category: (meta.category === "cs.CC" || meta.category === "cs.CR"
            ? meta.category
            : "math.NT"),
          theoremLabel: clauseScan.theoremLabel,
          conjectureType: clauseScan.conjectureType,
          polarity: clauseScan.polarity,
          severity: clauseScan.severity,
          hasUnconditionalFallback: clauseScan.hasUnconditionalFallback,
          fallbackSummary: clauseScan.fallbackSummary,
          hopDepth: 1,
          upstreamIds: [`ROOT_${clauseScan.conjectureType}`],
          extractedQuote: clauseScan.extractedQuote,
          confidenceScore: 0.88,
          latexBefore: [`% ${meta.title}`],
          latexAfterUpgrade: [`% Upgraded under ${clauseScan.conjectureType}`],
          latexAfterFallbackOrVacuous: [`% Fallback: ${clauseScan.fallbackSummary}`],
          authorAlertUpgrade: `Upgrades when ${clauseScan.conjectureType} = True.`,
          authorAlertOpen: `Remains conditional while ${clauseScan.conjectureType} is Open.`,
          authorAlertFalsifiedOrVacuous: clauseScan.fallbackSummary,
          agentTrapNote: clauseScan.agentTrapNote,
        };

      const diffEval = await trace.tool(
        "evaluate_world_state_diff",
        {
          id: syntheticRecord.id,
          rh: worldState.rh,
          grh: worldState.grh,
          erh: worldState.erh,
          siegelZero: worldState.siegelZero,
        },
        (d) => `${d.outcome} (${d.badgeLabel})`,
        () => {
          const ev = evaluateTheorem(syntheticRecord, worldState);
          return {
            outcome: ev.outcome,
            badgeLabel: ev.badgeLabel,
            deterministicHeadline: ev.headline,
            additions: ev.additions,
            deletions: ev.deletions,
          };
        },
      );

      let authorAlert = diffEval.deterministicHeadline;
      let remediationNote = diffEval.deterministicHeadline;
      let source: "forge-inference" | "deterministic-fallback" = "deterministic-fallback";
      let usedModel = "deterministic-rule-engine";
      let totalTokens = 0;

      if (!req.noLlm && opts.creds) {
        const creds = opts.creds;
        const sysPrompt = [
          "You are TheoremSurvival Auditor v2, an analytic number theory and complexity dependency verifier.",
          "Ground your JSON output strictly in the verified tool outputs provided. Never conflate classical RH (Riemann zeta) with Dirichlet GRH or Dedekind ERH.",
          "Never claim RH or GRH breaks RSA or post-quantum cryptography (GRH strengthens SQIsign reductions). Always name any unconditional fallback (such as Lackenby 1604.03778, AKS 2002, or Baker-Harman-Pintz), and on ASSUMES_FALSE theorems (~RH or Siegel zeros) explain clearly when proving RH/GRH makes the branch vacuous.",
          "On zero-multiplicity results like Alpöge-Furman 2608.13637, note that classical RH puts 100% of zeros on Re(s)=1/2 without proving simplicity.",
          "Return strict JSON with keys: author_alert (2 crisp plain-English sentences for the paper's author/reader, zero emojis, zero hype) and remediation_note (1 concrete sentence on what changes in the theorem statement under this world-state).",
        ].join(" ");

        const userPrompt = JSON.stringify({
          paper: {
            arxivOrDoi: meta.arxivOrDoi,
            title: meta.title,
            authors: meta.authors,
            category: meta.category,
          },
          world_state: worldState,
          preset_label: preset.label,
          verified_clauses: clauseScan,
          citation_hops: hopChain,
          evaluated_diff: diffEval,
        });

        try {
          const llmRes = await trace.llm(
            creds.model,
            [{ role: "user", parts: [{ type: "text", content: userPrompt }] }],
            [sysPrompt],
            () =>
              chatCompletion(creds, [
                { role: "system", content: sysPrompt },
                { role: "user", content: userPrompt },
              ]),
            (r) => ({
              output: r.content,
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              responseModel: r.model,
              summary: `Synthesized grounded verdict (${r.outputTokens} tok)`,
            }),
          );
          const parsed = parseJsonObject(llmRes.content);
          if (typeof parsed.author_alert === "string" && parsed.author_alert.trim().length > 15) {
            authorAlert = parsed.author_alert.trim();
          }
          if (
            typeof parsed.remediation_note === "string" &&
            parsed.remediation_note.trim().length > 10
          ) {
            remediationNote = parsed.remediation_note.trim();
          }
          source = "forge-inference";
          usedModel = llmRes.model;
          totalTokens = llmRes.inputTokens + llmRes.outputTokens;
        } catch (err) {
          console.warn(`[auditor] LLM call fell back to deterministic verdict: ${String(err)}`);
        }
      }

      const extraction: ExtractionContract = {
        has_conditional_dependency: clauseScan.conjectureType !== "DENSITY_BOUND",
        dependencies: [
          {
            theorem_label: clauseScan.theoremLabel,
            conjecture_type: clauseScan.conjectureType,
            assumption_polarity: clauseScan.polarity,
            dependency_severity: clauseScan.severity,
            has_unconditional_fallback: clauseScan.hasUnconditionalFallback,
            extracted_quote: clauseScan.extractedQuote.slice(0, 300),
            remediation_note: remediationNote,
          },
        ],
      };

      trace.setAttributes({
        "theorem_survival.arxiv_id": meta.arxivOrDoi,
        "theorem_survival.category": meta.category,
        "theorem_survival.conjecture_type": clauseScan.conjectureType,
        "theorem_survival.polarity": clauseScan.polarity,
        "theorem_survival.has_fallback": clauseScan.hasUnconditionalFallback,
        "theorem_survival.hop_depth": hopChain.hopDepth,
        "theorem_survival.outcome": diffEval.outcome,
        "theorem_survival.source": source,
      });
      trace.output(authorAlert);

      return {
        conversationId,
        agentLensUrl: tracingEnabled
          ? `https://forge.coreweave.com/agent-lens/${opts.tracer.project}/conversations/${conversationId}`
          : null,
        project: opts.tracer.project,
        agentVersion,
        source,
        model: usedModel,
        paper: {
          id: meta.id,
          arxivOrDoi: meta.arxivOrDoi,
          title: meta.title,
          authors: meta.authors,
          published: meta.published,
          category: meta.category,
          abstractSnippet: meta.abstractText.slice(0, 320),
          url: meta.url,
        },
        worldState,
        presetLabel: preset.label,
        predictedOutcome: diffEval.outcome,
        authorAlert,
        extraction,
        spans: trace.spans,
        totalTokens,
        wallMs: Date.now() - t0,
      };
    },
  );
}
