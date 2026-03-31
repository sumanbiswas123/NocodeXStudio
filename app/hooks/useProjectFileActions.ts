import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { FileMap } from "../../types";
import { resolvePreviewAssetUrl as resolvePreviewAssetUrlHelper } from "../helpers/mediaWorkspaceHelpers";
import {
  getParentPath,
  isTextFileType,
  joinPath,
  normalizePath,
  normalizeProjectRelative,
  pickDefaultHtmlFile,
} from "../helpers/appHelpers";
import {
  ensureDirectoryForFile,
  ensureDirectoryTree,
  indexProjectForOpen,
  patchMtVeevaCheck,
  refreshProjectFileIndex,
} from "../runtime/projectFilesystem";
import { initializeProjectOpenRuntime } from "../runtime/projectOpenRuntime";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";
type PreviewToolMode = "edit" | "inspect" | "draw" | "move";

type UseProjectFileActionsOptions = {
  activeFileRef: MutableRefObject<string | null>;
  binaryAssetUrlCacheRef: MutableRefObject<Record<string, string>>;
  clearPreviewConsole: () => void;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  filesRef: MutableRefObject<FileMap>;
  fontCachePathRef: MutableRefObject<string | null>;
  isRefreshingFilesRef: MutableRefObject<boolean>;
  loadingFilePromisesRef: MutableRefObject<
    Record<string, Promise<string | Blob | null | undefined>>
  >;
  loadingFilesRef: MutableRefObject<Set<string>>;
  pendingPreviewWritesRef: MutableRefObject<Record<string, string>>;
  presentationCssPathRef: MutableRefObject<string | null>;
  previewDependencyIndexRef: MutableRefObject<Record<string, string[]>>;
  previewDocCacheOrderRef: MutableRefObject<string[]>;
  previewDocCacheRef: MutableRefObject<Record<string, string>>;
  previewFrameRef: MutableRefObject<HTMLIFrameElement | null>;
  previewHistoryRef: MutableRefObject<Record<string, unknown>>;
  previewMountBasePath: string | null;
  previewRootAliasPathRef: MutableRefObject<string | null>;
  projectPath: string | null;
  revokeBinaryAssetUrls: () => void;
  selectedFolderCloneSource: string | null;
  selectedPreviewHtmlRef: MutableRefObject<string | null>;
  setActiveFileStable: (path: string | null) => void;
  setAvailableFonts: Dispatch<SetStateAction<string[]>>;
  setCodeDraftByPath: Dispatch<SetStateAction<Record<string, string>>>;
  setCodeDirtyPathSet: Dispatch<SetStateAction<Record<string, true>>>;
  setDirtyFiles: Dispatch<SetStateAction<string[]>>;
  setDirtyPathKeysByFile: Dispatch<
    SetStateAction<Record<string, string[]>>
  >;
  setFiles: Dispatch<SetStateAction<FileMap>>;
  setInteractionMode: Dispatch<SetStateAction<InteractionMode>>;
  setIsConfigModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsLeftPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsPreviewMountReady: Dispatch<SetStateAction<boolean>>;
  setPreviewMode: Dispatch<SetStateAction<"edit" | "preview">>;
  setPreviewMountBasePath: Dispatch<SetStateAction<string | null>>;
  setPreviewNavigationFile: Dispatch<SetStateAction<string | null>>;
  setPreviewSyncedFile: Dispatch<SetStateAction<string | null>>;
  setProjectPath: Dispatch<SetStateAction<string | null>>;
  setRecentProjects: Dispatch<SetStateAction<string[]>>;
  setSidebarToolMode: Dispatch<SetStateAction<PreviewToolMode>>;
  textFileCacheRef: MutableRefObject<Record<string, string>>;
};

type UseProjectFileActionsResult = {
  ensureDirectoryForFileStable: typeof ensureDirectoryForFile;
  ensureDirectoryTreeStable: typeof ensureDirectoryTree;
  handleCreateFileAtPath: (parentPath: string) => Promise<void>;
  handleCreateFolderAtPath: (parentPath: string) => Promise<void>;
  handleDeletePath: (path: string, kind: "file" | "folder") => Promise<void>;
  handleDuplicateFile: (path: string) => Promise<void>;
  handleOpenFolder: (preselectedFolder?: string | null) => Promise<void>;
  handleRenamePath: (path: string) => Promise<void>;
  openPopupInPreview: (selector: string | null, popupId: string | null) => boolean;
  refreshProjectFiles: () => Promise<void>;
  resolvePreviewAssetUrl: (rawUrl: string | null | undefined) => string;
};

