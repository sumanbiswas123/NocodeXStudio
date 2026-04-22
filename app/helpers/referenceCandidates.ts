import { normalizePath } from "./appHelpers";
import { applyReferenceOperation } from "./referenceOperations";
import type {
  ReferenceAuditIssue,
  ReferenceChangeCandidate,
  ReferenceConfidence,
  ReferenceOperation,
  ReferenceResolutionOption,
  ReferenceUsageNode,
  ReferenceWorkspace,
} from "./referenceTypes";
import type { PdfAnnotationUiRecord } from "./pdfAnnotationHelpers";

const GLOBAL_HINT =
  /\b(global|globally|everywhere|all slides|all pages|whole deck|entire presentation)\b/i;
const LOCAL_HINT =
  /\b(this page|this slide|only here|keep elsewhere|keep in other|current page)\b/i;
const REMOVE_HINT = /\b(remove|delete|drop|cut|take out)\b/i;
const REFERENCE_HINT =
  /\b(reference|references|footnote|footnotes|citation|superscript)\b/i;

function makeOption(
  label: string,
  description: string,
  plan: ReferenceResolutionOption["plan"],
  recommended: boolean,
): ReferenceResolutionOption {
  return {
    id: `${label}-${description}`.replace(/\s+/g, "-").toLowerCase(),
    label,
    description,
    plan,
    recommended,
  };
}

function scoreNode(
  annotation: PdfAnnotationUiRecord,
  node: ReferenceUsageNode,
): number {
  const annotationPath = normalizePath(annotation.mappedFilePath || "");
  let score = 0;
  if (annotationPath && annotationPath === node.filePath) score += 60;
  if (
    annotation.foundSelector &&
    node.selector &&
    annotation.foundSelector === node.selector
  )
    score += 90;
  if (
    annotation.popupInvocation?.popupId &&
    node.popupId === annotation.popupInvocation.popupId
  )
    score += 60;
  if (annotation.mappedSlideId && node.slideId === annotation.mappedSlideId)
    score += 25;
  if (
    annotation.detectedPageType === "Child/Popup" &&
    node.containerScope !== "slide"
  )
    score += 20;
  if (
    annotation.annotationText &&
    node.rawText &&
    annotation.annotationText.toLowerCase().includes(node.rawText.toLowerCase())
  )
    score += 10;
  return score;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function deriveConfidence(
  score: number,
  matchCount: number,
): ReferenceConfidence {
  if (score >= 100 && matchCount === 1) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function buildCandidateIssues(
  annotationId: string,
  confidence: ReferenceConfidence,
  matchedNodes: ReferenceUsageNode[],
): ReferenceAuditIssue[] {
  const issues: ReferenceAuditIssue[] = [];
  if (!matchedNodes.length) {
    issues.push({
      id: `candidate-unmapped-${annotationId}`,
      severity: "warn",
      source: "annotation",
      title: "Reference note could not be resolved to a concrete target",
      detail:
        "No matching superscript or page-level reference usage was found in the mapped file.",
      candidateId: annotationId,
    });
  }
  if (confidence === "low" && matchedNodes.length > 1) {
    issues.push({
      id: `candidate-ambiguous-${annotationId}`,
      severity: "warn",
      source: "annotation",
      title: "Multiple possible reference targets",
      detail:
        "The fixer found more than one plausible reference target, so it will not apply any change automatically.",
      candidateId: annotationId,
    });
  }
  return issues;
}

export function buildReferenceChangeCandidates(
  annotations: PdfAnnotationUiRecord[],
  workspace: ReferenceWorkspace,
): ReferenceChangeCandidate[] {
  return annotations
    .filter((annotation) => {
      const text = `${annotation.annotationText} ${annotation.pdfContextText || ""}`;
      return (
        annotation.annotationIntent === "referenceChange" ||
        annotation.annotationType === "referenceChange" ||
        (REMOVE_HINT.test(text) && REFERENCE_HINT.test(text))
      );
    })
    .map((annotation) => {
      const matchedNodes = workspace.usageNodes
        .map((node) => ({ node, score: scoreNode(annotation, node) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);

      const chosenScore = matchedNodes[0]?.score || 0;
      const matchedUsageNodes = matchedNodes.map((entry) => entry.node);
      const matchedStableIds = unique(
        matchedUsageNodes.flatMap((node) =>
          node.targetRefs.map((target) => target.stableId),
        ),
      );
      const confidence = deriveConfidence(
        chosenScore,
        matchedUsageNodes.length,
      );
      const options: ReferenceResolutionOption[] = [];
      const text = `${annotation.annotationText} ${annotation.pdfContextText || ""}`;
      const prefersGlobal = GLOBAL_HINT.test(text);
      const prefersLocal = LOCAL_HINT.test(text) || !prefersGlobal;

      matchedStableIds.slice(0, 4).forEach((stableId) => {
        const entry = workspace.registry.byStableId[stableId];
        if (!entry) return;
        const targetNode = matchedUsageNodes.find((node) =>
          node.targetRefs.some((target) => target.stableId === stableId),
        );
        const localOperation: ReferenceOperation = {
          type: "removeLocal",
          kind: entry.kind,
          stableId,
          scope: {
            scopeMode:
              targetNode?.containerScope === "localPopup" ? "popup" : "page",
            slideId: annotation.mappedSlideId,
            filePath: annotation.mappedFilePath,
            popupId:
              annotation.popupInvocation?.popupId ||
              targetNode?.popupId ||
              null,
            nodeId: targetNode?.nodeId || null,
          },
        };
        const globalOperation: ReferenceOperation = {
          type: "removeGlobal",
          kind: entry.kind,
          stableId,
          scope: { scopeMode: "global" },
        };

        const localPlan = applyReferenceOperation(
          workspace,
          localOperation,
          `Remove ${entry.kind} ${entry.masterIndex} from current scope`,
          `Keeps the master entry in the shared list and removes it only from the current page or popup scope.`,
          confidence,
        );
        const globalPlan = applyReferenceOperation(
          workspace,
          globalOperation,
          `Remove ${entry.kind} ${entry.masterIndex} globally`,
          `Deletes the master entry and compacts every affected index across the presentation.`,
          prefersGlobal ? "high" : confidence,
        );

        options.push(
          makeOption(
            "Remove page usage",
            `${entry.text.slice(0, 80)}${entry.text.length > 80 ? "..." : ""}`,
            localPlan,
            prefersLocal,
          ),
        );
        options.push(
          makeOption(
            "Remove globally",
            `${entry.text.slice(0, 80)}${entry.text.length > 80 ? "..." : ""}`,
            globalPlan,
            prefersGlobal,
          ),
        );
      });

      if (!options.length) {
        options.push(
          makeOption(
            "Analysis only",
            "No safe automatic reference target was found.",
            null,
            true,
          ),
        );
      }

      return {
        id: `candidate-${annotation.annotationId}`,
        annotationId: annotation.annotationId,
        title: `PDF page ${annotation.annoPdfPage}: ${annotation.annotationText.slice(0, 72) || "Reference note"}`,
        summary: annotation.pdfContextText || annotation.annotationText,
        confidence,
        matchedNodeIds: matchedUsageNodes.map((node) => node.nodeId),
        matchedStableIds,
        issues: buildCandidateIssues(
          annotation.annotationId,
          confidence,
          matchedUsageNodes,
        ),
        resolutionOptions: options,
      };
    });
}
