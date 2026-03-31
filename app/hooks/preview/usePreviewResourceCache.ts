import { useCallback, useEffect } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type React from "react";
import type { FileMap } from "../../../types";
import {
  mimeFromType,
  normalizeProjectRelative,
  toByteArray,
} from "../../helpers/appHelpers";

type UsePreviewResourceCacheOptions = {
  binaryAssetUrlCacheRef: React.MutableRefObject<Record<string, string>>;
  filePathIndexRef: React.MutableRefObject<Record<string, string>>;
  files: FileMap;
  filesRef: React.MutableRefObject<FileMap>;
  loadingFilePromisesRef: React.MutableRefObject<
    Partial<Record<string, Promise<string | undefined>>>
  >;
  loadingFilesRef: React.MutableRefObject<Set<string>>;
  maxPreviewDocCacheChars: number;
  maxPreviewDocCacheEntries: number;
  previewDependencyIndexRef: React.MutableRefObject<Record<string, string[]>>;
  previewDocCacheOrderRef: React.MutableRefObject<string[]>;
  previewDocCacheRef: React.MutableRefObject<Record<string, string>>;
  setFiles: React.Dispatch<React.SetStateAction<FileMap>>;
  textFileCacheRef: React.MutableRefObject<Record<string, string>>;
};

type LoadFileContentOptions = {
  persistToState?: boolean;
};

type UsePreviewResourceCacheResult = {
  cachePreviewDoc: (path: string, doc: string) => void;
  invalidatePreviewDocCache: (path: string) => void;
  invalidatePreviewDocsForDependency: (dependencyPath: string) => void;
  loadFileContent: (
    relativePath: string,
    options?: LoadFileContentOptions,
  ) => Promise<string | Blob | null | undefined>;
  persistLoadedContentToState: (path: string, content: string) => void;
  revokeBinaryAssetUrls: () => void;
};

