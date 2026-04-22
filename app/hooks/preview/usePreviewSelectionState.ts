import { useCallback, useEffect, useMemo } from "react";
import type React from "react";
import type { FileMap, VirtualElement } from "../../../types";
import {
  buildPreviewLayerTreeFromElement,
  collectPathIdsToElement,
  extractComputedStylesFromElement,
  extractCustomAttributesFromElement,
  extractTextWithBreaks,
  findElementById,
  fromPreviewLayerId,
  normalizeEditorMultilineText,
  parseInlineStyleText,
  pickDefaultHtmlFile,
  PREVIEW_MOUNT_PATH,
  readElementByPath,
  toMountRelativePath,
  toPreviewLayerId,
} from "../../helpers/appHelpers";
import { collectMatchedCssRulesFromElement } from "../../helpers/previewCssHelpers";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";

type UsePreviewSelectionStateOptions = {
  activeFile: string | null;
  files: FileMap;
  getStablePreviewElementId: (
    path: number[] | null | undefined,
    explicitId?: string | null,
    fallbackId?: string | null,
  ) => string;
  handleSelect: (id: string) => void;
  interactionMode: InteractionMode;
  isPreviewMountReady: boolean;
  previewFrameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  previewMountBasePath: string | null;
  previewRefreshNonce: number;
  previewNavigationFile: string | null;
  previewSelectedPath: number[] | null;
  previewSelectedElement: VirtualElement | null;
  previewSyncedFile: string | null;
  projectPath: string | null;
  root: VirtualElement;
  selectedId: string | null;
  selectedPreviewDoc: string;
  selectedPreviewHtmlRef: React.MutableRefObject<string | null>;
  selectedPreviewPathSetter: React.Dispatch<
    React.SetStateAction<number[] | null>
  >;
  selectedPreviewElementSetter: React.Dispatch<
    React.SetStateAction<VirtualElement | null>
  >;
  selectedPreviewComputedStylesSetter: React.Dispatch<
    React.SetStateAction<React.CSSProperties | null>
  >;
  selectedPreviewMatchedCssRulesSetter: React.Dispatch<
    React.SetStateAction<ReturnType<typeof collectMatchedCssRulesFromElement>>
  >;
  setIsCodePanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  textFileCacheRef: React.MutableRefObject<Record<string, string>>;
  filePathIndexRef: React.MutableRefObject<Record<string, string>>;
};

type UsePreviewSelectionStateResult = {
  handleSidebarSelectElement: (id: string) => void;
  inspectorElement: VirtualElement | null;
  previewLayerSelectedId: string | null;
  previewLayersRoot: VirtualElement;
  selectPreviewElementAtPath: (path: number[]) => void;
  selectedElement: VirtualElement | null;
  selectedMountedPreviewHtml: string | null;
  selectedPathIds: Set<string> | null;
  selectedPreviewHtml: string | null;
  selectedPreviewSrc: string | null;
};

