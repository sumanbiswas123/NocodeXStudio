import React, { useCallback, useEffect, useMemo } from "react";
import { FileMap } from "../../../types";
import {
  clearPreviewModeSync,
  handlePreviewFrameLoad as handlePreviewFrameLoadHelper,
  injectMountedPreviewBridge as injectMountedPreviewBridgeHelper,
  postPreviewFrameMessage,
  postPreviewOrientationToFrame,
  postPreviewModeToFrame as postPreviewModeToFrameHelper,
  schedulePreviewModeSync,
} from "../../runtime/previewFrameBridge";
import {
  MOUNTED_PREVIEW_BRIDGE_SCRIPT,
  PREVIEW_MOUNT_PATH,
  PendingPageSwitch,
  PreviewSelectionMode,
  PreviewSyncSource,
  hasToolboxDragType,
  normalizeProjectRelative,
  readElementByPath,
  rewriteInlineAssetRefs,
  toMountRelativePath,
} from "../../helpers/appHelpers";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";
type PreviewToolMode = "edit" | "inspect" | "draw" | "move";

type UsePreviewFrameBridgeStateOptions = {
  activeFileRef: React.MutableRefObject<string | null>;
  drawElementTag: string;
  explorerSelectionLockRef: React.MutableRefObject<string | null>;
  explorerSelectionLockUntilRef: React.MutableRefObject<number>;
  filePathIndexRef: React.MutableRefObject<Record<string, string>>;
  filesRef: React.MutableRefObject<FileMap>;
  hasUnsavedChangesForFile: (path: string) => boolean;
  hideQuickTextEdit: () => void;
  interactionMode: InteractionMode;
  interactionModeRef: React.MutableRefObject<InteractionMode>;
  isPreviewMountReady: boolean;
  openPopupInPreview: (selector: string, popupId: string) => boolean;
  pendingPopupOpenRef: React.MutableRefObject<{
    selector: string;
    popupId: string;
  } | null>;
  pendingPreviewWritesRef: React.MutableRefObject<Record<string, string>>;
  positionQuickTextEditAtRange: (range: Range) => void;
  previewFrameLoadNonce: number;
  previewFrameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  previewMode: "edit" | "preview";
  previewModeRef: React.MutableRefObject<"edit" | "preview">;
  previewMountBasePath: string | null;
  previewRootAliasPathRef: React.MutableRefObject<string | null>;
  previewSelectionMode: PreviewSelectionMode;
  projectPath: string | null;
  quickTextRangeRef: React.MutableRefObject<Range | null>;
  selectedPreviewHtml: string | null;
  selectedPreviewSrc: string | null;
  setInteractionMode: React.Dispatch<React.SetStateAction<InteractionMode>>;
  setIsPageSwitchPromptOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingPageSwitch: React.Dispatch<
    React.SetStateAction<PendingPageSwitch | null>
  >;
  setPreviewFrameLoadNonce: React.Dispatch<React.SetStateAction<number>>;
  setPreviewMode: React.Dispatch<React.SetStateAction<"edit" | "preview">>;
  setPreviewSelectionMode: React.Dispatch<
    React.SetStateAction<PreviewSelectionMode>
  >;
  setSidebarToolMode: React.Dispatch<React.SetStateAction<PreviewToolMode>>;
  setIsToolboxDragging: React.Dispatch<React.SetStateAction<boolean>>;
  shouldProcessPreviewPageSignal: (path: string) => boolean;
  sidebarToolMode: PreviewToolMode;
  syncPreviewActiveFile: (
    path: string,
    source: PreviewSyncSource,
    options?: { skipUnsavedPrompt?: boolean },
  ) => void;
  tabletOrientation: "portrait" | "landscape";
  toolboxDragTypeRef: React.MutableRefObject<string>;
};

