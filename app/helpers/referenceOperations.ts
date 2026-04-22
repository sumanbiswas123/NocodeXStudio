import {
  applyReferenceConfigModelToDraft,
  cloneReferenceConfigModel,
} from "./referenceConfigModel";
import {
  buildReferenceImpactReport,
  getNodesForStableId,
} from "./referenceImpact";
import { buildSuperscriptRenderResult } from "./referenceRenderer";
import type {
  HtmlPatchSuggestion,
  ReferenceAuditIssue,
  ReferenceConfigModel,
  ReferenceOperation,
  ReferencePatchPlan,
  ReferenceTargetRef,
  ReferenceUsageNode,
  ReferenceWorkspace,
} from "./referenceTypes";

function scopeMatchesNode(
  operation: ReferenceOperation,
  node: ReferenceUsageNode,
): boolean {
  if (!operation.scope) return false;
  if (operation.scope.scopeMode === "global") return true;
  if (operation.scope.nodeId && node.nodeId === operation.scope.nodeId)
    return true;
  if (operation.scope.popupId && node.popupId === operation.scope.popupId)
    return true;
  if (operation.scope.filePath && node.filePath === operation.scope.filePath)
    return true;
  if (operation.scope.slideId && node.slideId === operation.scope.slideId)
    return true;
  return false;
}

function buildConfigPatchPreview(
  beforeModel: ReferenceConfigModel,
  afterModel: ReferenceConfigModel,
): ReferencePatchPlan["configPatchPreview"] {
  const previews: ReferencePatchPlan["configPatchPreview"] = [];
  const pairs: Array<[string, unknown, unknown]> = [
    [
      "referencesAll",
      beforeModel.masterLists.reference,
      afterModel.masterLists.reference,
    ],
    [
      "footnotesAll",
      beforeModel.masterLists.footnote,
      afterModel.masterLists.footnote,
    ],
    [
      "abbreviationsAll",
      beforeModel.masterLists.abbreviation,
      afterModel.masterLists.abbreviation,
    ],
    [
      "pageReferencesAll",
      beforeModel.pageMappings.reference,
      afterModel.pageMappings.reference,
    ],
    [
      "pageFootnotesAll",
      beforeModel.pageMappings.footnote,
      afterModel.pageMappings.footnote,
    ],
    [
      "pageAbbreviationsAll",
      beforeModel.pageMappings.abbreviation,
      afterModel.pageMappings.abbreviation,
    ],
  ];
  pairs.forEach(([key, beforeValue, afterValue]) => {
    const before = JSON.stringify(beforeValue);
    const after = JSON.stringify(afterValue);
    if (before !== after) {
      previews.push({ key, before, after });
    }
  });
  return previews;
}

function buildHtmlSuggestion(
  workspace: ReferenceWorkspace,
  node: ReferenceUsageNode,
  notes: string[],
  resolveNextIndex: (target: ReferenceTargetRef) => number | null,
): HtmlPatchSuggestion | null {
  if (node.scopeType !== "superscript") return null;
  const rendered = buildSuperscriptRenderResult(
    node.targetRefs,
    workspace.registry,
    resolveNextIndex,
  );
  if (
    rendered.dataRefTarget === node.rawDataRefTarget &&
    rendered.visibleText === node.rawText
  ) {
    return null;
  }
  return {
    id: `html-${node.nodeId}`,
    filePath: node.filePath,
    selector: node.selector,
    scopeLabel:
      node.containerScope === "sharedPopup"
        ? "Shared popup"
        : node.containerScope === "localPopup"
          ? "Popup"
          : "Slide",
    oldDataRefTarget: node.rawDataRefTarget,
    newDataRefTarget: rendered.dataRefTarget,
    oldVisibleText: node.rawText,
    newVisibleText: rendered.visibleText,
    notes: [...notes, ...rendered.issues.map((entry) => entry.detail)],
  };
}

function countRemainingUsages(
  workspace: ReferenceWorkspace,
  stableId: string,
  predicate: (node: ReferenceUsageNode) => boolean,
): number {
  return workspace.usageNodes.filter(
    (node) =>
      node.targetRefs.some((target) => target.stableId === stableId) &&
      !predicate(node),
  ).length;
}

function removeFromPageMappings(
  nextModel: ReferenceConfigModel,
  operation: ReferenceOperation,
  masterIndex: number,
): boolean {
  if (!operation.scope?.slideId) return false;
  const pageIndex = nextModel.pagesAll.indexOf(operation.scope.slideId);
  if (pageIndex < 0) return false;
  const row = nextModel.pageMappings[operation.kind][pageIndex] || [];
  nextModel.pageMappings[operation.kind][pageIndex] = row.filter(
    (value) => value !== masterIndex,
  );
  return true;
}

function shiftAfterRemoval(values: number[], removedIndex: number): number[] {
  return values
    .filter((value) => value !== removedIndex)
    .map((value) => (value > removedIndex ? value - 1 : value));
}

