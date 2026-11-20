/**
 * Harvests real conditional RH / GRH / ERH / Siegel-zero papers from the official arXiv API,
 * deduplicates against our landmark set, and saves raw metadata to `out/arxiv-raw.json`
 * for classification and plain-English translation on CoreWeave Forge Serverless Inference.
 */
import fs from "node:fs";
import path from "node:path";

interface RawArxivEntry {
  arxivId: string;
  title: string;
  authors: string;
  published: string;
  year: number;
  primaryCategory: string;
  categories: string[];
  abstract: string;
  url: string;
  matchedQuery: string;
}

const QUERIES: Array<{ label: string; searchQuery: string; maxResults: number; sortBy?: string }> = [
  {
    label: "title-rh-recent",
    searchQuery: 'ti:"Riemann hypothesis"',
    maxResults: 45,
    sortBy: "submittedDate",
  },
  {
    label: "cs-grh",
    searchQuery:
      '(abs:"Generalized Riemann Hypothesis" OR abs:"generalized Riemann hypothesis" OR abs:"assuming GRH" OR abs:"modulo GRH" OR abs:"under GRH") AND (cat:cs.CC OR cat:cs.CR OR cat:cs.DS OR cat:quant-ph)',
    maxResults: 55,
    sortBy: "relevance",
  },
  {
    label: "math-assuming-rh",
    searchQuery:
      '(abs:"Assuming the Riemann hypothesis" OR abs:"assuming the Riemann hypothesis" OR abs:"under the Riemann hypothesis" OR abs:"conditional on the Riemann hypothesis") AND cat:math.NT',
    maxResults: 50,
    sortBy: "submittedDate",
  },
  {
    label: "erh-dedekind",
    searchQuery:
      'abs:"Extended Riemann Hypothesis" OR abs:"extended Riemann hypothesis" OR (abs:"Dedekind zeta" AND abs:"Riemann hypothesis")',
    maxResults: 35,
    sortBy: "relevance",
  },
  {
    label: "siegel-zeros-negated",
    searchQuery:
      '(ti:"Siegel zero" OR ti:"Siegel zeros" OR ti:"Deuring-Heilbronn" OR abs:"if the Riemann hypothesis is false" OR abs:"Siegel zeros") AND cat:math.NT',
    maxResults: 30,
    sortBy: "relevance",
  },
  {
    label: "topology-combinatorics-grh",
    searchQuery:
      '(abs:"generalized Riemann hypothesis" OR abs:"Generalized Riemann Hypothesis" OR abs:"assuming GRH") AND (cat:math.GT OR cat:math.CO OR cat:math.AG OR cat:math.GR)',
    maxResults: 30,
    sortBy: "relevance",
  },
];

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseAtomEntries(xml: string, label: string): RawArxivEntry[] {
  const out: RawArxivEntry[] = [];
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];
  for (const match of entries) {
    const block = match[1];
    const rawIdUrl = extractTag(block, "id");
    const idMatch = rawIdUrl.match(/arxiv\.org\/abs\/([^v?\s]+)(?:v\d+)?$/i);
    if (!idMatch) continue;
    const arxivId = idMatch[1];
    const title = decodeXmlEntities(extractTag(block, "title"));
    const abstract = decodeXmlEntities(extractTag(block, "summary"));
    const published = extractTag(block, "published").slice(0, 10);
    const year = Number(published.slice(0, 4)) || 2024;
    const authorNames = [...block.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gi)].map((m) =>
      decodeXmlEntities(m[1].replace(/\s+/g, " ").trim()),
    );
    const primaryMatch = block.match(/<arxiv:primary_category[^>]*term="([^"]+)"/i);
    const allCats = [...block.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((m) => m[1]);
    const primaryCategory = primaryMatch?.[1] ?? allCats[0] ?? "math.NT";

    if (!title || !abstract) continue;
    out.push({
      arxivId,
      title,
      authors:
        authorNames.length > 3
          ? `${authorNames.slice(0, 3).join(", ")} et al.`
          : authorNames.join(", "),
      published,
      year,
      primaryCategory,
      categories: allCats,
      abstract,
      url: `https://arxiv.org/abs/${arxivId}`,
      matchedQuery: label,
    });
  }
  return out;
}

const CONDITIONAL_SIGNAL =
  /assuming|conditional on|under the (?:generalized |generalised |extended )?riemann|modulo (?:the )?(?:grh|erh|rh)|if the (?:generalized )?riemann hypothesis|equivalent to the riemann hypothesis|siegel zero|deuring-heilbronn|subject to (?:the )?(?:grh|rh|erh)|on the (?:generalized )?riemann hypothesis/i;

// Exclude heuristic claims of proving RH itself or unrelated physics analogies unless genuinely conditional
const EXCLUDE_NOISE =
  /we prove the riemann hypothesis|proof of the riemann hypothesis|disproof of the riemann hypothesis|quantum hamiltonian for the riemann/i;

async function main() {
  const byId = new Map<string, RawArxivEntry>();

  for (const q of QUERIES) {
    const sortBy = q.sortBy ?? "relevance";
    const apiUrl = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q.searchQuery)}&start=0&max_results=${q.maxResults}&sortBy=${sortBy}&sortOrder=descending`;
    console.log(`Fetching [${q.label}] (max=${q.maxResults})...`);
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "TheoremSurvival/0.2 (academic-dependency-explorer)" },
    });
    if (!res.ok) {
      console.warn(`  HTTP ${res.status} on ${q.label}`);
      continue;
    }
    const xml = await res.text();
    const parsed = parseAtomEntries(xml, q.label);
    let kept = 0;
    for (const item of parsed) {
      const combined = `${item.title} ${item.abstract}`;
      if (!CONDITIONAL_SIGNAL.test(combined)) continue;
      if (EXCLUDE_NOISE.test(combined)) continue;
      if (!byId.has(item.arxivId)) {
        byId.set(item.arxivId, item);
        kept++;
      }
    }
    console.log(`  parsed=${parsed.length}, newly_kept=${kept}, total_unique=${byId.size}`);
    // Polite pause between arXiv API requests
    await new Promise((r) => setTimeout(r, 2200));
  }

  const outDir = path.resolve(import.meta.dirname, "../out");
  fs.mkdirSync(outDir, { recursive: true });
  const list = [...byId.values()].sort((a, b) => b.published.localeCompare(a.published));
  fs.writeFileSync(path.join(outDir, "arxiv-raw.json"), JSON.stringify(list, null, 2));

  const byCat: Record<string, number> = {};
  for (const item of list) {
    byCat[item.primaryCategory] = (byCat[item.primaryCategory] ?? 0) + 1;
  }
  console.log(`\nSaved ${list.length} real conditional arXiv papers -> out/arxiv-raw.json`);
  console.log("Category breakdown:", byCat);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
