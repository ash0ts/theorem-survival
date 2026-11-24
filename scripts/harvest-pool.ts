/**
 * Full 4-source pool harvester for Theorem Survival (Attempt 2).
 *
 * Sources (defined in research/contract.md):
 *  1. arxiv_abstract    — Uncapped pagination (200/page, >=3.1s delay) across RH/GRH/ERH/Siegel queries
 *  2. openalex_fulltext — Cursor pagination across 8 full-text assumption phrases
 *  3. anchor_citations  — OpenAlex works citing 9 conditional anchor papers + matching RH/GRH/ERH/Siegel text
 *  4. curated_classics  — Canonical pre-arXiv and high-citation landmarks in research/curated-classics.json
 *
 * Writes:
 *  - out/harvest/source-arxiv.json
 *  - out/harvest/source-openalex-fulltext.json
 *  - out/harvest/source-anchor-citations.json
 *  - out/pool-raw.json
 *  - out/pool-coverage.md & research/pool-coverage.md
 */
import fs from "node:fs";
import path from "node:path";
import attempt1Labels from "../research/attempt-1/corpus-v1-labels.json";
import curatedClassics from "../research/curated-classics.json";
import { LANDMARK_THEOREMS } from "../src/data/theorems";

const attempt1Raw: any[] = fs.existsSync(path.join(process.cwd(), "out", "arxiv-raw.json"))
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), "out", "arxiv-raw.json"), "utf8"))
  : (attempt1Labels as any[]).map((x) => ({
      arxivId: x.arxivId,
      title: x.title,
      authors: x.authors,
      year: x.year,
      primaryCategory: x.primaryCategory,
      abstract: `${x.plainSummary} Quote: ${x.extractedQuote}`,
      matchedQuery: "attempt1",
    }));

export type HarvestSourceId =
  | "arxiv_abstract"
  | "openalex_fulltext"
  | "anchor_citations"
  | "curated_classics";

export interface RawHarvestHit {
  source: HarvestSourceId;
  queryTag: string;
  arxivId?: string;
  doi?: string;
  openalexId?: string;
  title: string;
  authors: string;
  year: number;
  primaryCategory: string;
  abstractText: string;
  citedByCount: number;
  oaUrl?: string;
  url: string;
  classicMeta?: (typeof curatedClassics)[number];
}

export interface PoolRawEntry {
  poolId: string;
  arxivId?: string;
  doi?: string;
  openalexId?: string;
  title: string;
  authors: string;
  year: number;
  primaryCategory: string;
  abstractText: string;
  citedByCount: number;
  importanceRank: number;
  importanceTier: "TOP_100" | "TOP_500" | "TAIL";
  foundBySources: HarvestSourceId[];
  queryTags: string[];
  oaUrl?: string;
  url: string;
  inAttempt1Corpus: boolean;
  isNamedLandmark: boolean;
  landmarkId?: string;
  classicMeta?: (typeof curatedClassics)[number];
}

const ROOT_DIR = process.cwd();
const HARVEST_DIR = path.join(ROOT_DIR, "out", "harvest");
const OUT_POOL_PATH = path.join(ROOT_DIR, "out", "pool-raw.json");
const OUT_COV_PATH = path.join(ROOT_DIR, "out", "pool-coverage.md");
const RES_COV_PATH = path.join(ROOT_DIR, "research", "pool-coverage.md");

const USER_AGENT = "TheoremSurvivalResearch/2.0 (https://github.com/ash0ts/theorem-survival)";

const ARXIV_QUERIES: { tag: string; searchQuery: string }[] = [
  {
    tag: "arxiv:grh_conditional",
    searchQuery:
      'abs:"Generalized Riemann Hypothesis" AND (abs:assuming OR abs:under OR abs:conditional OR abs:modulo)',
  },
  {
    tag: "arxiv:grh_abbrev_conditional",
    searchQuery: 'abs:GRH AND (abs:assuming OR abs:under OR abs:conditional OR abs:modulo)',
  },
  {
    tag: "arxiv:erh_all",
    searchQuery: 'abs:"Extended Riemann Hypothesis" OR abs:ERH',
  },
  {
    tag: "arxiv:siegel_zeros",
    searchQuery: 'abs:"Siegel zero" OR abs:"Siegel zeros" OR abs:"Landau-Siegel"',
  },
  {
    tag: "arxiv:rh_conditional",
    searchQuery:
      'abs:"Riemann Hypothesis" AND (abs:"assuming the Riemann" OR abs:"under the Riemann" OR abs:"conditional on the Riemann" OR abs:"equivalent to the Riemann")',
  },
  {
    tag: "arxiv:rh_abbrev_conditional",
    searchQuery: 'abs:"assuming RH" OR abs:"under RH" OR abs:"conditional on RH"',
  },
];

