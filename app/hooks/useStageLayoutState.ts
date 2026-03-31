import { useEffect, useMemo, useRef, useState } from "react";

type UseStageLayoutStateOptions = {
  bothPanelsOpen: boolean;
  codePanelWidth: number;
  deviceMode: "desktop" | "mobile" | "tablet";
  desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
  frameZoom: 50 | 75 | 100;
  getDefaultRightPanelPosition: (width: number) => { left: number; top: number };
  hasPdfAnnotationsLoaded: boolean;
  isCodePanelOpen: boolean;
  isFloatingPanels: boolean;
  isLeftPanelOpen: boolean;
  isPdfAnnotationLoading: boolean;
  isPdfAnnotationPanelOpen: boolean;
  isRightPanelOpen: boolean;
  isScreenshotGalleryOpen: boolean;
  isStyleInspectorSectionOpen: boolean;
  leftPanelWidth: number;
  pdfAnnotationError: string | null;
  pdfAnnotationProcessingLogsLength: number;
  rightPanelMode: "inspector" | "gallery";
  rightPanelWidth: number;
  setFrameZoom: React.Dispatch<React.SetStateAction<50 | 75 | 100>>;
  setRightPanelFloatingPosition: React.Dispatch<
    React.SetStateAction<{ left: number; top: number }>
  >;
  tabletModel: "ipad" | "ipad-pro";
  tabletOrientation: "landscape" | "portrait";
  theme: "dark" | "light";
};

type UseStageLayoutStateResult = {
  baseOverflowX: "scroll" | "auto";
  clampedCodeShiftX: number;
  clampedTabletShiftX: number;
  codePanelStageOffset: number;
  consolePanelStageOffset: number;
  currentDevicePixelRatio: number;
  darkTabletReflectionOpacity: number;
  estimatedFrameWidthPx: number;
  frameScale: number;
  isRightInspectorAttached: boolean;
  isRightInspectorMode: boolean;
  isTabletZoomMode: boolean;
  shouldLockHorizontalScroll: boolean;
  shouldLockVerticalScroll: boolean;
  showDeviceFrameToolbar: true;
  showEmbeddedPdfAnnotations: boolean;
  showStyleInspectorSection: boolean;
  stageViewportWidth: number;
  tabletMetrics: {
    frameWidth: number;
    frameHeight: number;
    contentWidth: number;
    contentHeight: number;
  };
  tabletViewportScale: number;
  toolbarAnchorLeft: number;
};

