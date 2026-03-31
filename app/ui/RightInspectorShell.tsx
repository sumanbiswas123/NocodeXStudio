import React from "react";
import { PanelRightClose, RotateCw, FileText, Upload } from "lucide-react";
import StyleInspectorPanel from "../../components/StyleInspectorPanel";
import PdfAnnotationsOverlay from "../../src/components/PdfAnnotationsOverlay";
import type { VirtualElement } from "../../types";
import type { PdfAnnotationUiRecord } from "../helpers/pdfAnnotationHelpers";
import type { PreviewSelectionMode } from "../helpers/appHelpers";
import type { PreviewMatchedCssRule } from "../helpers/previewCssHelpers";

type ThemeMode = "light" | "dark";

type RightInspectorShellProps = {
  shellState: {
    theme: ThemeMode;
    isResizingRightPanel: boolean;
    isCodePanelOpen: boolean;
    isRightPanelOpen: boolean;
    isRightInspectorAttached: boolean;
    projectPath: string | null;
  };
  pdfState: {
    showEmbeddedPdfAnnotations: boolean;
    hasPdfAnnotationsLoaded: boolean;
    isPdfAnnotationPanelOpen: boolean;
    isPdfAnnotationLoading: boolean;
    currentPreviewSlideId: string | null;
  };
  inspectorState: {
    showStyleInspectorSection: boolean;
    setIsStyleInspectorSectionOpen: React.Dispatch<
      React.SetStateAction<boolean>
    >;
    inspectorElement: VirtualElement | null;
    availableFonts: string[];
    previewSelectedElement: VirtualElement | null;
    previewSelectionMode: PreviewSelectionMode;
    resolveInspectorAssetPreviewUrl: (
      raw: string,
      source?: string,
    ) => string;
    previewSelectedMatchedCssRules: PreviewMatchedCssRule[];
    previewSelectedComputedStyles: React.CSSProperties | null;
  };
  actions: {
    onTogglePdfAnnotations: () => void;
    onOpenPdfAnnotationsPicker: () => void;
    onRefreshPdfAnnotationMapping: () => void;
    onJumpToPdfAnnotation: (annotation: PdfAnnotationUiRecord) => void;
    onImmediatePreviewStyle: (
      styles: Partial<React.CSSProperties>,
    ) => void;
    onPreviewContentUpdate: (data: {
      content?: string;
      html?: string;
    }) => void;
    onUpdateContent: (data: { content?: string; html?: string }) => void;
    onApplyPreviewTagUpdate: (tag: string) => Promise<void>;
    onApplyQuickTextWrapTag: (tag: "sup" | "sub") => Promise<void>;
    onPreviewStyleUpdate: (
      styles: Partial<React.CSSProperties>,
    ) => void;
    onUpdateStyle: (styles: Partial<React.CSSProperties>) => void;
    onPreviewIdentityUpdate: (identity: {
      id: string;
      className: string;
    }) => void;
    onUpdateIdentity: (identity: { id: string; className: string }) => void;
    onReplacePreviewAsset: () => Promise<boolean>;
    onPreviewMatchedRulePropertyAdd:
      StyleInspectorPanelProps["onAddMatchedRuleProperty"];
    setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
    onRightPanelResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  };
};

type StyleInspectorPanelProps = React.ComponentProps<typeof StyleInspectorPanel>;

