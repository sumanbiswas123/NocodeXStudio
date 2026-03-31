import React from "react";
import Sidebar from "../../components/Sidebar";
import type { FileMap, VirtualElement } from "../../types";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";

type LeftSidebarShellProps = {
  activeFile: string | null;
  drawElementTag: string;
  files: FileMap;
  handleCreateFileAtPath: (parentPath: string) => void;
  handleCreateFolderAtPath: (parentPath: string) => void;
  handleChooseFolderCloneSource: () => void;
  handleDeletePath: (path: string, kind: "file" | "folder") => void;
  handleDuplicateFile: (path: string) => void;
  handleLeftPanelResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleLeftPanelStretchToggle: () => void;
  handleOpenConfigModal: () => void;
  handleOpenFolder: (path?: string | null) => Promise<void>;
  handleRenamePath: (path: string) => void;
  handleSelectFile: (path: string) => void;
  handleSidebarAddElement: (type: string) => void;
  handleSidebarAddFontToPresentationCss: (path: string) => void;
  handleSidebarInteractionModeChange: (
    mode: InteractionMode,
  ) => void;
  handleSidebarLoadImage: (path: string) => void;
  handleSidebarSelectElement: (id: string) => void;
  handleUpdateAnimation: (animation: string) => void;
  handleUpdateStyle: (styles: Partial<React.CSSProperties>) => void;
  handlePreviewAnimationUpdateStable: (animation: string) => void;
  handlePreviewStyleUpdateStable: (
    styles: Partial<React.CSSProperties>,
  ) => void;
  interactionMode: InteractionMode;
  isCodePanelOpen: boolean;
  isFloatingPanels: boolean;
  isLeftPanelOpen: boolean;
  isPanelsSwapped: boolean;
  isResizingLeftPanel: boolean;
  leftPanelCollapsedWidth: number;
  openCodePanel: () => void;
  previewMode: "edit" | "preview";
  previewLayerSelectedId: string | null;
  previewSelectedElement: VirtualElement | null;
  previewSyncedFile: string | null;
  projectPath: string | null;
  refreshProjectFiles: () => void;
  root: VirtualElement;
  selectedElement: VirtualElement | null;
  selectedFolderCloneSource: string | null;
  selectedId: string | null;
  setDrawElementTag: React.Dispatch<React.SetStateAction<string>>;
  setIsLeftPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showConfigButton: boolean;
  showMasterTools: boolean;
  sidebarInteractionMode: InteractionMode;
  theme: "dark" | "light";
};

