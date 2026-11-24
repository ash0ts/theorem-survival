/**
 * Theorem Survival Auditor (Attempt 2): four fair arms with zero label lookup.
 *
 * Arms:
 *  - auditor-v1-neutral  : Single prompt, title + abstract + neutral world-state, no leading note.
 *  - auditor-v1-rules    : Single prompt, title + abstract + full 6-class & outcome rules.
 *  - auditor-v2-abstract : Abstract lexical scanner tool + LLM classifier + deterministic evaluateTheorem.
 *  - auditor-v3-fulltext : Full-text window & bibliography tools + LLM classifier + deterministic evaluateTheorem.
 *
 * Isolation invariant: This module MUST NOT import LANDMARK_THEOREMS, THEOREMS, or research/gold/*.
 */
import {
  evaluateTheorem,
  PRESETS,
  resolvePresetId,
  type ConjectureType,
  type EvidenceTier,
  type OutcomeKind,
  type Polarity,
  type Severity,
  type TheoremRecord,
  type WorldState,
} from "../src/data/theorems";
import type { ForgeCredentials } from "./credentials";
import { fetchPaperFullText } from "./fulltext";
import { chatCompletion, parseJsonObjectStrict } from "./llm";
import type { SpanTimingRecord, TraceRunner } from "./tracing";

export type AuditorArm =
  | "auditor-v1-neutral"
  | "auditor-v1-rules"
  | "auditor-v2-abstract"
  | "auditor-v3-fulltext";

export type LegacyAuditorAlias = "auditor-v1-naive" | "auditor-v2-guarded";
export type AuditorVersion = AuditorArm | LegacyAuditorAlias;

export interface ExtractedDependencyItem {
  theorem_label: string;
  conjecture_type: ConjectureType | "PARSE_ERROR";
  assumption_polarity: Polarity;
  dependency_severity: Severity | "MENTION_ONLY";
  has_unconditional_fallback: boolean;
  extracted_quote: string;
  quote_locator?: string;
  evidence_tier: EvidenceTier;
  remediation_note: string;
}

export interface ExtractionContract {
  has_conditional_dependency: boolean;
  parse_error?: boolean;
  dependencies: ExtractedDependencyItem[];
}

export interface AuditPaperInput {
  id: string;
  arxivId?: string;
  doi?: string;
  oaUrl?: string;
  title: string;
  authors: string;
  year: string | number;
  category: string;
  abstractText: string;
  url: string;
}

export interface AuditRequest {
  query: string;
  paperInput?: AuditPaperInput;
  presetId?: string;
  worldState?: WorldState;
  agentVersion?: AuditorVersion;
  agentVersionTagOverride?: string;
  modelOverride?: string;
  conversationId?: string;
  noLlm?: boolean;
}

export interface AuditResponse {
  conversationId: string;
  agentLensUrl: string | null;
  project: string;
  agentVersion: string;
  arm: AuditorArm;
  source: "forge-inference" | "deterministic-fallback";
  model: string;
  evidenceTier: EvidenceTier;
  parseError: boolean;
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
  predictedOutcome: OutcomeKind | "PARSE_ERROR";
  authorAlert: string;
  extraction: ExtractionContract;
  spans: SpanTimingRecord[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  wallMs: number;
}

const VALID_CONJECTURES = new Set<ConjectureType>([
  "RH",
  "GRH_DIRICHLET",
  "BEYOND_DIRICHLET",
  "UNCLEAR",
  "DENSITY_BOUND",
  "MENTION_ONLY",
]);

const VALID_OUTCOMES = new Set<OutcomeKind>([
  "UPGRADED_UNCONDITIONAL",
  "BOUND_TIGHTENED",
  "STILL_CONDITIONAL",
  "VACUOUS_OR_SUPERSEDED",
  "HYPOTHESIS_FALSIFIED",
  "MENTION_ONLY_UNCHANGED",
]);

export function normalizeAuditorArm(v?: AuditorVersion): AuditorArm {
  if (!v || v === "auditor-v2-guarded" || v === "auditor-v3-fulltext") {
    return "auditor-v3-fulltext";
  }
  if (v === "auditor-v1-naive" || v === "auditor-v1-neutral") {
    return "auditor-v1-neutral";
  }
  return v;
}

function cleanArxivQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf|html)\//i, "")
    .replace(/^arxiv:/i, "")
    .replace(/v\d+$/i, "")
    .trim();
}

function extractXmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

async function resolvePaperMetadata(req: AuditRequest): Promise<AuditPaperInput> {
  if (req.paperInput) {
    return req.paperInput;
  }
  const cleaned = cleanArxivQuery(req.query);
  if (!/^(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})$/i.test(cleaned)) {
    throw new Error(
      `Paper input required unless query is a valid arXiv ID (got "${req.query}"). Label lookup tables are disabled.`,
    );
  }
  const res = await fetch(
    `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleaned)}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  if (!res.ok) {
    throw new Error(`arXiv metadata HTTP ${res.status} for ${cleaned}`);
  }
  const xml = await res.text();
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/i)?.[1];
  if (!entry) {
    throw new Error(`No arXiv entry found for ${cleaned}`);
  }
  const title = extractXmlTag(entry, "title");
  const summary = extractXmlTag(entry, "summary");
  const published = extractXmlTag(entry, "published").slice(0, 10);
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gi)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .join(", ");
  const cat =
    entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/i)?.[1] ?? "math.NT";

  return {
    id: `ARXIV_${cleaned}`,
    arxivId: cleaned,
    title,
    authors: authors || "Unknown",
    year: published || "2026",
    category: cat,
    abstractText: summary,
    oaUrl: `https://arxiv.org/pdf/${cleaned}`,
    url: `https://arxiv.org/abs/${cleaned}`,
  };
}

