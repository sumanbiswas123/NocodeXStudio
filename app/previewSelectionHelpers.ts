import React from "react";
import { FileMap, VirtualElement } from "../types";
import {
  createPreviewDocument,
  extractComputedStylesFromElement,
  extractCustomAttributesFromElement,
  extractTextWithBreaks,
  normalizeEditorMultilineText,
  parseInlineStyleText,
  readElementByPath,
} from "./appHelpers";
import {
  collectMatchedCssRulesFromElement,
  PreviewMatchedCssRule,
} from "./previewCssHelpers";

type PreviewSnapshotParams = {
  elementPath: number[];
  getStablePreviewElementId: (
    elementPath: number[],
    preferredId?: string | null,
    fallbackId?: string | null,
  ) => string;
  liveElement?: Element | null;
  fallbackElement?: Element | null;
  previousId?: string | null;
  fallbackHtml?: string;
  nextInnerHtml?: string;
};

export type PreviewSelectionSnapshot = {
  normalizedPath: number[];
  computedStyles: React.CSSProperties | null;
  matchedCssRules: PreviewMatchedCssRule[];
  elementData: VirtualElement;
};

type PersistPreviewHtmlContentArgs = {
  updatedPath: string;
  serialized: string;
  filesRef: React.MutableRefObject<FileMap>;
  textFileCacheRef: React.MutableRefObject<Record<string, string>>;
  pendingPreviewWritesRef: React.MutableRefObject<Record<string, string>>;
  previewDependencyIndexRef: React.MutableRefObject<Record<string, string[]>>;
  setFiles: React.Dispatch<React.SetStateAction<FileMap>>;
  setDirtyFiles: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedPreviewDoc: React.Dispatch<React.SetStateAction<string>>;
  setPreviewRefreshNonce: React.Dispatch<React.SetStateAction<number>>;
  invalidatePreviewDocCache: (path: string) => void;
  markPreviewPathDirty: (path: string, elementPath: number[]) => void;
  pushPreviewHistory: (
    updatedPath: string,
    nextSerialized: string,
    previousSerialized: string,
  ) => void;
  flushPendingPreviewSaves: () => Promise<void>;
  schedulePreviewAutoSave: () => void;
  isMountedPreview: boolean;
  options?: {
    refreshPreviewDoc?: boolean;
    saveNow?: boolean;
    skipAutoSave?: boolean;
    elementPath?: number[];
    pushToHistory?: boolean;
  };
};

type ApplyPreviewInlineEditDraftArgs = {
  filePath: string;
  elementPath: number[];
  nextInnerHtml: string;
  persistPreviewHtmlContent: (
    args: PersistPreviewHtmlContentArgs,
  ) => Promise<void>;
  persistArgs: Omit<PersistPreviewHtmlContentArgs, "updatedPath" | "serialized">;
};

type ApplyPreviewInlineEditArgs = {
  selectedPreviewHtml: string | null;
  elementPath: number[];
  nextInnerHtml: string;
  loadFileContent: (path: string) => Promise<string | Blob | null | undefined>;
  filesRef: React.MutableRefObject<FileMap>;
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  getStablePreviewElementId: (
    elementPath: number[],
    preferredId?: string | null,
    fallbackId?: string | null,
  ) => string;
  previousSnapshotId?: string | null;
  persistPreviewHtmlContent: (
    args: PersistPreviewHtmlContentArgs,
  ) => Promise<void>;
  persistArgs: Omit<PersistPreviewHtmlContentArgs, "updatedPath" | "serialized">;
};

export const normalizePreviewElementPath = (
  elementPath: number[],
): number[] | null => {
  if (!Array.isArray(elementPath) || elementPath.length === 0) {
    return null;
  }

  const normalizedPath = elementPath
    .map((segment) => {
      const numeric = Number(segment);
      if (!Number.isFinite(numeric)) return -1;
      return Math.max(0, Math.trunc(numeric));
    })
    .filter((segment) => segment >= 0);

  if (normalizedPath.length !== elementPath.length) {
    return null;
  }

  return normalizedPath;
};

