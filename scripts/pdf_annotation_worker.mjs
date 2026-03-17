import fs from "node:fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

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
const round = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000;
const cleanText = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const normalizeReferenceKey = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized || null;
  }
  if (Array.isArray(value) && value.length > 0) return normalizeReferenceKey(value[0]);
  if (typeof value === "object") {
    if (value.id !== undefined) return normalizeReferenceKey(value.id);
    if (value.num !== undefined) return normalizeReferenceKey(value.num);
    if (value.ref !== undefined) return normalizeReferenceKey(value.ref);
  }
  return null;
};

const getAnnotationKey = (annotation, fallbackIndex) =>
  normalizeReferenceKey(annotation?.id) ||
  normalizeReferenceKey(annotation?.annotationId) ||
  normalizeReferenceKey(annotation?.ref) ||
  String(fallbackIndex + 1);

const resolveInReplyToKey = (annotation) =>
  normalizeReferenceKey(annotation?.inReplyTo) ||
  normalizeReferenceKey(annotation?.inReplyToId) ||
  normalizeReferenceKey(annotation?.IRT) ||
  normalizeReferenceKey(annotation?.irt) ||
  normalizeReferenceKey(annotation?.inReplyToRef) ||
  null;

const resolveParentAnnotationKey = (annotation) =>
  normalizeReferenceKey(annotation?.parentId) ||
  normalizeReferenceKey(annotation?.parent) ||
  normalizeReferenceKey(annotation?.parentRef) ||
  null;

const extractAnnotationAuthor = (annotation) => {
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
};

const extractAnnotationText = (annotation) => {
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
};

