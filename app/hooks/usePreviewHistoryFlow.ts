import { useCallback, useEffect, useRef } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FileMap } from "../../types";
import {
  MAX_PREVIEW_HISTORY,
  PreviewHistoryEntry,
  createPreviewDocument,
  readElementByPath,
} from "../helpers/appHelpers";

type UsePreviewHistoryFlowOptions = {
  autoSaveEnabled: boolean;
  cachePreviewDoc: (path: string, doc: string) => void;
  codeDirtyPathSet: Record<string, true>;
  codeDirtyPathSetRef: MutableRefObject<Record<string, true>>;
  codeDraftByPath: Record<string, string>;
  codeDraftByPathRef: MutableRefObject<Record<string, string>>;
  dirtyFilesRef: MutableRefObject<string[]>;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  filesRef: MutableRefObject<FileMap>;
  handleRedo: () => void;
  handleUndo: () => void;
  interactionModeRef: MutableRefObject<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >;
  invalidatePreviewDocCache: (path: string) => void;
  pendingPreviewWritesRef: MutableRefObject<Record<string, string>>;
  previewDependencyIndexRef: MutableRefObject<Record<string, string[]>>;
  previewFrameRef: MutableRefObject<HTMLIFrameElement | null>;
  previewHistoryRef: MutableRefObject<Record<string, PreviewHistoryEntry>>;
  selectedPreviewHtmlRef: MutableRefObject<string | null>;
  setCodeDraftByPath: Dispatch<SetStateAction<Record<string, string>>>;
  setCodeDirtyPathSet: Dispatch<SetStateAction<Record<string, true>>>;
  setDirtyFiles: Dispatch<SetStateAction<string[]>>;
  setDirtyPathKeysByFile: Dispatch<
    SetStateAction<Record<string, string[]>>
  >;
  setFiles: Dispatch<SetStateAction<FileMap>>;
  setPreviewRefreshNonce: Dispatch<SetStateAction<number>>;
  setSelectedPreviewDoc: Dispatch<SetStateAction<string>>;
  textFileCacheRef: MutableRefObject<Record<string, string>>;
};

type UsePreviewHistoryFlowResult = {
  discardUnsavedChangesForFile: (path: string) => Promise<void>;
  flushPendingPreviewSaves: () => Promise<void>;
  markPreviewPathDirty: (filePath: string, elementPath: number[]) => void;
  pushPreviewHistory: (
    filePath: string,
    nextHtml: string,
    previousHtml?: string,
  ) => void;
  runRedo: () => void;
  runUndo: () => void;
  schedulePreviewAutoSave: () => void;
};

