import React from "react";
import { PreviewSelectionMode } from "../app/helpers/appHelpers";

type SelectionModeOption = {
  value: PreviewSelectionMode;
  label: string;
};

type BottomInspectorDockProps = {
  isOpen: boolean;
  theme: "light" | "dark";
  interactionMode: string;
  previewSelectionMode: PreviewSelectionMode;
  selectionModeOptions: SelectionModeOption[];
  onSelectMode: (value: PreviewSelectionMode) => void;
  onClose: () => void;
  dockWidth: number;
  dockHeight: number;
  children: React.ReactNode;
};

const BottomInspectorDock: React.FC<BottomInspectorDockProps> = ({
  isOpen,
  theme,
  interactionMode,
  previewSelectionMode,
  selectionModeOptions,
  onSelectMode,
  onClose,
  dockWidth,
  dockHeight,
  children,
}) => {
  return (
    <div
      className={`absolute left-1/2 bottom-0 z-40 no-scrollbar ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      } transition-transform duration-500`}
      style={{
        transform: isOpen
          ? "translate(-50%, 0)"
          : "translate(-50%, calc(100% + 0.75rem))",
        width: `${dockWidth}px`,
        height: `${dockHeight}px`,
      }}
    >
      <div
        className="h-full flex flex-col overflow-hidden rounded-t-[22px] border border-b-0"
        style={{
          borderColor:
            theme === "dark"
              ? "rgba(148,163,184,0.22)"
              : "rgba(15, 23, 42, 0.12)",
          background:
            theme === "dark"
              ? "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(17,24,39,0.96) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)",
          backdropFilter: "blur(14px)",
          boxShadow:
            theme === "dark"
              ? "0 -14px 32px rgba(2,6,23,0.34)"
              : "0 -14px 28px rgba(15,23,42,0.08)",
        }}
      >
        <div className="shrink-0 flex justify-center pt-1.5 pb-0.5">
          <div
            className="h-1 w-12 rounded-full"
            style={{
              background:
                theme === "dark"
                  ? "rgba(148,163,184,0.28)"
                  : "rgba(148,163,184,0.4)",
            }}
          />
        </div>
        <div
          className="h-8 shrink-0 px-3 flex items-center justify-between"
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
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: theme === "dark" ? "#ffffff" : "#8b5cf6",
                boxShadow:
                  theme === "dark"
                    ? "0 0 8px rgba(255,255,255,0.7)"
                    : "0 0 8px rgba(139,92,246,0.7)",
              }}
            />
            <span
              className="text-[10px] uppercase tracking-[0.18em] font-semibold"
              style={{ color: theme === "dark" ? "#cbd5e1" : "#475569" }}
            >
              Inspector
            </span>
            <span
              className="text-[10px]"
              style={{ color: theme === "dark" ? "#94a3b8" : "#64748b" }}
            >
              {interactionMode === "preview" ? "Preview" : "Canvas"}
            </span>
          </div>
          <button
            type="button"
            className="h-5 w-5 flex items-center justify-center rounded-md border transition-colors text-[11px] leading-none"
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
            onClick={onClose}
            title="Close inspector panel"
          >
            x
          </button>
        </div>
        {interactionMode === "preview" && (
          <div
            className="shrink-0 px-3 py-1 border-b"
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
            <div className="flex flex-wrap gap-1">
              {selectionModeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onSelectMode(option.value)}
                  className="px-2 py-[5px] rounded-full text-[8px] font-semibold uppercase tracking-wide transition-all"
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
                        : theme === "dark"
                          ? "rgba(15,23,42,0.68)"
                          : "rgba(241,245,249,0.9)",
                    border:
                      previewSelectionMode === option.value
                        ? "1px solid rgba(34,211,238,0.55)"
                        : theme === "dark"
                          ? "1px solid rgba(148,163,184,0.28)"
                          : "1px solid rgba(148,163,184,0.26)",
                  }}
                  title={option.label}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div
          className="min-h-0 flex-1 overflow-hidden text-[13px]"
          style={{
            background:
              theme === "dark"
                ? "rgba(15,23,42,0.48)"
                : "rgba(255,255,255,0.78)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default BottomInspectorDock;
