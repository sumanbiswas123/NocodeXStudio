import { useEffect, useRef } from "react";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";
type PreviewMode = "edit" | "preview";
type SidebarToolMode = "edit" | "inspect" | "draw" | "move";

type UseAppShellControlsOptions = {
  closePendingPageSwitchPrompt: () => void;
  flushPendingPreviewSaves: () => Promise<void>;
  interactionMode: InteractionMode;
  interactionModeRef: React.MutableRefObject<InteractionMode>;
  isCodePanelOpen: boolean;
  isPageSwitchPromptBusy: boolean;
  isPageSwitchPromptOpen: boolean;
  isRightPanelOpen: boolean;
  requestPreviewRefreshWithUnsavedGuard: () => void;
  requestSwitchToPreviewMode: () => void;
  runRedo: () => void;
  runUndo: () => void;
  saveCodeDraftsRef: React.MutableRefObject<(() => Promise<void>) | null>;
  selectedId: string | null;
  showSaveToast: () => void;
  setInteractionMode: React.Dispatch<React.SetStateAction<InteractionMode>>;
  setIsCodePanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLeftPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewMode: React.Dispatch<React.SetStateAction<PreviewMode>>;
  setSidebarToolMode: React.Dispatch<React.SetStateAction<SidebarToolMode>>;
  toggleRightPanelManualClosedRef: React.MutableRefObject<boolean>;
  toggleRightPanelRestorePendingRef: React.MutableRefObject<boolean>;
};

export const useAppShellControls = ({
  closePendingPageSwitchPrompt,
  flushPendingPreviewSaves,
  interactionMode,
  interactionModeRef,
  isCodePanelOpen,
  isPageSwitchPromptBusy,
  isPageSwitchPromptOpen,
  isRightPanelOpen,
  requestPreviewRefreshWithUnsavedGuard,
  requestSwitchToPreviewMode,
  runRedo,
  runUndo,
  saveCodeDraftsRef,
  selectedId,
  showSaveToast,
  setInteractionMode,
  setIsCodePanelOpen,
  setIsLeftPanelOpen,
  setIsRightPanelOpen,
  setPreviewMode,
  setSidebarToolMode,
  toggleRightPanelManualClosedRef,
  toggleRightPanelRestorePendingRef,
}: UseAppShellControlsOptions): void => {
  const lastEditSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (isCodePanelOpen) {
      return;
    }

    if (interactionMode === "preview") {
      toggleRightPanelManualClosedRef.current = false;
      setIsRightPanelOpen(false);
      return;
    }

    if (interactionMode !== "edit") {
      return;
    }

    if (toggleRightPanelRestorePendingRef.current) {
      toggleRightPanelRestorePendingRef.current = false;
      return;
    }

    if (selectedId !== lastEditSelectionRef.current) {
      lastEditSelectionRef.current = selectedId;
      toggleRightPanelManualClosedRef.current = false;
    }

    if (!selectedId) {
      setIsRightPanelOpen(false);
      return;
    }

    if (!toggleRightPanelManualClosedRef.current) {
      setIsRightPanelOpen(true);
    }
  }, [
    interactionMode,
    isCodePanelOpen,
    selectedId,
    setIsRightPanelOpen,
    toggleRightPanelManualClosedRef,
    toggleRightPanelRestorePendingRef,
  ]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        target.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const toggleInspectorPanel = () => {
      toggleRightPanelManualClosedRef.current = !isRightPanelOpen;
      setIsRightPanelOpen((prev) => {
        if (prev) return false;
        return Boolean(selectedId);
      });
    };

    const switchToPreviewEditMode = () => {
      setSidebarToolMode("edit");
      setInteractionMode("preview");
      setPreviewMode("edit");
    };

    const runSaveShortcut = async () => {
      await saveCodeDraftsRef.current?.();
      await flushPendingPreviewSaves();
      showSaveToast();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const hasModifier = e.ctrlKey || e.metaKey;
      const editableTarget = isEditableTarget(e.target);

      if (hasModifier && editableTarget) {
        if (key === "s") {
          e.preventDefault();
          void runSaveShortcut();
          return;
        }
        if (key === "t") {
          e.preventDefault();
          requestPreviewRefreshWithUnsavedGuard();
          return;
        }
        if (key === "p") {
          e.preventDefault();
          requestSwitchToPreviewMode();
          return;
        }
        if (key === "f") {
          e.preventDefault();
          setIsLeftPanelOpen(true);
          setIsRightPanelOpen(true);
          setIsCodePanelOpen(false);
          return;
        }
        if (key === "b") {
          e.preventDefault();
          setIsLeftPanelOpen(true);
          return;
        }
        if (key === "i" && interactionModeRef.current === "edit") {
          e.preventDefault();
          toggleInspectorPanel();
          return;
        }
        if (key === "e") {
          e.preventDefault();
          switchToPreviewEditMode();
          return;
        }
        return;
      }

      if (
        key === "escape" &&
        isPageSwitchPromptOpen &&
        !isPageSwitchPromptBusy
      ) {
        e.preventDefault();
        closePendingPageSwitchPrompt();
        return;
      }

      if (!hasModifier && !e.altKey && !editableTarget) {
        if (key === "w") {
          e.preventDefault();
          if (!e.repeat) {
            setIsLeftPanelOpen(true);
          }
          return;
        }
        if (key === "e") {
          e.preventDefault();
          if (!e.repeat) {
            setIsRightPanelOpen((prev) => {
              const next = !prev;
              if (next) setIsCodePanelOpen(false);
              return next;
            });
          }
          return;
        }
      }

      if (!hasModifier) return;

      if (key === "f") {
        e.preventDefault();
        setIsLeftPanelOpen(true);
        setIsRightPanelOpen(true);
        setIsCodePanelOpen(false);
        return;
      }
      if (key === "b") {
        e.preventDefault();
        setIsLeftPanelOpen(true);
        return;
      }
      if (key === "i" && interactionModeRef.current === "edit") {
        e.preventDefault();
        toggleInspectorPanel();
        return;
      }
      if (key === "p") {
        e.preventDefault();
        requestSwitchToPreviewMode();
        return;
      }
      if (key === "e") {
        e.preventDefault();
        switchToPreviewEditMode();
        return;
      }
      if (key === "j") {
        return;
      }
      if (key === "s") {
        e.preventDefault();
        void runSaveShortcut();
        return;
      }
      if (key === "t") {
        e.preventDefault();
        requestPreviewRefreshWithUnsavedGuard();
        return;
      }
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        runUndo();
        return;
      }
      if (key === "u" || key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        runRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closePendingPageSwitchPrompt,
    flushPendingPreviewSaves,
    interactionModeRef,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    isRightPanelOpen,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    runRedo,
    runUndo,
    saveCodeDraftsRef,
    selectedId,
    showSaveToast,
    setInteractionMode,
    setIsCodePanelOpen,
    setIsLeftPanelOpen,
    setIsRightPanelOpen,
    setPreviewMode,
    setSidebarToolMode,
    toggleRightPanelManualClosedRef,
  ]);
};
