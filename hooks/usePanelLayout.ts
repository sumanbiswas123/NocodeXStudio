import { useState, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { THEME_STORAGE_KEY } from "../app/appHelpers"; // Adjust import path as needed

// Constants from your original file
const LEFT_PANEL_MIN_WIDTH = 220;
const LEFT_PANEL_MAX_WIDTH = 520;
const LEFT_PANEL_STRETCHED_WIDTH = 360;
const RIGHT_PANEL_MIN_WIDTH = 264;
const RIGHT_PANEL_MAX_WIDTH = 640;

type MaybeViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

export const usePanelLayout = (appRootRef: React.RefObject<HTMLDivElement>) => {
  // --- State ---
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [rightPanelWidth, setRightPanelWidth] = useState(264);
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const [rightPanelFloatingPosition, setRightPanelFloatingPosition] = useState({
    left: 0,
    top: 96,
  });
  const [isDraggingRightPanel, setIsDraggingRightPanel] = useState(false);

  const [isZenMode, setIsZenMode] = useState(false);
  const zenRestoreRef = useRef<any>(null);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch {}
    return "light";
  });

  // --- Refs for Resizing ---
  const leftPanelResizeStartXRef = useRef(0);
  const leftPanelResizeStartWidthRef = useRef(256);
  const leftPanelPendingWidthRef = useRef(256);
  const leftPanelResizeRafRef = useRef<number | null>(null);

  const rightPanelResizeStartXRef = useRef(0);
  const rightPanelResizeStartWidthRef = useRef(264);
  const rightPanelPendingWidthRef = useRef(264);
  const rightPanelResizeRafRef = useRef<number | null>(null);
  const rightPanelDragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    left: number;
    top: number;
  } | null>(null);

  const themeTransitionInFlightRef = useRef(false);

  // --- Theme Logic ---
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const toggleThemeWithTransition = useCallback(() => {
    if (themeTransitionInFlightRef.current) return;
    themeTransitionInFlightRef.current = true;
    const nextTheme = theme === "dark" ? "light" : "dark";
    const rootEl = document.documentElement;
    rootEl.classList.add("theme-transitioning");

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cleanupTransitionVars = () => {
      const rootStyle = document.documentElement.style;
      rootStyle.removeProperty("--theme-transition-x");
      rootStyle.removeProperty("--theme-transition-y");
      rootStyle.removeProperty("--theme-transition-radius");
      rootEl.classList.remove("theme-transitioning");
      themeTransitionInFlightRef.current = false;
    };

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--theme-transition-x", `${window.innerWidth}px`);
    rootStyle.setProperty("--theme-transition-y", "0px");
    rootStyle.setProperty(
      "--theme-transition-radius",
      `${Math.hypot(window.innerWidth, window.innerHeight)}px`,
    );

    if (prefersReducedMotion) {
      setTheme(nextTheme);
      cleanupTransitionVars();
      return;
    }

    const doc = document as MaybeViewTransitionDocument;
    if (typeof doc.startViewTransition !== "function") {
      setTheme(nextTheme);
      cleanupTransitionVars();
      return;
    }

    const transition = doc.startViewTransition(() => {
      flushSync(() => setTheme(nextTheme));
    });
    void transition.finished.finally(cleanupTransitionVars);
  }, [theme]);

  // --- CSS Variable Sync ---
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
  }, [leftPanelWidth, rightPanelWidth, appRootRef]);

  // --- Left Panel Resize Logic ---
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
      prev >= LEFT_PANEL_STRETCHED_WIDTH ? 256 : LEFT_PANEL_STRETCHED_WIDTH,
    );
  }, []);

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
        if (appRootRef.current)
          appRootRef.current.style.setProperty(
            "--left-panel-width",
            `${leftPanelPendingWidthRef.current}px`,
          );
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
  }, [isResizingLeftPanel, appRootRef]);

  // --- Right Panel Resize Logic ---
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
        if (appRootRef.current)
          appRootRef.current.style.setProperty(
            "--right-panel-width",
            `${rightPanelPendingWidthRef.current}px`,
          );
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
  }, [isResizingRightPanel, appRootRef]);

  // --- Right Panel Dragging Logic (Floating Mode) ---
  const handleRightPanelDragStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, isFloating: boolean) => {
      if (!isFloating || !isRightPanelOpen) return;
      if (
        (event.target as HTMLElement).closest("button, input, select, textarea")
      )
        return;
      event.preventDefault();
      rightPanelDragStartRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: rightPanelFloatingPosition.left,
        top: rightPanelFloatingPosition.top,
      };
      setIsDraggingRightPanel(true);
    },
    [isRightPanelOpen, rightPanelFloatingPosition],
  );

  useEffect(() => {
    if (!isDraggingRightPanel) return;
    const onMouseMove = (event: MouseEvent) => {
      const start = rightPanelDragStartRef.current;
      if (!start) return;
      const viewportWidth =
        typeof window !== "undefined" ? window.innerWidth : 1440;
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 900;
      setRightPanelFloatingPosition({
        left: Math.max(
          8,
          Math.min(
            Math.max(8, viewportWidth - rightPanelWidth - 8),
            start.left + (event.clientX - start.pointerX),
          ),
        ),
        top: Math.max(
          56,
          Math.min(
            Math.max(56, viewportHeight - 140),
            start.top + (event.clientY - start.pointerY),
          ),
        ),
      });
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

  return {
    theme,
    toggleThemeWithTransition,
    leftPanelWidth,
    rightPanelWidth,
    isLeftPanelOpen,
    setIsLeftPanelOpen,
    isRightPanelOpen,
    setIsRightPanelOpen,
    isResizingLeftPanel,
    isResizingRightPanel,
    isDraggingRightPanel,
    rightPanelFloatingPosition,
    setRightPanelFloatingPosition,
    handleLeftPanelResizeStart,
    handleLeftPanelStretchToggle,
    handleRightPanelResizeStart,
    handleRightPanelDragStart,
    isZenMode,
    setIsZenMode,
    zenRestoreRef,
  };
};