export const useStageLayoutState = ({
  bothPanelsOpen,
  codePanelWidth,
  deviceMode,
  desktopResolution,
  frameZoom,
  getDefaultRightPanelPosition,
  hasPdfAnnotationsLoaded,
  isCodePanelOpen,
  isFloatingPanels,
  isLeftPanelOpen,
  isPdfAnnotationLoading,
  isPdfAnnotationPanelOpen,
  isRightPanelOpen,
  isScreenshotGalleryOpen,
  isStyleInspectorSectionOpen,
  leftPanelWidth,
  pdfAnnotationError,
  pdfAnnotationProcessingLogsLength,
  rightPanelMode,
  rightPanelWidth,
  setFrameZoom,
  setRightPanelFloatingPosition,
  tabletModel,
  tabletOrientation,
  theme,
}: UseStageLayoutStateOptions): UseStageLayoutStateResult => {
  const [currentDevicePixelRatio, setCurrentDevicePixelRatio] = useState(() =>
    typeof window !== "undefined" && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1,
  );
  const lastPanelDprRef = useRef<number | null>(null);
  const lastAutoDprZoomRef = useRef<50 | 75 | 100 | null>(null);

  const tabletMetrics = useMemo(() => {
    const base =
      tabletModel === "ipad-pro"
        ? {
            framePortraitWidth: 834,
            framePortraitHeight: 1112,
            contentPortraitWidth: 2048,
            contentPortraitHeight: 2732,
          }
        : {
            framePortraitWidth: 768,
            framePortraitHeight: 1024,
            contentPortraitWidth: 1536,
            contentPortraitHeight: 2048,
          };

    if (tabletOrientation === "landscape") {
      return {
        frameWidth: base.framePortraitHeight,
        frameHeight: base.framePortraitWidth,
        contentWidth: base.contentPortraitHeight,
        contentHeight: base.contentPortraitWidth,
      };
    }

    return {
      frameWidth: base.framePortraitWidth,
      frameHeight: base.framePortraitHeight,
      contentWidth: base.contentPortraitWidth,
      contentHeight: base.contentPortraitHeight,
    };
  }, [tabletModel, tabletOrientation]);

  const tabletViewportScale = useMemo(() => {
    const tabletBezelPx = 20;
    const usableWidth = Math.max(1, tabletMetrics.frameWidth - tabletBezelPx);
    const usableHeight = Math.max(1, tabletMetrics.frameHeight - tabletBezelPx);
    return Math.min(
      usableWidth / tabletMetrics.contentWidth,
      usableHeight / tabletMetrics.contentHeight,
    );
  }, [tabletMetrics]);

  const shouldPushTabletFrame =
    deviceMode === "tablet" && frameZoom === 75 && currentDevicePixelRatio !== 1;

  const tabletPanelPushX = useMemo(() => {
    if (isPdfAnnotationPanelOpen && deviceMode === "tablet") {
      return 0;
    }
    if (!shouldPushTabletFrame) return 0;

    const rightActive =
      rightPanelMode === "inspector" ||
      isRightPanelOpen ||
      isPdfAnnotationPanelOpen ||
      isScreenshotGalleryOpen;
    if (isLeftPanelOpen === rightActive) return 0;

    const pushAmount = Math.round(leftPanelWidth * 0.42);
    return isLeftPanelOpen ? pushAmount : -pushAmount;
  }, [
    deviceMode,
    isLeftPanelOpen,
    isPdfAnnotationPanelOpen,
    isRightPanelOpen,
    isScreenshotGalleryOpen,
    leftPanelWidth,
    rightPanelMode,
    shouldPushTabletFrame,
  ]);

  const baseOverflowX = bothPanelsOpen ? "scroll" : "auto";
  const isRightInspectorMode = rightPanelMode === "inspector";
  const isRightInspectorAttached = isRightInspectorMode && isRightPanelOpen;
  const showEmbeddedPdfAnnotations =
    isPdfAnnotationPanelOpen &&
    (hasPdfAnnotationsLoaded ||
      isPdfAnnotationLoading ||
      Boolean(pdfAnnotationError) ||
      pdfAnnotationProcessingLogsLength > 0);
  const showStyleInspectorSection = isStyleInspectorSectionOpen;
  const isTabletZoomMode = deviceMode === "tablet";
  const lockAllScrollAt50 = isTabletZoomMode && frameZoom === 50;
  const lockVerticalAt75Landscape =
    isTabletZoomMode && frameZoom === 75 && tabletOrientation === "landscape";
  const lockHorizontalAt75Portrait =
    isTabletZoomMode && frameZoom === 75 && tabletOrientation === "portrait";
  const shouldLockHorizontalScroll =
    lockAllScrollAt50 || lockHorizontalAt75Portrait;
  const shouldLockVerticalScroll =
    lockAllScrollAt50 || lockVerticalAt75Landscape;
  const frameScale = frameZoom / 100;
  const darkTabletReflectionOpacity =
    theme === "dark" && deviceMode === "tablet"
      ? Math.min(
          0.72,
          0.28 +
            (isLeftPanelOpen ? 0.12 : 0) +
            (isRightPanelOpen ? 0.12 : 0) +
            (isCodePanelOpen ? 0.12 : 0),
        )
      : 0;
  const codePanelStageOffset =
    isCodePanelOpen && deviceMode !== "mobile"
      ? (() => {
          const viewportWidth =
            typeof window !== "undefined" ? window.innerWidth : 1440;
          if (!isFloatingPanels) return codePanelWidth;
          const floatingPanelWidth = Math.min(
            42 * 16,
            Math.max(320, viewportWidth - 96),
          );
          const floatingRightInset = 40;
          return floatingPanelWidth + floatingRightInset;
        })()
      : 0;
  const consolePanelStageOffset = 0;
  const stageViewportWidth = Math.max(
    320,
    (typeof window !== "undefined" ? window.innerWidth : 1440) -
      codePanelStageOffset -
      consolePanelStageOffset,
  );
  const estimatedFrameWidthPx =
    deviceMode === "mobile"
      ? 375 * frameScale
      : deviceMode === "tablet"
        ? tabletMetrics.frameWidth * frameScale
        : desktopResolution === "resizable"
          ? stageViewportWidth * 0.8 * frameScale
          : 921.6 * frameScale;
  const halfSpareSpace = (stageViewportWidth - estimatedFrameWidthPx) / 2;
  const maxShiftMagnitude =
    Math.max(0, Math.floor(halfSpareSpace - 16)) +
    (isPdfAnnotationPanelOpen && deviceMode !== "tablet" ? 400 : 0);
  const intendedCodeShiftX = 0;
  const clampedCodeShiftX = Math.max(
    -maxShiftMagnitude,
    Math.min(maxShiftMagnitude, intendedCodeShiftX),
  );
  const clampedTabletShiftX = Math.max(
    -maxShiftMagnitude,
    Math.min(maxShiftMagnitude, tabletPanelPushX + clampedCodeShiftX),
  );
  const toolbarAnchorLeft = Math.max(
    16,
    Math.round(
      (typeof window !== "undefined" ? window.innerWidth : 1440) / 2 -
        estimatedFrameWidthPx / 2 +
        20,
    ),
  );

  useEffect(() => {
    const syncDevicePixelRatio = () => {
      const next =
        typeof window !== "undefined" && window.devicePixelRatio
          ? window.devicePixelRatio
          : 1;
      setCurrentDevicePixelRatio((prev) =>
        Math.abs(prev - next) > 0.01 ? next : prev,
      );
    };

    syncDevicePixelRatio();
    const media =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
        : null;

    window.addEventListener("resize", syncDevicePixelRatio);
    media?.addEventListener?.("change", syncDevicePixelRatio);

    return () => {
      window.removeEventListener("resize", syncDevicePixelRatio);
      media?.removeEventListener?.("change", syncDevicePixelRatio);
    };
  }, [currentDevicePixelRatio]);

  useEffect(() => {
    const previousDpr = lastPanelDprRef.current;
    lastPanelDprRef.current = currentDevicePixelRatio;
    if (
      previousDpr === null ||
      Math.abs(previousDpr - currentDevicePixelRatio) < 0.01
    ) {
      return;
    }
    setRightPanelFloatingPosition(getDefaultRightPanelPosition(rightPanelWidth));
  }, [
    currentDevicePixelRatio,
    getDefaultRightPanelPosition,
    rightPanelWidth,
    setRightPanelFloatingPosition,
  ]);

  useEffect(() => {
    const targetZoom: 75 | 100 = currentDevicePixelRatio >= 1.5 ? 75 : 100;
    const previousAuto = lastAutoDprZoomRef.current;
    if (previousAuto === targetZoom) return;
    lastAutoDprZoomRef.current = targetZoom;
    if (deviceMode !== "tablet") return;
    setFrameZoom(targetZoom);
  }, [currentDevicePixelRatio, deviceMode, setFrameZoom]);

  return {
    baseOverflowX,
    clampedCodeShiftX,
    clampedTabletShiftX,
    codePanelStageOffset,
    consolePanelStageOffset,
    currentDevicePixelRatio,
    darkTabletReflectionOpacity,
    estimatedFrameWidthPx,
    frameScale,
    isRightInspectorAttached,
    isRightInspectorMode,
    isTabletZoomMode,
    shouldLockHorizontalScroll,
    shouldLockVerticalScroll,
    showDeviceFrameToolbar: true,
    showEmbeddedPdfAnnotations,
    showStyleInspectorSection,
    stageViewportWidth,
    tabletMetrics,
    tabletViewportScale,
    toolbarAnchorLeft,
  };
};