export const buildPreviewSelectionSnapshot = ({
  elementPath,
  getStablePreviewElementId,
  liveElement,
  fallbackElement,
  previousId,
  fallbackHtml,
  nextInnerHtml,
}: PreviewSnapshotParams): PreviewSelectionSnapshot | null => {
  const snapshotElement =
    liveElement instanceof HTMLElement
      ? liveElement
      : fallbackElement instanceof HTMLElement
        ? fallbackElement
        : null;
  const snapshotNode: Element | null =
    snapshotElement || fallbackElement || liveElement || null;
  if (!snapshotNode) return null;

  const inlineStyleText =
    snapshotElement instanceof HTMLElement
      ? snapshotElement.getAttribute("style") || ""
      : snapshotNode.getAttribute("style") || "";
  const inlineStyles = parseInlineStyleText(inlineStyleText);
  const computedStyles =
    extractComputedStylesFromElement(snapshotElement || snapshotNode) || null;
  const matchedCssRules = collectMatchedCssRulesFromElement(
    snapshotElement || snapshotNode,
  );
  const snapshotText = normalizeEditorMultilineText(
    extractTextWithBreaks(snapshotNode),
  );
  const snapshotHtml =
    snapshotElement instanceof HTMLElement
      ? snapshotElement.innerHTML || fallbackHtml || nextInnerHtml || ""
      : (snapshotNode as HTMLElement).innerHTML || fallbackHtml || nextInnerHtml || "";
  const snapshotAttributes =
    extractCustomAttributesFromElement(snapshotElement || snapshotNode) ||
    undefined;
  const snapshotSrc =
    snapshotElement instanceof HTMLElement
      ? snapshotElement.getAttribute("src") || undefined
      : snapshotNode.getAttribute("src") || undefined;
  const snapshotHref =
    snapshotElement instanceof HTMLElement
      ? snapshotElement.getAttribute("href") || undefined
      : snapshotNode.getAttribute("href") || undefined;
  const snapshotClassName =
    snapshotElement && typeof snapshotElement.className === "string"
      ? snapshotElement.className
      : typeof (snapshotNode as HTMLElement).className === "string"
        ? (snapshotNode as HTMLElement).className
        : undefined;
  const snapshotTag = String(snapshotNode.tagName || "div").toLowerCase();
  const inlineAnimation =
    typeof inlineStyles.animation === "string"
      ? inlineStyles.animation.trim()
      : "";
  const computedAnimationCandidate =
    computedStyles && typeof computedStyles.animation === "string"
      ? computedStyles.animation.trim()
      : "";
  const resolvedAnimation =
    inlineAnimation ||
    (computedAnimationCandidate &&
    !/^none(?:\s|$)/i.test(computedAnimationCandidate)
      ? computedAnimationCandidate
      : "");

  return {
    normalizedPath: [...elementPath],
    computedStyles,
    matchedCssRules,
    elementData: {
      id: getStablePreviewElementId(
        elementPath,
        snapshotElement?.id || snapshotNode.getAttribute("id"),
        previousId,
      ),
      type: snapshotTag,
      name: snapshotTag.toUpperCase(),
      content: snapshotText,
      html: snapshotHtml,
      ...(snapshotSrc ? { src: snapshotSrc } : {}),
      ...(snapshotHref ? { href: snapshotHref } : {}),
      ...(snapshotClassName ? { className: snapshotClassName } : {}),
      ...(snapshotAttributes ? { attributes: snapshotAttributes } : {}),
      ...(resolvedAnimation ? { animation: resolvedAnimation } : {}),
      styles: inlineStyles,
      children: [],
    },
  };
};

