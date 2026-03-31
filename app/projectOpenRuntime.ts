import * as Neutralino from "@neutralinojs/lib";
import { FileMap } from "../types";
import {
  buildEditorFontOptions,
  collectSharedFontFamiliesFromFileMap,
  dedupeFontFamilies,
  findFilePathCaseInsensitive,
  FONT_CACHE_VERSION,
  FONT_CACHE_VIRTUAL_PATH,
  FontCachePayload,
  inferFileType,
  joinPath,
  normalizePath,
  parseFontCacheFamilies,
  parsePresentationCssFontFamilies,
  PRESENTATION_CSS_VIRTUAL_PATH,
  PREVIEW_MOUNT_PATH,
  SHARED_MOUNT_PATH,
  SHARED_MOUNT_PATH_IN_PREVIEW,
} from "./appHelpers";

type InitializeProjectOpenRuntimeArgs = {
  fsFiles: FileMap;
  absolutePathIndex: Record<string, string>;
  sharedDirectoryPath: string | null;
  nearestSharedParent: string | null;
  rootPath: string;
  previousPreviewRootAliasPath: string | null;
};

type InitializeProjectOpenRuntimeResult = {
  fsFiles: FileMap;
  absolutePathIndex: Record<string, string>;
  availableFonts: string[];
  presentationCssVirtualPath: string | null;
  fontCacheVirtualPath: string | null;
  mountBasePath: string;
  mountReady: boolean;
  previewRootAliasPath: string | null;
};