const normalizeRect = (rect, pageHeight) => {
  if (!Array.isArray(rect) || rect.length < 4) {
    return { x: 0, y: 0, width: 0, height: 0, unit: POSITION_UNIT };
  }
  const [x1, y1, x2, y2] = rect.map((value) => Number(value) || 0);
  const left = Math.min(x1, x2);
  const top = Number(pageHeight) - Math.max(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { x: round(left), y: round(top), width: round(width), height: round(height), unit: POSITION_UNIT };
};

const normalizeQuadPoints = (quadPoints, pageHeight) => {
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
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return normalizeRect([minX, minY, maxX, maxY], pageHeight);
};

const extractAnnotationPosition = (annotation, pageHeight) =>
  normalizeQuadPoints(annotation?.quadPoints, pageHeight) || normalizeRect(annotation?.rect, pageHeight);

const hasUsablePosition = (position) =>
  Boolean(position) &&
  (Number(position.width) > 0 || Number(position.height) > 0 || Number(position.x) > 0 || Number(position.y) > 0);

const selectThreadAnchor = (threadMembers, annotationLookup, pageHeight) => {
  const candidates = [];
  for (const member of threadMembers) {
    const annotation = member?.annotation;
    if (!annotation) continue;
    const parentKey = resolveParentAnnotationKey(annotation);
    if (annotation.subtype === "Popup" && parentKey && annotationLookup.has(parentKey)) {
      candidates.push(annotationLookup.get(parentKey)?.annotation);
    }
    candidates.push(annotation);
  }
  const evaluated = candidates.filter(Boolean).map((annotation) => ({
    annotation,
    position: extractAnnotationPosition(annotation, pageHeight),
  }));
  const withPosition = evaluated.filter((entry) => hasUsablePosition(entry.position));
  const preferredNonPopup = withPosition.find((entry) => entry.annotation?.subtype !== "Popup");
  if (preferredNonPopup) return preferredNonPopup.annotation;
  if (withPosition.length > 0) return withPosition[0].annotation;
  return candidates[0] || null;
};

const extractPageTextFragments = async (page, pageHeight) => {
  try {
    const textContent = await page.getTextContent();
    const fragments = [];
    for (const item of textContent.items || []) {
      const rawText = cleanText(item?.str);
      if (!rawText) continue;
      const transform = item?.transform;
      const x = Number(Array.isArray(transform) ? transform[4] : 0) || 0;
      const baselineY = Number(Array.isArray(transform) ? transform[5] : 0) || 0;
      const width = Math.max(1, Number(item?.width) || 1);
      const height = Math.max(1, Math.abs(Number(item?.height) || 12));
      const y = Number(pageHeight) - baselineY - height;
      fragments.push({ text: rawText, x: round(x), y: round(y), width: round(width), height: round(height) });
    }
    return fragments;
  } catch {
    return [];
  }
};

const extractNearbyPdfText = (position, fragments) => {
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
    .sort((a, b) => (Math.abs(a.y - b.y) <= 6 ? a.x - b.x : a.y - b.y))
    .map((fragment) => fragment.text);
  return nearby.length ? cleanText(nearby.join(" ")) : "";
};

const buildThreadedPdfAnnotationsForPage = ({ annotations, pageNumber, pageHeight, pageSize, pageTextFragments }) => {
  if (!annotations.length) return [];
  const annotationLookup = new Map();
  annotations.forEach((annotation, index) => {
    const key = getAnnotationKey(annotation, index);
    annotationLookup.set(key, { key, index, annotation });
  });
  const rootCache = new Map();
  const resolveRootKey = (startKey) => {
    if (rootCache.has(startKey)) return rootCache.get(startKey);
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
  const threads = new Map();
  annotations.forEach((annotation, index) => {
    const key = getAnnotationKey(annotation, index);
    const replyTo = resolveInReplyToKey(annotation);
    const popupParent = annotation.subtype === "Popup" ? resolveParentAnnotationKey(annotation) : null;
    const threadLink = replyTo || popupParent;
    const baseRoot = threadLink && annotationLookup.has(threadLink) ? threadLink : key;
    const rootKey = resolveRootKey(baseRoot);
    const isReply = Boolean(replyTo);
    if (!threads.has(rootKey)) threads.set(rootKey, { members: [] });
    threads.get(rootKey).members.push({ key, index, annotation, isReply });
  });
  const extracted = [];
  threads.forEach((thread, rootKey) => {
    const orderedMembers = [...thread.members].sort((l, r) => l.index - r.index);
    const threadEntries = [];
    const seen = new Set();
    let hasComment = false;
    orderedMembers.forEach((member) => {
      const text = cleanText(extractAnnotationText(member.annotation));
      if (!text) return;
      
      const author = extractAnnotationAuthor(member.annotation);
      
      // Filter out AI-generated annotations (Brand Guardian, Rule Engine Logs)
      const isNoise = 
        author === 'Brand Guardian' || 
        /AI rule|Execution ID|Rule ID|Marker ID|Rule Execution ID|Adverse Event Statement|Generic Name\(s\)/i.test(text);
      if (isNoise) return;

      const dedupeKey = `${author.toLowerCase()}::${text.toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const role = !hasComment && !member.isReply ? "comment" : "reply";
      threadEntries.push({ role, author, text });
      if (role === "comment") hasComment = true;
    });
    if (!threadEntries.length) return;
    if (!threadEntries.some((entry) => entry.role === "comment")) threadEntries[0].role = "comment";
    const annotationText = threadEntries.map((entry) => `${entry.text} |@| ${entry.author}`).join(" | | ");
    const anchor = selectThreadAnchor(orderedMembers, annotationLookup, pageHeight);
    const anchorPosition = extractAnnotationPosition(anchor, pageHeight);
    const pdfContextText = extractNearbyPdfText(anchorPosition, pageTextFragments);
    const rootSubtype = annotationLookup.get(rootKey)?.annotation?.subtype || orderedMembers[0]?.annotation?.subtype || "Text";
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
};

const main = async () => {
  const [, , pdfPath, outputPath] = process.argv;
  if (!pdfPath || !outputPath) {
    process.stderr.write("Usage: node scripts/pdf_annotation_worker.mjs <pdfPath> <outputPath>\n");
    process.exit(1);
  }
  const pdfBuffer = await fs.readFile(pdfPath);
  const data = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableWorker: true,
  });
  const pdfDocument = await loadingTask.promise;
  const extracted = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const pageSize = { width: round(viewport.width), height: round(viewport.height) };
    const annotations = await page.getAnnotations({ intent: "display" });
    const pageTextFragments = await extractPageTextFragments(page, pageSize.height);
    const supported = annotations.filter((annotation) => SUPPORTED_ANNOTATION_SUBTYPES.has(annotation?.subtype));
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
  await fs.writeFile(outputPath, JSON.stringify({ annotations: extracted }), "utf8");
};

main().catch((error) => {
  process.stderr.write(String(error?.stack || error?.message || error));
  process.exit(1);
});