export const usePreviewResourceCache = ({
  binaryAssetUrlCacheRef,
  filePathIndexRef,
  files,
  filesRef,
  loadingFilePromisesRef,
  loadingFilesRef,
  maxPreviewDocCacheChars,
  maxPreviewDocCacheEntries,
  previewDependencyIndexRef,
  previewDocCacheOrderRef,
  previewDocCacheRef,
  setFiles,
  textFileCacheRef,
}: UsePreviewResourceCacheOptions): UsePreviewResourceCacheResult => {
  const revokeBinaryAssetUrls = useCallback(() => {
    const cache = binaryAssetUrlCacheRef.current;
    for (const url of Object.values(cache)) {
      if (typeof url === "string" && url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revoke failures for stale object URLs.
        }
      }
    }
    binaryAssetUrlCacheRef.current = {};
  }, [binaryAssetUrlCacheRef]);

  const invalidatePreviewDocCache = useCallback(
    (path: string) => {
      if (!path) return;
      delete previewDocCacheRef.current[path];
      previewDocCacheOrderRef.current = previewDocCacheOrderRef.current.filter(
        (item) => item !== path,
      );
    },
    [previewDocCacheOrderRef, previewDocCacheRef],
  );

  const invalidatePreviewDocsForDependency = useCallback(
    (dependencyPath: string) => {
      const normalizedDependency = normalizeProjectRelative(
        dependencyPath || "",
      ).toLowerCase();
      if (!normalizedDependency) return;
      Object.entries(previewDependencyIndexRef.current).forEach(
        ([previewPath, dependencies]) => {
          if (
            dependencies.some(
              (dependency) =>
                normalizeProjectRelative(dependency || "").toLowerCase() ===
                normalizedDependency,
            )
          ) {
            invalidatePreviewDocCache(previewPath);
          }
        },
      );
    },
    [invalidatePreviewDocCache, previewDependencyIndexRef],
  );

  const cachePreviewDoc = useCallback(
    (path: string, doc: string) => {
      if (!path) return;
      previewDocCacheRef.current[path] = doc;
      const nextOrder = previewDocCacheOrderRef.current.filter(
        (item) => item !== path,
      );
      nextOrder.push(path);

      let totalChars = nextOrder.reduce(
        (sum, key) => sum + (previewDocCacheRef.current[key]?.length || 0),
        0,
      );
      while (
        nextOrder.length > maxPreviewDocCacheEntries ||
        totalChars > maxPreviewDocCacheChars
      ) {
        const evicted = nextOrder.shift();
        if (!evicted) break;
        totalChars -= previewDocCacheRef.current[evicted]?.length || 0;
        delete previewDocCacheRef.current[evicted];
      }

      previewDocCacheOrderRef.current = nextOrder;
    },
    [
      maxPreviewDocCacheChars,
      maxPreviewDocCacheEntries,
      previewDocCacheOrderRef,
      previewDocCacheRef,
    ],
  );

  useEffect(() => {
    const next: FileMap = { ...files };
    for (const [path, content] of Object.entries(
      textFileCacheRef.current,
    ) as Array<[string, string]>) {
      const existing = next[path];
      if (
        existing &&
        (typeof existing.content !== "string" || existing.content.length === 0)
      ) {
        next[path] = { ...existing, content };
      }
    }
    for (const [path, content] of Object.entries(
      binaryAssetUrlCacheRef.current,
    ) as Array<[string, string]>) {
      const existing = next[path];
      if (
        existing &&
        (typeof existing.content !== "string" || existing.content.length === 0)
      ) {
        next[path] = { ...existing, content };
      }
    }
    filesRef.current = next;
  }, [binaryAssetUrlCacheRef, files, filesRef, textFileCacheRef]);

  const persistLoadedContentToState = useCallback(
    (path: string, content: string) => {
      setFiles((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        if (
          typeof existing.content === "string" &&
          existing.content.length > 0 &&
          existing.content === content
        ) {
          return prev;
        }
        return {
          ...prev,
          [path]: {
            ...existing,
            content,
          },
        };
      });
    },
    [setFiles],
  );

  const loadFileContent = useCallback(
    async (relativePath: string, options?: LoadFileContentOptions) => {
      const persistToState = options?.persistToState ?? true;
      const target = filesRef.current[relativePath];
      if (!target) return;

      if (typeof target.content === "string" && target.content.length > 0) {
        if (target.type === "image" || target.type === "font") {
          binaryAssetUrlCacheRef.current[relativePath] = target.content;
          return target.content;
        }
        textFileCacheRef.current[relativePath] = target.content;
        if (persistToState) {
          persistLoadedContentToState(relativePath, target.content);
        }
        return target.content;
      }

      const cachedText = textFileCacheRef.current[relativePath];
      if (typeof cachedText === "string" && cachedText.length > 0) {
        if (persistToState) {
          persistLoadedContentToState(relativePath, cachedText);
        }
        return cachedText;
      }

      const cachedBinary = binaryAssetUrlCacheRef.current[relativePath];
      if (
        (target.type === "image" || target.type === "font") &&
        typeof cachedBinary === "string" &&
        cachedBinary.length > 0
      ) {
        return cachedBinary;
      }

      const existingPending = loadingFilePromisesRef.current[relativePath];
      if (existingPending) {
        if (
          !persistToState ||
          target.type === "image" ||
          target.type === "font"
        ) {
          return existingPending;
        }
        return existingPending.then((content) => {
          if (typeof content === "string" && content.length > 0) {
            persistLoadedContentToState(relativePath, content);
          }
          return content;
        });
      }

      const absolutePath = filePathIndexRef.current[relativePath];
      if (!absolutePath) return;

      const pending = (async (): Promise<string | undefined> => {
        loadingFilesRef.current.add(relativePath);
        try {
          let content = "";
          if (target.type === "image" || target.type === "font") {
            const binaryData = await (
              Neutralino as any
            ).filesystem.readBinaryFile(absolutePath);
            const bytes = toByteArray(binaryData);
            if (bytes.length === 0) return;
            const mime = mimeFromType(target.type, target.name);
            const sourceBuffer = bytes.buffer;
            const binaryBuffer: ArrayBuffer =
              sourceBuffer instanceof ArrayBuffer
                ? sourceBuffer.slice(
                    bytes.byteOffset,
                    bytes.byteOffset + bytes.byteLength,
                  )
                : (() => {
                    const copy = new Uint8Array(bytes.byteLength);
                    copy.set(bytes);
                    return copy.buffer;
                  })();
            const blob = new Blob([binaryBuffer], { type: mime });
            const previousUrl = binaryAssetUrlCacheRef.current[relativePath];
            if (previousUrl && previousUrl.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(previousUrl);
              } catch {
                // Ignore stale blob revocation errors.
              }
            }
            content = URL.createObjectURL(blob);
            binaryAssetUrlCacheRef.current[relativePath] = content;
          } else {
            const loaded = await (Neutralino as any).filesystem.readFile(
              absolutePath,
            );
            content =
              typeof loaded === "string" ? loaded : String(loaded || "");
            if (content.length > 0) {
              textFileCacheRef.current[relativePath] = content;
            }
          }

          const existingRefEntry = filesRef.current[relativePath];
          if (existingRefEntry) {
            filesRef.current = {
              ...filesRef.current,
              [relativePath]: {
                ...existingRefEntry,
                content,
              },
            };
          }

          if (persistToState && content.length > 0) {
            persistLoadedContentToState(relativePath, content);
          }

          return content;
        } catch (error) {
          console.warn(
            `Failed loading file content for ${relativePath}:`,
            error,
          );
        } finally {
          loadingFilesRef.current.delete(relativePath);
          delete loadingFilePromisesRef.current[relativePath];
        }
      })();

      loadingFilePromisesRef.current[relativePath] = pending;
      return pending;
    },
    [
      binaryAssetUrlCacheRef,
      filePathIndexRef,
      filesRef,
      loadingFilePromisesRef,
      loadingFilesRef,
      persistLoadedContentToState,
      textFileCacheRef,
    ],
  );

  return {
    cachePreviewDoc,
    invalidatePreviewDocCache,
    invalidatePreviewDocsForDependency,
    loadFileContent,
    persistLoadedContentToState,
    revokeBinaryAssetUrls,
  };
};
