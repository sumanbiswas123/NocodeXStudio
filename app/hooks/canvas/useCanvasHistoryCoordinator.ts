import { useCallback } from "react";
import type React from "react";
import type { HistoryState, VirtualElement } from "../../../types";

type UseCanvasHistoryCoordinatorOptions = {
  maxCanvasHistory: number;
  setHistory: React.Dispatch<React.SetStateAction<HistoryState>>;
  setRoot: React.Dispatch<React.SetStateAction<VirtualElement>>;
  setPreviewRefreshNonce: React.Dispatch<React.SetStateAction<number>>;
};

type UseCanvasHistoryCoordinatorResult = {
  commitPreviewRefresh: () => void;
  handleRedo: () => void;
  handleUndo: () => void;
  pushHistory: (newState: VirtualElement) => void;
};

export const useCanvasHistoryCoordinator = ({
  maxCanvasHistory,
  setHistory,
  setRoot,
  setPreviewRefreshNonce,
}: UseCanvasHistoryCoordinatorOptions): UseCanvasHistoryCoordinatorResult => {
  const pushHistory = useCallback(
    (newState: VirtualElement) => {
      setHistory((curr) => ({
        past: [...curr.past.slice(-(maxCanvasHistory - 1)), curr.present],
        present: newState,
        future: [],
      }));
      setRoot(newState);
    },
    [maxCanvasHistory, setHistory, setRoot],
  );

  const handleUndo = useCallback(() => {
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, -1);
      setRoot(previous);
      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  }, [setHistory, setRoot]);

  const handleRedo = useCallback(() => {
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);
      setRoot(next);
      return {
        past: [...curr.past.slice(-(maxCanvasHistory - 1)), curr.present],
        present: next,
        future: newFuture,
      };
    });
  }, [maxCanvasHistory, setHistory, setRoot]);

  const commitPreviewRefresh = useCallback(() => {
    setPreviewRefreshNonce((prev) => prev + 1);
  }, [setPreviewRefreshNonce]);

  return {
    commitPreviewRefresh,
    handleRedo,
    handleUndo,
    pushHistory,
  };
};
