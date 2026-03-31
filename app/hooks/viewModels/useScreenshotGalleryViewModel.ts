import { useMemo } from "react";
import type React from "react";
import ScreenshotGalleryPanel from "../../ui/ScreenshotGalleryPanel";
import type { ScreenshotMetadata } from "../../helpers/screenshotWorkspace";

type UseScreenshotGalleryViewModelOptions = {
  isFloatingPanels: boolean;
  isPanelsSwapped: boolean;
  isResizingRightPanel: boolean;
  isDraggingRightPanel: boolean;
  isCodePanelOpen: boolean;
  isRightPanelOpen: boolean;
  rightPanelFloatingPosition: {
    left: number;
    top: number;
  };
  theme: "dark" | "light";
  rightPanelMode: "inspector" | "gallery";
  projectPath: string | null;
  screenshotCaptureBusy: boolean;
  screenshotItems: ScreenshotMetadata[];
  screenshotPreviewUrls: Record<string, string>;
  isPdfExporting: boolean;
  pdfExportLogs: string[];
  handleRightPanelDragStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  closeScreenshotGallery: () => void;
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRightPanelMode: React.Dispatch<
    React.SetStateAction<"inspector" | "gallery">
  >;
  loadGalleryItems: () => Promise<unknown>;
  handleScreenshotCapture: () => Promise<void>;
  handleRevealScreenshotsFolder: () => Promise<void>;
  handleOpenScreenshotItem: (item: ScreenshotMetadata) => Promise<void>;
  handleDeleteScreenshotItem: (item: ScreenshotMetadata) => Promise<void>;
  handleExportEditablePdf: () => Promise<void>;
};

export const useScreenshotGalleryViewModel = ({
  isFloatingPanels,
  isPanelsSwapped,
  isResizingRightPanel,
  isDraggingRightPanel,
  isCodePanelOpen,
  isRightPanelOpen,
  rightPanelFloatingPosition,
  theme,
  rightPanelMode,
  projectPath,
  screenshotCaptureBusy,
  screenshotItems,
  screenshotPreviewUrls,
  isPdfExporting,
  pdfExportLogs,
  handleRightPanelDragStart,
  closeScreenshotGallery,
  setIsRightPanelOpen,
  setRightPanelMode,
  loadGalleryItems,
  handleScreenshotCapture,
  handleRevealScreenshotsFolder,
  handleOpenScreenshotItem,
  handleDeleteScreenshotItem,
  handleExportEditablePdf,
}: UseScreenshotGalleryViewModelOptions): React.ComponentProps<
  typeof ScreenshotGalleryPanel
> =>
  useMemo(
    () => ({
      shellState: {
        isFloatingPanels,
        isPanelsSwapped,
        isResizingRightPanel,
        isDraggingRightPanel,
        isCodePanelOpen,
        isRightPanelOpen,
        rightPanelFloatingPosition,
        theme,
        rightPanelMode,
        projectPath,
      },
      galleryState: {
        screenshotCaptureBusy,
        screenshotItems,
        screenshotPreviewUrls,
        isPdfExporting,
        pdfExportLogs,
      },
      actions: {
        onRightPanelDragStart: handleRightPanelDragStart,
        onCloseGallery: closeScreenshotGallery,
        onCollapsePanel: () => {
          setIsRightPanelOpen(false);
          setRightPanelMode("inspector");
        },
        onRefreshGallery: () => void loadGalleryItems(),
        onCaptureScreenshot: () => void handleScreenshotCapture(),
        onRevealScreenshotsFolder: () => void handleRevealScreenshotsFolder(),
        onOpenScreenshotItem: (item: ScreenshotMetadata) =>
          void handleOpenScreenshotItem(item),
        onDeleteScreenshotItem: (item: ScreenshotMetadata) =>
          void handleDeleteScreenshotItem(item),
        onExportEditablePdf: () => void handleExportEditablePdf(),
      },
    }),
    [
      isFloatingPanels,
      isPanelsSwapped,
      isResizingRightPanel,
      isDraggingRightPanel,
      isCodePanelOpen,
      isRightPanelOpen,
      rightPanelFloatingPosition,
      theme,
      rightPanelMode,
      projectPath,
      screenshotCaptureBusy,
      screenshotItems,
      screenshotPreviewUrls,
      isPdfExporting,
      pdfExportLogs,
      handleRightPanelDragStart,
      closeScreenshotGallery,
      setIsRightPanelOpen,
      setRightPanelMode,
      loadGalleryItems,
      handleScreenshotCapture,
      handleRevealScreenshotsFolder,
      handleOpenScreenshotItem,
      handleDeleteScreenshotItem,
      handleExportEditablePdf,
    ],
  );