type UsePreviewFrameBridgeStateResult = {
  extractMountRelativePath: (locationPath: string) => string | null;
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  handlePreviewFrameLoad: (
    event: React.SyntheticEvent<HTMLIFrameElement>,
  ) => void;
  handlePreviewStageDragOver: (
    event: React.DragEvent<HTMLDivElement>,
  ) => void;
  handleSidebarInteractionModeChange: (nextMode: InteractionMode) => void;
  isActivePreviewMessageSource: (source: MessageEventSource | null) => boolean;
  postPreviewPatchToFrame: (payload: Record<string, unknown>) => void;
  resolveVirtualPathFromMountRelative: (
    mountRelativePath: string,
  ) => string | null;
  setPreviewModeWithSync: (
    nextMode: "edit" | "preview",
    options?: { skipUnsavedPrompt?: boolean },
  ) => void;
  sidebarInteractionMode: InteractionMode;
};

export const usePreviewFrameBridgeState = ({
  activeFileRef,
  drawElementTag,
  explorerSelectionLockRef,
  explorerSelectionLockUntilRef,
  filePathIndexRef,
  filesRef,
  hasUnsavedChangesForFile,
  hideQuickTextEdit,
  interactionMode,
  interactionModeRef,
  isPreviewMountReady,
  openPopupInPreview,
  pendingPopupOpenRef,
  pendingPreviewWritesRef,
  positionQuickTextEditAtRange,
  previewFrameLoadNonce,
  previewFrameRef,
  previewMode,
  previewModeRef,
  previewMountBasePath,
  previewRootAliasPathRef,
  previewSelectionMode,
  projectPath,
  quickTextRangeRef,
  selectedPreviewHtml,
  selectedPreviewSrc,
  setInteractionMode,
  setIsPageSwitchPromptOpen,
  setPendingPageSwitch,
  setPreviewFrameLoadNonce,
  setPreviewMode,
  setPreviewSelectionMode,
  setSidebarToolMode,
  setIsToolboxDragging,
  shouldProcessPreviewPageSignal,
  sidebarToolMode,
  syncPreviewActiveFile,
  tabletOrientation,
  toolboxDragTypeRef,
}: UsePreviewFrameBridgeStateOptions): UsePreviewFrameBridgeStateResult => {
  useEffect(() => {
    const setActive = (active: boolean) => setIsToolboxDragging(active);
    const onToolboxDragState = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; type?: string }>)
        .detail;
      const isActive = Boolean(detail?.active);
      const nextType = String(detail?.type || "").trim();
      setActive(isActive);
      if (isActive && nextType) {
        toolboxDragTypeRef.current = nextType;
      } else if (!isActive) {
        toolboxDragTypeRef.current = "";
      }
    };
    const onWindowDrop = () => {
      setActive(false);
      toolboxDragTypeRef.current = "";
    };
    const onWindowDragEnd = () => {
      setActive(false);
      toolboxDragTypeRef.current = "";
    };
    const onWindowDragOver = (event: DragEvent) => {
      if (hasToolboxDragType(event.dataTransfer)) {
        setActive(true);
      }
    };
    window.addEventListener(
      "nocodex-toolbox-drag-state",
      onToolboxDragState as EventListener,
    );
    window.addEventListener("drop", onWindowDrop);
    window.addEventListener("dragend", onWindowDragEnd);
    window.addEventListener("dragover", onWindowDragOver);
    return () => {
      window.removeEventListener(
        "nocodex-toolbox-drag-state",
        onToolboxDragState as EventListener,
      );
      window.removeEventListener("drop", onWindowDrop);
      window.removeEventListener("dragend", onWindowDragEnd);
      window.removeEventListener("dragover", onWindowDragOver);
    };
  }, [setIsToolboxDragging, toolboxDragTypeRef]);

  const handlePreviewStageDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (
        !selectedPreviewHtml ||
        (!hasToolboxDragType(event.dataTransfer) && !toolboxDragTypeRef.current)
      ) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [selectedPreviewHtml, toolboxDragTypeRef],
  );

  const resolveVirtualPathFromMountRelative = useCallback(
    (mountRelativePath: string): string | null => {
      if (!previewMountBasePath || !mountRelativePath) return null;
      const normalizedTarget = normalizeProjectRelative(
        decodeURIComponent(mountRelativePath).replace(/^\/+|\/+$/g, ""),
      ).toLowerCase();
      if (!normalizedTarget) return null;

      for (const virtualPath in filePathIndexRef.current) {
        const absolutePath = filePathIndexRef.current[virtualPath];
        const relative = toMountRelativePath(previewMountBasePath, absolutePath);
        if (!relative) continue;
        if (
          relative.toLowerCase() === normalizedTarget ||
          relative.toLowerCase() === `${normalizedTarget}/index.html`
        ) {
          return virtualPath;
        }
      }
      return null;
    },
    [filePathIndexRef, previewMountBasePath],
  );

  const extractMountRelativePath = useCallback(
    (locationPath: string): string | null => {
      if (!locationPath) return null;
      if (locationPath.startsWith(`${PREVIEW_MOUNT_PATH}/`)) {
        return locationPath.slice(PREVIEW_MOUNT_PATH.length + 1);
      }
      const aliasPath = previewRootAliasPathRef.current;
      if (aliasPath && locationPath.startsWith(`${aliasPath}/`)) {
        return locationPath.slice(aliasPath.length + 1);
      }
      return null;
    },
    [previewRootAliasPathRef],
  );

  const injectMountedPreviewBridge = useCallback(
    (frame: HTMLIFrameElement | null) => {
      injectMountedPreviewBridgeHelper(frame, MOUNTED_PREVIEW_BRIDGE_SCRIPT);
    },
    [],
  );

  const postPreviewModeToFrame = useCallback(
    (overrides?: {
      mode?: "edit" | "preview";
      selectionMode?: PreviewSelectionMode;
      toolMode?: PreviewToolMode;
      drawTag?: string;
      force?: boolean;
    }) => {
      postPreviewModeToFrameHelper({
        frame: previewFrameRef.current,
        previewMode,
        previewSelectionMode,
        sidebarToolMode,
        drawElementTag,
        interactionMode,
        overrides,
      });
    },
    [
      drawElementTag,
      interactionMode,
      previewFrameRef,
      previewMode,
      previewSelectionMode,
      sidebarToolMode,
    ],
  );

  const setPreviewModeWithSync = useCallback(
    (
      nextMode: "edit" | "preview",
      options?: { skipUnsavedPrompt?: boolean },
    ) => {
      const currentPath = selectedPreviewHtml;
      const shouldPromptUnsaved =
        !options?.skipUnsavedPrompt &&
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        nextMode === "preview" &&
        Boolean(currentPath) &&
        hasUnsavedChangesForFile(currentPath);
      if (shouldPromptUnsaved && currentPath) {
        setPendingPageSwitch({
          mode: "preview_mode",
          fromPath: currentPath,
          nextPath: currentPath,
          source: "navigate",
          nextPreviewMode: "preview",
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      setPreviewMode(nextMode);
      if (interactionModeRef.current !== "preview") return;
      postPreviewModeToFrame({ mode: nextMode, force: true });
      window.setTimeout(() => {
        postPreviewModeToFrame({ mode: nextMode, force: true });
      }, 50);
      window.setTimeout(() => {
        postPreviewModeToFrame({ mode: nextMode, force: true });
      }, 180);
    },
    [
      hasUnsavedChangesForFile,
      interactionModeRef,
      postPreviewModeToFrame,
      previewModeRef,
      selectedPreviewHtml,
      setIsPageSwitchPromptOpen,
      setPendingPageSwitch,
      setPreviewMode,
    ],
  );

  const handleSidebarInteractionModeChange = useCallback(
    (nextMode: InteractionMode) => {
      if (nextMode === "preview") {
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        return;
      }
      if (nextMode === "move") {
        setPreviewSelectionMode("default");
      }
      setSidebarToolMode(nextMode);
      if (interactionModeRef.current === "preview") {
        setPreviewModeWithSync("edit");
        postPreviewModeToFrame({
          mode: "edit",
          toolMode: nextMode,
          drawTag: drawElementTag,
          force: true,
        });
        return;
      }
      if (projectPath) {
        setPreviewMode("edit");
        setInteractionMode("preview");
        return;
      }
      setInteractionMode(nextMode);
    },
    [
      drawElementTag,
      interactionModeRef,
      postPreviewModeToFrame,
      projectPath,
      setInteractionMode,
      setPreviewMode,
      setPreviewSelectionMode,
      setPreviewModeWithSync,
      setSidebarToolMode,
    ],
  );

  const sidebarInteractionMode = useMemo<InteractionMode>(() => {
    if (interactionMode === "preview") {
      return previewMode === "edit" ? sidebarToolMode : "preview";
    }
    return interactionMode;
  }, [interactionMode, previewMode, sidebarToolMode]);

  useEffect(() => {
    if (sidebarInteractionMode !== "move") return;
    if (previewSelectionMode === "default") return;
    setPreviewSelectionMode("default");
  }, [previewSelectionMode, setPreviewSelectionMode, sidebarInteractionMode]);

  useEffect(() => {
    if (previewSelectionMode === "default") return;
    if (sidebarInteractionMode !== "move" && sidebarInteractionMode !== "draw") {
      return;
    }
    setSidebarToolMode("edit");
    if (interactionModeRef.current === "preview") {
      setPreviewMode("edit");
      postPreviewModeToFrame({
        mode: "edit",
        toolMode: "edit",
        selectionMode: previewSelectionMode,
        drawTag: drawElementTag,
        force: true,
      });
      return;
    }
    setInteractionMode("edit");
  }, [
    drawElementTag,
    interactionModeRef,
    postPreviewModeToFrame,
    previewSelectionMode,
    setInteractionMode,
    setPreviewMode,
    setSidebarToolMode,
    sidebarInteractionMode,
  ]);

  const isActivePreviewMessageSource = useCallback(
    (source: MessageEventSource | null): boolean => {
      const activeWindow = previewFrameRef.current?.contentWindow ?? null;
      if (!activeWindow || !source) return false;
      return source === activeWindow;
    },
    [previewFrameRef],
  );

  const getLivePreviewSelectedElement = useCallback(
    (path?: number[] | null): Element | null => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return null;
      if (Array.isArray(path) && path.length > 0) {
        const byPath = readElementByPath(frameDocument.body, path);
        if (byPath) return byPath;
      }
      const byMarker = frameDocument.querySelector(".__nx-preview-selected");
      if (byMarker) return byMarker;
      return null;
    },
    [previewFrameRef],
  );

  const postPreviewPatchToFrame = useCallback(
    (payload: Record<string, unknown>) => {
      postPreviewFrameMessage(previewFrameRef.current, payload);
    },
    [previewFrameRef],
  );

  const syncPreviewOrientationToFrame = useCallback(() => {
    postPreviewOrientationToFrame({
      frame: previewFrameRef.current,
      tabletOrientation,
    });
  }, [previewFrameRef, tabletOrientation]);

  const handlePreviewFrameLoad = useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      handlePreviewFrameLoadHelper({
        frame: event.currentTarget,
        selectedPreviewSrc,
        injectBridge: injectMountedPreviewBridge,
        postMode: postPreviewModeToFrame,
        isPreviewMountReady,
        extractMountRelativePath,
        resolveVirtualPathFromMountRelative,
        explorerSelectionLockRef,
        explorerSelectionLockUntilRef,
        normalizeProjectRelative,
        files: filesRef.current,
        activeFilePath: activeFileRef.current,
        shouldProcessPreviewPageSignal,
        syncPreviewActiveFile,
        pendingPopupOpenRef,
        openPopupInPreview,
        setPreviewFrameLoadNonce,
      });
    },
    [
      activeFileRef,
      explorerSelectionLockRef,
      explorerSelectionLockUntilRef,
      extractMountRelativePath,
      filesRef,
      injectMountedPreviewBridge,
      isPreviewMountReady,
      openPopupInPreview,
      pendingPopupOpenRef,
      postPreviewModeToFrame,
      resolveVirtualPathFromMountRelative,
      selectedPreviewSrc,
      setPreviewFrameLoadNonce,
      shouldProcessPreviewPageSignal,
      syncPreviewActiveFile,
    ],
  );

  useEffect(() => {
    const frame = previewFrameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc || !win) return;

    const handleContextMenu = (event: MouseEvent) => {
      if (interactionModeRef.current !== "preview") return;
      const selection = win.getSelection?.();
      if (!selection || selection.isCollapsed) {
        hideQuickTextEdit();
        return;
      }
      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range) {
        hideQuickTextEdit();
        return;
      }
      quickTextRangeRef.current = range.cloneRange();
      event.preventDefault();
      event.stopPropagation();
      positionQuickTextEditAtRange(range);
    };

    const handleSelectionChange = () => {
      const selection = win.getSelection?.();
      if (!selection || selection.rangeCount === 0) {
        hideQuickTextEdit();
        return;
      }
      if (selection.isCollapsed) {
        hideQuickTextEdit();
        return;
      }
      try {
        const range = selection.getRangeAt(0);
        quickTextRangeRef.current = range.cloneRange();
        positionQuickTextEditAtRange(range);
      } catch {
        // Ignore transient selection reads during iframe reloads.
      }
    };

    doc.addEventListener("contextmenu", handleContextMenu);
    doc.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      doc.removeEventListener("contextmenu", handleContextMenu);
      doc.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [
    hideQuickTextEdit,
    interactionModeRef,
    positionQuickTextEditAtRange,
    previewFrameLoadNonce,
    previewFrameRef,
    quickTextRangeRef,
  ]);

  useEffect(() => {
    if (selectedPreviewSrc) {
      injectMountedPreviewBridge(previewFrameRef.current);
    }
    postPreviewModeToFrame();
    syncPreviewOrientationToFrame();
    const timeoutIds = schedulePreviewModeSync(postPreviewModeToFrame, [
      0, 120, 360,
    ]);
    const orientationTimeoutIds = [0, 120, 360].map((delay) =>
      window.setTimeout(syncPreviewOrientationToFrame, delay),
    );
    return () => {
      clearPreviewModeSync(timeoutIds);
      orientationTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [
    injectMountedPreviewBridge,
    postPreviewModeToFrame,
    pendingPreviewWritesRef,
    previewFrameLoadNonce,
    previewFrameRef,
    previewMode,
    selectedPreviewHtml,
    selectedPreviewSrc,
    syncPreviewOrientationToFrame,
  ]);

  useEffect(() => {
    if (!selectedPreviewSrc || !selectedPreviewHtml) return;
    const pendingHtml = pendingPreviewWritesRef.current[selectedPreviewHtml];
    if (typeof pendingHtml !== "string" || !pendingHtml.trim()) return;
    const parser = new DOMParser();
    const parsed = parser.parseFromString(pendingHtml, "text/html");
    const bodyHtml = parsed.body?.innerHTML || "";
    if (bodyHtml) {
      postPreviewFrameMessage(previewFrameRef.current, {
        type: "PREVIEW_APPLY_HTML",
        html: bodyHtml,
      });
    }
    const htmlDirVirtual = selectedPreviewHtml.includes("/")
      ? selectedPreviewHtml.slice(0, selectedPreviewHtml.lastIndexOf("/"))
      : "";
    const cssLocalVirtualPath = normalizeProjectRelative(
      htmlDirVirtual ? `${htmlDirVirtual}/css/local.css` : "css/local.css",
    );
    const pendingCss = pendingPreviewWritesRef.current[cssLocalVirtualPath];
    if (typeof pendingCss === "string") {
      postPreviewFrameMessage(previewFrameRef.current, {
        type: "PREVIEW_SET_RUNTIME_CSS",
        styleId: "__nx-preview-runtime-local-css",
        cssText: rewriteInlineAssetRefs(
          pendingCss,
          cssLocalVirtualPath,
          filesRef.current,
        ),
      });
    }
  }, [
    filesRef,
    pendingPreviewWritesRef,
    previewFrameLoadNonce,
    previewFrameRef,
    selectedPreviewHtml,
    selectedPreviewSrc,
  ]);

  return {
    extractMountRelativePath,
    getLivePreviewSelectedElement,
    handlePreviewFrameLoad,
    handlePreviewStageDragOver,
    handleSidebarInteractionModeChange,
    isActivePreviewMessageSource,
    postPreviewPatchToFrame,
    resolveVirtualPathFromMountRelative,
    setPreviewModeWithSync,
    sidebarInteractionMode,
  };
};
