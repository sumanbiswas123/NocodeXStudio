export type AnnotationIntentLabel =
  | "stylingChange"
  | "textualChange"
  | "textInImage"
  | "notFound"
  | "referenceChange"
  | "assetChange"
  | "flowChange";

export type PopupOwnershipLabel =
  | "slide-canvas"
  | "slide-popup"
  | "shared-popup"
  | "unknown";

export type AnnotationSubtypeLabel =
  | "Text"
  | "Highlight"
  | "FreeText"
  | "Popup"
  | "Square"
  | "Circle"
  | "Line"
  | "Ink"
  | "Polygon"
  | "PolyLine"
  | "Underline"
  | "StrikeOut"
  | "Squiggly"
  | "Caret";

const SUBTYPE_LABELS: AnnotationSubtypeLabel[] = [
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
];

const INTENT_LABELS: AnnotationIntentLabel[] = [
  "stylingChange",
  "textualChange",
  "textInImage",
  "notFound",
  "referenceChange",
  "assetChange",
  "flowChange",
];

const OWNERSHIP_LABELS: PopupOwnershipLabel[] = [
  "slide-canvas",
  "slide-popup",
  "shared-popup",
  "unknown",
];

export interface AnnotationMlInput {
  subtype: string;
  text: string;
  threadText: string[];
  foundSelector: string | null;
  mappedFilePath: string | null;
  locationType: string;
  matchMethod: string;
  targetTagName?: string | null;
}

export interface LabelPrediction<T extends string> {
  label: T;
  confidence: number;
  scores: Record<T, number>;
}

export interface AnnotationMlOutput {
  annotationType: LabelPrediction<AnnotationSubtypeLabel>;
  annotationIntent: LabelPrediction<AnnotationIntentLabel>;
  popupOwnership: LabelPrediction<PopupOwnershipLabel>;
  featureVector: number[];
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((value) => Math.exp(value - max));
  const sum = exps.reduce((acc, value) => acc + value, 0) || 1;
  return exps.map((value) => value / sum);
}

function makeKeywordFeature(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase();
  const matches = keywords.filter((keyword) => normalized.includes(keyword)).length;
  return sigmoid(matches * 1.2);
}

function normalizeSubtype(subtype: string): AnnotationSubtypeLabel {
  if (SUBTYPE_LABELS.includes(subtype as AnnotationSubtypeLabel)) {
    return subtype as AnnotationSubtypeLabel;
  }
  return "Text";
}

function isMediaTag(tagName: string | null | undefined): boolean {
  if (!tagName) return false;
  const normalized = tagName.toLowerCase();
  return ["img", "image", "video", "canvas", "svg", "picture"].includes(normalized);
}

export function extractAnnotationFeatureVector(input: AnnotationMlInput): number[] {
  const mergedText = [input.text, ...input.threadText].join(" ").toLowerCase();
  const normalizedPath = (input.mappedFilePath || "").toLowerCase();
  const sharedPath = (normalizedPath.includes("/shared/") || normalizedPath.startsWith("shared/"))
    ? 1
    : 0;
  const selectorFound = input.foundSelector ? 1 : 0;
  const isPopupSubtype = normalizeSubtype(input.subtype) === "Popup" ? 1 : 0;
  const locationPopup = /popup/i.test(input.locationType) ? 1 : 0;
  const locationUnmapped = /unmapped/i.test(input.locationType) ? 1 : 0;
  const mapBySharedMatch = /shared/i.test(input.matchMethod) ? 1 : 0;
  const textLen = Math.min(1, mergedText.length / 320);
  const hasStyleCue = makeKeywordFeature(mergedText, [
    "font",
    "color",
    "bold",
    "underline",
    "highlight",
    "style",
    "mark",
  ]);
  const hasTextCue = makeKeywordFeature(mergedText, [
    "text",
    "word",
    "copy",
    "sentence",
    "spelling",
    "title",
    "replace",
  ]);
  const hasImageCue = makeKeywordFeature(mergedText, [
    "logo",
    "image",
    "icon",
    "picture",
    "graphic",
    "asset",
  ]);
  const hasReferenceCue = makeKeywordFeature(mergedText, [
    "reference",
    "referencias",
    "citation",
    "pi",
    "isi",
    "safety",
    "prescribing",
    "footnote",
  ]);
  const hasFlowCue = makeKeywordFeature(mergedText, [
    "slide",
    "flow",
    "navigate",
    "next",
    "previous",
    "go to",
    "open",
  ]);
  const hasAssetCue = makeKeywordFeature(mergedText, [
    "asset",
    "chart",
    "table",
    "figure",
    "svg",
    "png",
    "replace image",
  ]);
  const hasMediaTarget = isMediaTag(input.targetTagName) ? 1 : 0;

  const subtypeOneHot = SUBTYPE_LABELS.map((label) =>
    label === normalizeSubtype(input.subtype) ? 1 : 0,
  );

  return [
    ...subtypeOneHot,
    sharedPath,
    selectorFound,
    isPopupSubtype,
    locationPopup,
    locationUnmapped,
    mapBySharedMatch,
    textLen,
    hasStyleCue,
    hasTextCue,
    hasImageCue,
    hasReferenceCue,
    hasFlowCue,
    hasAssetCue,
    hasMediaTarget,
  ];
}

