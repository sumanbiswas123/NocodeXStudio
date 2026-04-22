import React from "react";
import { CheckCircle2, PanelRight, PanelRightClose, X } from "lucide-react";
import DetachedCodeEditorWindow from "../../components/DetachedCodeEditorWindow";
import ConfigEditorModal from "../../components/ConfigEditorModal";
import ColorCodeEditor from "../../components/ColorCodeEditor";
import type { CodeLanguage } from "../../components/ColorCodeEditor";
import AiAssistantPanel from "./AiAssistantPanel";
import { FileMap } from "../../types";
import type { PdfAnnotationUiRecord } from "../helpers/pdfAnnotationHelpers";
import type { AiAssistantMessage } from "../hooks/workflow/useAiAssistant";
import type {
  AgentRunResponse,
  AssistantMode,
  SidecarModelStatus,
  SidecarProgressEvent,
} from "../runtime/sidecarClient";
import { AI_ASSISTANT_ENABLED } from "../runtime/featureFlags";
import {
  PANEL_SIDE_STORAGE_KEY,
  PREVIEW_AUTOSAVE_STORAGE_KEY,
  isSvgPath,
} from "../helpers/appHelpers";
import "../styles/ui/app-overlays.css";

type AppOverlaysProps = {
  shellState: {
    theme: "light" | "dark";
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
  };
  configState: {
    files: FileMap;
    annotationRecords: PdfAnnotationUiRecord[];
    configPathForModal: string;
    portfolioPathForModal: string;
  };
  editorState: {
    isDetachedEditorOpen: boolean;
    activeDetachedEditorFilePath: string | null;
    activeDetachedEditorContent: string;
    activeDetachedEditorIsDirty: boolean;
    detachedEditorIsTextEditable: boolean;
    activeCodeContent: string;
    activeCodeFilePath: string | null;
    isPdfExporting: boolean;
    pdfExportLogs: string[];
    saveToastMessage: string | null;
    saveCodeDraftsRef: React.MutableRefObject<(() => Promise<void>) | null>;
  };
  actions: {
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
    clearSaveToast: () => void;
    handleCodeDraftChange: (value: string) => void;
    setAiAssistantMode: React.Dispatch<React.SetStateAction<AssistantMode>>;
    setAiAssistantInput: React.Dispatch<React.SetStateAction<string>>;
    setAiAssistantOpen: React.Dispatch<React.SetStateAction<boolean>>;
    submitAiAssistantPrompt: () => Promise<void>;
    cancelAiAssistantPrompt: () => Promise<void>;
    stageAiAssistantResponse: (messageId: string, response: AgentRunResponse) => void;
  };
};

const getCodeLanguage = (path: string | null): CodeLanguage => {
  if (!path) return "text";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".svg")) return "svg";
  return "text";
};

