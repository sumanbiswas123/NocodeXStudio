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
  readElementByPath,
  relativePathBetweenVirtualFiles,
  resolveProjectRelativePath,
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
  selectedPreviewHtml,
  selectedPreviewSrc,
  setFiles,
  setInteractionMode,
  setIsCodePanelOpen,
  setIsRightPanelOpen,
  setIsToolboxDragging,
  setPreviewMode,
  setPreviewSelectedComputedStyles,
  setPreviewSelectedElement,
  setPreviewSelectedMatchedCssRules,
  setPreviewSelectedPath,
  setSelectedId,
  setSidebarToolMode,
  textFileCacheRef,
  toolboxDragTypeRef,
}: UsePreviewCreationOptions) => {
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
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
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
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const parsedNode = materializeVirtualElement(parsed, nextElement);
      if (!(parsedNode instanceof HTMLElement)) return;
      const requiresAddToolAssets = ADD_TOOL_COMPONENT_PRESETS.has(dropType);
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
        if (absoluteAssetPath) {
          await (Neutralino as any).filesystem.writeFile(
            absoluteAssetPath,
            nextContent,
          );
          delete pendingPreviewWritesRef.current[assetVirtualPath];
        } else {
          pendingPreviewWritesRef.current[assetVirtualPath] = nextContent;
        }
        return nextContent;
      };

      ensureAssetLinkInHead(parsed, selectedPreviewHtml, cssLocalVirtualPath, "link");
      ensureAssetLinkInHead(parsed, selectedPreviewHtml, jsLocalVirtualPath, "script");

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
            await upsertLocalAsset(
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
      const ensurePositionableHost = (host: HTMLElement) => {
        const computed = host.ownerDocument.defaultView?.getComputedStyle(host);
        if (!computed) return;
        if (!computed.position || computed.position === "static") {
          host.style.setProperty("position", "relative");
        }
      };

      const liveDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      const liveWindow = liveDocument?.defaultView ?? null;
      const frameRect = previewFrameRef.current?.getBoundingClientRect();
      const parsedDropHost = pickDropHost(parsed);
      const liveDropHost = liveDocument ? pickDropHost(liveDocument) : null;
      ensurePositionableHost(parsedDropHost);
      if (liveDropHost) {
        ensurePositionableHost(liveDropHost);
      }
      const getDocumentOffset = (
        element: HTMLElement,
      ): { left: number; top: number } => {
        let left = 0;
        let top = 0;
        let cursor: HTMLElement | null = element;
        while (cursor) {
          left += cursor.offsetLeft || 0;
          top += cursor.offsetTop || 0;
          cursor = cursor.offsetParent as HTMLElement | null;
        }
        return { left, top };
      };

      let nextLeft = 0;
      let nextTop = 0;
      let normalizedDropX: number | null = null;
      let normalizedDropY: number | null = null;
      if (frameRect && liveDropHost) {
        const liveViewportWidth = Math.max(
          1,
          previewFrameRef.current?.clientWidth ||
            liveDocument?.documentElement?.clientWidth ||
            0,
        );
        const liveViewportHeight = Math.max(
          1,
          previewFrameRef.current?.clientHeight ||
            liveDocument?.documentElement?.clientHeight ||
            0,
        );
        const scaleX =
          liveViewportWidth > 0 ? frameRect.width / liveViewportWidth : 1;
        const scaleY =
          liveViewportHeight > 0 ? frameRect.height / liveViewportHeight : 1;
        normalizedDropX =
          frameRect.width > 0
            ? Math.max(0, Math.min(1, (clientX - frameRect.left) / frameRect.width))
            : null;
        normalizedDropY =
          frameRect.height > 0
            ? Math.max(0, Math.min(1, (clientY - frameRect.top) / frameRect.height))
            : null;
        const innerClientX = (clientX - frameRect.left) / (scaleX || 1);
        const innerClientY = (clientY - frameRect.top) / (scaleY || 1);
        const innerDocX = innerClientX + (liveWindow?.scrollX || 0);
        const innerDocY = innerClientY + (liveWindow?.scrollY || 0);
        const hostOffset = getDocumentOffset(liveDropHost);
        nextLeft = Math.max(0, Math.round(innerDocX - hostOffset.left));
        nextTop = Math.max(0, Math.round(innerDocY - hostOffset.top));
      }
      const hostWidth = Math.max(
        0,
        liveDropHost?.scrollWidth || liveDropHost?.clientWidth || parsedDropHost.clientWidth || 0,
      );
      const hostHeight = Math.max(
        0,
        liveDropHost?.scrollHeight || liveDropHost?.clientHeight || parsedDropHost.clientHeight || 0,
      );
      if (hostWidth > 0) {
        if (normalizedDropX !== null && nextLeft === 0 && normalizedDropX > 0.04) {
          nextLeft = Math.round(normalizedDropX * hostWidth);
        }
        nextLeft = Math.max(0, Math.min(nextLeft, Math.max(0, hostWidth - 24)));
      }
      if (hostHeight > 0) {
        if (normalizedDropY !== null && nextTop === 0 && normalizedDropY > 0.04) {
          nextTop = Math.round(normalizedDropY * hostHeight);
        }
        nextTop = Math.max(0, Math.min(nextTop, Math.max(0, hostHeight - 24)));
      }
      const instanceClassName = `nx-local-drop-${String(
        nextElement.id || `drop-${Date.now()}`,
      )
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")}`;
      const nextLeftValue = normalizePresentationCssValue("left", `${nextLeft}px`);
      const nextTopValue = normalizePresentationCssValue("top", `${nextTop}px`);
      const styleRules: string[] = [
        "position: absolute",
        `left: ${nextLeftValue}`,
        `top: ${nextTopValue}`,
      ];
      for (const [key, value] of Object.entries(nextElement.styles || {})) {
        if (value === undefined || value === null || value === "") continue;
        styleRules.push(`${toCssPropertyName(key)}: ${String(value)}`);
      }
      if (requiresAddToolAssets) {
        styleRules.push("max-width: 100%");
        styleRules.push("box-sizing: border-box");
      }
      const dropMarkerStart = `/* nocodex-local-drop:${instanceClassName}:start */`;
      const dropMarkerEnd = `/* nocodex-local-drop:${instanceClassName}:end */`;
      const dropCssBlock = `.${instanceClassName} {\n  ${styleRules.join(";\n  ")};\n}`;
      try {
        await upsertLocalAsset(
          cssLocalVirtualPath,
          "css/local.css",
          (existingContent) =>
            mergeMarkerBlock(
              existingContent,
              dropMarkerStart,
              dropMarkerEnd,
              dropCssBlock,
            ),
        );
        await upsertLocalAsset(
          jsLocalVirtualPath,
          "js/local.js",
          (existingContent) => existingContent || "// local page interactions\n",
          "// local page interactions\n",
        );
      } catch (error) {
        console.warn("Failed wiring local drop assets:", error);
      }
      const currentClassTokens = new Set(
        String(parsedNode.getAttribute("class") || "")
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean),
      );
      currentClassTokens.add(instanceClassName);
      parsedNode.setAttribute("class", Array.from(currentClassTokens).join(" "));
      parsedNode.removeAttribute("style");
      parsedDropHost.appendChild(parsedNode);
      const newPath = computePathFromBody(parsedNode);
      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;

      let appliedLive = false;
      if (liveDocument?.body) {
        const liveHead = liveDocument.head || liveDocument.documentElement;
        if (liveHead) {
          let runtimeStyle = liveHead.querySelector<HTMLStyleElement>(
            `style[data-nx-local-drop="${instanceClassName}"]`,
          );
          if (!runtimeStyle) {
            runtimeStyle = liveDocument.createElement("style");
            runtimeStyle.setAttribute("data-nx-local-drop", instanceClassName);
            liveHead.appendChild(runtimeStyle);
          }
          runtimeStyle.textContent = dropCssBlock;
        }
        const liveNode = materializeVirtualElement(liveDocument, nextElement);
        if (liveNode instanceof HTMLElement) {
          const liveDropHostNext = pickDropHost(liveDocument);
          ensurePositionableHost(liveDropHostNext);
          liveNode.classList.add(instanceClassName);
          liveNode.style.setProperty("position", "absolute");
          liveNode.style.setProperty("left", nextLeftValue);
          liveNode.style.setProperty("top", nextTopValue);
          if (requiresAddToolAssets) {
            liveNode.style.setProperty("max-width", "100%");
            liveNode.style.setProperty("box-sizing", "border-box");
          }
          liveDropHostNext.appendChild(liveNode);
          appliedLive = true;
        }
      }

      const needsAssetReload = requiresAddToolAssets && isMountedPreviewDrop;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc:
          needsAssetReload || (!appliedLive && !isMountedPreviewDrop),
        saveNow: isMountedPreviewDrop,
        skipAutoSave: !isMountedPreviewDrop,
        elementPath: newPath,
      });
      if (isMountedPreviewDrop && parsed.body && !needsAssetReload) {
        postPreviewPatchToFrame({
          type: "PREVIEW_APPLY_HTML",
          html: parsed.body.innerHTML,
        });
      }

      setPreviewSelectedPath(newPath);
      setPreviewSelectedElement({
        ...nextElement,
        className: instanceClassName,
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
      selectedPreviewHtml,
      selectedPreviewSrc,
      setFiles,
      setInteractionMode,
      setIsCodePanelOpen,
      setIsRightPanelOpen,
      setPreviewMode,
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