const OPENALEX_FULLTEXT_PHRASES: string[] = [
  "assuming the generalized Riemann hypothesis",
  "assuming GRH",
  "under the generalized Riemann hypothesis",
  "conditional on the generalized Riemann hypothesis",
  "assuming the Riemann hypothesis",
  "under the Riemann hypothesis",
  "assuming the extended Riemann hypothesis",
  "assuming ERH",
];

// Verified OpenAlex IDs for anchor papers:
// Miller 1976, Bach 1990, Lagarias-Montgomery-Odlyzko 1979, Hooley 1967,
// Weinberger 1973, Ankeny 1952, Schoenfeld 1976, Heath-Brown 1983, Koiran 1996
const ANCHOR_OPENALEX_IDS = [
  "W2012857639",
  "W2011809718",
  "W2153231112",
  "W4206750213",
  "W4232219646",
  "W2040296694",
  "W1512503533",
  "W2081183524",
  "W2087392392",
];

const CONDITIONAL_SIGNAL =
  /\b(assum(e|es|ing)|under (the )?(grh|erh|rh|riemann|generalized riemann|extended riemann)|conditional(ly)?|modulo (the )?(grh|erh|rh)|if (the )?(generalized |extended )?riemann hypothesis|equivalent to (the )?riemann hypothesis|siegel zero(e?s)?|landau[-–]siegel)\b/i;

const EXCLUDE_NOISE =
  /\b(we prove the riemann hypothesis|proof of the riemann hypothesis|disproof of the riemann hypothesis|refutation of|riemann solver|riemann problem for|riemannian manifold|generalized riemann problem)\b/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function normalizeArxivId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^https?:\/\/arxiv\.org\/(abs|pdf|html|e-print)\//i, "");
  cleaned = cleaned.replace(/^arxiv:/i, "");
  cleaned = cleaned.replace(/\.pdf$/i, "");
  cleaned = cleaned.replace(/v\d+$/i, "");
  cleaned = cleaned.trim().toLowerCase();
  if (/^\d{4}\.\d{4,5}$/.test(cleaned) || /^[a-z-]+\/\d{7}$/.test(cleaned)) {
    return cleaned;
  }
  return undefined;
}

export function normalizeDoi(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let d = raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
  if (!d) return undefined;
  const arxivMatch = d.match(/^10\.48550\/arxiv\.(.+)$/i);
  if (arxivMatch) {
    return undefined;
  }
  return d;
}

export function extractArxivFromOpenAlexWork(work: any): string | undefined {
  const candidates: string[] = [];
  if (typeof work?.ids?.doi === "string") {
    const m = work.ids.doi.match(/10\.48550\/arxiv\.([^\s/]+(?:\/[^\s/]+)?)/i);
    if (m) candidates.push(m[1]);
  }
  if (Array.isArray(work?.locations)) {
    for (const loc of work.locations) {
      for (const u of [loc?.landing_page_url, loc?.pdf_url]) {
        if (typeof u === "string" && u.includes("arxiv.org/")) {
          const id = normalizeArxivId(u);
          if (id) candidates.push(id);
        }
      }
    }
  }
  for (const c of candidates) {
    const n = normalizeArxivId(c);
    if (n) return n;
  }
  return undefined;
}

export function reconstructOpenAlexAbstract(inv?: Record<string, number[]> | null): string {
  if (!inv || typeof inv !== "object") return "";
  let maxIdx = -1;
  for (const positions of Object.values(inv)) {
    if (Array.isArray(positions)) {
      for (const p of positions) {
        if (p > maxIdx) maxIdx = p;
      }
    }
  }
  if (maxIdx < 0 || maxIdx > 20_000) return "";
  const words = new Array<string>(maxIdx + 1).fill("");
  for (const [word, positions] of Object.entries(inv)) {
    if (Array.isArray(positions)) {
      for (const p of positions) {
        if (p >= 0 && p <= maxIdx) words[p] = word;
      }
    }
  }
  return words.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function inferCategoryFromOpenAlex(work: any): string {
  const text = `${work?.title ?? ""} ${work?.primary_topic?.display_name ?? ""} ${
    work?.primary_topic?.subfield?.display_name ?? ""
  }`.toLowerCase();
  if (/crypt|isogen|lattice|quantum|post-quantum|lwe|rsa/.test(text)) return "cs.CR";
  if (/complexit|algorithm|primality|factoring|polynomial-time|derandom|nullstellensatz/.test(text)) {
    return "cs.CC";
  }
  if (/knot|manifold|topolog|hyperbolic|3-manifold/.test(text)) return "math.GT";
  if (/group|galois|ring|euclidean|class group/.test(text)) return "math.GR";
  return "math.NT";
}

function cleanXmlText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArxivAtom(xml: string, queryTag: string): RawHarvestHit[] {
  const entries = xml.split("<entry>").slice(1);
  const out: RawHarvestHit[] = [];
  for (const raw of entries) {
    const entry = raw.split("</entry>")[0] ?? "";
    const idRaw = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
    const arxivId = normalizeArxivId(idRaw);
    if (!arxivId) continue;

    const title = cleanXmlText(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const summary = cleanXmlText(entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "");
    const published = entry.match(/<published>(\d{4})/)?.[1] ?? "2020";
    const primaryCat =
      entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ??
      entry.match(/<category[^>]*term="([^"]+)"/)?.[1] ??
      "math.NT";
    const doiMatch = entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1];
    const doi = normalizeDoi(doiMatch);

    const authorMatches = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) =>
      cleanXmlText(m[1])
    );
    const authors =
      authorMatches.length <= 3
        ? authorMatches.join(", ")
        : `${authorMatches.slice(0, 3).join(", ")} et al.`;

    if (!title || !summary) continue;
    const combined = `${title} ${summary}`;
    if (EXCLUDE_NOISE.test(combined)) continue;
    if (!CONDITIONAL_SIGNAL.test(combined) && !/\b(ERH|Siegel zero)/i.test(combined)) continue;
    // Keep math, CS, physics-math, stat-theory; skip unrelated bio/finance/geo noise
    if (!/^(math|cs|quant-ph|math-ph|stat\.TH|hep-th|nlin)/.test(primaryCat)) continue;

    out.push({
      source: "arxiv_abstract",
      queryTag,
      arxivId,
      doi,
      title,
      authors: authors || "Unknown",
      year: Number(published),
      primaryCategory: primaryCat,
      abstractText: summary,
      citedByCount: 0,
      oaUrl: `https://arxiv.org/pdf/${arxivId}`,
      url: `https://arxiv.org/abs/${arxivId}`,
    });
  }
  return out;
}

