import { useCallback, useEffect, useRef, useState } from "react";

type PanelMode = "inspector" | "gallery";

type UsePanelLayoutStateOptions = {
  appRootRef: React.RefObject<HTMLDivElement | null>;
  deviceMode: "desktop" | "mobile" | "tablet";
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  quickTextEdit: {
    open: boolean;
    x: number;
    y: number;
  };
};

type UsePanelLayoutStateResult = {
  CODE_PANEL_WIDTH: number;
  LEFT_PANEL_COLLAPSED_WIDTH: number;
  bothPanelsOpen: boolean;
  floatingHorizontalInset: number;
  getDefaultRightPanelPosition: (width: number) => { left: number; top: number };
  handleLeftPanelResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleLeftPanelStretchToggle: () => void;
  handleRightPanelDragStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleRightPanelResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  isDraggingRightPanel: boolean;
  isFloatingPanels: boolean;
  isLeftPanelOpen: boolean;
  isResizingLeftPanel: boolean;
  isResizingRightPanel: boolean;
  isRightPanelOpen: boolean;
  panelLayoutMode: "docked" | "floating";
  rightOverlayInset: number;
  rightPanelFloatingPosition: { left: number; top: number };
  rightPanelManualClosedRef: React.MutableRefObject<boolean>;
  rightPanelMode: PanelMode;
  rightPanelRestorePendingRef: React.MutableRefObject<boolean>;
  rightPanelWidth: number;
  setIsLeftPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRightPanelFloatingPosition: React.Dispatch<
    React.SetStateAction<{ left: number; top: number }>
  >;
  setRightPanelMode: React.Dispatch<React.SetStateAction<PanelMode>>;
  setRightPanelWidth: React.Dispatch<React.SetStateAction<number>>;
  leftPanelWidth: number;
};

const LEFT_PANEL_DEFAULT_WIDTH = 256;
const LEFT_PANEL_MIN_WIDTH = 220;
const LEFT_PANEL_MAX_WIDTH = 520;
const LEFT_PANEL_STRETCHED_WIDTH = 360;
const LEFT_PANEL_COLLAPSED_WIDTH = 48;
const RIGHT_PANEL_DEFAULT_WIDTH = 264;
const RIGHT_PANEL_MIN_WIDTH = 264;
const RIGHT_PANEL_MAX_WIDTH = 640;
const CODE_PANEL_WIDTH = 620;

