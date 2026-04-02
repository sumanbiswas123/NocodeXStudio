import { useMemo } from "react";
import type React from "react";
import RightInspectorShell from "../../ui/RightInspectorShell";
import type { PreviewSelectionMode } from "../../helpers/appHelpers";
import type { PreviewMatchedCssRule } from "../../helpers/previewCssHelpers";
import type { PdfAnnotationUiRecord } from "../../helpers/pdfAnnotationHelpers";
import type { VirtualElement } from "../../../types";

type UseRightInspectorViewModelOptions = {
  theme: "dark" | "light";
  isResizingRightPanel: boolean;
  isCodePanelOpen: boolean;
  isRightPanelOpen: boolean;
  isRightInspectorAttached: boolean;
  projectPath: string | null;
  showEmbeddedPdfAnnotations: boolean;
  hasPdfAnnotationsLoaded: boolean;
  isPdfAnnotationPanelOpen: boolean;
  isPdfAnnotationLoading: boolean;
  currentPreviewSlideId: string | null | undefined;
  showStyleInspectorSection: boolean;
  setIsStyleInspectorSectionOpen: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  inspectorElement: VirtualElement | null;
  availableFonts: string[];
  previewSelectedElement: VirtualElement | null;
  previewSelectionMode: PreviewSelectionMode;
  resolveInspectorAssetPreviewUrl: (raw: string, source?: string) => string;
  previewSelectedMatchedCssRules: PreviewMatchedCssRule[];
  previewSelectedComputedStyles: React.CSSProperties | null;
  togglePdfAnnotations: () => void;
  handleOpenPdfAnnotationsPicker: () => void;
  handleRefreshPdfAnnotationMapping: () => void;
  handleCancelPdfAnnotationMapping: () => void;
  handleJumpToPdfAnnotation: (annotation: PdfAnnotationUiRecord) => void;
  handleImmediatePreviewStyle: (styles: Partial<React.CSSProperties>) => void;
  handlePreviewContentUpdateStable: (data: {
    content?: string;
    html?: string;
  }) => void;
  handleUpdateContent: (data: { content?: string; html?: string }) => void;
  applyPreviewTagUpdate: (tag: string) => Promise<void>;
  applyQuickTextWrapTag: (tag: "sup" | "sub") => Promise<void>;
  handlePreviewStyleUpdateStable: (
    styles: Partial<React.CSSProperties>,
  ) => void;
  handleUpdateStyle: (styles: Partial<React.CSSProperties>) => void;
  handlePreviewIdentityUpdateStable: (identity: {
    id: string;
    className: string;
  }) => void;
  handleUpdateIdentity: (identity: { id: string; className: string }) => void;
  handleReplacePreviewAsset: () => Promise<boolean>;
  handlePreviewMatchedRulePropertyAdd: React.ComponentProps<
    typeof RightInspectorShell
  >["actions"]["onPreviewMatchedRulePropertyAdd"];
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleRightPanelResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export const useRightInspectorViewModel = ({
  theme,
  isResizingRightPanel,
  isCodePanelOpen,
  isRightPanelOpen,
  isRightInspectorAttached,
  projectPath,
  showEmbeddedPdfAnnotations,
  hasPdfAnnotationsLoaded,
  isPdfAnnotationPanelOpen,
  isPdfAnnotationLoading,
  currentPreviewSlideId,
  showStyleInspectorSection,
  setIsStyleInspectorSectionOpen,
  inspectorElement,
  availableFonts,
  previewSelectedElement,
  previewSelectionMode,
  resolveInspectorAssetPreviewUrl,
  previewSelectedMatchedCssRules,
  previewSelectedComputedStyles,
  togglePdfAnnotations,
  handleOpenPdfAnnotationsPicker,
  handleRefreshPdfAnnotationMapping,
  handleCancelPdfAnnotationMapping,
  handleJumpToPdfAnnotation,
  handleImmediatePreviewStyle,
  handlePreviewContentUpdateStable,
  handleUpdateContent,
  applyPreviewTagUpdate,
  applyQuickTextWrapTag,
  handlePreviewStyleUpdateStable,
  handleUpdateStyle,
  handlePreviewIdentityUpdateStable,
  handleUpdateIdentity,
  handleReplacePreviewAsset,
  handlePreviewMatchedRulePropertyAdd,
  setIsRightPanelOpen,
  handleRightPanelResizeStart,
}: UseRightInspectorViewModelOptions): React.ComponentProps<
  typeof RightInspectorShell
> =>
  useMemo(
    () => ({
      shellState: {
        theme,
        isResizingRightPanel,
        isCodePanelOpen,
        isRightPanelOpen,
        isRightInspectorAttached,
        projectPath,
      },
      pdfState: {
        showEmbeddedPdfAnnotations,
        hasPdfAnnotationsLoaded,
        isPdfAnnotationPanelOpen,
        isPdfAnnotationLoading,
        currentPreviewSlideId: currentPreviewSlideId ?? null,
      },
      inspectorState: {
        showStyleInspectorSection,
        setIsStyleInspectorSectionOpen,
        inspectorElement,
        availableFonts,
        previewSelectedElement,
        previewSelectionMode,
        resolveInspectorAssetPreviewUrl,
        previewSelectedMatchedCssRules,
        previewSelectedComputedStyles,
      },
      actions: {
        onTogglePdfAnnotations: togglePdfAnnotations,
        onOpenPdfAnnotationsPicker: handleOpenPdfAnnotationsPicker,
        onRefreshPdfAnnotationMapping: handleRefreshPdfAnnotationMapping,
        onCancelPdfAnnotationMapping: handleCancelPdfAnnotationMapping,
        onJumpToPdfAnnotation: handleJumpToPdfAnnotation,
        onImmediatePreviewStyle: handleImmediatePreviewStyle,
        onPreviewContentUpdate: handlePreviewContentUpdateStable,
        onUpdateContent: handleUpdateContent,
        onApplyPreviewTagUpdate: applyPreviewTagUpdate,
        onApplyQuickTextWrapTag: applyQuickTextWrapTag,
        onPreviewStyleUpdate: handlePreviewStyleUpdateStable,
        onUpdateStyle: handleUpdateStyle,
        onPreviewIdentityUpdate: handlePreviewIdentityUpdateStable,
        onUpdateIdentity: handleUpdateIdentity,
        onReplacePreviewAsset: handleReplacePreviewAsset,
        onPreviewMatchedRulePropertyAdd: handlePreviewMatchedRulePropertyAdd,
        setIsRightPanelOpen,
        onRightPanelResizeStart: handleRightPanelResizeStart,
      },
    }),
    [
      theme,
      isResizingRightPanel,
      isCodePanelOpen,
      isRightPanelOpen,
      isRightInspectorAttached,
      projectPath,
      showEmbeddedPdfAnnotations,
      hasPdfAnnotationsLoaded,
      isPdfAnnotationPanelOpen,
      isPdfAnnotationLoading,
      currentPreviewSlideId,
      showStyleInspectorSection,
      setIsStyleInspectorSectionOpen,
      inspectorElement,
      availableFonts,
      previewSelectedElement,
      previewSelectionMode,
      resolveInspectorAssetPreviewUrl,
      previewSelectedMatchedCssRules,
      previewSelectedComputedStyles,
      togglePdfAnnotations,
      handleOpenPdfAnnotationsPicker,
      handleRefreshPdfAnnotationMapping,
      handleCancelPdfAnnotationMapping,
      handleJumpToPdfAnnotation,
      handleImmediatePreviewStyle,
      handlePreviewContentUpdateStable,
      handleUpdateContent,
      applyPreviewTagUpdate,
      applyQuickTextWrapTag,
      handlePreviewStyleUpdateStable,
      handleUpdateStyle,
      handlePreviewIdentityUpdateStable,
      handleUpdateIdentity,
      handleReplacePreviewAsset,
      handlePreviewMatchedRulePropertyAdd,
      setIsRightPanelOpen,
      handleRightPanelResizeStart,
    ],
  );
