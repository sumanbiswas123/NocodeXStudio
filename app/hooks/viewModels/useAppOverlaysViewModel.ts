import { useMemo } from "react";
import type React from "react";
import AppOverlays from "../../ui/AppOverlays";
import type { FileMap } from "../../../types";

type UseAppOverlaysViewModelOptions = {
  theme: "dark" | "light";
  isFloatingPanels: boolean;
  isCodePanelOpen: boolean;
  isRightPanelOpen: boolean;
  rightPanelMode: "inspector" | "gallery";
  isCompactConsoleOpening: boolean;
  previewConsoleErrorCount: number;
  isConfigModalOpen: boolean;
  configModalInitialTab: "references" | "slides" | "configRaw" | "general";
  isConfigModalSlidesOnly: boolean;
  autoSaveEnabled: boolean;
  panelSide: "default" | "swapped";
  projectPath: string | null;
  selectedFolderCloneSource: string | null;
  files: FileMap;
  configPathForModal: string;
  portfolioPathForModal: string;
  isDetachedEditorOpen: boolean;
  activeDetachedEditorFilePath: string | null;
  activeDetachedEditorContent: string;
  activeDetachedEditorIsDirty: boolean;
  detachedEditorIsTextEditable: boolean;
  activeCodeContent: string;
  activeCodeFilePath: string | null;
  isPdfExporting: boolean;
  pdfExportLogs: string[];
  saveCodeDraftsRef: React.MutableRefObject<(() => Promise<void>) | null>;
  setIsCodePanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRightPanelMode: React.Dispatch<
    React.SetStateAction<"inspector" | "gallery">
  >;
  handleOpenDetachedConsole: () => void;
  setIsConfigModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleSaveConfig: (
    newConfigContent: string,
    newPortfolioContent: string,
  ) => Promise<void>;
  setAutoSaveEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setPanelSide: React.Dispatch<React.SetStateAction<"default" | "swapped">>;
  setSelectedFolderCloneSource: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  closeCodePanel: () => void;
  handleDetachedEditorSelectFile: (path: string) => void;
  handleDetachedEditorChange: (value: string) => void;
  saveCodeDraftAtPath: (path: string) => Promise<void>;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  setCodeDraftByPath: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  setCodeDirtyPathSet: React.Dispatch<
    React.SetStateAction<Record<string, true>>
  >;
  clearPdfExportLogs: () => void;
  handleCodeDraftChange: (value: string) => void;
};

export const useAppOverlaysViewModel = ({
  theme,
  isFloatingPanels,
  isCodePanelOpen,
  isRightPanelOpen,
  rightPanelMode,
  isCompactConsoleOpening,
  previewConsoleErrorCount,
  isConfigModalOpen,
  configModalInitialTab,
  isConfigModalSlidesOnly,
  autoSaveEnabled,
  panelSide,
  projectPath,
  selectedFolderCloneSource,
  files,
  configPathForModal,
  portfolioPathForModal,
  isDetachedEditorOpen,
  activeDetachedEditorFilePath,
  activeDetachedEditorContent,
  activeDetachedEditorIsDirty,
  detachedEditorIsTextEditable,
  activeCodeContent,
  activeCodeFilePath,
  isPdfExporting,
  pdfExportLogs,
  saveCodeDraftsRef,
  setIsCodePanelOpen,
  setIsRightPanelOpen,
  setRightPanelMode,
  handleOpenDetachedConsole,
  setIsConfigModalOpen,
  handleSaveConfig,
  setAutoSaveEnabled,
  setPanelSide,
  setSelectedFolderCloneSource,
  closeCodePanel,
  handleDetachedEditorSelectFile,
  handleDetachedEditorChange,
  saveCodeDraftAtPath,
  loadFileContent,
  setCodeDraftByPath,
  setCodeDirtyPathSet,
  clearPdfExportLogs,
  handleCodeDraftChange,
}: UseAppOverlaysViewModelOptions): React.ComponentProps<typeof AppOverlays> =>
  useMemo(
    () => ({
      shellState: {
        theme,
        isFloatingPanels,
        isCodePanelOpen,
        isRightPanelOpen,
        rightPanelMode,
        isCompactConsoleOpening,
        previewConsoleErrorCount,
        isConfigModalOpen,
        configModalInitialTab,
        isConfigModalSlidesOnly,
        autoSaveEnabled,
        panelSide,
        projectPath,
        selectedFolderCloneSource,
      },
      configState: {
        files,
        configPathForModal,
        portfolioPathForModal,
      },
      editorState: {
        isDetachedEditorOpen,
        activeDetachedEditorFilePath,
        activeDetachedEditorContent,
        activeDetachedEditorIsDirty,
        detachedEditorIsTextEditable,
        activeCodeContent,
        activeCodeFilePath,
        isPdfExporting,
        pdfExportLogs,
        saveCodeDraftsRef,
      },
      actions: {
        setIsCodePanelOpen,
        setIsRightPanelOpen,
        setRightPanelMode,
        handleOpenDetachedConsole,
        setIsConfigModalOpen,
        handleSaveConfig,
        setAutoSaveEnabled,
        setPanelSide,
        setSelectedFolderCloneSource,
        closeCodePanel,
        handleDetachedEditorSelectFile,
        handleDetachedEditorChange,
        saveCodeDraftAtPath,
        loadFileContent,
        setCodeDraftByPath,
        setCodeDirtyPathSet,
        clearPdfExportLogs,
        handleCodeDraftChange,
      },
    }),
    [
      theme,
      isFloatingPanels,
      isCodePanelOpen,
      isRightPanelOpen,
      rightPanelMode,
      isCompactConsoleOpening,
      previewConsoleErrorCount,
      isConfigModalOpen,
      configModalInitialTab,
      isConfigModalSlidesOnly,
      autoSaveEnabled,
      panelSide,
      projectPath,
      selectedFolderCloneSource,
      files,
      configPathForModal,
      portfolioPathForModal,
      isDetachedEditorOpen,
      activeDetachedEditorFilePath,
      activeDetachedEditorContent,
      activeDetachedEditorIsDirty,
      detachedEditorIsTextEditable,
      activeCodeContent,
      activeCodeFilePath,
      isPdfExporting,
      pdfExportLogs,
      saveCodeDraftsRef,
      setIsCodePanelOpen,
      setIsRightPanelOpen,
      setRightPanelMode,
      handleOpenDetachedConsole,
      setIsConfigModalOpen,
      handleSaveConfig,
      setAutoSaveEnabled,
      setPanelSide,
      setSelectedFolderCloneSource,
      closeCodePanel,
      handleDetachedEditorSelectFile,
      handleDetachedEditorChange,
      saveCodeDraftAtPath,
      loadFileContent,
      setCodeDraftByPath,
      setCodeDirtyPathSet,
      clearPdfExportLogs,
      handleCodeDraftChange,
    ],
  );
