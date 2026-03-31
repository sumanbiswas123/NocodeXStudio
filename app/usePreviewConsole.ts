import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PreviewConsoleEntry, PreviewConsoleLevel } from "./appHelpers";
import { renderDetachedConsoleWindow } from "./detachedConsoleWindow";

type UsePreviewConsoleOptions = {
  maxEntries: number;
  theme: "dark" | "light";
};

export const usePreviewConsole = ({
  maxEntries,
  theme,
}: UsePreviewConsoleOptions) => {
  const [isCompactConsoleOpening, setIsCompactConsoleOpening] = useState(false);
  const [previewConsoleEntries, setPreviewConsoleEntries] = useState<
    PreviewConsoleEntry[]
  >([]);
  const previewConsoleSeqRef = useRef(0);
  const previewConsoleBufferRef = useRef<PreviewConsoleEntry[]>([]);
  const previewConsoleFlushTimerRef = useRef<number | null>(null);
  const detachedConsoleWindowRef = useRef<Window | null>(null);

  const previewConsoleErrorCount = useMemo(
    () =>
      previewConsoleEntries.reduce(
        (count, item) => count + (item.level === "error" ? 1 : 0),
        0,
      ),
    [previewConsoleEntries],
  );

  const previewConsoleWarnCount = useMemo(
    () =>
      previewConsoleEntries.reduce(
        (count, item) => count + (item.level === "warn" ? 1 : 0),
        0,
      ),
    [previewConsoleEntries],
  );

  const appendPreviewConsole = useCallback(
    (level: PreviewConsoleLevel, message: string, source = "preview") => {
      const nextId = previewConsoleSeqRef.current + 1;
      previewConsoleSeqRef.current = nextId;
      previewConsoleBufferRef.current.push({
        id: nextId,
        level,
        message,
        source,
        time: Date.now(),
      });
      if (previewConsoleFlushTimerRef.current !== null) return;
      previewConsoleFlushTimerRef.current = window.setTimeout(() => {
        previewConsoleFlushTimerRef.current = null;
        const buffered = previewConsoleBufferRef.current.splice(0);
        if (buffered.length === 0) return;
        setPreviewConsoleEntries((prev) => {
          const next = [...prev, ...buffered];
          return next.length > maxEntries
            ? next.slice(next.length - maxEntries)
            : next;
        });
      }, 120);
    },
    [maxEntries],
  );

  const clearPreviewConsole = useCallback(() => {
    previewConsoleSeqRef.current = 0;
    previewConsoleBufferRef.current = [];
    if (previewConsoleFlushTimerRef.current !== null) {
      window.clearTimeout(previewConsoleFlushTimerRef.current);
      previewConsoleFlushTimerRef.current = null;
    }
    setPreviewConsoleEntries([]);
  }, []);

  const handleDetachConsoleWindow = useCallback(() => {
    const existingWindow = detachedConsoleWindowRef.current;
    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus();
      return;
    }
    const nextWindow = window.open(
      "",
      "nocodex-console-window",
      "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes",
    );
    if (!nextWindow) return;
    detachedConsoleWindowRef.current = nextWindow;
    window.setTimeout(() => {
      const detachedWindow = detachedConsoleWindowRef.current;
      if (!detachedWindow || detachedWindow.closed) return;
      renderDetachedConsoleWindow({
        detachedWindow,
        entries: previewConsoleEntries,
        warnCount: previewConsoleWarnCount,
        errorCount: previewConsoleErrorCount,
        theme,
      });
    }, 0);
  }, [
    previewConsoleEntries,
    previewConsoleWarnCount,
    previewConsoleErrorCount,
    theme,
  ]);

  const handleOpenDetachedConsole = useCallback(() => {
    setIsCompactConsoleOpening(true);
    handleDetachConsoleWindow();
  }, [handleDetachConsoleWindow]);

  useEffect(() => {
    if (!isCompactConsoleOpening) return;
    const timer = window.setTimeout(() => {
      setIsCompactConsoleOpening(false);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [isCompactConsoleOpening]);

  useEffect(() => {
    const detachedWindow = detachedConsoleWindowRef.current;
    if (!detachedWindow || detachedWindow.closed) {
      detachedConsoleWindowRef.current = null;
      return;
    }

    renderDetachedConsoleWindow({
      detachedWindow,
      entries: previewConsoleEntries,
      warnCount: previewConsoleWarnCount,
      errorCount: previewConsoleErrorCount,
      theme,
    });
  }, [
    previewConsoleEntries,
    previewConsoleWarnCount,
    previewConsoleErrorCount,
    theme,
  ]);

  useEffect(() => {
    return () => {
      if (previewConsoleFlushTimerRef.current !== null) {
        window.clearTimeout(previewConsoleFlushTimerRef.current);
      }
      const detachedWindow = detachedConsoleWindowRef.current;
      if (detachedWindow && !detachedWindow.closed) {
        detachedWindow.close();
      }
    };
  }, []);

  return {
    appendPreviewConsole,
    clearPreviewConsole,
    handleOpenDetachedConsole,
    isCompactConsoleOpening,
    previewConsoleEntries,
    previewConsoleErrorCount,
    previewConsoleWarnCount,
  };
};