export const useProjectFileActions = ({
  activeFileRef,
  binaryAssetUrlCacheRef,
  clearPreviewConsole,
  filePathIndexRef,
  filesRef,
  fontCachePathRef,
  isRefreshingFilesRef,
  loadingFilePromisesRef,
  loadingFilesRef,
  pendingPreviewWritesRef,
  presentationCssPathRef,
  previewDependencyIndexRef,
  previewDocCacheOrderRef,
  previewDocCacheRef,
  previewFrameRef,
  previewHistoryRef,
  previewMountBasePath,
  previewRootAliasPathRef,
  projectPath,
  revokeBinaryAssetUrls,
  selectedFolderCloneSource,
  selectedPreviewHtmlRef,
  setActiveFileStable,
  setAvailableFonts,
  setCodeDraftByPath,
  setCodeDirtyPathSet,
  setDirtyFiles,
  setDirtyPathKeysByFile,
  setFiles,
  setInteractionMode,
  setIsConfigModalOpen,
  setIsLeftPanelOpen,
  setIsPreviewMountReady,
  setPreviewMode,
  setPreviewMountBasePath,
  setPreviewNavigationFile,
  setPreviewSyncedFile,
  setProjectPath,
  setRecentProjects,
  setSidebarToolMode,
  textFileCacheRef,
}: UseProjectFileActionsOptions): UseProjectFileActionsResult => {
  const ensureDirectoryTreeStable = useCallback(ensureDirectoryTree, []);
  const ensureDirectoryForFileStable = useCallback(ensureDirectoryForFile, []);

  const resolvePreviewAssetUrl = useCallback(
    (rawUrl: string | null | undefined) => {
      return resolvePreviewAssetUrlHelper({
        rawUrl,
        projectPath,
        previewMountBasePath,
        selectedPreviewHtml: selectedPreviewHtmlRef.current || "",
        filePathIndex: filePathIndexRef.current,
      });
    },
    [filePathIndexRef, previewMountBasePath, projectPath, selectedPreviewHtmlRef],
  );

  const openPopupInPreview = useCallback(
    (selector: string | null, popupId: string | null) => {
      const doc =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!doc) return false;
      let target: HTMLElement | null = null;
      if (selector) {
        target = doc.querySelector(selector) as HTMLElement | null;
      }
      if (!target && popupId) {
        target = doc.querySelector(
          `[data-popup-id="${popupId}"], #${popupId}`,
        ) as HTMLElement | null;
      }
      if (!target) return false;
      target.style.display = target.style.display || "block";
      target.style.visibility = "visible";
      target.style.opacity = target.style.opacity || "1";
      target.classList.add("open", "active", "show");
      target.classList.remove("hidden", "is-hidden", "closed");
      target.removeAttribute("hidden");
      target.setAttribute("aria-hidden", "false");
      target.style.pointerEvents = "auto";
      target.scrollIntoView({ block: "center", inline: "center" });
      return true;
    },
    [previewFrameRef],
  );

  const handleOpenFolder = useCallback(
    async (preselectedFolder?: string | null) => {
      try {
        const selectedFolder =
          preselectedFolder ||
          (await (Neutralino as any).os.showFolderDialog(
            "Select project folder",
          ));
        if (!selectedFolder) return;

        setIsLeftPanelOpen(true);

        const rootPath = normalizePath(selectedFolder);
        let {
          files: fsFiles,
          absolutePathIndex,
          sharedDirectoryPath,
          nearestSharedParent,
        } = await indexProjectForOpen(rootPath);

        if (sharedDirectoryPath) {
          await patchMtVeevaCheck(sharedDirectoryPath);
        }

        const runtime = await initializeProjectOpenRuntime({
          fsFiles,
          absolutePathIndex,
          sharedDirectoryPath,
          nearestSharedParent,
          rootPath,
          previousPreviewRootAliasPath: previewRootAliasPathRef.current,
        });
        fsFiles = runtime.fsFiles;
        absolutePathIndex = runtime.absolutePathIndex;
        presentationCssPathRef.current = runtime.presentationCssVirtualPath;
        fontCachePathRef.current = runtime.fontCacheVirtualPath;
        previewRootAliasPathRef.current = runtime.previewRootAliasPath;
        setAvailableFonts(runtime.availableFonts);

        filePathIndexRef.current = absolutePathIndex;
        loadingFilesRef.current.clear();
        loadingFilePromisesRef.current = {};
        textFileCacheRef.current = {};
        revokeBinaryAssetUrls();
        clearPreviewConsole();
        pendingPreviewWritesRef.current = {};
        previewHistoryRef.current = {};
        previewDependencyIndexRef.current = {};
        previewDocCacheRef.current = {};
        previewDocCacheOrderRef.current = [];
        setDirtyFiles([]);
        setDirtyPathKeysByFile({});
        setFiles(fsFiles);
        setProjectPath(rootPath);
        setRecentProjects((prev) =>
          [
            rootPath,
            ...prev.filter((entry) => normalizePath(entry) !== rootPath),
          ].slice(0, 5),
        );
        setPreviewMountBasePath(runtime.mountBasePath);
        setIsPreviewMountReady(runtime.mountReady);

        const defaultHtmlFile = pickDefaultHtmlFile(fsFiles);
        const firstOpenableFile = Object.values(fsFiles).find((file) =>
          ["html", "css", "js", "unknown"].includes(file.type),
        );
        const initialFile = defaultHtmlFile ?? firstOpenableFile?.path ?? null;
        setActiveFileStable(initialFile);
        setPreviewSyncedFile(initialFile);
        setPreviewNavigationFile(initialFile);
        selectedPreviewHtmlRef.current =
          initialFile && fsFiles[initialFile]?.type === "html"
            ? initialFile
            : null;
        setSidebarToolMode("edit");
        setPreviewMode("preview");
        setInteractionMode("preview");
      } catch (error) {
        console.error("Failed to open folder:", error);
        alert("Could not open folder. Please try again.");
      }
    },
    [
      clearPreviewConsole,
      filePathIndexRef,
      loadingFilePromisesRef,
      loadingFilesRef,
      pendingPreviewWritesRef,
      presentationCssPathRef,
      previewDependencyIndexRef,
      previewDocCacheOrderRef,
      previewDocCacheRef,
      previewHistoryRef,
      previewRootAliasPathRef,
      revokeBinaryAssetUrls,
      selectedPreviewHtmlRef,
      setActiveFileStable,
      setAvailableFonts,
      setDirtyFiles,
      setDirtyPathKeysByFile,
      setFiles,
      setInteractionMode,
      setIsLeftPanelOpen,
      setIsPreviewMountReady,
      setPreviewMode,
      setPreviewMountBasePath,
      setPreviewNavigationFile,
      setPreviewSyncedFile,
      setProjectPath,
      setRecentProjects,
      setSidebarToolMode,
      textFileCacheRef,
    ],
  );

  const refreshProjectFiles = useCallback(async () => {
    if (!projectPath) return;
    if (isRefreshingFilesRef.current) return;
    isRefreshingFilesRef.current = true;
    try {
      const { files: nextFiles, absolutePathIndex } =
        await refreshProjectFileIndex({
          projectPath,
          previousFileIndex: filePathIndexRef.current,
          existingFiles: filesRef.current,
          textFileCache: textFileCacheRef.current,
          binaryAssetUrlCache: binaryAssetUrlCacheRef.current,
        });

      filePathIndexRef.current = absolutePathIndex;
      setFiles(nextFiles);
      setCodeDraftByPath((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(
            ([path]) => nextFiles[path] && isTextFileType(nextFiles[path].type),
          ),
        ),
      );
      setCodeDirtyPathSet(
        (prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(
              ([path]) => nextFiles[path] && isTextFileType(nextFiles[path].type),
            ),
          ) as Record<string, true>,
      );
      setDirtyFiles((prev) => prev.filter((path) => Boolean(nextFiles[path])));

      const existingActive = activeFileRef.current;
      const preferredPreview = selectedPreviewHtmlRef.current;
      if (!existingActive || !nextFiles[existingActive]) {
        const fallback =
          (preferredPreview && nextFiles[preferredPreview]
            ? preferredPreview
            : null) ??
          pickDefaultHtmlFile(nextFiles) ??
          Object.keys(nextFiles).find((path) =>
            isTextFileType(nextFiles[path].type),
          ) ??
          null;
        setActiveFileStable(fallback);
        setPreviewSyncedFile(fallback);
        setPreviewNavigationFile(fallback);
      }
    } catch (error) {
      console.warn("Failed to refresh file index:", error);
    } finally {
      isRefreshingFilesRef.current = false;
    }
  }, [
    activeFileRef,
    binaryAssetUrlCacheRef,
    filePathIndexRef,
    filesRef,
    isRefreshingFilesRef,
    projectPath,
    selectedPreviewHtmlRef,
    setActiveFileStable,
    setCodeDraftByPath,
    setCodeDirtyPathSet,
    setDirtyFiles,
    setFiles,
    setPreviewNavigationFile,
    setPreviewSyncedFile,
    textFileCacheRef,
  ]);

  const handleCreateFileAtPath = useCallback(
    async (parentPath: string) => {
      if (!projectPath) return;
      const defaultName = "new-file.html";
      const nextName = window.prompt("New file name", defaultName);
      if (!nextName) return;
      const cleanedName = normalizeProjectRelative(nextName);
      if (!cleanedName) return;

      const baseVirtual = normalizeProjectRelative(parentPath || "");
      const nextVirtual = normalizeProjectRelative(
        baseVirtual ? `${baseVirtual}/${cleanedName}` : cleanedName,
      );
      if (!nextVirtual) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("A file with the same path already exists.");
        return;
      }

      const absolutePath = normalizePath(joinPath(projectPath, nextVirtual));
      const absoluteParent = getParentPath(absolutePath);
      if (absoluteParent) {
        await ensureDirectoryTreeStable(absoluteParent);
      }
      try {
        await (Neutralino as any).filesystem.writeFile(absolutePath, "");
      } catch (error) {
        console.warn("Failed to create file:", error);
        window.alert("Could not create file.");
        return;
      }
      await refreshProjectFiles();
      setActiveFileStable(nextVirtual);
      setPreviewSyncedFile((prev) => (prev === nextVirtual ? prev : nextVirtual));
      setPreviewNavigationFile((prev) =>
        prev === nextVirtual ? prev : nextVirtual,
      );
      setIsLeftPanelOpen(true);
    },
    [
      ensureDirectoryTreeStable,
      filesRef,
      projectPath,
      refreshProjectFiles,
      setActiveFileStable,
      setIsLeftPanelOpen,
      setPreviewNavigationFile,
      setPreviewSyncedFile,
    ],
  );

  const handleCreateFolderAtPath = useCallback(
    async (parentPath: string) => {
      if (!projectPath) return;
      if (!selectedFolderCloneSource) {
        setIsConfigModalOpen(true);
        return;
      }
      const nextName = window.prompt("New folder name", "new-folder");
      if (!nextName) return;
      const cleanedName = normalizeProjectRelative(nextName);
      if (!cleanedName) return;
      const baseVirtual = normalizeProjectRelative(parentPath || "");
      const nextVirtual = normalizeProjectRelative(
        baseVirtual ? `${baseVirtual}/${cleanedName}` : cleanedName,
      );
      if (!nextVirtual) return;
      const absoluteSource = normalizePath(
        joinPath(projectPath, selectedFolderCloneSource),
      );
      const absolutePath = normalizePath(joinPath(projectPath, nextVirtual));
      try {
        await (Neutralino as any).filesystem.copy(absoluteSource, absolutePath, {
          recursive: true,
          overwrite: false,
          skip: false,
        });
      } catch (error) {
        console.warn("Failed to clone directory:", error);
        window.alert("Could not clone folder.");
        return;
      }
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [
      projectPath,
      refreshProjectFiles,
      selectedFolderCloneSource,
      setIsConfigModalOpen,
      setIsLeftPanelOpen,
    ],
  );

  const handleRenamePath = useCallback(
    async (path: string) => {
      if (!projectPath || !path) return;
      const currentName = path.includes("/")
        ? path.slice(path.lastIndexOf("/") + 1)
        : path;
      const nextName = window.prompt("Rename to", currentName);
      if (!nextName) return;
      const normalizedName = normalizeProjectRelative(nextName);
      if (!normalizedName) return;
      const parentVirtual = getParentPath(path) || "";
      const nextVirtual = normalizeProjectRelative(
        parentVirtual ? `${parentVirtual}/${normalizedName}` : normalizedName,
      );
      if (!nextVirtual || nextVirtual === path) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("Another item with the same name already exists.");
        return;
      }
      const absoluteSource =
        filePathIndexRef.current[path] || normalizePath(joinPath(projectPath, path));
      const absoluteParent = getParentPath(absoluteSource);
      if (!absoluteParent) return;
      const absoluteDestination = normalizePath(
        joinPath(absoluteParent, normalizedName),
      );
      try {
        await (Neutralino as any).filesystem.move(
          absoluteSource,
          absoluteDestination,
        );
      } catch (error) {
        console.warn("Rename failed:", error);
        window.alert("Could not rename item.");
        return;
      }
      await refreshProjectFiles();
      if (activeFileRef.current === path) {
        setActiveFileStable(nextVirtual);
      }
      setIsLeftPanelOpen(true);
    },
    [
      activeFileRef,
      filePathIndexRef,
      filesRef,
      projectPath,
      refreshProjectFiles,
      setActiveFileStable,
      setIsLeftPanelOpen,
    ],
  );

  const handleDeletePath = useCallback(
    async (path: string, kind: "file" | "folder") => {
      if (!projectPath || !path) return;
      const label = kind === "folder" ? "folder" : "file";
      const ok = window.confirm(`Delete ${label} "${path}"?`);
      if (!ok) return;
      const absoluteTarget =
        filePathIndexRef.current[path] || normalizePath(joinPath(projectPath, path));
      try {
        await (Neutralino as any).filesystem.remove(absoluteTarget);
      } catch (error) {
        console.warn("Delete failed:", error);
        window.alert("Could not delete item.");
        return;
      }
      if (
        activeFileRef.current &&
        (activeFileRef.current === path ||
          activeFileRef.current.startsWith(`${path}/`))
      ) {
        setActiveFileStable(null);
      }
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [
      activeFileRef,
      filePathIndexRef,
      projectPath,
      refreshProjectFiles,
      setActiveFileStable,
      setIsLeftPanelOpen,
    ],
  );

  const handleDuplicateFile = useCallback(
    async (path: string) => {
      if (!projectPath || !path) return;
      const absoluteSource =
        filePathIndexRef.current[path] || normalizePath(joinPath(projectPath, path));
      const currentName = path.includes("/")
        ? path.slice(path.lastIndexOf("/") + 1)
        : path;
      const dotIndex = currentName.lastIndexOf(".");
      const stem = dotIndex > 0 ? currentName.slice(0, dotIndex) : currentName;
      const ext = dotIndex > 0 ? currentName.slice(dotIndex) : "";
      const defaultName = `${stem}-copy${ext}`;
      const nextName = window.prompt("Duplicate as", defaultName);
      if (!nextName) return;
      const normalizedName = normalizeProjectRelative(nextName);
      if (!normalizedName) return;
      const parentVirtual = getParentPath(path) || "";
      const nextVirtual = normalizeProjectRelative(
        parentVirtual ? `${parentVirtual}/${normalizedName}` : normalizedName,
      );
      if (!nextVirtual) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("A file with this name already exists.");
        return;
      }
      const absoluteParent = getParentPath(absoluteSource);
      if (!absoluteParent) return;
      const absoluteDestination = normalizePath(
        joinPath(absoluteParent, normalizedName),
      );
      try {
        await (Neutralino as any).filesystem.copy(
          absoluteSource,
          absoluteDestination,
          {
            recursive: false,
            overwrite: false,
            skip: false,
          },
        );
      } catch (error) {
        console.warn("Duplicate failed:", error);
        window.alert("Could not duplicate file.");
        return;
      }
      await refreshProjectFiles();
      setActiveFileStable(nextVirtual);
      setIsLeftPanelOpen(true);
    },
    [
      filePathIndexRef,
      filesRef,
      projectPath,
      refreshProjectFiles,
      setActiveFileStable,
      setIsLeftPanelOpen,
    ],
  );

  useEffect(() => {
    if (!projectPath) return;
    const timer = window.setInterval(() => {
      if (document.hidden || !document.hasFocus()) return;
      void refreshProjectFiles();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [projectPath, refreshProjectFiles]);

  return {
    ensureDirectoryForFileStable,
    ensureDirectoryTreeStable,
    handleCreateFileAtPath,
    handleCreateFolderAtPath,
    handleDeletePath,
    handleDuplicateFile,
    handleOpenFolder,
    handleRenamePath,
    openPopupInPreview,
    refreshProjectFiles,
    resolvePreviewAssetUrl,
  };
};