function inferSubtype(featureVector: number[]): LabelPrediction<AnnotationSubtypeLabel> {
  const logits = SUBTYPE_LABELS.map((_, index) => {
    const oneHot = featureVector[index] || 0;
    const hasTextCue = featureVector[SUBTYPE_LABELS.length + 8] || 0;
    const hasStyleCue = featureVector[SUBTYPE_LABELS.length + 7] || 0;
    return oneHot * 8 + hasTextCue * 0.12 + hasStyleCue * 0.08;
  });
  const probabilities = softmax(logits);
  const bestIndex = probabilities.reduce(
    (best, value, index) => (value > probabilities[best] ? index : best),
    0,
  );
  const scores = Object.fromEntries(
    SUBTYPE_LABELS.map((label, index) => [label, round4(probabilities[index])]),
  ) as Record<AnnotationSubtypeLabel, number>;
  return {
    label: SUBTYPE_LABELS[bestIndex],
    confidence: round4(probabilities[bestIndex]),
    scores,
  };
}

function inferIntent(featureVector: number[]): LabelPrediction<AnnotationIntentLabel> {
  const offset = SUBTYPE_LABELS.length;
  const sharedPath = featureVector[offset] || 0;
  const selectorFound = featureVector[offset + 1] || 0;
  const locationUnmapped = featureVector[offset + 4] || 0;
  const hasStyleCue = featureVector[offset + 7] || 0;
  const hasTextCue = featureVector[offset + 8] || 0;
  const hasImageCue = featureVector[offset + 9] || 0;
  const hasReferenceCue = featureVector[offset + 10] || 0;
  const hasFlowCue = featureVector[offset + 11] || 0;
  const hasAssetCue = featureVector[offset + 12] || 0;
  const hasMediaTarget = featureVector[offset + 13] || 0;
  const isPopupSubtype = featureVector[offset + 2] || 0;
  const logits = [
    hasStyleCue * 4 + selectorFound * 0.3,
    hasTextCue * 4 + selectorFound * 0.4 + (1 - hasMediaTarget) * 0.8,
    hasImageCue * 3.2 + hasAssetCue * 0.8 + hasMediaTarget * 2.6,
    locationUnmapped * 2.8 + (1 - selectorFound) * 1.9,
    hasReferenceCue * 4 + sharedPath * 1.2 + isPopupSubtype * 0.5,
    hasAssetCue * 4 + hasImageCue * 0.8,
    hasFlowCue * 4 + isPopupSubtype * 0.4,
  ];
  const probabilities = softmax(logits);
  const bestIndex = probabilities.reduce(
    (best, value, index) => (value > probabilities[best] ? index : best),
    0,
  );
  const scores = Object.fromEntries(
    INTENT_LABELS.map((label, index) => [label, round4(probabilities[index])]),
  ) as Record<AnnotationIntentLabel, number>;
  return {
    label: INTENT_LABELS[bestIndex],
    confidence: round4(probabilities[bestIndex]),
    scores,
  };
}

