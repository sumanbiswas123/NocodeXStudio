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
        className="absolute left-5 bottom-full z-0 transition-all animate-slideDown"
        style={{ marginBottom: "-10px" }}
      >
        <div
          className="px-3 pt-1 pb-3 flex items-center gap-2 min-w-0 rounded-t-[16px] rounded-b-none border"
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
            className={`glass-icon-btn navbar-icon-btn ${deviceMode === "tablet" ? "active" : ""}`}
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
              className="transition-transform duration-300 ease-out"
              style={{
                transform: `rotate(${tabletOrientation === "landscape" ? 90 : 0}deg)`,
              }}
            />
          </button>
          <button
            className="glass-icon-btn navbar-icon-btn"
            onClick={handlePreviewRefresh}
            title="Refresh iPad content (Ctrl+T)"
          >
            <RotateCw size={16} />
          </button>
          {currentDevicePixelRatio >= 1.5 && (
            <>
              <div className="h-4 w-px bg-gray-500/20"></div>
              <div className="flex items-center gap-0.5 rounded-full px-0.5 py-0.5 border border-gray-500/20">
                {[50, 75, 100].map((zoom) => (
                  <button
                    key={zoom}
                    onClick={() => setFrameZoom(zoom as 50 | 75 | 100)}
                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all ${
                      frameZoom === zoom
                        ? theme === "light"
                          ? "bg-cyan-500/20 text-cyan-700 border border-cyan-500/35"
                          : "bg-indigo-500/25 text-indigo-300"
                        : theme === "light"
                          ? "text-slate-500"
                          : "text-gray-300"
                    }`}
                    title={`Set frame zoom to ${zoom}%`}
                  >
                    {zoom}%
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className="glass-icon-btn navbar-icon-btn"
            onClick={toggleThemeWithTransition}
            title="Toggle Theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className="glass-icon-btn navbar-icon-btn"
            onClick={runUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="glass-icon-btn navbar-icon-btn"
            onClick={runRedo}
            title="Redo (Ctrl+U)"
          >
            <Redo2 size={16} />
          </button>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: dirtyFileCount > 0 ? "#f59e0b" : "#22c55e",
            }}
            aria-hidden="true"
          />
          {interactionMode === "preview" && (
            <div className="flex items-center gap-1 rounded-full px-1 py-1 border border-gray-500/20">
              <button
                onClick={() => setPreviewModeWithSync("edit")}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  previewMode === "edit"
                    ? theme === "light"
                      ? "bg-amber-500/20 text-amber-700 border border-amber-500/35"
                      : "bg-amber-500/25 text-amber-200 border border-amber-500/35"
                    : theme === "light"
                      ? "text-slate-500"
                      : "text-gray-300"
                }`}
                title="LIVE Edit mode: select and edit elements"
              >
                Edit
              </button>
              <button
                onClick={() => setPreviewModeWithSync("preview")}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  previewMode === "preview"
                    ? theme === "light"
                      ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/35"
                      : "bg-emerald-500/25 text-emerald-200 border border-emerald-500/35"
                    : theme === "light"
                      ? "text-slate-500"
                      : "text-gray-300"
                }`}
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
          className="absolute right-5 bottom-full z-0 transition-all animate-slideDown"
          style={{
            marginBottom: "-20px",
            transform: "translateY(3px)",
          }}
        >
          <div
            className="px-0.5 pt-1 pb-3 flex items-end gap-3"
            style={{
              background: "transparent",
              border: "none",
              boxShadow: "none",
              backdropFilter: "none",
            }}
          >
            <div
              className="shrink-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
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
                className="rounded-t-[10px] rounded-b-none border px-2 pt-1 pb-3"
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
                  className="flex items-center gap-1 rounded-full border px-1.5 py-[2px]"
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
                      className="rounded-full px-2 py-[3px] text-[8px] font-semibold uppercase tracking-[0.12em] transition-all"
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
              className="rounded-t-[10px] rounded-b-none border px-2 pt-1 pb-3"
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
                className="flex items-center gap-1 rounded-[10px] px-1 py-1 border"
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
                  className="glass-icon-btn navbar-icon-btn rounded-md"
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
                  className="glass-icon-btn navbar-icon-btn rounded-md"
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
                className={`glass-icon-btn navbar-icon-btn rounded-md ${
                  screenshotCaptureBusy ? "opacity-60" : ""
                }`}
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
