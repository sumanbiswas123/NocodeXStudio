import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { FileMap } from "../../../types";
import { resolvePreviewAssetUrl as resolvePreviewAssetUrlHelper } from "../../helpers/mediaWorkspaceHelpers";
import {
  getParentPath,
  isTextFileType,
  joinPath,
  normalizePath,
  normalizeProjectRelative,
  pickDefaultHtmlFile,
  resolveConfigPathFromFiles,
} from "../../helpers/appHelpers";
import {
  ensureDirectoryForFile,
  ensureDirectoryTree,
  indexProjectForOpen,
  patchMtVeevaCheck,
  refreshProjectFileIndex,
} from "../../runtime/projectFilesystem";
import { initializeProjectOpenRuntime } from "../../runtime/projectOpenRuntime";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";
type PreviewToolMode = "edit" | "inspect" | "draw" | "move";

type UseProjectFileActionsOptions = {
  activeFileRef: MutableRefObject<string | null>;
  binaryAssetUrlCacheRef: MutableRefObject<Record<string, string>>;
  clearPreviewConsole: () => void;
  codeDraftByPathRef: MutableRefObject<Record<string, string>>;
  codeDirtyPathSetRef: MutableRefObject<Record<string, true>>;
  dirtyFilesRef: MutableRefObject<string[]>;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  filesRef: MutableRefObject<FileMap>;
  fontCachePathRef: MutableRefObject<string | null>;
  isRefreshingFilesRef: MutableRefObject<boolean>;
  loadingFilePromisesRef: MutableRefObject<
    Partial<Record<string, Promise<string | undefined>>>
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
  requestCreateFileName?: (
    parentPath: string,
    suggestedName: string,
  ) => Promise<string | null>;
  requestCreateFolderName?: (
    parentPath: string,
    suggestedName: string,
  ) => Promise<string | null>;
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

type ConfigWrapper = {
  draft: Record<string, any>;
  prefix: string;
  suffix: string;
};

const CONFIG_ARRAY_KEYS = [
  "pageReferencesAll",
  "pageFootnotesAll",
  "pageAbbreviationsAll",
  "pageAbbreviationAll",
] as const;

const CONFIG_SLIDE_TEXT_DEFAULTS = {
  pagesTitles: (slideId: string) => slideId,
  pagesDesc: (slideId: string) => slideId,
  menuDesc: () => "",
} as const;

function extractAssignedObject(
  raw: string,
  assignmentPattern: RegExp,
): ConfigWrapper | null {
  const content = String(raw || "");
  const match = assignmentPattern.exec(content);
  if (!match || match.index < 0) return null;
  const objectStart = content.indexOf("{", match.index);
  if (objectStart < 0) return null;

  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;
  let objectEnd = -1;

  for (let index = objectStart; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
        stringQuote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        objectEnd = index;
        break;
      }
    }
  }

  if (objectEnd < objectStart) return null;
  const prefix = content.slice(0, objectStart);
  const objectText = content.slice(objectStart, objectEnd + 1);
  const suffix = content.slice(objectEnd + 1);

  try {
    return {
      draft: JSON.parse(objectText),
      prefix,
      suffix,
    };
  } catch (error) {
    console.warn("Failed to parse assigned config object:", error);
    return null;
  }
}

function parseConfigWrapper(raw: string, kind: "config" | "portfolio") {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return {
        draft: JSON.parse(trimmed),
        prefix: "",
        suffix: raw.slice(raw.lastIndexOf("}") + 1),
      } satisfies ConfigWrapper;
    } catch (error) {
      console.warn("Failed to parse JSON config:", error);
    }
  }

  const assignmentPattern =
    kind === "portfolio"
      ? /com\.gsk\.portfolioconfig\s*=\s*/i
      : /com\.gsk\.mtconfig\s*=\s*/i;
  return extractAssignedObject(raw, assignmentPattern);
}

function serializeConfigWrapper(wrapper: ConfigWrapper): string {
  return `${wrapper.prefix}${JSON.stringify(wrapper.draft, null, 4)}${wrapper.suffix}`;
}

function insertClonedSlideIntoConfigDraft(
  draft: Record<string, any>,
  nextSlideId: string,
): boolean {
  const pagesAll = Array.isArray(draft.pagesAll)
    ? [...draft.pagesAll]
    : [];
  if (!nextSlideId || pagesAll.includes(nextSlideId)) return false;

  const insertIndex = pagesAll.length;

  pagesAll.splice(insertIndex, 0, nextSlideId);
  draft.pagesAll = pagesAll;

  CONFIG_ARRAY_KEYS.forEach((key) => {
    const existing = Array.isArray(draft[key]) ? [...draft[key]] : [];
    existing.splice(insertIndex, 0, []);
    draft[key] = existing;
  });

  (Object.keys(CONFIG_SLIDE_TEXT_DEFAULTS) as Array<
    keyof typeof CONFIG_SLIDE_TEXT_DEFAULTS
  >).forEach((key) => {
    const existing = Array.isArray(draft[key]) ? [...draft[key]] : [];
    existing.splice(insertIndex, 0, CONFIG_SLIDE_TEXT_DEFAULTS[key](nextSlideId));
    draft[key] = existing;
  });

  const nextSlideIndex = insertIndex;
  const existingFlows =
    draft.flows && typeof draft.flows === "object" ? { ...draft.flows } : {};
  const mainFlow = Array.isArray(existingFlows.Main)
    ? existingFlows.Main
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value >= 0)
    : [];
  if (!mainFlow.includes(nextSlideIndex)) {
    mainFlow.push(nextSlideIndex);
  }
  existingFlows.Main = mainFlow;
  draft.flows = existingFlows;

  if (!draft.homepage && pagesAll.length > 0) {
    draft.homepage = pagesAll[0];
  }

  return true;
}

