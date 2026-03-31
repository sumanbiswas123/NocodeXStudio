import { useCallback, useEffect, useMemo } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FileMap, ProjectFile } from "../types";
import { isCodeEditableFile, isSvgPath } from "./appHelpers";

type UseCodeEditorStateOptions = {
  activeFile: string | null;
  codeDraftByPath: Record<string, string>;
  codeDraftByPathRef: MutableRefObject<Record<string, string>>;
  codeDirtyPathSet: Record<string, true>;
  codeDirtyPathSetRef: MutableRefObject<Record<string, true>>;
  dirtyFilesRef: MutableRefObject<string[]>;
  files: FileMap;
  filesRef: MutableRefObject<FileMap>;
  isCodePanelOpen: boolean;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  persistPreviewHtmlContent: (
    path: string,
    html: string,
    options?: {
      refreshPreviewDoc?: boolean;
      saveNow?: boolean;
      pushToHistory?: boolean;
    },
  ) => Promise<void>;
  selectedPreviewHtml: string | null;
  selectedPreviewHtmlRef: MutableRefObject<string | null>;
  setActiveFileStable: (path: string | null) => void;
  setCodeDraftByPath: Dispatch<SetStateAction<Record<string, string>>>;
  setCodeDirtyPathSet: Dispatch<SetStateAction<Record<string, true>>>;
  setDirtyFiles: Dispatch<SetStateAction<string[]>>;
  setFiles: Dispatch<SetStateAction<FileMap>>;
  setPreviewNavigationFile: Dispatch<SetStateAction<string | null>>;
  setPreviewRefreshNonce: Dispatch<SetStateAction<number>>;
  setPreviewSyncedFile: Dispatch<SetStateAction<string | null>>;
  textFileCacheRef: MutableRefObject<Record<string, string>>;
  saveCodeDraftsRef: MutableRefObject<(() => Promise<void>) | null>;
};