export const usePreviewHistoryFlow = ({
  autoSaveEnabled,
  cachePreviewDoc,
  codeDirtyPathSet,
  codeDirtyPathSetRef,
  codeDraftByPath,
  codeDraftByPathRef,
  dirtyFilesRef,
  filePathIndexRef,
  filesRef,
  handleRedo,
  handleUndo,
  interactionModeRef,
  invalidatePreviewDocCache,
  pendingPreviewWritesRef,
  previewDependencyIndexRef,
  previewFrameRef,
  previewHistoryRef,
  selectedPreviewHtmlRef,
  setCodeDraftByPath,
  setCodeDirtyPathSet,
  setDirtyFiles,
  setDirtyPathKeysByFile,
  setFiles,
  setPreviewRefreshNonce,
  setSelectedPreviewDoc,
  textFileCacheRef,
}: UsePreviewHistoryFlowOptions): UsePreviewHistoryFlowResult => {
  const autoSaveTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    },
    [],
  );

  const pushPreviewHistory = useCallback(
    (filePath: string, nextHtml: string, previousHtml?: string) => {
      const current = previewHistoryRef.current[filePath];
      if (!current) {
        const baseline = typeof previousHtml === "string" ? previousHtml : "";
        previewHistoryRef.current[filePath] =
          baseline && baseline !== nextHtml
            ? {
                past: [baseline],
                present: nextHtml,
                future: [],
              }
            : {
                past: [],
                present: nextHtml,
                future: [],
              };
        return;
      }
      if (current.present === nextHtml) return;
      previewHistoryRef.current[filePath] = {
        past: [
          ...current.past.slice(-(MAX_PREVIEW_HISTORY - 1)),
          current.present,
        ],
        present: nextHtml,
        future: [],
      };
    },
    [previewHistoryRef],
  );

  const markPreviewPathDirty = useCallback(
    (filePath: string, elementPath: number[]) => {
      if (!elementPath || elementPath.length === 0) return;
      const key = elementPath.join(".");
      setDirtyPathKeysByFile((prev) => {
        const curr = prev[filePath] || [];
        if (curr.includes(key)) return prev;
        return { ...prev, [filePath]: [...curr, key] };
      });

      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      const liveTarget = readElementByPath(frameDocument.body, elementPath);
      if (liveTarget instanceof HTMLElement) {
        liveTarget.classList.add("__nx-preview-dirty");
      }
    },
    [previewFrameRef, setDirtyPathKeysByFile],
  );

  const flushPendingPreviewSaves = useCallback(async () => {
    const entries = Object.entries(pendingPreviewWritesRef.current);
    if (entries.length === 0) return;

    const savedPaths: string[] = [];
    for (const [filePath, content] of entries) {
      const absolutePath = filePathIndexRef.current[filePath];
      if (!absolutePath) continue;
      try {
        await (Neutralino as any).filesystem.writeFile(absolutePath, content);
        delete pendingPreviewWritesRef.current[filePath];
        savedPaths.push(filePath);
      } catch (error) {
        console.warn(`Failed to save ${filePath}:`, error);
      }
    }
    if (savedPaths.length === 0) return;

    dirtyFilesRef.current = dirtyFilesRef.current.filter(
      (path) => !savedPaths.includes(path),
    );
    setDirtyFiles((prev) => prev.filter((path) => !savedPaths.includes(path)));
    setDirtyPathKeysByFile((prev) => {
      const next = { ...prev };
      for (const path of savedPaths) {
        delete next[path];
      }
      return next;
    });

    const activePath = selectedPreviewHtmlRef.current;
    if (activePath && savedPaths.includes(activePath)) {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (frameDocument) {
        Array.from(
          frameDocument.querySelectorAll<HTMLElement>(".__nx-preview-dirty"),
        ).forEach((el) => {
          if (el instanceof HTMLElement) {
            el.classList.remove("__nx-preview-dirty");
          }
        });
      }
    }
  }, [
    dirtyFilesRef,
    filePathIndexRef,
    pendingPreviewWritesRef,
    previewFrameRef,
    selectedPreviewHtmlRef,
    setDirtyFiles,
    setDirtyPathKeysByFile,
  ]);

  const schedulePreviewAutoSave = useCallback(() => {
    if (!autoSaveEnabled) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void flushPendingPreviewSaves();
    }, 1200);
  }, [autoSaveEnabled, flushPendingPreviewSaves]);

  const discardUnsavedChangesForFile = useCallback(
    async (path: string) => {
      if (!path) return;
      const hadCodeDraft =
        typeof codeDraftByPath[path] === "string" ||
        Boolean(codeDirtyPathSet[path]);
      if (hadCodeDraft) {
        delete codeDraftByPathRef.current[path];
        delete codeDirtyPathSetRef.current[path];
        setCodeDraftByPath((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setCodeDirtyPathSet((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
      const hadPreviewDraft =
        typeof pendingPreviewWritesRef.current[path] === "string";
      if (!hadPreviewDraft) {
        if (hadCodeDraft) {
          dirtyFilesRef.current = dirtyFilesRef.current.filter(
            (entry) => entry !== path,
          );
          setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
        }
        return;
      }

      const absolutePath = filePathIndexRef.current[path];
      if (!absolutePath) return;
      let diskContent = "";
      try {
        diskContent = await (Neutralino as any).filesystem.readFile(absolutePath);
      } catch (error) {
        console.warn(`Failed discarding unsaved changes for ${path}:`, error);
        window.alert("Could not discard changes. Please try again.");
        return;
      }

      delete pendingPreviewWritesRef.current[path];
      textFileCacheRef.current[path] = diskContent;
      setFiles((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        return {
          ...prev,
          [path]: {
            ...existing,
            content: diskContent,
          },
        };
      });
      dirtyFilesRef.current = dirtyFilesRef.current.filter(
        (entry) => entry !== path,
      );
      setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
      setDirtyPathKeysByFile((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      previewHistoryRef.current[path] = {
        past: [],
        present: diskContent,
        future: [],
      };
      invalidatePreviewDocCache(path);

      const currentEntry = filesRef.current[path];
      if (currentEntry) {
        const previewSnapshot: FileMap = {
          ...filesRef.current,
          [path]: {
            ...currentEntry,
            content: diskContent,
          },
        };
        const previewDoc = createPreviewDocument(
          previewSnapshot,
          path,
          previewDependencyIndexRef.current[path],
        );
        cachePreviewDoc(path, previewDoc);
        if (selectedPreviewHtmlRef.current === path) {
          setSelectedPreviewDoc(previewDoc);
          setPreviewRefreshNonce((prev) => prev + 1);
        }
      }
    },
    [
      cachePreviewDoc,
      codeDirtyPathSet,
      codeDirtyPathSetRef,
      codeDraftByPath,
      codeDraftByPathRef,
      dirtyFilesRef,
      filePathIndexRef,
      filesRef,
      invalidatePreviewDocCache,
      pendingPreviewWritesRef,
      previewDependencyIndexRef,
      previewHistoryRef,
      selectedPreviewHtmlRef,
      setCodeDraftByPath,
      setCodeDirtyPathSet,
      setDirtyFiles,
      setDirtyPathKeysByFile,
      setFiles,
      setPreviewRefreshNonce,
      setSelectedPreviewDoc,
      textFileCacheRef,
    ],
  );

  const handlePreviewUndo = useCallback(async () => {
    const filePath = selectedPreviewHtmlRef.current;
    if (!filePath) return;
    const current = previewHistoryRef.current[filePath];
    if (!current || current.past.length === 0) return;
    const previous = current.past[current.past.length - 1];
    previewHistoryRef.current[filePath] = {
      past: current.past.slice(0, -1),
      present: previous,
      future: [current.present, ...current.future],
    };
    textFileCacheRef.current[filePath] = previous;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content: previous,
        },
      };
    });
    pendingPreviewWritesRef.current[filePath] = previous;
    setDirtyFiles((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );
    setDirtyPathKeysByFile((prev) => ({
      ...prev,
      [filePath]: [],
    }));
    const currentEntry = filesRef.current[filePath];
    if (currentEntry) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [filePath]: {
          ...currentEntry,
          content: previous,
        },
      };
      const previewDoc = createPreviewDocument(
        previewSnapshot,
        filePath,
        previewDependencyIndexRef.current[filePath],
      );
      cachePreviewDoc(filePath, previewDoc);
      setSelectedPreviewDoc(previewDoc);
    }
    await flushPendingPreviewSaves();
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [
    cachePreviewDoc,
    filesRef,
    flushPendingPreviewSaves,
    pendingPreviewWritesRef,
    previewDependencyIndexRef,
    previewHistoryRef,
    schedulePreviewAutoSave,
    selectedPreviewHtmlRef,
    setDirtyFiles,
    setDirtyPathKeysByFile,
    setFiles,
    setPreviewRefreshNonce,
    setSelectedPreviewDoc,
    textFileCacheRef,
  ]);

  const handlePreviewRedo = useCallback(async () => {
    const filePath = selectedPreviewHtmlRef.current;
    if (!filePath) return;
    const current = previewHistoryRef.current[filePath];
    if (!current || current.future.length === 0) return;
    const next = current.future[0];
    previewHistoryRef.current[filePath] = {
      past: [
        ...current.past.slice(-(MAX_PREVIEW_HISTORY - 1)),
        current.present,
      ],
      present: next,
      future: current.future.slice(1),
    };
    textFileCacheRef.current[filePath] = next;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content: next,
        },
      };
    });
    pendingPreviewWritesRef.current[filePath] = next;
    setDirtyFiles((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );
    setDirtyPathKeysByFile((prev) => ({
      ...prev,
      [filePath]: [],
    }));
    const currentEntry = filesRef.current[filePath];
    if (currentEntry) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [filePath]: {
          ...currentEntry,
          content: next,
        },
      };
      const previewDoc = createPreviewDocument(
        previewSnapshot,
        filePath,
        previewDependencyIndexRef.current[filePath],
      );
      cachePreviewDoc(filePath, previewDoc);
      setSelectedPreviewDoc(previewDoc);
    }
    await flushPendingPreviewSaves();
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [
    cachePreviewDoc,
    filesRef,
    flushPendingPreviewSaves,
    pendingPreviewWritesRef,
    previewDependencyIndexRef,
    previewHistoryRef,
    schedulePreviewAutoSave,
    selectedPreviewHtmlRef,
    setDirtyFiles,
    setDirtyPathKeysByFile,
    setFiles,
    setPreviewRefreshNonce,
    setSelectedPreviewDoc,
    textFileCacheRef,
  ]);

  const runUndo = useCallback(() => {
    if (
      interactionModeRef.current === "preview" &&
      selectedPreviewHtmlRef.current
    ) {
      void handlePreviewUndo();
      return;
    }
    handleUndo();
  }, [handlePreviewUndo, handleUndo, interactionModeRef, selectedPreviewHtmlRef]);

  const runRedo = useCallback(() => {
    if (
      interactionModeRef.current === "preview" &&
      selectedPreviewHtmlRef.current
    ) {
      void handlePreviewRedo();
      return;
    }
    handleRedo();
  }, [handlePreviewRedo, handleRedo, interactionModeRef, selectedPreviewHtmlRef]);

  return {
    discardUnsavedChangesForFile,
    flushPendingPreviewSaves,
    markPreviewPathDirty,
    pushPreviewHistory,
    runRedo,
    runUndo,
    schedulePreviewAutoSave,
  };
};
