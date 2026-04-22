import React from "react";
import * as Neutralino from "@neutralinojs/lib";
import { FileMap, VirtualElement } from "../../types";
import {
  createPreviewDocument,
  extractComputedStylesFromElement,
  extractCustomAttributesFromElement,
  extractTextWithBreaks,
  getParentPath,
  joinPath,
  normalizeEditorMultilineText,
  normalizePath,
  normalizeProjectRelative,
  parseInlineStyleText,
  readElementByPath,
  relativePathBetweenVirtualFiles,
  rewriteInlineAssetRefs,
  toCssPropertyName,
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
  filePathIndexRef?: React.MutableRefObject<Record<string, string>>;
  setFiles: React.Dispatch<React.SetStateAction<FileMap>>;
  setDirtyFiles: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedPreviewDoc: React.Dispatch<React.SetStateAction<string>>;
  setPreviewRefreshNonce: React.Dispatch<React.SetStateAction<number>>;
  ensureDirectoryTreeStable?: (path: string) => Promise<void> | void;
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
    skipCssExtraction?: boolean;
    extractCssToLocal?: boolean;
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
  filePathIndexRef,
  filesRef,
  textFileCacheRef,
  pendingPreviewWritesRef,
  previewDependencyIndexRef,
  setFiles,
  setDirtyFiles,
  setSelectedPreviewDoc,
  setPreviewRefreshNonce,
  ensureDirectoryTreeStable,
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
  const shouldSkipCssExtraction = options?.skipCssExtraction ?? false;
  const shouldExtractCssToLocal = options?.extractCssToLocal === true;
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
    .replace(/\s*data-nx-quick-wrap-id=(["']).*?\1/gi, "")
    .replace(/\s*data-nx-quick-selection-start=(["']).*?\1/gi, "")
    .replace(/\s*data-nx-quick-selection-end=(["']).*?\1/gi, "")
    .replace(/\s*data-nx-inline-editing=(["']).*?\1/gi, "")
    .replace(/\s*__nx-preview-selected/g, "")
    .replace(/\s*__nx-preview-dirty/g, "")
    .replace(/\s*__nx-preview-editing/g, "")
    .replace(/\s+style=(["'])\s*\1/gi, "")
    .replace(/\s+class=(["'])\s*\1/g, "");

  const htmlDirVirtual = updatedPath.includes("/")
    ? updatedPath.slice(0, updatedPath.lastIndexOf("/"))
    : "";
  const cssLocalVirtualPath = normalizeProjectRelative(
    htmlDirVirtual ? `${htmlDirVirtual}/css/local.css` : "css/local.css",
  );
  const needsCssExtraction =
    shouldExtractCssToLocal &&
    !shouldSkipCssExtraction &&
    (/<style\b/i.test(sanitizedSerialized) ||
      /\sstyle=(["']).+?\1/i.test(sanitizedSerialized));
  let finalSerialized = sanitizedSerialized;

  if (needsCssExtraction) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(sanitizedSerialized, "text/html");
    const cssSelectorBlocks: string[] = [];
    let generatedIdCounter = 0;
    parsed.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
      const inlineStyle = String(element.getAttribute("style") || "").trim();
      if (!inlineStyle) {
        element.removeAttribute("style");
        return;
      }
      let elementId = String(element.getAttribute("id") || "").trim();
      if (!elementId) {
        generatedIdCounter += 1;
        const tagName = String(element.tagName || "element")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "element";
        elementId = `${tagName}-element-auto-${generatedIdCounter}`;
        element.setAttribute("id", elementId);
      }
      const declarations = Object.entries(parseInlineStyleText(inlineStyle))
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([property, value]) => `  ${toCssPropertyName(property)}: ${String(value)};`);
      if (declarations.length > 0) {
        cssSelectorBlocks.push(`#${elementId} {\n${declarations.join("\n")}\n}`);
      }
      element.removeAttribute("style");
    });
    const extractedStyleTags = Array.from(parsed.querySelectorAll("style"))
      .filter((node) => {
        const id = String(node.getAttribute("id") || "").trim();
        if (
          node.hasAttribute("data-preview-inline-editor") ||
          node.hasAttribute("data-nx-local-drop") ||
          id === "__nx-preview-runtime-local-css" ||
          id === "__nx-preview-runtime-css"
        ) {
          return false;
        }
        const text = String(node.textContent || "");
        return !(
          text.includes(".__nx-preview-selected") ||
          text.includes(".__nx-preview-editing") ||
          text.includes("[data-preview-hover-outline") ||
          text.includes("[data-preview-hover-badge") ||
          text.includes("[data-preview-draw-draft")
        );
      })
      .map((node) => node.textContent || "")
      .map((content) => content.trim())
      .filter(Boolean)
      .map((content) => rewriteInlineAssetRefs(content, updatedPath, filesRef.current));
    parsed.querySelectorAll("style").forEach((node) => node.remove());
    const ensureLocalCssLink = () => {
      const head = parsed.head || parsed.documentElement?.querySelector("head");
      if (!head) return;
      const expectedHref =
        relativePathBetweenVirtualFiles(updatedPath, cssLocalVirtualPath) ||
        "css/local.css";
      const hasLink = Array.from(
        head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
      ).some(
        (link) => String(link.getAttribute("href") || "").trim() === expectedHref,
      );
      if (hasLink) return;
      const link = parsed.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", expectedHref);
      head.appendChild(link);
    };
    finalSerialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    if (cssSelectorBlocks.length === 0 && extractedStyleTags.length === 0) {
      finalSerialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    } else {
    ensureLocalCssLink();
    finalSerialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    const managedCssBlock = [
      "/* nocodex-managed-local-css:start */",
      ...cssSelectorBlocks,
      ...extractedStyleTags,
      "/* nocodex-managed-local-css:end */",
    ].join("\n\n");
    const absoluteHtmlPath = filePathIndexRef?.current?.[updatedPath];
    const absoluteHtmlDir = absoluteHtmlPath ? getParentPath(absoluteHtmlPath) : "";
    const absoluteCssPath =
      absoluteHtmlDir && cssLocalVirtualPath
        ? normalizePath(
            joinPath(
              absoluteHtmlDir,
              cssLocalVirtualPath.startsWith(`${htmlDirVirtual}/`) && htmlDirVirtual
                ? cssLocalVirtualPath.slice(htmlDirVirtual.length + 1)
                : cssLocalVirtualPath,
            ),
          )
        : "";
    const currentCssContent =
      typeof pendingPreviewWritesRef.current[cssLocalVirtualPath] === "string"
        ? pendingPreviewWritesRef.current[cssLocalVirtualPath]
        : typeof filesRef.current[cssLocalVirtualPath]?.content === "string"
          ? (filesRef.current[cssLocalVirtualPath]?.content as string)
          : typeof textFileCacheRef.current[cssLocalVirtualPath] === "string"
            ? textFileCacheRef.current[cssLocalVirtualPath]
            : absoluteCssPath
              ? await (async () => {
                  try {
                    const loaded = await (Neutralino as any).filesystem.readFile(
                      absoluteCssPath,
                    );
                    return typeof loaded === "string" ? loaded : "";
                  } catch {
                    return "";
                  }
                })()
              : "";
    let nextCssContent = currentCssContent;
    const managedStart = "/* nocodex-managed-local-css:start */";
    const managedEnd = "/* nocodex-managed-local-css:end */";
    if (
      nextCssContent.includes(managedStart) &&
      nextCssContent.includes(managedEnd)
    ) {
      const startIndex = nextCssContent.indexOf(managedStart);
      const endIndex =
        nextCssContent.indexOf(managedEnd, startIndex) + managedEnd.length;
      nextCssContent = `${nextCssContent.slice(0, startIndex).trimEnd()}${
        startIndex > 0 ? "\n\n" : ""
      }${managedCssBlock}${nextCssContent.slice(endIndex).trimStart() ? `\n\n${nextCssContent.slice(endIndex).trimStart()}` : ""}`;
    } else {
      nextCssContent = `${nextCssContent.trimEnd()}${
        nextCssContent.trim() ? "\n\n" : ""
      }${managedCssBlock}\n`;
    }
    if (absoluteCssPath && filePathIndexRef) {
      const absoluteCssDir = getParentPath(absoluteCssPath);
      if (absoluteCssDir && ensureDirectoryTreeStable) {
        await ensureDirectoryTreeStable(absoluteCssDir);
      }
      filePathIndexRef.current[cssLocalVirtualPath] = absoluteCssPath;
    }
    const cssFileEntry = filesRef.current[cssLocalVirtualPath];
    if (shouldPushToHistory) {
      pushPreviewHistory(
        cssLocalVirtualPath,
        nextCssContent,
        currentCssContent,
      );
    }
    const nextCssFile = cssFileEntry
      ? { ...cssFileEntry, content: nextCssContent, type: "css" as const }
      : {
          path: cssLocalVirtualPath,
          name: "local.css",
          type: "css" as const,
          content: nextCssContent,
        };
    textFileCacheRef.current[cssLocalVirtualPath] = nextCssContent;
    pendingPreviewWritesRef.current[cssLocalVirtualPath] = nextCssContent;
    filesRef.current = {
      ...filesRef.current,
      [cssLocalVirtualPath]: nextCssFile,
    };
    setFiles((prev) => ({
      ...prev,
      [cssLocalVirtualPath]: nextCssFile,
    }));
    setDirtyFiles((prev) =>
      prev.includes(cssLocalVirtualPath) ? prev : [...prev, cssLocalVirtualPath],
    );
    }
  }

  textFileCacheRef.current[updatedPath] = finalSerialized;
  setFiles((prev) => {
    const current = prev[updatedPath];
    if (!current) return prev;
    return {
      ...prev,
      [updatedPath]: {
        ...current,
        content: finalSerialized,
      },
    };
  });

  const existingRefEntry = filesRef.current[updatedPath];
  if (existingRefEntry) {
    filesRef.current = {
      ...filesRef.current,
      [updatedPath]: { ...existingRefEntry, content: finalSerialized },
    };
  }

  invalidatePreviewDocCache(updatedPath);
  pendingPreviewWritesRef.current[updatedPath] = finalSerialized;
  setDirtyFiles((prev) =>
    prev.includes(updatedPath) ? prev : [...prev, updatedPath],
  );

  if (options?.elementPath && options.elementPath.length > 0) {
    markPreviewPathDirty(updatedPath, options.elementPath);
  }
  if (shouldPushToHistory) {
    pushPreviewHistory(updatedPath, finalSerialized, previousSerialized);
  }

  const currentEntry = filesRef.current[updatedPath];
  if (shouldRefreshPreviewDoc && currentEntry) {
    if (!isMountedPreview) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [updatedPath]: {
          ...currentEntry,
          content: finalSerialized,
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