export const useCodeEditorState = ({
  activeFile,
  codeDraftByPath,
  codeDraftByPathRef,
  codeDirtyPathSet,
  codeDirtyPathSetRef,
  dirtyFilesRef,
  files,
  filesRef,
  isCodePanelOpen,
  loadFileContent,
  filePathIndexRef,
  persistPreviewHtmlContent,
  selectedPreviewHtml,
  selectedPreviewHtmlRef,
  setActiveFileStable,
  setCodeDraftByPath,
  setCodeDirtyPathSet,
  setDirtyFiles,
  setFiles,
  setPreviewNavigationFile,
  setPreviewRefreshNonce,
  setPreviewSyncedFile,
  textFileCacheRef,
  saveCodeDraftsRef,
}: UseCodeEditorStateOptions) => {
  const activeCodeFilePath = useMemo(() => {
    if (activeFile && files[activeFile]) return activeFile;
    if (selectedPreviewHtml && files[selectedPreviewHtml]) return selectedPreviewHtml;
    return Object.keys(files).sort((a, b) => a.localeCompare(b))[0] ?? null;
  }, [activeFile, files, selectedPreviewHtml]);

  const activeCodeContent = useMemo(() => {
    if (!activeCodeFilePath) return "";
    if (typeof codeDraftByPath[activeCodeFilePath] === "string") {
      return codeDraftByPath[activeCodeFilePath];
    }
    const raw = files[activeCodeFilePath]?.content;
    return typeof raw === "string" ? raw : "";
  }, [activeCodeFilePath, codeDraftByPath, files]);

  const activeDetachedEditorFilePath = useMemo(() => {
    if (activeFile && files[activeFile]) return activeFile;
    if (selectedPreviewHtml && files[selectedPreviewHtml]) {
      return selectedPreviewHtml;
    }
    return Object.keys(files).sort((a, b) => a.localeCompare(b))[0] ?? null;
  }, [activeFile, files, selectedPreviewHtml]);

  const activeDetachedEditorFileType: ProjectFile["type"] | null =
    activeDetachedEditorFilePath
      ? (files[activeDetachedEditorFilePath]?.type ?? null)
      : null;

  const activeDetachedEditorContent = useMemo(() => {
    if (!activeDetachedEditorFilePath) return "";
    if (
      typeof codeDraftByPath[activeDetachedEditorFilePath] === "string" &&
      files[activeDetachedEditorFilePath] &&
      isCodeEditableFile(
        activeDetachedEditorFilePath,
        files[activeDetachedEditorFilePath].type,
      )
    ) {
      return codeDraftByPath[activeDetachedEditorFilePath];
    }
    const raw = files[activeDetachedEditorFilePath]?.content;
    return typeof raw === "string" ? raw : "";
  }, [activeDetachedEditorFilePath, codeDraftByPath, files]);

  const activeDetachedEditorIsDirty = activeDetachedEditorFilePath
    ? Boolean(codeDirtyPathSet[activeDetachedEditorFilePath])
    : false;

  const detachedEditorIsTextEditable = Boolean(
    activeDetachedEditorFilePath &&
      activeDetachedEditorFileType &&
      isCodeEditableFile(
        activeDetachedEditorFilePath,
        activeDetachedEditorFileType,
      ),
  );

  const handleDetachedEditorSelectFile = useCallback(
    (path: string) => {
      if (!path || !files[path]) return;
      setActiveFileStable(path);
      if (files[path]?.type === "html") {
        setPreviewSyncedFile((prev) => (prev === path ? prev : path));
        setPreviewNavigationFile((prev) => (prev === path ? prev : path));
      }
      if (isSvgPath(path)) {
        const absolutePath = filePathIndexRef.current[path];
        if (!absolutePath) return;
        void (async () => {
          try {
            const raw = await (Neutralino as any).filesystem.readFile(absolutePath);
            textFileCacheRef.current[path] = raw;
            setFiles((prev) => {
              const existing = prev[path];
              if (!existing) return prev;
              return {
                ...prev,
                [path]: {
                  ...existing,
                  content: raw,
                },
              };
            });
          } catch (error) {
            console.warn(`Failed reading SVG source ${path}:`, error);
          }
        })();
        return;
      }
      void loadFileContent(path, { persistToState: true });
    },
    [
      filePathIndexRef,
      files,
      loadFileContent,
      setActiveFileStable,
      setFiles,
      setPreviewNavigationFile,
      setPreviewSyncedFile,
      textFileCacheRef,
    ],
  );

  const saveCodeDraftAtPath = useCallback(
    async (path: string) => {
      const draft = codeDraftByPathRef.current[path];
      if (typeof draft !== "string") return;
      const file = filesRef.current[path];
      if (!file || !isCodeEditableFile(path, file.type)) return;
      try {
        if (file.type === "html") {
          await persistPreviewHtmlContent(path, draft, {
            refreshPreviewDoc: path === selectedPreviewHtmlRef.current,
            saveNow: true,
            pushToHistory: true,
          });
          if (path === selectedPreviewHtmlRef.current) {
            setPreviewNavigationFile((prev) => (prev === path ? prev : path));
            setPreviewRefreshNonce((prev) => prev + 1);
          }
        } else {
          const absolutePath = filePathIndexRef.current[path];
          if (!absolutePath) return;
          await (Neutralino as any).filesystem.writeFile(absolutePath, draft);
          textFileCacheRef.current[path] = draft;
          setFiles((prev) => {
            const existing = prev[path];
            if (!existing) return prev;
            return {
              ...prev,
              [path]: {
                ...existing,
                content: draft,
              },
            };
          });
          const currentPreview = selectedPreviewHtmlRef.current;
          if (currentPreview) {
            setPreviewNavigationFile((prev) =>
              prev === currentPreview ? prev : currentPreview,
            );
          }
          setPreviewRefreshNonce((prev) => prev + 1);
        }
        delete codeDraftByPathRef.current[path];
        delete codeDirtyPathSetRef.current[path];
        dirtyFilesRef.current = dirtyFilesRef.current.filter((entry) => entry !== path);
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
        setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
      } catch (error) {
        console.warn(`Failed saving code file ${path}:`, error);
      }
    },
    [
      codeDraftByPathRef,
      codeDirtyPathSetRef,
      dirtyFilesRef,
      filePathIndexRef,
      filesRef,
      persistPreviewHtmlContent,
      selectedPreviewHtmlRef,
      setCodeDraftByPath,
      setCodeDirtyPathSet,
      setDirtyFiles,
      setFiles,
      setPreviewNavigationFile,
      setPreviewRefreshNonce,
      textFileCacheRef,
    ],
  );

  const saveAllCodeDrafts = useCallback(async () => {
    const dirtyPaths = Object.keys(codeDirtyPathSetRef.current);
    for (const path of dirtyPaths) {
      await saveCodeDraftAtPath(path);
    }
  }, [codeDirtyPathSetRef, saveCodeDraftAtPath]);

  useEffect(() => {
    saveCodeDraftsRef.current = saveAllCodeDrafts;
    return () => {
      if (saveCodeDraftsRef.current === saveAllCodeDrafts) {
        saveCodeDraftsRef.current = null;
      }
    };
  }, [saveAllCodeDrafts, saveCodeDraftsRef]);

  const handleCodeDraftChange = useCallback(
    (nextValue: string | undefined) => {
      if (!activeCodeFilePath) return;
      const value = nextValue ?? "";
      codeDraftByPathRef.current = {
        ...codeDraftByPathRef.current,
        [activeCodeFilePath]: value,
      };
      codeDirtyPathSetRef.current = {
        ...codeDirtyPathSetRef.current,
        [activeCodeFilePath]: true,
      };
      if (!dirtyFilesRef.current.includes(activeCodeFilePath)) {
        dirtyFilesRef.current = [...dirtyFilesRef.current, activeCodeFilePath];
      }
      setCodeDraftByPath((prev) => ({
        ...prev,
        [activeCodeFilePath]: value,
      }));
      setCodeDirtyPathSet((prev) => ({
        ...prev,
        [activeCodeFilePath]: true,
      }));
      setDirtyFiles((prev) =>
        prev.includes(activeCodeFilePath) ? prev : [...prev, activeCodeFilePath],
      );
    },
    [
      activeCodeFilePath,
      codeDraftByPathRef,
      codeDirtyPathSetRef,
      dirtyFilesRef,
      setCodeDraftByPath,
      setCodeDirtyPathSet,
      setDirtyFiles,
    ],
  );

  const handleDetachedEditorChange = useCallback(
    (nextValue: string) => {
      if (!activeDetachedEditorFilePath || !activeDetachedEditorFileType) return;
      if (
        !isCodeEditableFile(
          activeDetachedEditorFilePath,
          activeDetachedEditorFileType,
        )
      ) {
        return;
      }
      codeDraftByPathRef.current = {
        ...codeDraftByPathRef.current,
        [activeDetachedEditorFilePath]: nextValue,
      };
      codeDirtyPathSetRef.current = {
        ...codeDirtyPathSetRef.current,
        [activeDetachedEditorFilePath]: true,
      };
      if (!dirtyFilesRef.current.includes(activeDetachedEditorFilePath)) {
        dirtyFilesRef.current = [...dirtyFilesRef.current, activeDetachedEditorFilePath];
      }
      setCodeDraftByPath((prev) => ({
        ...prev,
        [activeDetachedEditorFilePath]: nextValue,
      }));
      setCodeDirtyPathSet((prev) => ({
        ...prev,
        [activeDetachedEditorFilePath]: true,
      }));
      setDirtyFiles((prev) =>
        prev.includes(activeDetachedEditorFilePath)
          ? prev
          : [...prev, activeDetachedEditorFilePath],
      );
    },
    [
      activeDetachedEditorFilePath,
      activeDetachedEditorFileType,
      codeDraftByPathRef,
      codeDirtyPathSetRef,
      dirtyFilesRef,
      setCodeDraftByPath,
      setCodeDirtyPathSet,
      setDirtyFiles,
    ],
  );

  useEffect(() => {
    if (!isCodePanelOpen) return;
    if (!activeCodeFilePath) return;
    void loadFileContent(activeCodeFilePath, { persistToState: true });
  }, [activeCodeFilePath, isCodePanelOpen, loadFileContent]);

  return {
    activeCodeContent,
    activeCodeFilePath,
    activeDetachedEditorContent,
    activeDetachedEditorFilePath,
    activeDetachedEditorIsDirty,
    detachedEditorIsTextEditable,
    handleCodeDraftChange,
    handleDetachedEditorChange,
    handleDetachedEditorSelectFile,
    saveCodeDraftAtPath,
  };
};