async function fetchWithRetry(url: string, minBackoffMs = 3200, maxAttempts = 5): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(45_000),
      });
      if (res.ok) {
        return await res.text();
      }
      if (res.status === 429 || res.status >= 500) {
        const wait = minBackoffMs * Math.pow(1.8, attempt);
        console.warn(`  [HTTP ${res.status}] waiting ${Math.round(wait)}ms before retry ${attempt}/${maxAttempts}...`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status} on ${url}`);
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const wait = minBackoffMs * Math.pow(1.6, attempt);
      console.warn(`  [fetch retry ${attempt}/${maxAttempts}] ${(err as Error).message}; sleeping ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`Exhausted retries for ${url}`);
}

async function harvestArxivUncapped(): Promise<RawHarvestHit[]> {
  const cachePath = path.join(HARVEST_DIR, "source-arxiv.json");
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as RawHarvestHit[];
    console.log(`[1/4 arxiv_abstract] Loaded ${cached.length} hits from ${cachePath}`);
    return cached;
  }

  console.log("[1/4 arxiv_abstract] Harvesting uncapped arXiv pages (>=3.1s delay between requests)...");
  const hits: RawHarvestHit[] = [];
  const pageSize = 200;

  for (const q of ARXIV_QUERIES) {
    let start = 0;
    let totalResults = Infinity;
    while (start < totalResults && start < 3000) {
      const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
        q.searchQuery
      )}&start=${start}&max_results=${pageSize}&sortBy=relevance&sortOrder=descending`;
      const xml = await fetchWithRetry(url, 3500);
      const totalStr = xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/)?.[1];
      if (totalStr) totalResults = Number(totalStr);

      const rawEntriesCount = xml.split("<entry>").length - 1;
      const parsed = parseArxivAtom(xml, q.tag);
      hits.push(...parsed);
      console.log(
        `  [${q.tag}] start=${start}/${totalResults} rawEntries=${rawEntriesCount} kept=${parsed.length}`
      );

      await sleep(3150);
      if (rawEntriesCount === 0) break;
      start += pageSize;
    }
  }

  // Ensure every Attempt-1 arXiv item is also represented in arxiv_abstract
  const seenArxiv = new Set(hits.map((h) => h.arxivId).filter(Boolean));
  for (const item of attempt1Raw as any[]) {
    const aid = normalizeArxivId(item.arxivId);
    if (aid && !seenArxiv.has(aid)) {
      hits.push({
        source: "arxiv_abstract",
        queryTag: `attempt1:${item.queryTag ?? "seed"}`,
        arxivId: aid,
        title: item.title,
        authors: item.authors,
        year: item.year,
        primaryCategory: item.primaryCategory,
        abstractText: item.abstract,
        citedByCount: 0,
        oaUrl: `https://arxiv.org/pdf/${aid}`,
        url: `https://arxiv.org/abs/${aid}`,
      });
      seenArxiv.add(aid);
    }
  }

  fs.mkdirSync(HARVEST_DIR, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(hits, null, 2));
  console.log(`[1/4 arxiv_abstract] Saved ${hits.length} hits -> ${cachePath}`);
  return hits;
}

