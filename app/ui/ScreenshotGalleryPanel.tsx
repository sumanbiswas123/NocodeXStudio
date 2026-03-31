import React from "react";
import { FileDown, PanelRightClose } from "lucide-react";
import { ScreenshotMetadata } from "../helpers/screenshotWorkspace";

type RightPanelFloatingPosition = {
  left: number;
  top: number;
};

type ScreenshotGalleryPanelProps = {
  shellState: {
    isFloatingPanels: boolean;
    isPanelsSwapped: boolean;
    isResizingRightPanel: boolean;
    isDraggingRightPanel: boolean;
    isCodePanelOpen: boolean;
    isRightPanelOpen: boolean;
    rightPanelFloatingPosition: RightPanelFloatingPosition;
    theme: "dark" | "light";
    rightPanelMode: "inspector" | "gallery";
    projectPath: string | null;
  };
  galleryState: {
    screenshotCaptureBusy: boolean;
    screenshotItems: ScreenshotMetadata[];
    screenshotPreviewUrls: Record<string, string>;
    isPdfExporting: boolean;
    pdfExportLogs: string[];
  };
  actions: {
    onRightPanelDragStart: (event: React.MouseEvent<HTMLDivElement>) => void;
    onCloseGallery: () => void;
    onCollapsePanel: () => void;
    onRefreshGallery: () => void;
    onCaptureScreenshot: () => void;
    onRevealScreenshotsFolder: () => void;
    onOpenScreenshotItem: (item: ScreenshotMetadata) => void;
    onDeleteScreenshotItem: (item: ScreenshotMetadata) => void;
    onExportEditablePdf: () => void;
  };
};