export const usePanelLayoutState = ({
  appRootRef,
  deviceMode,
  interactionMode,
  quickTextEdit,
}: UsePanelLayoutStateOptions): UsePanelLayoutStateResult => {
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<PanelMode>("inspector");
  const [leftPanelWidth, setLeftPanelWidth] = useState(LEFT_PANEL_DEFAULT_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(
    RIGHT_PANEL_DEFAULT_WIDTH,
  );
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
  const [rightPanelFloatingPosition, setRightPanelFloatingPosition] = useState({
    left: 0,
    top: 96,
  });
  const [isDraggingRightPanel, setIsDraggingRightPanel] = useState(false);
  const leftPanelResizeStartXRef = useRef(0);
  const leftPanelResizeStartWidthRef = useRef(LEFT_PANEL_DEFAULT_WIDTH);
  const leftPanelPendingWidthRef = useRef(LEFT_PANEL_DEFAULT_WIDTH);
  const leftPanelResizeRafRef = useRef<number | null>(null);
  const rightPanelResizeStartXRef = useRef(0);
  const rightPanelResizeStartWidthRef = useRef(RIGHT_PANEL_DEFAULT_WIDTH);
  const rightPanelPendingWidthRef = useRef(RIGHT_PANEL_DEFAULT_WIDTH);
  const rightPanelResizeRafRef = useRef<number | null>(null);
  const rightPanelDragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    left: number;
    top: number;
  } | null>(null);
  const rightPanelManualClosedRef = useRef(false);
  const rightPanelRestorePendingRef = useRef(false);
  const panelLayoutMode: "docked" | "floating" = "floating";
  const isFloatingPanels = panelLayoutMode === "floating";
  const bothPanelsOpen =
    !isFloatingPanels &&
    isLeftPanelOpen &&
    isRightPanelOpen &&
    deviceMode !== "mobile";
  const rightOverlayInset = bothPanelsOpen ? rightPanelWidth : 0;
  const floatingHorizontalInset =
    isFloatingPanels && deviceMode !== "mobile"
      ? (isLeftPanelOpen ? leftPanelWidth : 0) +
        (isRightPanelOpen ? rightPanelWidth : 0)
      : 0;

  const getDefaultRightPanelPosition = useCallback((width: number) => {
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 900;
    return {
      left: Math.max(8, viewportWidth - width - 40),
      top: Math.max(56, Math.min(96, viewportHeight - 160)),
    };
  }, []);

  useEffect(() => {
    setRightPanelFloatingPosition((prev) => {
      if (prev.left > 0) return prev;
      const next = getDefaultRightPanelPosition(rightPanelWidth);
      return {
        left: next.left,
        top: prev.top,
      };
    });
  }, [getDefaultRightPanelPosition, rightPanelWidth]);

  useEffect(() => {
    if (!appRootRef.current) return;
    appRootRef.current.style.setProperty(
      "--left-panel-width",
      `${leftPanelWidth}px`,
    );
    appRootRef.current.style.setProperty(
      "--right-panel-width",
      `${rightPanelWidth}px`,
    );
  }, [appRootRef, leftPanelWidth, rightPanelWidth]);

  useEffect(() => {
    if (!isResizingLeftPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - leftPanelResizeStartXRef.current;
      leftPanelPendingWidthRef.current = Math.min(
        LEFT_PANEL_MAX_WIDTH,
        Math.max(
          LEFT_PANEL_MIN_WIDTH,
          leftPanelResizeStartWidthRef.current + delta,
        ),
      );
      if (leftPanelResizeRafRef.current !== null) return;
      leftPanelResizeRafRef.current = requestAnimationFrame(() => {
        leftPanelResizeRafRef.current = null;
        if (appRootRef.current) {
          appRootRef.current.style.setProperty(
            "--left-panel-width",
            `${leftPanelPendingWidthRef.current}px`,
          );
        }
      });
    };

    const onMouseUp = () => {
      if (leftPanelResizeRafRef.current !== null) {
        cancelAnimationFrame(leftPanelResizeRafRef.current);
        leftPanelResizeRafRef.current = null;
      }
      setLeftPanelWidth(leftPanelPendingWidthRef.current);
      setIsResizingLeftPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [appRootRef, isResizingLeftPanel]);

  useEffect(() => {
    if (!isResizingRightPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = rightPanelResizeStartXRef.current - event.clientX;
      rightPanelPendingWidthRef.current = Math.min(
        RIGHT_PANEL_MAX_WIDTH,
        Math.max(
          RIGHT_PANEL_MIN_WIDTH,
          rightPanelResizeStartWidthRef.current + delta,
        ),
      );
      if (rightPanelResizeRafRef.current !== null) return;
      rightPanelResizeRafRef.current = requestAnimationFrame(() => {
        rightPanelResizeRafRef.current = null;
        if (appRootRef.current) {
          appRootRef.current.style.setProperty(
            "--right-panel-width",
            `${rightPanelPendingWidthRef.current}px`,
          );
        }
      });
    };

    const onMouseUp = () => {
      if (rightPanelResizeRafRef.current !== null) {
        cancelAnimationFrame(rightPanelResizeRafRef.current);
        rightPanelResizeRafRef.current = null;
      }
      setRightPanelWidth(rightPanelPendingWidthRef.current);
      setIsResizingRightPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [appRootRef, isResizingRightPanel]);

  useEffect(() => {
    if (!isDraggingRightPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const start = rightPanelDragStartRef.current;
      if (!start) return;
      const viewportWidth =
        typeof window !== "undefined" ? window.innerWidth : 1440;
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 900;
      const nextLeft = Math.max(
        8,
        Math.min(
          Math.max(8, viewportWidth - rightPanelWidth - 8),
          start.left + (event.clientX - start.pointerX),
        ),
      );
      const nextTop = Math.max(
        56,
        Math.min(
          Math.max(56, viewportHeight - 140),
          start.top + (event.clientY - start.pointerY),
        ),
      );
      setRightPanelFloatingPosition({ left: nextLeft, top: nextTop });
    };

    const onMouseUp = () => {
      rightPanelDragStartRef.current = null;
      setIsDraggingRightPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDraggingRightPanel, rightPanelWidth]);

  const handleLeftPanelResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isLeftPanelOpen) return;
      event.preventDefault();
      leftPanelResizeStartXRef.current = event.clientX;
      leftPanelResizeStartWidthRef.current = leftPanelWidth;
      leftPanelPendingWidthRef.current = leftPanelWidth;
      setIsResizingLeftPanel(true);
    },
    [isLeftPanelOpen, leftPanelWidth],
  );

  const handleLeftPanelStretchToggle = useCallback(() => {
    setLeftPanelWidth((prev) =>
      prev >= LEFT_PANEL_STRETCHED_WIDTH
        ? LEFT_PANEL_DEFAULT_WIDTH
        : LEFT_PANEL_STRETCHED_WIDTH,
    );
  }, []);

  const handleRightPanelResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isRightPanelOpen) return;
      event.preventDefault();
      rightPanelResizeStartXRef.current = event.clientX;
      rightPanelResizeStartWidthRef.current = rightPanelWidth;
      rightPanelPendingWidthRef.current = rightPanelWidth;
      setIsResizingRightPanel(true);
    },
    [isRightPanelOpen, rightPanelWidth],
  );

  const handleRightPanelDragStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isFloatingPanels || !isRightPanelOpen) return;
      if (
        (event.target as HTMLElement).closest("button, input, select, textarea")
      ) {
        return;
      }
      event.preventDefault();
      rightPanelDragStartRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: rightPanelFloatingPosition.left,
        top: rightPanelFloatingPosition.top,
      };
      setIsDraggingRightPanel(true);
    },
    [isFloatingPanels, isRightPanelOpen, rightPanelFloatingPosition],
  );

  useEffect(() => {
    const clampRightPanelPosition = () => {
      const viewportWidth =
        typeof window !== "undefined" ? window.innerWidth : 1440;
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 900;
      setRightPanelFloatingPosition((prev) => ({
        left: Math.max(
          8,
          Math.min(prev.left, Math.max(8, viewportWidth - rightPanelWidth - 8)),
        ),
        top: Math.max(
          56,
          Math.min(prev.top, Math.max(56, viewportHeight - 140)),
        ),
      }));
    };

    window.addEventListener("resize", clampRightPanelPosition);
    return () => window.removeEventListener("resize", clampRightPanelPosition);
  }, [rightPanelWidth]);

  useEffect(() => {
    if (interactionMode !== "preview" || !quickTextEdit.open) return;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 900;
    const margin = 16;
    const panelWidth = rightPanelWidth;
    const panelHeight = 420;
    const nextLeft = Math.max(
      margin,
      Math.min(quickTextEdit.x, viewportWidth - panelWidth - margin),
    );
    const nextTop = Math.max(
      margin,
      Math.min(quickTextEdit.y, viewportHeight - panelHeight - margin),
    );
    setRightPanelFloatingPosition({ left: nextLeft, top: nextTop });
    if (!isRightPanelOpen) {
      setIsRightPanelOpen(true);
    }
  }, [
    interactionMode,
    isRightPanelOpen,
    quickTextEdit.open,
    quickTextEdit.x,
    quickTextEdit.y,
    rightPanelWidth,
  ]);

  return {
    CODE_PANEL_WIDTH,
    LEFT_PANEL_COLLAPSED_WIDTH,
    bothPanelsOpen,
    floatingHorizontalInset,
    getDefaultRightPanelPosition,
    handleLeftPanelResizeStart,
    handleLeftPanelStretchToggle,
    handleRightPanelDragStart,
    handleRightPanelResizeStart,
    isDraggingRightPanel,
    isFloatingPanels,
    isLeftPanelOpen,
    isResizingLeftPanel,
    isResizingRightPanel,
    isRightPanelOpen,
    leftPanelWidth,
    panelLayoutMode,
    rightOverlayInset,
    rightPanelFloatingPosition,
    rightPanelManualClosedRef,
    rightPanelMode,
    rightPanelRestorePendingRef,
    rightPanelWidth,
    setIsLeftPanelOpen,
    setIsRightPanelOpen,
    setRightPanelFloatingPosition,
    setRightPanelMode,
    setRightPanelWidth,
  };
};
