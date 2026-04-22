import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { FileMap, VirtualElement } from "../../../types";
import {
  ensureDirectoryForFile,
} from "../../runtime/projectFilesystem";
import {
  getParentPath,
  isExternalUrl,
  normalizePath,
  readElementByPath,
  relativePathBetweenVirtualFiles,
  resolveProjectRelativePath,
} from "../../helpers/appHelpers";
import {
  extractAssetUrlFromCssValue,
  type PreviewMatchedCssRule,
} from "../../helpers/previewCssHelpers";

type PersistPreviewHtmlContentFn = (
  path: string,
  html: string,
  options?: {
    refreshPreviewDoc?: boolean;
    saveNow?: boolean;
    skipAutoSave?: boolean;
    elementPath?: number[];
    pushToHistory?: boolean;
    skipCssExtraction?: boolean;
  },
) => Promise<void>;

type UsePreviewElementActionsOptions = {
  applyPreviewContentUpdate: (data: {
    content?: string;
    html?: string;
    src?: string;
    liveSrc?: string;
    href?: string;
  }) => Promise<void>;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  filesRef: MutableRefObject<FileMap>;
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  persistPreviewHtmlContent: PersistPreviewHtmlContentFn;
  postPreviewPatchToFrame: (payload: Record<string, unknown>) => void;
  previewFrameRef: MutableRefObject<HTMLIFrameElement | null>;
  previewSelectedElement: VirtualElement | null;
  previewSelectedPath: number[] | null;
  projectPath: string | null;
  quickTextRangeRef: MutableRefObject<Range | null>;
  resolvePreviewAssetUrl: (assetPath: string) => string;
  selectedPreviewHtml: string | null;
  selectedPreviewSrc: string | null;
  selectPreviewElementAtPath: (path: number[]) => void;
  previewSelectedMatchedCssRules: PreviewMatchedCssRule[];
  resolvePreviewMatchedRuleSourcePath?: (
    source?: string | null,
  ) => string | null;
  handlePreviewMatchedRulePropertyAdd?: (
    rule: {
      selector: string;
      source: string;
      sourcePath?: string;
      occurrenceIndex?: number;
      originalProperty?: string;
      isActive?: boolean;
    },
    styles: Partial<React.CSSProperties>,
  ) => void;
  setFiles: Dispatch<SetStateAction<FileMap>>;
  setInteractionMode: Dispatch<
    SetStateAction<"edit" | "preview" | "inspect" | "draw" | "move">
  >;
  setIsCodePanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsRightPanelOpen: Dispatch<SetStateAction<boolean>>;
  setPreviewMode: Dispatch<SetStateAction<"edit" | "preview">>;
  setPreviewSelectedComputedStyles: Dispatch<
    SetStateAction<React.CSSProperties | null>
  >;
  setPreviewSelectedElement: Dispatch<SetStateAction<VirtualElement | null>>;
  setPreviewSelectedPath: Dispatch<SetStateAction<number[] | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSidebarToolMode: Dispatch<
    SetStateAction<"edit" | "inspect" | "draw" | "move">
  >;
  binaryAssetUrlCacheRef: MutableRefObject<Record<string, string>>;
};