const LeftSidebarShell: React.FC<LeftSidebarShellProps> = ({
  activeFile,
  drawElementTag,
  files,
  handleCreateFileAtPath,
  handleCreateFolderAtPath,
  handleChooseFolderCloneSource,
  handleDeletePath,
  handleDuplicateFile,
  handleLeftPanelResizeStart,
  handleLeftPanelStretchToggle,
  handleOpenConfigModal,
  handleOpenFolder,
  handleRenamePath,
  handleSelectFile,
  handleSidebarAddElement,
  handleSidebarAddFontToPresentationCss,
  handleSidebarInteractionModeChange,
  handleSidebarLoadImage,
  handleSidebarSelectElement,
  handleUpdateAnimation,
  handleUpdateStyle,
  handlePreviewAnimationUpdateStable,
  handlePreviewStyleUpdateStable,
  interactionMode,
  isCodePanelOpen,
  isFloatingPanels,
  isLeftPanelOpen,
  isPanelsSwapped,
  isResizingLeftPanel,
  leftPanelCollapsedWidth,
  openCodePanel,
  previewMode,
  previewLayerSelectedId,
  previewSelectedElement,
  previewSyncedFile,
  projectPath,
  refreshProjectFiles,
  root,
  selectedElement,
  selectedFolderCloneSource,
  selectedId,
  setDrawElementTag,
  setIsLeftPanelOpen,
  showConfigButton,
  showMasterTools,
  sidebarInteractionMode,
  theme,
}) => {
  return (
    <div
      className={`absolute z-40 no-scrollbar ${isResizingLeftPanel ? "" : "transition-all duration-700"} ${isFloatingPanels ? (isPanelsSwapped ? "right-0 top-20" : "left-0 top-20") : isPanelsSwapped ? "right-0 top-0 bottom-0" : "left-0 top-0 bottom-0"} ${isCodePanelOpen ? "opacity-0 pointer-events-none" : ""}`}
      style={{
        transform: isLeftPanelOpen
          ? "translateX(0) scale(1)"
          : isPanelsSwapped
            ? "translateX(8px) scale(0.985)"
            : "translateX(-8px) scale(0.985)",
        width: isLeftPanelOpen
          ? "var(--left-panel-width)"
          : `${leftPanelCollapsedWidth}px`,
        minHeight: isFloatingPanels ? "30vh" : undefined,
        maxHeight: isFloatingPanels
          ? "min(70vh, calc(100vh - 7.5rem))"
          : undefined,
        height: isFloatingPanels
          ? "min(70vh, calc(100vh - 7.5rem))"
          : undefined,
        borderRadius: isFloatingPanels
          ? isPanelsSwapped
            ? "1rem 0 0 1rem"
            : "0 1rem 1rem 0"
          : undefined,
        border: isFloatingPanels
          ? theme === "light"
            ? "1px solid rgba(15, 23, 42, 0.18)"
            : "1px solid rgba(255, 255, 255, 0.25)"
          : undefined,
        background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
        overflowY: "hidden",
        overflowX: "hidden",
        transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        transformOrigin: isPanelsSwapped ? "right center" : "left center",
      }}
    >
      <div
        className={`h-full min-h-full relative flex flex-col overflow-hidden ${
          isFloatingPanels
            ? isPanelsSwapped
              ? "rounded-l-2xl overflow-hidden"
              : "rounded-r-2xl overflow-hidden"
            : ""
        }`}
        style={{
          background:
            theme === "dark"
              ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,250,252,0.74) 100%)",
          backdropFilter: "none",
        }}
      >
        <div className="min-h-0 flex-1">
          <Sidebar
            files={files}
            projectPath={projectPath}
            activeFile={previewSyncedFile ?? activeFile}
            onSelectFile={handleSelectFile}
            onAddFontToPresentationCss={handleSidebarAddFontToPresentationCss}
            onCreateFile={handleCreateFileAtPath}
            onCreateFolder={handleCreateFolderAtPath}
            onRenamePath={handleRenamePath}
            onDeletePath={handleDeletePath}
            onDuplicateFile={handleDuplicateFile}
            onRefreshFiles={refreshProjectFiles}
            onOpenProjectFolder={() => {
              void handleOpenFolder();
            }}
            onOpenCodePanel={openCodePanel}
            selectedFolderCloneSource={selectedFolderCloneSource}
            onChooseFolderCloneSource={handleChooseFolderCloneSource}
            onAddElement={handleSidebarAddElement}
            root={root}
            selectedId={selectedId}
            onSelectElement={handleSidebarSelectElement}
            interactionMode={sidebarInteractionMode}
            setInteractionMode={handleSidebarInteractionModeChange}
            drawElementTag={drawElementTag}
            setDrawElementTag={setDrawElementTag}
            theme={theme}
            showConfigButton={showConfigButton}
            onOpenConfig={handleOpenConfigModal}
            onLoadImage={handleSidebarLoadImage}
            isPanelOpen={isLeftPanelOpen}
            onTogglePanelOpen={setIsLeftPanelOpen}
            showMasterTools={showMasterTools}
            showCollapseControl
            animationElement={
              interactionMode === "preview" && previewSelectedElement
                ? previewSelectedElement
                : selectedElement
            }
            isEditModeActive={
              interactionMode === "edit" ||
              (interactionMode === "preview" && previewMode === "edit")
            }
            onUpdateAnimation={
              interactionMode === "preview" && previewSelectedElement
                ? handlePreviewAnimationUpdateStable
                : handleUpdateAnimation
            }
            onUpdateAnimationStyle={
              interactionMode === "preview" && previewSelectedElement
                ? handlePreviewStyleUpdateStable
                : handleUpdateStyle
            }
          />
        </div>
        <div
          className={`pointer-events-none absolute inset-0 ${isFloatingPanels ? "rounded-r-2xl" : ""}`}
          style={{
            boxShadow:
              theme === "dark"
                ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                : "inset 0 0 0 1px rgba(255,255,255,0.45)",
          }}
        />
      </div>
      {isLeftPanelOpen && (
        <div
          onMouseDown={handleLeftPanelResizeStart}
          onClick={handleLeftPanelStretchToggle}
          className={`absolute top-0 ${isPanelsSwapped ? "left-0" : "right-0"} h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors`}
          title="Resize panel. Click to stretch or shrink"
        />
      )}
    </div>
  );
};

export default LeftSidebarShell;
