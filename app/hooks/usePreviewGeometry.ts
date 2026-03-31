import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { VirtualElement } from "../../types";
import {
  parseNumericCssValue,
  readElementByPath,
} from "../helpers/appHelpers";
import { normalizePresentationCssValue } from "../helpers/previewCssHelpers";

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type UsePreviewGeometryOptions = {
  applyPreviewLocalCssPatchAtPath: (
    elementPath: number[],
    styles: Partial<React.CSSProperties>,
    options?: { syncSelectedElement?: boolean },
  ) => Promise<void>;
  applyPreviewStyleUpdateAtPath: (
    elementPath: number[],
    styles: Partial<React.CSSProperties>,
    options?: { syncSelectedElement?: boolean },
  ) => Promise<void>;
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  previewFrameRef: MutableRefObject<HTMLIFrameElement | null>;
  previewMode: "edit" | "preview";
  previewRefreshNonce: number;
  previewSelectedComputedStyles: React.CSSProperties | null;
  previewSelectedElement: VirtualElement | null;
  previewSelectedPath: number[] | null;
  previewStageRef: MutableRefObject<HTMLDivElement | null>;
  setPreviewSelectedElement: Dispatch<SetStateAction<VirtualElement | null>>;
};

export const usePreviewGeometry = ({
  applyPreviewLocalCssPatchAtPath,
  applyPreviewStyleUpdateAtPath,
  getLivePreviewSelectedElement,
  interactionMode,
  previewFrameRef,
  previewMode,
  previewRefreshNonce,
  previewSelectedComputedStyles,
  previewSelectedElement,
  previewSelectedPath,
  previewStageRef,
  setPreviewSelectedElement,
}: UsePreviewGeometryOptions) => {
  const [previewSelectionBox, setPreviewSelectionBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [isPreviewResizing, setIsPreviewResizing] = useState(false);
  const previewResizeDragRef = useRef<{
    path: number[];
    target: HTMLElement;
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
    scaleX: number;
    scaleY: number;
    canMoveLeft: boolean;
    canMoveTop: boolean;
  } | null>(null);

  const handlePreviewNudgeZIndex = useCallback(
    (delta: number) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      const styleValue =
        previewSelectedElement?.styles?.zIndex ??
        previewSelectedComputedStyles?.zIndex ??
        (liveTarget instanceof HTMLElement
          ? liveTarget.style.zIndex ||
            liveTarget.ownerDocument.defaultView
              ?.getComputedStyle(liveTarget)
              .getPropertyValue("z-index")
          : "");
      const current = parseNumericCssValue(styleValue) ?? 0;
      const next = Math.max(0, Math.round(current + delta));
      void applyPreviewStyleUpdateAtPath(
        previewSelectedPath,
        { zIndex: String(next) },
        { syncSelectedElement: true },
      );
    },
    [
      applyPreviewStyleUpdateAtPath,
      getLivePreviewSelectedElement,
      previewSelectedComputedStyles?.zIndex,
      previewSelectedElement?.styles?.zIndex,
      previewSelectedPath,
    ],
  );

  const handlePreviewResizeNudge = useCallback(
    (axis: "width" | "height", delta: number) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      const liveRect =
        liveTarget instanceof HTMLElement ? liveTarget.getBoundingClientRect() : null;
      const fallbackBase = axis === "width" ? 120 : 48;
      const styleValue =
        axis === "width"
          ? (previewSelectedElement?.styles?.width ??
            previewSelectedComputedStyles?.width)
          : (previewSelectedElement?.styles?.height ??
            previewSelectedComputedStyles?.height);
      const parsedStyle = parseNumericCssValue(styleValue);
      const liveValue =
        axis === "width" ? (liveRect?.width ?? null) : (liveRect?.height ?? null);
      const base = parsedStyle ?? liveValue ?? fallbackBase;
      const next = Math.max(16, Math.round(base + delta));
      const stylePatch: Partial<React.CSSProperties> =
        axis === "width" ? { width: `${next}px` } : { height: `${next}px` };
      void applyPreviewStyleUpdateAtPath(previewSelectedPath, stylePatch, {
        syncSelectedElement: true,
      });
    },
    [
      applyPreviewStyleUpdateAtPath,
      getLivePreviewSelectedElement,
      previewSelectedComputedStyles?.height,
      previewSelectedComputedStyles?.width,
      previewSelectedElement?.styles?.height,
      previewSelectedElement?.styles?.width,
      previewSelectedPath,
    ],
  );

  const updatePreviewSelectionBox = useCallback(() => {
    if (
      interactionMode !== "preview" ||
      previewMode !== "edit" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    const stage = previewStageRef.current;
    const frame = previewFrameRef.current;
    const frameDocument = frame?.contentDocument ?? frame?.contentWindow?.document ?? null;
    if (!stage || !frame || !frameDocument?.body) {
      setPreviewSelectionBox(null);
      return;
    }
    const target = readElementByPath(frameDocument.body, previewSelectedPath);
    if (!(target instanceof HTMLElement)) {
      setPreviewSelectionBox(null);
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const left = targetRect.left - stageRect.left;
    const top = targetRect.top - stageRect.top;
    const width = targetRect.width;
    const height = targetRect.height;
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    setPreviewSelectionBox({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
    });
  }, [interactionMode, previewMode, previewSelectedPath, previewFrameRef, previewStageRef]);

  const handlePreviewResizeHandleMouseDown = useCallback(
    (direction: ResizeDirection, event: React.MouseEvent<HTMLButtonElement>) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const frame = previewFrameRef.current;
      const frameDocument = frame?.contentDocument ?? frame?.contentWindow?.document ?? null;
      if (!frame || !frameDocument?.body) return;
      const target = readElementByPath(frameDocument.body, previewSelectedPath);
      if (!(target instanceof HTMLElement)) return;

      event.preventDefault();
      event.stopPropagation();

      const frameRect = frame.getBoundingClientRect();
      const frameClientWidth = Math.max(1, frame.clientWidth || 0);
      const frameClientHeight = Math.max(1, frame.clientHeight || 0);
      const scaleX = frameRect.width / frameClientWidth;
      const scaleY = frameRect.height / frameClientHeight;
      const targetRect = target.getBoundingClientRect();
      const startWidth = Math.max(16, Math.round(targetRect.width));
      const startHeight = Math.max(16, Math.round(targetRect.height));
      const computedStyle = target.ownerDocument.defaultView?.getComputedStyle(target);
      const startLeft =
        parseNumericCssValue(target.style.left) ??
        parseNumericCssValue(computedStyle?.left) ??
        0;
      const startTop =
        parseNumericCssValue(target.style.top) ??
        parseNumericCssValue(computedStyle?.top) ??
        0;
      const positionMode = String(computedStyle?.position || "").trim().toLowerCase();
      const canMoveLeft =
        positionMode === "absolute" ||
        positionMode === "fixed" ||
        positionMode === "relative" ||
        positionMode === "sticky";
      const canMoveTop = canMoveLeft;

      previewResizeDragRef.current = {
        path: [...previewSelectedPath],
        target,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startLeft,
        startTop,
        startWidth,
        startHeight,
        scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
        scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1,
        canMoveLeft,
        canMoveTop,
      };
      setIsPreviewResizing(true);

      const onMove = (moveEvent: MouseEvent) => {
        const drag = previewResizeDragRef.current;
        if (!drag) return;
        const deltaX = (moveEvent.clientX - drag.startX) / drag.scaleX;
        const deltaY = (moveEvent.clientY - drag.startY) / drag.scaleY;
        const affectsEast = drag.direction.includes("e");
        const affectsWest = drag.direction.includes("w");
        const affectsSouth = drag.direction.includes("s");
        const affectsNorth = drag.direction.includes("n");
        const widthDelta = affectsWest ? -deltaX : affectsEast ? deltaX : 0;
        const heightDelta = affectsNorth ? -deltaY : affectsSouth ? deltaY : 0;
        const width = Math.max(16, Math.round(drag.startWidth + widthDelta));
        const height = Math.max(16, Math.round(drag.startHeight + heightDelta));
        const consumedLeftDelta = affectsWest ? drag.startWidth - width : 0;
        const consumedTopDelta = affectsNorth ? drag.startHeight - height : 0;
        const nextLeft = Math.round(drag.startLeft + consumedLeftDelta);
        const nextTop = Math.round(drag.startTop + consumedTopDelta);
        const widthValue = normalizePresentationCssValue("width", `${width}px`);
        const heightValue = normalizePresentationCssValue("height", `${height}px`);
        const nextLeftValue = normalizePresentationCssValue("left", `${nextLeft}px`);
        const nextTopValue = normalizePresentationCssValue("top", `${nextTop}px`);
        drag.target.style.setProperty("width", widthValue);
        drag.target.style.setProperty("height", heightValue);
        if (affectsWest && drag.canMoveLeft) {
          drag.target.style.setProperty("left", nextLeftValue);
        }
        if (affectsNorth && drag.canMoveTop) {
          drag.target.style.setProperty("top", nextTopValue);
        }
        setPreviewSelectedElement((prev) =>
          prev
            ? {
                ...prev,
                styles: {
                  ...prev.styles,
                  width: widthValue,
                  height: heightValue,
                  ...(affectsWest && drag.canMoveLeft ? { left: nextLeftValue } : {}),
                  ...(affectsNorth && drag.canMoveTop ? { top: nextTopValue } : {}),
                },
              }
            : prev,
        );
        updatePreviewSelectionBox();
      };

      const onUp = () => {
        const drag = previewResizeDragRef.current;
        previewResizeDragRef.current = null;
        setIsPreviewResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (!drag) return;
        const stylePatch: Partial<React.CSSProperties> = {
          width: drag.target.style.getPropertyValue("width"),
          height: drag.target.style.getPropertyValue("height"),
        };
        if (drag.direction.includes("w") && drag.canMoveLeft) {
          stylePatch.left = drag.target.style.getPropertyValue("left");
        }
        if (drag.direction.includes("n") && drag.canMoveTop) {
          stylePatch.top = drag.target.style.getPropertyValue("top");
        }
        void applyPreviewLocalCssPatchAtPath(drag.path, stylePatch, {
          syncSelectedElement: true,
        });
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [
      applyPreviewLocalCssPatchAtPath,
      previewFrameRef,
      previewSelectedPath,
      setPreviewSelectedElement,
      updatePreviewSelectionBox,
    ],
  );

  useEffect(() => {
    if (
      interactionMode !== "preview" ||
      previewMode !== "edit" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    let rafId = 0;
    const tick = () => {
      updatePreviewSelectionBox();
      rafId = window.requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    interactionMode,
    previewMode,
    previewRefreshNonce,
    previewSelectedPath,
    updatePreviewSelectionBox,
  ]);

  return {
    handlePreviewNudgeZIndex,
    handlePreviewResizeHandleMouseDown,
    handlePreviewResizeNudge,
    isPreviewResizing,
    previewSelectionBox,
    updatePreviewSelectionBox,
  };
};