export const useProjectFileActions = ({
  activeFileRef,
  binaryAssetUrlCacheRef,
  clearPreviewConsole,
  codeDraftByPathRef,
  codeDirtyPathSetRef,
  dirtyFilesRef,
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
  requestCreateFileName,
  requestCreateFolderName,
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

  const getMainParentSeed = useCallback(
    (parentPath: string) => {
      const normalizedParent = normalizeProjectRelative(parentPath || "");
      const parentFolderName =
        normalizedParent.split("/").filter(Boolean).slice(-1)[0] || "";
      const normalizedProject = normalizePath(projectPath || "");
      const projectFolderName =
        normalizedProject.split("/").filter(Boolean).slice(-1)[0] || "";
      const sourceName = parentFolderName || projectFolderName;
      if (!sourceName) return "";
      const mainTokenIndex = sourceName.toUpperCase().indexOf("_MAIN");
      if (mainTokenIndex >= 0) {
        return sourceName.slice(0, mainTokenIndex + 1);
      }
      return "";
    },
    [projectPath],
  );

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

  const syncNewSlideIntoProjectFlow = useCallback(
    async (nextSlidePath: string) => {
      const nextSlideId =
        normalizeProjectRelative(nextSlidePath).split("/").filter(Boolean).pop() ||
        "";
      if (!nextSlideId) return;

      const writeUpdatedConfig = async (virtualPath: string | null) => {
        if (!virtualPath) return false;
        const absolutePath = filePathIndexRef.current[virtualPath];
        if (!absolutePath) return false;

        let rawContent = "";
        try {
          rawContent = String(
            await (Neutralino as any).filesystem.readFile(absolutePath),
          );
        } catch (error) {
          console.warn("Failed to read config file:", error);
          return false;
        }

        const wrapper = parseConfigWrapper(rawContent, "config");
        if (!wrapper) return false;

        const nextDraft = wrapper.draft;
        const changed = insertClonedSlideIntoConfigDraft(nextDraft, nextSlideId);

        if (!changed) return false;

        const serialized = serializeConfigWrapper({
          ...wrapper,
          draft: nextDraft,
        });

        try {
          await (Neutralino as any).filesystem.writeFile(absolutePath, serialized);
        } catch (error) {
          console.warn("Failed to write config file:", error);
          return false;
        }

        filesRef.current = {
          ...filesRef.current,
          [virtualPath]: {
            ...filesRef.current[virtualPath],
            content: serialized,
          },
        };
        setFiles(filesRef.current);
        return true;
      };

      const configPath = resolveConfigPathFromFiles(filesRef.current, "config.json");
      await writeUpdatedConfig(configPath);
    },
    [filePathIndexRef, filesRef, setFiles],
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
        codeDraftByPathRef.current = {};
        codeDirtyPathSetRef.current = {};
        dirtyFilesRef.current = [];
        setDirtyFiles([]);
        setDirtyPathKeysByFile({});
        setCodeDraftByPath({});
        setCodeDirtyPathSet({});
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
      const nextCodeDrafts = Object.fromEntries(
        Object.entries(codeDraftByPathRef.current).filter(
          ([path]) => nextFiles[path] && isTextFileType(nextFiles[path].type),
        ),
      );
      const nextCodeDirtyPathSet = Object.fromEntries(
        Object.entries(codeDirtyPathSetRef.current).filter(
          ([path]) => nextFiles[path] && isTextFileType(nextFiles[path].type),
        ),
      ) as Record<string, true>;
      const nextDirtyFiles = dirtyFilesRef.current.filter(
        (path) => Boolean(nextFiles[path]),
      );

      codeDraftByPathRef.current = nextCodeDrafts;
      codeDirtyPathSetRef.current = nextCodeDirtyPathSet;
      dirtyFilesRef.current = nextDirtyFiles;

      setCodeDraftByPath(nextCodeDrafts);
      setCodeDirtyPathSet(nextCodeDirtyPathSet);
      setDirtyFiles(nextDirtyFiles);

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
    codeDraftByPathRef,
    codeDirtyPathSetRef,
    dirtyFilesRef,
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
      const slidePrefix = getMainParentSeed(parentPath);
      const defaultName = slidePrefix ? `${slidePrefix}.html` : "new-file.html";
      const nextName = requestCreateFileName
        ? await requestCreateFileName(parentPath, defaultName)
        : window.prompt("New file name", defaultName);
      if (!nextName) return;
      const normalizedInput = normalizeProjectRelative(nextName);
      const cleanedName =
        normalizedInput && /\.[a-z0-9]+$/i.test(normalizedInput)
          ? normalizedInput
          : normalizedInput
            ? `${normalizedInput}.html`
            : "";
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
      getMainParentSeed,
      projectPath,
      refreshProjectFiles,
      requestCreateFileName,
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
      const slidePrefix = getMainParentSeed(parentPath);
      const defaultFolderName = slidePrefix || "new-folder";
      const nextName = requestCreateFolderName
        ? await requestCreateFolderName(parentPath, defaultFolderName)
        : window.prompt("New folder name", defaultFolderName);
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
      await syncNewSlideIntoProjectFlow(nextVirtual);
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [
      getMainParentSeed,
      projectPath,
      refreshProjectFiles,
      requestCreateFolderName,
      selectedFolderCloneSource,
      setIsConfigModalOpen,
      setIsLeftPanelOpen,
      syncNewSlideIntoProjectFlow,
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
