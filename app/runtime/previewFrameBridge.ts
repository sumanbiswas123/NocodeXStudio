import React from "react";
import { ProjectFile } from "../../types";
import { PreviewSelectionMode, PreviewSyncSource } from "../helpers/appHelpers";

type PreviewToolMode = "edit" | "inspect" | "draw" | "move";

export const getPreviewFrameWindow = (
  frame: HTMLIFrameElement | null,
): Window | null =>
  frame?.contentWindow ?? frame?.contentDocument?.defaultView ?? null;

const readFrameHref = (frame: HTMLIFrameElement | null): string => {
  if (!frame) return "";
  try {
    const href = frame.contentWindow?.location?.href || "";
    if (href) return href;
  } catch {
    // Ignore transient cross-origin or error-page access.
  }
  return frame.getAttribute("src") || frame.src || "";
};

const isChromeErrorDocument = (href: string): boolean =>
  /^chrome-error:\/\//i.test(href) || href.includes("chromewebdata");

export const injectMountedPreviewBridge = (
  frame: HTMLIFrameElement | null,
  bridgeScript: string,
): void => {
  const frameHref = readFrameHref(frame);
  if (isChromeErrorDocument(frameHref)) return;
  const frameWindow = frame?.contentWindow ?? null;
  let frameDocument: Document | null = null;
  try {
    frameDocument = frameWindow?.document ?? null;
  } catch {
    frameDocument = null;
  }
  if (!frameWindow || !frameDocument) return;
  if (
    frameDocument.documentElement?.getAttribute(
      "data-nx-mounted-preview-bridge",
    ) === "1"
  ) {
    return;
  }
  try {
    const script = frameDocument.createElement("script");
    script.type = "text/javascript";
    script.text = bridgeScript;
    const target =
      frameDocument.head || frameDocument.documentElement || frameDocument.body;
    if (!target) return;
    target.appendChild(script);
    script.remove();
  } catch {
    try {
      (frameWindow as any).eval(bridgeScript);
    } catch {
      // Ignore bridge injection failures for locked-down page contexts.
    }
  }
};

export const postPreviewFrameMessage = (
  frame: HTMLIFrameElement | null,
  payload: Record<string, unknown>,
): void => {
  const frameWindow = getPreviewFrameWindow(frame);
  if (!frameWindow) return;
  try {
    frameWindow.postMessage(JSON.stringify(payload), "*");
  } catch {
    // Ignore transient frame messaging errors.
  }
};

export const postPreviewOrientationToFrame = ({
  frame,
  tabletOrientation,
}: {
  frame: HTMLIFrameElement | null;
  tabletOrientation: "portrait" | "landscape";
}): void => {
  const angle = tabletOrientation === "portrait" ? 0 : 90;
  postPreviewFrameMessage(frame, {
    type: "PREVIEW_SET_VIEWPORT_ORIENTATION",
    orientation: tabletOrientation,
    angle,
  });
};

export const postPreviewModeToFrame = ({
  frame,
  previewMode,
  previewSelectionMode,
  sidebarToolMode,
  drawElementTag,
  interactionMode,
  overrides,
}: {
  frame: HTMLIFrameElement | null;
  previewMode: "edit" | "preview";
  previewSelectionMode: PreviewSelectionMode;
  sidebarToolMode: PreviewToolMode;
  drawElementTag: string;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  overrides?: {
    mode?: "edit" | "preview";
    selectionMode?: PreviewSelectionMode;
    toolMode?: PreviewToolMode;
    drawTag?: string;
    force?: boolean;
  };
}): void => {
  const frameWindow = getPreviewFrameWindow(frame);
  if (!frameWindow) return;

  const nextMode = overrides?.mode ?? previewMode;
  const nextSelectionMode =
    overrides?.selectionMode ?? previewSelectionMode;
  const nextToolMode = overrides?.toolMode ?? sidebarToolMode;
  const nextDrawTag = overrides?.drawTag ?? drawElementTag;
  const shouldSend = overrides?.force ? true : interactionMode === "preview";
  if (!shouldSend) return;

  try {
    (frameWindow as any).__nxPreviewHostMode = nextMode;
    (frameWindow as any).__nxPreviewHostSelectionMode = nextSelectionMode;
    (frameWindow as any).__nxPreviewHostToolMode = nextToolMode;
    (frameWindow as any).__nxPreviewHostDrawTag = nextDrawTag;
  } catch {
    // Ignore host flag sync issues for transient frame reloads.
  }

  postPreviewFrameMessage(frame, {
    type: "PREVIEW_SET_MODE",
    mode: nextMode,
    selectionMode: nextSelectionMode,
    toolMode: nextToolMode,
    drawTag: nextDrawTag,
  });
};

