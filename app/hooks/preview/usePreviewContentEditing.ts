import { useCallback } from "react";
import type React from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FileMap, VirtualElement } from "../../../types";
import type {
  PreviewMatchedCssRule,
} from "../../helpers/previewCssHelpers";
import {
  cssRuleSourcesMatch,
  normalizeSelectorSignature,
} from "../../helpers/previewCssHelpers";
import {
  applyPreviewInlineEdit as applyPreviewInlineEditHelper,
  applyPreviewInlineEditDraft as applyPreviewInlineEditDraftHelper,
  persistPreviewHtmlContent as persistPreviewHtmlContentHelper,
  syncPreviewSelectionSnapshotFromLiveElement as syncPreviewSelectionSnapshotFromLiveElementHelper,
} from "../../helpers/previewSelectionHelpers";
import {
  applyPreviewContentUpdate as applyPreviewContentUpdateHelper,
  applyPreviewStyleUpdateAtPath as applyPreviewStyleUpdateAtPathHelper,
  queuePreviewStyleUpdate as queuePreviewStyleUpdateHelper,
} from "../../helpers/previewUpdateHelpers";

type PersistPreviewHtmlContentFn = (
  path: string,
  html: string,
  options?: {
    refreshPreviewDoc?: boolean;
    saveNow?: boolean;
    pushToHistory?: boolean;
    elementPath?: number[];
  },
) => Promise<void>;

type UsePreviewContentEditingOptions = {
  filesRef: MutableRefObject<FileMap>;
  flushPendingPreviewSaves: () => Promise<void>;
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  getStablePreviewElementId: (
    path: number[] | null | undefined,
    explicitId?: string | null,
    fallbackId?: string | null,
  ) => string;
  invalidatePreviewDocCache: (path: string) => void;
  isMountedPreview: boolean;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  markPreviewPathDirty: (path: string, elementPath: number[]) => void;
  pendingPreviewWritesRef: MutableRefObject<Record<string, string>>;
  persistPreviewHtmlContent: PersistPreviewHtmlContentFn;
  postPreviewPatchToFrame: (
    patch: { path: number[]; styles: Partial<React.CSSProperties> },
    options?: { syncSelection?: boolean },
  ) => void;
  previewDependencyIndexRef: MutableRefObject<Record<string, string[]>>;
  previewSelectedElement: VirtualElement | null;
  previewSelectedPath: number[] | null;
  previewMatchedRuleEditRef: MutableRefObject<{
    at: number;
    selector: string;
    source: string;
    sourcePath?: string;
    occurrenceIndex: number;
  } | null>;
  previewStyleDraftPendingRef: MutableRefObject<{
    filePath: string;
    elementPath: number[];
    styles: Partial<React.CSSProperties>;
  } | null>;
  previewStyleDraftTimerRef: MutableRefObject<number | null>;
  pushPreviewHistory: (
    filePath: string,
    nextHtml: string,
    previousHtml?: string,
  ) => void;
  resolvePreviewAssetUrl: (assetPath: string) => string;
  schedulePreviewAutoSave: () => void;
  selectedPreviewHtml: string | null;
  setDirtyFiles: Dispatch<SetStateAction<string[]>>;
  setFiles: Dispatch<SetStateAction<FileMap>>;
  setPreviewRefreshNonce: Dispatch<SetStateAction<number>>;
  setPreviewSelectedComputedStyles: Dispatch<
    SetStateAction<React.CSSProperties | null>
  >;
  setPreviewSelectedElement: Dispatch<SetStateAction<VirtualElement | null>>;
  setPreviewSelectedMatchedCssRules: Dispatch<
    SetStateAction<PreviewMatchedCssRule[]>
  >;
  setPreviewSelectedPath: Dispatch<SetStateAction<number[] | null>>;
  setSelectedPreviewDoc: Dispatch<SetStateAction<string>>;
  textFileCacheRef: MutableRefObject<Record<string, string>>;
  dirtyFilesRef: MutableRefObject<string[]>;
};

