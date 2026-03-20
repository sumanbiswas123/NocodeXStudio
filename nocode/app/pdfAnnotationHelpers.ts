import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { FileMap } from "../types";
import { normalizePath, resolveConfigPathFromFiles } from "./appHelpers";
import {
  classifyAnnotationWithMl,
  computeMetrics,
  MetricsReport,
} from "../utils/ai/AnnotationMLPipeline";
import { deepScanMatcher } from "../utils/ai/DeepScanMatcher";
import { resourceScanner } from "../utils/ai/ResourceScanner";


const pdfModule = pdfjsLib;
if ((pdfModule as any)?.GlobalWorkerOptions) {
  (pdfModule as any).GlobalWorkerOptions.workerSrc = workerSrc;
}

const SUPPORTED_ANNOTATION_SUBTYPES = new Set([
  "Text",
  "Highlight",
  "FreeText",
  "Popup",
  "Square",
  "Circle",
  "Line",
  "Ink",
  "Polygon",
  "PolyLine",
  "Underline",
  "StrikeOut",
  "Squiggly",
  "Caret",
]);

const POSITION_UNIT = "points (72dpi)";
const NATURAL_SORT = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const DHASH_WIDTH = 17;
const DHASH_HEIGHT = 16;
const DHASH_BITS = (DHASH_WIDTH - 1) * DHASH_HEIGHT; // 16 * 16 = 256 bits
const DEFAULT_HASH_DISTANCE_THRESHOLD = 48; // ~18.7% allowed variance
const STRONG_HASH_DISTANCE_THRESHOLD = 32;  // ~12.5% allowed variance

export interface PdfAnnotationPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: string;
}

export interface PdfThreadEntry {
  role: "comment" | "reply";
  author: string;
  text: string;
}

export interface PdfAnnotationRecord {
  annotationId: string;
  annotationText: string;
  threadEntries: PdfThreadEntry[];
  annoPdfPage: number;
  subtype: string;
  pdfContextText?: string;
  position: PdfAnnotationPosition;
  pageSize: {
    width: number;
    height: number;
  };
  pdfPageImage?: string;
}

export interface PdfAnnotationUiRecord extends PdfAnnotationRecord {
  annotationType: string;
  detectedSubtype: string;
  detectedSubtypeConfidence: number;
  annotationIntent: string;
  annotationIntentConfidence: number;
  annotationStatus: "Popup" | "Slide" | "Unmapped";
  popupOwnership: string;
  popupOwnershipConfidence: number;
  annotationLocationType: string;
  status: string;
  matchMethod: string;
  mappedSlideId: string | null;
  mappedFilePath: string | null;
  detectedPageType?: string;
  foundSelector: string | null;
  popupInvocation?: PopupInvocationDetails | null;
  popupDomAudit: PopupDomAuditReport;
  positionPct: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface SlideRecord {
  slideId: string;
  filePath: string;
  lookupKeys: string[];
}

export interface ThumbRecord extends SlideRecord {
  thumbPath: string;
}

export interface PdfPageHashRecord {
  pdfPageNumber: number;
  hash: bigint;
  image?: string;
}

export interface ThumbHashRecord extends ThumbRecord {
  hash: bigint;
}

export interface PdfPageMatch {
  pdfPageNumber: number;
  bestThumb: ThumbHashRecord | null;
  hammingDistance: number;
  confidence: number;
}

export interface PdfPageClusterRecord {
  pdfPageNumber: number;
  detectedPageType: "Main" | "Child/Popup" | "Unmapped";
  mappedSlideId: string | null;
  mappedFilePath: string | null;
  parentMainSlidePdfPage: number | null;
  matchMethod: string;
}

export interface PopupDomQueryLog {
  selector: string;
  matchCount: number;
  context: "slide-canvas" | "shared-popup";
}

export interface PopupDomActionLog {
  method: "click" | "focus" | "dispatchEvent";
  selector: string;
}

export interface PopupDomAuditReport {
  queries: PopupDomQueryLog[];
  actionAttempts: PopupDomActionLog[];
  assertionPassed: boolean;
}

export interface PopupInvocationDetails {
  popupId: string;
  triggerSelector: string | null;
  containerSelector: string | null;
}

const EMPTY_POPUP_AUDIT: PopupDomAuditReport = {
  queries: [],
  actionAttempts: [],
  assertionPassed: true,
};

function round(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function extractAnnotationAuthor(annotation: any): string {
  const candidates = [
    annotation?.title,
    annotation?.titleObj?.str,
    annotation?.author,
    annotation?.user,
    annotation?.userName,
    annotation?.creator,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanText(candidate);
    if (cleaned) return cleaned;
  }
  return "Unknown Author";
}

function extractAnnotationText(annotation: any): string {
  const values = [
    annotation?.contents,
    annotation?.contentsObj?.str,
    annotation?.fieldValue,
    annotation?.textContent,
    annotation?.textContentObj?.str,
    typeof annotation?.richText === "string" ? annotation.richText : "",
    typeof annotation?.richText?.str === "string" ? annotation.richText.str : "",
  ]
    .map(cleanText)
    .filter(Boolean);

  return [...new Set(values)].join(" | ");
}

function normalizeReferenceKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized || null;
  }
  if (Array.isArray(value) && value.length > 0) {
    return normalizeReferenceKey(value[0]);
  }
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    if (input.id !== undefined) return normalizeReferenceKey(input.id);
    if (input.num !== undefined) return normalizeReferenceKey(input.num);
    if (input.ref !== undefined) return normalizeReferenceKey(input.ref);
  }
  return null;
}

function getAnnotationKey(annotation: any, fallbackIndex: number): string {
  return (
    normalizeReferenceKey(annotation?.id) ||
    normalizeReferenceKey(annotation?.annotationId) ||
    normalizeReferenceKey(annotation?.ref) ||
    String(fallbackIndex + 1)
  );
}

function resolveInReplyToKey(annotation: any): string | null {
  return (
    normalizeReferenceKey(annotation?.inReplyTo) ||
    normalizeReferenceKey(annotation?.inReplyToId) ||
    normalizeReferenceKey(annotation?.IRT) ||
    normalizeReferenceKey(annotation?.irt) ||
    normalizeReferenceKey(annotation?.inReplyToRef) ||
    null
  );
}

function resolveParentAnnotationKey(annotation: any): string | null {
  return (
    normalizeReferenceKey(annotation?.parentId) ||
    normalizeReferenceKey(annotation?.parent) ||
    normalizeReferenceKey(annotation?.parentRef) ||
    null
  );
}