const RightInspectorShell: React.FC<RightInspectorShellProps> = ({
  shellState,
  pdfState,
  inspectorState,
  actions,
}) => {
  const {
    theme,
    isResizingRightPanel,
    isCodePanelOpen,
    isRightPanelOpen,
    isRightInspectorAttached,
    projectPath,
  } = shellState;
  const {
    showEmbeddedPdfAnnotations,
    hasPdfAnnotationsLoaded,
    isPdfAnnotationPanelOpen,
    isPdfAnnotationLoading,
    currentPreviewSlideId,
  } = pdfState;
  const {
    showStyleInspectorSection,
    setIsStyleInspectorSectionOpen,
    inspectorElement,
    availableFonts,
    previewSelectedElement,
    previewSelectionMode,
    resolveInspectorAssetPreviewUrl,
    previewSelectedMatchedCssRules,
    previewSelectedComputedStyles,
  } = inspectorState;
  const {
    onTogglePdfAnnotations,
    onOpenPdfAnnotationsPicker,
    onRefreshPdfAnnotationMapping,
    onJumpToPdfAnnotation,
    onImmediatePreviewStyle,
    onPreviewContentUpdate,
    onUpdateContent,
    onApplyPreviewTagUpdate,
    onApplyQuickTextWrapTag,
    onPreviewStyleUpdate,
    onUpdateStyle,
    onPreviewIdentityUpdate,
    onUpdateIdentity,
    onReplacePreviewAsset,
    onPreviewMatchedRulePropertyAdd,
    setIsRightPanelOpen,
    onRightPanelResizeStart,
  } = actions;

  return (
    <div
      className={`absolute z-40 no-scrollbar ${isResizingRightPanel ? "" : "transition-all duration-700"} right-0 top-0 bottom-0 ${isCodePanelOpen || !isRightPanelOpen ? "pointer-events-none" : ""}`}
      style={{
        width: "var(--right-panel-width)",
        overflow: "hidden",
        transform: isRightPanelOpen
          ? "translateX(0) scale(1)"
          : "translateX(calc(100% + 0.75rem)) scale(0.985)",
        opacity: isRightPanelOpen ? 1 : 0,
        transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        transformOrigin: "right center",
      }}
    >
      <div
        className="h-full min-h-full relative flex flex-col overflow-hidden"
        style={{
          background:
            theme === "dark"
              ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(248,250,252,0.76) 100%)",
          backdropFilter: "none",
          borderTopLeftRadius: "28px",
          borderBottomLeftRadius: "28px",
        }}
      >
        <div
          className="shrink-0 border-b px-3 py-2"
          style={{
            borderColor:
              theme === "dark"
                ? "rgba(148,163,184,0.22)"
                : "rgba(15,23,42,0.08)",
            background:
              theme === "dark"
                ? "rgba(15,23,42,0.42)"
                : "rgba(255,255,255,0.78)",
          }}
        >
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="h-9 min-w-[44px] rounded-xl border px-2 flex items-center justify-center transition-colors text-[11px] font-semibold tracking-[0.14em]"
              style={{
                borderColor:
                  theme === "dark"
                    ? "rgba(148,163,184,0.28)"
                    : "rgba(15,23,42,0.12)",
                color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                background: showStyleInspectorSection
                  ? theme === "dark"
                    ? "rgba(99,102,241,0.2)"
                    : "rgba(99,102,241,0.14)"
                  : "transparent",
              }}
              onClick={() =>
                setIsStyleInspectorSectionOpen((current) => !current)
              }
              title={
                showStyleInspectorSection
                  ? "Hide styles section"
                  : "Show styles section"
              }
            >
              CSS
            </button>
            <button
              type="button"
              className="h-9 w-9 rounded-xl border flex items-center justify-center transition-colors"
              style={{
                borderColor:
                  theme === "dark"
                    ? "rgba(148,163,184,0.28)"
                    : "rgba(15,23,42,0.12)",
                color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                background: showEmbeddedPdfAnnotations
                  ? theme === "dark"
                    ? "rgba(34,211,238,0.18)"
                    : "rgba(14,165,233,0.14)"
                  : "transparent",
              }}
              onClick={() => {
                if (hasPdfAnnotationsLoaded) {
                  onTogglePdfAnnotations();
                  return;
                }
                onOpenPdfAnnotationsPicker();
              }}
              disabled={!projectPath || isPdfAnnotationLoading}
              title={
                projectPath
                  ? hasPdfAnnotationsLoaded
                    ? isPdfAnnotationPanelOpen
                      ? "Hide PDF annotations"
                      : "Show PDF annotations"
                    : "Load annotated PDF"
                  : "Open a presentation first"
              }
            >
              {isPdfAnnotationLoading ? (
                <RotateCw size={15} className="animate-spin" />
              ) : (
                <FileText size={15} />
              )}
            </button>
            <button
              type="button"
              className="h-9 w-9 rounded-xl border flex items-center justify-center transition-colors"
              style={{
                borderColor:
                  theme === "dark"
                    ? "rgba(148,163,184,0.28)"
                    : "rgba(15,23,42,0.12)",
                color: theme === "dark" ? "#e2e8f0" : "#0f172a",
              }}
              onClick={onRefreshPdfAnnotationMapping}
              disabled={!projectPath || isPdfAnnotationLoading}
              title="Upload annotated PDF"
            >
              <Upload size={15} />
            </button>
          </div>
        </div>

        {showEmbeddedPdfAnnotations ? (
          <>
            <div
              className="min-h-0 overflow-hidden"
              style={{
                flex: showStyleInspectorSection ? "0 0 48%" : "1 1 auto",
                background:
                  theme === "dark"
                    ? "rgba(2,6,23,0.18)"
                    : "rgba(248,250,252,0.62)",
              }}
            >
              <PdfAnnotationsOverlay
                currentPreviewSlideId={currentPreviewSlideId}
                theme={theme}
                onJumpToAnnotation={onJumpToPdfAnnotation}
                embedded
              />
            </div>
            {showStyleInspectorSection ? (
              <div
                className="shrink-0 h-[8px]"
                style={{
                  background:
                    theme === "dark"
                      ? "linear-gradient(90deg, rgba(34,211,238,0.1) 0%, rgba(56,189,248,0.42) 22%, rgba(14,165,233,0.2) 50%, rgba(34,211,238,0.42) 78%, rgba(34,211,238,0.1) 100%)"
                      : "linear-gradient(90deg, rgba(125,211,252,0.18) 0%, rgba(14,165,233,0.55) 22%, rgba(6,182,212,0.22) 50%, rgba(14,165,233,0.55) 78%, rgba(125,211,252,0.18) 100%)",
                  boxShadow:
                    theme === "dark"
                      ? "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(255,255,255,0.03)"
                      : "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(14,165,233,0.08)",
                }}
              />
            ) : null}
          </>
        ) : null}

        {showStyleInspectorSection ? (
          <div
            className="min-h-0 flex-1 overflow-hidden px-2 pt-2 pb-2"
            style={{
              borderTop: showEmbeddedPdfAnnotations
                ? "none"
                : theme === "dark"
                  ? "1px solid rgba(148,163,184,0.12)"
                  : "1px solid rgba(15,23,42,0.05)",
              background:
                theme === "dark"
                  ? "rgba(2,6,23,0.3)"
                  : "rgba(255,255,255,0.72)",
            }}
          >
            <div
              className="h-full overflow-hidden rounded-[20px]"
              style={{
                background:
                  theme === "dark"
                    ? "rgba(15,23,42,0.3)"
                    : "rgba(255,255,255,0.8)",
              }}
            >
              <StyleInspectorPanel
                element={inspectorElement}
                availableFonts={availableFonts}
                onImmediateChange={onImmediatePreviewStyle}
                onUpdateContent={
                  previewSelectedElement ? onPreviewContentUpdate : onUpdateContent
                }
                onToggleTextTag={
                  previewSelectedElement
                    ? (tag) => {
                        void onApplyPreviewTagUpdate(
                          previewSelectedElement.type === tag ? "span" : tag,
                        );
                      }
                    : undefined
                }
                onWrapTextTag={
                  previewSelectedElement
                    ? (tag) => {
                        void onApplyQuickTextWrapTag(tag);
                      }
                    : undefined
                }
                selectionMode={
                  previewSelectedElement ? previewSelectionMode : "default"
                }
                resolveAssetPreviewUrl={resolveInspectorAssetPreviewUrl}
                onUpdateStyle={
                  previewSelectedElement ? onPreviewStyleUpdate : onUpdateStyle
                }
                onUpdateIdentity={
                  previewSelectedElement
                    ? onPreviewIdentityUpdate
                    : onUpdateIdentity
                }
                onReplaceAsset={
                  previewSelectedElement
                    ? () => {
                        void onReplacePreviewAsset();
                      }
                    : undefined
                }
                onAddMatchedRuleProperty={
                  previewSelectedElement
                    ? onPreviewMatchedRulePropertyAdd
                    : undefined
                }
                matchedCssRules={
                  previewSelectedElement ? previewSelectedMatchedCssRules : []
                }
                computedStyles={
                  previewSelectedElement ? previewSelectedComputedStyles : null
                }
              />
            </div>
          </div>
        ) : !showEmbeddedPdfAnnotations ? (
          <div
            className="min-h-0 flex-1 flex items-center justify-center px-6 text-center"
            style={{
              color: theme === "dark" ? "#94a3b8" : "#64748b",
            }}
          >
            <div className="text-[12px] tracking-[0.16em] uppercase">
              Enable CSS or PDF to inspect this slide
            </div>
          </div>
        ) : null}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow:
              theme === "dark"
                ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                : "inset 0 0 0 1px rgba(255,255,255,0.45)",
          }}
        />
        {isRightInspectorAttached ? (
          <button
            type="button"
            onClick={() => setIsRightPanelOpen(false)}
            className="absolute top-3 left-3 z-20 h-8 px-2 rounded-full border flex items-center justify-center gap-1.5 transition-all duration-300 text-[10px] font-semibold uppercase tracking-[0.14em] hover:-translate-y-0.5"
            style={{
              borderColor:
                theme === "dark"
                  ? "rgba(148,163,184,0.28)"
                  : "rgba(15,23,42,0.12)",
              color: theme === "dark" ? "#a5f3fc" : "#0e7490",
              background:
                theme === "dark"
                  ? "rgba(15,23,42,0.88)"
                  : "rgba(255,255,255,0.92)",
              boxShadow:
                theme === "dark"
                  ? "0 8px 18px rgba(2,6,23,0.24)"
                  : "0 8px 18px rgba(15,23,42,0.08)",
            }}
            title="Collapse right panel"
          >
            <PanelRightClose size={14} />
            <span>Hide</span>
          </button>
        ) : null}
      </div>
      <div
        onMouseDown={onRightPanelResizeStart}
        className="absolute top-0 left-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors"
        title="Resize panel"
      />
    </div>
  );
};

export default RightInspectorShell;
