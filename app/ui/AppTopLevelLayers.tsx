import React from "react";
import { DeviceContextMenu } from "../helpers/appHelpers";

type AppTopLevelLayersProps = {
  theme: "light" | "dark";
  pageSwitchPromptState: {
    pendingSwitchFromLabel: string;
    pendingSwitchNextLabel: string;
    isPendingRefresh: boolean;
    isPendingPreviewMode: boolean;
    isPageSwitchPromptBusy: boolean;
  } | null;
  deviceContextMenuState: {
    menu:
      | {
          x: number;
          y: number;
          type: "desktop" | "mobile" | "tablet";
        }
      | null;
    mobileFrameStyle: "dynamic-island" | "punch-hole" | "notch";
    desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
    tabletModel: "ipad" | "ipad-pro";
    tabletOrientation: "portrait" | "landscape";
  };
  actions: {
    closePendingPageSwitchPrompt: () => void;
    resolvePendingPageSwitchWithDiscard: () => Promise<void>;
    resolvePendingPageSwitchWithSave: () => Promise<void>;
    setMobileFrameStyle: (
      style: "dynamic-island" | "punch-hole" | "notch",
    ) => void;
    setDesktopResolution: (
      resolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable",
    ) => void;
    setTabletModel: (model: "ipad" | "ipad-pro") => void;
    closeDeviceContextMenu: () => void;
  };
};

const AppTopLevelLayers: React.FC<AppTopLevelLayersProps> = ({
  theme,
  pageSwitchPromptState,
  deviceContextMenuState,
  actions,
}) => {
  const {
    closePendingPageSwitchPrompt,
    resolvePendingPageSwitchWithDiscard,
    resolvePendingPageSwitchWithSave,
    setMobileFrameStyle,
    setDesktopResolution,
    setTabletModel,
    closeDeviceContextMenu,
  } = actions;
  const deviceCtxMenu = deviceContextMenuState.menu;

  return (
    <>
      {pageSwitchPromptState && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{
            background:
              theme === "dark" ? "rgba(2,6,23,0.58)" : "rgba(15,23,42,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl p-5"
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
              borderColor:
                theme === "dark"
                  ? "rgba(148,163,184,0.32)"
                  : "rgba(15,23,42,0.12)",
              color: "var(--text-main)",
            }}
          >
            <div
              className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Unsaved Changes
            </div>
            <h3 className="text-base font-semibold leading-tight">
              {pageSwitchPromptState.isPendingRefresh
                ? "Save changes before refresh?"
                : pageSwitchPromptState.isPendingPreviewMode
                  ? "Save changes before switching mode?"
                  : "Save changes before switching page?"}
            </h3>
            <p
              className="text-xs mt-2 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              You have unsaved edits in{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--text-main)" }}
              >
                {pageSwitchPromptState.pendingSwitchFromLabel}
              </span>
              .
              {pageSwitchPromptState.isPendingRefresh ? (
                <> Refresh can overwrite your in-memory edits.</>
              ) : pageSwitchPromptState.isPendingPreviewMode ? (
                <> Switching to Preview mode can overwrite your in-memory edits.</>
              ) : (
                <>
                  {" "}
                  Switching to{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-main)" }}
                  >
                    {pageSwitchPromptState.pendingSwitchNextLabel}
                  </span>{" "}
                  can overwrite your in-memory edits.
                </>
              )}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-black/5"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                  opacity: pageSwitchPromptState.isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={closePendingPageSwitchPrompt}
                disabled={pageSwitchPromptState.isPageSwitchPromptBusy}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-rose-500/10"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(251,113,133,0.45)"
                      : "rgba(225,29,72,0.35)",
                  color: theme === "dark" ? "#fecdd3" : "#be123c",
                  opacity: pageSwitchPromptState.isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={() => {
                  void resolvePendingPageSwitchWithDiscard();
                }}
                disabled={pageSwitchPromptState.isPageSwitchPromptBusy}
              >
                {pageSwitchPromptState.isPendingRefresh
                  ? "Discard & Refresh"
                  : "Discard & Switch"}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-cyan-500/15"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(34,211,238,0.45)"
                      : "rgba(8,145,178,0.35)",
                  color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                  opacity: pageSwitchPromptState.isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={() => {
                  void resolvePendingPageSwitchWithSave();
                }}
                disabled={pageSwitchPromptState.isPageSwitchPromptBusy}
              >
                {pageSwitchPromptState.isPageSwitchPromptBusy
                  ? "Working..."
                  : pageSwitchPromptState.isPendingRefresh
                    ? "Save & Refresh"
                    : "Save & Switch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deviceCtxMenu && (
        <DeviceContextMenu
          type={deviceCtxMenu.type}
          position={{ x: deviceCtxMenu.x, y: deviceCtxMenu.y }}
          mobileFrameStyle={deviceContextMenuState.mobileFrameStyle}
          setMobileFrameStyle={setMobileFrameStyle}
          desktopResolution={deviceContextMenuState.desktopResolution}
          setDesktopResolution={setDesktopResolution}
          tabletModel={deviceContextMenuState.tabletModel}
          tabletOrientation={deviceContextMenuState.tabletOrientation}
          setTabletModel={setTabletModel}
          onClose={closeDeviceContextMenu}
        />
      )}
    </>
  );
};

export default AppTopLevelLayers;