function normalizeRect(rect: unknown, pageHeight: number): PdfAnnotationPosition {
  if (!Array.isArray(rect) || rect.length < 4) {
    return { x: 0, y: 0, width: 0, height: 0, unit: POSITION_UNIT };
  }

  const [x1, y1, x2, y2] = rect.map((value) => Number(value) || 0);
  const left = Math.min(x1, x2);
  const top = Number(pageHeight) - Math.max(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  return {
    x: round(left),
    y: round(top),
    width: round(width),
    height: round(height),
    unit: POSITION_UNIT,
  };
}

function normalizeQuadPoints(
  quadPoints: unknown,
  pageHeight: number,
): PdfAnnotationPosition | null {
  if (!Array.isArray(quadPoints) || quadPoints.length < 8) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < quadPoints.length - 1; index += 2) {
    const x = Number(quadPoints[index]);
    const y = Number(quadPoints[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  return normalizeRect([minX, minY, maxX, maxY], pageHeight);
}

function extractAnnotationPosition(annotation: any, pageHeight: number): PdfAnnotationPosition {
  return (
    normalizeQuadPoints(annotation?.quadPoints, pageHeight) ||
    normalizeRect(annotation?.rect, pageHeight)
  );
}

function hasUsablePosition(position: PdfAnnotationPosition | null): boolean {
  if (!position) return false;
  return (
    Number(position.width) > 0 ||
    Number(position.height) > 0 ||
    Number(position.x) > 0 ||
    Number(position.y) > 0
  );
}

function selectThreadAnchor(
  threadMembers: Array<{ annotation: any }>,
  annotationLookup: Map<string, { annotation: any }>,
  pageHeight: number,
) {
  const candidates: any[] = [];

  threadMembers.forEach(({ annotation }) => {
    if (!annotation) return;
    const parentKey = resolveParentAnnotationKey(annotation);
    if (annotation.subtype === "Popup" && parentKey && annotationLookup.has(parentKey)) {
      candidates.push(annotationLookup.get(parentKey)?.annotation);
    }
    candidates.push(annotation);
  });

  const evaluated = candidates
    .filter(Boolean)
    .map((annotation) => ({
      annotation,
      position: extractAnnotationPosition(annotation, pageHeight),
    }));
  const withPosition = evaluated.filter((entry) => hasUsablePosition(entry.position));
  const preferredNonPopup = withPosition.find(
    (entry) => entry.annotation?.subtype !== "Popup",
  );
  if (preferredNonPopup) return preferredNonPopup.annotation;
  if (withPosition.length > 0) return withPosition[0].annotation;
  return candidates[0] || null;
}

function buildThreadedPdfAnnotationsForPage({
  annotations,
  pageNumber,
  pageHeight,
  pageSize,
  pageTextFragments,
}: {
  annotations: any[];
  pageNumber: number;
  pageHeight: number;
  pageSize: { width: number; height: number };
  pageTextFragments: PageTextFragment[];
}): PdfAnnotationRecord[] {
  if (!annotations.length) return [];

  const annotationLookup = new Map<string, { key: string; index: number; annotation: any }>();
  annotations.forEach((annotation, index) => {
    const key = getAnnotationKey(annotation, index);
    annotationLookup.set(key, { key, index, annotation });
  });

  const rootCache = new Map<string, string>();
  const resolveRootKey = (startKey: string) => {
    if (rootCache.has(startKey)) return rootCache.get(startKey)!;
    let current = startKey;
    const visited = new Set([startKey]);
    while (annotationLookup.has(current)) {
      const node = annotationLookup.get(current)?.annotation;
      const replyTo = resolveInReplyToKey(node);
      if (!replyTo || !annotationLookup.has(replyTo) || visited.has(replyTo)) break;
      current = replyTo;
      visited.add(current);
    }
    rootCache.set(startKey, current);
    return current;
  };

  const threads = new Map<
    string,
    {
      rootKey: string;
      members: Array<{ key: string; index: number; annotation: any; isReply: boolean }>;
    }
  >();

  annotations.forEach((annotation, index) => {
    const key = getAnnotationKey(annotation, index);
    const replyTo = resolveInReplyToKey(annotation);
    const popupParent = annotation.subtype === "Popup" ? resolveParentAnnotationKey(annotation) : null;
    const threadLink = replyTo || popupParent;
    const baseRoot = threadLink && annotationLookup.has(threadLink) ? threadLink : key;
    const rootKey = resolveRootKey(baseRoot);
    const isReply = Boolean(replyTo);
    if (!threads.has(rootKey)) {
      threads.set(rootKey, { rootKey, members: [] });
    }
    threads.get(rootKey)?.members.push({ key, index, annotation, isReply });
  });

  const extracted: PdfAnnotationRecord[] = [];
  threads.forEach((thread, rootKey) => {
    const orderedMembers = [...thread.members].sort((left, right) => left.index - right.index);
    const threadEntries: PdfThreadEntry[] = [];
    const seen = new Set<string>();
    let hasComment = false;

    orderedMembers.forEach((member) => {
      const author = extractAnnotationAuthor(member.annotation);
      const text = cleanText(extractAnnotationText(member.annotation));
      
      // Filter out AI-generated annotations (Brand Guardian, Rule Engine Logs)
      const isNoise = 
        author === 'Brand Guardian' || 
        /AI rule|Execution ID|Rule ID|Marker ID|Rule Execution ID|Adverse Event Statement|Generic Name\(s\)/i.test(text);

      if (isNoise) return;

      
      if (!text) return;

      const dedupeKey = `${author.toLowerCase()}::${text.toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      const role: "comment" | "reply" = !hasComment && !member.isReply ? "comment" : "reply";
      threadEntries.push({ role, author, text });
      if (role === "comment") hasComment = true;
    });

    if (!threadEntries.length) return;
    if (!threadEntries.some((entry) => entry.role === "comment")) {
      threadEntries[0].role = "comment";
    }

    const annotationText = threadEntries
      .map((entry) => `${entry.text} |@| ${entry.author}`)
      .join(" | | ");

    const anchor = selectThreadAnchor(orderedMembers, annotationLookup, pageHeight);
    const anchorPosition = extractAnnotationPosition(anchor, pageHeight);
    const pdfContextText = extractNearbyPdfText(anchorPosition, pageTextFragments);
    const rootSubtype =
      annotationLookup.get(rootKey)?.annotation?.subtype ||
      orderedMembers[0]?.annotation?.subtype ||
      "Text";

    extracted.push({
      annotationId: `${pageNumber}-${rootKey}`,
      annotationText,
      threadEntries,
      annoPdfPage: pageNumber,
      subtype: rootSubtype,
      pdfContextText,
      position: anchorPosition,
      pageSize,
    });
  });

  return extracted;
}

function parsePagesAllFromConfig(files: FileMap): string[] {
  const configPath =
    resolveConfigPathFromFiles(files, "config.json") || "shared/config.json";
  const raw = files[configPath]?.content;
  if (typeof raw !== "string" || !raw.trim()) return [];
  const match = raw.match(/"pagesAll"\s*:\s*\[([\s\S]*?)\]/m);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)]
    .map((item) => item[1].trim())
    .filter(Boolean);
}

function isIndexHtmlOutsideShared(pathValue: string): boolean {
  const normalized = normalizePath(pathValue);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  const fileName = parts[parts.length - 1]?.toLowerCase();
  return fileName === "index.html" && !normalized.includes("/shared/");
}

export function buildProjectSlideOrder(files: FileMap): SlideRecord[] {
  const allIndexSlides = Object.values(files)
    .filter((file) => file.type === "html" && isIndexHtmlOutsideShared(file.path))
    .map((file) => {
      const normalized = normalizePath(file.path);
      const parts = normalized.split("/").filter(Boolean);
      const slideId = parts[parts.length - 2] || normalized;
      const baseName = normalized.split("/").pop() || normalized;
      return {
        slideId,
        filePath: normalized,
        lookupKeys: [slideId, file.name, baseName, normalized].filter(Boolean),
      };
    })
    .sort((left, right) =>
      NATURAL_SORT.compare(left.filePath.toLowerCase(), right.filePath.toLowerCase()),
    );

  const pagesAll = parsePagesAllFromConfig(files);
  if (!pagesAll.length) return allIndexSlides;

  const ordered: SlideRecord[] = [];
  const used = new Set<string>();

  for (const slideKey of pagesAll) {
    const match = allIndexSlides.find((slide) =>
      slide.lookupKeys.some(
        (entry) => entry.toLowerCase() === slideKey.toLowerCase(),
      ),
    );
    if (match && !used.has(match.filePath)) {
      ordered.push(match);
      used.add(match.filePath);
    }
  }
  allIndexSlides.forEach((slide) => {
    if (!used.has(slide.filePath)) ordered.push(slide);
  });

  return ordered;
}

export function collectProjectThumbs(
  files: FileMap,
  absolutePathIndex: Record<string, string>,
): ThumbRecord[] {
  return buildProjectSlideOrder(files)
    .map((slide) => {
      const folderPath = slide.filePath.includes("/")
        ? slide.filePath.slice(0, slide.filePath.lastIndexOf("/"))
        : slide.filePath;
      return {
        ...slide,
        thumbPath: `${folderPath}/thumb.png`,
      };
    })
    .filter((slide) => Boolean(files[slide.thumbPath]) && Boolean(absolutePathIndex[slide.thumbPath]));
}

export async function extractPdfAnnotationsFromData(
  pdfData: Uint8Array,
): Promise<PdfAnnotationRecord[]> {
  const loadingTask = (pdfModule as any).getDocument({
    data: pdfData,
    useSystemFonts: true,
    disableWorker: true,
  });
  const pdfDocument = await loadingTask.promise;
  const extracted: PdfAnnotationRecord[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const pageSize = {
      width: round(viewport.width),
      height: round(viewport.height),
    };
    const annotations = await page.getAnnotations({ intent: "display" });
    const pageTextFragments = await extractPageTextFragments(page, pageSize.height);
    const supported = annotations.filter((annotation: any) =>
      SUPPORTED_ANNOTATION_SUBTYPES.has(annotation?.subtype),
    );
    extracted.push(
      ...buildThreadedPdfAnnotationsForPage({
        annotations: supported,
        pageNumber,
        pageHeight: pageSize.height,
        pageSize,
        pageTextFragments,
      }),
    );
  }

  return extracted;
}

type PageTextFragment = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

async function extractPageTextFragments(page: any, pageHeight: number): Promise<PageTextFragment[]> {
  try {
    const textContent = await page.getTextContent();
    const fragments: PageTextFragment[] = [];
    for (const item of textContent.items || []) {
      const rawText = cleanText((item as any).str);
      if (!rawText) continue;
      const transform = (item as any).transform;
      const x = Number(Array.isArray(transform) ? transform[4] : 0) || 0;
      const baselineY = Number(Array.isArray(transform) ? transform[5] : 0) || 0;
      const width = Math.max(1, Number((item as any).width) || 1);
      const height = Math.max(1, Math.abs(Number((item as any).height) || 12));
      const y = Number(pageHeight) - baselineY - height;
      fragments.push({
        text: rawText,
        x: round(x),
        y: round(y),
        width: round(width),
        height: round(height),
      });
    }
    return fragments;
  } catch {
    return [];
  }
}

function extractNearbyPdfText(
  position: PdfAnnotationPosition,
  fragments: PageTextFragment[],
): string {
  if (!fragments.length) return "";
  const marginX = Math.max(80, position.width * 1.8);
  const marginY = Math.max(80, position.height * 2.4);
  const left = position.x - marginX;
  const right = position.x + Math.max(position.width, 12) + marginX;
  const top = position.y - marginY;
  const bottom = position.y + Math.max(position.height, 12) + marginY;
  const nearby = fragments
    .filter((fragment) => {
      const centerX = fragment.x + fragment.width / 2;
      const centerY = fragment.y + fragment.height / 2;
      return centerX >= left && centerX <= right && centerY >= top && centerY <= bottom;
    })
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) <= 6) return a.x - b.x;
      return a.y - b.y;
    })
    .map((fragment) => fragment.text);
  if (!nearby.length) return "";
  return cleanText(nearby.join(" "));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadImageFromBytes(bytes: ArrayBuffer | Uint8Array): Promise<ImageBitmap | HTMLImageElement> {
  const normalizedBytes =
    bytes instanceof Uint8Array
      ? (() => {
          const copy = new Uint8Array(bytes.byteLength);
          copy.set(bytes);
          return copy.buffer;
        })()
      : bytes;
  const blob = new Blob([normalizedBytes], { type: "image/png" });
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image for hashing."));
    };
    image.src = url;
  });
}

function computeDHashFromCanvasSource(source: CanvasImageSource): bigint {
  const canvas = createCanvas(DHASH_WIDTH, DHASH_HEIGHT);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas context unavailable.");
  context.drawImage(source, 0, 0, DHASH_WIDTH, DHASH_HEIGHT);
  const imageData = context.getImageData(0, 0, DHASH_WIDTH, DHASH_HEIGHT).data;
  let hash = 0n;

  for (let y = 0; y < DHASH_HEIGHT; y += 1) {
    for (let x = 0; x < DHASH_WIDTH - 1; x += 1) {
      const leftIndex = (y * DHASH_WIDTH + x) * 4;
      const rightIndex = (y * DHASH_WIDTH + x + 1) * 4;
      const leftGray =
        imageData[leftIndex] * 0.299 +
        imageData[leftIndex + 1] * 0.587 +
        imageData[leftIndex + 2] * 0.114;
      const rightGray =
        imageData[rightIndex] * 0.299 +
        imageData[rightIndex + 1] * 0.587 +
        imageData[rightIndex + 2] * 0.114;
      hash <<= 1n;
      if (leftGray > rightGray) hash |= 1n;
    }
  }

  return hash;
}

function hammingDistance(left: bigint, right: bigint): number {
  let value = left ^ right;
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function confidenceFromDistance(distance: number): number {
  return round(Math.max(0, ((DHASH_BITS - distance) / DHASH_BITS) * 100));
}

export async function renderPdfPageHashes(
  pdfData: Uint8Array,
  renderWidth = 160,
): Promise<PdfPageHashRecord[]> {
  const loadingTask = (pdfModule as any).getDocument({
    data: pdfData,
    useSystemFonts: true,
    disableWorker: true,
  });
  const pdfDocument = await loadingTask.promise;
  const output: PdfPageHashRecord[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const renderScale = Math.max(0.2, renderWidth / Math.max(1, baseViewport.width));
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = createCanvas(
      Math.max(1, Math.round(viewport.width)),
      Math.max(1, Math.round(viewport.height)),
    );
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) continue;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    output.push({
      pdfPageNumber: pageNumber,
      hash: computeDHashFromCanvasSource(canvas),
      image: canvas.toDataURL("image/jpeg", 0.7),
    });
  }

  return output;
}

async function extractPdfAnnotationsAndPageHashes(
  pdfData: Uint8Array,
  renderWidth = 160,
): Promise<{ annotations: PdfAnnotationRecord[]; pdfPageHashes: PdfPageHashRecord[] }> {
  const loadingTask = (pdfModule as any).getDocument({
    data: pdfData,
    useSystemFonts: true,
    disableWorker: true,
  });
  const pdfDocument = await loadingTask.promise;
  const annotations: PdfAnnotationRecord[] = [];
  const pdfPageHashes: PdfPageHashRecord[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const pageSize = {
      width: round(baseViewport.width),
      height: round(baseViewport.height),
    };
    const pageAnnotations = await page.getAnnotations({ intent: "display" });
    const pageTextFragments = await extractPageTextFragments(page, pageSize.height);
    const supported = pageAnnotations.filter((annotation: any) =>
      SUPPORTED_ANNOTATION_SUBTYPES.has(annotation?.subtype),
    );

    const renderScale = Math.max(0.2, renderWidth / Math.max(1, baseViewport.width));
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = createCanvas(
      Math.max(1, Math.round(viewport.width)),
      Math.max(1, Math.round(viewport.height)),
    );
    const context = canvas.getContext("2d", { willReadFrequently: true });
    
    let pageImage: string | undefined;
    if (context) {
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      if (supported.length > 0) {
        pageImage = canvas.toDataURL("image/jpeg", 0.7);
      }
    }

    const threadedRecords = buildThreadedPdfAnnotationsForPage({
      annotations: supported,
      pageNumber,
      pageHeight: pageSize.height,
      pageSize,
      pageTextFragments,
    });

    if (pageImage) {
      threadedRecords.forEach(r => { r.pdfPageImage = pageImage; });
    }

    annotations.push(...threadedRecords);

    if (context) {
      pdfPageHashes.push({
        pdfPageNumber: pageNumber,
        hash: computeDHashFromCanvasSource(canvas),
      });
    }
  }

  return { annotations, pdfPageHashes };
}

export async function buildThumbHashes(
  thumbs: ThumbRecord[],
  readBinaryFile: (absolutePath: string) => Promise<ArrayBuffer>,
  absolutePathIndex: Record<string, string>,
): Promise<ThumbHashRecord[]> {
  const output: ThumbHashRecord[] = [];

  for (const thumb of thumbs) {
    const absolutePath = absolutePathIndex[thumb.thumbPath];
    if (!absolutePath) continue;
    try {
      const bytes = await readBinaryFile(absolutePath);
      const image = await loadImageFromBytes(bytes);
      output.push({
        ...thumb,
        hash: computeDHashFromCanvasSource(image),
      });
      if ("close" in image && typeof image.close === "function") {
        image.close();
      }
    } catch {
      // Skip unreadable thumbnails.
    }
  }

  return output;
}

type ThumbAnchor = {
  thumb: ThumbHashRecord;
  slideIndex: number;
  page: PdfPageHashRecord;
  distance: number;
  confidence: number;
};

function buildThumbAnchors(
  thumbHashes: ThumbHashRecord[],
  pdfPageHashes: PdfPageHashRecord[],
  threshold: number,
): ThumbAnchor[] {
  const candidates = thumbHashes
    .map((thumb, slideIndex) => {
      let bestPage: PdfPageHashRecord | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const page of pdfPageHashes) {
        const distance = hammingDistance(thumb.hash, page.hash);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = page;
        }
      }
      return bestPage && bestDistance <= threshold
        ? {
            thumb,
            slideIndex,
            page: bestPage,
            distance: bestDistance,
            confidence: confidenceFromDistance(bestDistance),
          }
        : null;
    })
    .filter((entry): entry is ThumbAnchor => Boolean(entry));

  if (candidates.length <= 1) {
    return candidates;
  }

  const scores = candidates.map((entry) => entry.confidence);
  const previous = candidates.map(() => -1);
  let bestIndex = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
      if (candidates[priorIndex].page.pdfPageNumber >= candidates[index].page.pdfPageNumber) {
        continue;
      }
      if (candidates[priorIndex].slideIndex >= candidates[index].slideIndex) {
        continue;
      }
      const chainedScore = scores[priorIndex] + candidates[index].confidence;
      if (chainedScore > scores[index]) {
        scores[index] = chainedScore;
        previous[index] = priorIndex;
      }
    }
    if (scores[index] > scores[bestIndex]) bestIndex = index;
  }

  const anchors: ThumbAnchor[] = [];
  let cursor = bestIndex;
  while (cursor !== -1) {
    anchors.push(candidates[cursor]);
    cursor = previous[cursor];
  }
  return anchors.reverse();
}

export function buildPdfPageMatches(
  pdfPageHashes: PdfPageHashRecord[],
  thumbHashes: ThumbHashRecord[],
): PdfPageMatch[] {
  return pdfPageHashes.map((page) => {
    let bestThumb: ThumbHashRecord | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const thumb of thumbHashes) {
      const distance = hammingDistance(page.hash, thumb.hash);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestThumb = thumb;
      }
    }
    return {
      pdfPageNumber: page.pdfPageNumber,
      bestThumb,
      hammingDistance: Number.isFinite(bestDistance) ? bestDistance : DHASH_BITS,
      confidence: Number.isFinite(bestDistance) ? confidenceFromDistance(bestDistance) : 0,
    };
  });
}

function getThumbOrderMap(thumbHashes: ThumbHashRecord[]): Map<string, number> {
  return new Map(
    thumbHashes.map((thumb, index) => [thumb.filePath, index]),
  );
}

export function clusterPdfPagesByHashes(
  pdfPageHashes: PdfPageHashRecord[],
  pdfPageMatches: PdfPageMatch[],
  thumbHashes: ThumbHashRecord[],
  threshold = DEFAULT_HASH_DISTANCE_THRESHOLD,
): {
  pageClusters: PdfPageClusterRecord[];
  pageToSlide: Map<number, ThumbHashRecord>;
} {
  const anchors = buildThumbAnchors(thumbHashes, pdfPageHashes, threshold);
  const thumbOrder = getThumbOrderMap(thumbHashes);
  const anchorByPage = new Map<number, ThumbAnchor>();
  anchors.forEach((anchor) => {
    anchorByPage.set(anchor.page.pdfPageNumber, anchor);
  });

  const pageToSlide = new Map<number, ThumbHashRecord>();
  const pageClusters: PdfPageClusterRecord[] = [];
  let anchorCursor = 0;
  let currentAnchor: ThumbAnchor | null = null;

  for (const match of pdfPageMatches) {
    while (
      anchorCursor < anchors.length &&
      anchors[anchorCursor].page.pdfPageNumber <= match.pdfPageNumber
    ) {
      currentAnchor = anchors[anchorCursor];
      anchorCursor += 1;
    }

    const pageAnchor = anchorByPage.get(match.pdfPageNumber);
    const nextAnchor = anchorCursor < anchors.length ? anchors[anchorCursor] : null;
    let assignedThumb: ThumbHashRecord | null = null;
    let detectedPageType: PdfPageClusterRecord["detectedPageType"] = "Unmapped";
    let parentMainSlidePdfPage: number | null = null;
    let matchMethod = "No Match";

    if (pageAnchor) {
      assignedThumb = pageAnchor.thumb;
      detectedPageType = "Main";
      parentMainSlidePdfPage = pageAnchor.page.pdfPageNumber;
      matchMethod = "dHash anchor";
    } else if (
      match.bestThumb &&
      match.hammingDistance <= STRONG_HASH_DISTANCE_THRESHOLD
    ) {
      const directIndex = thumbOrder.get(match.bestThumb.filePath) ?? -1;
      const withinLowerBound =
        !currentAnchor || directIndex >= currentAnchor.slideIndex;
      const withinUpperBound =
        !nextAnchor || directIndex <= nextAnchor.slideIndex;
      if (withinLowerBound && withinUpperBound) {
        assignedThumb = match.bestThumb;
        detectedPageType = "Main";
        parentMainSlidePdfPage = match.pdfPageNumber;
        matchMethod = "dHash direct";
      }
    }

    if (!assignedThumb && currentAnchor) {
      assignedThumb = currentAnchor.thumb;
      detectedPageType = "Child/Popup";
      parentMainSlidePdfPage = currentAnchor.page.pdfPageNumber;
      matchMethod = "dHash clustered";
    }

    if (assignedThumb) {
      pageToSlide.set(match.pdfPageNumber, assignedThumb);
    }

    pageClusters.push({
      pdfPageNumber: match.pdfPageNumber,
      detectedPageType,
      mappedSlideId: assignedThumb?.slideId || null,
      mappedFilePath: assignedThumb?.filePath || null,
      parentMainSlidePdfPage,
      matchMethod,
    });
  }

  return { pageClusters, pageToSlide };
}

export function clusterPdfPagesWithDeepIntelligence(

  pdfPageHashes: PdfPageHashRecord[],
  pdfPageMatches: PdfPageMatch[],
  thumbHashes: ThumbHashRecord[],
  annotations: PdfAnnotationRecord[],
  threshold = DEFAULT_HASH_DISTANCE_THRESHOLD,
): {
  pageClusters: PdfPageClusterRecord[];
  pageToSlide: Map<number, ThumbHashRecord>;
} {
  const anchors = buildThumbAnchors(thumbHashes, pdfPageHashes, threshold);
  const anchorByPage = new Map<number, ThumbAnchor>();
  anchors.forEach((anchor) => {
    anchorByPage.set(anchor.page.pdfPageNumber, anchor);
  });

  const pageClusters: PdfPageClusterRecord[] = [];
  const pageToSlide = new Map<number, ThumbHashRecord>();
  let currentAnchor: ThumbAnchor | null = null;
  let anchorCursor = 0;

  for (const match of pdfPageMatches) {
    // 1. Advance sequence anchor
    while (
      anchorCursor < anchors.length &&
      anchors[anchorCursor].page.pdfPageNumber <= match.pdfPageNumber
    ) {
      currentAnchor = anchors[anchorCursor];
      anchorCursor += 1;
    }

    // 2. Extract keywords from this PDF page's annotations for Deep Match
    const pageAnnos = annotations.filter(a => a.annoPdfPage === match.pdfPageNumber);
    const pdfTextContent = pageAnnos.map(a => a.annotationText + ' ' + (a.pdfContextText || '')).join(' ');
    
    // 3. Try Deep Intelligence Match
    const pageHashRecord = pdfPageHashes.find(h => h.pdfPageNumber === match.pdfPageNumber);
    const deepResult = deepScanMatcher.findBestMatch(
      pdfTextContent, 
      pageHashRecord?.hash || 0n,
      { 
        currentSlideId: currentAnchor?.thumb.slideId,
        pdfPageNumber: match.pdfPageNumber 
      }
    );

    let assignedThumb: ThumbHashRecord | null = null;
    let mappedSlideId: string | null = null;
    let mappedFilePath: string | null = null;
    let detectedPageType: PdfPageClusterRecord["detectedPageType"] = "Unmapped";
    let matchMethod = "No Match";

    if (deepResult) {
      assignedThumb = thumbHashes.find(t => t.slideId === deepResult.targetId) || null;
      mappedSlideId = deepResult.targetId;
      mappedFilePath = deepResult.filePath;
      // VITAL FIX: Shared folder files can NEVER be "Main" slides.
      const isSharedPath = /(^|[\\/])shared([\\/]|$)/i.test(mappedFilePath || "");
      detectedPageType = isSharedPath ? "Child/Popup" : (deepResult.pageType as any);
      matchMethod = `Deep ${deepResult.method} match`;
    } 
    
    // Direct dHash match (Strong signal, even if not an anchor)
    if (!mappedSlideId && match.bestThumb && match.hammingDistance <= STRONG_HASH_DISTANCE_THRESHOLD) {
      assignedThumb = match.bestThumb;
      mappedSlideId = assignedThumb.slideId;
      mappedFilePath = assignedThumb.filePath;
      // VITAL FIX: Shared folder files can NEVER be "Main" slides.
      // We use a robust regex to handle Windows, POSIX, and "start of string" cases.
      const isSharedPath = /(^|[\\/])shared([\\/]|$)/i.test(mappedFilePath || "");
      detectedPageType = isSharedPath ? "Child/Popup" : "Main";
      matchMethod = "dHash direct";
    }

    // Fallback block if no match found yet
    if (!mappedSlideId) {

      // Fallback to legacy anchors for sequence continuity if deep match fails on a "Main" looking page
      if (anchorByPage.has(match.pdfPageNumber)) {
        assignedThumb = anchorByPage.get(match.pdfPageNumber)!.thumb;
        mappedSlideId = assignedThumb.slideId;
        mappedFilePath = assignedThumb.filePath;
        const isSharedPath = /(^|[\\/])shared([\\/]|$)/i.test(mappedFilePath || "");
        detectedPageType = isSharedPath ? "Child/Popup" : "Main";
        matchMethod = "dHash anchor";
      } else if (currentAnchor) {
        assignedThumb = currentAnchor.thumb;
        mappedSlideId = assignedThumb.slideId;
        mappedFilePath = assignedThumb.filePath;
        // Default to "Main" instead of "Child/Popup" to prevent accidental popup triggers
        // BUT exclude shared folder indices using robust path checking.
        const isSharedPath = /(^|[\\/])shared([\\/]|$)/i.test(mappedFilePath || "");
        detectedPageType = isSharedPath ? "Child/Popup" : "Main"; 
        matchMethod = "dHash clustered (persistence)";
      }

    }

    if (assignedThumb) {
      pageToSlide.set(match.pdfPageNumber, assignedThumb);
    }

    pageClusters.push({
      pdfPageNumber: match.pdfPageNumber,
      detectedPageType,
      mappedSlideId,
      mappedFilePath,
      parentMainSlidePdfPage: currentAnchor?.page.pdfPageNumber || null,
      matchMethod,
    });

  }

  return { pageClusters, pageToSlide };
}


function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function buildElementSelector(element: Element): string | null {
  if (element instanceof HTMLElement && element.id) {
    return `#${escapeCssIdentifier(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.tagName && current.tagName.toLowerCase() !== "body") {
    const tagName = current.tagName.toLowerCase();
    if (!current.parentElement) {
      parts.unshift(tagName);
      break;
    }
    const siblings = [...current.parentElement.children].filter(
      (sibling) => sibling.tagName === current?.tagName,
    );
    const index =
      siblings.length > 1 ? siblings.indexOf(current) + 1 : 0;
    parts.unshift(index > 0 ? `${tagName}:nth-of-type(${index})` : tagName);
    current = current.parentElement;
    if (current instanceof HTMLElement && current.id) {
      parts.unshift(`#${escapeCssIdentifier(current.id)}`);
      break;
    }
  }

  return parts.length ? parts.join(" > ") : null;
}

function scoreTextMatch(candidate: string, target: string): number {
  if (!candidate || !target) return 0;
  const normalizedCandidate = candidate.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  if (normalizedCandidate === normalizedTarget) {
    return 140 + Math.min(candidate.length, 60);
  }
  if (normalizedCandidate.includes(normalizedTarget)) {
    return 100 + Math.min(target.length, 50);
  }
  if (normalizedTarget.includes(normalizedCandidate) && candidate.length > 12) {
    return 75 + Math.min(candidate.length, 40);
  }

  const candidateWords = normalizedCandidate
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2);
  const targetWords = new Set(
    normalizedTarget.split(/[^a-z0-9]+/i).filter((word) => word.length > 2),
  );
  if (!candidateWords.length || !targetWords.size) return 0;

  const overlap = candidateWords.filter((word) => targetWords.has(word));
  if (overlap.length < 2) return 0;

  return overlap.length * 10 + Math.min(candidate.length, 30);
}

type AnnotationMatchResult = {
  selector: string | null;
  score: number;
  audit: PopupDomAuditReport;
  matchedTagName: string | null;
};

function mergePopupDomAudits(items: PopupDomAuditReport[]): PopupDomAuditReport {
  const queries = items.flatMap((item) => item.queries);
  const actionAttempts = items.flatMap((item) => item.actionAttempts);
  return {
    queries,
    actionAttempts,
    assertionPassed: actionAttempts.length === 0,
  };
}

function runPopupDomAudit(
  documentNode: Document,
  context: "slide-canvas" | "shared-popup",
): PopupDomAuditReport {
  const queries: PopupDomQueryLog[] = [];
  const actionAttempts: PopupDomActionLog[] = [];
  const selectors = [".popup", ".annotation", "[data-popup-id]"];
  const elementProto = (globalThis as any).Element?.prototype as
    | {
        click?: () => void;
        focus?: () => void;
        dispatchEvent?: (event: Event) => boolean;
      }
    | undefined;
  const originalClick = elementProto?.click;
  const originalFocus = elementProto?.focus;
  const originalDispatch = elementProto?.dispatchEvent;
  const recordAction = (method: PopupDomActionLog["method"]) => {
    actionAttempts.push({ method, selector: "(runtime)" });
  };
  if (elementProto) {
    if (typeof elementProto.click === "function") {
      elementProto.click = function patchedClick() {
        recordAction("click");
      };
    }
    if (typeof elementProto.focus === "function") {
      elementProto.focus = function patchedFocus() {
        recordAction("focus");
      };
    }
    if (typeof elementProto.dispatchEvent === "function") {
      elementProto.dispatchEvent = function patchedDispatch(event: Event) {
        if (
          event instanceof MouseEvent ||
          event.type === "click" ||
          event.type === "focus"
        ) {
          recordAction("dispatchEvent");
        }
        return true;
      };
    }
  }
  try {
    for (const selector of selectors) {
      const matchCount = documentNode.querySelectorAll(selector).length;
      queries.push({ selector, matchCount, context });
    }
  } finally {
    if (elementProto) {
      if (originalClick) elementProto.click = originalClick;
      if (originalFocus) elementProto.focus = originalFocus;
      if (originalDispatch) elementProto.dispatchEvent = originalDispatch;
    }
  }
  return {
    queries,
    actionAttempts,
    assertionPassed: actionAttempts.length === 0,
  };
}

type PopupSelectorIndex = {
  triggersByPopupId: Map<string, string[]>;
  containerByPopupId: Map<string, string>;
  textByPopupId: Map<string, string[]>;
};

function normalizePopupId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.replace(/^#/, "");
}

function buildPopupSelectorIndex(documentNode: Document): PopupSelectorIndex {
  const triggersByPopupId = new Map<string, string[]>();
  const containerByPopupId = new Map<string, string>();
  const textByPopupId = new Map<string, string[]>();
  const appendText = (popupId: string, value: string) => {
    const cleaned = cleanText(value);
    if (!cleaned) return;
    const current = textByPopupId.get(popupId) || [];
    current.push(cleaned);
    textByPopupId.set(popupId, current);
  };
  const triggerNodes = documentNode.querySelectorAll(
    "[data-dialog], .openDialog[data-dialog], [data-popup-id][data-dialog]",
  );
  triggerNodes.forEach((node) => {
    const popupId = normalizePopupId(node.getAttribute("data-dialog"));
    const selector = buildElementSelector(node);
    if (!popupId || !selector) return;
    const current = triggersByPopupId.get(popupId) || [];
    current.push(selector);
    triggersByPopupId.set(popupId, current);
    appendText(popupId, node.textContent || "");
  });

  const containerNodes = documentNode.querySelectorAll(
    ".popup, [data-popup-id], [role='dialog'], .modal, .dialog, [id^='dialog']",
  );
  containerNodes.forEach((node) => {
    const popupId =
      normalizePopupId(node.getAttribute("data-popup-id")) ||
      normalizePopupId((node as HTMLElement).id);
    const selector = buildElementSelector(node);
    if (!popupId || !selector) return;
    if (!containerByPopupId.has(popupId)) {
      containerByPopupId.set(popupId, selector);
    }
    appendText(popupId, node.textContent || "");
  });

  return { triggersByPopupId, containerByPopupId, textByPopupId };
}

function resolvePopupInvocationForMatch(
  documentNode: Document,
  foundSelector: string | null,
  targetHints: string[],
): PopupInvocationDetails | null {
  let target: Element | null = null;
  if (foundSelector) {
    try {
      target = documentNode.querySelector(foundSelector);
    } catch {
      target = null;
    }
  }
  const index = buildPopupSelectorIndex(documentNode);

  const directDialogId = normalizePopupId(target?.getAttribute("data-dialog"));
  const closestDialogTrigger = target?.closest("[data-dialog]") || null;
  const triggerDialogId = normalizePopupId(
    closestDialogTrigger?.getAttribute("data-dialog"),
  );
  const closestContainer = target?.closest(
    ".popup, [data-popup-id], [role='dialog'], .modal, .dialog, [id^='dialog']",
  ) || null;
  const containerPopupId =
    normalizePopupId(closestContainer?.getAttribute("data-popup-id")) ||
    normalizePopupId((closestContainer as HTMLElement | null)?.id);
  let popupId = directDialogId || triggerDialogId || containerPopupId;
  if (!popupId) {
    const hintPool = targetHints
      .map((entry) => cleanText(entry))
      .filter((entry) => entry.length > 2)
      .slice(0, 6);
    let bestScore = 0;
    let bestPopupId: string | null = null;
    for (const [candidatePopupId, values] of index.textByPopupId.entries()) {
      const candidateText = values.join(" ");
      let candidateScore = scoreTextMatch(candidateText, candidatePopupId);
      for (const hint of hintPool) {
        candidateScore = Math.max(candidateScore, scoreTextMatch(candidateText, hint));
      }
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestPopupId = candidatePopupId;
      }
    }
    if (bestPopupId && bestScore > 5) {
      popupId = bestPopupId;
    }
  }
  if (!popupId) return null;
  const triggerSelector =
    index.triggersByPopupId.get(popupId)?.[0] ||
    (closestDialogTrigger ? buildElementSelector(closestDialogTrigger) : null) ||
    null;
  const containerSelector =
    index.containerByPopupId.get(popupId) ||
    (closestContainer ? buildElementSelector(closestContainer) : null) ||
    null;
  return {
    popupId,
    triggerSelector,
    containerSelector,
  };
}

function findBestAnnotationMatchInHtml(
  htmlContent: string,
  annotation: PdfAnnotationRecord,
  context: "slide-canvas" | "shared-popup",
): AnnotationMatchResult {
  if (!htmlContent.trim()) {
    return { selector: null, score: 0, audit: EMPTY_POPUP_AUDIT, matchedTagName: null };
  }

  try {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(htmlContent, "text/html");
    const audit = runPopupDomAudit(documentNode, context);
    const targets = annotation.threadEntries
      .map((entry) => cleanText(entry.text))
      .filter((entry) => entry.length > 2);
    if (annotation.pdfContextText) {
      const contextHint = cleanText(annotation.pdfContextText);
      if (contextHint.length > 2) {
        targets.push(contextHint);
      }
    }
    if (!targets.length) {
      return { selector: null, score: 0, audit, matchedTagName: null };
    }

    const candidates = [...documentNode.body.querySelectorAll("*")].filter((element) => {
      const tag = element.tagName.toLowerCase();
      return !["script", "style", "meta", "link", "head"].includes(tag);
    });

    let bestElement: Element | null = null;
    let bestTagName: string | null = null;
    let bestScore = 0;
    const annotationLooksImageBased = targets.some((entry) =>
      /\b(image|logo|icon|figure|chart|video|screenshot)\b/i.test(entry),
    );

    for (const element of candidates) {
      const text = cleanText(element.textContent || "");
      if (!text) continue;

      let score = 0;
      for (const target of targets) {
        score = Math.max(score, scoreTextMatch(text, target));
      }

      if (!score) continue;
      if (
        element.classList.contains("openDialog") ||
        element.hasAttribute("data-dialog") ||
        element.tagName.toLowerCase() === "button" ||
        element.tagName.toLowerCase() === "a"
      ) {
        score += 12;
      }
      const insidePopupContext = Boolean(
        element.closest(".popup, [data-popup-id], [role='dialog'], .modal, .dialog"),
      );
      if (annotation.subtype === "Popup" && insidePopupContext) {
        score += 20;
      }
      if (
        annotation.subtype === "Popup" &&
        (element.classList.contains("openDialog") || element.hasAttribute("data-dialog"))
      ) {
        score += 30;
      }
      const tag = element.tagName.toLowerCase();
      const elementId = (element.id || "").toLowerCase();
      const elementClass = (element.className || "").toLowerCase();
      
      const isMedia = ["img", "video", "canvas", "svg", "picture"].includes(tag);
      if (!annotationLooksImageBased && isMedia) {
        score -= 18;
      }

      // --- SEMANTIC BOOST FOR NAVBOTTOM POPUPS ---
      const isSpecialPopupType = targets.some(t => /\b(pi|si|isi|reference|ref|safety|prescribing)\b/i.test(t));
      if (isSpecialPopupType) {
        const isPiMatch = elementId === "pi" || elementClass.includes("pi");
        const isSiMatch = elementId === "si" || elementId === "isi" || elementClass.includes("si") || elementClass.includes("isi");
        const isRefMatch = elementId.includes("ref") || elementClass.includes("ref") || elementId.includes("footnote");
        
        if (isPiMatch || isSiMatch || isRefMatch) {
          score += 65; // Massive boost to prioritize navBottom triggers
        }
        if (elementClass.includes("gotoslide")) {
          score += 15;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestElement = element;
        bestTagName = tag;
      }
    }

    return {
      selector: bestElement ? buildElementSelector(bestElement) : null,
      score: bestScore,
      audit,
      matchedTagName: bestTagName,
    };
  } catch {
    return { selector: null, score: 0, audit: EMPTY_POPUP_AUDIT, matchedTagName: null };
  }
}

function resolveAnnotationSelector(
  htmlContent: string,
  annotation: PdfAnnotationRecord,
): AnnotationMatchResult {
  return findBestAnnotationMatchInHtml(htmlContent, annotation, "slide-canvas");
}

const SHARED_MATCH_SCORE_THRESHOLD = 80;

type SharedHtmlCandidate = {
  path: string;
  content: string;
};

function classifySharedPath(filePath: string): string {
  const normalized = normalizePath(filePath).toLowerCase();
  if (normalized.includes("/shared/")) {
    if (/\bpi\b|pitab|prescribing/.test(normalized)) return "PI";
    if (/\bsi\b|\bisi\b|safety/.test(normalized)) return "SI";
    if (/reference|ref|footnote|abbrev/.test(normalized)) return "Reference";
    return "Custom Popup";
  }
  return "Slide";
}

function findSharedAnnotationMatch(
  candidates: SharedHtmlCandidate[],
  annotation: PdfAnnotationRecord,
): {
  path: string;
  selector: string;
  score: number;
  audit: PopupDomAuditReport;
  matchedTagName: string | null;
} | null {
  let best:
    | {
        path: string;
        selector: string;
        score: number;
        audit: PopupDomAuditReport;
        matchedTagName: string | null;
      }
    | null = null;

  for (const candidate of candidates) {
    const { selector, score, audit, matchedTagName } = findBestAnnotationMatchInHtml(
      candidate.content,
      annotation,
      "shared-popup",
    );
    if (!selector || score <= 0) continue;
    if (!best || score > best.score) {
      best = { path: candidate.path, selector, score, audit, matchedTagName };
    }
  }

  if (!best || best.score < SHARED_MATCH_SCORE_THRESHOLD) return null;
  return best;
}

export function mapPdfAnnotationsToPageClusters(
  annotations: PdfAnnotationRecord[],
  pageClusters: PdfPageClusterRecord[],
  files: FileMap,
): PdfAnnotationUiRecord[] {
  const clusterByPage = new Map(pageClusters.map((entry) => [entry.pdfPageNumber, entry]));
  const sharedHtmlCandidates: SharedHtmlCandidate[] = Object.values(files)
    .filter(
      (file) =>
        file.type === "html" &&
        normalizePath(file.path).includes("/shared/") &&
        typeof file.content === "string" &&
        file.content.trim().length > 0,
    )
    .map((file) => ({
      path: normalizePath(file.path),
      content: String(file.content),
    }))
    .sort((left, right) => {
      const leftPriority = left.path.includes("/shared/media/content/") ? 0 : 1;
      const rightPriority = right.path.includes("/shared/media/content/") ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.path.localeCompare(right.path);
    });
  const parsedDocCache = new Map<string, Document | null>();
  const getParsedDocument = (path: string | null): Document | null => {
    if (!path) return null;
    if (parsedDocCache.has(path)) return parsedDocCache.get(path) || null;
    const content = files[path]?.content;
    if (typeof content !== "string" || !content.trim()) {
      parsedDocCache.set(path, null);
      return null;
    }
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(content, "text/html");
      parsedDocCache.set(path, parsed);
      return parsed;
    } catch {
      parsedDocCache.set(path, null);
      return null;
    }
  };

  // --- PRE-CALCULATE PAGE CONTEXT MEMORY ---
  const pageToParentSlideMap = new Map<number, { path: string; slideId: string | null }>();
  let lastSeenMainSlide: { path: string; slideId: string | null } | null = null;
  
  // Sort clusters by PDF page number to establish sequence
  const sortedClusters = [...pageClusters].sort((a, b) => a.pdfPageNumber - b.pdfPageNumber);
  for (const cluster of sortedClusters) {
    // Defensive guard: even if clustering logic fails, never inherit a shared path as a "Main" slide.
    const isSharedPath = /(^|[\\/])shared([\\/]|$)/i.test(cluster.mappedFilePath || "");
    if (cluster.detectedPageType === "Main" && !isSharedPath) {
      lastSeenMainSlide = { path: cluster.mappedFilePath!, slideId: cluster.mappedSlideId };
    }
    if (lastSeenMainSlide) {
      pageToParentSlideMap.set(cluster.pdfPageNumber, lastSeenMainSlide);
    }
  }

  return annotations.map((annotation) => {
    const cluster = clusterByPage.get(annotation.annoPdfPage) || null;
    const parentSlide = pageToParentSlideMap.get(annotation.annoPdfPage) || null;

    const pageWidth = Math.max(1, annotation.pageSize.width || 1);
    const pageHeight = Math.max(1, annotation.pageSize.height || 1);

    const annotationTextMerged = (annotation.annotationText + " " + (annotation.pdfContextText || "")).toLowerCase();
    const isMainSlide = cluster?.detectedPageType === "Main";
    const hasSemanticKeywords = /\b(pi|si|isi|ssi|qr|prescribing|safety|referenc|ref|citation|footnote)\w*/i.test(annotationTextMerged);
    const isDescriptiveNote = annotationTextMerged.length > 140;
    const isSemanticMappingTarget = hasSemanticKeywords && !isDescriptiveNote && !isMainSlide;
    const isClusterShared = cluster?.mappedFilePath && /(^|[\\/])shared([\\/]|$)/i.test(cluster.mappedFilePath);

    // If it's a semantic popup OR if the visual match is in shared folder,
    // we strictly prioritize the PARENT SLIDE path.
    // We MUST search the parent slide's HTML to find the local triggers/context.
    const targetFilePathForSearch = (isSemanticMappingTarget || isClusterShared)
      ? (parentSlide?.path || cluster?.mappedFilePath || null)
      : (cluster?.mappedFilePath || parentSlide?.path || null);
    
    const htmlContent =
      targetFilePathForSearch &&
      typeof files[targetFilePathForSearch]?.content === "string"
        ? String(files[targetFilePathForSearch]?.content)
        : "";

    let localMatch = htmlContent
      ? resolveAnnotationSelector(htmlContent, annotation)
      : {
          selector: null,
          score: 0,
          audit: EMPTY_POPUP_AUDIT,
          matchedTagName: null,
        };

    // --- FALLBACK LOGIC: If Safety/SSI is mentioned but selector is null, try PI ---
    if (isSemanticMappingTarget && !localMatch.selector && /\b(si|isi|ssi|safety)\w*/i.test(annotationTextMerged)) {
      const piRegex = /\b(pi|pitab|prescribing|qr)\w*/i;
      const piMatch = resolveAnnotationSelector(htmlContent, {
        ...annotation,
        annotationText: "PI prescribing information" // Force a PI search
      });
      if (piMatch.selector) {
        localMatch = piMatch;
      }
    }

    const sharedMatch =
      cluster?.detectedPageType !== "Main"
        ? findSharedAnnotationMatch(sharedHtmlCandidates, annotation)
        : null;

    // --- NEW LOGIC: Prefer Local Match if it's strong ---
    const LOCAL_PRIORITY_THRESHOLD = 30;
    const useLocalOverShared = isSemanticMappingTarget || 
                               isClusterShared ||
                               (localMatch.selector && (localMatch.score >= LOCAL_PRIORITY_THRESHOLD || !sharedMatch));

    const mappedFilePath = useLocalOverShared
      ? targetFilePathForSearch
      : (sharedMatch?.path || targetFilePathForSearch);

    // VITAL FIX: If it's a semantic popup (PI/SI/Ref/QR) OR if it visually landed in shared,
    // we MANDATE the slide ID to be the parent slide.
    // This prevents "shared" Slide ID from appearing in the UI.
    const mappedSlideId = (isSemanticMappingTarget || isClusterShared)
      ? (parentSlide?.slideId || cluster?.mappedSlideId || null)
      : (useLocalOverShared
          ? (cluster?.mappedSlideId || parentSlide?.slideId || null)
          : (sharedMatch ? "shared" : (cluster?.mappedSlideId || parentSlide?.slideId || null)));

    const matchMethod = useLocalOverShared
      ? (isSemanticMappingTarget ? "Semantic contextual match" : (localMatch.score > 100 ? "Local exact match" : "Local heuristic match"))
      : (sharedMatch ? "Shared text match" : (cluster?.matchMethod || "Inherited context"));

    const foundSelector = useLocalOverShared
      ? localMatch.selector
      : (sharedMatch ? sharedMatch.selector : localMatch.selector);

    const matchedTagName = useLocalOverShared
      ? localMatch.matchedTagName
      : (sharedMatch ? sharedMatch.matchedTagName : localMatch.matchedTagName);
    const popupInvocation = (() => {
      const resolvedDoc = getParsedDocument(mappedFilePath);
      if (!resolvedDoc) return null;
      return resolvePopupInvocationForMatch(
        resolvedDoc,
        foundSelector,
        [
          annotation.annotationText,
          annotation.pdfContextText || "",
          ...annotation.threadEntries.map((entry) => entry.text),
        ],
      );
    })();
    const derivedAnnotationStatus = sharedMatch
      ? "Popup"
      : annotation.subtype === "Popup" ||
          cluster?.detectedPageType === "Child/Popup"
        ? "Popup"
        : cluster?.detectedPageType === "Main"
          ? "Slide"
          : "Popup";
    const annotationLocationType = "Slide";
    const status = sharedMatch
      ? "Mapped"
      : cluster?.detectedPageType === "Unmapped"
        ? "Not Found"
        : "Mapped";
    const popupDomAudit = mergePopupDomAudits(
      [localMatch.audit, sharedMatch?.audit || EMPTY_POPUP_AUDIT].filter(Boolean),
    );
    if (!popupDomAudit.assertionPassed) {
      throw new Error("Popup DOM audit failed: interactive actions were triggered.");
    }
    const mlClassification = classifyAnnotationWithMl({
      subtype: annotation.subtype,
      text: annotation.annotationText,
      threadText: annotation.threadEntries.map((entry) => entry.text),
      foundSelector,
      mappedFilePath,
      locationType: derivedAnnotationStatus,
      matchMethod,
      targetTagName: matchedTagName,
    });

    // --- SEMANTIC OVERRIDE FOR INTENT LABELS ---
    // For labels, we are more generous. We override if it's concise OR if ML already suspects a reference.
    // BUT we strictly respect the user's wish: if it's a main slide, don't force popup labels.
    const isSemanticIntentTarget = hasSemanticKeywords && !isMainSlide && (!isDescriptiveNote || mlClassification.annotationIntent.label === "referenceChange");
    let finalIntent = mlClassification.annotationIntent.label;
    if (isSemanticIntentTarget) {
      const lowerText = annotationTextMerged;
      if (/\b(pi|pitab|prescribing|qr)\w*/i.test(lowerText)) {
        finalIntent = "piChange" as any;
      } else if (/\b(si|isi|ssi|safety)\w*/i.test(lowerText)) {
        finalIntent = "siChange" as any;
      } else if (/\b(ref|referenc|footnote|citation)\w*/i.test(lowerText)) {
        finalIntent = "referenceChange" as any;
      }
    }
    const semanticPopupIntent =
      finalIntent === "piChange" ||
      finalIntent === "siChange" ||
      finalIntent === "referenceChange";
    const normalizedAnnotationStatus = semanticPopupIntent
      ? "Popup"
      : derivedAnnotationStatus;

    return {
      ...annotation,
      annotationType: finalIntent, // Override type with semantic intent
      detectedSubtype: mlClassification.annotationType.label,
      detectedSubtypeConfidence: mlClassification.annotationType.confidence,
      annotationIntent: finalIntent,
      annotationIntentConfidence: 1.0, // High confidence for semantic match
      popupOwnership: mlClassification.popupOwnership.label,
      popupOwnershipConfidence: mlClassification.popupOwnership.confidence,
      annotationStatus: normalizedAnnotationStatus,
      annotationLocationType,
      status,
      matchMethod,
      mappedSlideId,
      mappedFilePath,
      detectedPageType: isSemanticMappingTarget ? "Child/Popup" : (cluster?.detectedPageType || "Unmapped"),
      foundSelector,
      popupInvocation,
      popupDomAudit,
      positionPct: {
        left: round((annotation.position.x / pageWidth) * 100),
        top: round((annotation.position.y / pageHeight) * 100),
        width: round((annotation.position.width / pageWidth) * 100),
        height: round((annotation.position.height / pageHeight) * 100),
      },
    };
  });
}

export async function buildMappedPdfAnnotations(options: {
  pdfData: Uint8Array;
  files: FileMap;
  absolutePathIndex: Record<string, string>;
  readBinaryFile: (absolutePath: string) => Promise<ArrayBuffer>;
  preExtractedAnnotations?: PdfAnnotationRecord[] | null;
}): Promise<PdfAnnotationUiRecord[]> {
  const {
    pdfData,
    files,
    absolutePathIndex,
    readBinaryFile,
    preExtractedAnnotations = null,
  } = options;
  const mappingPdfData = new Uint8Array(pdfData);
  const annotationsAndHashes = preExtractedAnnotations
    ? null
    : await extractPdfAnnotationsAndPageHashes(mappingPdfData);
  const annotations = (preExtractedAnnotations || annotationsAndHashes?.annotations || []).filter(anno => {
    const text = anno.annotationText || "";
    const isNoise = 
      /AI rule|Execution ID|Rule ID|Marker ID|Rule Execution ID|Adverse Event Statement|Generic Name\(s\)/i.test(text);
    return !isNoise;
  });
  const pdfPageHashes = preExtractedAnnotations
    ? await renderPdfPageHashes(mappingPdfData)
    : annotationsAndHashes?.pdfPageHashes || [];

  const thumbs = collectProjectThumbs(files, absolutePathIndex);
  if (!thumbs.length) {
    return mapPdfAnnotationsToPageClusters(
      annotations,
      pdfPageHashes.map((page) => ({
        pdfPageNumber: page.pdfPageNumber,
        detectedPageType: "Unmapped",
        mappedSlideId: null,
        mappedFilePath: null,
        parentMainSlidePdfPage: null,
        matchMethod: "No thumbnails",
      })),
      files,
    );
  }

  // Initialize ResourceScanner for Deep Matching
  resourceScanner.scan(files);

  const thumbHashes = await buildThumbHashes(
    thumbs,
    readBinaryFile,
    absolutePathIndex,
  );
  
  // Update ResourceScanner index with visual hashes for Deep Matching
  const index = resourceScanner.getFullIndex();
  thumbHashes.forEach(th => {
    if (index.slides[th.slideId]) {
      index.slides[th.slideId].visualHash = th.hash.toString();
    }
  });

  const pageMatches = buildPdfPageMatches(pdfPageHashes, thumbHashes);

  const { pageClusters } = clusterPdfPagesWithDeepIntelligence(
    pdfPageHashes,
    pageMatches,
    thumbHashes,
    annotations,
  );


  const finalRecords = mapPdfAnnotationsToPageClusters(annotations, pageClusters, files);

  // Attach images from pdfPageHashes if records don't have them yet (important for preExtractedAnnotations path)
  if (preExtractedAnnotations) {
    const imageMap = new Map(pdfPageHashes.map(h => [h.pdfPageNumber, h.image]));
    finalRecords.forEach(r => {
      if (!r.pdfPageImage) {
        r.pdfPageImage = imageMap.get(r.annoPdfPage);
      }
    });
  }

  return finalRecords;
}

export function evaluateAnnotationTypeClassifier(
  records: PdfAnnotationUiRecord[],
): MetricsReport {
  const truths = records.map((record) => record.subtype || "Text");
  const predictions = records.map((record) => record.detectedSubtype || "Text");
  return computeMetrics(truths, predictions);
}
