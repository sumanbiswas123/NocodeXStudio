import { useMemo } from "react";
import type React from "react";
import LeftSidebarShell from "../../ui/LeftSidebarShell";
import { SHOW_MASTER_TOOLS, isEdaProject } from "../../helpers/appHelpers";
import type { FileMap, VirtualElement } from "../../../types";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";
type SidebarInteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";

type UseLeftSidebarViewModelOptions = {
  theme: "dark" | "light";
  isCodePanelOpen: boolean;
  isFloatingPanels: boolean;
  isLeftPanelOpen: boolean;
  isPanelsSwapped: boolean;
  isResizingLeftPanel: boolean;
  leftPanelCollapsedWidth: number;
  files: FileMap;
  activeFile: string | null;
  drawElementTag: string;
  interactionMode: InteractionMode;
  previewMode: "edit" | "preview";
  previewLayerSelectedId: string | null;
  previewSelectedElement: VirtualElement | null;
  previewSyncedFile: string | null;
  projectPath: string | null;
  previewLayersRoot: VirtualElement;
  root: VirtualElement;
  selectedElement: VirtualElement | null;
  selectedFolderCloneSource: string | null;
  selectedId: string | null;
  sidebarInteractionMode: SidebarInteractionMode;
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
  handleSidebarInteractionModeChange: (mode: SidebarInteractionMode) => void;
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

export const useLeftSidebarViewModel = ({
  theme,
  isCodePanelOpen,
  isFloatingPanels,
  isLeftPanelOpen,
  isPanelsSwapped,
  isResizingLeftPanel,
  leftPanelCollapsedWidth,
  files,
  activeFile,
  drawElementTag,
  interactionMode,
  previewMode,
  previewLayerSelectedId,
  previewSelectedElement,
  previewSyncedFile,
  projectPath,
  previewLayersRoot,
  root,
  selectedElement,
  selectedFolderCloneSource,
  selectedId,
  sidebarInteractionMode,
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
}: UseLeftSidebarViewModelOptions): React.ComponentProps<
  typeof LeftSidebarShell
> =>
  useMemo(
    () => ({
      shellState: {
        isCodePanelOpen,
        isFloatingPanels,
        isLeftPanelOpen,
        isPanelsSwapped,
        isResizingLeftPanel,
        leftPanelCollapsedWidth,
        showConfigButton: isEdaProject(files),
        showMasterTools: SHOW_MASTER_TOOLS,
        theme,
      },
      sidebarState: {
        activeFile,
        drawElementTag,
        files,
        interactionMode,
        previewMode,
        previewLayerSelectedId,
        previewSelectedElement,
        previewSyncedFile,
        projectPath,
        root: interactionMode === "preview" ? previewLayersRoot : root,
        selectedElement,
        selectedFolderCloneSource,
        selectedId:
          interactionMode === "preview" ? previewLayerSelectedId : selectedId,
        sidebarInteractionMode,
      },
      actions: {
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
      },
    }),
    [
      theme,
      isCodePanelOpen,
      isFloatingPanels,
      isLeftPanelOpen,
      isPanelsSwapped,
      isResizingLeftPanel,
      leftPanelCollapsedWidth,
      files,
      activeFile,
      drawElementTag,
      interactionMode,
      previewMode,
      previewLayerSelectedId,
      previewSelectedElement,
      previewSyncedFile,
      projectPath,
      previewLayersRoot,
      root,
      selectedElement,
      selectedFolderCloneSource,
      selectedId,
      sidebarInteractionMode,
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
    ],
  );
