import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { FileMap } from "../types";
import type { PreviewHistoryEntry } from "./appHelpers";
import {
  createPreviewDocument,
  resolveProjectRelativePath,
} from "./appHelpers";

type UsePreviewDocumentLoaderOptions = {
  cachePreviewDoc: (path: string, doc: string) => void;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  filesRef: MutableRefObject<FileMap>;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  previewDependencyIndexRef: MutableRefObject<Record<string, string[]>>;
  previewHistoryRef: MutableRefObject<Record<string, PreviewHistoryEntry>>;
  previewDocCacheRef: MutableRefObject<Record<string, string>>;
  selectedPreviewHtml: string | null;
  setSelectedPreviewDoc: Dispatch<SetStateAction<string>>;
  shouldPrepareEditPreviewDoc: boolean;
};

export const usePreviewDocumentLoader = ({
  cachePreviewDoc,
  filePathIndexRef,
  filesRef,
  loadFileContent,
  previewDependencyIndexRef,
  previewHistoryRef,
  previewDocCacheRef,
  selectedPreviewHtml,
  setSelectedPreviewDoc,
  shouldPrepareEditPreviewDoc,
}: UsePreviewDocumentLoaderOptions) => {
  useEffect(() => {
    if (!shouldPrepareEditPreviewDoc) {
      setSelectedPreviewDoc("");
      return;
    }
    if (!selectedPreviewHtml) {
      setSelectedPreviewDoc("");
      return;
    }
    const cachedDoc = previewDocCacheRef.current[selectedPreviewHtml];
    if (cachedDoc) {
      setSelectedPreviewDoc(cachedDoc);
      return;
    }

    let canceled = false;
    const preloadPreviewDependencies = async () => {
      const htmlContent = await loadFileContent(selectedPreviewHtml);
      const fileMapSnapshot: FileMap = { ...filesRef.current };
      let html =
        typeof htmlContent === "string" && htmlContent.length > 0
          ? htmlContent
          : typeof fileMapSnapshot[selectedPreviewHtml]?.content === "string"
            ? (fileMapSnapshot[selectedPreviewHtml]?.content as string)
            : "";
      if (!html) {
        const absoluteHtmlPath = filePathIndexRef.current[selectedPreviewHtml];
        if (absoluteHtmlPath) {
          try {
            const directHtml = await (Neutralino as any).filesystem.readFile(
              absoluteHtmlPath,
            );
            if (typeof directHtml === "string" && directHtml.length > 0) {
              html = directHtml;
            }
          } catch {
            // Keep empty html; caller handles as unavailable preview.
          }
        }
      }
      if (!html) return;

      if (!previewHistoryRef.current[selectedPreviewHtml]) {
        previewHistoryRef.current[selectedPreviewHtml] = {
          past: [],
          present: html,
          future: [],
        };
      }

      if (fileMapSnapshot[selectedPreviewHtml]) {
        fileMapSnapshot[selectedPreviewHtml] = {
          ...fileMapSnapshot[selectedPreviewHtml],
          content: html,
        };
      }

      const dependencyPaths = new Set<string>();

      html.replace(
        /<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
        (full, _beforeHref, hrefValue) => {
          if (!/rel=["']stylesheet["']/i.test(full)) return full;
          const resolved = resolveProjectRelativePath(
            selectedPreviewHtml,
            hrefValue,
          );
          if (resolved && fileMapSnapshot[resolved]) dependencyPaths.add(resolved);
          return full;
        },
      );

      html.replace(
        /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
        (_full, _beforeSrc, srcValue) => {
          const resolved = resolveProjectRelativePath(
            selectedPreviewHtml,
            srcValue,
          );
          if (resolved && fileMapSnapshot[resolved]) dependencyPaths.add(resolved);
          return _full;
        },
      );

      html.replace(/\b(src|href)=["']([^"']+)["']/gi, (_full, _attr, raw) => {
        const resolved = resolveProjectRelativePath(selectedPreviewHtml, raw);
        if (resolved && fileMapSnapshot[resolved]) dependencyPaths.add(resolved);
        return _full;
      });

      for (const path of Object.keys(fileMapSnapshot)) {
        const lowerPath = path.toLowerCase();
        if (
          (lowerPath.includes("shared/media/content/") ||
            lowerPath.includes("/shared/media/content/")) &&
          (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm"))
        ) {
          dependencyPaths.add(path);
        }
      }

      const loaded = await Promise.all(
        Array.from(dependencyPaths).map(async (path) => {
          const content = await loadFileContent(path, {
            persistToState: false,
          });
          return { path, content };
        }),
      );

      for (const item of loaded) {
        if (
          item &&
          fileMapSnapshot[item.path] &&
          typeof item.content === "string" &&
          item.content.length > 0
        ) {
          fileMapSnapshot[item.path] = {
            ...fileMapSnapshot[item.path],
            content: item.content,
          };
        }
      }

      if (canceled) return;
      previewDependencyIndexRef.current[selectedPreviewHtml] = [
        selectedPreviewHtml,
        ...Array.from(dependencyPaths),
      ];
      const doc = createPreviewDocument(
        fileMapSnapshot,
        selectedPreviewHtml,
        previewDependencyIndexRef.current[selectedPreviewHtml],
      );
      cachePreviewDoc(selectedPreviewHtml, doc);
      setSelectedPreviewDoc(doc);
    };

    void preloadPreviewDependencies();
    return () => {
      canceled = true;
    };
  }, [
    cachePreviewDoc,
    filePathIndexRef,
    filesRef,
    loadFileContent,
    previewDependencyIndexRef,
    previewDocCacheRef,
    previewHistoryRef,
    selectedPreviewHtml,
    setSelectedPreviewDoc,
    shouldPrepareEditPreviewDoc,
  ]);
};
