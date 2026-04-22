import { useMemo } from "react";
import type React from "react";
import AppOverlays from "../../ui/AppOverlays";
import type { FileMap } from "../../../types";
import type { PdfAnnotationUiRecord } from "../../helpers/pdfAnnotationHelpers";
import type { AiAssistantMessage } from "../workflow/useAiAssistant";
import type {
  AgentRunResponse,
  AssistantMode,
  SidecarModelStatus,
  SidecarProgressEvent,
} from "../../runtime/sidecarClient";

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
  aiAssistantMode: AssistantMode;
  aiAssistantCurrentSlideLabel: string;
  aiAssistantHasProject: boolean;
  aiAssistantInput: string;
  aiAssistantOpen: boolean;
  aiAssistantSubmitting: boolean;
  aiAssistantMessages: AiAssistantMessage[];
  aiAssistantModelStatus: SidecarModelStatus | null;
  aiAssistantProgress: SidecarProgressEvent | null;
  files: FileMap;
  annotationRecords: PdfAnnotationUiRecord[];
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
  setAiAssistantMode: React.Dispatch<React.SetStateAction<AssistantMode>>;
  setAiAssistantInput: React.Dispatch<React.SetStateAction<string>>;
  setAiAssistantOpen: React.Dispatch<React.SetStateAction<boolean>>;
  submitAiAssistantPrompt: () => Promise<void>;
  cancelAiAssistantPrompt: () => Promise<void>;
  stageAiAssistantResponse: (messageId: string, response: AgentRunResponse) => void;
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
  aiAssistantMode,
  aiAssistantCurrentSlideLabel,
  aiAssistantHasProject,
  aiAssistantInput,
  aiAssistantOpen,
  aiAssistantSubmitting,
  aiAssistantMessages,
  aiAssistantModelStatus,
  aiAssistantProgress,
  files,
  annotationRecords,
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
  setAiAssistantMode,
  setAiAssistantInput,
  setAiAssistantOpen,
  submitAiAssistantPrompt,
  cancelAiAssistantPrompt,
  stageAiAssistantResponse,
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
        aiAssistantMode,
        aiAssistantCurrentSlideLabel,
        aiAssistantHasProject,
        aiAssistantInput,
        aiAssistantOpen,
        aiAssistantSubmitting,
        aiAssistantMessages,
        aiAssistantModelStatus,
        aiAssistantProgress,
      },
      configState: {
        files,
        annotationRecords,
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
        setAiAssistantMode,
        setAiAssistantInput,
        setAiAssistantOpen,
        submitAiAssistantPrompt,
        cancelAiAssistantPrompt,
        stageAiAssistantResponse,
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
      aiAssistantMode,
      aiAssistantCurrentSlideLabel,
      aiAssistantHasProject,
      aiAssistantInput,
      aiAssistantOpen,
      aiAssistantSubmitting,
      aiAssistantMessages,
      aiAssistantModelStatus,
      aiAssistantProgress,
      files,
      annotationRecords,
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
      setAiAssistantMode,
      setAiAssistantInput,
      setAiAssistantOpen,
      submitAiAssistantPrompt,
      cancelAiAssistantPrompt,
      stageAiAssistantResponse,
    ],
  );
