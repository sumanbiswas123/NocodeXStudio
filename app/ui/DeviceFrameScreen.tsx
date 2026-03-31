import React from "react";
import EditorContent from "./EditorContent";
import type { PdfAnnotationUiRecord } from "../helpers/pdfAnnotationHelpers";
import type { VirtualElement } from "../../types";

type DeviceFrameScreenProps = {
  desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
  deviceMode: "desktop" | "mobile" | "tablet";
  filteredAnnotationsForCurrentSlide: PdfAnnotationUiRecord[];
  focusedAnnotationForCurrentSlide: PdfAnnotationUiRecord | null;
  handleMoveElement: (draggedId: string, targetId: string) => void;
  handleMoveElementByPosition: (
    id: string,
    styles: Partial<React.CSSProperties>,
  ) => void;
  handleOpenFolder: (path?: string | null) => Promise<void>;
  handlePreviewFrameLoad: (
    event: React.SyntheticEvent<HTMLIFrameElement, Event>,
  ) => void;
  handlePreviewResizeHandleMouseDown: (
    direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  handlePreviewStageDragOver: (
    event: React.DragEvent<HTMLDivElement | HTMLIFrameElement>,
  ) => void;
  handlePreviewStageDrop: (
    event: React.DragEvent<HTMLDivElement | HTMLIFrameElement>,
  ) => void;
  handleResize: (id: string, width: string, height: string) => void;
  handleSelect: (id: string) => void;
  hasPreviewContent: boolean;
  injectedStyles: string;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  isPdfAnnotationPanelOpen: boolean;
  isPopupAnnotation: (annotation: PdfAnnotationUiRecord) => boolean;
  isToolboxDragging: boolean;
  previewFrameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  previewMode: "edit" | "preview";
  previewRefreshNonce: number;
  previewSelectedPath: number[] | null;
  previewSelectionBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  previewStageRef: React.MutableRefObject<HTMLDivElement | null>;
  projectPath: string | null;
  recentProjects: string[];
  root: VirtualElement;
  selectedId: string | null;
  selectedPathIds: Set<string> | null;
  selectedPreviewDoc: string;
  selectedPreviewHtml: string | null;
  selectedPreviewSrc: string | null;
  shouldShowFrameWelcome: boolean;
  tabletMetrics: {
    contentWidth: number;
    contentHeight: number;
  };
  tabletViewportScale: number;
};

const RESIZE_HANDLES = [
  ["n", "Resize from top", "ns-resize", "absolute left-3 right-3 top-[-6px] h-4", "999px"],
  ["s", "Resize from bottom", "ns-resize", "absolute left-3 right-3 bottom-[-6px] h-4", "999px"],
  ["e", "Resize from right", "ew-resize", "absolute top-3 bottom-3 right-[-6px] w-4", "999px"],
  ["w", "Resize from left", "ew-resize", "absolute top-3 bottom-3 left-[-6px] w-4", "999px"],
  ["nw", "Resize from top left", "nwse-resize", "absolute left-[-7px] top-[-7px] w-5 h-5", "6px"],
  ["ne", "Resize from top right", "nesw-resize", "absolute right-[-7px] top-[-7px] w-5 h-5", "6px"],
  ["sw", "Resize from bottom left", "nesw-resize", "absolute left-[-7px] bottom-[-7px] w-5 h-5", "6px"],
  ["se", "Resize from bottom right", "nwse-resize", "absolute right-[-7px] bottom-[-7px] w-5 h-5", "6px"],
] as const;

const DeviceFrameScreen: React.FC<DeviceFrameScreenProps> = ({
  desktopResolution,
  deviceMode,
  filteredAnnotationsForCurrentSlide,
  focusedAnnotationForCurrentSlide,
  handleMoveElement,
  handleMoveElementByPosition,
  handleOpenFolder,
  handlePreviewFrameLoad,
  handlePreviewResizeHandleMouseDown,
  handlePreviewStageDragOver,
  handlePreviewStageDrop,
  handleResize,
  handleSelect,
  hasPreviewContent,
  injectedStyles,
  interactionMode,
  isPdfAnnotationPanelOpen,
  isPopupAnnotation,
  isToolboxDragging,
  previewFrameRef,
  previewMode,
  previewRefreshNonce,
  previewSelectedPath,
  previewSelectionBox,
  previewStageRef,
  projectPath,
  recentProjects,
  root,
  selectedId,
  selectedPathIds,
  selectedPreviewDoc,
  selectedPreviewHtml,
  selectedPreviewSrc,
  shouldShowFrameWelcome,
  tabletMetrics,
  tabletViewportScale,
}) => {
  return (
    <div
      className={`w-full h-full bg-white overflow-hidden relative transition-all duration-700 ${deviceMode === "desktop" ? "rounded-lg pt-9" : deviceMode === "tablet" ? "rounded-[32px]" : "rounded-[38px]"}`}
    >
      <div
        className="origin-top-left transition-transform duration-500"
        style={{
          width:
            deviceMode === "mobile"
              ? "100%"
              : deviceMode === "tablet"
                ? `${tabletMetrics.contentWidth}px`
                : desktopResolution === "resizable"
                  ? "100%"
                  : desktopResolution === "4k"
                    ? "3840px"
                    : desktopResolution === "2k"
                      ? "2560px"
                      : desktopResolution === "1.5k"
                        ? "1600px"
                        : "1920px",
          height:
            deviceMode === "mobile"
              ? "100%"
              : deviceMode === "tablet"
                ? `${tabletMetrics.contentHeight}px`
                : desktopResolution === "resizable"
                  ? "100%"
                  : desktopResolution === "4k"
                    ? "2160px"
                    : desktopResolution === "2k"
                      ? "1440px"
                      : desktopResolution === "1.5k"
                        ? "900px"
                        : "1080px",
          transform:
            deviceMode === "tablet"
              ? `translateX(-50%) scale(${tabletViewportScale})`
              : `scale(${
                  deviceMode === "mobile"
                    ? 1
                    : desktopResolution === "resizable"
                      ? 1
                      : desktopResolution === "4k"
                        ? 0.24
                        : desktopResolution === "2k"
                          ? 0.36
                          : desktopResolution === "1.5k"
                            ? 0.576
                            : 0.48
                })`,
          transformOrigin: deviceMode === "tablet" ? "top center" : "top left",
          position: deviceMode === "tablet" ? "absolute" : "relative",
          left: deviceMode === "tablet" ? "50%" : undefined,
          top: deviceMode === "tablet" ? 0 : undefined,
        }}
      >
        <div
          ref={previewStageRef}
          className="w-full h-full relative"
          onDragOver={handlePreviewStageDragOver}
          onDrop={handlePreviewStageDrop}
        >
          {shouldShowFrameWelcome && (
            <div className="absolute inset-0 flex items-center justify-center p-12">
              <div
                className="w-full max-w-6xl rounded-[42px] border px-24 py-24 text-center shadow-[0_42px_140px_rgba(15,23,42,0.16)]"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.92) 100%)",
                  borderColor: "rgba(15,23,42,0.12)",
                  color: "#0f172a",
                  backdropFilter: "none",
                }}
              >
                <div
                  className="text-[44px] font-semibold uppercase tracking-[0.34em]"
                  style={{ color: "#64748b" }}
                >
                  Welcome To NoCode X
                </div>
                <p
                  className="mt-8 text-[30px] leading-[1.45] max-w-4xl mx-auto"
                  style={{ color: "#64748b" }}
                >
                  Open a previous presentation or choose a new project folder directly from the frame.
                </p>
                <div className="mt-12 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    className="rounded-[22px] px-10 py-5 text-[22px] font-semibold transition-colors"
                    style={{
                      background: "rgba(14,165,233,0.14)",
                      border: "1px solid rgba(14,165,233,0.25)",
                      color: "#0f172a",
                    }}
                    onClick={() => {
                      void handleOpenFolder();
                    }}
                  >
                    Select Presentation
                  </button>
                </div>
                {recentProjects.length > 0 && (
                  <div className="mt-12 text-left">
                    <div
                      className="text-[18px] font-semibold uppercase tracking-[0.24em] text-center"
                      style={{ color: "#64748b" }}
                    >
                      Recent Presentations
                    </div>
                    <div className="mt-6 grid grid-cols-1 gap-4">
                      {recentProjects.map((recentPath) => {
                        const recentName = recentPath
                          .replace(/\\/g, "/")
                          .split("/")
                          .filter(Boolean)
                          .slice(-1)[0];
                        return (
                          <button
                            key={recentPath}
                            type="button"
                            className="w-full rounded-[22px] border px-6 py-5 text-left transition-colors"
                            style={{
                              borderColor: "rgba(15,23,42,0.12)",
                              background: "rgba(255,255,255,0.68)",
                              color: "#0f172a",
                            }}
                            onClick={() => {
                              void handleOpenFolder(recentPath);
                            }}
                            title={recentPath}
                          >
                            <div className="text-[24px] font-semibold">
                              {recentName}
                            </div>
                            <div
                              className="mt-2 truncate text-[15px]"
                              style={{ color: "#64748b" }}
                            >
                              {recentPath}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {projectPath ? (
                  <div className="mt-8 text-[18px]" style={{ color: "#64748b" }}>
                    Current project:{" "}
                    {
                      projectPath
                        .replace(/\\/g, "/")
                        .split("/")
                        .filter(Boolean)
                        .slice(-1)[0]
                    }
                  </div>
                ) : null}
              </div>
            </div>
          )}
          {hasPreviewContent && (
            <iframe
              key={
                selectedPreviewSrc
                  ? `preview-src:${selectedPreviewSrc}:${previewRefreshNonce}`
                  : `preview-doc:${selectedPreviewHtml || "none"}:${previewRefreshNonce}`
              }
              ref={previewFrameRef}
              title="project-preview"
              src={selectedPreviewSrc || undefined}
              srcDoc={selectedPreviewSrc ? undefined : selectedPreviewDoc}
              loading="eager"
              onLoad={handlePreviewFrameLoad}
              onDragOver={handlePreviewStageDragOver}
              onDrop={handlePreviewStageDrop}
              className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-150 ${
                interactionMode === "preview"
                  ? isToolboxDragging
                    ? "opacity-100 pointer-events-none"
                    : "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none"
              }`}
            />
          )}
          {interactionMode === "preview" &&
            isPdfAnnotationPanelOpen &&
            filteredAnnotationsForCurrentSlide.map((annotation) => {
              const isFocused =
                focusedAnnotationForCurrentSlide?.annotationId ===
                annotation.annotationId;
              const isPopup = isPopupAnnotation(annotation);
              return (
                <div
                  key={annotation.annotationId}
                  className={`absolute pointer-events-none rounded-[18px] border-2 ${
                    isFocused ? "z-30" : "z-20"
                  }`}
                  style={{
                    left: `${annotation.positionPct.left}%`,
                    top: `${annotation.positionPct.top}%`,
                    width: `${Math.max(2, annotation.positionPct.width)}%`,
                    height: `${Math.max(2, annotation.positionPct.height)}%`,
                    borderColor: isFocused
                      ? "rgba(239,68,68,0.98)"
                      : isPopup
                        ? "rgba(34,211,238,0.85)"
                        : "rgba(34,197,94,0.9)",
                    boxShadow: isFocused
                      ? "0 0 0 5px rgba(239,68,68,0.35), 0 0 28px rgba(239,68,68,0.45), inset 0 0 0 1px rgba(255,255,255,0.82)"
                      : isPopup
                        ? "0 0 0 3px rgba(34,211,238,0.18), 0 0 22px rgba(34,211,238,0.32), inset 0 0 0 1px rgba(255,255,255,0.65)"
                        : "0 0 0 3px rgba(34,197,94,0.2), 0 0 22px rgba(34,197,94,0.34), inset 0 0 0 1px rgba(255,255,255,0.65)",
                    background: isFocused
                      ? "rgba(239,68,68,0.08)"
                      : isPopup
                        ? "rgba(34,211,238,0.06)"
                        : "rgba(34,197,94,0.06)",
                    animation: isFocused ? "pulse 1.1s ease-in-out 2" : "none",
                  }}
                />
              );
            })}
          {!shouldShowFrameWelcome && (
            <div
              className={`w-full h-full transition-opacity duration-200 ${
                interactionMode === "preview"
                  ? "opacity-0 pointer-events-none"
                  : "opacity-100 pointer-events-auto"
              }`}
            >
              <EditorContent
                root={root}
                selectedId={selectedId}
                selectedPathIds={selectedPathIds}
                handleSelect={handleSelect}
                handleMoveElement={handleMoveElement}
                handleMoveElementByPosition={handleMoveElementByPosition}
                handleResize={handleResize}
                interactionMode={interactionMode}
                INJECTED_STYLES={injectedStyles}
              />
            </div>
          )}
          {interactionMode === "preview" &&
            previewMode === "edit" &&
            Array.isArray(previewSelectedPath) &&
            previewSelectedPath.length > 0 &&
            previewSelectionBox && (
              <div
                className="absolute z-30 pointer-events-none"
                style={{
                  left: `${previewSelectionBox.left}px`,
                  top: `${previewSelectionBox.top}px`,
                  width: `${previewSelectionBox.width}px`,
                  height: `${previewSelectionBox.height}px`,
                  border: "2px solid rgba(34,211,238,0.95)",
                  boxShadow:
                    "0 0 0 1px rgba(6,182,212,0.85), 0 0 0 6px rgba(34,211,238,0.12)",
                  borderRadius: "4px",
                }}
              >
                {RESIZE_HANDLES.map(([key, title, cursor, className, radius]) => (
                  <button
                    key={key}
                    type="button"
                    className={`pointer-events-auto absolute ${className}`}
                    style={{ cursor }}
                    title={title}
                    onMouseDown={(event) =>
                      handlePreviewResizeHandleMouseDown(
                        key as
                          | "n"
                          | "s"
                          | "e"
                          | "w"
                          | "ne"
                          | "nw"
                          | "se"
                          | "sw",
                        event,
                      )
                    }
                  >
                    <span
                      className="absolute inset-0"
                      style={{
                        borderRadius: radius,
                        background: "rgba(34, 211, 238, 0.82)",
                        border: "1px solid rgba(255,255,255,0.95)",
                        boxShadow:
                          "0 0 0 1px rgba(8,145,178,0.42), 0 4px 12px rgba(34,211,238,0.35)",
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default DeviceFrameScreen;