export interface LexicalScopeSignals {
  mentionsClassicalRh: boolean;
  mentionsGenericGrh: boolean;
  mentionsErh: boolean;
  mentionsDirichletExplicit: boolean;
  mentionsDedekindOrHecke: boolean;
  mentionsChebotarevOrArtin: boolean;
  mentionsAutomorphicOrModular: boolean;
  mentionsClassGroupOrIsogeny: boolean;
  mentionsNullstellensatzOrKnot: boolean;
  mentionsExtraHypothesis: boolean;
  mentionsSiegelZero: boolean;
  mentionsUnconditionalMain: boolean;
  mentionsFiniteFieldWeilRh: boolean;
  bibHits: string[];
}

export function scanTextScopeSignals(
  text: string,
  bibMatches: string[] = [],
): LexicalScopeSignals {
  const joined = `${text}\n${bibMatches.join("\n")}`;
  return {
    mentionsClassicalRh:
      /\b(riemann hypothesis|riemann zeta|zeta\(s\)|\bRH\b)\b/i.test(joined) &&
      !/generalized riemann|generalised riemann|extended riemann/i.test(text.slice(0, 200)),
    mentionsGenericGrh: /\b(generalized riemann|generalised riemann|\bGRH\b)\b/i.test(joined),
    mentionsErh: /\b(extended riemann|\bERH\b)\b/i.test(joined),
    mentionsDirichletExplicit:
      /\b(dirichlet\s+l-function|dirichlet\s+l-series|dirichlet\s+character|primitive\s+dirichlet|primes?\s+in\s+arithmetic\s+progression|least\s+quadratic\s+non[- ]residue)\b/i.test(
        joined,
      ),
    mentionsDedekindOrHecke:
      /\b(dedekind\s+zeta|zeta_k|zeta_l|zeta_\{\\mathbb\{k\}\}|hecke\s+l-function|hecke\s+character|grossencharacter)\b/i.test(
        joined,
      ),
    mentionsChebotarevOrArtin:
      /\b(chebotarev|lagarias[-–,\s]+(?:montgomery[-–,\s]+)?odlyzko|weinberger|hooley|artin(?:'s)?\s+(?:primitive|conjecture|l-function)|kummer\s+extension)\b/i.test(
        joined,
      ),
    mentionsAutomorphicOrModular:
      /\b(hecke[-–]maass|cusp\s*form|rankin[-–]selberg|quadratic\s+twists?\s+of\s+(?:a\s+)?modular|twists?\s+of\s+[^.\n]{0,50}elliptic[- ]curve\s+l-function|automorphic\s+l-function|artin(?:'s)?\s+holomorphy)\b/i.test(
        joined,
      ),
    mentionsClassGroupOrIsogeny:
      /\b(ideal\s+class\s+group|class\s+group\s+of\s+(?:a\s+|an\s+)?(?:number|quadratic|cubic|imaginary)|bnfinit|isogeny\s+graph|supersingular\s+isogeny|constructing\s+[^.\n]{0,50}isogenies)\b/i.test(
        joined,
      ),
    mentionsNullstellensatzOrKnot:
      /\b(koiran|hilbert(?:'s)?\s+nullstellensatz|unknot|knottedness|torus\s+knot|3-sphere\s+recognition)\b/i.test(
        joined,
      ),
    mentionsExtraHypothesis:
      /\b(grand\s+simplicity|linear\s+independence\s+of\s+[^.\n]{0,60}zeros|zeros\s+of\s+[^.\n]{0,50}zeta[^.\n]{0,50}are\s+simple|generalized\s+ramanujan\s+conjecture|\bGRC\b)\b/i.test(
        joined,
      ),
    mentionsSiegelZero:
      /\b(siegel\s+zero|landau[-–]siegel|if\s+the\s+riemann\s+hypothesis\s+is\s+false)\b/i.test(
        joined,
      ),
    mentionsUnconditionalMain:
      /\b(without\s+(?:assuming\s+)?(?:the\s+)?(?:R\.?H\.?|GRH|riemann\s+hypothesis)|present\s+version[^.\n]{0,60}unconditional|we\s+prove\s+unconditionally|verify\s+numerically[^.\n]{0,60}up\s+to\s+height)\b/i.test(
        joined,
      ),
    mentionsFiniteFieldWeilRh:
      /\b(riemann\s+hypothesis\s+over\s+finite\s+fields|weil\s+conjectures|varieties\s+over\s+finite\s+fields)\b/i.test(
        joined,
      ),
    bibHits: bibMatches.slice(0, 6),
  };
}

const TAXONOMY_RULES_BLOCK = `CONJECTURE TAXONOMY (choose EXACTLY ONE for conjecture_type):
1. "RH": Paper proves a mathematical theorem whose ONLY unproved hypothesis is the classical Riemann Hypothesis for the Riemann zeta function zeta(s) over Q (with NO extra unproved hypotheses such as simplicity of zeros or linear independence of zeros). Elementary integer arithmetic functions such as sigma(n), phi(n), or Dedekind's arithmetic function Psi(n) = n * prod_{p|n}(1 + 1/p) evaluated on integers or primorials belong to classical "RH", NOT number-field Dedekind zeta functions.
2. "GRH_DIRICHLET": Paper proves a conditional theorem assuming ONLY the Generalized or Extended Riemann Hypothesis for Dirichlet L-functions L(s, chi) modulo an integer q over Z/qZ (such as deterministic primality witness bounds modulo n, least quadratic non-residue or primitive root modulo p, primes in arithmetic progressions a mod q, circle-method estimates over Dirichlet characters, moments/zeros of primitive Dirichlet L-functions, or counterfactual consequences of exceptional real Landau-Siegel zeros of Dirichlet L-functions).
3. "BEYOND_DIRICHLET": Paper proves a conditional theorem whose hypothesis goes BEYOND classical zeta(s) and Dirichlet L(s, chi):
   - Dedekind zeta functions zeta_K(s) of algebraic number fields K != Q (e.g., Artin primitive-root or near-primitive-root density over Kummer number fields, prime-ideal norm bounds, ideal class group generation, Euclidean number fields, discriminant lower bounds, or subexponential/quantum ideal-class-group and ordinary-curve isogeny algorithms).
   - The effective Chebotarev density theorem over Galois extensions — INCLUDING computer-science, algebraic-geometry, topology, and cryptography theorems that write "assuming GRH" in the abstract while reducing polynomial systems modulo primes (e.g. Hilbert's Nullstellensatz in AM), testing knot or 3-manifold group representations over finite fields, or computing supersingular elliptic-curve endomorphism rings and isogeny paths via quaternion/class-group ideals.
   - Hecke character L-functions (Grossencharaktere), Artin L-functions, or modular / elliptic-curve / Maass / automorphic L-functions.
   - Conditional theorems that require RH or GRH TOGETHER WITH an additional unproved hypothesis (such as linear independence of zeros / Grand Simplicity, simplicity of zeros of zeta(s), pair-correlation conjectures, or the Generalized Ramanujan Conjecture).
4. "UNCLEAR": Paper genuinely states a theorem conditional on "GRH" or "ERH", AND the provided text gives insufficient mathematical detail to tell whether Dirichlet L(s, chi) over Z/qZ suffices or number-field / automorphic L-functions are required. Never guess "GRH_DIRICHLET" when the provided text leaves "GRH" genuinely ambiguous — choose "UNCLEAR".
5. "DENSITY_BOUND": Paper proves an ALREADY UNCONDITIONAL partial-progress theorem toward RH or GRH — specifically unconditional zero-density estimates, unconditional zero-free regions or strips, explicit prime-counting bounds proved "without RH" from finite zero-free regions, unconditional positive proportions of zeros on the critical line, or rigorous numerical verification of zeros up to a finite height T_0.
6. "MENTION_ONLY": Paper's own proved theorems do NOT assume unproved RH, GRH, or ERH:
   - All theorems proved in the paper are unconditional, and RH/GRH/Siegel zeros are mentioned only in historical background, motivation, comparison with prior conditional bounds, remarks, or notes that an earlier draft used GRH.
   - "Riemann hypothesis" refers to the already proved Riemann hypothesis / Weil conjectures for curves or varieties over finite fields F_q.
   - Paper is purely heuristic/conjectural (formulating random-matrix or physics conjectures without proving a conditional theorem) or expository survey/lecture notes.

POLARITY & FALLBACK RULES:
- assumption_polarity: "ASSUMES_FALSE" ONLY when a theorem assumes RH or GRH is FALSE (e.g., assumes exceptional Landau-Siegel zeros exist infinitely often). Otherwise "ASSUMES_TRUE". (If a paper bypasses possible Siegel zeros to prove an unconditional theorem, classify as "MENTION_ONLY" with "ASSUMES_TRUE".)
- has_unconditional_fallback: true if (a) the paper ALSO proves a weaker/slower unconditional theorem or bound for the same problem, OR (b) an unconditional proof or algorithm for the same qualitative problem is already established in mathematics/CS (e.g., unconditional primality testing, unconditional prime-in-progression bounds, unconditional character-sum bounds, unconditional ternary Goldbach, or unconditional NP membership for knottedness; whereas AM protocols for polynomial feasibility with no unconditional PH bound, or exact RH equivalences with no unconditional proof, have has_unconditional_fallback = false). For "DENSITY_BOUND" and "MENTION_ONLY", set true.`;

const WORLD_OUTCOME_RULES_BLOCK = `OUTCOME RULES UNDER THE GIVEN world_state (rh, grhDirichlet, beyondDirichlet):
- If conjecture_type == "MENTION_ONLY" -> "MENTION_ONLY_UNCHANGED"
- If conjecture_type == "DENSITY_BOUND" -> "BOUND_TIGHTENED"
- If conjecture_type == "UNCLEAR" -> "STILL_CONDITIONAL" (unless rh == "FALSE", then "HYPOTHESIS_FALSIFIED")
- Otherwise let truth = (RH -> world_state.rh, GRH_DIRICHLET -> world_state.grhDirichlet, BEYOND_DIRICHLET -> world_state.beyondDirichlet):
  * truth == "OPEN" -> "STILL_CONDITIONAL"
  * truth == "TRUE" and assumption_polarity == "ASSUMES_TRUE":
      - has_unconditional_fallback == false -> "UPGRADED_UNCONDITIONAL"
      - has_unconditional_fallback == true  -> "BOUND_TIGHTENED"
  * truth == "TRUE" and assumption_polarity == "ASSUMES_FALSE" -> "VACUOUS_OR_SUPERSEDED"
  * truth == "FALSE" and assumption_polarity == "ASSUMES_TRUE" -> "HYPOTHESIS_FALSIFIED"`;

function parseConjectureStrict(raw: unknown): ConjectureType | "PARSE_ERROR" {
  const s = String(raw ?? "").trim().toUpperCase();
  if (VALID_CONJECTURES.has(s as ConjectureType)) return s as ConjectureType;
  // Map legacy v1 outputs if neutral arm emits "GRH" or "ERH" without rules
  if (s === "GRH") return "GRH_DIRICHLET";
  if (s === "ERH") return "BEYOND_DIRICHLET";
  return "PARSE_ERROR";
}

function buildSyntheticRecord(
  paper: AuditPaperInput,
  conjectureType: ConjectureType,
  polarity: Polarity,
  hasFallback: boolean,
  quote: string,
  locator?: string,
  evidenceTier: EvidenceTier = "abstract_only",
): TheoremRecord {
  const arxivOrDoi = paper.arxivId
    ? `arXiv:${paper.arxivId}`
    : paper.doi
      ? `doi:${paper.doi}`
      : paper.id;
  return {
    id: paper.id,
    shortNodeTitle: paper.title.slice(0, 32),
    arxivId: paper.arxivId,
    doi: paper.doi,
    arxivOrDoi,
    url: paper.url,
    title: paper.title,
    authors: paper.authors,
    yearLabel: String(paper.year),
    category:
      paper.category === "cs.CC" || paper.category === "cs.CR"
        ? paper.category
        : "math.NT",
    evidenceTier,
    quoteLocator: locator,
    theoremLabel: "Main Result",
    conjectureType,
    polarity,
    severity: hasFallback ? "SHARPENS_BOUND" : "CORE_BLOCKER",
    hasUnconditionalFallback: hasFallback,
    fallbackSummary: hasFallback
      ? "Unconditional weaker bound or alternative proof exists."
      : "No unconditional proof of this qualitative statement.",
    hopDepth: 1,
    upstreamIds: [],
    extractedQuote: quote,
    confidenceScore: evidenceTier === "fulltext" ? 0.92 : 0.78,
    latexBefore: [`% ${paper.title}`],
    latexAfterUpgrade: [`% Evaluated under ${conjectureType}`],
    latexAfterFallbackOrVacuous: [`% Fallback / counterfactual state`],
    authorAlertUpgrade: `Evaluated under ${conjectureType} = True.`,
    authorAlertOpen: `Remains open while ${conjectureType} is unproved.`,
    authorAlertFalsifiedOrVacuous: `Counterfactual state for ${conjectureType}.`,
    agentTrapNote: "Classified without label lookup.",
  };
}

export async function runTheoremAudit(
  req: AuditRequest,
  opts: {
    creds: ForgeCredentials | null;
    tracer: TraceRunner;
  },
): Promise<AuditResponse> {
  const t0 = Date.now();
  const arm = normalizeAuditorArm(req.agentVersion);
  const resolvedPresetId = resolvePresetId(req.presetId);
  const preset =
    PRESETS.find((p) => p.id === resolvedPresetId) ?? PRESETS[0];
  const worldState: WorldState = req.worldState ?? preset.state;

  const targetModel =
    !req.noLlm && opts.creds
      ? (req.modelOverride ?? opts.creds.model)
      : "deterministic-rule-engine";

  const agentVersionLabel = req.agentVersionTagOverride ?? arm;
  const cleanId = (req.paperInput?.id ?? cleanArxivQuery(req.query)).replace(
    /[^a-zA-Z0-9._-]/g,
    "-",
  );
  const conversationId =
    req.conversationId ??
    `ts-${agentVersionLabel}-${cleanId}-${Date.now().toString(36)}`;

  const tracingEnabled = await opts.tracer.enabled();

  return opts.tracer.run(
    {
      conversationId,
      agentVersion: agentVersionLabel,
      model: targetModel,
      userMessage: `Audit ${req.paperInput?.title ?? req.query} [${arm}] under ${preset.shortLabel}`,
      attributes: {
        "theorem_survival.query": req.query,
        "theorem_survival.arm": arm,
        "theorem_survival.agent_version": agentVersionLabel,
        "theorem_survival.world_preset": preset.id,
        "theorem_survival.rh": worldState.rh,
        "theorem_survival.grh_dirichlet": worldState.grhDirichlet,
        "theorem_survival.beyond_dirichlet": worldState.beyondDirichlet,
      },
    },
    async (trace) => {
      const paper = await trace.tool(
        "resolve_paper_metadata",
        { query: req.query },
        (m) => `${m.arxivId ?? m.doi ?? m.id} — ${m.title.slice(0, 56)}`,
        async () => {
          const p = await resolvePaperMetadata(req);
          return {
            id: p.id,
            arxivId: p.arxivId ?? "",
            doi: p.doi ?? "",
            oaUrl: p.oaUrl ?? "",
            title: p.title,
            authors: p.authors,
            year: String(p.year),
            category: p.category,
            abstractText: p.abstractText,
            url: p.url,
          };
        },
      );

      const arxivOrDoi = paper.arxivId
        ? `arXiv:${paper.arxivId}`
        : paper.doi
          ? `doi:${paper.doi}`
          : paper.id;

      // =========================================================================
      // ARM 1 & ARM 2: Single-prompt abstract-only arms (v1-neutral & v1-rules)
      // =========================================================================
      if ((arm === "auditor-v1-neutral" || arm === "auditor-v1-rules") && !req.noLlm) {
        if (!opts.creds) {
          throw new Error(`${arm} requires live LLM credentials.`);
        }
        const creds = opts.creds;
        const sysPrompt =
          arm === "auditor-v1-neutral"
            ? [
                "You classify how a mathematical or computer science paper is affected by a given conjecture world-state.",
                "Given the paper title, authors, category, abstract, and world_state (rh: classical Riemann Hypothesis for zeta(s); grhDirichlet: Generalized Riemann Hypothesis for Dirichlet L-functions; beyondDirichlet: Dedekind zeta, Hecke, Artin, automorphic L-functions, or extra hypotheses), return strict JSON ONLY with keys:",
                "- conjecture_type: one of 'RH' | 'GRH_DIRICHLET' | 'BEYOND_DIRICHLET' | 'UNCLEAR' | 'DENSITY_BOUND' | 'MENTION_ONLY'",
                "- assumption_polarity: 'ASSUMES_TRUE' | 'ASSUMES_FALSE'",
                "- has_unconditional_fallback: boolean",
                "- predicted_outcome: one of 'UPGRADED_UNCONDITIONAL' | 'BOUND_TIGHTENED' | 'STILL_CONDITIONAL' | 'VACUOUS_OR_SUPERSEDED' | 'HYPOTHESIS_FALSIFIED' | 'MENTION_ONLY_UNCHANGED'",
                "- extracted_quote: string (1 sentence from abstract)",
                "- author_alert: string (1-2 sentences)",
              ].join("\n")
            : [
                "You are a mathematical dependency classifier auditing papers from their title and abstract only.",
                TAXONOMY_RULES_BLOCK,
                WORLD_OUTCOME_RULES_BLOCK,
                "Return strict JSON ONLY with keys: conjecture_type ('RH' | 'GRH_DIRICHLET' | 'BEYOND_DIRICHLET' | 'UNCLEAR' | 'DENSITY_BOUND' | 'MENTION_ONLY'), assumption_polarity ('ASSUMES_TRUE' | 'ASSUMES_FALSE'), has_unconditional_fallback (boolean), predicted_outcome ('UPGRADED_UNCONDITIONAL' | 'BOUND_TIGHTENED' | 'STILL_CONDITIONAL' | 'VACUOUS_OR_SUPERSEDED' | 'HYPOTHESIS_FALSIFIED' | 'MENTION_ONLY_UNCHANGED'), extracted_quote (string), author_alert (string, 1-2 sentences).",
              ].join("\n\n");

        const userPrompt = [
          `Paper ID: ${arxivOrDoi}`,
          `Title: ${paper.title}`,
          `Authors: ${paper.authors} (${paper.year})`,
          `Category: ${paper.category}`,
          `World State: rh=${worldState.rh}, grhDirichlet=${worldState.grhDirichlet}, beyondDirichlet=${worldState.beyondDirichlet}, siegelZero=${String(worldState.siegelZero)}`,
          "",
          "Abstract:",
          paper.abstractText || "(no abstract available)",
          "",
          "Return ONLY a single valid JSON object with the exact requested keys.",
        ].join("\n");

        const llmRes = await trace.llm(
          targetModel,
          [{ role: "user", parts: [{ type: "text", content: userPrompt }] }],
          [sysPrompt],
          () =>
            chatCompletion(
              creds,
              [
                { role: "system", content: sysPrompt },
                { role: "user", content: userPrompt },
              ],
              { temperature: 0.1, maxTokens: 1400, modelOverride: req.modelOverride },
            ),
          (r) => ({
            output: r.content,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            responseModel: r.model,
            summary: `${arm} (${r.outputTokens} tok, ${r.latencyMs}ms)`,
          }),
        );

        const parsed = parseJsonObjectStrict(llmRes.content);
        const conj = parsed ? parseConjectureStrict(parsed.conjecture_type) : "PARSE_ERROR";
        const rawOut = parsed ? String(parsed.predicted_outcome ?? "").trim().toUpperCase() : "";
        const validOut = VALID_OUTCOMES.has(rawOut as OutcomeKind)
          ? (rawOut as OutcomeKind)
          : "PARSE_ERROR";
        const isParseErr = !parsed || conj === "PARSE_ERROR" || validOut === "PARSE_ERROR";

        const polarity: Polarity =
          parsed?.assumption_polarity === "ASSUMES_FALSE" ? "ASSUMES_FALSE" : "ASSUMES_TRUE";
        const hasFallback = Boolean(parsed?.has_unconditional_fallback ?? false);
        const quote = String(parsed?.extracted_quote ?? paper.abstractText.slice(0, 220)).slice(
          0,
          320,
        );
        const authorAlert = isParseErr
          ? "PARSE_ERROR: Model response failed strict JSON/schema validation."
          : String(parsed?.author_alert ?? "Classified from abstract.");

        trace.setAttributes({
          "theorem_survival.arxiv_id": arxivOrDoi,
          "theorem_survival.conjecture_type": conj,
          "theorem_survival.polarity": polarity,
          "theorem_survival.has_fallback": hasFallback,
          "theorem_survival.outcome": isParseErr ? "PARSE_ERROR" : validOut,
          "theorem_survival.parse_error": isParseErr,
          "theorem_survival.evidence_tier": "abstract_only",
        });
        trace.output(authorAlert);

        return {
          conversationId,
          agentLensUrl: tracingEnabled
            ? `https://forge.coreweave.com/agent-lens/${opts.tracer.project}/conversations/${conversationId}`
            : null,
          project: opts.tracer.project,
          agentVersion: agentVersionLabel,
          arm,
          source: "forge-inference",
          model: llmRes.model,
          evidenceTier: "abstract_only",
          parseError: isParseErr,
          paper: {
            id: paper.id,
            arxivOrDoi,
            title: paper.title,
            authors: paper.authors,
            published: paper.year,
            category: paper.category,
            abstractSnippet: paper.abstractText.slice(0, 320),
            url: paper.url,
          },
          worldState,
          presetLabel: preset.label,
          predictedOutcome: isParseErr ? "PARSE_ERROR" : validOut,
          authorAlert,
          extraction: {
            has_conditional_dependency:
              conj !== "DENSITY_BOUND" && conj !== "MENTION_ONLY",
            parse_error: isParseErr,
            dependencies: [
              {
                theorem_label: "Main Result",
                conjecture_type: conj,
                assumption_polarity: polarity,
                dependency_severity:
                  conj === "MENTION_ONLY"
                    ? "MENTION_ONLY"
                    : hasFallback
                      ? "SHARPENS_BOUND"
                      : "CORE_BLOCKER",
                has_unconditional_fallback: hasFallback,
                extracted_quote: quote,
                evidence_tier: "abstract_only",
                remediation_note: authorAlert,
              },
            ],
          },
          spans: trace.spans,
          inputTokens: llmRes.inputTokens,
          outputTokens: llmRes.outputTokens,
          totalTokens: llmRes.inputTokens + llmRes.outputTokens,
          estimatedUsd: llmRes.estimatedUsd,
          wallMs: Date.now() - t0,
        };
      }

      // =========================================================================
      // ARM 3 & ARM 4: Tool-augmented pipelines (v2-abstract & v3-fulltext)
      // =========================================================================
      let evidenceTier = "abstract_only" as EvidenceTier;
      let fullTextWindows: Array<{ locator: string; kind: string; excerpt: string }> = [];
      let bibMatches: string[] = [];
      let fullTextFormat = "none";

      if (arm === "auditor-v3-fulltext") {
        const ftDoc = await trace.tool(
          "fetch_fulltext_windows",
          {
            id: paper.id,
            arxivId: paper.arxivId,
            doi: paper.doi,
          },
          (d) => `status=${d.status} fmt=${d.format} windows=${d.windowCount} bib=${d.bibCount}`,
          async () => {
            const doc = await fetchPaperFullText({
              arxivId: paper.arxivId || undefined,
              doi: paper.doi || undefined,
              oaUrl: paper.oaUrl || undefined,
              poolId: paper.id,
            });
            fullTextWindows = doc.windows.slice(0, 10);
            bibMatches = doc.bibliographyMatches.slice(0, 6);
            fullTextFormat = doc.format;
            if (doc.status === "ok" && doc.windows.length > 0) {
              evidenceTier = "fulltext";
            }
            return {
              status: doc.status,
              format: doc.format,
              charCount: doc.charCount,
              windowCount: fullTextWindows.length,
              bibCount: bibMatches.length,
            };
          },
        );
        void ftDoc;
      }

      const scopeSignals = await trace.tool(
        arm === "auditor-v3-fulltext" ? "scan_fulltext_scope_signals" : "scan_abstract_clauses",
        { id: paper.id, evidenceTier },
        (s) =>
          `dirichlet=${String(s.mentionsDirichletExplicit)} dedekindHecke=${String(
            s.mentionsDedekindOrHecke || s.mentionsChebotarevOrArtin,
          )} uncond=${String(s.mentionsUnconditionalMain)}`,
        () => {
          const combined =
            evidenceTier === "fulltext"
              ? `${paper.title}\n${paper.abstractText}\n${fullTextWindows
                  .map((w) => `[${w.locator}] ${w.excerpt}`)
                  .join("\n")}`
              : `${paper.title}\n${paper.abstractText}`;
          return { ...scanTextScopeSignals(combined, bibMatches) };
        },
      );

      let chosenConj: ConjectureType = "UNCLEAR";
      let chosenPolarity: Polarity = "ASSUMES_TRUE";
      let chosenFallback = false;
      let chosenQuote = paper.abstractText.slice(0, 260);
      let chosenLocator = evidenceTier === "fulltext" ? (fullTextWindows[0]?.locator ?? "Abstract") : "Abstract";
      let authorAlert = "";
      let parseError = false;
      let inputTokens = 0;
      let outputTokens = 0;
      let estimatedUsd = 0;
      let usedModel = targetModel;
      let source: AuditResponse["source"] = "deterministic-fallback";

      if (!req.noLlm && opts.creds) {
        const creds = opts.creds;
        const sysPrompt = [
          arm === "auditor-v3-fulltext"
            ? "You are TheoremSurvival Auditor v3 (Full-Text Verifier). Classify the paper's true theorem dependency using the title, abstract, located full-text excerpts, bibliography matches, and lexical signals."
            : "You are TheoremSurvival Auditor v2 (Abstract Verifier). Classify the paper's theorem dependency using ONLY the provided title, abstract, and lexical signals.",
          TAXONOMY_RULES_BLOCK,
          arm === "auditor-v3-fulltext"
            ? "CRITICAL FULL-TEXT RULE: Inspect the full-text theorem statements, proof steps, and bibliography matches carefully! Many papers write 'assuming GRH' in the abstract while their body invokes the effective Chebotarev density theorem over number fields, prime-ideal bounds for ideal class groups, Artin primitive-root methods over Kummer fields, finite-field reductions for polynomial systems in AM, Hecke or automorphic L-functions, or extra hypotheses (simplicity/linear independence of zeros) -> classify ALL of those as 'BEYOND_DIRICHLET'. Conversely, if every proved theorem in the paper is unconditional and RH/GRH/Siegel zeros appear only in historical motivation, remarks, earlier draft notes, or proved finite-field Weil conjectures -> classify as 'MENTION_ONLY'."
            : "CRITICAL ABSTRACT-ONLY RULE: You only have the title and abstract. If the abstract says 'assuming GRH' without specifying Dirichlet L(s, chi) vs number fields/Chebotarev/Hecke, only pick 'BEYOND_DIRICHLET' when the mathematical setting clearly requires number fields, class groups, isogeny graphs, knot/3-manifold groups, polynomial-system AM reductions, or automorphic forms; pick 'GRH_DIRICHLET' when it clearly concerns modular arithmetic over Z/qZ or Dirichlet characters; and pick 'UNCLEAR' when the abstract gives insufficient detail to tell.",
          "Return strict JSON ONLY with keys: conjecture_type ('RH' | 'GRH_DIRICHLET' | 'BEYOND_DIRICHLET' | 'UNCLEAR' | 'DENSITY_BOUND' | 'MENTION_ONLY'), assumption_polarity ('ASSUMES_TRUE' | 'ASSUMES_FALSE'), has_unconditional_fallback (boolean), extracted_quote (verbatim sentence supporting your classification), quote_locator (section/page/line locator from the windows, or 'Abstract'), author_alert (1-2 crisp plain-English sentences explaining what the checked RH + Dirichlet GRH proof does or does not change for this paper).",
        ].join("\n\n");

        const promptSections: string[] = [
          `Paper ID: ${arxivOrDoi}`,
          `Title: ${paper.title}`,
          `Authors: ${paper.authors} (${paper.year})`,
          `Category: ${paper.category}`,
          `Evidence Tier: ${evidenceTier}`,
          "",
          "Abstract:",
          paper.abstractText || "(no abstract available)",
          "",
          `Lexical Signals: ${JSON.stringify(scopeSignals)}`,
        ];
        if (arm === "auditor-v3-fulltext" && evidenceTier === "fulltext") {
          promptSections.push(
            "",
            `Located Full-Text Excerpts (${fullTextFormat}):`,
            fullTextWindows
              .map((w) => `[${w.locator} | ${w.kind}]\n${w.excerpt}`)
              .join("\n\n"),
          );
          if (bibMatches.length > 0) {
            promptSections.push(
              "",
              "Bibliography Anchor Matches:",
              bibMatches.join("\n"),
            );
          }
        }
        promptSections.push(
          "",
          "Return ONLY a single valid JSON object with keys: conjecture_type, assumption_polarity, has_unconditional_fallback, extracted_quote, quote_locator, author_alert.",
        );
        const userPrompt = promptSections.join("\n");

        const llmRes = await trace.llm(
          targetModel,
          [{ role: "user", parts: [{ type: "text", content: userPrompt }] }],
          [sysPrompt],
          () =>
            chatCompletion(
              creds,
              [
                { role: "system", content: sysPrompt },
                { role: "user", content: userPrompt },
              ],
              { temperature: 0.1, maxTokens: 1400, modelOverride: req.modelOverride },
            ),
          (r) => ({
            output: r.content,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            responseModel: r.model,
            summary: `${arm} (${r.outputTokens} tok, ${r.latencyMs}ms)`,
          }),
        );

        inputTokens = llmRes.inputTokens;
        outputTokens = llmRes.outputTokens;
        estimatedUsd = llmRes.estimatedUsd;
        usedModel = llmRes.model;
        source = "forge-inference";

        const parsed = parseJsonObjectStrict(llmRes.content);
        const conj = parsed ? parseConjectureStrict(parsed.conjecture_type) : "PARSE_ERROR";
        if (!parsed || conj === "PARSE_ERROR") {
          parseError = true;
        } else {
          chosenConj = conj;
          chosenPolarity =
            parsed.assumption_polarity === "ASSUMES_FALSE" ? "ASSUMES_FALSE" : "ASSUMES_TRUE";
          chosenFallback =
            chosenConj === "DENSITY_BOUND" || chosenConj === "MENTION_ONLY"
              ? true
              : Boolean(parsed.has_unconditional_fallback);
          if (typeof parsed.extracted_quote === "string" && parsed.extracted_quote.trim()) {
            chosenQuote = parsed.extracted_quote.trim().slice(0, 320);
          }
          if (typeof parsed.quote_locator === "string" && parsed.quote_locator.trim()) {
            chosenLocator = parsed.quote_locator.trim().slice(0, 120);
          }
          if (typeof parsed.author_alert === "string" && parsed.author_alert.trim()) {
            authorAlert = parsed.author_alert.trim();
          }
        }
      } else {
        // Pure deterministic heuristic when --no-llm is requested for offline smoke tests
        if (scopeSignals.mentionsFiniteFieldWeilRh) {
          chosenConj = "MENTION_ONLY";
          chosenFallback = true;
        } else if (
          scopeSignals.mentionsDedekindOrHecke ||
          scopeSignals.mentionsChebotarevOrArtin ||
          scopeSignals.mentionsAutomorphicOrModular ||
          scopeSignals.mentionsClassGroupOrIsogeny ||
          scopeSignals.mentionsNullstellensatzOrKnot ||
          scopeSignals.mentionsExtraHypothesis
        ) {
          chosenConj = "BEYOND_DIRICHLET";
        } else if (scopeSignals.mentionsDirichletExplicit) {
          chosenConj = "GRH_DIRICHLET";
        } else if (scopeSignals.mentionsUnconditionalMain) {
          chosenConj = "DENSITY_BOUND";
          chosenFallback = true;
        } else if (scopeSignals.mentionsGenericGrh || scopeSignals.mentionsErh) {
          chosenConj = "UNCLEAR";
        } else if (scopeSignals.mentionsClassicalRh) {
          chosenConj = "RH";
        } else {
          chosenConj = "MENTION_ONLY";
          chosenFallback = true;
        }
      }

      if (parseError) {
        trace.setAttributes({
          "theorem_survival.arxiv_id": arxivOrDoi,
          "theorem_survival.conjecture_type": "PARSE_ERROR",
          "theorem_survival.outcome": "PARSE_ERROR",
          "theorem_survival.parse_error": true,
          "theorem_survival.evidence_tier": evidenceTier,
        });
        return {
          conversationId,
          agentLensUrl: tracingEnabled
            ? `https://forge.coreweave.com/agent-lens/${opts.tracer.project}/conversations/${conversationId}`
            : null,
          project: opts.tracer.project,
          agentVersion: agentVersionLabel,
          arm,
          source,
          model: usedModel,
          evidenceTier,
          parseError: true,
          paper: {
            id: paper.id,
            arxivOrDoi,
            title: paper.title,
            authors: paper.authors,
            published: paper.year,
            category: paper.category,
            abstractSnippet: paper.abstractText.slice(0, 320),
            url: paper.url,
          },
          worldState,
          presetLabel: preset.label,
          predictedOutcome: "PARSE_ERROR",
          authorAlert: "PARSE_ERROR: Model output failed strict JSON validation.",
          extraction: {
            has_conditional_dependency: false,
            parse_error: true,
            dependencies: [
              {
                theorem_label: "Main Result",
                conjecture_type: "PARSE_ERROR",
                assumption_polarity: "ASSUMES_TRUE",
                dependency_severity: "CORE_BLOCKER",
                has_unconditional_fallback: false,
                extracted_quote: chosenQuote,
                quote_locator: chosenLocator,
                evidence_tier: evidenceTier,
                remediation_note: "PARSE_ERROR",
              },
            ],
          },
          spans: trace.spans,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedUsd,
          wallMs: Date.now() - t0,
        };
      }

      const syntheticRecord = buildSyntheticRecord(
        paper,
        chosenConj,
        chosenPolarity,
        chosenFallback,
        chosenQuote,
        chosenLocator,
        evidenceTier,
      );

      const diffEval = await trace.tool(
        "evaluate_world_state_diff",
        {
          id: paper.id,
          conjectureType: chosenConj,
          polarity: chosenPolarity,
          hasFallback: chosenFallback,
          rh: worldState.rh,
          grhDirichlet: worldState.grhDirichlet,
          beyondDirichlet: worldState.beyondDirichlet,
        },
        (d) => `${d.outcome} (${d.badgeLabel})`,
        () => {
          const ev = evaluateTheorem(syntheticRecord, worldState);
          return {
            outcome: ev.outcome,
            badgeLabel: ev.badgeLabel,
            headline: ev.headline,
          };
        },
      );

      const finalAlert = authorAlert || diffEval.headline;
      trace.setAttributes({
        "theorem_survival.arxiv_id": arxivOrDoi,
        "theorem_survival.category": paper.category,
        "theorem_survival.conjecture_type": chosenConj,
        "theorem_survival.polarity": chosenPolarity,
        "theorem_survival.has_fallback": chosenFallback,
        "theorem_survival.outcome": diffEval.outcome,
        "theorem_survival.evidence_tier": evidenceTier,
        "theorem_survival.parse_error": false,
      });
      trace.output(finalAlert);

      return {
        conversationId,
        agentLensUrl: tracingEnabled
          ? `https://forge.coreweave.com/agent-lens/${opts.tracer.project}/conversations/${conversationId}`
          : null,
        project: opts.tracer.project,
        agentVersion: agentVersionLabel,
        arm,
        source,
        model: usedModel,
        evidenceTier,
        parseError: false,
        paper: {
          id: paper.id,
          arxivOrDoi,
          title: paper.title,
          authors: paper.authors,
          published: paper.year,
          category: paper.category,
          abstractSnippet: paper.abstractText.slice(0, 320),
          url: paper.url,
        },
        worldState,
        presetLabel: preset.label,
        predictedOutcome: diffEval.outcome,
        authorAlert: finalAlert,
        extraction: {
          has_conditional_dependency:
            chosenConj !== "DENSITY_BOUND" && chosenConj !== "MENTION_ONLY",
          parse_error: false,
          dependencies: [
            {
              theorem_label: "Main Result",
              conjecture_type: chosenConj,
              assumption_polarity: chosenPolarity,
              dependency_severity:
                chosenConj === "MENTION_ONLY"
                  ? "MENTION_ONLY"
                  : chosenFallback
                    ? "SHARPENS_BOUND"
                    : "CORE_BLOCKER",
              has_unconditional_fallback: chosenFallback,
              extracted_quote: chosenQuote,
              quote_locator: chosenLocator,
              evidence_tier: evidenceTier,
              remediation_note: finalAlert,
            },
          ],
        },
        spans: trace.spans,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedUsd,
        wallMs: Date.now() - t0,
      };
    },
  );
}
