import type {
  ReferenceAuditIssue,
  ReferenceEntry,
  ReferenceRegistry,
  ReferenceTargetRef,
  SuperscriptRenderResult,
} from "./referenceTypes";

const FOOTNOTE_SYMBOLS = ["*", "†", "‡", "§", "||", "¶", "#"];

function compressConsecutiveNumbers(values: number[]): string[] {
  if (!values.length) return [];
  const sorted = [...values];
  const groups: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    groups.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return groups;
}

function detectFootnoteSymbol(
  entry: ReferenceEntry | undefined,
  fallbackIndex: number,
): string {
  const prefix = entry?.text.trim().match(/^([*†‡§¶#]+)/);
  if (prefix?.[1]) return prefix[1];
  return FOOTNOTE_SYMBOLS[fallbackIndex] || `foot${fallbackIndex + 1}`;
}

function renderIndexToken(nextIndex: number, rawToken: string): string {
  const digits = rawToken.match(/^0+\d+$/) ? rawToken.length : 0;
  const nextValue = String(nextIndex);
  return digits > 0 ? nextValue.padStart(digits, "0") : nextValue;
}

function renderFootToken(nextIndex: number, rawToken: string): string {
  const digits = rawToken.match(/^foot_(0+\d+)$/i)?.[1]?.length || 0;
  const value =
    digits > 0 ? String(nextIndex).padStart(digits, "0") : String(nextIndex);
  return `foot_${value}`;
}

export function buildSuperscriptRenderResult(
  targets: ReferenceTargetRef[],
  registry: ReferenceRegistry,
  resolveNextIndex: (target: ReferenceTargetRef) => number | null,
): SuperscriptRenderResult {
  const issues: ReferenceAuditIssue[] = [];
  const deduped: ReferenceTargetRef[] = [];
  const seen = new Set<string>();

  targets.forEach((target) => {
    const nextIndex = resolveNextIndex(target);
    if (!nextIndex || nextIndex <= 0) return;
    const dedupeKey = `${target.kind}:${nextIndex}`;
    if (seen.has(dedupeKey)) {
      issues.push({
        id: `duplicate-${target.stableId}-${nextIndex}`,
        severity: "warn",
        source: "workflow",
        title: "Duplicate superscript target normalized",
        detail: `Removed a duplicate ${target.kind} target while regenerating superscript labels.`,
      });
      return;
    }
    seen.add(dedupeKey);
    deduped.push(target);
  });

  const numericLabels: number[] = [];
  const footLabels: string[] = [];
  const localLabelByStableId = new Map<string, number>();
  let nextLocalNumeric = 1;
  const tokenList: string[] = [];

  deduped.forEach((target) => {
    const nextIndex = resolveNextIndex(target);
    if (!nextIndex || nextIndex <= 0) return;
    if (target.kind === "reference") {
      let local = localLabelByStableId.get(target.stableId);
      if (!local) {
        local = nextLocalNumeric;
        localLabelByStableId.set(target.stableId, local);
        nextLocalNumeric += 1;
      }
      numericLabels.push(local);
      tokenList.push(renderIndexToken(nextIndex, target.rawToken));
      return;
    }

    if (target.kind === "footnote") {
      const entry = registry.byStableId[target.stableId];
      footLabels.push(detectFootnoteSymbol(entry, nextIndex - 1));
      tokenList.push(renderFootToken(nextIndex, target.rawToken));
      return;
    }

    tokenList.push(renderIndexToken(nextIndex, target.rawToken));
  });

  const visibleParts: string[] = [];
  if (numericLabels.length) {
    visibleParts.push(compressConsecutiveNumbers(numericLabels).join(","));
  }
  if (footLabels.length) {
    visibleParts.push(footLabels.join(","));
  }

  return {
    tokens: tokenList,
    dataRefTarget: tokenList.join(","),
    visibleText: visibleParts.join(","),
    issues,
  };
}
