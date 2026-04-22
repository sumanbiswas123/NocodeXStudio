import { useMemo } from "react";
import type React from "react";
import MainStageShell from "../../ui/MainStageShell";
import { INJECTED_STYLES } from "../../../constants";
import type { VirtualElement } from "../../../types";
import type { PdfAnnotationUiRecord } from "../../helpers/pdfAnnotationHelpers";

type UseMainStageViewModelOptions = {
  isResizingLeftPanel: boolean;
  isResizingRightPanel: boolean;
  isFloatingPanels: boolean;
  deviceMode: "desktop" | "mobile" | "tablet";
  isPanelsSwapped: boolean;
  isLeftPanelOpen: boolean;
  isRightPanelOpen: boolean;
  codePanelStageOffset: number;
  consolePanelStageOffset: number;
  isRightInspectorAttached: boolean;
  shouldLockHorizontalScroll: boolean;
  shouldLockVerticalScroll: boolean;
  baseOverflowX: "auto" | "hidden" | "scroll";
  baseStagePadding: number;
  bothPanelsOpen: boolean;
  rightOverlayInset: number;
  floatingHorizontalInset: number;
  tabletMetrics: {
    frameWidth: number;
    frameHeight: number;
    contentWidth: number;
    contentHeight: number;
  };
  desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
  clampedTabletShiftX: number;
  clampedCodeShiftX: number;
  frameScale: number;
  currentDevicePixelRatio: number;
  dirtyFileCount: number;
  frameZoom: number;
  handlePreviewRefresh: () => void;
  handleSidebarInteractionModeChange: (
    mode: "edit" | "inspect" | "draw" | "move",
  ) => void;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  openScreenshotGallery: (captureNow: boolean) => Promise<void>;
  previewMode: "edit" | "preview";
  previewSelectionMode: "default" | "text" | "image" | "css";
  projectPath: string | null;
  runRedo: () => void;
  runUndo: () => void;
  screenshotCaptureBusy: boolean;
  handleTabletRotateToConfiguredOrientation: () => void;
  setDeviceCtxMenu: React.Dispatch<
    React.SetStateAction<{
      x: number;
      y: number;
      type: "desktop" | "mobile" | "tablet";
    } | null>
  >;
  setDeviceMode: React.Dispatch<
    React.SetStateAction<"desktop" | "mobile" | "tablet">
  >;
  setFrameZoom: React.Dispatch<React.SetStateAction<50 | 75 | 100>>;
  setPreviewModeWithSync: (
    nextMode: "edit" | "preview",
    options?: { skipUnsavedPrompt?: boolean },
  ) => void;
  setPreviewSelectionMode: React.Dispatch<
    React.SetStateAction<"default" | "text" | "image" | "css">
  >;
  setTabletOrientation: React.Dispatch<
    React.SetStateAction<"portrait" | "landscape">
  >;
  showScreenshotFeatures: boolean;
  showToolbar: boolean;
  sidebarInteractionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  tabletOrientation: "portrait" | "landscape";
  theme: "dark" | "light";
  toggleThemeWithTransition: () => void;
  darkTabletReflectionOpacity: number;
  mobileFrameStyle: "dynamic-island" | "punch-hole" | "notch";
  filteredAnnotationsForCurrentSlide: PdfAnnotationUiRecord[];
  focusedAnnotationForCurrentSlide: PdfAnnotationUiRecord | null;
  handleMoveElement: (draggedId: string, targetId: string) => void;
  handleMoveElementByPosition: (
    id: string,
    styles: Partial<React.CSSProperties>,
  ) => void;
  handleOpenFolder: (path?: string | null) => Promise<void>;
  handlePreviewFrameLoad: (
    event: React.SyntheticEvent<HTMLIFrameElement, Event>,
  ) => void;
  handlePreviewResizeHandleMouseDown: (
    direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  handlePreviewStageDragOver: (
    event: React.DragEvent<HTMLDivElement | HTMLIFrameElement>,
  ) => void;
  handlePreviewStageDrop: (
    event: React.DragEvent<HTMLDivElement | HTMLIFrameElement>,
  ) => void;
  handleResize: (id: string, width: string, height: string) => void;
  handleSelect: (id: string) => void;
  hasPreviewContent: boolean;
  isPdfAnnotationPanelOpen: boolean;
  isPopupAnnotation: (annotation: PdfAnnotationUiRecord) => boolean;
  isToolboxDragging: boolean;
  previewFrameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  previewRefreshNonce: number;
  previewSelectedPath: number[] | null;
  previewSelectionBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  previewStageRef: React.MutableRefObject<HTMLDivElement | null>;
  recentProjects: string[];
  root: VirtualElement;
  selectedId: string | null;
  selectedPathIds: Set<string> | null;
  selectedPreviewDoc: string;
  selectedPreviewHtml: string | null;
  selectedPreviewSrc: string | null;
  shouldShowFrameWelcome: boolean;
  tabletViewportScale: number;
  scrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  clearStageSelection: () => void;
};

export const useMainStageViewModel = ({
  isResizingLeftPanel,
  isResizingRightPanel,
  isFloatingPanels,
  deviceMode,
  isPanelsSwapped,
  isLeftPanelOpen,
  isRightPanelOpen,
  codePanelStageOffset,
  consolePanelStageOffset,
  isRightInspectorAttached,
  shouldLockHorizontalScroll,
  shouldLockVerticalScroll,
  baseOverflowX,
  baseStagePadding,
  bothPanelsOpen,
  rightOverlayInset,
  floatingHorizontalInset,
  tabletMetrics,
  desktopResolution,
  clampedTabletShiftX,
  clampedCodeShiftX,
  frameScale,
  currentDevicePixelRatio,
  dirtyFileCount,
  frameZoom,
  handlePreviewRefresh,
  handleSidebarInteractionModeChange,
  interactionMode,
  openScreenshotGallery,
  previewMode,
  previewSelectionMode,
  projectPath,
  runRedo,
  runUndo,
  screenshotCaptureBusy,
  handleTabletRotateToConfiguredOrientation,
  setDeviceCtxMenu,
  setDeviceMode,
  setFrameZoom,
  setPreviewModeWithSync,
  setPreviewSelectionMode,
  setTabletOrientation,
  showScreenshotFeatures,
  showToolbar,
  sidebarInteractionMode,
  tabletOrientation,
  theme,
  toggleThemeWithTransition,
  darkTabletReflectionOpacity,
  mobileFrameStyle,
  filteredAnnotationsForCurrentSlide,
  focusedAnnotationForCurrentSlide,
  handleMoveElement,
  handleMoveElementByPosition,
  handleOpenFolder,
  handlePreviewFrameLoad,
  handlePreviewResizeHandleMouseDown,
  handlePreviewStageDragOver,
  handlePreviewStageDrop,
  handleResize,
  handleSelect,
  hasPreviewContent,
  isPdfAnnotationPanelOpen,
  isPopupAnnotation,
  isToolboxDragging,
  previewFrameRef,
  previewRefreshNonce,
  previewSelectedPath,
  previewSelectionBox,
  previewStageRef,
  recentProjects,
  root,
  selectedId,
  selectedPathIds,
  selectedPreviewDoc,
  selectedPreviewHtml,
  selectedPreviewSrc,
  shouldShowFrameWelcome,
  tabletViewportScale,
  scrollerRef,
  clearStageSelection,
}: UseMainStageViewModelOptions): React.ComponentProps<typeof MainStageShell> =>
  useMemo(
    () => ({
      stageState: {
        isResizingLeftPanel,
        isResizingRightPanel,
        stageMarginLeft:
          !isFloatingPanels &&
          deviceMode !== "mobile" &&
          ((isPanelsSwapped && !isLeftPanelOpen && isRightPanelOpen) ||
            (!isPanelsSwapped && isLeftPanelOpen && !isRightPanelOpen))
            ? isPanelsSwapped
              ? "var(--right-panel-width)"
              : "var(--left-panel-width)"
            : 0,
        stageMarginRight: codePanelStageOffset
          ? `${codePanelStageOffset}px`
          : consolePanelStageOffset
            ? `${consolePanelStageOffset}px`
            : !isFloatingPanels &&
                deviceMode !== "mobile" &&
                isRightInspectorAttached
              ? "var(--right-panel-width)"
              : !isFloatingPanels &&
                  deviceMode !== "mobile" &&
                  ((isPanelsSwapped &&
                    isLeftPanelOpen &&
                    !isRightPanelOpen) ||
                    (!isPanelsSwapped &&
                      !isLeftPanelOpen &&
                      isRightPanelOpen))
                ? isPanelsSwapped
                  ? "var(--left-panel-width)"
                  : "var(--right-panel-width)"
                : 0,
        shouldLockHorizontalScroll,
        shouldLockVerticalScroll,
        baseOverflowX,
        baseStagePadding,
        bothPanelsOpen,
        rightOverlayInset,
        floatingHorizontalInset,
      },
      stageFrame: {
        deviceMode,
        tabletMetrics,
        desktopResolution,
        clampedTabletShiftX,
        clampedCodeShiftX,
        frameScale,
        toolbarProps: {
          currentDevicePixelRatio,
          deviceMode,
          dirtyFileCount,
          frameZoom,
          handlePreviewRefresh,
          handleSidebarInteractionModeChange,
          interactionMode,
          openScreenshotGallery,
          previewMode,
          previewSelectionMode,
          projectPath,
          runRedo,
          runUndo,
          screenshotCaptureBusy,
          handleTabletRotateToConfiguredOrientation,
          setDeviceCtxMenu,
          setDeviceMode,
          setFrameZoom,
          setPreviewModeWithSync,
          setPreviewSelectionMode,
          setTabletOrientation,
          showScreenshotFeatures,
          showToolbar,
          sidebarInteractionMode,
          tabletOrientation,
          theme,
          toggleThemeWithTransition,
        },
        chromeProps: {
          darkTabletReflectionOpacity,
          deviceMode,
          mobileFrameStyle,
          theme,
        },
        screenProps: {
          desktopResolution,
          deviceMode,
          filteredAnnotationsForCurrentSlide,
          focusedAnnotationForCurrentSlide,
          handleMoveElement,
          handleMoveElementByPosition,
          handleOpenFolder,
          handlePreviewFrameLoad,
          handlePreviewResizeHandleMouseDown,
          handlePreviewStageDragOver,
          handlePreviewStageDrop,
          handleResize,
          handleSelect,
          hasPreviewContent,
          injectedStyles: INJECTED_STYLES,
          interactionMode,
          isPdfAnnotationPanelOpen,
          isPopupAnnotation,
          isToolboxDragging,
          previewFrameRef,
          previewMode,
          previewRefreshNonce,
          previewSelectedPath,
          previewSelectionBox,
          previewStageRef,
          projectPath,
          recentProjects,
          root,
          selectedId,
          selectedPathIds,
          selectedPreviewDoc,
          selectedPreviewHtml,
          selectedPreviewSrc,
          shouldShowFrameWelcome,
          tabletMetrics,
          tabletViewportScale,
        },
      },
      stageRefs: { scrollerRef },
      stageHandlers: {
        onStageBackgroundClick: clearStageSelection,
      },
    }),
    [
      isResizingLeftPanel,
      isResizingRightPanel,
      isFloatingPanels,
      deviceMode,
      isPanelsSwapped,
      isLeftPanelOpen,
      isRightPanelOpen,
      codePanelStageOffset,
      consolePanelStageOffset,
      isRightInspectorAttached,
      shouldLockHorizontalScroll,
      shouldLockVerticalScroll,
      baseOverflowX,
      baseStagePadding,
      bothPanelsOpen,
      rightOverlayInset,
      floatingHorizontalInset,
      tabletMetrics,
      desktopResolution,
      clampedTabletShiftX,
      clampedCodeShiftX,
      frameScale,
      currentDevicePixelRatio,
      dirtyFileCount,
      frameZoom,
      handlePreviewRefresh,
      handleSidebarInteractionModeChange,
      interactionMode,
      openScreenshotGallery,
      previewMode,
      previewSelectionMode,
      projectPath,
      runRedo,
      runUndo,
      screenshotCaptureBusy,
      handleTabletRotateToConfiguredOrientation,
      setDeviceCtxMenu,
      setDeviceMode,
      setFrameZoom,
      setPreviewModeWithSync,
      setPreviewSelectionMode,
      setTabletOrientation,
      showScreenshotFeatures,
      showToolbar,
      sidebarInteractionMode,
      tabletOrientation,
      theme,
      toggleThemeWithTransition,
      darkTabletReflectionOpacity,
      mobileFrameStyle,
      filteredAnnotationsForCurrentSlide,
      focusedAnnotationForCurrentSlide,
      handleMoveElement,
      handleMoveElementByPosition,
      handleOpenFolder,
      handlePreviewFrameLoad,
      handlePreviewResizeHandleMouseDown,
      handlePreviewStageDragOver,
      handlePreviewStageDrop,
      handleResize,
      handleSelect,
      hasPreviewContent,
      isPdfAnnotationPanelOpen,
      isPopupAnnotation,
      isToolboxDragging,
      previewFrameRef,
      previewMode,
      previewRefreshNonce,
      previewSelectedPath,
      previewSelectionBox,
      previewStageRef,
      recentProjects,
      root,
      selectedId,
      selectedPathIds,
      selectedPreviewDoc,
      selectedPreviewHtml,
      selectedPreviewSrc,
      shouldShowFrameWelcome,
      tabletViewportScale,
      scrollerRef,
      clearStageSelection,
    ],
  );
