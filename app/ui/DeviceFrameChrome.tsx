import React from "react";
import { Globe, Wifi } from "lucide-react";

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
      className={`
        relative z-10 shrink-0 transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]
        ${
          deviceMode === "desktop"
            ? "rounded-xl border-4"
            : deviceMode === "tablet"
              ? "w-full h-full rounded-[42px] border-[10px]"
              : "w-full h-full rounded-[50px] border-[12px]"
        }
      `}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
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
            className="pointer-events-none absolute inset-[2px] rounded-[34px]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.13) 18%, rgba(255,255,255,0.03) 36%, rgba(0,0,0,0.06) 100%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-[1px] rounded-[36px]"
            style={{
              background: [
                "linear-gradient(120deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.0) 28%, rgba(255,255,255,0.0) 72%, rgba(255,255,255,0.22) 100%)",
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 3px)",
              ].join(", "),
              opacity: 0.3,
            }}
          />
          <div
            className="pointer-events-none absolute inset-[0px] rounded-[36px]"
            style={{
              opacity: darkTabletReflectionOpacity,
              mixBlendMode: "screen",
              background: [
                "radial-gradient(60% 26% at 50% -4%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.0) 78%)",
                "radial-gradient(40% 34% at 6% 18%, rgba(147,197,253,0.42) 0%, rgba(147,197,253,0.0) 72%)",
                "radial-gradient(40% 34% at 94% 18%, rgba(167,243,208,0.4) 0%, rgba(167,243,208,0.0) 72%)",
              ].join(", "),
            }}
          />
          <div
            className="pointer-events-none absolute inset-[0px] rounded-[36px]"
            style={{
              opacity: Math.min(0.56, darkTabletReflectionOpacity * 0.9),
              background:
                "linear-gradient(112deg, rgba(255,255,255,0.0) 18%, rgba(255,255,255,0.42) 31%, rgba(255,255,255,0.0) 46%, rgba(255,255,255,0.0) 60%, rgba(255,255,255,0.28) 71%, rgba(255,255,255,0.0) 85%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-[3px] rounded-[33px]"
            style={{
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 0 26px rgba(255,255,255,0.08)",
            }}
          />
        </>
      )}

      <div
        className={`
          absolute top-0 left-1/2 -translate-x-1/2 z-20 ${deviceMode === "desktop" ? "bg-[#1e293b]" : deviceMode === "tablet" ? (theme === "dark" ? "bg-[#5f6f82]" : "bg-[#0f172a]") : "bg-black"}
          transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)] flex items-center justify-center overflow-hidden
          ${
            deviceMode === "desktop"
              ? "w-full h-9 rounded-t-lg rounded-b-none px-4"
              : deviceMode === "tablet"
                ? "w-[120px] h-[9px] rounded-full top-[12px] px-0"
                : mobileFrameStyle === "dynamic-island"
                  ? "w-[120px] h-[35px] rounded-full top-[11px] px-0"
                  : mobileFrameStyle === "notch"
                    ? "w-[160px] h-[30px] rounded-b-[20px] rounded-t-none px-0"
                    : "w-[10px] h-[10px] rounded-full top-[12px] left-1/2 -translate-x-1/2"
          }
        `}
      >
        <div
          className={`absolute left-4 flex gap-1.5 transition-opacity duration-500 ${deviceMode === "desktop" ? "opacity-100 delay-200" : "opacity-0"}`}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"></div>
        </div>

        <div
          className={`transition-opacity duration-300 ${deviceMode === "desktop" ? "opacity-100 delay-200" : "opacity-0"}`}
        >
          <div className="bg-black/30 h-5 w-64 rounded-md flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono">
            <Globe size={10} />
            <span>nocode-x-preview.app</span>
          </div>
        </div>

        {mobileFrameStyle === "dynamic-island" && (
          <div
            className={`absolute top-2 w-12 h-1 bg-[#1a1a1a] rounded-full transition-opacity duration-300 ${deviceMode === "mobile" ? "opacity-100 delay-300" : "opacity-0"}`}
          ></div>
        )}
      </div>

      <div
        className={`absolute top-0 left-0 right-0 h-[30px] z-30 pointer-events-none transition-opacity duration-500 ${deviceMode === "mobile" ? "opacity-100 delay-200" : "opacity-0"}`}
      >
        <div className="absolute top-4 left-7 text-[10px] text-white font-medium tracking-wide">
          9:41
        </div>
        <div className="absolute top-4 right-7 flex gap-1.5 text-white">
          <Wifi size={12} />
          <div className="w-4 h-2.5 border border-white/30 rounded-[2px] relative">
            <div className="absolute left-[1px] top-[1px] bottom-[1px] right-1 bg-white rounded-[1px]"></div>
          </div>
        </div>
      </div>

      {children}

      <div
        className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[4px] bg-white/20 rounded-full z-30 pointer-events-none transition-opacity duration-500 ${deviceMode === "mobile" ? "opacity-100 delay-200" : "opacity-0"}`}
      ></div>
    </div>
  );
};

export default DeviceFrameChrome;
