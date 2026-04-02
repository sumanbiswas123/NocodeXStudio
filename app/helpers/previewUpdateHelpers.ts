import React from "react";
import { FileMap, VirtualElement } from "../../types";
import {
  applyMultilineTextToElement,
  extractTextFromHtmlFragment,
  extractTextWithBreaks,
  normalizeEditorMultilineText,
  normalizeFontFamilyCssValue,
  readElementByPath,
  toCssPropertyName,
} from "./appHelpers";

const appendPreviewCacheBust = (assetUrl: string, token: string | number) => {
  const url = String(assetUrl || "").trim();
  const cacheToken = String(token || "").trim();
  if (!url || !cacheToken) return url;
  const [basePart, hashPart] = url.split("#", 2);
  const joiner = basePart.includes("?") ? "&" : "?";
  return `${basePart}${joiner}nx_preview_asset=${encodeURIComponent(cacheToken)}${
    hashPart ? `#${hashPart}` : ""
  }`;
};

type PersistPreviewHtmlContent = (
  updatedPath: string,
  serialized: string,
  options?: {
    refreshPreviewDoc?: boolean;
    saveNow?: boolean;
    skipAutoSave?: boolean;
    elementPath?: number[];
    pushToHistory?: boolean;
  },
) => Promise<void>;

export const applyPreviewStyleUpdateAtPath = async ({
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
}: {
  selectedPreviewHtml: string | null;
  elementPath: number[];
  styles: Partial<React.CSSProperties>;
  options?: { syncSelectedElement?: boolean };
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  postPreviewPatchToFrame: (payload: Record<string, unknown>) => void;
  previewSelectedPath: number[] | null;
  syncPreviewSelectionSnapshotFromLiveElement: (
    elementPath: number[],
  ) => boolean;
  loadFileContent: (path: string) => Promise<string | Blob | null | undefined>;
  filesRef: React.MutableRefObject<FileMap>;
  persistPreviewHtmlContent: PersistPreviewHtmlContent;
}): Promise<void> => {
  if (
    !selectedPreviewHtml ||
    !Array.isArray(elementPath) ||
    elementPath.length === 0
  ) {
    return;
  }

  const liveTarget = getLivePreviewSelectedElement(elementPath);
  const normalizedStyles = Object.entries(styles).map(([key, rawValue]) => {
    const cssKey = toCssPropertyName(key);
    const valueRaw =
      rawValue === undefined || rawValue === null ? "" : String(rawValue);
    const value =
      cssKey === "font-family"
        ? normalizeFontFamilyCssValue(valueRaw)
        : valueRaw;
    return { key, cssKey, value };
  });
  const previewStylePatch: Record<string, string> = {};
  for (const { key, cssKey, value } of normalizedStyles) {
    previewStylePatch[key] = value;
    if (!(liveTarget instanceof HTMLElement)) continue;
    if (!value) {
      liveTarget.style.removeProperty(cssKey);
      continue;
    }
    if (cssKey === "animation") {
      liveTarget.style.setProperty("animation", "none");
      // Force layout so the next assignment retriggers animation playback.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      liveTarget.offsetWidth;
    }
    liveTarget.style.setProperty(
      cssKey,
      value,
      cssKey === "font-family" ? "important" : "",
    );
  }
  if (
    liveTarget instanceof HTMLElement &&
    !liveTarget.getAttribute("style")?.trim()
  ) {
    liveTarget.removeAttribute("style");
  }
  postPreviewPatchToFrame({
    type: "PREVIEW_APPLY_STYLE",
    path: elementPath,
    styles: previewStylePatch,
  });

  const pathMatchesSelection =
    Array.isArray(previewSelectedPath) &&
    previewSelectedPath.length === elementPath.length &&
    previewSelectedPath.every((segment, idx) => segment === elementPath[idx]);
  const shouldSyncSelected =
    options?.syncSelectedElement ?? pathMatchesSelection;
  if (shouldSyncSelected && liveTarget instanceof HTMLElement) {
    syncPreviewSelectionSnapshotFromLiveElement(elementPath);
  }

  const loaded = await loadFileContent(selectedPreviewHtml);
  const sourceHtml =
    typeof loaded === "string" && loaded.length > 0
      ? loaded
      : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
        ? (filesRef.current[selectedPreviewHtml]?.content as string)
        : "";
  if (!sourceHtml) return;

  const parser = new DOMParser();
  const parsed = parser.parseFromString(sourceHtml, "text/html");
  const target = readElementByPath(parsed.body, elementPath);
  if (!(target instanceof HTMLElement)) return;
  for (const { cssKey, value } of normalizedStyles) {
    if (!value) {
      target.style.removeProperty(cssKey);
      continue;
    }
    target.style.setProperty(
      cssKey,
      value,
      cssKey === "font-family" ? "important" : "",
    );
  }
  if (!target.getAttribute("style")?.trim()) {
    target.removeAttribute("style");
  }
  const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
  await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
    refreshPreviewDoc: false,
    elementPath,
  });
};

export const queuePreviewStyleUpdate = ({
  selectedPreviewHtml,
  previewSelectedPath,
  styles,
  previewStyleDraftPendingRef,
  previewStyleDraftTimerRef,
  dirtyFilesRef,
  setDirtyFiles,
  markPreviewPathDirty,
  applyPreviewStyleUpdateAtPath,
}: {
  selectedPreviewHtml: string | null;
  previewSelectedPath: number[] | null;
  styles: Partial<React.CSSProperties>;
  previewStyleDraftPendingRef: React.MutableRefObject<{
    filePath: string;
    elementPath: number[];
    styles: Partial<React.CSSProperties>;
  } | null>;
  previewStyleDraftTimerRef: React.MutableRefObject<number | null>;
  dirtyFilesRef: React.MutableRefObject<string[]>;
  setDirtyFiles: React.Dispatch<React.SetStateAction<string[]>>;
  markPreviewPathDirty: (path: string, elementPath: number[]) => void;
  applyPreviewStyleUpdateAtPath: (
    elementPath: number[],
    styles: Partial<React.CSSProperties>,
    options?: { syncSelectedElement?: boolean },
  ) => Promise<void>;
}): void => {
  if (
    !selectedPreviewHtml ||
    !previewSelectedPath ||
    !Array.isArray(previewSelectedPath) ||
    previewSelectedPath.length === 0
  ) {
    return;
  }

  const targetPath = [...previewSelectedPath];
  const currentPending = previewStyleDraftPendingRef.current;
  const samePendingTarget =
    currentPending &&
    currentPending.filePath === selectedPreviewHtml &&
    currentPending.elementPath.length === targetPath.length &&
    currentPending.elementPath.every(
      (segment, index) => segment === targetPath[index],
    );

  if (
    currentPending &&
    !samePendingTarget &&
    currentPending.elementPath.length > 0
  ) {
    void applyPreviewStyleUpdateAtPath(
      currentPending.elementPath,
      currentPending.styles,
      { syncSelectedElement: false },
    );
  }

  previewStyleDraftPendingRef.current = {
    filePath: selectedPreviewHtml,
    elementPath: targetPath,
    styles: {
      ...(samePendingTarget ? currentPending?.styles || {} : {}),
      ...styles,
    },
  };

  if (!dirtyFilesRef.current.includes(selectedPreviewHtml)) {
    dirtyFilesRef.current = [...dirtyFilesRef.current, selectedPreviewHtml];
    setDirtyFiles((prev) =>
      prev.includes(selectedPreviewHtml) ? prev : [...prev, selectedPreviewHtml],
    );
  }
  markPreviewPathDirty(selectedPreviewHtml, targetPath);

  if (previewStyleDraftTimerRef.current !== null) {
    window.clearTimeout(previewStyleDraftTimerRef.current);
  }
  previewStyleDraftTimerRef.current = window.setTimeout(() => {
    previewStyleDraftTimerRef.current = null;
    const pending = previewStyleDraftPendingRef.current;
    previewStyleDraftPendingRef.current = null;
    if (!pending || pending.elementPath.length === 0) return;
    void applyPreviewStyleUpdateAtPath(pending.elementPath, pending.styles, {
      syncSelectedElement: true,
    });
  }, 120);
};

export const applyPreviewContentUpdate = async ({
  data,
  selectedPreviewHtml,
  previewSelectedPath,
  loadFileContent,
  filesRef,
  getLivePreviewSelectedElement,
  resolvePreviewAssetUrl,
  persistPreviewHtmlContent,
  setPreviewSelectedElement,
}: {
  data: {
    content?: string;
    html?: string;
    src?: string;
    liveSrc?: string;
    href?: string;
  };
  selectedPreviewHtml: string | null;
  previewSelectedPath: number[] | null;
  loadFileContent: (path: string) => Promise<string | Blob | null | undefined>;
  filesRef: React.MutableRefObject<FileMap>;
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  resolvePreviewAssetUrl: (assetPath: string) => string | null;
  persistPreviewHtmlContent: PersistPreviewHtmlContent;
  setPreviewSelectedElement: React.Dispatch<
    React.SetStateAction<VirtualElement | null>
  >;
}): Promise<void> => {
  if (
    !selectedPreviewHtml ||
    !previewSelectedPath ||
    !Array.isArray(previewSelectedPath) ||
    previewSelectedPath.length === 0
  ) {
    return;
  }

  const loaded = await loadFileContent(selectedPreviewHtml);
  const sourceHtml =
    typeof loaded === "string" && loaded.length > 0
      ? loaded
      : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
        ? (filesRef.current[selectedPreviewHtml]?.content as string)
        : "";
  if (!sourceHtml) return;

  const parser = new DOMParser();
  const parsed = parser.parseFromString(sourceHtml, "text/html");
  const target = readElementByPath(parsed.body, previewSelectedPath);
  const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
  if (!target && !liveTarget) return;

  let didChangeContent = false;
  let didChangeSrc = false;
  let didChangeHref = false;
  let nextResolvedContent: string | null = null;
  let nextResolvedHtml: string | null = null;

  if (typeof data.html === "string") {
    const nextHtml = data.html;
    const currentHtml =
      target instanceof HTMLElement
        ? target.innerHTML
        : liveTarget instanceof HTMLElement
          ? liveTarget.innerHTML
          : "";
    if (currentHtml !== nextHtml) {
      if (target instanceof HTMLElement) {
        target.innerHTML = nextHtml;
      }
      if (liveTarget instanceof HTMLElement) {
        liveTarget.innerHTML = nextHtml;
      }
      didChangeContent = true;
    }
    if (didChangeContent) {
      const baselineElement =
        (target instanceof HTMLElement && target) ||
        (liveTarget instanceof HTMLElement && liveTarget) ||
        null;
      nextResolvedHtml =
        baselineElement instanceof HTMLElement
          ? baselineElement.innerHTML
          : nextHtml;
      nextResolvedContent = baselineElement
        ? normalizeEditorMultilineText(extractTextWithBreaks(baselineElement))
        : normalizeEditorMultilineText(extractTextFromHtmlFragment(nextHtml));
    }
  } else if (typeof data.content === "string") {
    const normalizedText = data.content.replace(/\r\n?/g, "\n");
    const baselineElement = target || liveTarget;
    const currentText = extractTextWithBreaks(baselineElement);
    const nextComparable = normalizeEditorMultilineText(normalizedText);
    const currentComparable = normalizeEditorMultilineText(currentText);
    if (nextComparable !== currentComparable) {
      if (target) {
        applyMultilineTextToElement(target, normalizedText);
      }
      if (liveTarget) {
        applyMultilineTextToElement(liveTarget, normalizedText);
      }
      didChangeContent = true;
    }
    if (didChangeContent) {
      const updatedElement = target || liveTarget;
      nextResolvedContent = normalizeEditorMultilineText(
        extractTextWithBreaks(updatedElement),
      );
      nextResolvedHtml =
        updatedElement instanceof HTMLElement ? updatedElement.innerHTML : null;
    }
  }

  if (
    typeof data.src === "string" &&
    (target instanceof HTMLElement || liveTarget instanceof HTMLElement)
  ) {
    const sourceValue = data.src.trim();
    const previewAssetReloadToken = Date.now();
    const liveResolvedSource =
      appendPreviewCacheBust(
        (typeof data.liveSrc === "string" && data.liveSrc.trim()) ||
      resolvePreviewAssetUrl(sourceValue) ||
          sourceValue,
        previewAssetReloadToken,
      );
    const lowerTag =
      target instanceof HTMLElement
        ? target.tagName.toLowerCase()
        : liveTarget instanceof HTMLElement
          ? liveTarget.tagName.toLowerCase()
          : "";
    const isDirectImageTag =
      lowerTag === "img" || lowerTag === "source" || lowerTag === "video";
    if (isDirectImageTag) {
      if (target instanceof HTMLElement) {
        const previousSrc = target.getAttribute("src") || "";
        if (previousSrc !== sourceValue) {
          target.setAttribute("src", sourceValue);
          didChangeSrc = true;
        }
      }
      if (liveTarget instanceof HTMLElement) {
        const previousSrc = liveTarget.getAttribute("src") || "";
        if (previousSrc !== liveResolvedSource) {
          liveTarget.setAttribute("src", liveResolvedSource);
          didChangeSrc = true;
        }
      }
    } else {
      const nextBackground =
        sourceValue.length === 0
          ? ""
          : /^url\(/i.test(sourceValue)
            ? sourceValue
            : `url("${sourceValue}")`;
      if (nextBackground) {
        if (target instanceof HTMLElement) {
          const previous = target.style.getPropertyValue("background-image");
          if (previous !== nextBackground) {
            target.style.setProperty("background-image", nextBackground);
            didChangeSrc = true;
          }
        }
        if (liveTarget instanceof HTMLElement) {
          const liveBackground =
            sourceValue.length === 0
              ? ""
              : /^url\(/i.test(sourceValue)
                ? sourceValue.replace(
                    /url\((['"]?)(.*?)\1\)/i,
                    (_match, quote, rawUrl) => {
                      const resolved = resolvePreviewAssetUrl(rawUrl) || rawUrl;
                      const busted = appendPreviewCacheBust(
                        resolved,
                        previewAssetReloadToken,
                      );
                      const nextQuote = quote || '"';
                      return `url(${nextQuote}${busted}${nextQuote})`;
                    },
                  )
                : `url("${liveResolvedSource}")`;
          const previous = liveTarget.style.getPropertyValue("background-image");
          if (previous !== liveBackground) {
            liveTarget.style.setProperty("background-image", liveBackground);
            didChangeSrc = true;
          }
        }
      } else {
        if (target instanceof HTMLElement) {
          const previous = target.style.getPropertyValue("background-image");
          if (previous) {
            target.style.removeProperty("background-image");
            didChangeSrc = true;
          }
        }
        if (liveTarget instanceof HTMLElement) {
          const previous = liveTarget.style.getPropertyValue("background-image");
          if (previous) {
            liveTarget.style.removeProperty("background-image");
            didChangeSrc = true;
          }
        }
      }
    }
  }

  if (typeof data.href === "string") {
    if (target instanceof HTMLElement) {
      const previousHref = target.getAttribute("href") || "";
      if (previousHref !== data.href) {
        target.setAttribute("href", data.href);
        didChangeHref = true;
      }
    }
    if (liveTarget instanceof HTMLElement) {
      const previousHref = liveTarget.getAttribute("href") || "";
      if (previousHref !== data.href) {
        liveTarget.setAttribute("href", data.href);
        didChangeHref = true;
      }
    }
  }

  if (target && (didChangeContent || didChangeSrc || didChangeHref)) {
    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
      refreshPreviewDoc: false,
      elementPath: previewSelectedPath,
    });
  }

  if (didChangeContent || didChangeSrc || didChangeHref) {
    setPreviewSelectedElement((prev) =>
      prev
        ? {
            ...prev,
            ...(didChangeContent
              ? {
                  content:
                    nextResolvedContent ??
                    (typeof data.content === "string"
                      ? data.content.replace(/\r\n?/g, "\n")
                      : prev.content),
                  ...(nextResolvedHtml !== null
                    ? { html: nextResolvedHtml }
                    : {}),
                }
              : {}),
            ...(didChangeSrc && typeof data.src === "string"
              ? { src: data.src }
              : {}),
            ...(didChangeHref && typeof data.href === "string"
              ? { href: data.href }
              : {}),
          }
        : prev,
    );
  }
};
