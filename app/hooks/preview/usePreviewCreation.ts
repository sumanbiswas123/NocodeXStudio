import { useCallback } from "react";
import type React from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { FileMap, ProjectFile, VirtualElement } from "../../../types";
import {
  ADD_TOOL_COMPONENT_PRESETS,
  ADD_TOOL_COMPONENTS_CSS_CONTENT,
  ADD_TOOL_COMPONENTS_JS_CONTENT,
  ADD_TOOL_CSS_MARKER_END,
  ADD_TOOL_CSS_MARKER_START,
  ADD_TOOL_JS_MARKER_END,
  ADD_TOOL_JS_MARKER_START,
  VOID_HTML_TAGS,
  buildPresetElementV2,
  buildStandardElement,
  createPresetIdFactory,
  getParentPath,
  getToolboxDragPayload,
  inferFileType,
  joinPath,
  materializeVirtualElement,
  normalizePath,
  normalizePreviewDrawTag,
  normalizeProjectRelative,
  parseInlineStyleText,
  PREVIEW_MOUNT_PATH,
  readElementByPath,
  relativePathBetweenVirtualFiles,
  resolveProjectRelativePath,
  rewriteInlineAssetRefs,
  toMountRelativePath,
  toCssPropertyName,
} from "../../helpers/appHelpers";
import {
  normalizePresentationCssValue,
  normalizePresentationStylePatch,
} from "../../helpers/previewCssHelpers";

type UsePreviewCreationOptions = {
  ensureDirectoryTreeStable: (path: string) => Promise<void> | void;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  filesRef: MutableRefObject<FileMap>;
  getStablePreviewElementId: (
    path: number[] | null | undefined,
    explicitId?: string | null,
    fallbackId?: string | null,
  ) => string;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  pendingPreviewWritesRef: MutableRefObject<Record<string, string>>;
  persistPreviewHtmlContent: (
    path: string,
    html: string,
    options?: Record<string, unknown>,
  ) => Promise<void>;
  postPreviewPatchToFrame: (payload: Record<string, unknown>) => void;
  previewFrameRef: MutableRefObject<HTMLIFrameElement | null>;
  previewMountBasePath: string | null;
  selectedPreviewHtml: string | null;
  selectedPreviewSrc: string | null;
  setFiles: Dispatch<SetStateAction<FileMap>>;
  setInteractionMode: Dispatch<
    SetStateAction<"edit" | "preview" | "inspect" | "draw" | "move">
  >;
  setIsCodePanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsRightPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsToolboxDragging: Dispatch<SetStateAction<boolean>>;
  setPreviewMode: Dispatch<SetStateAction<"edit" | "preview">>;
  setPreviewNavigationFile: Dispatch<SetStateAction<string | null>>;
  setPreviewSelectedComputedStyles: Dispatch<
    SetStateAction<React.CSSProperties | null>
  >;
  setPreviewSelectedElement: Dispatch<SetStateAction<VirtualElement | null>>;
  setPreviewSelectedMatchedCssRules: Dispatch<SetStateAction<any[]>>;
  setPreviewSelectedPath: Dispatch<SetStateAction<number[] | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSidebarToolMode: Dispatch<
    SetStateAction<"edit" | "inspect" | "draw" | "move">
  >;
  textFileCacheRef: MutableRefObject<Record<string, string>>;
  toolboxDragTypeRef: MutableRefObject<string>;
};