export function applyReferenceOperation(
  workspace: ReferenceWorkspace,
  operation: ReferenceOperation,
  title: string,
  summary: string,
  confidence: ReferencePatchPlan["confidence"],
): ReferencePatchPlan | null {
  if (!operation.stableId) return null;
  const entry = workspace.registry.byStableId[operation.stableId];
  if (!entry) return null;

  const nextModel = cloneReferenceConfigModel(workspace.model);
  const affectedNodes = getNodesForStableId(workspace, entry.stableId);
  const scopedNodes =
    operation.type === "removeGlobal"
      ? affectedNodes
      : affectedNodes.filter((node) => scopeMatchesNode(operation, node));
  const issues: ReferenceAuditIssue[] = [];
  const htmlSuggestions: HtmlPatchSuggestion[] = [];

  if (operation.type === "removeLocal") {
    const removedFromConfig = removeFromPageMappings(
      nextModel,
      operation,
      entry.masterIndex,
    );
    const remainingUsageCount = countRemainingUsages(
      workspace,
      entry.stableId,
      (node) => scopedNodes.some((affected) => affected.nodeId === node.nodeId),
    );

    scopedNodes.forEach((node) => {
      const suggestion = buildHtmlSuggestion(
        workspace,
        node,
        [
          removedFromConfig
            ? "Removed local page mapping from config."
            : "No config mapping changed for this scope; review the HTML suggestion manually.",
        ],
        (target) => {
          if (target.stableId === entry.stableId) return null;
          return target.masterIndex;
        },
      );
      if (suggestion) htmlSuggestions.push(suggestion);
    });

    if (remainingUsageCount === 0) {
      issues.push({
        id: `orphan-${entry.stableId}`,
        severity: "info",
        source: "workflow",
        title: "This local removal leaves an orphaned master entry",
        detail:
          "The master reference text will remain in config but no slide or popup will use it after this change.",
      });
    }

    return {
      id: `plan-${operation.type}-${entry.stableId}-${operation.scope?.scopeMode || "local"}`,
      title,
      summary,
      confidence,
      operation,
      configPatchPreview: buildConfigPatchPreview(workspace.model, nextModel),
      htmlSuggestions,
      impact: buildReferenceImpactReport(
        workspace,
        scopedNodes,
        remainingUsageCount,
        operation.scope?.scopeMode === "popup"
          ? "Popup only"
          : "Current page only",
        false,
      ),
      issues,
      nextModel,
    };
  }

  if (operation.type === "removeGlobal") {
    nextModel.masterLists[operation.kind].splice(entry.masterIndex - 1, 1);
    nextModel.pageMappings[operation.kind] = nextModel.pageMappings[
      operation.kind
    ].map((row) => shiftAfterRemoval(row, entry.masterIndex));

    const sameKindNodes = workspace.usageNodes.filter((node) =>
      node.targetRefs.some(
        (target) =>
          target.kind === operation.kind &&
          target.masterIndex >= entry.masterIndex,
      ),
    );

    sameKindNodes.forEach((node) => {
      const suggestion = buildHtmlSuggestion(
        workspace,
        node,
        ["Master reference removed globally; indices have been compacted."],
        (target) => {
          if (target.kind !== operation.kind) return target.masterIndex;
          if (target.stableId === entry.stableId) return null;
          if (target.masterIndex > entry.masterIndex)
            return target.masterIndex - 1;
          return target.masterIndex;
        },
      );
      if (suggestion) htmlSuggestions.push(suggestion);
    });

    return {
      id: `plan-${operation.type}-${entry.stableId}`,
      title,
      summary,
      confidence,
      operation,
      configPatchPreview: buildConfigPatchPreview(workspace.model, nextModel),
      htmlSuggestions,
      impact: buildReferenceImpactReport(
        workspace,
        sameKindNodes,
        0,
        "Whole presentation",
        true,
      ),
      issues,
      nextModel,
    };
  }

  if (operation.type === "keepMasterEntry") {
    return {
      id: `plan-keep-${entry.stableId}`,
      title,
      summary,
      confidence,
      operation,
      configPatchPreview: [],
      htmlSuggestions: [],
      impact: buildReferenceImpactReport(
        workspace,
        [],
        getNodesForStableId(workspace, entry.stableId).length,
        "No config change",
        false,
      ),
      issues: [
        {
          id: `keep-${entry.stableId}`,
          severity: "info",
          source: "workflow",
          title: "Keep master entry selected",
          detail:
            "This option intentionally leaves the master reference list untouched.",
        },
      ],
      nextModel,
    };
  }

  return null;
}

export function materializeConfigDraftFromPlan(
  draft: Record<string, any>,
  plan: ReferencePatchPlan,
): Record<string, any> {
  return applyReferenceConfigModelToDraft(draft, plan.nextModel);
}
