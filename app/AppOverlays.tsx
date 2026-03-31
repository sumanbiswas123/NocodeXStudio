import React from "react";
import { PanelRight, PanelRightClose } from "lucide-react";
import DetachedCodeEditorWindow from "../components/DetachedCodeEditorWindow";
import ConfigEditorModal from "../components/ConfigEditorModal";
import ColorCodeEditor from "../components/ColorCodeEditor";
import type { CodeLanguage } from "../components/ColorCodeEditor";
import { FileMap } from "../types";
import {
  PANEL_SIDE_STORAGE_KEY,
  PREVIEW_AUTOSAVE_STORAGE_KEY,
  isSvgPath,
} from "./appHelpers";

type AppOverlaysProps = {
  theme: "light" | "dark";
  isFloatingPanels: boolean;
  isZenMode: boolean;
  isCodePanelOpen: boolean;
  setIsCodePanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRightPanelOpen: boolean;
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  rightPanelMode: "inspector" | "gallery";
  setRightPanelMode: React.Dispatch<
    React.SetStateAction<"inspector" | "gallery">
  >;
  isCompactConsoleOpening: boolean;
  previewConsoleErrorCount: number;
  handleOpenDetachedConsole: () => void;
  isConfigModalOpen: boolean;
  setIsConfigModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  configModalInitialTab: "references" | "slides" | "configRaw" | "general";
  isConfigModalSlidesOnly: boolean;
  files: FileMap;
  configPathForModal: string;
  portfolioPathForModal: string;
  handleSaveConfig: (
    newConfigContent: string,
    newPortfolioContent: string,
  ) => Promise<void>;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  panelSide: "default" | "swapped";
  setPanelSide: React.Dispatch<React.SetStateAction<"default" | "swapped">>;
  projectPath: string | null;
  selectedFolderCloneSource: string | null;
  setSelectedFolderCloneSource: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  isDetachedEditorOpen: boolean;
  closeCodePanel: () => void;
  activeDetachedEditorFilePath: string | null;
  activeDetachedEditorContent: string;
  activeDetachedEditorIsDirty: boolean;
  handleDetachedEditorSelectFile: (path: string) => void;
  handleDetachedEditorChange: (value: string) => void;
  detachedEditorIsTextEditable: boolean;
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
  isPdfExporting: boolean;
  pdfExportLogs: string[];
  clearPdfExportLogs: () => void;
  activeCodeContent: string;
  handleCodeDraftChange: (value: string) => void;
  activeCodeFilePath: string | null;
  saveCodeDraftsRef: React.MutableRefObject<(() => Promise<void>) | null>;
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
  theme,
  isFloatingPanels,
  isZenMode,
  isCodePanelOpen,
  setIsCodePanelOpen,
  isRightPanelOpen,
  setIsRightPanelOpen,
  rightPanelMode,
  setRightPanelMode,
  isCompactConsoleOpening,
  previewConsoleErrorCount,
  handleOpenDetachedConsole,
  isConfigModalOpen,
  setIsConfigModalOpen,
  configModalInitialTab,
  isConfigModalSlidesOnly,
  files,
  configPathForModal,
  portfolioPathForModal,
  handleSaveConfig,
  autoSaveEnabled,
  setAutoSaveEnabled,
  panelSide,
  setPanelSide,
  projectPath,
  selectedFolderCloneSource,
  setSelectedFolderCloneSource,
  isDetachedEditorOpen,
  closeCodePanel,
  activeDetachedEditorFilePath,
  activeDetachedEditorContent,
  activeDetachedEditorIsDirty,
  handleDetachedEditorSelectFile,
  handleDetachedEditorChange,
  detachedEditorIsTextEditable,
  saveCodeDraftAtPath,
  loadFileContent,
  setCodeDraftByPath,
  setCodeDirtyPathSet,
  isPdfExporting,
  pdfExportLogs,
  clearPdfExportLogs,
  activeCodeContent,
  handleCodeDraftChange,
  activeCodeFilePath,
  saveCodeDraftsRef,
}) => {
  const isRightInspectorMode = rightPanelMode === "inspector";

  return (
    <>
      <div
        className={`absolute z-50 no-scrollbar transition-all duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) ${isFloatingPanels ? "right-10 top-24 bottom-3" : "right-0 top-0 bottom-0"} ${isZenMode ? "opacity-0 pointer-events-none" : ""} ${isCodePanelOpen ? "animate-panelInRight" : ""}`}
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
          className={`h-full min-h-full relative flex flex-col overflow-hidden ${
            isFloatingPanels ? "rounded-2xl overflow-hidden" : ""
          }`}
          style={{
            background:
              theme === "dark"
                ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.82) 100%)",
            backdropFilter: "none",
          }}
        >
          <div
            className="h-11 shrink-0 px-3 flex items-center justify-between"
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
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: theme === "dark" ? "#c4b5fd" : "#7c3aed",
                  boxShadow:
                    theme === "dark"
                      ? "0 0 10px rgba(196,181,253,0.85)"
                      : "0 0 10px rgba(124,58,237,0.55)",
                }}
              />
              <span
                className="text-[11px] uppercase tracking-[0.2em] font-semibold"
                style={{ color: theme === "dark" ? "#e9d5ff" : "#5b21b6" }}
              >
                Code Studio
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-violet-500/15"
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
                className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-violet-500/15"
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
                className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-violet-500/15"
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
          <div className="min-h-0 flex-1 overflow-hidden">
            <ColorCodeEditor
              value={activeCodeContent}
              onChange={handleCodeDraftChange}
              language={getCodeLanguage(activeCodeFilePath)}
              theme={theme}
              minHeight="100%"
              readOnly={!activeCodeFilePath}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              boxShadow:
                theme === "dark"
                  ? "inset 0 0 0 1px rgba(196,181,253,0.2)"
                  : "inset 0 0 0 1px rgba(139,92,246,0.2)",
            }}
          />
        </div>
      </div>

      {!isRightPanelOpen && isRightInspectorMode && !isZenMode && !isCodePanelOpen ? (
        <div
          className="fixed z-[95] transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            right: "1rem",
            top: "1rem",
            opacity: 1,
            transform: "translateY(0)",
          }}
        >
          <button
            type="button"
            className="h-12 px-3 rounded-2xl border flex items-center justify-center gap-2 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.18)]"
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
              className="text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: theme === "dark" ? "#a5f3fc" : "#0e7490" }}
            >
              Show
            </span>
          </button>
        </div>
      ) : null}

      <div
        className={`fixed z-[100] transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-visible ${isZenMode || isCodePanelOpen ? "translate-y-6 opacity-0 pointer-events-none" : ""}`}
        style={{
          left: "1rem",
          bottom: "1rem",
        }}
      >
        <button
          type="button"
          className={`relative z-10 h-14 w-14 rounded-full transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden flex items-center justify-center ${isCompactConsoleOpening ? "animate-compactConsoleOpen" : ""} ${theme === "dark" ? "hover:bg-white/5" : "hover:bg-black/5"}`}
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
            className="shrink-0"
            style={{ color: theme === "dark" ? "#67e8f9" : "#0891b2" }}
          />
          {previewConsoleErrorCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] leading-[18px] justify-center">
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

      {(isPdfExporting || pdfExportLogs.length > 0) && (
        <div
          className="fixed right-6 bottom-6 z-[1200] w-[320px] rounded-2xl border shadow-2xl p-3 text-xs"
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
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.2em] font-semibold opacity-70">
              PDF Export
            </div>
            {pdfExportLogs.length > 0 && (
              <button
                type="button"
                className="text-[10px] font-semibold opacity-70 hover:opacity-100"
                onClick={clearPdfExportLogs}
              >
                Close
              </button>
            )}
          </div>
          <div className="mt-2 space-y-1 max-h-32 overflow-auto">
            {pdfExportLogs.length === 0 ? (
              <div className="opacity-70">Exporting...</div>
            ) : (
              pdfExportLogs.slice(-6).map((log, index) => (
                <div key={`${index}-${log}`} className="opacity-80">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AppOverlays;