export const usePreviewElementActions = ({
  applyPreviewContentUpdate,
  binaryAssetUrlCacheRef,
  filePathIndexRef,
  filesRef,
  getLivePreviewSelectedElement,
  loadFileContent,
  persistPreviewHtmlContent,
  postPreviewPatchToFrame,
  previewFrameRef,
  previewSelectedElement,
  previewSelectedPath,
  projectPath,
  quickTextRangeRef,
  resolvePreviewAssetUrl,
  selectedPreviewHtml,
  selectedPreviewSrc,
  selectPreviewElementAtPath,
  previewSelectedMatchedCssRules,
  resolvePreviewMatchedRuleSourcePath,
  handlePreviewMatchedRulePropertyAdd,
  setFiles,
  setInteractionMode,
  setIsCodePanelOpen,
  setIsRightPanelOpen,
  setPreviewMode,
  setPreviewSelectedComputedStyles,
  setPreviewSelectedElement,
  setPreviewSelectedPath,
  setSelectedId,
  setSidebarToolMode,
}: UsePreviewElementActionsOptions) => {
  const quickTextHighlightArmedRef = useRef(false);
  const quickTextProgrammaticSelectionRef = useRef(false);
  const quickTextHighlightCleanupRef = useRef<(() => void) | null>(null);

  const debugPreviewAssetReplace = (
    label: string,
    payload: Record<string, unknown>,
  ) => {
    if (typeof window === "undefined") return;
    if ((window as any).__NX_DEBUG_PREVIEW_CSS === false) return;
    console.log(`[PreviewAssetDebug] ${label}`, payload);
  };

  const toReactStyleName = (raw: string) =>
    String(raw || "").replace(/-([a-z])/g, (_all, char: string) =>
      char.toUpperCase(),
    );

  const handleReplacePreviewAsset = useCallback(async () => {
    if (
      !projectPath ||
      !selectedPreviewHtml ||
      !previewSelectedElement ||
      !previewSelectedPath ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return false;
    }

    const selections = await (Neutralino as any).os.showOpenDialog(
      "Select replacement asset",
      {
        multiSelections: false,
        filters: [
          {
            name: "Assets",
            extensions: [
              "png",
              "jpg",
              "jpeg",
              "webp",
              "gif",
              "svg",
              "mp4",
              "webm",
              "mov",
            ],
          },
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
          },
          { name: "Video", extensions: ["mp4", "webm", "mov"] },
        ],
      },
    );
    const sourceAbsolutePath = Array.isArray(selections)
      ? selections[0]
      : selections;
    if (!sourceAbsolutePath) {
      return false;
    }

    const htmlAbsolutePath = filePathIndexRef.current[selectedPreviewHtml];
    const htmlDirAbsolute = htmlAbsolutePath
      ? getParentPath(normalizePath(htmlAbsolutePath))
      : null;
    const htmlDirRelative = getParentPath(selectedPreviewHtml) || "";
    if (!htmlDirAbsolute) return false;

    const sourceName =
      normalizePath(String(sourceAbsolutePath)).split("/").pop() || "asset";
    const dotIndex = sourceName.lastIndexOf(".");
    const rawBaseName =
      dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName;
    const extension = dotIndex > 0 ? sourceName.slice(dotIndex) : "";
    const safeBaseName =
      rawBaseName
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "") || "asset";
    const uniqueFileName = `${safeBaseName}-${Date.now()}${extension}`;
    const activeMatchedAssetRule = previewSelectedMatchedCssRules.find((rule) =>
      rule.declarations.some((declaration) => {
        const property = String(declaration.property || "").trim().toLowerCase();
        if (
          declaration.active === false ||
          (property !== "background-image" && property !== "background")
        ) {
          return false;
        }
        return Boolean(extractAssetUrlFromCssValue(declaration.value));
      }),
    );
    const activeMatchedAssetDeclaration =
      activeMatchedAssetRule?.declarations.find((declaration) => {
        const property = String(declaration.property || "").trim().toLowerCase();
        if (
          declaration.active === false ||
          (property !== "background-image" && property !== "background")
        ) {
          return false;
        }
        return Boolean(extractAssetUrlFromCssValue(declaration.value));
      }) || null;
    const selectedElementTag = String(previewSelectedElement?.type || "")
      .trim()
      .toLowerCase();
    const isDirectElementAssetTag =
      selectedElementTag === "img" ||
      selectedElementTag === "source" ||
      selectedElementTag === "video";
    const directElementSource = String(previewSelectedElement?.src || "").trim();
    const directElementResolvedPath =
      isDirectElementAssetTag &&
      directElementSource &&
      !isExternalUrl(directElementSource)
        ? resolveProjectRelativePath(selectedPreviewHtml, directElementSource) ||
          (directElementSource.startsWith("/")
            ? directElementSource.replace(/^\/+/, "")
            : directElementSource)
        : null;
    const preferredAssetRelativeDir =
      isDirectElementAssetTag && directElementResolvedPath
        ? getParentPath(directElementResolvedPath)
        : null;
    const targetRelativePath = preferredAssetRelativeDir
      ? `${preferredAssetRelativeDir}/${uniqueFileName}`
      : htmlDirRelative
        ? `${htmlDirRelative}/${uniqueFileName}`
        : uniqueFileName;
    const targetAbsolutePath = filePathIndexRef.current[targetRelativePath]
      ? normalizePath(filePathIndexRef.current[targetRelativePath])
      : `${htmlDirAbsolute}/${targetRelativePath.slice(htmlDirRelative ? `${htmlDirRelative}/`.length : 0)}`;

    await ensureDirectoryForFile(targetAbsolutePath);
    try {
      await (Neutralino as any).filesystem.copy(
        normalizePath(String(sourceAbsolutePath)),
        targetAbsolutePath,
      );
    } catch {
      const binary = await (Neutralino as any).filesystem.readBinaryFile(
        normalizePath(String(sourceAbsolutePath)),
      );
      await (Neutralino as any).filesystem.writeBinaryFile(
        targetAbsolutePath,
        binary,
      );
    }

    filePathIndexRef.current[targetRelativePath] = targetAbsolutePath;
    setFiles((prev) => ({
      ...prev,
      [targetRelativePath]: {
        path: targetRelativePath,
        name: uniqueFileName,
        type: /\.(mp4|webm|mov)$/i.test(extension) ? "unknown" : "image",
        content: "",
      },
    }));

    try {
      await loadFileContent(targetRelativePath, { persistToState: true });
    } catch {
      // Ignore preview cache warmup failures; the HTML patch below is the source of truth.
    }

    debugPreviewAssetReplace("handleReplacePreviewAsset:selected-file", {
      selectedPreviewHtml,
      targetRelativePath,
      previewSelectedPath,
      previewSelectedElementSrc: previewSelectedElement?.src || "",
      matchedRuleCount: previewSelectedMatchedCssRules.length,
      directElementResolvedPath: directElementResolvedPath || "",
    });

    if (
      activeMatchedAssetRule &&
      activeMatchedAssetDeclaration &&
      !isDirectElementAssetTag &&
      handlePreviewMatchedRulePropertyAdd
    ) {
      const cssSourcePath =
        (typeof resolvePreviewMatchedRuleSourcePath === "function"
          ? resolvePreviewMatchedRuleSourcePath(
              activeMatchedAssetRule.sourcePath || activeMatchedAssetRule.source,
            )
          : null) ||
        activeMatchedAssetRule.sourcePath ||
        selectedPreviewHtml;
      const replacementUrl =
        relativePathBetweenVirtualFiles(cssSourcePath, targetRelativePath) ||
        uniqueFileName;
      const nextRuleValue = String(activeMatchedAssetDeclaration.value || "").replace(
        /url\((['"]?)(.*?)\1\)/i,
        (_match, quote) => {
          const nextQuote = quote || '"';
          return `url(${nextQuote}${replacementUrl}${nextQuote})`;
        },
      );
      debugPreviewAssetReplace("handleReplacePreviewAsset:css-rule-path", {
        selector: activeMatchedAssetRule.selector,
        source: activeMatchedAssetRule.source,
        sourcePath: activeMatchedAssetRule.sourcePath || "",
        resolvedCssSourcePath: cssSourcePath,
        originalProperty: activeMatchedAssetDeclaration.property,
        originalValue: activeMatchedAssetDeclaration.value,
        replacementUrl,
        nextRuleValue,
      });
      handlePreviewMatchedRulePropertyAdd(
        {
          selector: activeMatchedAssetRule.selector,
          source: activeMatchedAssetRule.source,
          sourcePath: activeMatchedAssetRule.sourcePath,
          originalProperty: activeMatchedAssetDeclaration.property,
        },
        {
          [toReactStyleName(activeMatchedAssetDeclaration.property)]: nextRuleValue,
        },
      );
      return true;
    }

    const htmlRelativeAssetPath =
      relativePathBetweenVirtualFiles(selectedPreviewHtml, targetRelativePath) ||
      uniqueFileName;

    const nextLiveSrc =
      typeof binaryAssetUrlCacheRef.current[targetRelativePath] === "string" &&
      binaryAssetUrlCacheRef.current[targetRelativePath].length > 0
        ? binaryAssetUrlCacheRef.current[targetRelativePath]
        : resolvePreviewAssetUrl(htmlRelativeAssetPath) || htmlRelativeAssetPath;

    debugPreviewAssetReplace("handleReplacePreviewAsset:direct-element-path", {
      uniqueFileName,
      targetRelativePath,
      nextLiveSrc,
      selectedElementType: previewSelectedElement?.type || "",
      selectedElementSrc: previewSelectedElement?.src || "",
      isDirectElementAssetTag,
    });

    await applyPreviewContentUpdate({
      src: isDirectElementAssetTag ? htmlRelativeAssetPath : uniqueFileName,
      liveSrc: nextLiveSrc,
    });
    return true;
  }, [
    applyPreviewContentUpdate,
    binaryAssetUrlCacheRef,
    handlePreviewMatchedRulePropertyAdd,
    filePathIndexRef,
    loadFileContent,
    previewSelectedMatchedCssRules,
    previewSelectedElement,
    previewSelectedPath,
    projectPath,
    resolvePreviewMatchedRuleSourcePath,
    resolvePreviewAssetUrl,
    selectedPreviewHtml,
    setFiles,
  ]);

  const sanitizeQuickEditDocument = useCallback((doc: Document) => {
    const editables = doc.querySelectorAll<HTMLElement>("[contenteditable]");
    editables.forEach((el) => el.removeAttribute("contenteditable"));
    if (
      doc.documentElement?.getAttribute("data-nx-mounted-preview-bridge") ===
      "1"
    ) {
      doc.documentElement.removeAttribute("data-nx-mounted-preview-bridge");
    }
    const previewClasses = doc.querySelectorAll<HTMLElement>(
      ".__nx-preview-editing, .__nx-preview-selected, .__nx-preview-dirty",
    );
    previewClasses.forEach((el) => {
      el.classList.remove("__nx-preview-editing");
      el.classList.remove("__nx-preview-selected");
      el.classList.remove("__nx-preview-dirty");
    });
    const overlays = doc.querySelectorAll<HTMLElement>(
      "[data-preview-hover-outline], [data-preview-hover-badge], [data-preview-draw-draft], [data-nx-quick-text-highlight]",
    );
    overlays.forEach((el) => el.remove());
  }, []);

  const unwrapInlineElement = useCallback((element: Element): Element | null => {
    const parent = element.parentElement;
    if (!parent) return null;
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
    parent.normalize();
    return parent;
  }, []);

  const getRangeElement = useCallback((node: Node | null): Element | null => {
    if (!node) return null;
    return node instanceof Element ? node : node.parentElement;
  }, []);

  const getElementPathFromBody = useCallback((element: Element | null): number[] | null => {
    if (!element) return null;
    const path: number[] = [];
    let cursor: Element | null = element;
    while (cursor && cursor.parentElement) {
      const parentElement: HTMLElement = cursor.parentElement;
      const index = Array.from(parentElement.children).indexOf(cursor);
      if (index < 0) return null;
      path.unshift(index);
      if (parentElement === element.ownerDocument.body) {
        return path;
      }
      cursor = parentElement;
    }
    return null;
  }, []);

  const getSelectedInlineTags = useCallback(
    (range: Range, tagName: "sup" | "sub"): Element[] => {
      const selected = new Set<Element>();
      const addClosest = (node: Node | null) => {
        const element = getRangeElement(node);
        const closest = element?.closest?.(tagName);
        if (closest) selected.add(closest);
      };

      addClosest(range.startContainer);
      addClosest(range.endContainer);
      addClosest(range.commonAncestorContainer);

      const ancestor = getRangeElement(range.commonAncestorContainer);
      ancestor?.querySelectorAll?.(tagName).forEach((element) => {
        try {
          if (range.intersectsNode(element)) {
            selected.add(element);
          }
        } catch {
          // Some browser Range implementations can throw on detached nodes.
        }
      });

      return Array.from(selected);
    },
    [getRangeElement],
  );

  const insertSelectionBoundaryMarkers = useCallback((range: Range): {
    startMarker: HTMLElement;
    endMarker: HTMLElement;
  } | null => {
    const ownerDocument = range.commonAncestorContainer.ownerDocument;
    if (!ownerDocument) return null;
    const markerId = `nx-quick-selection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startMarker = ownerDocument.createElement("span");
    const endMarker = ownerDocument.createElement("span");
    startMarker.setAttribute("data-nx-quick-selection-start", markerId);
    endMarker.setAttribute("data-nx-quick-selection-end", markerId);
    startMarker.style.display = "none";
    endMarker.style.display = "none";

    const endRange = range.cloneRange();
    endRange.collapse(false);
    endRange.insertNode(endMarker);

    const startRange = range.cloneRange();
    startRange.collapse(true);
    startRange.insertNode(startMarker);

    return { startMarker, endMarker };
  }, []);

  const clearQuickTextHighlight = useCallback((doc: Document) => {
    doc.querySelectorAll<HTMLElement>("[data-nx-quick-text-highlight]").forEach((el) => {
      el.remove();
    });
    quickTextHighlightArmedRef.current = false;
    quickTextHighlightCleanupRef.current?.();
    quickTextHighlightCleanupRef.current = null;
  }, []);

  const armQuickTextHighlightCleanup = useCallback(
    (doc: Document) => {
      const frame = previewFrameRef.current;
      const win = doc.defaultView;
      if (!win) return;

      quickTextHighlightCleanupRef.current?.();
      const clearFromCurrentDoc = () => {
        if (quickTextHighlightArmedRef.current) {
          clearQuickTextHighlight(doc);
        }
      };
      const clearOnSelectionChange = () => {
        if (quickTextProgrammaticSelectionRef.current) return;
        clearFromCurrentDoc();
      };

      doc.addEventListener("selectionchange", clearOnSelectionChange);
      doc.addEventListener("pointerdown", clearFromCurrentDoc, true);
      doc.addEventListener("mousedown", clearFromCurrentDoc, true);
      doc.addEventListener("keydown", clearFromCurrentDoc, true);
      doc.addEventListener("scroll", clearFromCurrentDoc, true);
      doc.addEventListener("focusout", clearFromCurrentDoc, true);
      win.addEventListener("blur", clearFromCurrentDoc);
      frame?.addEventListener("blur", clearFromCurrentDoc);
      document.addEventListener("pointerdown", clearFromCurrentDoc, true);
      document.addEventListener("focusin", clearFromCurrentDoc, true);

      quickTextHighlightCleanupRef.current = () => {
        doc.removeEventListener("selectionchange", clearOnSelectionChange);
        doc.removeEventListener("pointerdown", clearFromCurrentDoc, true);
        doc.removeEventListener("mousedown", clearFromCurrentDoc, true);
        doc.removeEventListener("keydown", clearFromCurrentDoc, true);
        doc.removeEventListener("scroll", clearFromCurrentDoc, true);
        doc.removeEventListener("focusout", clearFromCurrentDoc, true);
        win.removeEventListener("blur", clearFromCurrentDoc);
        frame?.removeEventListener("blur", clearFromCurrentDoc);
        document.removeEventListener("pointerdown", clearFromCurrentDoc, true);
        document.removeEventListener("focusin", clearFromCurrentDoc, true);
      };
    },
    [clearQuickTextHighlight, previewFrameRef],
  );

  const showQuickTextHighlight = useCallback(
    (range: Range) => {
      const doc = range.commonAncestorContainer.ownerDocument;
      const body = doc?.body;
      const view = doc?.defaultView;
      if (!doc || !body || !view) return;
      clearQuickTextHighlight(doc);
      const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      quickTextHighlightArmedRef.current = rects.length > 0;
      if (rects.length > 0) {
        armQuickTextHighlightCleanup(doc);
      }
      rects.forEach((rect) => {
        const overlay = doc.createElement("span");
        overlay.setAttribute("data-nx-quick-text-highlight", "true");
        overlay.style.position = "absolute";
        overlay.style.left = `${rect.left + view.scrollX}px`;
        overlay.style.top = `${rect.top + view.scrollY}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.background = "rgba(14, 165, 233, 0.32)";
        overlay.style.outline = "1px solid rgba(14, 165, 233, 0.65)";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "2147483646";
        overlay.style.borderRadius = "2px";
        body.appendChild(overlay);
      });
    },
    [armQuickTextHighlightCleanup, clearQuickTextHighlight],
  );

  useEffect(() => {
    const frame = previewFrameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc || !win) return;

    const clearForUserChange = () => {
      if (quickTextHighlightArmedRef.current) {
        clearQuickTextHighlight(doc);
      }
    };
    const clearOnSelectionChange = () => {
      if (quickTextProgrammaticSelectionRef.current) {
        return;
      }
      clearForUserChange();
    };
    const clearOnBlur = () => {
      clearQuickTextHighlight(doc);
    };

    doc.addEventListener("selectionchange", clearOnSelectionChange);
    doc.addEventListener("pointerdown", clearForUserChange, true);
    doc.addEventListener("keydown", clearForUserChange, true);
    doc.addEventListener("scroll", clearForUserChange, true);
    doc.addEventListener("focusout", clearOnBlur);
    win.addEventListener("blur", clearOnBlur);
    frame.addEventListener("blur", clearOnBlur);
    document.addEventListener("pointerdown", clearOnBlur, true);
    document.addEventListener("focusin", clearOnBlur, true);
    return () => {
      doc.removeEventListener("selectionchange", clearOnSelectionChange);
      doc.removeEventListener("pointerdown", clearForUserChange, true);
      doc.removeEventListener("keydown", clearForUserChange, true);
      doc.removeEventListener("scroll", clearForUserChange, true);
      doc.removeEventListener("focusout", clearOnBlur);
      win.removeEventListener("blur", clearOnBlur);
      frame.removeEventListener("blur", clearOnBlur);
      document.removeEventListener("pointerdown", clearOnBlur, true);
      document.removeEventListener("focusin", clearOnBlur, true);
    };
  }, [clearQuickTextHighlight, previewFrameRef]);

  const applyQuickTextWrapTag = useCallback(
    async (tagName: "sup" | "sub") => {
      const frame = previewFrameRef.current;
      const win = frame?.contentWindow;
      const doc = frame?.contentDocument;
      if (!win || !doc) return;
      if (!selectedPreviewHtml) return;
      clearQuickTextHighlight(doc);
      const selection = win.getSelection?.();
      const activeRange =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const range =
        activeRange && !activeRange.collapsed
          ? activeRange
          : quickTextRangeRef.current;
      if (!range || range.collapsed) return;

      const workingRange = range.cloneRange();
      let updatedNode: Element | null = null;
      let wrappedMarker: string | null = null;
      let nextSelectionPath: number[] | null = null;
      let textSelectionMarkers: {
        startMarker: HTMLElement;
        endMarker: HTMLElement;
      } | null = null;
      const existingTags = getSelectedInlineTags(workingRange, tagName);

      if (existingTags.length > 0) {
        textSelectionMarkers = insertSelectionBoundaryMarkers(workingRange);
        existingTags.forEach((existing) => {
          const parent = unwrapInlineElement(existing);
          if (parent) updatedNode = parent;
        });
        if (!updatedNode) {
          const ancestor = getRangeElement(workingRange.commonAncestorContainer);
          updatedNode = ancestor;
        }
        nextSelectionPath = getElementPathFromBody(updatedNode);
      } else {
        const wrapper = doc.createElement(tagName);
        wrappedMarker = `nx-quick-wrap-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        wrapper.setAttribute("data-nx-quick-wrap-id", wrappedMarker);
        try {
          workingRange.surroundContents(wrapper);
        } catch {
          const frag = workingRange.extractContents();
          wrapper.appendChild(frag);
          workingRange.insertNode(wrapper);
        }
        updatedNode = wrapper;
        nextSelectionPath = getElementPathFromBody(wrapper);
      }

      let liveTarget =
        previewSelectedPath && Array.isArray(previewSelectedPath)
          ? getLivePreviewSelectedElement(previewSelectedPath)
          : null;
      if (liveTarget instanceof HTMLElement) {
        await applyPreviewContentUpdate({ html: liveTarget.innerHTML });
        liveTarget =
          previewSelectedPath && Array.isArray(previewSelectedPath)
            ? getLivePreviewSelectedElement(previewSelectedPath)
            : liveTarget;
        if (wrappedMarker && liveTarget instanceof HTMLElement) {
          const markerSelector = `[data-nx-quick-wrap-id="${wrappedMarker}"]`;
          const markedNode = liveTarget.querySelector<HTMLElement>(markerSelector);
          if (markedNode) {
            nextSelectionPath = getElementPathFromBody(markedNode);
            markedNode.removeAttribute("data-nx-quick-wrap-id");
            await applyPreviewContentUpdate({ html: liveTarget.innerHTML });
            updatedNode = nextSelectionPath
              ? getLivePreviewSelectedElement(nextSelectionPath)
              : markedNode;
          }
        }
      } else if (doc.documentElement) {
        sanitizeQuickEditDocument(doc);
        const serialized = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
        });
      }

      if (nextSelectionPath?.length) {
        selectPreviewElementAtPath(nextSelectionPath);
        updatedNode = getLivePreviewSelectedElement(nextSelectionPath) || updatedNode;
      }

      if (selection) {
        frame.focus?.();
        win.focus?.();
        doc.documentElement?.focus?.({ preventScroll: true });
        selection.removeAllRanges();
        const nextRange = doc.createRange();
        let removedSelectionMarkers = false;
        if (
          textSelectionMarkers?.startMarker.isConnected &&
          textSelectionMarkers.endMarker.isConnected
        ) {
          nextRange.setStartAfter(textSelectionMarkers.startMarker);
          nextRange.setEndBefore(textSelectionMarkers.endMarker);
          textSelectionMarkers.startMarker.remove();
          textSelectionMarkers.endMarker.remove();
          removedSelectionMarkers = true;
        } else if (updatedNode) {
          nextRange.selectNodeContents(updatedNode);
        } else {
          nextRange.selectNodeContents(doc.body);
        }
        quickTextProgrammaticSelectionRef.current = true;
        selection.addRange(nextRange);
        quickTextRangeRef.current = nextRange.cloneRange();
        showQuickTextHighlight(nextRange);
        window.setTimeout(() => {
          quickTextProgrammaticSelectionRef.current = false;
        }, 0);
        if (updatedNode instanceof HTMLElement) {
          updatedNode.focus?.({ preventScroll: true });
        }
        if (removedSelectionMarkers && doc.documentElement) {
          const serialized = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
          await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
            refreshPreviewDoc: false,
            pushToHistory: false,
          });
        }
      }
    },
    [
      applyPreviewContentUpdate,
      clearQuickTextHighlight,
      getElementPathFromBody,
      getRangeElement,
      getSelectedInlineTags,
      getLivePreviewSelectedElement,
      insertSelectionBoundaryMarkers,
      persistPreviewHtmlContent,
      previewFrameRef,
      previewSelectedPath,
      quickTextRangeRef,
      sanitizeQuickEditDocument,
      selectPreviewElementAtPath,
      selectedPreviewHtml,
      showQuickTextHighlight,
      unwrapInlineElement,
    ],
  );

  const applyPreviewTagUpdate = useCallback(
    async (nextTag: string) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const safeTag = String(nextTag || "").toLowerCase();
      if (!safeTag) return;

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

      const replaceTag = (node: Element, tagName: string) => {
        if (!node || !node.ownerDocument) return null;
        const doc = node.ownerDocument;
        const next = doc.createElement(tagName);
        for (const attr of Array.from(node.attributes)) {
          next.setAttribute(attr.name, attr.value);
        }
        while (node.firstChild) {
          next.appendChild(node.firstChild);
        }
        node.replaceWith(next);
        return next;
      };

      let didChange = false;
      if (target instanceof HTMLElement) {
        const currentTag = target.tagName.toLowerCase();
        if (currentTag !== safeTag) {
          replaceTag(target, safeTag);
          didChange = true;
        }
      }
      if (liveTarget instanceof HTMLElement) {
        const currentTag = liveTarget.tagName.toLowerCase();
        if (currentTag !== safeTag) {
          replaceTag(liveTarget, safeTag);
        }
      }

      if (didChange) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
        setPreviewSelectedElement((prev) =>
          prev
            ? {
                ...prev,
                type: safeTag,
                name: safeTag.toUpperCase(),
              }
            : prev,
        );
      }
    },
    [
      filesRef,
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
      setPreviewSelectedElement,
    ],
  );

  const applyPreviewDeleteSelected = useCallback(async () => {
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
    if (!target || !target.parentElement) return;

    target.parentElement.removeChild(target);

    const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
    if (liveTarget && liveTarget.parentElement) {
      liveTarget.parentElement.removeChild(liveTarget);
    }

    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    const parentPath = previewSelectedPath.slice(0, -1);
    await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
      refreshPreviewDoc: false,
      skipCssExtraction: true,
      ...(parentPath.length > 0 ? { elementPath: parentPath } : {}),
    });

    setPreviewSelectedPath(null);
    setPreviewSelectedElement(null);
    setPreviewSelectedComputedStyles(null);
    setSelectedId(null);
  }, [
    filesRef,
    getLivePreviewSelectedElement,
    loadFileContent,
    persistPreviewHtmlContent,
    previewSelectedPath,
    selectedPreviewHtml,
    setPreviewSelectedComputedStyles,
    setPreviewSelectedElement,
    setPreviewSelectedPath,
    setSelectedId,
  ]);

  const applyPreviewCommentOutSelected = useCallback(async () => {
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
    if (!target || !target.parentElement) return;

    const serializedElement = target.outerHTML;
    const bytes = new TextEncoder().encode(serializedElement);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const encodedPayload = window.btoa(binary);
    const commentNode = parsed.createComment(
      ` nx-commented-out:${encodedPayload} `,
    );
    target.replaceWith(commentNode);

    const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
    if (liveTarget && liveTarget.parentElement) {
      liveTarget.parentElement.removeChild(liveTarget);
    }

    const parentPath = previewSelectedPath.slice(0, -1);
    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
      refreshPreviewDoc: false,
      skipCssExtraction: true,
      ...(parentPath.length > 0 ? { elementPath: parentPath } : {}),
    });

    setPreviewSelectedPath(null);
    setPreviewSelectedElement(null);
    setPreviewSelectedComputedStyles(null);
    setSelectedId(null);
  }, [
    filesRef,
    getLivePreviewSelectedElement,
    loadFileContent,
    persistPreviewHtmlContent,
    previewSelectedPath,
    selectedPreviewHtml,
    setPreviewSelectedComputedStyles,
    setPreviewSelectedElement,
    setPreviewSelectedPath,
    setSelectedId,
  ]);

  const handlePreviewDuplicateSelected = useCallback(async () => {
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
    if (!(target instanceof HTMLElement) || !target.parentElement) return;

    const duplicate = target.cloneNode(true) as HTMLElement;
    if (duplicate.id) {
      duplicate.id = `${duplicate.id}-copy-${Date.now()}`;
    }
    target.parentElement.insertBefore(duplicate, target.nextSibling);
    const newPath = [...previewSelectedPath];
    newPath[newPath.length - 1] = newPath[newPath.length - 1] + 1;

    const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
    if (liveTarget instanceof HTMLElement && liveTarget.parentElement) {
      const liveDuplicate = liveTarget.cloneNode(true) as HTMLElement;
      if (liveDuplicate.id) {
        liveDuplicate.id = `${liveDuplicate.id}-copy-${Date.now()}`;
      }
      liveTarget.parentElement.insertBefore(
        liveDuplicate,
        liveTarget.nextSibling,
      );
    }

    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
      refreshPreviewDoc: false,
      saveNow: false,
      skipAutoSave: true,
      elementPath: newPath,
    });
    if (selectedPreviewSrc && parsed.body) {
      postPreviewPatchToFrame({
        type: "PREVIEW_APPLY_HTML",
        html: parsed.body.innerHTML,
      });
    }
    selectPreviewElementAtPath(newPath);
    setIsCodePanelOpen(false);
    setIsRightPanelOpen(true);
    setSidebarToolMode("edit");
    setPreviewMode("edit");
    setInteractionMode("preview");
  }, [
    filesRef,
    getLivePreviewSelectedElement,
    loadFileContent,
    persistPreviewHtmlContent,
    postPreviewPatchToFrame,
    previewSelectedPath,
    selectPreviewElementAtPath,
    selectedPreviewHtml,
    selectedPreviewSrc,
    setInteractionMode,
    setIsCodePanelOpen,
    setIsRightPanelOpen,
    setPreviewMode,
    setSidebarToolMode,
  ]);

  return {
    applyPreviewDeleteSelected,
    applyPreviewCommentOutSelected,
    applyPreviewTagUpdate,
    applyQuickTextWrapTag,
    handlePreviewDuplicateSelected,
    handleReplacePreviewAsset,
  };
};