function openAlexWorkToHit(
  work: any,
  source: HarvestSourceId,
  queryTag: string
): RawHarvestHit | null {
  const title = String(work?.title ?? work?.display_name ?? "").replace(/\s+/g, " ").trim();
  if (!title) return null;
  if (EXCLUDE_NOISE.test(title)) return null;
  // Exclude datasets/paratext/errata where obvious
  const type = String(work?.type ?? "");
  if (type === "paratext" || type === "dataset" || type === "peer-review") return null;

  const arxivId = extractArxivFromOpenAlexWork(work);
  const doi = normalizeDoi(work?.doi);
  const openalexId = typeof work?.id === "string" ? work.id.replace("https://openalex.org/", "") : undefined;
  const year = Number(work?.publication_year) || 2020;
  const citedByCount = Number(work?.cited_by_count) || 0;
  const abstractText = reconstructOpenAlexAbstract(work?.abstract_inverted_index);

  if (abstractText && EXCLUDE_NOISE.test(abstractText)) return null;

  const authorships = Array.isArray(work?.authorships) ? work.authorships : [];
  const authorNames = authorships
    .map((a: any) => a?.author?.display_name)
    .filter((x: any): x is string => typeof x === "string" && x.length > 0);
  const authors =
    authorNames.length === 0
      ? "Unknown"
      : authorNames.length <= 3
        ? authorNames.join(", ")
        : `${authorNames.slice(0, 3).join(", ")} et al.`;

  const oaUrl =
    typeof work?.open_access?.oa_url === "string"
      ? work.open_access.oa_url
      : arxivId
        ? `https://arxiv.org/pdf/${arxivId}`
        : undefined;

  const url = arxivId
    ? `https://arxiv.org/abs/${arxivId}`
    : doi
      ? `https://doi.org/${doi}`
      : (work?.primary_location?.landing_page_url ?? `https://openalex.org/${openalexId}`);

  return {
    source,
    queryTag,
    arxivId,
    doi,
    openalexId,
    title,
    authors,
    year,
    primaryCategory: inferCategoryFromOpenAlex(work),
    abstractText,
    citedByCount,
    oaUrl,
    url,
  };
}