export const usePreviewContentEditing = ({
  dirtyFilesRef,
  filesRef,
  flushPendingPreviewSaves,
  getLivePreviewSelectedElement,
  getStablePreviewElementId,
  invalidatePreviewDocCache,
  isMountedPreview,
  loadFileContent,
  markPreviewPathDirty,
  pendingPreviewWritesRef,
  persistPreviewHtmlContent,
  postPreviewPatchToFrame,
  previewDependencyIndexRef,
  previewSelectedElement,
  previewSelectedPath,
  previewMatchedRuleEditRef,
  previewStyleDraftPendingRef,
  previewStyleDraftTimerRef,
  pushPreviewHistory,
  resolvePreviewAssetUrl,
  schedulePreviewAutoSave,
  selectedPreviewHtml,
  setDirtyFiles,
  setFiles,
  setPreviewRefreshNonce,
  setPreviewSelectedComputedStyles,
  setPreviewSelectedElement,
  setPreviewSelectedMatchedCssRules,
  setPreviewSelectedPath,
  setSelectedPreviewDoc,
  textFileCacheRef,
}: UsePreviewContentEditingOptions) => {
  const RECENT_MATCHED_RULE_EDIT_MS = 1500;
  const debugMatchedRuleWrite = (
    sourceLabel: string,
    nextRules: PreviewMatchedCssRule[],
  ) => {
    if (typeof window === "undefined") return;
    if ((window as any).__NX_DEBUG_PREVIEW_CSS === false) return;
    console.log("[PreviewCSSDebug] matched-rule-write", {
      source: sourceLabel,
      ruleCount: nextRules.length,
      rules: nextRules.map((rule) => ({
        selector: rule.selector,
        source: rule.source,
        sourcePath: rule.sourcePath || "",
        activeCount: rule.declarations.filter(
          (declaration) => declaration.active === true,
        ).length,
        declarationCount: rule.declarations.length,
      })),
    });
  };
  const isTemporaryMatchedRuleSource = (source: string) => {
    const normalized = String(source || "").trim().toLowerCase();
    return (
      normalized === "inline stylesheet" ||
      /^style-sheet-\d+-\d+$/.test(normalized)
    );
  };

  const mergeRecentEditedRuleActivity = useCallback(
    (
      incomingRules: PreviewMatchedCssRule[],
      currentRules: PreviewMatchedCssRule[],
    ) => {
      const recentEdit = previewMatchedRuleEditRef.current;
      if (!recentEdit) return incomingRules;
      if (Date.now() - recentEdit.at > RECENT_MATCHED_RULE_EDIT_MS) {
        return incomingRules;
      }

      const annotateOccurrences = (rules: PreviewMatchedCssRule[]) => {
        const occurrenceCounter = new Map<string, number>();
        return rules.map((rule) => {
          const key = `${rule.sourcePath || rule.source}::${rule.selector}`;
          const occurrenceIndex = occurrenceCounter.get(key) || 0;
          occurrenceCounter.set(key, occurrenceIndex + 1);
          return { rule, occurrenceIndex };
        });
      };

      const currentAnnotated = annotateOccurrences(currentRules);
      const incomingAnnotated = annotateOccurrences(incomingRules);
      const recentEditSelector = normalizeSelectorSignature(
        recentEdit.selector,
      );
      const recentEditSource = recentEdit.sourcePath || recentEdit.source;
      const currentMatch = currentAnnotated.find(
        ({ rule, occurrenceIndex }) =>
          cssRuleSourcesMatch(
            rule.sourcePath || rule.source,
            recentEditSource,
          ) &&
          normalizeSelectorSignature(rule.selector) === recentEditSelector &&
          occurrenceIndex === recentEdit.occurrenceIndex,
      )?.rule;
      if (!currentMatch) return incomingRules;
      const currentHasActive = currentMatch.declarations.some(
        (declaration) => declaration.active === true,
      );
      if (!currentHasActive) return incomingRules;

      return incomingAnnotated.map(({ rule, occurrenceIndex }) => {
        if (
          !cssRuleSourcesMatch(
            rule.sourcePath || rule.source,
            recentEditSource,
          ) ||
          normalizeSelectorSignature(rule.selector) !== recentEditSelector ||
          occurrenceIndex !== recentEdit.occurrenceIndex
        ) {
          return rule;
        }
        const incomingHasAnyActive = rule.declarations.some(
          (declaration) => declaration.active === true,
        );
        if (incomingHasAnyActive) return rule;
        const currentActivityByProperty = new Map(
          currentMatch.declarations.map((declaration) => [
            String(declaration.property || "").trim().toLowerCase(),
            declaration.active,
          ]),
        );
        return {
          ...rule,
          declarations: rule.declarations.map((declaration) => ({
            ...declaration,
            active:
              currentActivityByProperty.get(
                String(declaration.property || "").trim().toLowerCase(),
              ) ?? declaration.active,
          })),
        };
      });
    },
    [previewMatchedRuleEditRef],
  );

  const applyPreviewInlineEditDraft = useCallback(
    async (filePath: string, elementPath: number[], nextInnerHtml: string) => {
      await applyPreviewInlineEditDraftHelper({
        filePath,
        elementPath,
        nextInnerHtml,
        persistPreviewHtmlContent: persistPreviewHtmlContentHelper,
        persistArgs: {
          filesRef,
          textFileCacheRef,
          pendingPreviewWritesRef,
          previewDependencyIndexRef,
          setFiles,
          setDirtyFiles,
          setSelectedPreviewDoc,
          setPreviewRefreshNonce,
          invalidatePreviewDocCache,
          markPreviewPathDirty,
          pushPreviewHistory,
          flushPendingPreviewSaves,
          schedulePreviewAutoSave,
          isMountedPreview,
        },
      });
    },
    [
      filesRef,
      flushPendingPreviewSaves,
      invalidatePreviewDocCache,
      isMountedPreview,
      markPreviewPathDirty,
      pendingPreviewWritesRef,
      previewDependencyIndexRef,
      pushPreviewHistory,
      schedulePreviewAutoSave,
      setDirtyFiles,
      setFiles,
      setPreviewRefreshNonce,
      setSelectedPreviewDoc,
      textFileCacheRef,
    ],
  );

  const applyPreviewInlineEdit = useCallback(
    async (elementPath: number[], nextInnerHtml: string) => {
      const snapshot = await applyPreviewInlineEditHelper({
        selectedPreviewHtml,
        elementPath,
        nextInnerHtml,
        loadFileContent,
        filesRef,
        getLivePreviewSelectedElement,
        getStablePreviewElementId,
        previousSnapshotId: previewSelectedElement?.id,
        persistPreviewHtmlContent: persistPreviewHtmlContentHelper,
        persistArgs: {
          filesRef,
          textFileCacheRef,
          pendingPreviewWritesRef,
          previewDependencyIndexRef,
          setFiles,
          setDirtyFiles,
          setSelectedPreviewDoc,
          setPreviewRefreshNonce,
          invalidatePreviewDocCache,
          markPreviewPathDirty,
          pushPreviewHistory,
          flushPendingPreviewSaves,
          schedulePreviewAutoSave,
          isMountedPreview,
        },
      });
      if (!snapshot) return;

      setPreviewSelectedPath(snapshot.normalizedPath);
      setPreviewSelectedComputedStyles(snapshot.computedStyles);
      setPreviewSelectedMatchedCssRules(snapshot.matchedCssRules);
      setPreviewSelectedElement(snapshot.elementData);
    },
    [
      filesRef,
      flushPendingPreviewSaves,
      getLivePreviewSelectedElement,
      getStablePreviewElementId,
      invalidatePreviewDocCache,
      isMountedPreview,
      loadFileContent,
      markPreviewPathDirty,
      pendingPreviewWritesRef,
      previewDependencyIndexRef,
      previewSelectedElement?.id,
      pushPreviewHistory,
      schedulePreviewAutoSave,
      selectedPreviewHtml,
      setDirtyFiles,
      setFiles,
      setPreviewRefreshNonce,
      setPreviewSelectedComputedStyles,
      setPreviewSelectedElement,
      setPreviewSelectedMatchedCssRules,
      setPreviewSelectedPath,
      setSelectedPreviewDoc,
      textFileCacheRef,
    ],
  );

  const syncPreviewSelectionSnapshotFromLiveElement = useCallback(
    (elementPath: number[]) => {
      const snapshot = syncPreviewSelectionSnapshotFromLiveElementHelper({
        elementPath,
        getLivePreviewSelectedElement,
        getStablePreviewElementId,
        previousSnapshotId: previewSelectedElement?.id,
      });
      if (!snapshot) return false;

      setPreviewSelectedComputedStyles(snapshot.computedStyles);
      setPreviewSelectedMatchedCssRules((current) => {
        const recentlyEditedMatchedRule = Boolean(
          previewMatchedRuleEditRef.current &&
            Date.now() - previewMatchedRuleEditRef.current.at <
              RECENT_MATCHED_RULE_EDIT_MS,
        );
        const snapshotHasStableSources = snapshot.matchedCssRules.some(
          (rule) => !isTemporaryMatchedRuleSource(rule.source),
        );
        const currentHasStableSources = current.some(
          (rule) => !isTemporaryMatchedRuleSource(rule.source),
        );
        if (recentlyEditedMatchedRule && currentHasStableSources) {
          debugMatchedRuleWrite("LIVE_SNAPSHOT:keep-current", current);
          return current;
        }
        if (
          snapshot.matchedCssRules.length > 0 &&
          (snapshotHasStableSources || !currentHasStableSources)
        ) {
          const nextRules = mergeRecentEditedRuleActivity(
            snapshot.matchedCssRules,
            current,
          );
          debugMatchedRuleWrite("LIVE_SNAPSHOT:apply-next", nextRules);
          return nextRules;
        }
        debugMatchedRuleWrite("LIVE_SNAPSHOT:keep-fallback", current);
        return current;
      });
      setPreviewSelectedElement(snapshot.elementData);
      return true;
    },
    [
      getLivePreviewSelectedElement,
      getStablePreviewElementId,
      previewSelectedElement?.id,
      previewMatchedRuleEditRef,
      setPreviewSelectedComputedStyles,
      setPreviewSelectedElement,
      setPreviewSelectedMatchedCssRules,
      mergeRecentEditedRuleActivity,
    ],
  );

  const applyPreviewStyleUpdateAtPath = useCallback(
    async (
      elementPath: number[],
      styles: Partial<React.CSSProperties>,
      options?: { syncSelectedElement?: boolean },
    ) => {
      await applyPreviewStyleUpdateAtPathHelper({
        selectedPreviewHtml,
        elementPath,
        styles,
        options,
        getLivePreviewSelectedElement,
        postPreviewPatchToFrame,
        previewSelectedPath,
        syncPreviewSelectionSnapshotFromLiveElement,
        loadFileContent,
        filesRef,
        persistPreviewHtmlContent,
      });
    },
    [
      filesRef,
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      postPreviewPatchToFrame,
      previewSelectedPath,
      selectedPreviewHtml,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
  );

  const queuePreviewStyleUpdate = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      queuePreviewStyleUpdateHelper({
        selectedPreviewHtml,
        previewSelectedPath,
        styles,
        previewStyleDraftPendingRef,
        previewStyleDraftTimerRef,
        dirtyFilesRef,
        setDirtyFiles,
        markPreviewPathDirty,
        applyPreviewStyleUpdateAtPath,
      });
    },
    [
      applyPreviewStyleUpdateAtPath,
      dirtyFilesRef,
      markPreviewPathDirty,
      previewSelectedPath,
      previewStyleDraftPendingRef,
      previewStyleDraftTimerRef,
      selectedPreviewHtml,
      setDirtyFiles,
    ],
  );

  const applyPreviewContentUpdate = useCallback(
    async (data: {
      content?: string;
      html?: string;
      src?: string;
      liveSrc?: string;
      href?: string;
    }) => {
      await applyPreviewContentUpdateHelper({
        data,
        selectedPreviewHtml,
        previewSelectedPath,
        loadFileContent,
        filesRef,
        getLivePreviewSelectedElement,
        resolvePreviewAssetUrl,
        persistPreviewHtmlContent,
        setPreviewSelectedElement,
      });
    },
    [
      filesRef,
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      resolvePreviewAssetUrl,
      selectedPreviewHtml,
      setPreviewSelectedElement,
    ],
  );

  return {
    applyPreviewContentUpdate,
    applyPreviewInlineEdit,
    applyPreviewInlineEditDraft,
    applyPreviewStyleUpdateAtPath,
    queuePreviewStyleUpdate,
    syncPreviewSelectionSnapshotFromLiveElement,
  };
};