function inferPopupOwnership(featureVector: number[]): LabelPrediction<PopupOwnershipLabel> {
  const offset = SUBTYPE_LABELS.length;
  const sharedPath = featureVector[offset] || 0;
  const isPopupSubtype = featureVector[offset + 2] || 0;
  const locationPopup = featureVector[offset + 3] || 0;
  const locationUnmapped = featureVector[offset + 4] || 0;
  const logits = [
    (1 - sharedPath) * 2.8 + (1 - locationPopup) * 1.6,
    isPopupSubtype * 2.6 + locationPopup * 1.4 + (1 - sharedPath) * 0.7,
    sharedPath * 4.2 + locationPopup * 0.5,
    locationUnmapped * 2.4 + (1 - isPopupSubtype) * 0.5,
  ];
  const probabilities = softmax(logits);
  const bestIndex = probabilities.reduce(
    (best, value, index) => (value > probabilities[best] ? index : best),
    0,
  );
  const scores = Object.fromEntries(
    OWNERSHIP_LABELS.map((label, index) => [label, round4(probabilities[index])]),
  ) as Record<PopupOwnershipLabel, number>;
  return {
    label: OWNERSHIP_LABELS[bestIndex],
    confidence: round4(probabilities[bestIndex]),
    scores,
  };
}

export function classifyAnnotationWithMl(input: AnnotationMlInput): AnnotationMlOutput {
  const featureVector = extractAnnotationFeatureVector(input);
  return {
    annotationType: inferSubtype(featureVector),
    annotationIntent: inferIntent(featureVector),
    popupOwnership: inferPopupOwnership(featureVector),
    featureVector,
  };
}

export interface ClassificationMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface MetricsReport {
  macro: ClassificationMetrics;
  micro: ClassificationMetrics;
  byLabel: Record<string, ClassificationMetrics>;
}

function metricRound(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function computeMetrics(labels: string[], predictions: string[]): MetricsReport {
  const unique = Array.from(new Set([...labels, ...predictions]));
  const byLabel: Record<string, ClassificationMetrics> = {};
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;
  let totalSupport = 0;
  for (const label of unique) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;
    for (let index = 0; index < labels.length; index += 1) {
      const truth = labels[index];
      const predicted = predictions[index];
      if (truth === label) support += 1;
      if (truth === label && predicted === label) tp += 1;
      if (truth !== label && predicted === label) fp += 1;
      if (truth === label && predicted !== label) fn += 1;
    }
    totalTp += tp;
    totalFp += fp;
    totalFn += fn;
    totalSupport += support;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 =
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    byLabel[label] = {
      precision: metricRound(precision),
      recall: metricRound(recall),
      f1: metricRound(f1),
      support,
    };
  }
  const labelMetrics = Object.values(byLabel);
  const macroPrecision =
    labelMetrics.reduce((acc, metric) => acc + metric.precision, 0) /
    (labelMetrics.length || 1);
  const macroRecall =
    labelMetrics.reduce((acc, metric) => acc + metric.recall, 0) /
    (labelMetrics.length || 1);
  const macroF1 =
    labelMetrics.reduce((acc, metric) => acc + metric.f1, 0) /
    (labelMetrics.length || 1);
  const microPrecision = totalTp + totalFp === 0 ? 0 : totalTp / (totalTp + totalFp);
  const microRecall = totalTp + totalFn === 0 ? 0 : totalTp / (totalTp + totalFn);
  const microF1 =
    microPrecision + microRecall === 0
      ? 0
      : (2 * microPrecision * microRecall) / (microPrecision + microRecall);
  return {
    macro: {
      precision: metricRound(macroPrecision),
      recall: metricRound(macroRecall),
      f1: metricRound(macroF1),
      support: totalSupport,
    },
    micro: {
      precision: metricRound(microPrecision),
      recall: metricRound(microRecall),
      f1: metricRound(microF1),
      support: totalSupport,
    },
    byLabel,
  };
}