const ScreenshotGalleryPanel: React.FC<ScreenshotGalleryPanelProps> = ({
  shellState,
  galleryState,
  actions,
}) => {
  const {
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
  } = shellState;
  const {
    screenshotCaptureBusy,
    screenshotItems,
    screenshotPreviewUrls,
    isPdfExporting,
    pdfExportLogs,
  } = galleryState;
  const {
    onRightPanelDragStart,
    onCloseGallery,
    onCollapsePanel,
    onRefreshGallery,
    onCaptureScreenshot,
    onRevealScreenshotsFolder,
    onOpenScreenshotItem,
    onDeleteScreenshotItem,
    onExportEditablePdf,
  } = actions;

  return (
    <div
      className={`absolute z-40 no-scrollbar ${isResizingRightPanel || isDraggingRightPanel ? "" : "transition-all duration-500"} ${isFloatingPanels ? "" : isPanelsSwapped ? "left-0 top-0 bottom-0" : "right-0 top-0 bottom-0"} ${isCodePanelOpen ? "opacity-0 pointer-events-none" : ""} ${isRightPanelOpen ? (isPanelsSwapped ? "animate-panelInLeft" : "animate-panelInRight") : ""}`}
      style={{
        transform: isRightPanelOpen
          ? "translateX(0)"
          : isFloatingPanels
            ? "translateX(calc(100% + 2.5rem))"
            : isPanelsSwapped
              ? "translateX(-100%)"
              : "translateX(100%)",
        width: "var(--right-panel-width)",
        left: isFloatingPanels
          ? `${rightPanelFloatingPosition.left}px`
          : undefined,
        top: isFloatingPanels
          ? `${rightPanelFloatingPosition.top}px`
          : undefined,
        minHeight: isFloatingPanels ? "30vh" : undefined,
        maxHeight: isFloatingPanels
          ? "min(70vh, calc(100vh - 7.5rem))"
          : undefined,
        height: isFloatingPanels ? "fit-content" : undefined,
        borderRadius: isFloatingPanels ? "1rem" : undefined,
        border: isFloatingPanels
          ? theme === "light"
            ? "1px solid rgba(15, 23, 42, 0.18)"
            : "1px solid rgba(255, 255, 255, 0.25)"
          : undefined,
        background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
        overflowY: isFloatingPanels ? "auto" : undefined,
        overflowX: isFloatingPanels ? "hidden" : undefined,
        transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      <div
        className={`h-full min-h-full relative flex flex-col overflow-hidden ${isFloatingPanels ? "rounded-2xl overflow-hidden" : ""}`}
        style={{
          background:
            theme === "dark"
              ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(248,250,252,0.76) 100%)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div
          className="h-11 shrink-0 px-3 flex items-center justify-between"
          onMouseDown={onRightPanelDragStart}
          style={{
            borderBottom:
              theme === "dark"
                ? "1px solid rgba(148,163,184,0.28)"
                : "1px solid rgba(0,0,0,0.1)",
            background:
              theme === "dark"
                ? "linear-gradient(90deg, rgba(99,102,241,0.2), rgba(16,185,129,0.16), rgba(15,23,42,0.0))"
                : "linear-gradient(90deg,rgba(99,102,241,0.12),rgba(16,185,129,0.1),transparent)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: theme === "dark" ? "#ffffff" : "#8b5cf6",
                boxShadow:
                  theme === "dark"
                    ? "0 0 10px rgba(255,255,255,0.8)"
                    : "0 0 10px rgba(139,92,246,0.8)",
              }}
            />
            <span
              className="text-[11px] uppercase tracking-[0.2em] font-semibold"
              style={{ color: theme === "dark" ? "#cbd5e1" : "#475569" }}
            >
              {rightPanelMode === "gallery" ? "Gallery" : "Inspector"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors"
              style={{
                background:
                  theme === "dark"
                    ? "rgba(248,113,113,0.12)"
                    : "rgba(248,113,113,0.18)",
                borderColor:
                  theme === "dark"
                    ? "rgba(248,113,113,0.4)"
                    : "rgba(248,113,113,0.35)",
                color: theme === "dark" ? "#fecdd3" : "#be123c",
              }}
              onClick={onCloseGallery}
              title="Close gallery"
            >
              Close
            </button>
            {!isFloatingPanels ? (
              <button
                type="button"
                className="h-6 w-6 flex items-center justify-center rounded-md border transition-colors"
                style={{
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.7)"
                      : "rgba(255,255,255,0.7)",
                  borderColor:
                    theme === "dark"
                      ? "rgba(148,163,184,0.32)"
                      : "rgba(0,0,0,0.1)",
                  color: theme === "dark" ? "#94a3b8" : "#64748b",
                }}
                onClick={onCollapsePanel}
                title="Collapse right panel"
              >
                <PanelRightClose size={12} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          <div
            className="shrink-0 px-3 py-2 border-b"
            style={{
              borderColor:
                theme === "dark"
                  ? "rgba(148,163,184,0.28)"
                  : "rgba(0,0,0,0.1)",
              background:
                theme === "dark"
                  ? "rgba(15,23,42,0.42)"
                  : "rgba(255,255,255,0.72)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{
                  color: theme === "dark" ? "#94a3b8" : "#64748b",
                }}
              >
                Screenshots
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                  style={{
                    borderColor:
                      theme === "dark"
                        ? "rgba(148,163,184,0.38)"
                        : "rgba(15,23,42,0.18)",
                    color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                  }}
                  onClick={onRefreshGallery}
                  title="Refresh gallery"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                  style={{
                    borderColor:
                      theme === "dark"
                        ? "rgba(34,211,238,0.45)"
                        : "rgba(8,145,178,0.3)",
                    color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                    opacity: screenshotCaptureBusy ? 0.6 : 1,
                  }}
                  onClick={onCaptureScreenshot}
                  disabled={screenshotCaptureBusy}
                  title="Capture screenshot"
                >
                  {screenshotCaptureBusy ? "Capturing..." : "Capture"}
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                  style={{
                    borderColor:
                      theme === "dark"
                        ? "rgba(148,163,184,0.38)"
                        : "rgba(15,23,42,0.18)",
                    color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                  }}
                  onClick={onRevealScreenshotsFolder}
                  title="Reveal screenshots folder"
                >
                  Reveal
                </button>
              </div>
            </div>
            <div
              className="mt-2 text-[10px] uppercase tracking-[0.12em]"
              style={{
                color: theme === "dark" ? "#94a3b8" : "#64748b",
              }}
            >
              {screenshotItems.length} items
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3 space-y-3">
            {screenshotItems.length === 0 ? (
              <div
                className="rounded-xl border px-4 py-6 text-center text-xs"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(148,163,184,0.3)"
                      : "rgba(15,23,42,0.12)",
                  color: theme === "dark" ? "#94a3b8" : "#64748b",
                }}
              >
                No screenshots yet. Capture one from the iPad button.
              </div>
            ) : (
              screenshotItems.map((item) => {
                const imageUrl = screenshotPreviewUrls[item.id] || "";
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border overflow-hidden"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(148,163,184,0.3)"
                          : "rgba(15,23,42,0.12)",
                      background:
                        theme === "dark"
                          ? "rgba(15,23,42,0.65)"
                          : "rgba(255,255,255,0.7)",
                    }}
                  >
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt={item.imageFileName}
                        className="w-full h-40 object-cover"
                      />
                    )}
                    <div className="p-3 space-y-2">
                      <div className="text-xs font-semibold">
                        {item.slideId || "Unknown slide"}
                        {item.popupId ? ` • ${item.popupId}` : ""}
                      </div>
                      <div className="text-[10px] opacity-70">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                          style={{
                            borderColor:
                              theme === "dark"
                                ? "rgba(34,211,238,0.45)"
                                : "rgba(8,145,178,0.3)",
                            color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                          }}
                          onClick={() => onOpenScreenshotItem(item)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                          style={{
                            borderColor:
                              theme === "dark"
                                ? "rgba(148,163,184,0.38)"
                                : "rgba(15,23,42,0.18)",
                            color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                          }}
                          onClick={onRevealScreenshotsFolder}
                        >
                          Reveal
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                          style={{
                            borderColor:
                              theme === "dark"
                                ? "rgba(248,113,113,0.45)"
                                : "rgba(248,113,113,0.35)",
                            color: theme === "dark" ? "#fecdd3" : "#be123c",
                          }}
                          onClick={() => onDeleteScreenshotItem(item)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div
            className="shrink-0 px-3 py-3 border-t"
            style={{
              borderColor:
                theme === "dark"
                  ? "rgba(148,163,184,0.28)"
                  : "rgba(0,0,0,0.1)",
              background:
                theme === "dark"
                  ? "rgba(15,23,42,0.42)"
                  : "rgba(255,255,255,0.72)",
            }}
          >
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold border transition-colors"
              style={{
                borderColor:
                  theme === "dark"
                    ? "rgba(14,165,233,0.45)"
                    : "rgba(8,145,178,0.3)",
                color: theme === "dark" ? "#bae6fd" : "#0e7490",
                opacity: isPdfExporting ? 0.6 : 1,
              }}
              onClick={onExportEditablePdf}
              disabled={isPdfExporting || !projectPath}
            >
              <FileDown size={14} />
              {isPdfExporting
                ? "Exporting Editable PDF..."
                : "Export Editable PDF"}
            </button>
            {pdfExportLogs.length > 0 && (
              <div className="mt-3 max-h-32 overflow-auto text-[10px] space-y-1">
                {pdfExportLogs.map((log, index) => (
                  <div key={`${index}-${log}`} className="opacity-80">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScreenshotGalleryPanel;