export const usePreviewSelectionState = ({
  activeFile,
  files,
  getStablePreviewElementId,
  handleSelect,
  interactionMode,
  isPreviewMountReady,
  previewFrameRef,
  previewMountBasePath,
  previewRefreshNonce,
  previewSelectedPath,
  previewSelectedElement,
  previewNavigationFile,
  previewSyncedFile,
  projectPath,
  root,
  selectedId,
  selectedPreviewDoc,
  selectedPreviewHtmlRef,
  selectedPreviewPathSetter,
  selectedPreviewElementSetter,
  selectedPreviewComputedStylesSetter,
  selectedPreviewMatchedCssRulesSetter,
  setIsCodePanelOpen,
  setIsRightPanelOpen,
  setSelectedId,
  textFileCacheRef,
  filePathIndexRef,
}: UsePreviewSelectionStateOptions): UsePreviewSelectionStateResult => {
  const selectedElement = useMemo(
    () => (selectedId ? findElementById(root, selectedId) : null),
    [root, selectedId],
  );

  const selectedPathIds = useMemo(
    () => collectPathIdsToElement(root, selectedId),
    [root, selectedId],
  );

  const previewLayerSelectedId = useMemo(() => {
    if (
      interactionMode !== "preview" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return null;
    }
    return toPreviewLayerId(previewSelectedPath);
  }, [interactionMode, previewSelectedPath]);

  const previewLayersRoot = useMemo<VirtualElement>(() => {
    if (interactionMode !== "preview") return root;
    const emptyPreviewRoot: VirtualElement = {
      id: "preview-live-root",
      type: "body",
      name: "Body",
      content: "",
      html: "",
      styles: {},
      children: [],
    };
    const liveDocument =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    const liveBody = liveDocument?.body ?? null;
    if (liveBody) {
      return {
        id: "preview-live-root",
        type: "body",
        name: "Body",
        content: "",
        html: liveBody.innerHTML || "",
        styles: {},
        children: Array.from(liveBody.children).map((child, index) =>
          buildPreviewLayerTreeFromElement(child, [index]),
        ),
      };
    }
    const activeHtmlPath = selectedPreviewHtmlRef.current;
    const activeHtmlFile =
      activeHtmlPath && files[activeHtmlPath] ? files[activeHtmlPath] : null;
    const activeHtmlContent =
      activeHtmlFile && typeof activeHtmlFile.content === "string"
        ? activeHtmlFile.content
        : "";
    const fallbackHtml =
      activeHtmlPath &&
      typeof textFileCacheRef.current[activeHtmlPath] === "string"
        ? textFileCacheRef.current[activeHtmlPath]
        : "";
    const sourceHtml =
      activeHtmlContent && activeHtmlContent.trim().length > 0
        ? activeHtmlContent
        : fallbackHtml && fallbackHtml.trim().length > 0
          ? fallbackHtml
          : selectedPreviewDoc;
    if (!sourceHtml || sourceHtml.trim().length === 0) return emptyPreviewRoot;
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const body = parsed.body;
      return {
        id: "preview-live-root",
        type: "body",
        name: "Body",
        content: "",
        html: body?.innerHTML || "",
        styles: {},
        children: body
          ? Array.from(body.children).map((child, index) =>
              buildPreviewLayerTreeFromElement(child, [index]),
            )
          : [],
      };
    } catch {
      return emptyPreviewRoot;
    }
  }, [files, interactionMode, previewFrameRef, previewRefreshNonce, root, selectedPreviewDoc, selectedPreviewHtmlRef, textFileCacheRef]);

  const selectPreviewElementAtPath = useCallback(
    (path: number[]) => {
      if (interactionMode !== "preview" || !Array.isArray(path) || path.length === 0) {
        return;
      }
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      const target = readElementByPath(frameDocument.body, path);
      if (!target) return;
      Array.from(
        frameDocument.querySelectorAll<HTMLElement>(".__nx-preview-selected"),
      ).forEach((el) => el.classList.remove("__nx-preview-selected"));
      target.classList.add("__nx-preview-selected");
      const inlineStyles = parseInlineStyleText(
        target.getAttribute("style") || "",
      );
      const computedStyles = extractComputedStylesFromElement(target);
      const matchedCssRules = collectMatchedCssRulesFromElement(target);
      const nextElement: VirtualElement = {
        id: getStablePreviewElementId(path, target.getAttribute("id")),
        type: String(target.tagName || "div").toLowerCase(),
        name: String(target.tagName || "div").toUpperCase(),
        content: normalizeEditorMultilineText(extractTextWithBreaks(target)),
        html: target instanceof HTMLElement ? target.innerHTML || "" : "",
        ...(target.getAttribute("src")
          ? { src: target.getAttribute("src") || "" }
          : {}),
        ...(target.getAttribute("href")
          ? { href: target.getAttribute("href") || "" }
          : {}),
        ...(target.getAttribute("class")
          ? { className: target.getAttribute("class") || "" }
          : {}),
        ...(extractCustomAttributesFromElement(target)
          ? { attributes: extractCustomAttributesFromElement(target) || {} }
          : {}),
        styles: inlineStyles,
        children: [],
      };
      selectedPreviewPathSetter(path);
      selectedPreviewElementSetter(nextElement);
      selectedPreviewComputedStylesSetter(computedStyles);
      selectedPreviewMatchedCssRulesSetter(matchedCssRules);
      setSelectedId(null);
      setIsCodePanelOpen(false);
      setIsRightPanelOpen(true);
    },
    [
      getStablePreviewElementId,
      interactionMode,
      previewFrameRef,
      selectedPreviewComputedStylesSetter,
      selectedPreviewElementSetter,
      selectedPreviewMatchedCssRulesSetter,
      selectedPreviewPathSetter,
      setIsCodePanelOpen,
      setIsRightPanelOpen,
      setSelectedId,
    ],
  );

  const handleSidebarSelectElement = useCallback(
    (id: string) => {
      const previewPath = fromPreviewLayerId(id);
      if (previewPath) {
        selectPreviewElementAtPath(previewPath);
        return;
      }
      handleSelect(id);
    },
    [handleSelect, selectPreviewElementAtPath],
  );

  useEffect(() => {
    if (
      interactionMode !== "preview" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return;
    }

    const frameDocument =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    if (!frameDocument?.body) return;

    const syncSelection = () => {
      selectPreviewElementAtPath(previewSelectedPath);
    };

    syncSelection();
    const immediateTimeout = window.setTimeout(syncSelection, 0);
    const settledTimeout = window.setTimeout(syncSelection, 80);
    return () => {
      window.clearTimeout(immediateTimeout);
      window.clearTimeout(settledTimeout);
    };
  }, [
    interactionMode,
    previewFrameRef,
    previewRefreshNonce,
    previewSelectedPath,
    selectPreviewElementAtPath,
  ]);

  const inspectorElement = useMemo(
    () => previewSelectedElement ?? selectedElement,
    [previewSelectedElement, selectedElement],
  );

  const selectedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (previewSyncedFile && files[previewSyncedFile]?.type === "html") {
      return previewSyncedFile;
    }
    if (activeFile && files[activeFile]?.type === "html") return activeFile;
    return pickDefaultHtmlFile(files);
  }, [activeFile, files, previewSyncedFile, projectPath]);

  useEffect(() => {
    selectedPreviewHtmlRef.current = selectedPreviewHtml;
  }, [selectedPreviewHtml, selectedPreviewHtmlRef]);

  const selectedMountedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (
      previewNavigationFile &&
      files[previewNavigationFile]?.type === "html"
    ) {
      return previewNavigationFile;
    }
    return selectedPreviewHtml;
  }, [files, previewNavigationFile, projectPath, selectedPreviewHtml]);

  const selectedPreviewSrc = useMemo(() => {
    if (
      !selectedMountedPreviewHtml ||
      !isPreviewMountReady ||
      !previewMountBasePath
    ) {
      return null;
    }
    const absolutePath = filePathIndexRef.current[selectedMountedPreviewHtml];
    if (!absolutePath) return null;
    const relativePath = toMountRelativePath(
      previewMountBasePath,
      absolutePath,
    );
    if (!relativePath) return null;
    const nlPort = String((window as { NL_PORT?: string | number }).NL_PORT || "").trim();
    const previewServerOrigin = nlPort ? `http://127.0.0.1:${nlPort}` : "";
    const mountPath = encodeURI(`${PREVIEW_MOUNT_PATH}/${relativePath}`);
    const withRefresh = `${mountPath}${mountPath.includes("?") ? "&" : "?"}nx_refresh=${previewRefreshNonce}`;
    return previewServerOrigin
      ? `${previewServerOrigin}${withRefresh}`
      : withRefresh;
  }, [
    filePathIndexRef,
    isPreviewMountReady,
    previewMountBasePath,
    previewRefreshNonce,
    selectedMountedPreviewHtml,
  ]);

  return {
    handleSidebarSelectElement,
    inspectorElement,
    previewLayerSelectedId,
    previewLayersRoot,
    selectPreviewElementAtPath,
    selectedElement,
    selectedMountedPreviewHtml,
    selectedPathIds,
    selectedPreviewHtml,
    selectedPreviewSrc,
  };
};
