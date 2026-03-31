import React from "react";
import DeviceFrameChrome from "./DeviceFrameChrome";
import DeviceFrameScreen from "./DeviceFrameScreen";
import DeviceFrameToolbar from "./DeviceFrameToolbar";

type MainStageShellProps = {
  stageState: {
    isResizingLeftPanel: boolean;
    isResizingRightPanel: boolean;
    stageMarginLeft: string | number;
    stageMarginRight: string | number;
    shouldLockHorizontalScroll: boolean;
    shouldLockVerticalScroll: boolean;
    baseOverflowX: "auto" | "hidden" | "scroll";
    baseStagePadding: number;
    bothPanelsOpen: boolean;
    rightOverlayInset: number;
    floatingHorizontalInset: number;
  };
  stageFrame: {
    deviceMode: "desktop" | "mobile" | "tablet";
    tabletMetrics: {
      frameWidth: number;
      frameHeight: number;
    };
    desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
    clampedTabletShiftX: number;
    clampedCodeShiftX: number;
    frameScale: number;
    toolbarProps: React.ComponentProps<typeof DeviceFrameToolbar>;
    chromeProps: Omit<
      React.ComponentProps<typeof DeviceFrameChrome>,
      "children"
    >;
    screenProps: React.ComponentProps<typeof DeviceFrameScreen>;
  };
  stageRefs: {
    scrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  };
  stageHandlers: {
    onStageBackgroundClick: () => void;
  };
};

const MainStageShell: React.FC<MainStageShellProps> = ({
  stageState,
  stageFrame,
  stageRefs,
  stageHandlers,
}) => {
  const {
    isResizingLeftPanel,
    isResizingRightPanel,
    stageMarginLeft,
    stageMarginRight,
    shouldLockHorizontalScroll,
    shouldLockVerticalScroll,
    baseOverflowX,
    baseStagePadding,
    bothPanelsOpen,
    rightOverlayInset,
    floatingHorizontalInset,
  } = stageState;
  const {
    deviceMode,
    tabletMetrics,
    desktopResolution,
    clampedTabletShiftX,
    clampedCodeShiftX,
    frameScale,
    toolbarProps,
    chromeProps,
    screenProps,
  } = stageFrame;
  const { scrollerRef } = stageRefs;
  const { onStageBackgroundClick } = stageHandlers;

  return (
    <div
      className={`flex-1 flex flex-col relative ${isResizingLeftPanel || isResizingRightPanel ? "" : "transition-all duration-500"}`}
      style={{
        marginLeft: stageMarginLeft,
        marginRight: stageMarginRight,
      }}
    >
      <div
        ref={scrollerRef}
        className="flex-1 relative no-scrollbar transition-all duration-300 pb-10"
        style={{
          overflowX: shouldLockHorizontalScroll ? "hidden" : baseOverflowX,
          overflowY: shouldLockVerticalScroll ? "hidden" : "auto",
        }}
        onClick={onStageBackgroundClick}
      >
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-[linear-gradient(var(--border-color)_1px,transparent_1px),linear-gradient(90deg,var(--border-color)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
          <div className="absolute top-[-18%] left-[18%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12)_0%,rgba(99,102,241,0.05)_38%,transparent_72%)] opacity-80"></div>
          <div className="absolute bottom-[-8%] right-[12%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.12)_0%,rgba(168,85,247,0.05)_36%,transparent_72%)] opacity-75"></div>
        </div>

        <div
          className="min-h-full relative flex flex-col p-10 outline-none bg-grid-pattern"
          style={{
            perspective: "1000px",
            paddingLeft: `${baseStagePadding}px`,
            paddingRight: `${baseStagePadding}px`,
            width: "100%",
            paddingBottom: `${baseStagePadding}px`,
            minWidth: bothPanelsOpen
              ? `calc(100% + var(--left-panel-width) + ${rightOverlayInset}px)`
              : floatingHorizontalInset > 0
                ? `calc(100% + ${floatingHorizontalInset}px)`
                : "100%",
          }}
        >
          <div className="w-full shrink-0 h-4 pointer-events-none"></div>
          <div
            className="relative shrink-0 flex items-center justify-center transition-all duration-700 mx-auto mt-0"
            style={{
              width:
                deviceMode === "mobile"
                  ? "375px"
                  : deviceMode === "tablet"
                    ? `${tabletMetrics.frameWidth}px`
                    : desktopResolution === "resizable"
                      ? "80%"
                      : "921.6px",
              height:
                deviceMode === "mobile"
                  ? "812px"
                  : deviceMode === "tablet"
                    ? `${tabletMetrics.frameHeight}px`
                    : desktopResolution === "resizable"
                      ? "75vh"
                      : "518.4px",
              transform:
                deviceMode === "tablet"
                  ? `translateX(${clampedTabletShiftX}px) scale(${frameScale})`
                  : `translateX(${clampedCodeShiftX}px) scale(${frameScale})`,
              transformOrigin: "top center",
            }}
          >
            <DeviceFrameToolbar {...toolbarProps} />
            <DeviceFrameChrome {...chromeProps}>
              <DeviceFrameScreen {...screenProps} />
            </DeviceFrameChrome>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainStageShell;
