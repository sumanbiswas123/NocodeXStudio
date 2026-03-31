import { useCallback } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type React from "react";
import type { FileMap } from "../../../types";
import {
  FONT_CACHE_VERSION,
  type FontCachePayload,
  PRESENTATION_CSS_VIRTUAL_PATH,
  SHARED_FONT_VIRTUAL_DIR,
  buildEditorFontOptions,
  dedupeFontFamilies,
  deriveFontFamilyFromFontFileName,
  findFilePathCaseInsensitive,
  fontFormatFromFileName,
  inferFileType,
  normalizeProjectRelative,
  parsePresentationCssFontFamilies,
  relativePathBetweenVirtualFiles,
} from "../../helpers/appHelpers";

type UsePresentationFontRegistryOptions = {
  filePathIndexRef: React.MutableRefObject<Record<string, string>>;
  filesRef: React.MutableRefObject<FileMap>;
  fontCachePathRef: React.MutableRefObject<string | null>;
  presentationCssPathRef: React.MutableRefObject<string | null>;
  setAvailableFonts: React.Dispatch<React.SetStateAction<string[]>>;
  setFiles: React.Dispatch<React.SetStateAction<FileMap>>;
};

type UsePresentationFontRegistryResult = {
  handleAddFontToPresentationCss: (rawFontPath: string) => Promise<void>;
  handleSidebarAddFontToPresentationCss: (path: string) => void;
  persistProjectFontCache: (fontFamilies: string[]) => Promise<void>;
};

export const usePresentationFontRegistry = ({
  filePathIndexRef,
  filesRef,
  fontCachePathRef,
  presentationCssPathRef,
  setAvailableFonts,
  setFiles,
}: UsePresentationFontRegistryOptions): UsePresentationFontRegistryResult => {
  const persistProjectFontCache = useCallback(
    async (fontFamilies: string[]) => {
      const cacheVirtualPath = fontCachePathRef.current;
      if (!cacheVirtualPath) return;
      const cacheAbsolutePath = filePathIndexRef.current[cacheVirtualPath];
      if (!cacheAbsolutePath) return;
      const payload: FontCachePayload = {
        version: FONT_CACHE_VERSION,
        source: "presentation.css",
        generatedAt: new Date().toISOString(),
        fonts: dedupeFontFamilies(fontFamilies),
      };
      const serialized = JSON.stringify(payload, null, 2);
      try {
        await (Neutralino as any).filesystem.writeFile(
          cacheAbsolutePath,
          serialized,
        );
      } catch (error) {
        console.warn("Failed to write font cache file:", error);
        return;
      }
      setFiles((prev) => {
        const existing = prev[cacheVirtualPath];
        const name = cacheVirtualPath.includes("/")
          ? cacheVirtualPath.slice(cacheVirtualPath.lastIndexOf("/") + 1)
          : cacheVirtualPath;
        if (existing) {
          return {
            ...prev,
            [cacheVirtualPath]: {
              ...existing,
              content: serialized,
            },
          };
        }
        return {
          ...prev,
          [cacheVirtualPath]: {
            path: cacheVirtualPath,
            name,
            type: inferFileType(name),
            content: serialized,
          },
        };
      });
    },
    [filePathIndexRef, fontCachePathRef, setFiles],
  );

  const handleAddFontToPresentationCss = useCallback(
    async (rawFontPath: string) => {
      const fontPath = normalizeProjectRelative(rawFontPath);
      const file = filesRef.current[fontPath];
      if (!file || file.type !== "font") return;
      if (!fontPath.toLowerCase().startsWith(`${SHARED_FONT_VIRTUAL_DIR}/`)) {
        window.alert(
          `Font must be inside "${SHARED_FONT_VIRTUAL_DIR}" to register.`,
        );
        return;
      }

      const presentationPath =
        presentationCssPathRef.current ??
        findFilePathCaseInsensitive(
          filesRef.current,
          PRESENTATION_CSS_VIRTUAL_PATH,
        );
      if (!presentationPath) {
        window.alert(
          `presentation.css not found at "${PRESENTATION_CSS_VIRTUAL_PATH}".`,
        );
        return;
      }
      presentationCssPathRef.current = presentationPath;
      const presentationAbsolutePath =
        filePathIndexRef.current[presentationPath];
      if (!presentationAbsolutePath) {
        window.alert("Unable to resolve presentation.css absolute path.");
        return;
      }

      let currentCss = "";
      try {
        const rawCss = await (Neutralino as any).filesystem.readFile(
          presentationAbsolutePath,
        );
        currentCss = typeof rawCss === "string" ? rawCss : String(rawCss || "");
      } catch (error) {
        console.warn("Failed reading presentation.css:", error);
        window.alert("Unable to read presentation.css.");
        return;
      }

      const family = deriveFontFamilyFromFontFileName(file.name);
      const existingFamilies = parsePresentationCssFontFamilies(currentCss);
      const alreadyRegistered = existingFamilies.some(
        (name) => name.toLowerCase() === family.toLowerCase(),
      );
      if (alreadyRegistered) {
        setAvailableFonts(buildEditorFontOptions(existingFamilies));
        await persistProjectFontCache(existingFamilies);
        return;
      }

      const relativeFontPath = relativePathBetweenVirtualFiles(
        presentationPath,
        fontPath,
      );
      const fontFormat = fontFormatFromFileName(file.name);
      const fontFaceBlock =
        `@font-face {\n` +
        `  font-family: '${family}';\n` +
        `  src: url('${relativeFontPath}') format('${fontFormat}');\n` +
        `  font-weight: normal;\n` +
        `  font-style: normal;\n` +
        `  font-display: swap;\n` +
        `}`;
      const nextCss = `${currentCss.trimEnd()}\n\n${fontFaceBlock}\n`;

      try {
        await (Neutralino as any).filesystem.writeFile(
          presentationAbsolutePath,
          nextCss,
        );
      } catch (error) {
        console.warn("Failed writing presentation.css:", error);
        window.alert("Unable to update presentation.css.");
        return;
      }

      setFiles((prev) => {
        const existing = prev[presentationPath];
        if (!existing) return prev;
        return {
          ...prev,
          [presentationPath]: {
            ...existing,
            content: nextCss,
          },
        };
      });
      const nextProjectFamilies = parsePresentationCssFontFamilies(nextCss);
      setAvailableFonts(buildEditorFontOptions(nextProjectFamilies));
      await persistProjectFontCache(nextProjectFamilies);
    },
    [
      filePathIndexRef,
      filesRef,
      persistProjectFontCache,
      presentationCssPathRef,
      setAvailableFonts,
      setFiles,
    ],
  );

  const handleSidebarAddFontToPresentationCss = useCallback(
    (path: string) => {
      void handleAddFontToPresentationCss(path);
    },
    [handleAddFontToPresentationCss],
  );

  return {
    handleAddFontToPresentationCss,
    handleSidebarAddFontToPresentationCss,
    persistProjectFontCache,
  };
};