export const usePreviewCreation = ({
  ensureDirectoryTreeStable,
  filePathIndexRef,
  filesRef,
  getStablePreviewElementId,
  loadFileContent,
  pendingPreviewWritesRef,
  persistPreviewHtmlContent,
  postPreviewPatchToFrame,
  previewFrameRef,
  previewMountBasePath,
  selectedPreviewHtml,
  selectedPreviewSrc,
  setFiles,
  setInteractionMode,
  setIsCodePanelOpen,
  setIsRightPanelOpen,
  setIsToolboxDragging,
  setPreviewMode,
  setPreviewNavigationFile,
  setPreviewSelectedComputedStyles,
  setPreviewSelectedElement,
  setPreviewSelectedMatchedCssRules,
  setPreviewSelectedPath,
  setSelectedId,
  setSidebarToolMode,
  textFileCacheRef,
  toolboxDragTypeRef,
}: UsePreviewCreationOptions) => {
  const resolveMountedPreviewPathFromFrame = useCallback((): string | null => {
    if (!previewMountBasePath) return null;
    const frameWindow =
      previewFrameRef.current?.contentWindow ??
      previewFrameRef.current?.contentDocument?.defaultView ??
      null;
    const frameSrc =
      frameWindow?.location?.href ||
      previewFrameRef.current?.getAttribute("src") ||
      previewFrameRef.current?.src ||
      "";
    if (!frameSrc) return null;
    let pathname = "";
    try {
      pathname = new URL(frameSrc, window.location.href).pathname || "";
    } catch {
      return null;
    }
    if (!pathname.startsWith(`${PREVIEW_MOUNT_PATH}/`)) return null;
    const mountRelative = normalizeProjectRelative(
      decodeURIComponent(pathname.slice(PREVIEW_MOUNT_PATH.length + 1)).replace(
        /^\/+|\/+$/g,
        "",
      ),
    ).toLowerCase();
    if (!mountRelative) return null;
    for (const [virtualPath, absolutePath] of Object.entries(
      filePathIndexRef.current,
    )) {
      const candidate = toMountRelativePath(previewMountBasePath, absolutePath);
      if (!candidate) continue;
      const candidateLower = candidate.toLowerCase();
      if (
        candidateLower === mountRelative ||
        candidateLower === `${mountRelative}/index.html`
      ) {
        return virtualPath;
      }
    }
    return null;
  }, [filePathIndexRef, previewFrameRef, previewMountBasePath]);

  const applyPreviewDrawCreate = useCallback(
    async (
      parentPath: number[],
      tag: string,
      rawStyles: Record<string, string>,
    ) => {
      if (!selectedPreviewHtml || !Array.isArray(parentPath)) return;
      const normalizedParentPath = parentPath
        .map((segment) => Number(segment))
        .filter((segment) => Number.isFinite(segment))
        .map((segment) => Math.max(0, Math.trunc(segment)));
      if (normalizedParentPath.length !== parentPath.length) return;

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sanitizePreviewDocument = (doc: Document) => {
        doc.documentElement?.removeAttribute("data-nx-mounted-preview-bridge");
        doc.querySelectorAll<HTMLElement>("[contenteditable]").forEach((el) => {
          el.removeAttribute("contenteditable");
        });
        doc
          .querySelectorAll<HTMLElement>(
            ".__nx-preview-editing, .__nx-preview-selected, .__nx-preview-dirty",
          )
          .forEach((el) => {
            el.classList.remove("__nx-preview-editing");
            el.classList.remove("__nx-preview-selected");
            el.classList.remove("__nx-preview-dirty");
          });
        doc
          .querySelectorAll<HTMLElement>(
            "#__edit-highlight__,#__tag-badge__,#__inspect-tooltip__,.__nx-preview-runtime-helper,[data-preview-hover-outline],[data-preview-hover-badge],[data-preview-draw-draft],style[data-nx-local-drop]",
          )
          .forEach((el) => el.remove());
      };
      const readCurrentPreviewHtml = (): string => {
        const liveDocument =
          previewFrameRef.current?.contentDocument ??
          previewFrameRef.current?.contentWindow?.document ??
          null;
        if (liveDocument?.documentElement) {
          const liveSerialized = `<!DOCTYPE html>\n${liveDocument.documentElement.outerHTML}`;
          const liveParsed = new DOMParser().parseFromString(
            liveSerialized,
            "text/html",
          );
          sanitizePreviewDocument(liveParsed);
          return `<!DOCTYPE html>\n${liveParsed.documentElement.outerHTML}`;
        }
        return typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      };
      const sourceHtml = readCurrentPreviewHtml();
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      let effectiveParentPath = normalizedParentPath;
      let parsedParent =
        effectiveParentPath.length > 0
          ? readElementByPath(parsed.body, effectiveParentPath)
          : parsed.body;
      while (
        parsedParent instanceof HTMLElement &&
        parsedParent !== parsed.body &&
        VOID_HTML_TAGS.has(String(parsedParent.tagName || "").toLowerCase()) &&
        effectiveParentPath.length > 0
      ) {
        effectiveParentPath = effectiveParentPath.slice(0, -1);
        parsedParent =
          effectiveParentPath.length > 0
            ? readElementByPath(parsed.body, effectiveParentPath)
            : parsed.body;
      }
      if (
        !(parsedParent instanceof HTMLElement) &&
        !(parsedParent instanceof HTMLBodyElement)
      ) {
        return;
      }

      const drawTag = normalizePreviewDrawTag(tag);
      const normalizedStyles = {
        ...normalizePresentationStylePatch(
          Object.fromEntries(
            Object.entries(rawStyles || {}).filter(([key]) => Boolean(key)),
          ),
        ),
        zIndex:
          (rawStyles?.zIndex ?? rawStyles?.["z-index"]) ? undefined : "100",
      } as Record<string, string>;

      const applyStyleMap = (
        el: HTMLElement,
        styleMap: Record<string, string>,
      ) => {
        for (const [key, value] of Object.entries(styleMap)) {
          const cssKey = toCssPropertyName(key);
          const nextValue = String(value ?? "");
          if (!nextValue) {
            el.style.removeProperty(cssKey);
          } else {
            el.style.setProperty(cssKey, nextValue);
          }
        }
      };

      const buildDrawElement = (doc: Document): HTMLElement => {
        const element = doc.createElement(drawTag);
        applyStyleMap(element, normalizedStyles);
        if (drawTag === "img") {
          element.setAttribute("src", "https://picsum.photos/420/260");
          element.setAttribute("alt", "Image");
        } else if (
          drawTag === "p" ||
          drawTag === "span" ||
          drawTag === "button" ||
          drawTag === "h1" ||
          drawTag === "h2" ||
          drawTag === "h3"
        ) {
          element.textContent = "New Text";
        }
        return element;
      };

      const parsedNewElement = buildDrawElement(parsed);
      parsedParent.appendChild(parsedNewElement);
      const newIndex = Math.max(0, parsedParent.children.length - 1);
      const newPath = [...effectiveParentPath, newIndex];

      postPreviewPatchToFrame({
        type: "PREVIEW_INJECT_ELEMENT",
        parentPath: effectiveParentPath,
        tag: drawTag,
        styles: normalizedStyles,
        index: newIndex,
      });

      if (effectiveParentPath.length > 0) {
        const computedStyleStr = parsedParent.getAttribute("style") || "";
        if (
          !computedStyleStr.includes("position") ||
          computedStyleStr.includes("position: static") ||
          computedStyleStr.includes("position:static")
        ) {
          parsedParent.style.position = "relative";
        }
      }

      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
      });

      const optimisticInlineStyles = parseInlineStyleText(
        parsedNewElement.getAttribute("style") || "",
      );
      const isContainerTag = [
        "div",
        "section",
        "article",
        "aside",
        "main",
        "header",
        "footer",
        "nav",
      ].includes(drawTag);
      const nextElement: VirtualElement = {
        id: getStablePreviewElementId(newPath),
        type: drawTag,
        name: drawTag.toUpperCase(),
        content:
          drawTag === "img" ? undefined : isContainerTag ? "" : "New Text",
        ...(drawTag === "img" ? { src: "https://picsum.photos/420/260" } : {}),
        styles: { ...optimisticInlineStyles },
        children: [],
      };

      setPreviewSelectedPath(newPath);
      setPreviewSelectedElement(nextElement);
      setPreviewSelectedComputedStyles(null);
      setSelectedId(null);
      setIsCodePanelOpen(false);
      setIsRightPanelOpen(true);
    },
    [
      getStablePreviewElementId,
      loadFileContent,
      persistPreviewHtmlContent,
      postPreviewPatchToFrame,
      selectedPreviewHtml,
      filesRef,
      setPreviewSelectedPath,
      setPreviewSelectedElement,
      setPreviewSelectedComputedStyles,
      setSelectedId,
      setIsCodePanelOpen,
      setIsRightPanelOpen,
    ],
  );

  const applyPreviewDropCreate = useCallback(
    async (rawType: string, clientX: number, clientY: number) => {
      const dropType = String(rawType || "").trim();
      if (!dropType || !selectedPreviewHtml) return;
      const isMountedPreviewDrop = Boolean(selectedPreviewSrc);

      const idFor = createPresetIdFactory(dropType);
      const nextElement =
        buildPresetElementV2(dropType, idFor) ??
        buildStandardElement(dropType, idFor("element"));

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sanitizePreviewDocument = (doc: Document) => {
        doc.documentElement?.removeAttribute("data-nx-mounted-preview-bridge");
        doc.querySelectorAll<HTMLElement>("[contenteditable]").forEach((el) => {
          el.removeAttribute("contenteditable");
        });
        doc
          .querySelectorAll<HTMLElement>(
            ".__nx-preview-editing, .__nx-preview-selected, .__nx-preview-dirty",
          )
          .forEach((el) => {
            el.classList.remove("__nx-preview-editing");
            el.classList.remove("__nx-preview-selected");
            el.classList.remove("__nx-preview-dirty");
          });
        doc
          .querySelectorAll<HTMLElement>(
            "#__edit-highlight__,#__tag-badge__,#__inspect-tooltip__,.__nx-preview-runtime-helper,[data-preview-hover-outline],[data-preview-hover-badge],[data-preview-draw-draft],style[data-nx-local-drop]",
          )
          .forEach((el) => el.remove());
      };
      const readCurrentPreviewHtml = (): string => {
        const liveDocument =
          previewFrameRef.current?.contentDocument ??
          previewFrameRef.current?.contentWindow?.document ??
          null;
        if (liveDocument?.documentElement) {
          const liveSerialized = `<!DOCTYPE html>\n${liveDocument.documentElement.outerHTML}`;
          const liveParsed = new DOMParser().parseFromString(
            liveSerialized,
            "text/html",
          );
          sanitizePreviewDocument(liveParsed);
          return `<!DOCTYPE html>\n${liveParsed.documentElement.outerHTML}`;
        }
        return typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      };
      const sourceHtml = readCurrentPreviewHtml();
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const parsedNode = materializeVirtualElement(parsed, nextElement);
      if (!(parsedNode instanceof HTMLElement)) return;
      const requiresAddToolAssets = ADD_TOOL_COMPONENT_PRESETS.has(dropType);
      let latestLocalCssContent: string | null = null;
      const htmlDirVirtual = selectedPreviewHtml.includes("/")
        ? selectedPreviewHtml.slice(0, selectedPreviewHtml.lastIndexOf("/"))
        : "";
      const cssLocalVirtualPath = normalizeProjectRelative(
        htmlDirVirtual ? `${htmlDirVirtual}/css/local.css` : "css/local.css",
      );
      const jsLocalVirtualPath = normalizeProjectRelative(
        htmlDirVirtual ? `${htmlDirVirtual}/js/local.js` : "js/local.js",
      );
      const ensureHeadElement = (doc: Document): HTMLHeadElement => {
        if (doc.head) return doc.head;
        const head = doc.createElement("head");
        if (doc.documentElement) {
          doc.documentElement.insertBefore(head, doc.body || null);
        } else {
          const html = doc.createElement("html");
          html.appendChild(head);
          if (doc.body) {
            html.appendChild(doc.body);
          }
          doc.appendChild(html);
        }
        return head;
      };
      const ensureAssetLinkInHead = (
        doc: Document,
        htmlPath: string,
        assetVirtualPath: string,
        tag: "link" | "script",
      ) => {
        const hasAssetRef = Array.from(
          doc.querySelectorAll<HTMLElement>(
            tag === "link" ? 'link[rel="stylesheet"][href]' : "script[src]",
          ),
        ).some((node) => {
          const refValue =
            tag === "link"
              ? (node.getAttribute("href") ?? "")
              : (node.getAttribute("src") ?? "");
          const resolved = resolveProjectRelativePath(htmlPath, refValue);
          return (
            normalizeProjectRelative(resolved || "") ===
            normalizeProjectRelative(assetVirtualPath)
          );
        });
        if (hasAssetRef) return;
        const head = ensureHeadElement(doc);
        const refPath = relativePathBetweenVirtualFiles(
          htmlPath,
          assetVirtualPath,
        );
        if (!refPath) return;
        if (tag === "link") {
          const link = doc.createElement("link");
          link.setAttribute("rel", "stylesheet");
          link.setAttribute("href", refPath);
          head.appendChild(link);
        } else {
          const script = doc.createElement("script");
          script.setAttribute("src", refPath);
          head.appendChild(script);
        }
      };
      const mergeMarkerBlock = (
        source: string,
        markerStart: string,
        markerEnd: string,
        blockContent: string,
      ): string => {
        const safeSource = source || "";
        const block = blockContent
          ? `${markerStart}\n${blockContent}\n${markerEnd}`
          : "";
        if (
          safeSource.includes(markerStart) &&
          safeSource.includes(markerEnd)
        ) {
          const start = safeSource.indexOf(markerStart);
          const endStart = safeSource.indexOf(markerEnd, start);
          const end = endStart >= 0 ? endStart + markerEnd.length : start;
          const prefix = safeSource.slice(0, start).trimEnd();
          const suffix = safeSource.slice(end).trimStart();
          return [prefix, block, suffix].filter(Boolean).join("\n\n");
        }
        if (!block) return safeSource;
        const needsGap = safeSource.length > 0 && !safeSource.endsWith("\n");
        return `${safeSource}${needsGap ? "\n\n" : ""}${block}\n`;
      };
      const absoluteHtmlPath = filePathIndexRef.current[selectedPreviewHtml];
      const absoluteHtmlDir = absoluteHtmlPath
        ? getParentPath(absoluteHtmlPath)
        : null;
      const upsertLocalAsset = async (
        assetVirtualPath: string,
        relativePath: string,
        nextContentBuilder: (current: string) => string,
        defaultContent = "",
      ): Promise<string> => {
        const absoluteAssetPath = absoluteHtmlDir
          ? normalizePath(joinPath(absoluteHtmlDir, relativePath))
          : null;
        if (absoluteAssetPath) {
          const absoluteParent = getParentPath(absoluteAssetPath);
          if (absoluteParent) {
            await ensureDirectoryTreeStable(absoluteParent);
          }
          filePathIndexRef.current[assetVirtualPath] = absoluteAssetPath;
        }
        let existingContent =
          typeof filesRef.current[assetVirtualPath]?.content === "string"
            ? (filesRef.current[assetVirtualPath].content as string)
            : "";
        if (!existingContent && absoluteAssetPath) {
          try {
            existingContent = await (Neutralino as any).filesystem.readFile(
              absoluteAssetPath,
            );
          } catch {
            existingContent = defaultContent;
          }
        }
        if (!existingContent) existingContent = defaultContent;
        const nextContent = nextContentBuilder(existingContent);
        textFileCacheRef.current[assetVirtualPath] = nextContent;
        const name = assetVirtualPath.includes("/")
          ? assetVirtualPath.slice(assetVirtualPath.lastIndexOf("/") + 1)
          : assetVirtualPath;
        const nextFile: ProjectFile = filesRef.current[assetVirtualPath]
          ? {
              ...filesRef.current[assetVirtualPath],
              content: nextContent,
              type: inferFileType(name),
            }
          : {
              path: assetVirtualPath,
              name,
              type: inferFileType(name),
              content: nextContent,
            };
        filesRef.current = {
          ...filesRef.current,
          [assetVirtualPath]: nextFile,
        };
        setFiles((prev) => ({
          ...prev,
          [assetVirtualPath]: nextFile,
        }));
        pendingPreviewWritesRef.current[assetVirtualPath] = nextContent;
        return nextContent;
      };

      ensureAssetLinkInHead(
        parsed,
        selectedPreviewHtml,
        cssLocalVirtualPath,
        "link",
      );
      ensureAssetLinkInHead(
        parsed,
        selectedPreviewHtml,
        jsLocalVirtualPath,
        "script",
      );

      if (requiresAddToolAssets) {
        const removeLegacySharedAssetRefs = (doc: Document, htmlPath: string) => {
          const legacyPaths = new Set([
            "shared/css/nx-add-tool-components.css",
            "shared/js/nx-add-tool-components.js",
            "__nx_add_tool.css",
            "__nx_add_tool.js",
          ]);
          const nodes = Array.from(
            doc.querySelectorAll<HTMLElement>(
              'link[rel="stylesheet"][href],script[src]',
            ),
          );
          for (const node of nodes) {
            const refValue =
              node.tagName.toLowerCase() === "link"
                ? (node.getAttribute("href") ?? "")
                : (node.getAttribute("src") ?? "");
            const resolved = normalizeProjectRelative(
              resolveProjectRelativePath(htmlPath, refValue) || "",
            );
            if (legacyPaths.has(resolved)) {
              node.parentElement?.removeChild(node);
            }
          }
          Array.from(
            doc.querySelectorAll<HTMLElement>(
              'style[data-nx-add-tool="css"],script[data-nx-add-tool="js"]',
            ),
          ).forEach((node) => node.parentElement?.removeChild(node));
        };
        removeLegacySharedAssetRefs(parsed, selectedPreviewHtml);
        const assetDefs = [
          {
            path: cssLocalVirtualPath,
            relativePath: "css/local.css",
            markerStart: ADD_TOOL_CSS_MARKER_START,
            markerEnd: ADD_TOOL_CSS_MARKER_END,
            block: ADD_TOOL_COMPONENTS_CSS_CONTENT,
          },
          {
            path: jsLocalVirtualPath,
            relativePath: "js/local.js",
            markerStart: ADD_TOOL_JS_MARKER_START,
            markerEnd: ADD_TOOL_JS_MARKER_END,
            block: ADD_TOOL_COMPONENTS_JS_CONTENT,
          },
        ] as const;
        for (const asset of assetDefs) {
          try {
            const nextAssetContent = await upsertLocalAsset(
              asset.path,
              asset.relativePath,
              (existingContent) =>
                mergeMarkerBlock(
                  existingContent,
                  asset.markerStart,
                  asset.markerEnd,
                  asset.block,
                ),
            );
            if (asset.path === cssLocalVirtualPath) {
              latestLocalCssContent = nextAssetContent;
            }
          } catch (error) {
            console.warn("Failed writing slide local asset file:", error);
          }
        }
      }

      const pickDropHost = (doc: Document): HTMLElement => {
        const candidates = [
          ".maincontainer",
          ".mainContainer",
          "#maincontainer",
          "#mainContainer",
          "#contentFrame",
          ".contentFrame",
          ".mainContent",
          "#container",
        ];
        for (const selector of candidates) {
          const found = doc.querySelector(selector);
          if (found instanceof HTMLElement) return found;
        }
        return doc.body;
      };
      const computePathFromBody = (element: Element | null): number[] => {
        if (!element) return [];
        const path: number[] = [];
        let cursor: Element | null = element;
        while (cursor && cursor.parentElement) {
          const parentEl: HTMLElement = cursor.parentElement;
          const index = Array.from(parentEl.children).indexOf(cursor);
          if (index < 0) break;
          path.unshift(index);
          if (parentEl === element.ownerDocument.body) break;
          cursor = parentEl;
        }
        return path;
      };
      const appendNodeWithSpacing = (host: HTMLElement, node: HTMLElement) => {
        const doc = host.ownerDocument;
        let depth = 1;
        let cursor: HTMLElement | null = host;
        while (cursor && cursor !== doc.body) {
          depth += 1;
          cursor = cursor.parentElement;
        }
        const childIndent = `\n${"  ".repeat(depth)}`;
        const closingIndent = `\n${"  ".repeat(Math.max(0, depth - 1))}`;
        const lastChild = host.lastChild;
        if (!lastChild) {
          host.appendChild(doc.createTextNode(childIndent));
          host.appendChild(node);
          host.appendChild(doc.createTextNode(closingIndent));
          return;
        }
        if (
          lastChild.nodeType === Node.TEXT_NODE &&
          (lastChild.textContent || "").trim().length === 0
        ) {
          lastChild.textContent = childIndent;
        } else {
          host.appendChild(doc.createTextNode(childIndent));
        }
        host.appendChild(node);
        host.appendChild(doc.createTextNode(closingIndent));
      };
      const insertNodeAfterWithSpacing = (
        target: HTMLElement,
        node: HTMLElement,
      ) => {
        const doc = target.ownerDocument;
        const parent = target.parentElement;
        if (!parent) {
          appendNodeWithSpacing(target, node);
          return;
        }
        let depth = 1;
        let cursor: HTMLElement | null = parent;
        while (cursor && cursor !== doc.body) {
          depth += 1;
          cursor = cursor.parentElement;
        }
        const childIndent = `\n${"  ".repeat(depth)}`;
        const nextSibling = target.nextSibling;
        if (nextSibling?.nodeType === Node.TEXT_NODE) {
          (nextSibling as Text).textContent = childIndent;
        } else {
          parent.insertBefore(doc.createTextNode(childIndent), nextSibling);
        }
        parent.insertBefore(node, nextSibling);
      };
      const canReceiveChildren = (element: HTMLElement | null): boolean => {
        if (!element) return false;
        return !VOID_HTML_TAGS.has(String(element.tagName || "").toLowerCase());
      };
      const resolveDropPlacement = (
        doc: Document,
        mouseClientX: number,
        mouseClientY: number,
      ): { host: HTMLElement; insertAfter: HTMLElement | null } => {
        const frameRect = previewFrameRef.current?.getBoundingClientRect();
        const defaultHost = pickDropHost(doc);
        if (!frameRect) {
          return { host: defaultHost, insertAfter: null };
        }
        const viewportWidth = Math.max(
          1,
          previewFrameRef.current?.clientWidth || doc.documentElement.clientWidth || 1,
        );
        const viewportHeight = Math.max(
          1,
          previewFrameRef.current?.clientHeight || doc.documentElement.clientHeight || 1,
        );
        const frameX = mouseClientX - frameRect.left;
        const frameY = mouseClientY - frameRect.top;
        const innerClientX = frameX * (viewportWidth / Math.max(frameRect.width, 1));
        const innerClientY =
          frameY * (viewportHeight / Math.max(frameRect.height, 1));
        let rawTarget = doc.elementFromPoint(innerClientX, innerClientY);
        if (rawTarget instanceof HTMLElement) {
          rawTarget = rawTarget.closest(
            ":not(#__edit-highlight__):not(#__tag-badge__):not(#__inspect-tooltip__):not([data-preview-hover-outline]):not([data-preview-hover-badge]):not([data-preview-draw-draft])",
          );
        }
        const target =
          rawTarget instanceof HTMLElement
            ? rawTarget.closest(
                "[data-v-id], #maincontainer, .maincontainer, #mainContainer, .mainContainer, #contentFrame, .contentFrame, .mainContent, #container, body",
              ) || rawTarget
            : null;
        if (!(target instanceof HTMLElement)) {
          return { host: defaultHost, insertAfter: null };
        }
        if (target === doc.body || target === defaultHost) {
          return { host: defaultHost, insertAfter: null };
        }
        if (canReceiveChildren(target)) {
          return { host: target, insertAfter: null };
        }
        if (target.parentElement instanceof HTMLElement) {
          return { host: target.parentElement, insertAfter: target };
        }
        return { host: defaultHost, insertAfter: null };
      };
      const computePathFromHost = (host: HTMLElement): number[] => {
        if (host === host.ownerDocument.body) return [];
        return computePathFromBody(host);
      };
      const styleObjectToCssBlock = (
        selector: string,
        styles: React.CSSProperties,
      ) => {
        const styleRules = Object.entries(styles)
          .filter(([, value]) => value !== undefined && value !== null && value !== "")
          .map(([key, value]) => `  ${toCssPropertyName(key)}: ${String(value)};`);
        if (styleRules.length === 0) return "";
        return `${selector} {\n${styleRules.join("\n")}\n}`;
      };

      const dropClassName = `nx-${String(nextElement.id || dropType)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`;
      const currentClassTokens = new Set(
        String(parsedNode.getAttribute("class") || "")
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean),
      );
      currentClassTokens.add(dropClassName);
      parsedNode.setAttribute("class", Array.from(currentClassTokens).join(" "));
      parsedNode.removeAttribute("style");

      const liveDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      const parsedPlacement = resolveDropPlacement(parsed, clientX, clientY);
      if (parsedPlacement.insertAfter) {
        insertNodeAfterWithSpacing(parsedPlacement.insertAfter, parsedNode);
      } else {
        appendNodeWithSpacing(parsedPlacement.host, parsedNode);
      }
      const newPath = computePathFromBody(parsedNode);

      const cssBlock = styleObjectToCssBlock(
        `#${nextElement.id}`,
        nextElement.styles || {},
      );
      if (cssBlock) {
        try {
          latestLocalCssContent = await upsertLocalAsset(
            cssLocalVirtualPath,
            "css/local.css",
            (existingContent) =>
              mergeMarkerBlock(
                existingContent,
                `/* nocodex-local-drop:${nextElement.id}:start */`,
                `/* nocodex-local-drop:${nextElement.id}:end */`,
                cssBlock,
              ),
            "",
          );
        } catch (error) {
          console.warn("Failed writing dropped element CSS:", error);
        }
      }

      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;

      let appliedLive = false;
      if (liveDocument?.body) {
        const liveNode = materializeVirtualElement(liveDocument, nextElement);
        if (liveNode instanceof HTMLElement) {
          liveNode.className = Array.from(currentClassTokens).join(" ");
          liveNode.removeAttribute("style");
          const livePlacement = resolveDropPlacement(liveDocument, clientX, clientY);
          if (livePlacement.insertAfter) {
            insertNodeAfterWithSpacing(livePlacement.insertAfter, liveNode);
          } else {
            appendNodeWithSpacing(livePlacement.host, liveNode);
          }
          appliedLive = true;
        }
      }
      if (!appliedLive && isMountedPreviewDrop && parsed.body) {
        postPreviewPatchToFrame({
          type: "PREVIEW_APPLY_HTML",
          html: parsed.body.innerHTML,
        });
        appliedLive = true;
      }
      if (isMountedPreviewDrop && latestLocalCssContent) {
        postPreviewPatchToFrame({
          type: "PREVIEW_SET_RUNTIME_CSS",
          styleId: "__nx-preview-runtime-local-css",
          cssText: rewriteInlineAssetRefs(
            latestLocalCssContent,
            cssLocalVirtualPath,
            filesRef.current,
          ),
        });
      }
      if (isMountedPreviewDrop && requiresAddToolAssets) {
        postPreviewPatchToFrame({
          type: "PREVIEW_EVAL_JS",
          jsText: ADD_TOOL_COMPONENTS_JS_CONTENT,
        });
      }

      const mountedPathAtDrop = isMountedPreviewDrop
        ? resolveMountedPreviewPathFromFrame()
        : null;
      if (mountedPathAtDrop) {
        setPreviewNavigationFile((prev) =>
          prev === mountedPathAtDrop ? prev : mountedPathAtDrop,
        );
      }
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
        saveNow: false,
        skipAutoSave: isMountedPreviewDrop,
        elementPath: newPath,
      });

      setPreviewSelectedPath(newPath);
      setPreviewSelectedElement({
        ...nextElement,
        className: Array.from(currentClassTokens).join(" "),
        styles: {
          ...nextElement.styles,
        },
      });
      setPreviewSelectedComputedStyles(null);
      setPreviewSelectedMatchedCssRules([]);
      setSelectedId(null);
      setIsCodePanelOpen(false);
      setIsRightPanelOpen(true);
      setSidebarToolMode("edit");
      setPreviewMode("edit");
      setInteractionMode("preview");
    },
    [
      ensureDirectoryTreeStable,
      filePathIndexRef,
      filesRef,
      loadFileContent,
      pendingPreviewWritesRef,
      persistPreviewHtmlContent,
      postPreviewPatchToFrame,
      previewFrameRef,
      previewMountBasePath,
      resolveMountedPreviewPathFromFrame,
      selectedPreviewHtml,
      selectedPreviewSrc,
      setFiles,
      setInteractionMode,
      setIsCodePanelOpen,
      setIsRightPanelOpen,
      setPreviewMode,
      setPreviewNavigationFile,
      setPreviewSelectedComputedStyles,
      setPreviewSelectedElement,
      setPreviewSelectedMatchedCssRules,
      setPreviewSelectedPath,
      setSelectedId,
      setSidebarToolMode,
      textFileCacheRef,
    ],
  );

  const handlePreviewStageDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!selectedPreviewHtml) return;
      const payload = (
        getToolboxDragPayload(event.dataTransfer).trim() ||
        toolboxDragTypeRef.current
      ).trim();
      if (!payload) return;
      event.preventDefault();
      setIsToolboxDragging(false);
      toolboxDragTypeRef.current = "";
      void applyPreviewDropCreate(payload, event.clientX, event.clientY);
    },
    [
      applyPreviewDropCreate,
      selectedPreviewHtml,
      setIsToolboxDragging,
      toolboxDragTypeRef,
    ],
  );

  return {
    applyPreviewDrawCreate,
    applyPreviewDropCreate,
    handlePreviewStageDrop,
  };
};