async function harvestOpenAlexPages(
  filterExpr: string,
  source: HarvestSourceId,
  queryTag: string,
  maxPages = 15
): Promise<RawHarvestHit[]> {
  const out: RawHarvestHit[] = [];
  const selectFields =
    "id,doi,title,publication_year,cited_by_count,type,ids,locations,primary_location,open_access,authorships,primary_topic,abstract_inverted_index";

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.openalex.org/works?filter=${encodeURIComponent(
      filterExpr
    )}&per-page=200&page=${page}&sort=cited_by_count:desc&select=${selectFields}`;
    const rawText = await fetchWithRetry(url, 800);
    const data = JSON.parse(rawText);
    const results = Array.isArray(data?.results) ? data.results : [];
    for (const w of results) {
      const hit = openAlexWorkToHit(w, source, queryTag);
      if (hit) out.push(hit);
    }
    const totalCount = data?.meta?.count ?? 0;
    console.log(
      `  [${queryTag}] page=${page} got=${results.length} total=${totalCount} accumulated=${out.length}`
    );
    if (results.length < 200 || page * 200 >= totalCount) break;
    await sleep(250);
  }
  return out;
}

async function harvestOpenAlexFulltext(): Promise<RawHarvestHit[]> {
  const cachePath = path.join(HARVEST_DIR, "source-openalex-fulltext.json");
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as RawHarvestHit[];
    console.log(`[2/4 openalex_fulltext] Loaded ${cached.length} hits from ${cachePath}`);
    return cached;
  }

  console.log("[2/4 openalex_fulltext] Harvesting OpenAlex fulltext assumption phrases...");
  const hits: RawHarvestHit[] = [];
  for (const phrase of OPENALEX_FULLTEXT_PHRASES) {
    const filter = `fulltext.search:"${phrase}"`;
    const batch = await harvestOpenAlexPages(
      filter,
      "openalex_fulltext",
      `oa_ft:${phrase}`,
      15
    );
    hits.push(...batch);
  }

  fs.mkdirSync(HARVEST_DIR, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(hits, null, 2));
  console.log(`[2/4 openalex_fulltext] Saved ${hits.length} hits -> ${cachePath}`);
  return hits;
}

async function harvestAnchorCitations(): Promise<RawHarvestHit[]> {
  const cachePath = path.join(HARVEST_DIR, "source-anchor-citations.json");
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as RawHarvestHit[];
    console.log(`[3/4 anchor_citations] Loaded ${cached.length} hits from ${cachePath}`);
    return cached;
  }

  console.log("[3/4 anchor_citations] Harvesting OpenAlex works citing conditional anchors...");
  const citesClause = `cites:${ANCHOR_OPENALEX_IDS.join("|")}`;
  const batchA = await harvestOpenAlexPages(
    `${citesClause},title_and_abstract.search:Riemann|GRH|ERH|Siegel`,
    "anchor_citations",
    "anchors:title_abstract",
    15
  );
  const batchB = await harvestOpenAlexPages(
    `${citesClause},fulltext.search:"assuming GRH"|"assuming the generalized Riemann hypothesis"|"assuming the Riemann hypothesis"|"assuming ERH"|"Extended Riemann Hypothesis"`,
    "anchor_citations",
    "anchors:fulltext",
    15
  );

  const hits = [...batchA, ...batchB];
  fs.mkdirSync(HARVEST_DIR, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(hits, null, 2));
  console.log(`[3/4 anchor_citations] Saved ${hits.length} hits -> ${cachePath}`);
  return hits;
}

function buildCuratedHits(): RawHarvestHit[] {
  const hits: RawHarvestHit[] = [];
  for (const c of curatedClassics) {
    hits.push({
      source: "curated_classics",
      queryTag: `classic:${c.classicId}`,
      arxivId: normalizeArxivId((c as any).arxivId),
      doi: normalizeDoi((c as any).doi),
      title: c.title,
      authors: c.authors,
      year: c.year,
      primaryCategory: c.primaryCategory,
      abstractText: `${c.plainSummary} Quote: ${c.extractedQuote}`,
      citedByCount: 0,
      url: c.url,
      classicMeta: c,
    });
  }
  // Also include any LANDMARK_THEOREMS not already in curatedClassics by title
  for (const lm of LANDMARK_THEOREMS) {
    const arxivMatch = lm.arxivId ?? lm.url.match(/arxiv\.org\/abs\/([^\s?#]+)/i)?.[1];
    const doiMatch = lm.doi ?? lm.url.match(/doi\.org\/([^\s?#]+)/i)?.[1];
    hits.push({
      source: "curated_classics",
      queryTag: `landmark:${lm.id}`,
      arxivId: normalizeArxivId(arxivMatch),
      doi: normalizeDoi(doiMatch),
      title: lm.title,
      authors: lm.authors,
      year: lm.yearNumeric ?? (Number(lm.yearLabel.match(/\d{4}/)?.[0]) || 2020),
      primaryCategory:
        lm.topicBucket === "Cryptography & Security"
          ? "cs.CR"
          : lm.topicBucket === "Algorithms & Complexity"
            ? "cs.CC"
            : lm.topicBucket === "Algebra, Knots & Quantum"
              ? "math.GT"
              : "math.NT",
      abstractText: `${lm.plainSummary ?? ""} Quote: ${lm.extractedQuote}`,
      citedByCount: lm.citedByCount ?? 0,
      url: lm.url,
    });
  }
  return hits;
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\$[^$]*\$/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 140);
}

interface MergedRecord {
  arxivId?: string;
  doi?: string;
  openalexId?: string;
  title: string;
  authors: string;
  year: number;
  primaryCategory: string;
  abstractText: string;
  citedByCount: number;
  foundBySources: Set<HarvestSourceId>;
  queryTags: Set<string>;
  oaUrl?: string;
  url: string;
  classicMeta?: (typeof curatedClassics)[number];
}

function deduplicateHits(allHits: RawHarvestHit[]): MergedRecord[] {
  const records: MergedRecord[] = [];
  const byArxiv = new Map<string, MergedRecord>();
  const byDoi = new Map<string, MergedRecord>();
  const byTitle = new Map<string, MergedRecord[]>();

  for (const h of allHits) {
    const aid = normalizeArxivId(h.arxivId);
    const doi = normalizeDoi(h.doi);
    const tKey = normalizeTitleKey(h.title);
    if (tKey.length < 8) continue;

    let target: MergedRecord | undefined;
    if (aid && byArxiv.has(aid)) target = byArxiv.get(aid);
    if (!target && doi && byDoi.has(doi)) target = byDoi.get(doi);
    if (!target && tKey.length >= 18) {
      const candidates = byTitle.get(tKey) ?? [];
      target = candidates.find((c) => Math.abs(c.year - h.year) <= 5);
    }

    if (!target) {
      target = {
        arxivId: aid,
        doi,
        openalexId: h.openalexId,
        title: h.title,
        authors: h.authors,
        year: h.year,
        primaryCategory: h.primaryCategory,
        abstractText: h.abstractText,
        citedByCount: h.citedByCount,
        foundBySources: new Set([h.source]),
        queryTags: new Set([h.queryTag]),
        oaUrl: h.oaUrl,
        url: h.url,
        classicMeta: h.classicMeta,
      };
      records.push(target);
      if (!byTitle.has(tKey)) byTitle.set(tKey, []);
      byTitle.get(tKey)!.push(target);
    } else {
      target.foundBySources.add(h.source);
      target.queryTags.add(h.queryTag);
      if (!target.arxivId && aid) {
        target.arxivId = aid;
        target.url = `https://arxiv.org/abs/${aid}`;
        if (!target.oaUrl) target.oaUrl = `https://arxiv.org/pdf/${aid}`;
      }
      if (!target.doi && doi) target.doi = doi;
      if (!target.openalexId && h.openalexId) target.openalexId = h.openalexId;
      if (h.citedByCount > target.citedByCount) target.citedByCount = h.citedByCount;
      // Prefer real arXiv abstract over reconstructed or short snippet
      if (
        h.source === "arxiv_abstract" &&
        h.abstractText.length > 80
      ) {
        target.abstractText = h.abstractText;
        target.primaryCategory = h.primaryCategory;
      } else if (h.abstractText.length > target.abstractText.length && target.abstractText.length < 200) {
        target.abstractText = h.abstractText;
      }
      if (target.authors === "Unknown" && h.authors !== "Unknown") {
        target.authors = h.authors;
      }
      if (!target.oaUrl && h.oaUrl) target.oaUrl = h.oaUrl;
      if (!target.classicMeta && h.classicMeta) target.classicMeta = h.classicMeta;
    }

    if (target.arxivId) byArxiv.set(target.arxivId, target);
    if (target.doi) byDoi.set(target.doi, target);
  }

  return records;
}

