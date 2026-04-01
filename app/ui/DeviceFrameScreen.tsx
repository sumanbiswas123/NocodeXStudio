import React from "react";
import EditorContent from "./EditorContent";
import type { PdfAnnotationUiRecord } from "../helpers/pdfAnnotationHelpers";
import type { VirtualElement } from "../../types";
import "../styles/ui/device-frame-screen.css";

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
  ["n", "Resize from top", "ns-resize", "device-frame-resize-handle--n", "999px"],
  ["s", "Resize from bottom", "ns-resize", "device-frame-resize-handle--s", "999px"],
  ["e", "Resize from right", "ew-resize", "device-frame-resize-handle--e", "999px"],
  ["w", "Resize from left", "ew-resize", "device-frame-resize-handle--w", "999px"],
  ["nw", "Resize from top left", "nwse-resize", "device-frame-resize-handle--nw", "6px"],
  ["ne", "Resize from top right", "nesw-resize", "device-frame-resize-handle--ne", "6px"],
  ["sw", "Resize from bottom left", "nesw-resize", "device-frame-resize-handle--sw", "6px"],
  ["se", "Resize from bottom right", "nwse-resize", "device-frame-resize-handle--se", "6px"],
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
      className={`device-frame-screen ${
        deviceMode === "desktop"
          ? "device-frame-screen--desktop"
          : deviceMode === "tablet"
            ? "device-frame-screen--tablet"
            : "device-frame-screen--mobile"
      }`}
    >
      <div
        className="device-frame-screen-content"
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
          className="device-frame-screen-stage"
          onDragOver={handlePreviewStageDragOver}
          onDrop={handlePreviewStageDrop}
        >
          {shouldShowFrameWelcome && (
            <div className="device-frame-welcome">
              <div
                className="device-frame-welcome-card"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.92) 100%)",
                  borderColor: "rgba(15,23,42,0.12)",
                  color: "#0f172a",
                  backdropFilter: "none",
                }}
              >
                <div className="device-frame-welcome-title">
                  Welcome To NoCode X
                </div>
                <p className="device-frame-welcome-copy">
                  Open a previous presentation or choose a new project folder directly from the frame.
                </p>
                <div className="device-frame-welcome-actions">
                  <button
                    type="button"
                    className="device-frame-welcome-button"
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
                  <div className="device-frame-welcome-recent">
                    <div className="device-frame-welcome-recent-heading">
                      Recent Presentations
                    </div>
                    <div className="device-frame-welcome-recent-list">
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
                            className="device-frame-welcome-recent-item"
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
                            <div className="device-frame-welcome-recent-name">
                              {recentName}
                            </div>
                            <div className="device-frame-welcome-recent-path">
                              {recentPath}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {projectPath ? (
                  <div className="device-frame-welcome-current-project">
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
              className={`device-frame-preview-iframe ${
                interactionMode === "preview"
                  ? isToolboxDragging
                    ? "device-frame-preview-iframe--passive"
                    : "device-frame-preview-iframe--interactive"
                  : "device-frame-preview-iframe--hidden"
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
                  className={`device-frame-annotation-box ${
                    isFocused
                      ? "device-frame-annotation-box--focused"
                      : "device-frame-annotation-box--default"
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
              className={`device-frame-editor-layer ${
                interactionMode === "preview"
                  ? "device-frame-editor-layer--hidden"
                  : "device-frame-editor-layer--visible"
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
                className="device-frame-selection-box"
                style={{
                  left: `${previewSelectionBox.left}px`,
                  top: `${previewSelectionBox.top}px`,
                  width: `${previewSelectionBox.width}px`,
                  height: `${previewSelectionBox.height}px`,
                }}
              >
                {RESIZE_HANDLES.map(([key, title, cursor, className, radius]) => (
                  <button
                    key={key}
                    type="button"
                    className={`device-frame-resize-handle ${className}`}
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
                      className="device-frame-resize-grip"
                      style={{
                        borderRadius: radius,
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
