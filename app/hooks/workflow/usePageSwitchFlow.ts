import { useCallback, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FileMap } from "../../../types";
import {
  PendingPageSwitch,
  PreviewSyncSource,
  findFilePathCaseInsensitive,
  normalizeProjectRelative,
} from "../../helpers/appHelpers";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";

type UsePageSwitchFlowOptions = {
  EXPLORER_LOCK_TTL_MS: number;
  activeFileRef: MutableRefObject<string | null>;
  codeDirtyPathSetRef: MutableRefObject<Record<string, true>>;
  codeDraftByPathRef: MutableRefObject<Record<string, string>>;
  commitPreviewRefresh: () => void;
  dirtyFilesRef: MutableRefObject<string[]>;
  discardUnsavedChangesForFile: (path: string) => Promise<void>;
  explorerSelectionLockRef: MutableRefObject<string | null>;
  explorerSelectionLockUntilRef: MutableRefObject<number>;
  filesRef: MutableRefObject<FileMap>;
  flushPendingPreviewSaves: () => Promise<void>;
  interactionModeRef: MutableRefObject<InteractionMode>;
  lastPreviewSyncRef: MutableRefObject<{
    path: string;
    at: number;
    source: PreviewSyncSource;
  } | null>;
  pendingPreviewWritesRef: MutableRefObject<Record<string, string>>;
  previewModeRef: MutableRefObject<"edit" | "preview">;
  previewSyncedFile: string | null;
  saveCodeDraftsRef: MutableRefObject<(() => Promise<void>) | null>;
  selectedPreviewHtmlRef: MutableRefObject<string | null>;
  setActiveFileStable: (path: string | null) => void;
  setInteractionMode: Dispatch<SetStateAction<InteractionMode>>;
  setIsLeftPanelOpen: Dispatch<SetStateAction<boolean>>;
  setPreviewMode: Dispatch<SetStateAction<"edit" | "preview">>;
  setPreviewNavigationFile: Dispatch<SetStateAction<string | null>>;
  setPreviewRefreshNonce: Dispatch<SetStateAction<number>>;
  setPreviewSyncedFile: Dispatch<SetStateAction<string | null>>;
};

type UsePageSwitchFlowResult = {
  closePendingPageSwitchPrompt: () => void;
  commitPreviewActiveFileSync: (
    nextPath: string,
    source: PreviewSyncSource,
  ) => void;
  handleSelectFile: (path: string) => void;
  hasUnsavedChangesForFile: (path: string | null) => boolean;
  isPageSwitchPromptBusy: boolean;
  isPageSwitchPromptOpen: boolean;
  pendingPageSwitch: PendingPageSwitch | null;
  requestPreviewRefreshWithUnsavedGuard: () => void;
  requestSwitchToPreviewMode: () => void;
  resolveExplorerHtmlPath: (rawPath: string) => string | null;
  resolvePendingPageSwitchWithDiscard: () => Promise<void>;
  resolvePendingPageSwitchWithSave: () => Promise<void>;
  setIsPageSwitchPromptOpen: Dispatch<SetStateAction<boolean>>;
  setPendingPageSwitch: Dispatch<SetStateAction<PendingPageSwitch | null>>;
  syncPreviewActiveFile: (
    nextPath: string,
    source: PreviewSyncSource,
    options?: { skipUnsavedPrompt?: boolean },
  ) => void;
};