async function hydrateMissingCitations(records: MergedRecord[]): Promise<void> {
  const cachePath = path.join(HARVEST_DIR, "openalex-citation-hydration.json");
  const hydrationCache: Record<string, { citedByCount: number; openalexId?: string; doi?: string; oaUrl?: string }> =
    fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};

  // First hydrate by DOI where citedByCount == 0
  const missingDois = records
    .filter((r) => r.doi && r.citedByCount === 0 && !( `doi:${r.doi}` in hydrationCache ))
    .map((r) => r.doi!);

  console.log(`[Hydrate] Looking up ${missingDois.length} DOIs in OpenAlex...`);
  for (let i = 0; i < missingDois.length; i += 40) {
    const chunk = missingDois.slice(i, i + 40);
    const filter = `doi:${chunk.map((d) => `https://doi.org/${d}`).join("|")}`;
    const url = `https://api.openalex.org/works?filter=${encodeURIComponent(
      filter
    )}&per-page=200&select=id,doi,cited_by_count,open_access`;
    try {
      const text = await fetchWithRetry(url, 800);
      const data = JSON.parse(text);
      for (const w of data?.results ?? []) {
        const d = normalizeDoi(w?.doi);
        if (d) {
          hydrationCache[`doi:${d}`] = {
            citedByCount: Number(w?.cited_by_count) || 0,
            openalexId: String(w?.id ?? "").replace("https://openalex.org/", ""),
            oaUrl: w?.open_access?.oa_url ?? undefined,
          };
        }
      }
      for (const d of chunk) {
        if (!(`doi:${d}` in hydrationCache)) hydrationCache[`doi:${d}`] = { citedByCount: 0 };
      }
    } catch (e) {
      console.warn(`  DOI hydration batch error: ${(e as Error).message}`);
    }
    await sleep(200);
  }

  // Next hydrate by arXiv DOI (`10.48550/arXiv.<id>`) where citedByCount == 0
  const missingArxiv = records
    .filter((r) => r.arxivId && r.citedByCount === 0 && !(`arxiv:${r.arxivId}` in hydrationCache))
    .map((r) => r.arxivId!);

  console.log(`[Hydrate] Looking up ${missingArxiv.length} arXiv IDs in OpenAlex...`);
  for (let i = 0; i < missingArxiv.length; i += 40) {
    const chunk = missingArxiv.slice(i, i + 40);
    const filter = `doi:${chunk.map((a) => `https://doi.org/10.48550/arxiv.${a}`).join("|")}`;
    const url = `https://api.openalex.org/works?filter=${encodeURIComponent(
      filter
    )}&per-page=200&select=id,doi,cited_by_count,open_access,locations`;
    try {
      const text = await fetchWithRetry(url, 800);
      const data = JSON.parse(text);
      for (const w of data?.results ?? []) {
        const aid = extractArxivFromOpenAlexWork(w);
        if (aid) {
          const prev = hydrationCache[`arxiv:${aid}`]?.citedByCount ?? 0;
          const next = Number(w?.cited_by_count) || 0;
          if (next >= prev) {
            hydrationCache[`arxiv:${aid}`] = {
              citedByCount: next,
              openalexId: String(w?.id ?? "").replace("https://openalex.org/", ""),
              oaUrl: w?.open_access?.oa_url ?? undefined,
            };
          }
        }
      }
      for (const a of chunk) {
        if (!(`arxiv:${a}` in hydrationCache)) hydrationCache[`arxiv:${a}`] = { citedByCount: 0 };
      }
    } catch (e) {
      console.warn(`  arXiv hydration batch error: ${(e as Error).message}`);
    }
    await sleep(200);
  }

  fs.writeFileSync(cachePath, JSON.stringify(hydrationCache, null, 2));

  for (const r of records) {
    if (r.doi && hydrationCache[`doi:${r.doi}`]) {
      const h = hydrationCache[`doi:${r.doi}`];
      if (h.citedByCount > r.citedByCount) r.citedByCount = h.citedByCount;
      if (!r.openalexId && h.openalexId) r.openalexId = h.openalexId;
      if (!r.oaUrl && h.oaUrl) r.oaUrl = h.oaUrl;
    }
    if (r.arxivId && hydrationCache[`arxiv:${r.arxivId}`]) {
      const h = hydrationCache[`arxiv:${r.arxivId}`];
      if (h.citedByCount > r.citedByCount) r.citedByCount = h.citedByCount;
      if (!r.openalexId && h.openalexId) r.openalexId = h.openalexId;
      if (!r.oaUrl && h.oaUrl) r.oaUrl = h.oaUrl;
    }
  }
}

