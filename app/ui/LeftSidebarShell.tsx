import React from "react";
import Sidebar from "../../components/Sidebar";
import type { FileMap, VirtualElement } from "../../types";
import "../styles/ui/left-sidebar-shell.css";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";

type LeftSidebarShellProps = {
  shellState: {
    isCodePanelOpen: boolean;
    isFloatingPanels: boolean;
    isLeftPanelOpen: boolean;
    isPanelsSwapped: boolean;
    isResizingLeftPanel: boolean;
    leftPanelCollapsedWidth: number;
    showConfigButton: boolean;
    showMasterTools: boolean;
    theme: "dark" | "light";
  };
  sidebarState: {
    activeFile: string | null;
    drawElementTag: string;
    files: FileMap;
    interactionMode: InteractionMode;
    previewMode: "edit" | "preview";
    previewLayerSelectedId: string | null;
    previewSelectedElement: VirtualElement | null;
    previewSyncedFile: string | null;
    projectPath: string | null;
    root: VirtualElement;
    selectedElement: VirtualElement | null;
    selectedFolderCloneSource: string | null;
    selectedId: string | null;
    sidebarInteractionMode: InteractionMode;
  };
  actions: {
    handleCreateFileAtPath: (parentPath: string) => void;
    handleCreateFolderAtPath: (parentPath: string) => void;
    handleChooseFolderCloneSource: () => void;
    handleDeletePath: (path: string, kind: "file" | "folder") => void;
    handleDuplicateFile: (path: string) => void;
    handleLeftPanelResizeStart: (
      event: React.MouseEvent<HTMLDivElement>,
    ) => void;
    handleLeftPanelStretchToggle: () => void;
    handleOpenConfigModal: () => void;
    handleOpenFolder: (path?: string | null) => Promise<void>;
    handleRenamePath: (path: string) => void;
    handleSelectFile: (path: string) => void;
    handleSidebarAddElement: (type: string) => void;
    handleSidebarAddFontToPresentationCss: (path: string) => void;
    handleSidebarInteractionModeChange: (mode: InteractionMode) => void;
    handleSidebarLoadImage: (path: string) => void;
    handleSidebarSelectElement: (id: string) => void;
    handleUpdateAnimation: (animation: string) => void;
    handleUpdateStyle: (styles: Partial<React.CSSProperties>) => void;
    handlePreviewAnimationUpdateStable: (animation: string) => void;
    handlePreviewStyleUpdateStable: (
      styles: Partial<React.CSSProperties>,
    ) => void;
    openCodePanel: () => void;
    refreshProjectFiles: () => void;
    setDrawElementTag: React.Dispatch<React.SetStateAction<string>>;
    setIsLeftPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  };
};

const LeftSidebarShell: React.FC<LeftSidebarShellProps> = ({
  shellState,
  sidebarState,
  actions,
}) => {
  const {
    isCodePanelOpen,
    isFloatingPanels,
    isLeftPanelOpen,
    isPanelsSwapped,
    isResizingLeftPanel,
    leftPanelCollapsedWidth,
    showConfigButton,
    showMasterTools,
    theme,
  } = shellState;
  const {
    activeFile,
    drawElementTag,
    files,
    interactionMode,
    previewMode,
    previewLayerSelectedId,
    previewSelectedElement,
    previewSyncedFile,
    projectPath,
    root,
    selectedElement,
    selectedFolderCloneSource,
    selectedId,
    sidebarInteractionMode,
  } = sidebarState;
  const {
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
    openCodePanel,
    refreshProjectFiles,
    setDrawElementTag,
    setIsLeftPanelOpen,
  } = actions;

  return (
    <div
      className={`left-sidebar-shell ${isResizingLeftPanel ? "" : "left-sidebar-shell--animated"} ${isFloatingPanels ? (isPanelsSwapped ? "left-sidebar-shell--floating-right" : "left-sidebar-shell--floating-left") : isPanelsSwapped ? "left-sidebar-shell--docked-right" : "left-sidebar-shell--docked-left"} ${isCodePanelOpen ? "left-sidebar-shell--hidden" : ""}`}
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
        className={`left-sidebar-surface ${isFloatingPanels ? (isPanelsSwapped ? "left-sidebar-surface--floating-right" : "left-sidebar-surface--floating-left") : ""}`}
        style={{
          background:
            theme === "dark"
              ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,250,252,0.74) 100%)",
          backdropFilter: "none",
        }}
      >
        <div className="left-sidebar-content">
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
          className={`left-sidebar-frame ${isFloatingPanels ? (isPanelsSwapped ? "left-sidebar-frame--floating-right" : "left-sidebar-frame--floating-left") : ""}`}
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
          className={`left-sidebar-resize-handle ${isPanelsSwapped ? "left-sidebar-resize-handle--left" : "left-sidebar-resize-handle--right"}`}
          title="Resize panel. Click to stretch or shrink"
        />
      )}
    </div>
  );
};

export default LeftSidebarShell;
