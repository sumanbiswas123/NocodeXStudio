import React, { useCallback, useEffect, useState } from "react";
import { VirtualElement } from "../types";
import {
  dataUrlToBytes as dataUrlToBytesHelper,
  findVisiblePopupInDoc as findVisiblePopupInDocHelper,
  loadJsonIndexFile,
  resolvePreviewAssetUrl as resolvePreviewAssetUrlHelper,
  resolveProjectWorkspacePath,
  writeJsonIndexFile,
} from "./mediaWorkspaceHelpers";
import {
  captureScreenshot,
  deleteScreenshotItem,
  exportEditablePdf,
  loadScreenshotGalleryItems,
  PDF_EXPORT_DIR,
  revealScreenshotsFolder,
  SCREENSHOT_DIR,
  SCREENSHOT_INDEX_FILE,
  ScreenshotMetadata,
} from "./screenshotWorkspace";

type PendingPopupRef = React.MutableRefObject<{
  selector: string | null;
  popupId: string | null;
} | null>;

type UseScreenshotGalleryParams = {
  projectPath: string | null;
  showScreenshotFeatures: boolean;
  previewFrameRef: React.RefObject<HTMLIFrameElement | null>;
  selectedPreviewHtmlRef: React.RefObject<string | null>;
  filePathIndexRef: React.RefObject<Record<string, string>>;
  previewMountBasePath: string;
  deviceMode: ScreenshotMetadata["deviceMode"];
  tabletModel: ScreenshotMetadata["tabletModel"];
  tabletOrientation: ScreenshotMetadata["tabletOrientation"];
  frameZoom: number;
  previewMode: ScreenshotMetadata["previewMode"];
  interactionMode: ScreenshotMetadata["interactionMode"];
  isLeftPanelOpen: boolean;
  setIsLeftPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRightPanelOpen: boolean;
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  rightPanelMode: "inspector" | "gallery";
  setRightPanelMode: React.Dispatch<
    React.SetStateAction<"inspector" | "gallery">
  >;
  ensureDirectoryTree: (path: string) => Promise<void>;
  ensureDirectoryForFile: (path: string) => Promise<void>;
  pendingPopupOpenRef: PendingPopupRef;
  openPopupInPreview: (
    selector: string | null,
    popupId: string | null,
  ) => boolean;
  setPreviewMode: React.Dispatch<React.SetStateAction<"edit" | "preview">>;
  setInteractionMode: React.Dispatch<
    React.SetStateAction<"edit" | "preview" | "inspect" | "draw" | "move">
  >;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setPreviewSelectedPath: React.Dispatch<
    React.SetStateAction<number[] | null>
  >;
  setPreviewSelectedElement: React.Dispatch<
    React.SetStateAction<VirtualElement | null>
  >;
  setPreviewSelectedComputedStyles: React.Dispatch<
    React.SetStateAction<React.CSSProperties | null>
  >;
  setPreviewNavigationFile: React.Dispatch<
    React.SetStateAction<string | null>
  >;
};

