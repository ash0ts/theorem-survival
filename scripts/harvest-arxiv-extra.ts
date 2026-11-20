/**
 * Supplements `out/arxiv-raw.json` with additional Cryptography (`cs.CR`),
 * Algorithms (`cs.DS` / `cs.CC`), and Combinatorics (`math.CO`) conditional papers.
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

const EXTRA_QUERIES = [
  {
    label: "crypto-grh",
    searchQuery: 'cat:cs.CR AND (abs:"Riemann" OR abs:"GRH" OR abs:"ERH")',
    maxResults: 45,
  },
  {
    label: "algo-grh",
    searchQuery: '(cat:cs.DS OR cat:cs.CC) AND (abs:"Riemann" OR abs:"GRH" OR abs:"ERH")',
    maxResults: 45,
  },
  {
    label: "combo-rh",
    searchQuery: '(cat:math.CO OR cat:math.GT) AND (abs:"Riemann" OR abs:"GRH" OR abs:"ERH")',
    maxResults: 35,
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

const CONDITIONAL_SIGNAL =
  /assuming|conditional|under (?:the )?(?:generalized |generalised |extended )?(?:riemann|grh|erh|rh)|modulo (?:the )?(?:grh|erh|rh)|if (?:the )?(?:generalized )?riemann|subject to|relies on|rely on|on the (?:generalized |extended )?riemann|depend(?:s|ing)? on (?:the )?(?:grh|erh|riemann)/i;

const EXCLUDE_NOISE =
  /we prove the riemann hypothesis|proof of the riemann hypothesis|disproof of the riemann hypothesis|math\.GM/i;

async function main() {
  const rawPath = path.resolve(import.meta.dirname, "../out/arxiv-raw.json");
  const existing: RawArxivEntry[] = JSON.parse(fs.readFileSync(rawPath, "utf8")).filter(
    (x: RawArxivEntry) => x.primaryCategory !== "math.GM",
  );
  const byId = new Map<string, RawArxivEntry>(existing.map((e) => [e.arxivId, e]));

  for (const q of EXTRA_QUERIES) {
    const apiUrl = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q.searchQuery)}&start=0&max_results=${q.maxResults}&sortBy=relevance&sortOrder=descending`;
    console.log(`Fetching [${q.label}]...`);
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "TheoremSurvival/0.2 (academic-dependency-explorer)" },
    });
    if (!res.ok) continue;
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];
    let kept = 0;
    for (const m of entries) {
      const block = m[1];
      const rawIdUrl = extractTag(block, "id");
      const idMatch = rawIdUrl.match(/arxiv\.org\/abs\/([^v?\s]+)(?:v\d+)?$/i);
      if (!idMatch) continue;
      const arxivId = idMatch[1];
      const title = decodeXmlEntities(extractTag(block, "title"));
      const abstract = decodeXmlEntities(extractTag(block, "summary"));
      const published = extractTag(block, "published").slice(0, 10);
      const year = Number(published.slice(0, 4)) || 2024;
      const authorNames = [...block.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gi)].map((a) =>
        decodeXmlEntities(a[1].replace(/\s+/g, " ").trim()),
      );
      const primaryMatch = block.match(/<arxiv:primary_category[^>]*term="([^"]+)"/i);
      const allCats = [...block.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((c) => c[1]);
      const primaryCategory = primaryMatch?.[1] ?? allCats[0] ?? "cs.CC";

      const combined = `${title} ${abstract}`;
      if (!CONDITIONAL_SIGNAL.test(combined)) continue;
      if (EXCLUDE_NOISE.test(combined) || primaryCategory === "math.GM") continue;
      if (!byId.has(arxivId)) {
        byId.set(arxivId, {
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
          matchedQuery: q.label,
        });
        kept++;
      }
    }
    console.log(`  newly_kept=${kept}, total_unique=${byId.size}`);
    await new Promise((r) => setTimeout(r, 2200));
  }

  const list = [...byId.values()].sort((a, b) => b.published.localeCompare(a.published));
  fs.writeFileSync(rawPath, JSON.stringify(list, null, 2));
  const byCat: Record<string, number> = {};
  for (const item of list) {
    byCat[item.primaryCategory] = (byCat[item.primaryCategory] ?? 0) + 1;
  }
  console.log(`\nTotal clean arXiv candidates: ${list.length}`);
  console.log("By category:", byCat);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
