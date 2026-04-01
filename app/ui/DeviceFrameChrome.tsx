import React from "react";
import { Globe, Wifi } from "lucide-react";
import "../styles/ui/device-frame-chrome.css";

type DeviceFrameChromeProps = {
  children: React.ReactNode;
  darkTabletReflectionOpacity: number;
  deviceMode: "desktop" | "mobile" | "tablet";
  mobileFrameStyle: "dynamic-island" | "punch-hole" | "notch";
  theme: "dark" | "light";
};

const DeviceFrameChrome: React.FC<DeviceFrameChromeProps> = ({
  children,
  darkTabletReflectionOpacity,
  deviceMode,
  mobileFrameStyle,
  theme,
}) => {
  return (
    <div
      className={`device-frame-chrome ${
        deviceMode === "desktop"
          ? "device-frame-chrome--desktop"
          : deviceMode === "tablet"
            ? "device-frame-chrome--tablet"
            : "device-frame-chrome--mobile"
      }`}
      style={{
        borderColor:
          deviceMode === "desktop"
            ? "#1e293b"
            : deviceMode === "tablet"
              ? theme === "dark"
                ? "#c7d0dc"
                : "#0f172a"
              : "#000000",
        background:
          deviceMode === "tablet" && theme === "dark"
            ? [
                "linear-gradient(145deg, #eef3fa 0%, #cfd8e5 16%, #9aa7b8 34%, #748396 50%, #9fadbe 68%, #dce4ee 84%, #f3f7fb 100%)",
                "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.06) 24%, rgba(0,0,0,0.12) 100%)",
                "radial-gradient(130% 70% at 50% -5%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.0) 62%)",
              ].join(", ")
            : "#000000",
        boxShadow:
          deviceMode === "tablet" && theme === "dark"
            ? "0 28px 62px -16px rgba(0,0,0,0.62), 0 0 0 1px rgba(203,213,225,0.22), 0 0 28px rgba(148,163,184,0.2), inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -1px 0 rgba(255,255,255,0.22), inset 1px 0 0 rgba(255,255,255,0.2), inset -1px 0 0 rgba(0,0,0,0.26)"
            : "0 20px 50px -10px rgba(0,0,0,0.5)",
      }}
    >
      {deviceMode === "tablet" && theme === "dark" && (
        <>
          <div
            className="device-frame-tablet-sheen device-frame-tablet-sheen--primary"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.13) 18%, rgba(255,255,255,0.03) 36%, rgba(0,0,0,0.06) 100%)",
            }}
          />
          <div
            className="device-frame-tablet-sheen device-frame-tablet-sheen--texture"
            style={{
              background: [
                "linear-gradient(120deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.0) 28%, rgba(255,255,255,0.0) 72%, rgba(255,255,255,0.22) 100%)",
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 3px)",
              ].join(", "),
              opacity: 0.3,
            }}
          />
          <div
            className="device-frame-tablet-sheen device-frame-tablet-sheen--reflection"
            style={{
              opacity: darkTabletReflectionOpacity,
              background: [
                "radial-gradient(60% 26% at 50% -4%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.0) 78%)",
                "radial-gradient(40% 34% at 6% 18%, rgba(147,197,253,0.42) 0%, rgba(147,197,253,0.0) 72%)",
                "radial-gradient(40% 34% at 94% 18%, rgba(167,243,208,0.4) 0%, rgba(167,243,208,0.0) 72%)",
              ].join(", "),
            }}
          />
          <div
            className="device-frame-tablet-sheen device-frame-tablet-sheen--glint"
            style={{
              opacity: Math.min(0.56, darkTabletReflectionOpacity * 0.9),
              background:
                "linear-gradient(112deg, rgba(255,255,255,0.0) 18%, rgba(255,255,255,0.42) 31%, rgba(255,255,255,0.0) 46%, rgba(255,255,255,0.0) 60%, rgba(255,255,255,0.28) 71%, rgba(255,255,255,0.0) 85%)",
            }}
          />
          <div
            className="device-frame-tablet-sheen device-frame-tablet-sheen--frame"
            style={{
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 0 26px rgba(255,255,255,0.08)",
            }}
          />
        </>
      )}

      <div
        className={`device-frame-top-bar ${
          deviceMode === "desktop"
            ? "device-frame-top-bar--desktop"
            : deviceMode === "tablet"
              ? "device-frame-top-bar--tablet"
              : mobileFrameStyle === "dynamic-island"
                ? "device-frame-top-bar--mobile-island"
                : mobileFrameStyle === "notch"
                  ? "device-frame-top-bar--mobile-notch"
                  : "device-frame-top-bar--mobile-punch"
        }`}
        style={{
          background:
            deviceMode === "desktop"
              ? "#1e293b"
              : deviceMode === "tablet"
                ? theme === "dark"
                  ? "#5f6f82"
                  : "#0f172a"
                : "#000",
        }}
      >
        <div
          className={`device-frame-window-controls ${
            deviceMode === "desktop"
              ? "device-frame-window-controls--visible"
              : "device-frame-window-controls--hidden"
          }`}
        >
          <div className="device-frame-window-dot" style={{ background: "#ff5f57" }}></div>
          <div className="device-frame-window-dot" style={{ background: "#febc2e" }}></div>
          <div className="device-frame-window-dot" style={{ background: "#28c840" }}></div>
        </div>

        <div
          className={`device-frame-address-shell ${
            deviceMode === "desktop"
              ? "device-frame-address-shell--visible"
              : "device-frame-address-shell--hidden"
          }`}
        >
          <div className="device-frame-address-bar">
            <Globe size={10} />
            <span>nocode-x-preview.app</span>
          </div>
        </div>

        {mobileFrameStyle === "dynamic-island" && (
          <div
            className={`device-frame-island-speaker ${
              deviceMode === "mobile"
                ? "device-frame-island-speaker--visible"
                : "device-frame-island-speaker--hidden"
            }`}
          ></div>
        )}
      </div>

      <div
        className={`device-frame-status-bar ${
          deviceMode === "mobile"
            ? "device-frame-status-bar--visible"
            : "device-frame-status-bar--hidden"
        }`}
      >
        <div className="device-frame-status-time">
          9:41
        </div>
        <div className="device-frame-status-icons">
          <Wifi size={12} />
          <div className="device-frame-battery">
            <div className="device-frame-battery-fill"></div>
          </div>
        </div>
      </div>

      {children}

      <div
        className={`device-frame-home-indicator ${
          deviceMode === "mobile"
            ? "device-frame-home-indicator--visible"
            : "device-frame-home-indicator--hidden"
        }`}
      ></div>
    </div>
  );
};

export default DeviceFrameChrome;