async function main() {
  fs.mkdirSync(HARVEST_DIR, { recursive: true });

  const arxivHits = await harvestArxivUncapped();
  const oaFulltextHits = await harvestOpenAlexFulltext();
  const anchorHits = await harvestAnchorCitations();
  const curatedHits = buildCuratedHits();

  const allHits = [...curatedHits, ...arxivHits, ...oaFulltextHits, ...anchorHits];
  console.log(`\n[Merge] Deduplicating ${allHits.length} raw hits across 4 sources...`);
  const merged = deduplicateHits(allHits);
  console.log(`[Merge] ${merged.length} unique deduplicated works.`);

  await hydrateMissingCitations(merged);

  // Build Attempt-1 lookup sets (144 arXiv + 16 Attempt-1 landmarks)
  const attempt1ArxivSet = new Set(
    (attempt1Raw as any[]).map((x) => normalizeArxivId(x.arxivId)).filter(Boolean)
  );
  const attempt1TitleKeys = new Set<string>();
  for (const x of attempt1Raw as any[]) attempt1TitleKeys.add(normalizeTitleKey(x.title));
  for (const lm of LANDMARK_THEOREMS.filter((t) => t.id !== "P17")) {
    attempt1TitleKeys.add(normalizeTitleKey(lm.title));
  }

  const landmarkByTitle = new Map<string, string>();
  const landmarkByArxiv = new Map<string, string>();
  const landmarkByDoi = new Map<string, string>();
  for (const lm of LANDMARK_THEOREMS) {
    landmarkByTitle.set(normalizeTitleKey(lm.title), lm.id);
    const a = normalizeArxivId(lm.arxivId ?? lm.url.match(/arxiv\.org\/abs\/([^\s?#]+)/i)?.[1]);
    if (a) landmarkByArxiv.set(a, lm.id);
    const d = normalizeDoi(lm.doi ?? lm.url.match(/doi\.org\/([^\s?#]+)/i)?.[1]);
    if (d) landmarkByDoi.set(d, lm.id);
  }

  // Sort by citedByCount desc, then classic/landmark status, then year desc
  merged.sort((a, b) => {
    if (b.citedByCount !== a.citedByCount) return b.citedByCount - a.citedByCount;
    const aNamed = a.classicMeta ? 1 : 0;
    const bNamed = b.classicMeta ? 1 : 0;
    if (bNamed !== aNamed) return bNamed - aNamed;
    return b.year - a.year;
  });

  const pool: PoolRawEntry[] = merged.map((r, idx) => {
    const rank = idx + 1;
    const tier: PoolRawEntry["importanceTier"] =
      rank <= 100 ? "TOP_100" : rank <= 500 ? "TOP_500" : "TAIL";

    const tKey = normalizeTitleKey(r.title);
    const lmId =
      (r.arxivId ? landmarkByArxiv.get(r.arxivId) : undefined) ??
      (r.doi ? landmarkByDoi.get(r.doi) : undefined) ??
      landmarkByTitle.get(tKey);

    const inAttempt1 =
      Boolean(r.arxivId && attempt1ArxivSet.has(r.arxivId)) ||
      (lmId !== undefined && lmId !== "P17") ||
      attempt1TitleKeys.has(tKey);

    const poolId = lmId
      ? lmId
      : r.arxivId
        ? `AX-${r.arxivId.replace(/[^a-z0-9]/gi, "")}`
        : r.openalexId
          ? `OA-${r.openalexId}`
          : `CL-${String(rank).padStart(4, "0")}`;

    return {
      poolId,
      arxivId: r.arxivId,
      doi: r.doi,
      openalexId: r.openalexId,
      title: r.title,
      authors: r.authors,
      year: r.year,
      primaryCategory: r.primaryCategory,
      abstractText: r.abstractText,
      citedByCount: r.citedByCount,
      importanceRank: rank,
      importanceTier: tier,
      foundBySources: [...r.foundBySources],
      queryTags: [...r.queryTags],
      oaUrl: r.oaUrl,
      url: r.url,
      inAttempt1Corpus: inAttempt1,
      isNamedLandmark: Boolean(lmId || r.classicMeta),
      landmarkId: lmId,
      classicMeta: r.classicMeta,
    };
  });

  fs.writeFileSync(OUT_POOL_PATH, JSON.stringify(pool, null, 2));
  console.log(`[Pool] Wrote ${pool.length} deduplicated ranked entries -> ${OUT_POOL_PATH}`);

  // Compute coverage report numbers
  const sources: HarvestSourceId[] = [
    "arxiv_abstract",
    "openalex_fulltext",
    "anchor_citations",
    "curated_classics",
  ];
  const perSourceUnique: Record<HarvestSourceId, number> = {
    arxiv_abstract: 0,
    openalex_fulltext: 0,
    anchor_citations: 0,
    curated_classics: 0,
  };
  const perSourceExclusive: Record<HarvestSourceId, number> = {
    arxiv_abstract: 0,
    openalex_fulltext: 0,
    anchor_citations: 0,
    curated_classics: 0,
  };
  for (const p of pool) {
    for (const s of p.foundBySources) perSourceUnique[s] += 1;
    if (p.foundBySources.length === 1) perSourceExclusive[p.foundBySources[0]] += 1;
  }

  const top100 = pool.filter((p) => p.importanceTier === "TOP_100");
  const top500 = pool.filter((p) => p.importanceRank <= 500);
  const top100InAttempt1 = top100.filter((p) => p.inAttempt1Corpus).length;
  const top500InAttempt1 = top500.filter((p) => p.inAttempt1Corpus).length;
  const withArxiv = pool.filter((p) => Boolean(p.arxivId)).length;
  const withOa = pool.filter((p) => Boolean(p.arxivId || p.oaUrl)).length;
  const silentAbstractCount = pool.filter(
    (p) =>
      p.foundBySources.includes("openalex_fulltext") &&
      !p.foundBySources.includes("arxiv_abstract")
  ).length;

  const lines: string[] = [
    "# Pool Coverage Report (Attempt 2 Harvest)",
    "",
    "- **Harvest date (UTC):** 2026-11-24",
    `- **Total deduplicated works in pool:** **${pool.length.toLocaleString()}**`,
    `- **Works with arXiv IDs (e-print / HTML retrievable):** ${withArxiv.toLocaleString()} (${((100 * withArxiv) / pool.length).toFixed(1)}%)`,
    `- **Works with open-access URL or arXiv ID:** ${withOa.toLocaleString()} (${((100 * withOa) / pool.length).toFixed(1)}%)`,
    `- **Works surfaced via OpenAlex full-text search that were absent from arXiv abstract harvest:** ${silentAbstractCount.toLocaleString()}`,
    "",
    "## Old 160-Paper Corpus vs. Citation-Ranked Pool",
    "",
    `- **Top 100 most-cited works captured in Attempt 1 (160-paper corpus):** **${top100InAttempt1} / 100** (missed **${100 - top100InAttempt1} / 100**)`,
    `- **Top 500 most-cited works captured in Attempt 1 (160-paper corpus):** **${top500InAttempt1} / ${top500.length}** (missed **${top500.length - top500InAttempt1} / ${top500.length}**)`,
    "",
    "## Per-Source Contribution & Overlap",
    "",
    "| Source | Deduplicated Works Found | Exclusive to This Source | Share of Pool |",
    "| --- | ---: | ---: | ---: |",
    ...sources.map(
      (s) =>
        `| \`${s}\` | ${perSourceUnique[s].toLocaleString()} | ${perSourceExclusive[s].toLocaleString()} | ${((100 * perSourceUnique[s]) / pool.length).toFixed(1)}% |`
    ),
    "",
    "## Top 25 Most-Cited Works in the Pool",
    "",
    "| Rank | Citations | Year | Authors | Title | Sources | In Attempt 1? |",
    "| ---: | ---: | ---: | --- | --- | --- | :---: |",
    ...pool.slice(0, 25).map(
      (p) =>
        `| ${p.importanceRank} | ${p.citedByCount.toLocaleString()} | ${p.year} | ${p.authors.replace(/\|/g, "/")} | ${p.title.replace(/\|/g, "/").slice(0, 85)} | ${p.foundBySources.join(", ")} | ${p.inAttempt1Corpus ? "Yes" : "No"} |`
    ),
    "",
    "## Known Harvest Limits",
    "",
    "- OpenAlex citation counts run lower in pure mathematics than in computer science and vary across preprint vs. journal editions (merged where titles/DOIs match).",
    "- Only English-language indexed works matching explicit RH/GRH/ERH/Siegel-zero phrases or citing the 9 anchor papers enter the pool.",
    "",
  ];

  const reportMd = lines.join("\n");
  fs.writeFileSync(OUT_COV_PATH, reportMd);
  fs.writeFileSync(RES_COV_PATH, reportMd);
  console.log(`[Coverage] Wrote ${OUT_COV_PATH} and ${RES_COV_PATH}`);
  console.log(
    `[Summary] Pool=${pool.length}, Top100 in Attempt1=${top100InAttempt1}/100, Top500 in Attempt1=${top500InAttempt1}/${top500.length}`
  );
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
