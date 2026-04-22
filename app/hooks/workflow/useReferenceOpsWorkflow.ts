import { useEffect, useMemo, useState } from "react";
import type { FileMap } from "../../../types";
import type { PdfAnnotationUiRecord } from "../../helpers/pdfAnnotationHelpers";
import { buildReferenceChangeCandidates } from "../../helpers/referenceCandidates";
import {
  applyReferenceConfigModelToDraft,
  buildReferenceConfigModel,
} from "../../helpers/referenceConfigModel";
import { buildReferenceRegistry } from "../../helpers/referenceRegistry";
import { buildReferenceWorkspace } from "../../helpers/referenceUsageGraph";
import { materializeConfigDraftFromPlan } from "../../helpers/referenceOperations";
import type {
  ReferenceChangeCandidate,
  ReferencePatchPlan,
  ReferenceWorkspace,
} from "../../helpers/referenceTypes";

type UseReferenceOpsWorkflowArgs = {
  configDraft: Record<string, any> | null;
  files: FileMap;
  annotationRecords: PdfAnnotationUiRecord[];
};

type UseReferenceOpsWorkflowResult = {
  workspace: ReferenceWorkspace | null;
  candidates: ReferenceChangeCandidate[];
  selectedCandidate: ReferenceChangeCandidate | null;
  selectedPlan: ReferencePatchPlan | null;
  selectedCandidateId: string | null;
  selectedOptionId: string | null;
  setSelectedCandidateId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedOptionId: React.Dispatch<React.SetStateAction<string | null>>;
  applySelectedPlan: () => {
    nextConfigDraft: Record<string, any> | null;
    nextReferenceDrafts: Record<string, string[]>;
  } | null;
};

function buildReferenceDraftRows(nextConfigDraft: Record<string, any> | null) {
  if (!nextConfigDraft) return {};
  const references = Array.isArray(nextConfigDraft.referencesAll)
    ? nextConfigDraft.referencesAll.map((item: unknown) => String(item ?? ""))
    : [];
  const footnotes = Array.isArray(nextConfigDraft.footnotesAll)
    ? nextConfigDraft.footnotesAll.map((item: unknown) => String(item ?? ""))
    : [];
  const abbreviations = Array.isArray(nextConfigDraft.abbreviationsAll)
    ? nextConfigDraft.abbreviationsAll.map((item: unknown) =>
        String(item ?? ""),
      )
    : [];
  return {
    referencesAll: [...references, ""],
    footnotesAll: [...footnotes, ""],
    abbreviationsAll: [...abbreviations, ""],
  };
}

export function useReferenceOpsWorkflow({
  configDraft,
  files,
  annotationRecords,
}: UseReferenceOpsWorkflowArgs): UseReferenceOpsWorkflowResult {
  const workspace = useMemo(() => {
    if (!configDraft) return null;
    const model = buildReferenceConfigModel(configDraft);
    const registry = buildReferenceRegistry(model);
    return buildReferenceWorkspace(model, registry, files);
  }, [configDraft, files]);

  const candidates = useMemo(() => {
    if (!workspace) return [];
    return buildReferenceChangeCandidates(annotationRecords, workspace);
  }, [annotationRecords, workspace]);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  useEffect(() => {
    if (!candidates.length) {
      setSelectedCandidateId(null);
      setSelectedOptionId(null);
      return;
    }
    setSelectedCandidateId((current) =>
      current && candidates.some((candidate) => candidate.id === current)
        ? current
        : candidates[0].id,
    );
  }, [candidates]);

  const selectedCandidate = useMemo(
    () =>
      selectedCandidateId
        ? candidates.find(
            (candidate) => candidate.id === selectedCandidateId,
          ) || null
        : null,
    [candidates, selectedCandidateId],
  );

  useEffect(() => {
    if (!selectedCandidate) {
      setSelectedOptionId(null);
      return;
    }
    setSelectedOptionId((current) => {
      if (
        current &&
        selectedCandidate.resolutionOptions.some(
          (option) => option.id === current,
        )
      ) {
        return current;
      }
      return (
        selectedCandidate.resolutionOptions.find((option) => option.recommended)
          ?.id ||
        selectedCandidate.resolutionOptions[0]?.id ||
        null
      );
    });
  }, [selectedCandidate]);

  const selectedPlan = useMemo(() => {
    if (!selectedCandidate || !selectedOptionId) return null;
    return (
      selectedCandidate.resolutionOptions.find(
        (option) => option.id === selectedOptionId,
      )?.plan || null
    );
  }, [selectedCandidate, selectedOptionId]);

  return {
    workspace,
    candidates,
    selectedCandidate,
    selectedPlan,
    selectedCandidateId,
    selectedOptionId,
    setSelectedCandidateId,
    setSelectedOptionId,
    applySelectedPlan: () => {
      if (!selectedPlan || !configDraft) return null;
      const nextConfigDraft = materializeConfigDraftFromPlan(
        configDraft,
        selectedPlan,
      );
      return {
        nextConfigDraft,
        nextReferenceDrafts: buildReferenceDraftRows(nextConfigDraft),
      };
    },
  };
}