export const schedulePreviewModeSync = (
  callback: () => void,
  delays: number[],
): number[] => delays.map((delay) => window.setTimeout(callback, delay));

export const clearPreviewModeSync = (timeoutIds: number[]): void => {
  timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
};

export const handlePreviewFrameLoad = ({
  frame,
  selectedPreviewSrc,
  injectBridge,
  postMode,
  isPreviewMountReady,
  extractMountRelativePath,
  resolveVirtualPathFromMountRelative,
  explorerSelectionLockRef,
  explorerSelectionLockUntilRef,
  normalizeProjectRelative,
  files,
  activeFilePath,
  shouldProcessPreviewPageSignal,
  syncPreviewActiveFile,
  pendingPopupOpenRef,
  openPopupInPreview,
  setPreviewFrameLoadNonce,
}: {
  frame: HTMLIFrameElement;
  selectedPreviewSrc: string | null;
  injectBridge: (frame: HTMLIFrameElement | null) => void;
  postMode: () => void;
  isPreviewMountReady: boolean;
  extractMountRelativePath: (locationPath: string) => string | null;
  resolveVirtualPathFromMountRelative: (
    mountRelativePath: string,
  ) => string | null;
  explorerSelectionLockRef: React.MutableRefObject<string | null>;
  explorerSelectionLockUntilRef: React.MutableRefObject<number>;
  normalizeProjectRelative: (path: string) => string;
  files: Record<string, ProjectFile>;
  activeFilePath: string | null;
  shouldProcessPreviewPageSignal: (path: string) => boolean;
  syncPreviewActiveFile: (
    path: string,
    source: PreviewSyncSource,
    options?: { skipUnsavedPrompt?: boolean },
  ) => void;
  pendingPopupOpenRef: React.MutableRefObject<{
    selector: string | null;
    popupId: string | null;
  } | null>;
  openPopupInPreview: (
    selector: string | null,
    popupId: string | null,
  ) => boolean;
  setPreviewFrameLoadNonce: React.Dispatch<React.SetStateAction<number>>;
}): void => {
  setPreviewFrameLoadNonce((prev) => prev + 1);

  const frameHref = readFrameHref(frame);
  if (isChromeErrorDocument(frameHref)) {
    console.warn(
      "[Preview] Skipping frame load sync because Chromium loaded an internal error page:",
      frameHref,
    );
    return;
  }

  if (selectedPreviewSrc) {
    injectBridge(frame);
  }

  postMode();
  schedulePreviewModeSync(postMode, [0, 120, 360]);

  if (!isPreviewMountReady) return;

  const frameSrc = frameHref || readFrameHref(frame);
  if (!frameSrc) return;

  let locationPath = "";
  try {
    locationPath = new URL(frameSrc).pathname || "";
  } catch {
    return;
  }
  if (!locationPath) return;

  const mountRelativePath = extractMountRelativePath(locationPath);
  if (!mountRelativePath) return;

  const resolvedVirtualPath =
    resolveVirtualPathFromMountRelative(mountRelativePath);
  if (!resolvedVirtualPath) return;

  const lockPath = explorerSelectionLockRef.current;
  const lockActive =
    Boolean(lockPath) && Date.now() <= explorerSelectionLockUntilRef.current;
  if (lockPath && !lockActive) {
    explorerSelectionLockRef.current = null;
    explorerSelectionLockUntilRef.current = 0;
  }
  if (lockPath && lockActive) {
    const resolvedNorm =
      normalizeProjectRelative(resolvedVirtualPath).toLowerCase();
    const lockNorm = normalizeProjectRelative(lockPath).toLowerCase();
    if (resolvedNorm !== lockNorm) {
      return;
    }
    explorerSelectionLockRef.current = null;
    explorerSelectionLockUntilRef.current = 0;
  }

  const resolvedFile = files[resolvedVirtualPath];
  if (!resolvedFile || resolvedFile.type !== "html") return;

  const lockAge = Date.now() - ((window as any).__explorerNavTime || 0);
  if (lockAge < 2500 && resolvedVirtualPath !== activeFilePath) {
    return;
  }

  if (resolvedVirtualPath === activeFilePath) return;
  if (!shouldProcessPreviewPageSignal(resolvedVirtualPath)) return;

  console.log("[Preview] Current page:", resolvedVirtualPath);

  syncPreviewActiveFile(resolvedVirtualPath, "load", {
    skipUnsavedPrompt: true,
  });

  if (pendingPopupOpenRef.current) {
    const pending = pendingPopupOpenRef.current;
    window.setTimeout(() => {
      if (!pendingPopupOpenRef.current) return;
      const opened = openPopupInPreview(pending.selector, pending.popupId);
      if (opened) {
        pendingPopupOpenRef.current = null;
      }
    }, 180);
  }
};