const AppOverlays: React.FC<AppOverlaysProps> = ({
  shellState,
  configState,
  editorState,
  actions,
}) => {
  const {
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
  } = shellState;
  const { files, annotationRecords, configPathForModal, portfolioPathForModal } = configState;
  const {
    isDetachedEditorOpen,
    activeDetachedEditorFilePath,
    activeDetachedEditorContent,
    activeDetachedEditorIsDirty,
    detachedEditorIsTextEditable,
    activeCodeContent,
    activeCodeFilePath,
    isPdfExporting,
    pdfExportLogs,
    saveToastMessage,
    saveCodeDraftsRef,
  } = editorState;
  const {
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
    clearSaveToast,
    handleCodeDraftChange,
    setAiAssistantMode,
    setAiAssistantInput,
    setAiAssistantOpen,
    submitAiAssistantPrompt,
    cancelAiAssistantPrompt,
    stageAiAssistantResponse,
  } = actions;

  const isRightInspectorMode = rightPanelMode === "inspector";

  return (
    <>
      <div
        className={`code-panel-overlay ${isFloatingPanels ? "code-panel-overlay--floating" : "code-panel-overlay--docked"} ${isCodePanelOpen ? "animate-panelInRight" : ""}`}
        style={{
          transform: isCodePanelOpen
            ? "translateX(0)"
            : isFloatingPanels
              ? "translateX(calc(100% + 2.5rem))"
              : "translateX(100%)",
          width: isFloatingPanels
            ? "min(42rem, calc(100vw - 6rem))"
            : "620px",
          borderRadius: isFloatingPanels ? "1rem" : undefined,
          border: isFloatingPanels
            ? theme === "light"
              ? "1px solid rgba(15, 23, 42, 0.18)"
              : "1px solid rgba(255, 255, 255, 0.24)"
            : undefined,
          background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
          overflow: "hidden",
        }}
      >
        <div
          className={`code-panel-surface ${isFloatingPanels ? "code-panel-surface--floating" : ""}`}
          style={{
            background:
              theme === "dark"
                ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.82) 100%)",
            backdropFilter: "none",
          }}
        >
          <div
            className="code-panel-header"
            style={{
              borderBottom:
                theme === "dark"
                  ? "1px solid rgba(148,163,184,0.28)"
                  : "1px solid rgba(0,0,0,0.1)",
              background:
                theme === "dark"
                  ? "linear-gradient(90deg, rgba(139,92,246,0.2), rgba(99,102,241,0.16), rgba(15,23,42,0.0))"
                : "linear-gradient(90deg,rgba(139,92,246,0.12),rgba(99,102,241,0.1),transparent)",
            }}
          >
            <div className="code-panel-header-brand">
              <div
                className="code-panel-header-indicator"
                style={{
                  backgroundColor: theme === "dark" ? "#c4b5fd" : "#7c3aed",
                  boxShadow:
                    theme === "dark"
                      ? "0 0 10px rgba(196,181,253,0.85)"
                      : "0 0 10px rgba(124,58,237,0.55)",
                }}
              />
              <span
                className="code-panel-header-title"
                style={{ color: theme === "dark" ? "#e9d5ff" : "#5b21b6" }}
              >
                Code Studio
              </span>
            </div>
            <div className="code-panel-header-actions">
              <button
                type="button"
                className="code-panel-action-button code-panel-action-button--text"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={() => {
                  if (!activeCodeFilePath) return;
                  void saveCodeDraftAtPath(activeCodeFilePath);
                }}
              >
                Save File
              </button>
              <button
                type="button"
                className="code-panel-action-button code-panel-action-button--text"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={() => {
                  void saveCodeDraftsRef.current?.();
                }}
              >
                Save All
              </button>
              <button
                type="button"
                className="code-panel-action-button code-panel-action-button--icon"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={closeCodePanel}
                title="Close code panel"
              >
                <PanelRightClose size={14} />
              </button>
            </div>
          </div>
          <div className="code-panel-editor-region">
            <ColorCodeEditor
              value={activeCodeContent}
              onChange={handleCodeDraftChange}
              language={getCodeLanguage(activeCodeFilePath)}
              theme={theme}
              minHeight="100%"
              wrap="off"
              fontSize="13px"
              readOnly={!activeCodeFilePath}
            />
          </div>
          <div
            className="code-panel-frame"
            style={{
              boxShadow:
                theme === "dark"
                  ? "inset 0 0 0 1px rgba(196,181,253,0.2)"
                  : "inset 0 0 0 1px rgba(139,92,246,0.2)",
            }}
          />
        </div>
      </div>

      {!isRightPanelOpen && isRightInspectorMode && !isCodePanelOpen ? (
        <div
          className="right-inspector-toggle"
          style={{
            opacity: 1,
            transform: "translateY(0)",
          }}
        >
          <button
            type="button"
            className="right-inspector-toggle-button"
            style={{
              background:
                theme === "light"
                  ? "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)"
                  : "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(15,23,42,0.9) 100%)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 8px 20px rgba(15,23,42,0.14)",
              color: "var(--text-muted)",
            }}
            onClick={() => {
              setRightPanelMode("inspector");
              setIsRightPanelOpen(true);
              setIsCodePanelOpen(false);
            }}
            title="Show right inspector"
          >
            <PanelRight
              size={16}
              style={{
                color: theme === "dark" ? "#67e8f9" : "#0891b2",
                transform: "scaleX(-1)",
              }}
            />
            <span
              className="right-inspector-toggle-label"
              style={{ color: theme === "dark" ? "#a5f3fc" : "#0e7490" }}
            >
              Show
            </span>
          </button>
        </div>
      ) : null}

      <div
        className={`console-launcher ${isCodePanelOpen ? "console-launcher--hidden" : ""}`}
      >
        <button
          type="button"
          className={`console-launcher-button ${isCompactConsoleOpening ? "console-launcher-button--opening" : ""} ${theme === "dark" ? "console-launcher-button--dark" : "console-launcher-button--light"}`}
          style={{
            background:
              theme === "light"
                ? "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)"
                : "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(15,23,42,0.9) 100%)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 8px 20px rgba(15,23,42,0.2)",
            color: "var(--text-muted)",
          }}
          onClick={() => {
            handleOpenDetachedConsole();
          }}
          title="Open console in a separate window"
        >
          <PanelRight
            size={18}
            className="console-launcher-icon"
            style={{ color: theme === "dark" ? "#67e8f9" : "#0891b2" }}
          />
          {previewConsoleErrorCount > 0 && (
            <span className="console-launcher-badge">
              {previewConsoleErrorCount}
            </span>
          )}
        </button>
      </div>

      <ConfigEditorModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        initialTab={configModalInitialTab}
        slidesOnlyMode={isConfigModalSlidesOnly}
        configContent={(files[configPathForModal]?.content as string) || null}
        portfolioContent={
          (files[portfolioPathForModal]?.content as string) || null
        }
        onSave={handleSaveConfig}
        theme={theme}
        autoSaveEnabled={autoSaveEnabled}
        onAutoSaveChange={(val) => {
          setAutoSaveEnabled(val);
          localStorage.setItem(PREVIEW_AUTOSAVE_STORAGE_KEY, val ? "1" : "0");
        }}
        panelSide={panelSide}
        onPanelSideChange={(val) => {
          setPanelSide(val);
          localStorage.setItem(PANEL_SIDE_STORAGE_KEY, val);
        }}
        hasProjectConfig={Boolean(projectPath)}
        selectedSlideCloneSource={selectedFolderCloneSource}
        onSelectSlideCloneSource={setSelectedFolderCloneSource}
        files={files}
        annotationRecords={annotationRecords}
      />

      <DetachedCodeEditorWindow
        isOpen={isDetachedEditorOpen}
        onClose={closeCodePanel}
        theme={theme}
        files={files}
        activeFilePath={activeDetachedEditorFilePath}
        content={activeDetachedEditorContent}
        isDirty={activeDetachedEditorIsDirty}
        onSelectFile={handleDetachedEditorSelectFile}
        onChange={handleDetachedEditorChange}
        onSave={() => {
          if (!activeDetachedEditorFilePath || !detachedEditorIsTextEditable) {
            return;
          }
          void saveCodeDraftAtPath(activeDetachedEditorFilePath);
        }}
        onReload={() => {
          if (!activeDetachedEditorFilePath || !detachedEditorIsTextEditable) {
            return;
          }
          if (isSvgPath(activeDetachedEditorFilePath)) {
            handleDetachedEditorSelectFile(activeDetachedEditorFilePath);
            return;
          }
          void loadFileContent(activeDetachedEditorFilePath, {
            persistToState: true,
          });
          setCodeDraftByPath((prev) => {
            const next = { ...prev };
            delete next[activeDetachedEditorFilePath];
            return next;
          });
          setCodeDirtyPathSet((prev) => {
            const next = { ...prev };
            delete next[activeDetachedEditorFilePath];
            return next;
          });
        }}
        isTextEditable={detachedEditorIsTextEditable}
      />

      {AI_ASSISTANT_ENABLED ? (
        <AiAssistantPanel
          currentSlideLabel={aiAssistantCurrentSlideLabel}
          hasProject={aiAssistantHasProject}
          assistantMode={aiAssistantMode}
          input={aiAssistantInput}
          isOpen={aiAssistantOpen}
          isSubmitting={aiAssistantSubmitting}
          messages={aiAssistantMessages}
          modelStatus={aiAssistantModelStatus}
          progress={aiAssistantProgress}
          setAssistantMode={actions.setAiAssistantMode}
          setInput={setAiAssistantInput}
          setIsOpen={setAiAssistantOpen}
          stageResponse={stageAiAssistantResponse}
          submitPrompt={submitAiAssistantPrompt}
          cancelPrompt={cancelAiAssistantPrompt}
          theme={theme}
        />
      ) : null}

      {(isPdfExporting || pdfExportLogs.length > 0) && (
        <div
          className="pdf-export-toast"
          style={{
            background:
              theme === "dark"
                ? "rgba(15,23,42,0.92)"
                : "rgba(255,255,255,0.95)",
            borderColor:
              theme === "dark"
                ? "rgba(148,163,184,0.35)"
                : "rgba(15,23,42,0.15)",
            color: theme === "dark" ? "#e2e8f0" : "#0f172a",
          }}
        >
          <div className="pdf-export-toast-header">
            <div className="pdf-export-toast-title">
              PDF Export
            </div>
            {pdfExportLogs.length > 0 && (
              <button
                type="button"
                className="pdf-export-toast-close"
                onClick={clearPdfExportLogs}
              >
                Close
              </button>
            )}
          </div>
          <div className="pdf-export-toast-log-list">
            {pdfExportLogs.length === 0 ? (
              <div className="pdf-export-toast-status">Exporting...</div>
            ) : (
              pdfExportLogs.slice(-6).map((log, index) => (
                <div key={`${index}-${log}`} className="pdf-export-toast-log">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {saveToastMessage ? (
        <div
          className="save-toast"
          style={{
            background:
              theme === "dark"
                ? "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(6,78,59,0.9) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.98) 100%)",
            borderColor:
              theme === "dark"
                ? "rgba(110,231,183,0.34)"
                : "rgba(5,150,105,0.22)",
            color: theme === "dark" ? "#ecfdf5" : "#064e3b",
          }}
        >
          <div className="save-toast-accent" />
          <div className="save-toast-header">
            <div className="save-toast-heading">
              <span className="save-toast-icon">
                <CheckCircle2 size={18} />
              </span>
              <div className="save-toast-copy">
                <div className="save-toast-title">Changes Saved</div>
                <div className="save-toast-message">{saveToastMessage}</div>
              </div>
            </div>
            <button
              type="button"
              className="save-toast-close"
              onClick={clearSaveToast}
              aria-label="Close save toast"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default AppOverlays;


