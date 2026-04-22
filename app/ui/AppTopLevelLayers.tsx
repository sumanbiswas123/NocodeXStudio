import React from "react";
import { DeviceContextMenu } from "../helpers/appHelpers";
import "../styles/ui/app-top-level-layers.css";

type AppTopLevelLayersProps = {
  theme: "light" | "dark";
  pageSwitchPromptState: {
    pendingSwitchFromLabel: string;
    pendingSwitchNextLabel: string;
    isPendingRefresh: boolean;
    isPendingPreviewMode: boolean;
    isPageSwitchPromptBusy: boolean;
  } | null;
  createFileModalState: {
    isOpen: boolean;
    parentPath: string;
    value: string;
    error: string | null;
  };
  createFolderModalState: {
    isOpen: boolean;
    parentPath: string;
    value: string;
    error: string | null;
  };
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
    closeCreateFileModal: () => void;
    confirmCreateFileModal: () => void;
    setCreateFileModalValue: (value: string) => void;
    closeCreateFolderModal: () => void;
    confirmCreateFolderModal: () => void;
    setCreateFolderModalValue: (value: string) => void;
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
  createFileModalState,
  createFolderModalState,
  deviceContextMenuState,
  actions,
}) => {
  const {
    closePendingPageSwitchPrompt,
    resolvePendingPageSwitchWithDiscard,
    resolvePendingPageSwitchWithSave,
    closeCreateFileModal,
    confirmCreateFileModal,
    setCreateFileModalValue,
    closeCreateFolderModal,
    confirmCreateFolderModal,
    setCreateFolderModalValue,
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
          className="page-switch-modal-backdrop"
          style={{
            background:
              theme === "dark" ? "rgba(2,6,23,0.58)" : "rgba(15,23,42,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="page-switch-modal"
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
            <div className="page-switch-modal-eyebrow">
              Unsaved Changes
            </div>
            <h3 className="page-switch-modal-title">
              {pageSwitchPromptState.isPendingRefresh
                ? "Save changes before refresh?"
                : pageSwitchPromptState.isPendingPreviewMode
                  ? "Save changes before switching mode?"
                  : "Save changes before switching page?"}
            </h3>
            <p className="page-switch-modal-copy">
              You have unsaved edits in{" "}
              <span className="page-switch-modal-emphasis">
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
                  <span className="page-switch-modal-emphasis">
                    {pageSwitchPromptState.pendingSwitchNextLabel}
                  </span>{" "}
                  can overwrite your in-memory edits.
                </>
              )}
            </p>
            <div className="page-switch-modal-actions">
              <button
                type="button"
                className="page-switch-modal-button"
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
                className="page-switch-modal-button page-switch-modal-button--discard"
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
                className="page-switch-modal-button page-switch-modal-button--save"
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

      {createFileModalState.isOpen && (
        <div
          className="page-switch-modal-backdrop"
          style={{
            background:
              theme === "dark" ? "rgba(2,6,23,0.58)" : "rgba(15,23,42,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="page-switch-modal"
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
            <div className="page-switch-modal-eyebrow">New Slide File</div>
            <h3 className="page-switch-modal-title">Create new slide file</h3>
            <p className="page-switch-modal-copy">
              Parent folder:
              {" "}
              <span className="page-switch-modal-emphasis">
                {createFileModalState.parentPath || "/"}
              </span>
            </p>
            <div style={{ marginTop: "0.75rem" }}>
              <input
                autoFocus
                value={createFileModalState.value}
                onChange={(event) => setCreateFileModalValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmCreateFileModal();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeCreateFileModal();
                  }
                }}
                placeholder="file-name.html"
                style={{
                  width: "100%",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border-color)",
                  background: "var(--input-bg)",
                  color: "var(--text-main)",
                  padding: "0.5rem 0.625rem",
                  fontSize: "0.8rem",
                }}
              />
              {createFileModalState.error ? (
                <div
                  style={{
                    marginTop: "0.35rem",
                    color: theme === "dark" ? "#fda4af" : "#be123c",
                    fontSize: "0.72rem",
                  }}
                >
                  {createFileModalState.error}
                </div>
              ) : null}
            </div>
            <div className="page-switch-modal-actions">
              <button
                type="button"
                className="page-switch-modal-button"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={closeCreateFileModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="page-switch-modal-button page-switch-modal-button--save"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(34,211,238,0.45)"
                      : "rgba(8,145,178,0.35)",
                  color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                }}
                onClick={confirmCreateFileModal}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {createFolderModalState.isOpen && (
        <div
          className="page-switch-modal-backdrop"
          style={{
            background:
              theme === "dark" ? "rgba(2,6,23,0.58)" : "rgba(15,23,42,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="page-switch-modal"
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
            <div className="page-switch-modal-eyebrow">New Slide Folder</div>
            <h3 className="page-switch-modal-title">Create new slide folder</h3>
            <p className="page-switch-modal-copy">
              Parent folder:
              {" "}
              <span className="page-switch-modal-emphasis">
                {createFolderModalState.parentPath || "/"}
              </span>
            </p>
            <div style={{ marginTop: "0.75rem" }}>
              <input
                autoFocus
                value={createFolderModalState.value}
                onChange={(event) =>
                  setCreateFolderModalValue(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmCreateFolderModal();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeCreateFolderModal();
                  }
                }}
                placeholder="new-folder"
                style={{
                  width: "100%",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border-color)",
                  background: "var(--input-bg)",
                  color: "var(--text-main)",
                  padding: "0.5rem 0.625rem",
                  fontSize: "0.8rem",
                }}
              />
              {createFolderModalState.error ? (
                <div
                  style={{
                    marginTop: "0.35rem",
                    color: theme === "dark" ? "#fda4af" : "#be123c",
                    fontSize: "0.72rem",
                  }}
                >
                  {createFolderModalState.error}
                </div>
              ) : null}
            </div>
            <div className="page-switch-modal-actions">
              <button
                type="button"
                className="page-switch-modal-button"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={closeCreateFolderModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="page-switch-modal-button page-switch-modal-button--save"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(34,211,238,0.45)"
                      : "rgba(8,145,178,0.35)",
                  color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                }}
                onClick={confirmCreateFolderModal}
              >
                Create
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
