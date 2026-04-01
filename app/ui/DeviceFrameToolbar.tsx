import React from "react";
import {
  Camera,
  Moon,
  MousePointer2,
  Move,
  Redo2,
  RotateCw,
  Sun,
  Tablet,
  Undo2,
} from "lucide-react";
import type { PreviewSelectionMode } from "../helpers/appHelpers";
import "../styles/ui/device-frame-toolbar.css";

type DeviceFrameToolbarProps = {
  currentDevicePixelRatio: number;
  deviceMode: "desktop" | "mobile" | "tablet";
  dirtyFileCount: number;
  frameZoom: 50 | 75 | 100;
  handlePreviewRefresh: () => void;
  handleSidebarInteractionModeChange: (
    mode: "edit" | "preview" | "inspect" | "draw" | "move",
  ) => void;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  openScreenshotGallery: (captureAfterOpen?: boolean) => void;
  previewMode: "edit" | "preview";
  previewSelectionMode: PreviewSelectionMode;
  projectPath: string | null;
  runRedo: () => void;
  runUndo: () => void;
  screenshotCaptureBusy: boolean;
  setDeviceCtxMenu: React.Dispatch<
    React.SetStateAction<{
      type: "mobile" | "desktop" | "tablet";
      x: number;
      y: number;
    } | null>
  >;
  setDeviceMode: React.Dispatch<
    React.SetStateAction<"desktop" | "mobile" | "tablet">
  >;
  setFrameZoom: React.Dispatch<React.SetStateAction<50 | 75 | 100>>;
  setPreviewModeWithSync: (mode: "edit" | "preview") => void;
  setPreviewSelectionMode: React.Dispatch<
    React.SetStateAction<PreviewSelectionMode>
  >;
  setTabletOrientation: React.Dispatch<
    React.SetStateAction<"landscape" | "portrait">
  >;
  showScreenshotFeatures: boolean;
  sidebarInteractionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  showToolbar: boolean;
  tabletOrientation: "landscape" | "portrait";
  theme: "dark" | "light";
  toggleThemeWithTransition: () => void;
};