export const persistPreviewHtmlContent = async ({
  updatedPath,
  serialized,
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
  options,
}: PersistPreviewHtmlContentArgs): Promise<void> => {
  const shouldRefreshPreviewDoc = options?.refreshPreviewDoc ?? false;
  const shouldSaveNow = options?.saveNow ?? false;
  const shouldSkipAutoSave = options?.skipAutoSave ?? false;
  const shouldPushToHistory = options?.pushToHistory ?? true;
  const previousSerialized =
    typeof filesRef.current[updatedPath]?.content === "string"
      ? (filesRef.current[updatedPath]?.content as string)
      : typeof textFileCacheRef.current[updatedPath] === "string"
        ? textFileCacheRef.current[updatedPath]
        : "";

  if (!serialized || serialized.trim().length === 0) {
    console.error(
      `[CRITICAL] Safety Guard: Blocked attempt to write empty content to ${updatedPath}`,
    );
    return;
  }

  if (
    previousSerialized &&
    previousSerialized.length > 500 &&
    serialized.length < 100
  ) {
    console.error(
      `[CRITICAL] Safety Guard: Blocked suspicious downsizing of ${updatedPath} (from ${previousSerialized.length} to ${serialized.length} bytes)`,
    );
    return;
  }

  const sanitizedSerialized = serialized
    .replace(/\s*data-nx-mounted-preview-bridge=(["']?)1\1/gi, "")
    .replace(/\s*__nx-preview-selected/g, "")
    .replace(/\s*__nx-preview-dirty/g, "")
    .replace(/\s*__nx-preview-editing/g, "")
    .replace(/\s+class=(["'])\s*\1/g, "");

  textFileCacheRef.current[updatedPath] = sanitizedSerialized;
  setFiles((prev) => {
    const current = prev[updatedPath];
    if (!current) return prev;
    return {
      ...prev,
      [updatedPath]: {
        ...current,
        content: sanitizedSerialized,
      },
    };
  });

  const existingRefEntry = filesRef.current[updatedPath];
  if (existingRefEntry) {
    filesRef.current = {
      ...filesRef.current,
      [updatedPath]: { ...existingRefEntry, content: sanitizedSerialized },
    };
  }

  invalidatePreviewDocCache(updatedPath);
  pendingPreviewWritesRef.current[updatedPath] = sanitizedSerialized;
  setDirtyFiles((prev) =>
    prev.includes(updatedPath) ? prev : [...prev, updatedPath],
  );

  if (options?.elementPath && options.elementPath.length > 0) {
    markPreviewPathDirty(updatedPath, options.elementPath);
  }
  if (shouldPushToHistory) {
    pushPreviewHistory(updatedPath, sanitizedSerialized, previousSerialized);
  }

  const currentEntry = filesRef.current[updatedPath];
  if (shouldRefreshPreviewDoc && currentEntry) {
    if (!isMountedPreview) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [updatedPath]: {
          ...currentEntry,
          content: sanitizedSerialized,
        },
      };
      setSelectedPreviewDoc(
        createPreviewDocument(
          previewSnapshot,
          updatedPath,
          previewDependencyIndexRef.current[updatedPath],
        ),
      );
    } else if (!shouldSaveNow) {
      setPreviewRefreshNonce((prev) => prev + 1);
    }
  }

  if (shouldSaveNow) {
    await flushPendingPreviewSaves();
    if (shouldRefreshPreviewDoc && isMountedPreview) {
      setPreviewRefreshNonce((prev) => prev + 1);
    }
    return;
  }

  if (!shouldSkipAutoSave) {
    schedulePreviewAutoSave();
  }
};

export const applyPreviewInlineEditDraft = async ({
  filePath,
  elementPath,
  nextInnerHtml,
  persistPreviewHtmlContent,
  persistArgs,
}: ApplyPreviewInlineEditDraftArgs): Promise<void> => {
  if (!filePath || !Array.isArray(elementPath) || elementPath.length === 0) {
    return;
  }

  const sourceHtml =
    typeof persistArgs.filesRef.current[filePath]?.content === "string"
      ? (persistArgs.filesRef.current[filePath]?.content as string)
      : typeof persistArgs.textFileCacheRef.current[filePath] === "string"
        ? persistArgs.textFileCacheRef.current[filePath]
        : "";
  if (!sourceHtml) return;

  const parser = new DOMParser();
  const parsed = parser.parseFromString(sourceHtml, "text/html");
  const target = readElementByPath(parsed.body, elementPath);
  if (!target) return;

  target.innerHTML = nextInnerHtml;
  const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
  await persistPreviewHtmlContent({
    ...persistArgs,
    updatedPath: filePath,
    serialized,
    options: {
      refreshPreviewDoc: false,
      pushToHistory: false,
    },
  });
};

export const applyPreviewInlineEdit = async ({
  selectedPreviewHtml,
  elementPath,
  nextInnerHtml,
  loadFileContent,
  filesRef,
  getLivePreviewSelectedElement,
  getStablePreviewElementId,
  previousSnapshotId,
  persistPreviewHtmlContent,
  persistArgs,
}: ApplyPreviewInlineEditArgs): Promise<PreviewSelectionSnapshot | null> => {
  if (!selectedPreviewHtml) return null;

  const normalizedPath = normalizePreviewElementPath(elementPath);
  if (!normalizedPath) return null;

  const loaded = await loadFileContent(selectedPreviewHtml);
  const sourceHtml =
    typeof loaded === "string" && loaded.length > 0
      ? loaded
      : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
        ? (filesRef.current[selectedPreviewHtml]?.content as string)
        : "";
  if (!sourceHtml) return null;

  const parser = new DOMParser();
  const parsed = parser.parseFromString(sourceHtml, "text/html");
  const target = readElementByPath(parsed.body, normalizedPath);
  if (!target) return null;

  target.innerHTML = nextInnerHtml;
  const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
  await persistPreviewHtmlContent({
    ...persistArgs,
    updatedPath: selectedPreviewHtml,
    serialized,
    options: {
      refreshPreviewDoc: false,
      elementPath: normalizedPath,
    },
  });

  return buildPreviewSelectionSnapshot({
    elementPath: normalizedPath,
    getStablePreviewElementId,
    liveElement: getLivePreviewSelectedElement(normalizedPath),
    fallbackElement: target,
    previousId: previousSnapshotId,
    fallbackHtml: target.innerHTML || nextInnerHtml,
    nextInnerHtml,
  });
};

export const syncPreviewSelectionSnapshotFromLiveElement = ({
  elementPath,
  getLivePreviewSelectedElement,
  getStablePreviewElementId,
  previousSnapshotId,
}: {
  elementPath: number[];
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  getStablePreviewElementId: (
    elementPath: number[],
    preferredId?: string | null,
    fallbackId?: string | null,
  ) => string;
  previousSnapshotId?: string | null;
}): PreviewSelectionSnapshot | null => {
  const liveElement = getLivePreviewSelectedElement(elementPath);
  if (!(liveElement instanceof HTMLElement)) return null;

  return buildPreviewSelectionSnapshot({
    elementPath,
    getStablePreviewElementId,
    liveElement,
    previousId: previousSnapshotId,
    fallbackHtml: liveElement.innerHTML || "",
  });
};