export const initializeProjectOpenRuntime = async ({
  fsFiles,
  absolutePathIndex,
  sharedDirectoryPath,
  nearestSharedParent,
  rootPath,
  previousPreviewRootAliasPath,
}: InitializeProjectOpenRuntimeArgs): Promise<InitializeProjectOpenRuntimeResult> => {
  const presentationCssVirtualPath = findFilePathCaseInsensitive(
    fsFiles,
    PRESENTATION_CSS_VIRTUAL_PATH,
  );

  let fontCacheVirtualPath: string | null = null;
  let fontCacheAbsolutePath: string | null = null;
  if (sharedDirectoryPath) {
    const existingCachePath = findFilePathCaseInsensitive(
      fsFiles,
      FONT_CACHE_VIRTUAL_PATH,
    );
    if (existingCachePath) {
      fontCacheVirtualPath = existingCachePath;
      fontCacheAbsolutePath = absolutePathIndex[existingCachePath] || null;
    } else {
      fontCacheVirtualPath = FONT_CACHE_VIRTUAL_PATH;
      fontCacheAbsolutePath = normalizePath(
        joinPath(sharedDirectoryPath, "js/nocodex-fonts.json"),
      );
      absolutePathIndex[fontCacheVirtualPath] = fontCacheAbsolutePath;
    }
  }

  let projectFontFamilies: string[] = [];
  let loadedFromCache = false;
  if (fontCacheVirtualPath && fontCacheAbsolutePath) {
    try {
      const cacheRaw = await (Neutralino as any).filesystem.readFile(
        fontCacheAbsolutePath,
      );
      if (typeof cacheRaw === "string" && cacheRaw.trim().length > 0) {
        const cachedFamilies = parseFontCacheFamilies(cacheRaw);
        if (cachedFamilies.length > 0) {
          projectFontFamilies = cachedFamilies;
          loadedFromCache = true;
        }
      }
    } catch {
      // Cache file may not exist yet for first-time projects.
    }
  }

  if (!loadedFromCache && presentationCssVirtualPath) {
    const presentationAbsolutePath = absolutePathIndex[presentationCssVirtualPath];
    if (presentationAbsolutePath) {
      try {
        const presentationCss = await (Neutralino as any).filesystem.readFile(
          presentationAbsolutePath,
        );
        if (typeof presentationCss === "string" && presentationCss.length > 0) {
          projectFontFamilies =
            parsePresentationCssFontFamilies(presentationCss);
        }
      } catch {
        // Ignore missing presentation.css reads and fall back to fonts folder.
      }
    }
  }

  if (projectFontFamilies.length === 0) {
    projectFontFamilies = collectSharedFontFamiliesFromFileMap(fsFiles);
  }
  const availableFonts = buildEditorFontOptions(projectFontFamilies);

  if (
    !loadedFromCache &&
    projectFontFamilies.length > 0 &&
    fontCacheVirtualPath &&
    fontCacheAbsolutePath
  ) {
    const cachePayload: FontCachePayload = {
      version: FONT_CACHE_VERSION,
      source: "presentation.css",
      generatedAt: new Date().toISOString(),
      fonts: dedupeFontFamilies(projectFontFamilies),
    };
    const serializedCache = JSON.stringify(cachePayload, null, 2);
    try {
      await (Neutralino as any).filesystem.writeFile(
        fontCacheAbsolutePath,
        serializedCache,
      );
      if (!fsFiles[fontCacheVirtualPath]) {
        fsFiles[fontCacheVirtualPath] = {
          path: fontCacheVirtualPath,
          name: "nocodex-fonts.json",
          type: inferFileType("nocodex-fonts.json"),
          content: serializedCache,
        };
        absolutePathIndex[fontCacheVirtualPath] = fontCacheAbsolutePath;
      } else {
        fsFiles[fontCacheVirtualPath] = {
          ...fsFiles[fontCacheVirtualPath],
          content: serializedCache,
        };
      }
    } catch (error) {
      console.warn("Failed writing initial font cache:", error);
    }
  }

  const mountBasePath = nearestSharedParent || rootPath;
  const mountBaseName =
    normalizePath(mountBasePath).split("/").filter(Boolean).pop() || "";
  const previewRootAliasPath =
    mountBaseName && !mountBaseName.startsWith(".") ? `/${mountBaseName}` : null;
  let mountReady = false;

  try {
    const mounts = await (Neutralino as any).server.getMounts();
    if (
      previousPreviewRootAliasPath &&
      mounts?.[previousPreviewRootAliasPath]
    ) {
      await (Neutralino as any).server.unmount(previousPreviewRootAliasPath);
    }
    if (mounts?.[PREVIEW_MOUNT_PATH]) {
      await (Neutralino as any).server.unmount(PREVIEW_MOUNT_PATH);
    }
    await (Neutralino as any).server.mount(PREVIEW_MOUNT_PATH, mountBasePath);

    let nextPreviewRootAliasPath: string | null = null;
    if (
      previewRootAliasPath &&
      previewRootAliasPath !== PREVIEW_MOUNT_PATH &&
      previewRootAliasPath !== SHARED_MOUNT_PATH &&
      previewRootAliasPath !== SHARED_MOUNT_PATH_IN_PREVIEW
    ) {
      if (mounts?.[previewRootAliasPath]) {
        await (Neutralino as any).server.unmount(previewRootAliasPath);
      }
      await (Neutralino as any).server.mount(
        previewRootAliasPath,
        mountBasePath,
      );
      nextPreviewRootAliasPath = previewRootAliasPath;
    }

    if (sharedDirectoryPath) {
      if (mounts?.[SHARED_MOUNT_PATH]) {
        await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH);
      }
      await (Neutralino as any).server.mount(
        SHARED_MOUNT_PATH,
        sharedDirectoryPath,
      );
      if (mounts?.[SHARED_MOUNT_PATH_IN_PREVIEW]) {
        await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH_IN_PREVIEW);
      }
      await (Neutralino as any).server.mount(
        SHARED_MOUNT_PATH_IN_PREVIEW,
        sharedDirectoryPath,
      );
    } else if (mounts?.[SHARED_MOUNT_PATH]) {
      await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH);
      if (mounts?.[SHARED_MOUNT_PATH_IN_PREVIEW]) {
        await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH_IN_PREVIEW);
      }
    }

    mountReady = true;

    return {
      fsFiles,
      absolutePathIndex,
      availableFonts,
      presentationCssVirtualPath,
      fontCacheVirtualPath,
      mountBasePath,
      mountReady,
      previewRootAliasPath: nextPreviewRootAliasPath,
    };
  } catch (error) {
    console.warn(
      "Virtual host mount failed. Falling back to srcDoc preview.",
      error,
    );
  }

  return {
    fsFiles,
    absolutePathIndex,
    availableFonts,
    presentationCssVirtualPath,
    fontCacheVirtualPath,
    mountBasePath,
    mountReady,
    previewRootAliasPath: null,
  };
};