const DeviceFrameToolbar: React.FC<DeviceFrameToolbarProps> = ({
  currentDevicePixelRatio,
  deviceMode,
  dirtyFileCount,
  frameZoom,
  handlePreviewRefresh,
  handleSidebarInteractionModeChange,
  interactionMode,
  openScreenshotGallery,
  previewMode,
  previewSelectionMode,
  projectPath,
  runRedo,
  runUndo,
  screenshotCaptureBusy,
  setDeviceCtxMenu,
  setDeviceMode,
  setFrameZoom,
  setPreviewModeWithSync,
  setPreviewSelectionMode,
  setTabletOrientation,
  showScreenshotFeatures,
  sidebarInteractionMode,
  showToolbar,
  tabletOrientation,
  theme,
  toggleThemeWithTransition,
}) => {
  if (!showToolbar) return null;

  return (
    <>
      <div
        className="device-toolbar-left device-toolbar-left--slide-in"
      >
        <div
          className="device-toolbar-left-panel"
          style={{
            background:
              theme === "dark"
                ? "rgba(12,18,30,0.96)"
                : "rgba(248,250,252,0.96)",
            borderColor:
              theme === "dark"
                ? "rgba(199,208,220,0.42)"
                : "rgba(15,23,42,0.14)",
            boxShadow:
              theme === "dark"
                ? "0 10px 24px rgba(2,6,23,0.34)"
                : "0 10px 24px rgba(15,23,42,0.10)",
            backdropFilter: "none",
            borderBottomWidth: 0,
          }}
        >
          <button
            className={`device-toolbar-icon-button ${deviceMode === "tablet" ? "device-toolbar-icon-button--active" : ""}`}
            onClick={() => {
              setDeviceMode("tablet");
              setTabletOrientation((prev) =>
                prev === "landscape" ? "portrait" : "landscape",
              );
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setDeviceMode("tablet");
              setDeviceCtxMenu({
                type: "tablet",
                x: e.clientX,
                y: e.clientY,
              });
            }}
            title={`iPad (${tabletOrientation === "landscape" ? "Landscape" : "Portrait"}) - click to rotate, right-click for model`}
          >
            <Tablet
              size={16}
              className="device-toolbar-icon"
              style={{
                transform: `rotate(${tabletOrientation === "landscape" ? 90 : 0}deg)`,
              }}
            />
          </button>
          <button
            className="device-toolbar-icon-button"
            onClick={handlePreviewRefresh}
            title="Refresh iPad content (Ctrl+T)"
          >
            <RotateCw size={16} />
          </button>
          {currentDevicePixelRatio >= 1.5 && (
            <>
              <div className="device-toolbar-divider"></div>
              <div className="device-toolbar-zoom-group">
                {[50, 75, 100].map((zoom) => (
                  <button
                    key={zoom}
                    onClick={() => setFrameZoom(zoom as 50 | 75 | 100)}
                    className="device-toolbar-zoom-button"
                    style={{
                      color:
                        frameZoom === zoom
                          ? theme === "light"
                            ? "#0e7490"
                            : "#a5b4fc"
                          : theme === "light"
                            ? "#64748b"
                            : "#d1d5db",
                      background:
                        frameZoom === zoom
                          ? theme === "light"
                            ? "rgba(6,182,212,0.2)"
                            : "rgba(99,102,241,0.25)"
                          : "transparent",
                      border:
                        frameZoom === zoom
                          ? theme === "light"
                            ? "1px solid rgba(6,182,212,0.35)"
                            : "1px solid rgba(99,102,241,0.35)"
                          : "1px solid transparent",
                    }}
                    title={`Set frame zoom to ${zoom}%`}
                  >
                    {zoom}%
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="device-toolbar-divider"></div>
          <button
            className="device-toolbar-icon-button"
            onClick={toggleThemeWithTransition}
            title="Toggle Theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="device-toolbar-divider"></div>
          <button
            className="device-toolbar-icon-button"
            onClick={runUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="device-toolbar-icon-button"
            onClick={runRedo}
            title="Redo (Ctrl+U)"
          >
            <Redo2 size={16} />
          </button>
          <div className="device-toolbar-divider"></div>
          <span
            className="device-toolbar-status-dot"
            style={{
              backgroundColor: dirtyFileCount > 0 ? "#f59e0b" : "#22c55e",
            }}
            aria-hidden="true"
          />
          {interactionMode === "preview" && (
            <div className="device-toolbar-preview-mode-group">
              <button
                onClick={() => setPreviewModeWithSync("edit")}
                className="device-toolbar-mode-button"
                style={{
                  color:
                    previewMode === "edit"
                      ? theme === "light"
                        ? "#b45309"
                        : "#fde68a"
                      : theme === "light"
                        ? "#64748b"
                        : "#d1d5db",
                  background:
                    previewMode === "edit"
                      ? theme === "light"
                        ? "rgba(245,158,11,0.2)"
                        : "rgba(245,158,11,0.25)"
                      : "transparent",
                  border:
                    previewMode === "edit"
                      ? "1px solid rgba(245,158,11,0.35)"
                      : "1px solid transparent",
                }}
                title="LIVE Edit mode: select and edit elements"
              >
                Edit
              </button>
              <button
                onClick={() => setPreviewModeWithSync("preview")}
                className="device-toolbar-mode-button"
                style={{
                  color:
                    previewMode === "preview"
                      ? theme === "light"
                        ? "#047857"
                        : "#bbf7d0"
                      : theme === "light"
                        ? "#64748b"
                        : "#d1d5db",
                  background:
                    previewMode === "preview"
                      ? theme === "light"
                        ? "rgba(16,185,129,0.2)"
                        : "rgba(16,185,129,0.25)"
                      : "transparent",
                  border:
                    previewMode === "preview"
                      ? "1px solid rgba(16,185,129,0.35)"
                      : "1px solid transparent",
                }}
                title="LIVE Preview mode: navigate and interact"
              >
                Preview
              </button>
            </div>
          )}
        </div>
      </div>
      {deviceMode === "tablet" && (
        <div
          className="device-toolbar-right device-toolbar-right--slide-in"
        >
          <div
            className="device-toolbar-right-content"
            style={{
              background: "transparent",
              border: "none",
              boxShadow: "none",
              backdropFilter: "none",
            }}
          >
            <div
              className="device-toolbar-selection-panel-shell"
              style={{
                maxWidth: sidebarInteractionMode === "inspect" ? "18rem" : "0rem",
                opacity: sidebarInteractionMode === "inspect" ? 1 : 0,
                transform:
                  sidebarInteractionMode === "inspect"
                    ? "translateY(0) scale(1)"
                    : "translateY(16px) scale(0.96)",
                transformOrigin: "bottom right",
              }}
            >
              <div
                className="device-toolbar-selection-panel"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(199,208,220,0.42)"
                      : "rgba(15,23,42,0.14)",
                  background:
                    theme === "dark"
                      ? "rgba(12,18,30,0.96)"
                      : "rgba(248,250,252,0.96)",
                  boxShadow:
                    theme === "dark"
                      ? "0 10px 24px rgba(2,6,23,0.34)"
                      : "0 10px 24px rgba(15,23,42,0.10)",
                  backdropFilter: "none",
                  borderBottomWidth: 0,
                }}
              >
                <div
                  className="device-toolbar-selection-pill-group"
                  style={{
                    borderColor:
                      theme === "dark"
                        ? "rgba(148,163,184,0.28)"
                        : "rgba(15,23,42,0.12)",
                    background:
                      theme === "dark"
                        ? "rgba(15,23,42,0.55)"
                        : "rgba(255,255,255,0.82)",
                  }}
                >
                  {[
                    { value: "default", label: "Default" },
                    { value: "text", label: "Text" },
                    { value: "image", label: "Assets" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="device-toolbar-selection-button"
                      style={{
                        color:
                          previewSelectionMode === option.value
                            ? theme === "dark"
                              ? "#ecfeff"
                              : "#155e75"
                            : theme === "dark"
                              ? "#cbd5e1"
                              : "#475569",
                        background:
                          previewSelectionMode === option.value
                            ? theme === "dark"
                              ? "rgba(34,211,238,0.2)"
                              : "rgba(14,165,233,0.16)"
                            : "transparent",
                        border:
                          previewSelectionMode === option.value
                            ? "1px solid rgba(34,211,238,0.42)"
                            : "1px solid transparent",
                      }}
                      onClick={() =>
                        setPreviewSelectionMode(
                          option.value as PreviewSelectionMode,
                        )
                      }
                      title={option.label}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div
              className="device-toolbar-inspect-panel"
              style={{
                borderColor:
                  theme === "dark"
                    ? "rgba(199,208,220,0.42)"
                    : "rgba(15,23,42,0.14)",
                background:
                  theme === "dark"
                    ? "rgba(12,18,30,0.96)"
                    : "rgba(248,250,252,0.96)",
                boxShadow:
                  theme === "dark"
                    ? "0 10px 24px rgba(2,6,23,0.34)"
                    : "0 10px 24px rgba(15,23,42,0.10)",
                backdropFilter: "none",
                borderBottomWidth: 0,
              }}
            >
              <div
                className="device-toolbar-inspect-controls"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(148,163,184,0.28)"
                      : "rgba(15,23,42,0.12)",
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.55)"
                      : "rgba(255,255,255,0.82)",
                }}
              >
                <button
                  type="button"
                  className="device-toolbar-inspect-button"
                  onClick={() => handleSidebarInteractionModeChange("inspect")}
                  title="Select Element"
                  style={{
                    borderRadius: "8px",
                    color:
                      sidebarInteractionMode === "inspect"
                        ? theme === "dark"
                          ? "#67e8f9"
                          : "#0891b2"
                        : undefined,
                    background:
                      sidebarInteractionMode === "inspect"
                        ? theme === "dark"
                          ? "rgba(34,211,238,0.18)"
                          : "rgba(6,182,212,0.14)"
                        : undefined,
                  }}
                >
                  <MousePointer2 size={16} />
                </button>
                <button
                  type="button"
                  className="device-toolbar-inspect-button"
                  onClick={() => handleSidebarInteractionModeChange("move")}
                  title="Move Element"
                  style={{
                    borderRadius: "8px",
                    color:
                      sidebarInteractionMode === "move"
                        ? theme === "dark"
                          ? "#fbbf24"
                          : "#b45309"
                        : undefined,
                    background:
                      sidebarInteractionMode === "move"
                        ? theme === "dark"
                          ? "rgba(245,158,11,0.2)"
                          : "rgba(245,158,11,0.14)"
                        : undefined,
                  }}
                >
                  <Move size={16} />
                </button>
              </div>
            </div>
            {showScreenshotFeatures && (
              <button
                className={`device-toolbar-screenshot-button ${screenshotCaptureBusy ? "device-toolbar-screenshot-button--busy" : ""}`}
                onClick={() => openScreenshotGallery(true)}
                disabled={screenshotCaptureBusy || !projectPath}
                title={
                  projectPath
                    ? "Capture iPad screenshot"
                    : "Open a presentation first"
                }
                style={{ borderRadius: "8px" }}
              >
                <Camera size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DeviceFrameToolbar;
