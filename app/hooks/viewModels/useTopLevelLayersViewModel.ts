import { useMemo } from "react";
import type React from "react";
import AppTopLevelLayers from "../../ui/AppTopLevelLayers";
import { normalizePath } from "../../helpers/appHelpers";

type PendingPageSwitch = {
  fromPath?: string | null;
  nextPath?: string | null;
  mode?: string | null;
};

type UseTopLevelLayersViewModelOptions = {
  theme: "dark" | "light";
  pendingPageSwitch: PendingPageSwitch | null;
  isPageSwitchPromptOpen: boolean;
  isPageSwitchPromptBusy: boolean;
  closePendingPageSwitchPrompt: () => void;
  resolvePendingPageSwitchWithDiscard: () => Promise<void>;
  resolvePendingPageSwitchWithSave: () => Promise<void>;
  deviceCtxMenu: {
    x: number;
    y: number;
    type: "desktop" | "mobile" | "tablet";
  } | null;
  mobileFrameStyle: "dynamic-island" | "punch-hole" | "notch";
  setMobileFrameStyle: (
    style: "dynamic-island" | "punch-hole" | "notch",
  ) => void;
  desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
  setDesktopResolution: (
    resolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable",
  ) => void;
  tabletModel: "ipad" | "ipad-pro";
  tabletOrientation: "portrait" | "landscape";
  setTabletModel: (model: "ipad" | "ipad-pro") => void;
  setDeviceCtxMenu: React.Dispatch<
    React.SetStateAction<{
      x: number;
      y: number;
      type: "desktop" | "mobile" | "tablet";
    } | null>
  >;
};

export const useTopLevelLayersViewModel = ({
  theme,
  pendingPageSwitch,
  isPageSwitchPromptOpen,
  isPageSwitchPromptBusy,
  closePendingPageSwitchPrompt,
  resolvePendingPageSwitchWithDiscard,
  resolvePendingPageSwitchWithSave,
  deviceCtxMenu,
  mobileFrameStyle,
  setMobileFrameStyle,
  desktopResolution,
  setDesktopResolution,
  tabletModel,
  tabletOrientation,
  setTabletModel,
  setDeviceCtxMenu,
}: UseTopLevelLayersViewModelOptions): React.ComponentProps<
  typeof AppTopLevelLayers
> => {
  const pageSwitchPromptState = useMemo(() => {
    if (!isPageSwitchPromptOpen || !pendingPageSwitch) {
      return null;
    }

    const pendingSwitchFromLabel =
      pendingPageSwitch.fromPath &&
      normalizePath(pendingPageSwitch.fromPath).split("/").filter(Boolean)
        .length > 0
        ? normalizePath(pendingPageSwitch.fromPath)
            .split("/")
            .filter(Boolean)
            .slice(-1)[0]
        : pendingPageSwitch.fromPath || "current page";
    const pendingSwitchNextLabel =
      pendingPageSwitch.nextPath &&
      normalizePath(pendingPageSwitch.nextPath).split("/").filter(Boolean)
        .length > 0
        ? normalizePath(pendingPageSwitch.nextPath)
            .split("/")
            .filter(Boolean)
            .slice(-1)[0]
        : pendingPageSwitch.nextPath || "next page";

    return {
      pendingSwitchFromLabel,
      pendingSwitchNextLabel,
      isPendingRefresh: pendingPageSwitch.mode === "refresh",
      isPendingPreviewMode: pendingPageSwitch.mode === "preview_mode",
      isPageSwitchPromptBusy,
    };
  }, [isPageSwitchPromptBusy, isPageSwitchPromptOpen, pendingPageSwitch]);

  return useMemo(
    () => ({
      theme,
      pageSwitchPromptState,
      deviceContextMenuState: {
        menu: deviceCtxMenu,
        mobileFrameStyle,
        desktopResolution,
        tabletModel,
        tabletOrientation,
      },
      actions: {
        closePendingPageSwitchPrompt,
        resolvePendingPageSwitchWithDiscard,
        resolvePendingPageSwitchWithSave,
        setMobileFrameStyle,
        setDesktopResolution,
        setTabletModel,
        closeDeviceContextMenu: () => setDeviceCtxMenu(null),
      },
    }),
    [
      theme,
      pageSwitchPromptState,
      deviceCtxMenu,
      mobileFrameStyle,
      desktopResolution,
      tabletModel,
      tabletOrientation,
      closePendingPageSwitchPrompt,
      resolvePendingPageSwitchWithDiscard,
      resolvePendingPageSwitchWithSave,
      setMobileFrameStyle,
      setDesktopResolution,
      setTabletModel,
      setDeviceCtxMenu,
    ],
  );
};
