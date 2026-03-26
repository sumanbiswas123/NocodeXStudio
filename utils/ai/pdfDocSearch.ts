import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import * as Neutralino from "@neutralinojs/lib";

const pdfModule = pdfjsLib as any;
if (pdfModule?.GlobalWorkerOptions) {
  pdfModule.GlobalWorkerOptions.workerSrc = workerSrc;
}

type PdfPageText = {
  page: number;
  text: string;
};

type PdfCacheEntry = {
  sourcePath: string;
  pages: PdfPageText[];
};

const inMemoryCache = new Map<string, PdfCacheEntry>();

const cleanText = (value: string) =>
  value.replace(/\s+/g, " ").replace(/\u0000/g, "").trim();

const safeKey = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, "_").slice(0, 80) || "pdf_cache";

async function getCachePath(sourcePath: string): Promise<string> {
  const baseRoot = await safeGetBaseDir();
  return `${baseRoot}\\local-llm\\pdf-cache\\${safeKey(sourcePath)}.json`;
}

async function ensureCacheDir() {
  const baseRoot = await safeGetBaseDir();
  const dir = `${baseRoot}\\local-llm\\pdf-cache`;
  try {
    await Neutralino.filesystem.createDirectory(dir);
  } catch {
    // Already exists.
  }
}

async function safeGetBaseDir(): Promise<string> {
  return "C:\\Users\\SumanBiswas\\Downloads\\nocode-x-studio";
}

async function loadCachedPdf(sourcePath: string): Promise<PdfCacheEntry | null> {
  const cached = inMemoryCache.get(sourcePath);
  if (cached) return cached;

  try {
    const cachePath = await getCachePath(sourcePath);
    const raw = await Neutralino.filesystem.readFile(cachePath);
    const parsed = JSON.parse(raw) as PdfCacheEntry;
    if (parsed?.sourcePath === sourcePath && Array.isArray(parsed?.pages)) {
      inMemoryCache.set(sourcePath, parsed);
      return parsed;
    }
  } catch {
    // Ignore cache failures.
  }
  return null;
}

async function saveCachedPdf(entry: PdfCacheEntry) {
  try {
    await ensureCacheDir();
    const cachePath = await getCachePath(entry.sourcePath);
    await Neutralino.filesystem.writeFile(
      cachePath,
      JSON.stringify(entry),
    );
  } catch {
    // Ignore cache failures.
  }
}

async function extractPdfText(sourcePath: string): Promise<PdfPageText[]> {
  const data = await Neutralino.filesystem.readBinaryFile(sourcePath);
  const loadingTask = pdfModule.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    disableWorker: true,
  });
  const pdfDocument = await loadingTask.promise;
  const pages: PdfPageText[] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = cleanText(
      (content.items || []).map((item: any) => item?.str || "").join(" "),
    );
    if (text) {
      pages.push({ page: pageNumber, text });
    }
  }
  return pages;
}

export async function getPdfPages(sourcePath: string): Promise<PdfPageText[]> {
  const cached = await loadCachedPdf(sourcePath);
  if (cached) return cached.pages;
  const pages = await extractPdfText(sourcePath);
  const entry = { sourcePath, pages };
  inMemoryCache.set(sourcePath, entry);
  await saveCachedPdf(entry);
  return pages;
}

function scorePage(text: string, terms: string[]) {
  if (!text) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    const matches = hay.split(term).length - 1;
    score += matches * Math.max(1, term.length / 4);
  }
  return score;
}

export async function buildPdfSearchContext(
  sourcePath: string,
  question: string,
  maxPages = 3,
  maxChars = 2500,
): Promise<string> {
  const pages = await getPdfPages(sourcePath);
  if (!pages.length) return "";

  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4)
    .slice(0, 12);

  const ranked = pages
    .map((page) => ({
      page,
      score: scorePage(page.text, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);

  if (!ranked.length) return "";

  let output = "";
  for (const entry of ranked) {
    const snippet = entry.page.text.slice(0, maxChars);
    output += `PDF Page ${entry.page.page}: ${snippet}\n`;
  }
  return output.trim();
}
