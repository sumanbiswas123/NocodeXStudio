import { useCallback } from "react";
import type React from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FileMap, VirtualElement } from "../../../types";
import type {
  PreviewMatchedCssRule,
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
  const isTemporaryMatchedRuleSource = (source: string) => {
    const normalized = String(source || "").trim().toLowerCase();
    return (
      normalized === "inline stylesheet" ||
      /^style-sheet-\d+-\d+$/.test(normalized)
    );
  };

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
        const snapshotHasStableSources = snapshot.matchedCssRules.some(
          (rule) => !isTemporaryMatchedRuleSource(rule.source),
        );
        const currentHasStableSources = current.some(
          (rule) => !isTemporaryMatchedRuleSource(rule.source),
        );
        if (
          snapshot.matchedCssRules.length > 0 &&
          (snapshotHasStableSources || !currentHasStableSources)
        ) {
          return snapshot.matchedCssRules;
        }
        return current;
      });
      setPreviewSelectedElement(snapshot.elementData);
      return true;
    },
    [
      getLivePreviewSelectedElement,
      getStablePreviewElementId,
      previewSelectedElement?.id,
      setPreviewSelectedComputedStyles,
      setPreviewSelectedElement,
      setPreviewSelectedMatchedCssRules,
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
