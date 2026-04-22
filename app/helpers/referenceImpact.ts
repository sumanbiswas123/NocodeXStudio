import type {
  ReferenceImpactReport,
  ReferenceUsageNode,
  ReferenceWorkspace,
} from "./referenceTypes";

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export function buildReferenceImpactReport(
  workspace: ReferenceWorkspace,
  affectedNodes: ReferenceUsageNode[],
  usageCountAfter: number,
  scopeLabel: string,
  isGlobal: boolean,
): ReferenceImpactReport {
  const allAffectedNodeIds = affectedNodes.map((node) => node.nodeId);
  const affectedSlides = unique(affectedNodes.map((node) => node.slideId));
  const affectedFiles = unique(affectedNodes.map((node) => node.filePath));
  return {
    scopeLabel,
    isGlobal,
    affectedSlides,
    affectedFiles,
    affectedNodeIds: allAffectedNodeIds,
    usageCountBefore: allAffectedNodeIds.length,
    usageCountAfter,
    affectsSharedPopup: affectedNodes.some(
      (node) => node.containerScope === "sharedPopup",
    ),
  };
}

export function getNodesForStableId(
  workspace: ReferenceWorkspace,
  stableId: string,
): ReferenceUsageNode[] {
  return workspace.usageNodes.filter((node) =>
    node.targetRefs.some((target) => target.stableId === stableId),
  );
}