export const useScreenshotGallery = ({
  projectPath,
  showScreenshotFeatures,
  previewFrameRef,
  selectedPreviewHtmlRef,
  filePathIndexRef,
  previewMountBasePath,
  deviceMode,
  tabletModel,
  tabletOrientation,
  frameZoom,
  previewMode,
  interactionMode,
  isLeftPanelOpen,
  setIsLeftPanelOpen,
  isRightPanelOpen,
  setIsRightPanelOpen,
  rightPanelMode,
  setRightPanelMode,
  ensureDirectoryTree,
  ensureDirectoryForFile,
  pendingPopupOpenRef,
  openPopupInPreview,
  setPreviewMode,
  setInteractionMode,
  setSelectedId,
  setPreviewSelectedPath,
  setPreviewSelectedElement,
  setPreviewSelectedComputedStyles,
  setPreviewNavigationFile,
}: UseScreenshotGalleryParams) => {
  const [isScreenshotGalleryOpen, setIsScreenshotGalleryOpen] = useState(false);
  const [screenshotItems, setScreenshotItems] = useState<ScreenshotMetadata[]>(
    [],
  );
  const [screenshotPreviewUrls, setScreenshotPreviewUrls] = useState<
    Record<string, string>
  >({});
  const [screenshotCaptureBusy, setScreenshotCaptureBusy] = useState(false);
  const [screenshotSessionRestore, setScreenshotSessionRestore] = useState<{
    leftOpen: boolean;
    rightOpen: boolean;
    rightMode: "inspector" | "gallery";
  } | null>(null);
  const [pdfExportLogs, setPdfExportLogs] = useState<string[]>([]);
  const [isPdfExporting, setIsPdfExporting] = useState(false);

  const resolveScreenshotIndexPath = useCallback(() => {
    return resolveProjectWorkspacePath(projectPath, SCREENSHOT_INDEX_FILE);
  }, [projectPath]);

  const resolveScreenshotDir = useCallback(() => {
    return resolveProjectWorkspacePath(projectPath, SCREENSHOT_DIR);
  }, [projectPath]);

  const resolvePdfExportDir = useCallback(() => {
    return resolveProjectWorkspacePath(projectPath, PDF_EXPORT_DIR);
  }, [projectPath]);

  const resolvePreviewAssetUrl = useCallback(
    (rawUrl: string | null | undefined) => {
      return resolvePreviewAssetUrlHelper({
        rawUrl,
        projectPath,
        previewMountBasePath,
        selectedPreviewHtml: selectedPreviewHtmlRef.current || "",
        filePathIndex: filePathIndexRef.current,
      });
    },
    [projectPath, previewMountBasePath, selectedPreviewHtmlRef, filePathIndexRef],
  );

  const loadScreenshotIndex = useCallback(async () => {
    return loadJsonIndexFile<ScreenshotMetadata>(resolveScreenshotIndexPath());
  }, [resolveScreenshotIndexPath]);

  const writeScreenshotIndex = useCallback(
    async (items: ScreenshotMetadata[]) => {
      await writeJsonIndexFile(
        resolveScreenshotIndexPath(),
        items,
        ensureDirectoryForFile,
      );
    },
    [ensureDirectoryForFile, resolveScreenshotIndexPath],
  );

  const handleScreenshotCapture = useCallback(async () => {
    if (!projectPath || screenshotCaptureBusy) return;
    const doc =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    if (!doc?.body) return;
    setScreenshotCaptureBusy(true);
    try {
      const nextIndex = await captureScreenshot({
        projectPath,
        doc,
        selectedPreviewHtml: selectedPreviewHtmlRef.current || null,
        deviceMode,
        tabletModel,
        tabletOrientation,
        frameZoom,
        previewMode,
        interactionMode,
        ensureDirectoryForFile,
        findVisiblePopupInDoc: findVisiblePopupInDocHelper,
        resolvePreviewAssetUrl,
        dataUrlToBytes: dataUrlToBytesHelper,
        loadScreenshotIndex,
        writeScreenshotIndex,
      });
      setScreenshotItems(nextIndex);
    } catch (error) {
      console.error("Screenshot capture failed:", error);
      window.alert("Screenshot capture failed. Check console for details.");
    } finally {
      setScreenshotCaptureBusy(false);
    }
  }, [
    projectPath,
    screenshotCaptureBusy,
    previewFrameRef,
    selectedPreviewHtmlRef,
    deviceMode,
    tabletModel,
    tabletOrientation,
    frameZoom,
    previewMode,
    interactionMode,
    ensureDirectoryForFile,
    resolvePreviewAssetUrl,
    loadScreenshotIndex,
    writeScreenshotIndex,
  ]);

  const loadGalleryItems = useCallback(async () => {
    const { items, previewUrls: nextUrls } = await loadScreenshotGalleryItems({
      projectPath,
      loadScreenshotIndex,
    });
    setScreenshotItems(items);
    setScreenshotPreviewUrls((prev) => {
      Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
      return nextUrls;
    });
    return items;
  }, [loadScreenshotIndex, projectPath]);

  const openScreenshotGallery = useCallback(
    async (captureNow: boolean) => {
      if (!showScreenshotFeatures || !projectPath) return;
      if (!screenshotSessionRestore) {
        setScreenshotSessionRestore({
          leftOpen: isLeftPanelOpen,
          rightOpen: isRightPanelOpen,
          rightMode: rightPanelMode,
        });
      }
      setIsLeftPanelOpen(false);
      setIsRightPanelOpen(true);
      setRightPanelMode("gallery");
      setIsScreenshotGalleryOpen(true);
      await loadGalleryItems();
      if (captureNow) {
        void handleScreenshotCapture();
      }
    },
    [
      showScreenshotFeatures,
      projectPath,
      screenshotSessionRestore,
      isLeftPanelOpen,
      isRightPanelOpen,
      rightPanelMode,
      setIsLeftPanelOpen,
      setIsRightPanelOpen,
      setRightPanelMode,
      loadGalleryItems,
      handleScreenshotCapture,
    ],
  );

  const closeScreenshotGallery = useCallback(() => {
    setIsScreenshotGalleryOpen(false);
    if (screenshotSessionRestore) {
      setIsLeftPanelOpen(screenshotSessionRestore.leftOpen);
      setIsRightPanelOpen(screenshotSessionRestore.rightOpen);
      setRightPanelMode(screenshotSessionRestore.rightMode);
      setScreenshotSessionRestore(null);
      return;
    }
    setRightPanelMode("inspector");
  }, [
    screenshotSessionRestore,
    setIsLeftPanelOpen,
    setIsRightPanelOpen,
    setRightPanelMode,
  ]);

  useEffect(() => {
    if (rightPanelMode === "gallery" && !isRightPanelOpen) {
      closeScreenshotGallery();
    }
  }, [rightPanelMode, isRightPanelOpen, closeScreenshotGallery]);

  useEffect(() => {
    if (isScreenshotGalleryOpen) {
      void loadGalleryItems();
    }
  }, [isScreenshotGalleryOpen, loadGalleryItems]);

  useEffect(() => {
    if (!isScreenshotGalleryOpen && rightPanelMode === "gallery") {
      setRightPanelMode("inspector");
    }
  }, [isScreenshotGalleryOpen, rightPanelMode, setRightPanelMode]);

  useEffect(() => {
    if (!showScreenshotFeatures) {
      if (isScreenshotGalleryOpen) {
        setIsScreenshotGalleryOpen(false);
      }
      if (rightPanelMode === "gallery") {
        setRightPanelMode("inspector");
      }
    }
  }, [
    showScreenshotFeatures,
    isScreenshotGalleryOpen,
    rightPanelMode,
    setRightPanelMode,
  ]);

  const handleOpenScreenshotItem = useCallback(
    async (item: ScreenshotMetadata) => {
      if (!item.slidePath) return;
      setPreviewMode("preview");
      setInteractionMode("preview");
      setSelectedId(null);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
      setPreviewNavigationFile(item.slidePath);
      pendingPopupOpenRef.current = {
        selector: item.popupSelector,
        popupId: item.popupId,
      };
      window.setTimeout(() => {
        if (!pendingPopupOpenRef.current) return;
        const success = openPopupInPreview(
          pendingPopupOpenRef.current.selector,
          pendingPopupOpenRef.current.popupId,
        );
        if (success) {
          pendingPopupOpenRef.current = null;
        }
      }, 700);
    },
    [
      setPreviewMode,
      setInteractionMode,
      setSelectedId,
      setPreviewSelectedPath,
      setPreviewSelectedElement,
      setPreviewSelectedComputedStyles,
      setPreviewNavigationFile,
      pendingPopupOpenRef,
      openPopupInPreview,
    ],
  );

  const handleDeleteScreenshotItem = useCallback(
    async (item: ScreenshotMetadata) => {
      if (!projectPath) return;
      const nextItems = await deleteScreenshotItem({
        projectPath,
        item,
        screenshotItems,
        writeScreenshotIndex,
      });
      setScreenshotItems(nextItems);
      setScreenshotPreviewUrls((prev) => {
        const next = { ...prev };
        if (next[item.id]) {
          URL.revokeObjectURL(next[item.id]);
          delete next[item.id];
        }
        return next;
      });
    },
    [projectPath, screenshotItems, writeScreenshotIndex],
  );

  const handleRevealScreenshotsFolder = useCallback(async () => {
    try {
      await revealScreenshotsFolder(resolveScreenshotDir());
    } catch (error) {
      console.warn("Failed to open screenshots folder:", error);
    }
  }, [resolveScreenshotDir]);

  const handleExportEditablePdf = useCallback(async () => {
    if (!projectPath || isPdfExporting) return;
    setIsPdfExporting(true);
    setPdfExportLogs(["Starting editable PDF export..."]);
    try {
      const nextLogs = await exportEditablePdf({
        projectPath,
        ensureDirectoryTree,
        resolvePdfExportDir,
      });
      setPdfExportLogs((prev) => [...prev, ...nextLogs]);
    } catch (error) {
      console.error("Editable PDF export failed:", error);
      setPdfExportLogs((prev) => [
        ...prev,
        "Export failed. Check console for details.",
      ]);
    } finally {
      setIsPdfExporting(false);
    }
  }, [projectPath, isPdfExporting, ensureDirectoryTree, resolvePdfExportDir]);

  const clearPdfExportLogs = useCallback(() => {
    setPdfExportLogs([]);
  }, []);

  useEffect(() => {
    return () => {
      setScreenshotPreviewUrls((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
    };
  }, []);

  return {
    isScreenshotGalleryOpen,
    screenshotItems,
    screenshotPreviewUrls,
    screenshotCaptureBusy,
    pdfExportLogs,
    isPdfExporting,
    loadGalleryItems,
    openScreenshotGallery,
    closeScreenshotGallery,
    handleScreenshotCapture,
    handleOpenScreenshotItem,
    handleDeleteScreenshotItem,
    handleRevealScreenshotsFolder,
    handleExportEditablePdf,
    clearPdfExportLogs,
  };
};
