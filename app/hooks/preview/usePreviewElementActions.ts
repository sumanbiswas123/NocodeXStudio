import { useCallback } from "react";
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
      "[data-preview-hover-outline], [data-preview-hover-badge], [data-preview-draw-draft]",
    );
    overlays.forEach((el) => el.remove());
  }, []);

  const applyQuickTextWrapTag = useCallback(
    async (tagName: "sup" | "sub") => {
      const frame = previewFrameRef.current;
      const win = frame?.contentWindow;
      const doc = frame?.contentDocument;
      if (!win || !doc) return;
      if (!selectedPreviewHtml) return;
      const selection = win.getSelection?.();
      const activeRange =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const range =
        activeRange && !activeRange.collapsed
          ? activeRange
          : quickTextRangeRef.current;
      if (!range || range.collapsed) return;

      const workingRange = range.cloneRange();
      const ancestor =
        workingRange.commonAncestorContainer instanceof Element
          ? workingRange.commonAncestorContainer
          : workingRange.commonAncestorContainer?.parentElement;
      const existing = ancestor?.closest?.(tagName) || null;
      let updatedNode: Element | null = null;

      if (existing && existing.parentElement) {
        const parent = existing.parentElement;
        while (existing.firstChild) {
          parent.insertBefore(existing.firstChild, existing);
        }
        parent.removeChild(existing);
        updatedNode = parent;
      } else {
        const wrapper = doc.createElement(tagName);
        try {
          workingRange.surroundContents(wrapper);
        } catch {
          const frag = workingRange.extractContents();
          wrapper.appendChild(frag);
          workingRange.insertNode(wrapper);
        }
        updatedNode = wrapper;
      }

      const liveTarget =
        previewSelectedPath && Array.isArray(previewSelectedPath)
          ? getLivePreviewSelectedElement(previewSelectedPath)
          : null;
      if (liveTarget instanceof HTMLElement) {
        await applyPreviewContentUpdate({ html: liveTarget.innerHTML });
      } else if (doc.documentElement) {
        sanitizeQuickEditDocument(doc);
        const serialized = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
        });
      }

      if (selection) {
        selection.removeAllRanges();
        const nextRange = doc.createRange();
        if (updatedNode) {
          nextRange.selectNodeContents(updatedNode);
        } else {
          nextRange.selectNodeContents(doc.body);
        }
        selection.addRange(nextRange);
        quickTextRangeRef.current = nextRange.cloneRange();
      }
    },
    [
      applyPreviewContentUpdate,
      getLivePreviewSelectedElement,
      persistPreviewHtmlContent,
      previewFrameRef,
      previewSelectedPath,
      quickTextRangeRef,
      sanitizeQuickEditDocument,
      selectedPreviewHtml,
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
