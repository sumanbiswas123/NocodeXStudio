import React, { useCallback, useEffect, useMemo } from "react";
import { FileMap } from "../../../types";
import {
  clearPreviewModeSync,
  handlePreviewFrameLoad as handlePreviewFrameLoadHelper,
  injectMountedPreviewBridge as injectMountedPreviewBridgeHelper,
  postPreviewFrameMessage,
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
  setSidebarToolMode: React.Dispatch<React.SetStateAction<PreviewToolMode>>;
  setIsToolboxDragging: React.Dispatch<React.SetStateAction<boolean>>;
  shouldProcessPreviewPageSignal: (path: string) => boolean;
  sidebarToolMode: PreviewToolMode;
  syncPreviewActiveFile: (
    path: string,
    source: PreviewSyncSource,
    options?: { skipUnsavedPrompt?: boolean },
  ) => void;
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
  setSidebarToolMode,
  setIsToolboxDragging,
  shouldProcessPreviewPageSignal,
  sidebarToolMode,
  syncPreviewActiveFile,
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
    const timeoutIds = schedulePreviewModeSync(postPreviewModeToFrame, [
      0, 120, 360,
    ]);
    return () => {
      clearPreviewModeSync(timeoutIds);
    };
  }, [
    injectMountedPreviewBridge,
    postPreviewModeToFrame,
    previewFrameRef,
    previewMode,
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
