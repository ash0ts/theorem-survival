/**
 * Full-text retrieval, local disk caching, and section/line-located window
 * extraction for Theorem Survival (Attempt 2).
 *
 * Isolation invariant: This module MUST NOT import gold sets or landmark tables.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

export interface LocatedWindow {
  locator: string;
  kind: "theorem_or_intro" | "scope_disambiguator" | "mention_context" | "bibliography";
  excerpt: string;
}

export interface FullTextDocument {
  cacheKey: string;
  status: "ok" | "unavailable";
  format: "arxiv_tex" | "arxiv_html" | "pdf_text" | "oa_html" | "none";
  sourceUrl: string;
  charCount: number;
  windows: LocatedWindow[];
  bibliographyMatches: string[];
  errorReason?: string;
}

const ROOT_DIR = process.cwd();
const FT_CACHE_DIR = path.join(ROOT_DIR, "out", "fulltext");
const FT_RAW_DIR = path.join(FT_CACHE_DIR, "raw");
const BIN_DIR = path.join(ROOT_DIR, "out", "bin");
const PDF_BIN = path.join(BIN_DIR, "pdf2txt");
const USER_AGENT = "TheoremSurvivalResearch/2.0 (https://github.com/ash0ts/theorem-survival)";

let nextArxivSlotAt = 0;
let activeArxivInFlight = 0;
const ARXIV_MAX_CONCURRENT = 2;
const ARXIV_SLOT_GAP_MS = 550; // 2 workers => >= 1,100ms spacing per worker
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function makeCacheKey(input: { arxivId?: string; doi?: string; poolId?: string }): string {
  const raw = input.arxivId
    ? `arxiv_${input.arxivId}`
    : input.doi
      ? `doi_${input.doi}`
      : input.poolId ?? "unknown";
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").slice(0, 120);
}

function ensurePdfHelper(): string | null {
  if (fs.existsSync(PDF_BIN)) return PDF_BIN;
  if (process.platform !== "darwin") return null;
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    const swiftSrc = path.join(BIN_DIR, "pdf2txt.swift");
    fs.writeFileSync(
      swiftSrc,
      [
        "import Foundation",
        "import PDFKit",
        "let args = CommandLine.arguments",
        "guard args.count > 1 else { exit(1) }",
        "let url = URL(fileURLWithPath: args[1])",
        "guard let doc = PDFDocument(url: url) else { exit(2) }",
        "let maxPages = min(doc.pageCount, 80)",
        "for i in 0..<maxPages {",
        "  if let page = doc.page(at: i), let txt = page.string {",
        '    print("\\n=== [PDF Page \\(i + 1)] ===")',
        "    print(txt)",
        "  }",
        "}",
      ].join("\n")
    );
    execFileSync("swiftc", ["-O", swiftSrc, "-o", PDF_BIN], { stdio: "ignore", timeout: 45_000 });
    return PDF_BIN;
  } catch {
    return null;
  }
}

function extractPdfBufferToText(buf: Buffer, cacheKey: string): string {
  const helper = ensurePdfHelper();
  if (!helper) return "";
  fs.mkdirSync(FT_RAW_DIR, { recursive: true });
  const tmpPdf = path.join(FT_RAW_DIR, `${cacheKey}.tmp.pdf`);
  try {
    fs.writeFileSync(tmpPdf, buf);
    const out = execFileSync(helper, [tmpPdf], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 20_000,
    });
    return out;
  } catch {
    return "";
  } finally {
    try {
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    } catch {
      // ignore
    }
  }
}

interface UnpackedTexFile {
  name: string;
  content: string;
}

function scrubEmailsFast(s: string): string {
  if (!s.includes("@")) return s;
  return s.replace(
    /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,64}(?:\.[A-Za-z0-9-]{1,63})+\b/g,
    "[email]",
  );
}

function parseTarBuffer(tar: Buffer): UnpackedTexFile[] {
  const files: UnpackedTexFile[] = [];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;

    const sizeOctal = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
    if (sizeOctal && !/^[0-7]+$/.test(sizeOctal)) {
      return [];
    }
    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "").trim();
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "").trim();
    const fullName = prefix ? `${prefix}/${rawName}` : rawName;
    const typeFlag = header[156];
    const size = parseInt(sizeOctal, 8) || 0;

    const dataStart = offset + 512;
    const dataEnd = Math.min(tar.length, dataStart + size);
    if (
      (typeFlag === 0 || typeFlag === 48) &&
      size > 0 &&
      size < 3 * 1024 * 1024 &&
      /\.(tex|bbl|ltx)$/i.test(fullName)
    ) {
      files.push({
        name: path.basename(fullName),
        content: tar.subarray(dataStart, dataEnd).toString("utf8"),
      });
    }
    const blocks = Math.ceil(size / 512);
    offset = dataStart + blocks * 512;
  }
  return files;
}

function cleanTexSource(files: UnpackedTexFile[]): string {
  const sorted = [...files].sort((a, b) => {
    const aBbl = a.name.endsWith(".bbl") ? 1 : 0;
    const bBbl = b.name.endsWith(".bbl") ? 1 : 0;
    if (aBbl !== bBbl) return aBbl - bBbl;
    const aMain = /^(main|paper|article|ms)\./i.test(a.name) ? -1 : 0;
    const bMain = /^(main|paper|article|ms)\./i.test(a.name) ? -1 : 0;
    if (aMain !== bMain) return aMain - bMain;
    return b.content.length - a.content.length;
  });

  const chunks: string[] = [];
  let totalChars = 0;
  for (const f of sorted) {
    if (totalChars > 350_000 && !f.name.endsWith(".bbl")) continue;
    const lines = f.content.split(/\r?\n/);
    const kept: string[] = [];
    let currentSection = "Preamble";
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      if (!rawLine || rawLine.length > 4000) continue;
      const pctIdx = rawLine.indexOf("%");
      const noComment =
        pctIdx === 0
          ? ""
          : pctIdx > 0 && rawLine[pctIdx - 1] !== "\\"
            ? rawLine.slice(0, pctIdx)
            : rawLine;
      const line = scrubEmailsFast(noComment.replace(/\\email\{[^}]{0,120}\}/gi, "")).trim();
      if (!line) continue;
      const secMatch = line.includes("section")
        ? line.match(/\\(?:sub)*section\*?\{([^}]{1,90})\}/)
        : null;
      if (secMatch) {
        currentSection = secMatch[1].replace(/\s+/g, " ").trim();
        kept.push(`\n=== [${f.name} :: §${currentSection} :: L${i + 1}] ===`);
      }
      const thmMatch = line.includes("\\begin{")
        ? line.match(
            /\\begin\{(theorem|corollary|proposition|lemma|conjecture|assumption|remark)\}/i,
          )
        : null;
      if (thmMatch) {
        kept.push(`[${f.name} :: §${currentSection} :: L${i + 1} (${thmMatch[1]})]`);
      }
      kept.push(line);
    }
    const joined = `=== [FILE ${f.name}] ===\n${kept.join("\n")}`;
    chunks.push(joined);
    totalChars += joined.length;
  }
  return chunks.join("\n\n");
}

function stripHtmlToText(rawHtml: string): string {
  const html = rawHtml.length > 800_000 ? rawHtml.slice(0, 800_000) : rawHtml;
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi, "\n=== [HTML Heading: $2] ===\n")
    .replace(/<\/(p|div|section|article|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HYPOTHESIS_RE =
  /\b(Riemm?ann(?:'s)?\s+[Hh]ypothesis|Generalized\s+Riemm?ann|Generalised\s+Riemm?ann|Extended\s+Riemm?ann|\bGRH\b|\bERH\b|\bRH\b|G\.R\.H\.|E\.R\.H\.|R\.H\.|Siegel\s+zero|Landau[-–]Siegel|Grand\s+Simplicity)\b/gi;

const DISAMBIG_RE =
  /\b(Dedekind\s+zeta|Hecke\s+(?:L-function|character)|Chebotarev|automorphic\s+L-function|Artin\s+L-function|Artin(?:'s)?\s+conjecture|Lagarias|Odlyzko|Weinberger|Hooley|Dirichlet\s+L-function|Dirichlet\s+character|ideal\s+class\s+group|Koiran|quadratic\s+twist|Rankin[-–]Selberg)\b/gi;

const BIB_ANCHOR_RE =
  /\b(Lagarias|Odlyzko|Weinberger|Hooley|Bach|Miller|Ankeny|Schoenfeld|Heath[-–]Brown|Koiran|Rubinstein|Sarnak|Lamzouri|Helfgott|Lackenby)\b/i;

function nearestLocator(text: string, index: number): string {
  const before = text.slice(Math.max(0, index - 8000), index);
  const matches = [...before.matchAll(/===\s*\[([^\]]+)\]\s*===/g)];
  if (matches.length > 0) {
    return matches[matches.length - 1][1];
  }
  const approxLine = text.slice(0, index).split("\n").length;
  return `line ~${approxLine}`;
}

export function extractLocatedWindows(rawFullText: string, maxWindows = 12): {
  windows: LocatedWindow[];
  bibliographyMatches: string[];
} {
  if (!rawFullText || rawFullText.length < 200) {
    return { windows: [], bibliographyMatches: [] };
  }
  const fullText =
    rawFullText.length > 300_000
      ? `${rawFullText.slice(0, 220_000)}\n\n${rawFullText.slice(-80_000)}`
      : rawFullText;

  const rawSpans: {
    start: number;
    end: number;
    kind: LocatedWindow["kind"];
    priority: number;
  }[] = [];

  for (const m of fullText.matchAll(HYPOTHESIS_RE)) {
    const idx = m.index ?? 0;
    const start = Math.max(0, idx - 320);
    const end = Math.min(fullText.length, idx + 460);
    const slice = fullText.slice(start, end);
    const isThm = /\b(theorem|corollary|proposition|main result|assume|assuming|conditional|under)\b/i.test(
      slice
    );
    const hasScope = DISAMBIG_RE.test(slice);
    DISAMBIG_RE.lastIndex = 0;
    rawSpans.push({
      start,
      end,
      kind: hasScope ? "scope_disambiguator" : isThm ? "theorem_or_intro" : "mention_context",
      priority: (hasScope ? 4 : 0) + (isThm ? 3 : 1),
    });
  }

  for (const m of fullText.matchAll(DISAMBIG_RE)) {
    const idx = m.index ?? 0;
    const start = Math.max(0, idx - 260);
    const end = Math.min(fullText.length, idx + 420);
    rawSpans.push({
      start,
      end,
      kind: "scope_disambiguator",
      priority: 3,
    });
  }

  // Merge overlapping spans within 180 chars
  rawSpans.sort((a, b) => a.start - b.start);
  const merged: typeof rawSpans = [];
  for (const sp of rawSpans) {
    const prev = merged[merged.length - 1];
    if (prev && sp.start <= prev.end + 120 && prev.end - prev.start < 1200) {
      prev.end = Math.max(prev.end, sp.end);
      prev.priority = Math.max(prev.priority, sp.priority);
      if (sp.kind === "scope_disambiguator") prev.kind = "scope_disambiguator";
    } else {
      merged.push({ ...sp });
    }
  }

  // Rank by priority desc, then earlier appearance in paper
  merged.sort((a, b) => b.priority - a.priority || a.start - b.start);
  const chosen = merged.slice(0, maxWindows).sort((a, b) => a.start - b.start);

  const windows: LocatedWindow[] = chosen.map((c) => ({
    locator: nearestLocator(fullText, c.start),
    kind: c.kind,
    excerpt: scrubEmailsFast(fullText.slice(c.start, c.end))
      .replace(/\s+/g, " ")
      .trim(),
  }));

  if (windows.length === 0 && fullText.length >= 600) {
    windows.push({
      locator: nearestLocator(fullText, Math.min(400, fullText.length - 1)),
      kind: "theorem_or_intro",
      excerpt: scrubEmailsFast(fullText.slice(0, 1400))
        .replace(/\s+/g, " ")
        .trim(),
    });
  }

  // Also extract matching bibliography items (\bibitem or References lines) without backtracking
  const bibMatches: string[] = [];
  const bibParts = fullText.includes("\\bibitem") ? fullText.split("\\bibitem") : [];
  for (let bi = 1; bi < bibParts.length && bibMatches.length < 8; bi++) {
    const chunk = bibParts[bi].slice(0, 420).replace(/\s+/g, " ").trim();
    const keyMatch = chunk.match(/^(?:\[[^\]]{0,40}\])?\{([^}]{1,60})\}\s*(.*)$/);
    const formatted = keyMatch ? `[${keyMatch[1]}] ${keyMatch[2]}` : chunk;
    if (BIB_ANCHOR_RE.test(formatted)) {
      bibMatches.push(formatted.slice(0, 280));
    }
  }
  if (bibMatches.length === 0) {
    const tail = fullText.slice(Math.max(0, fullText.length - 25_000));
    for (const line of tail.split("\n")) {
      const trimmed = line.trim();
      if (
        trimmed.length >= 35 &&
        trimmed.length <= 300 &&
        BIB_ANCHOR_RE.test(trimmed) &&
        /\b(19\d\d|20\d\d)\b/.test(trimmed)
      ) {
        bibMatches.push(trimmed);
        if (bibMatches.length >= 8) break;
      }
    }
  }

  return { windows, bibliographyMatches: bibMatches };
}

async function politeArxivFetch(url: string): Promise<Response> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    while (activeArxivInFlight >= ARXIV_MAX_CONCURRENT) {
      await sleep(100);
    }
    activeArxivInFlight++;
    try {
      const now = Date.now();
      const scheduledAt = Math.max(now, nextArxivSlotAt);
      nextArxivSlotAt = scheduledAt + ARXIV_SLOT_GAP_MS;
      if (scheduledAt > now) {
        await sleep(scheduledAt - now);
      }
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(22_000),
      });
      if ((res.status === 429 || res.status === 503) && attempt < 3) {
        nextArxivSlotAt = Math.max(nextArxivSlotAt, Date.now() + 3500 * attempt);
        continue;
      }
      return res;
    } finally {
      activeArxivInFlight--;
    }
  }
  throw new Error("Exhausted arXiv fetch retries");
}

async function readBoundedBuffer(res: Response): Promise<Buffer | null> {
  const lenHeader = Number(res.headers.get("content-length") ?? "0");
  if (lenHeader > MAX_DOWNLOAD_BYTES) return null;
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_DOWNLOAD_BYTES) return null;
  return Buffer.from(ab);
}

export async function fetchPaperFullText(params: {
  arxivId?: string;
  doi?: string;
  oaUrl?: string;
  poolId?: string;
  forceRefresh?: boolean;
  saveRawText?: boolean;
}): Promise<FullTextDocument> {
  fs.mkdirSync(FT_CACHE_DIR, { recursive: true });
  fs.mkdirSync(FT_RAW_DIR, { recursive: true });

  const cacheKey = makeCacheKey(params);
  const jsonPath = path.join(FT_CACHE_DIR, `${cacheKey}.json`);
  const rawPath = path.join(FT_RAW_DIR, `${cacheKey}.txt`);

  if (!params.forceRefresh && fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as FullTextDocument;
    } catch {
      // recompute if corrupted
    }
  }

  let fullText = "";
  let format: FullTextDocument["format"] = "none";
  let sourceUrl = "";
  let errorReason: string | undefined;

  // 1. Try arXiv e-print source (.tar.gz / .gz .tex or PDF)
  if (params.arxivId) {
    const eprintUrl = `https://export.arxiv.org/e-print/${params.arxivId}`;
    try {
      const res = await politeArxivFetch(eprintUrl);
      if (res.ok) {
        const rawBuf = await readBoundedBuffer(res);
        if (!rawBuf) {
          errorReason = "arXiv e-print exceeded 20MB cap";
        } else {
        sourceUrl = eprintUrl;

        // Decompress gzip if magic header 1f 8b
        let unpackedBuf = rawBuf;
        if (rawBuf.length >= 2 && rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
          try {
            unpackedBuf = zlib.gunzipSync(rawBuf);
          } catch {
            unpackedBuf = rawBuf;
          }
        }

        if (unpackedBuf.subarray(0, 5).toString("ascii") === "%PDF-") {
          const pdfTxt = extractPdfBufferToText(unpackedBuf, cacheKey);
          if (pdfTxt.length > 500) {
            fullText = pdfTxt;
            format = "pdf_text";
          }
        } else {
          // Check if POSIX tar archive
          const tarFiles = parseTarBuffer(unpackedBuf);
          if (tarFiles.length > 0) {
            fullText = cleanTexSource(tarFiles);
            format = "arxiv_tex";
          } else {
            const asUtf8 = unpackedBuf.toString("utf8");
            if (asUtf8.includes("\\begin{document}") || asUtf8.includes("\\section")) {
              fullText = cleanTexSource([{ name: "main.tex", content: asUtf8 }]);
              format = "arxiv_tex";
            }
          }
        }
        }
      } else {
        errorReason = `arXiv e-print HTTP ${res.status}`;
      }
    } catch (err) {
      errorReason = `arXiv e-print error: ${(err as Error).message}`;
    }

    // Fallback to arXiv HTML if e-print gave nothing
    if (!fullText) {
      const htmlUrl = `https://arxiv.org/html/${params.arxivId}`;
      try {
        const res = await politeArxivFetch(htmlUrl);
        if (res.ok) {
          const html = await res.text();
          const stripped = stripHtmlToText(html);
          if (stripped.length > 1500) {
            fullText = stripped;
            format = "arxiv_html";
            sourceUrl = htmlUrl;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 2. Try OpenAlex open-access URL (PDF or HTML) if non-arXiv or still empty
  if (!fullText && params.oaUrl && !params.oaUrl.includes("arxiv.org/")) {
    try {
      const res = await fetch(params.oaUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/pdf,text/html;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(18_000),
      });
      if (res.ok) {
        const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
        const buf = await readBoundedBuffer(res);
        if (!buf) {
          errorReason = "OA URL exceeded 20MB cap";
        } else if (ctype.includes("pdf") || buf.subarray(0, 5).toString("ascii") === "%PDF-") {
          const pdfTxt = extractPdfBufferToText(buf, cacheKey);
          if (pdfTxt.length > 1200) {
            fullText = pdfTxt;
            format = "pdf_text";
            sourceUrl = params.oaUrl;
          } else {
            errorReason = "OA PDF text extraction yielded <1200 chars";
          }
        } else if (ctype.includes("html") || ctype.includes("text")) {
          const stripped = stripHtmlToText(buf.toString("utf8"));
          if (
            stripped.length > 2500 &&
            /\b(Riemann|GRH|ERH|Siegel|theorem|proof)\b/i.test(stripped)
          ) {
            fullText = stripped;
            format = "oa_html";
            sourceUrl = params.oaUrl;
          } else {
            errorReason = "OA landing HTML lacked full paper body";
          }
        }
      } else {
        errorReason = `OA URL HTTP ${res.status}`;
      }
    } catch (err) {
      errorReason = `OA fetch error: ${(err as Error).message}`;
    }
  }

  if (fullText && fullText.length > 400) {
    if (params.saveRawText) {
      fs.writeFileSync(rawPath, fullText.slice(0, 450_000));
    }
    const { windows, bibliographyMatches } = extractLocatedWindows(fullText, 12);
    const doc: FullTextDocument = {
      cacheKey,
      status: "ok",
      format,
      sourceUrl,
      charCount: fullText.length,
      windows,
      bibliographyMatches,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));
    return doc;
  }

  const miss: FullTextDocument = {
    cacheKey,
    status: "unavailable",
    format: "none",
    sourceUrl: sourceUrl || params.oaUrl || "",
    charCount: 0,
    windows: [],
    bibliographyMatches: [],
    errorReason: errorReason ?? "No open full text retrievable",
  };
  fs.writeFileSync(jsonPath, JSON.stringify(miss, null, 2));
  return miss;
}

export function readCachedRawFullText(cacheKey: string): string {
  const rawPath = path.join(FT_RAW_DIR, `${cacheKey}.txt`);
  if (!fs.existsSync(rawPath)) return "";
  return fs.readFileSync(rawPath, "utf8");
}
