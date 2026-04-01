import React from "react";
import DeviceFrameChrome from "./DeviceFrameChrome";
import DeviceFrameScreen from "./DeviceFrameScreen";
import DeviceFrameToolbar from "./DeviceFrameToolbar";
import "../styles/ui/main-stage-shell.css";

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
      className={`main-stage-shell ${isResizingLeftPanel || isResizingRightPanel ? "" : "main-stage-shell--animated"}`}
      style={{
        marginLeft: stageMarginLeft,
        marginRight: stageMarginRight,
      }}
    >
      <div
        ref={scrollerRef}
        className="main-stage-scroller"
        style={{
          overflowX: shouldLockHorizontalScroll ? "hidden" : baseOverflowX,
          overflowY: shouldLockVerticalScroll ? "hidden" : "auto",
        }}
        onClick={onStageBackgroundClick}
      >
        <div className="main-stage-background">
          <div className="main-stage-background-grid"></div>
          <div className="main-stage-background-glow main-stage-background-glow--top"></div>
          <div className="main-stage-background-glow main-stage-background-glow--bottom"></div>
        </div>

        <div
          className="main-stage-canvas"
          style={{
            perspective: "1000px",
            paddingTop: `${baseStagePadding}px`,
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
          <div className="main-stage-spacer"></div>
          <div
            className="main-stage-device-frame"
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