export const usePageSwitchFlow = ({
  EXPLORER_LOCK_TTL_MS,
  activeFileRef,
  codeDirtyPathSetRef,
  codeDraftByPathRef,
  commitPreviewRefresh,
  dirtyFilesRef,
  discardUnsavedChangesForFile,
  explorerSelectionLockRef,
  explorerSelectionLockUntilRef,
  filesRef,
  flushPendingPreviewSaves,
  interactionModeRef,
  lastPreviewSyncRef,
  pendingPreviewWritesRef,
  previewModeRef,
  previewSyncedFile,
  saveCodeDraftsRef,
  selectedPreviewHtmlRef,
  setActiveFileStable,
  setInteractionMode,
  setIsLeftPanelOpen,
  setPreviewMode,
  setPreviewNavigationFile,
  setPreviewRefreshNonce,
  setPreviewSyncedFile,
}: UsePageSwitchFlowOptions): UsePageSwitchFlowResult => {
  const [pendingPageSwitch, setPendingPageSwitch] =
    useState<PendingPageSwitch | null>(null);
  const [isPageSwitchPromptOpen, setIsPageSwitchPromptOpen] = useState(false);
  const [isPageSwitchPromptBusy, setIsPageSwitchPromptBusy] = useState(false);

  const hasUnsavedChangesForFile = useCallback(
    (path: string | null): boolean => {
      if (!path) return false;
      if (typeof pendingPreviewWritesRef.current[path] === "string") return true;
      if (typeof codeDraftByPathRef.current[path] === "string") return true;
      if (codeDirtyPathSetRef.current[path]) return true;
      return dirtyFilesRef.current.includes(path);
    },
    [
      codeDirtyPathSetRef,
      codeDraftByPathRef,
      dirtyFilesRef,
      pendingPreviewWritesRef,
    ],
  );

  const commitPreviewActiveFileSync = useCallback(
    (nextPath: string, source: PreviewSyncSource) => {
      if (!nextPath) return;
      setPreviewSyncedFile((prev) => (prev === nextPath ? prev : nextPath));
      if (source === "navigate" || source === "explorer") {
        setPreviewNavigationFile((prev) => (prev === nextPath ? prev : nextPath));
      }

      if (activeFileRef.current === nextPath) {
        if (
          interactionModeRef.current !== "preview" &&
          (source === "load" || source === "path_changed")
        ) {
          setInteractionMode("preview");
        }
        return;
      }

      const now = Date.now();
      const last = lastPreviewSyncRef.current;
      if (
        last &&
        last.path === nextPath &&
        last.source !== source &&
        now - last.at < 1200
      ) {
        return;
      }

      lastPreviewSyncRef.current = { path: nextPath, at: now, source };
      setActiveFileStable(nextPath);
      if (interactionModeRef.current !== "preview") {
        setInteractionMode("preview");
      }
    },
    [
      activeFileRef,
      interactionModeRef,
      lastPreviewSyncRef,
      setActiveFileStable,
      setInteractionMode,
      setPreviewNavigationFile,
      setPreviewSyncedFile,
    ],
  );

  const syncPreviewActiveFile = useCallback(
    (
      nextPath: string,
      source: PreviewSyncSource,
      options?: { skipUnsavedPrompt?: boolean },
    ) => {
      if (!nextPath) return;
      const currentPath = selectedPreviewHtmlRef.current;
      const nextFile = filesRef.current[nextPath];
      const shouldPrompt =
        !options?.skipUnsavedPrompt &&
        source !== "load" &&
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        Boolean(currentPath) &&
        currentPath !== nextPath &&
        nextFile?.type === "html" &&
        hasUnsavedChangesForFile(currentPath);
      if (shouldPrompt && currentPath) {
        setPendingPageSwitch({
          mode: "switch",
          fromPath: currentPath,
          nextPath,
          source,
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      commitPreviewActiveFileSync(nextPath, source);
    },
    [
      commitPreviewActiveFileSync,
      filesRef,
      hasUnsavedChangesForFile,
      interactionModeRef,
      previewModeRef,
      selectedPreviewHtmlRef,
    ],
  );

  const requestPreviewRefreshWithUnsavedGuard = useCallback(() => {
    const candidate =
      previewSyncedFile && filesRef.current[previewSyncedFile]?.type === "html"
        ? previewSyncedFile
        : selectedPreviewHtmlRef.current &&
            filesRef.current[selectedPreviewHtmlRef.current]?.type === "html"
          ? selectedPreviewHtmlRef.current
          : null;
    if (!candidate) {
      setPreviewRefreshNonce((prev) => prev + 1);
      return;
    }
    if (hasUnsavedChangesForFile(candidate)) {
      setPendingPageSwitch({
        mode: "refresh",
        fromPath: candidate,
        nextPath: candidate,
        source: "navigate",
      });
      setIsPageSwitchPromptOpen(true);
      return;
    }
    setPreviewNavigationFile((prev) => (prev === candidate ? prev : candidate));
    commitPreviewRefresh();
  }, [
    commitPreviewRefresh,
    filesRef,
    hasUnsavedChangesForFile,
    previewSyncedFile,
    selectedPreviewHtmlRef,
    setPreviewNavigationFile,
    setPreviewRefreshNonce,
  ]);

  const requestSwitchToPreviewMode = useCallback(() => {
    if (interactionModeRef.current === "preview") {
      const currentPath = selectedPreviewHtmlRef.current;
      if (
        previewModeRef.current === "edit" &&
        currentPath &&
        hasUnsavedChangesForFile(currentPath)
      ) {
        setPendingPageSwitch({
          mode: "preview_mode",
          fromPath: currentPath,
          nextPath: currentPath,
          source: "navigate",
          nextPreviewMode: "preview",
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      setPreviewMode("preview");
      return;
    }
    if (interactionModeRef.current !== "edit") {
      setInteractionMode("preview");
      setPreviewMode("preview");
      return;
    }
    const currentPath = selectedPreviewHtmlRef.current;
    if (currentPath && hasUnsavedChangesForFile(currentPath)) {
      setPendingPageSwitch({
        mode: "preview",
        fromPath: currentPath,
        nextPath: currentPath,
        source: "navigate",
      });
      setIsPageSwitchPromptOpen(true);
      return;
    }
    setInteractionMode("preview");
    setPreviewMode("preview");
  }, [
    hasUnsavedChangesForFile,
    interactionModeRef,
    previewModeRef,
    selectedPreviewHtmlRef,
    setInteractionMode,
    setPreviewMode,
  ]);

  const resolvePendingPageSwitchWithSave = useCallback(async () => {
    if (!pendingPageSwitch) return;
    setIsPageSwitchPromptBusy(true);
    const pending = pendingPageSwitch;
    const waitForStateFlush = () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    try {
      await saveCodeDraftsRef.current?.();
      await flushPendingPreviewSaves();
      await waitForStateFlush();
      let stillUnsaved = hasUnsavedChangesForFile(pending.fromPath);
      if (stillUnsaved) {
        await waitForStateFlush();
        stillUnsaved = hasUnsavedChangesForFile(pending.fromPath);
      }
      if (stillUnsaved) {
        window.alert("Some changes could not be saved. Please retry.");
        return;
      }
      setIsPageSwitchPromptOpen(false);
      setPendingPageSwitch(null);
      if (pending.mode === "refresh") {
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        commitPreviewRefresh();
      } else if (pending.mode === "preview_mode") {
        setActiveFileStable(pending.fromPath);
        setPreviewSyncedFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewMode(pending.nextPreviewMode ?? "preview");
      } else if (pending.mode === "preview") {
        setInteractionMode("preview");
      } else {
        commitPreviewActiveFileSync(pending.nextPath, pending.source);
      }
    } finally {
      setIsPageSwitchPromptBusy(false);
    }
  }, [
    commitPreviewActiveFileSync,
    commitPreviewRefresh,
    flushPendingPreviewSaves,
    hasUnsavedChangesForFile,
    pendingPageSwitch,
    saveCodeDraftsRef,
    setActiveFileStable,
    setInteractionMode,
    setPreviewMode,
    setPreviewNavigationFile,
    setPreviewSyncedFile,
  ]);

  const resolvePendingPageSwitchWithDiscard = useCallback(async () => {
    if (!pendingPageSwitch) return;
    setIsPageSwitchPromptBusy(true);
    const pending = pendingPageSwitch;
    try {
      await discardUnsavedChangesForFile(pending.fromPath);
      setIsPageSwitchPromptOpen(false);
      setPendingPageSwitch(null);
      if (pending.mode === "refresh") {
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        commitPreviewRefresh();
      } else if (pending.mode === "preview_mode") {
        setActiveFileStable(pending.fromPath);
        setPreviewSyncedFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewMode(pending.nextPreviewMode ?? "preview");
      } else if (pending.mode === "preview") {
        setInteractionMode("preview");
      } else {
        commitPreviewActiveFileSync(pending.nextPath, pending.source);
      }
    } finally {
      setIsPageSwitchPromptBusy(false);
    }
  }, [
    commitPreviewActiveFileSync,
    commitPreviewRefresh,
    discardUnsavedChangesForFile,
    pendingPageSwitch,
    setActiveFileStable,
    setInteractionMode,
    setPreviewMode,
    setPreviewNavigationFile,
    setPreviewSyncedFile,
  ]);

  const closePendingPageSwitchPrompt = useCallback(() => {
    if (isPageSwitchPromptBusy) return;
    setIsPageSwitchPromptOpen(false);
    setPendingPageSwitch(null);
  }, [isPageSwitchPromptBusy]);

  const resolveExplorerHtmlPath = useCallback((rawPath: string): string | null => {
    const normalized = normalizeProjectRelative(String(rawPath || ""));
    if (!normalized) return null;

    const direct =
      findFilePathCaseInsensitive(filesRef.current, normalized) || normalized;
    const directFile = filesRef.current[direct];
    if (directFile?.type === "html") return direct;

    const baseFolder = direct.replace(/\/+$/, "");
    const directIndex = findFilePathCaseInsensitive(
      filesRef.current,
      `${baseFolder}/index.html`,
    );
    if (directIndex && filesRef.current[directIndex]?.type === "html") {
      return directIndex;
    }

    const htmlUnderFolder = Object.keys(filesRef.current)
      .filter((path) => {
        const normalizedPath = normalizeProjectRelative(path);
        if (!normalizedPath.startsWith(`${baseFolder}/`)) return false;
        return filesRef.current[path]?.type === "html";
      })
      .sort((a, b) => a.localeCompare(b));
    if (htmlUnderFolder.length === 0) return null;
    return htmlUnderFolder[0];
  }, [filesRef]);

  const handleSelectFile = useCallback(
    (path: string) => {
      const resolvedPath = resolveExplorerHtmlPath(path) || path;
      console.log("[Preview] Current page:", resolvedPath);

      const currentPath = selectedPreviewHtmlRef.current;
      const targetIsHtml = filesRef.current[resolvedPath]?.type === "html";

      if (targetIsHtml) {
        (window as any).__explorerNavTime = Date.now();
      }

      if (
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        targetIsHtml &&
        currentPath &&
        currentPath !== resolvedPath &&
        hasUnsavedChangesForFile(currentPath)
      ) {
        setPendingPageSwitch({
          mode: "switch",
          fromPath: currentPath,
          nextPath: resolvedPath,
          source: "explorer",
        });
        setIsPageSwitchPromptOpen(true);
        setIsLeftPanelOpen(true);
        return;
      }

      if (activeFileRef.current === resolvedPath) {
        setIsLeftPanelOpen(true);
        if (
          filesRef.current[resolvedPath]?.type === "html" &&
          interactionModeRef.current !== "preview"
        ) {
          setInteractionMode("preview");
        }
        return;
      }

      if (targetIsHtml) {
        explorerSelectionLockRef.current = resolvedPath;
        explorerSelectionLockUntilRef.current = Date.now() + EXPLORER_LOCK_TTL_MS;
      }
      syncPreviewActiveFile(resolvedPath, "explorer");
      setIsLeftPanelOpen(true);
    },
    [
      EXPLORER_LOCK_TTL_MS,
      activeFileRef,
      explorerSelectionLockRef,
      explorerSelectionLockUntilRef,
      filesRef,
      hasUnsavedChangesForFile,
      interactionModeRef,
      previewModeRef,
      resolveExplorerHtmlPath,
      selectedPreviewHtmlRef,
      setInteractionMode,
      setIsLeftPanelOpen,
      syncPreviewActiveFile,
    ],
  );

  return {
    closePendingPageSwitchPrompt,
    commitPreviewActiveFileSync,
    handleSelectFile,
    hasUnsavedChangesForFile,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    pendingPageSwitch,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    resolveExplorerHtmlPath,
    resolvePendingPageSwitchWithDiscard,
    resolvePendingPageSwitchWithSave,
    setIsPageSwitchPromptOpen,
    setPendingPageSwitch,
    syncPreviewActiveFile,
  };
};
