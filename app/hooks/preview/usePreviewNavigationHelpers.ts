import { useCallback } from "react";
import type React from "react";
import type { FileMap } from "../../../types";
import {
  normalizePath,
  normalizeProjectRelative,
  toPreviewLayerId,
} from "../../helpers/appHelpers";

type UsePreviewNavigationHelpersOptions = {
  activeFileRef: React.MutableRefObject<string | null>;
  filesRef: React.MutableRefObject<FileMap>;
  lastPreviewPageSignalRef: React.MutableRefObject<{
    path: string;
    at: number;
  } | null>;
  setActiveFile: React.Dispatch<React.SetStateAction<string | null>>;
};

type UsePreviewNavigationHelpersResult = {
  getStablePreviewElementId: (
    path: number[] | null | undefined,
    explicitId?: string | null,
    fallbackId?: string | null,
  ) => string;
  resolveAdjacentSlidePath: (
    fromPath: string,
    dir: "next" | "prev",
  ) => string | null;
  setActiveFileStable: (nextPath: string | null) => void;
  shouldProcessPreviewPageSignal: (path: string) => boolean;
};

export const usePreviewNavigationHelpers = ({
  activeFileRef,
  filesRef,
  lastPreviewPageSignalRef,
  setActiveFile,
}: UsePreviewNavigationHelpersOptions): UsePreviewNavigationHelpersResult => {
  const setActiveFileStable = useCallback(
    (nextPath: string | null) => {
      activeFileRef.current = nextPath;
      setActiveFile((prev) => (prev === nextPath ? prev : nextPath));
    },
    [activeFileRef, setActiveFile],
  );

  const shouldProcessPreviewPageSignal = useCallback(
    (path: string) => {
      if (!path) return false;
      const lower = path.toLowerCase();
      if (
        lower.includes("shared/index.html") ||
        lower.includes("__bridge.html") ||
        lower.includes("vibe-bridge.html")
      ) {
        return false;
      }

      const now = Date.now();
      const last = lastPreviewPageSignalRef.current;
      if (last && last.path === path && now - last.at < 700) {
        return false;
      }
      lastPreviewPageSignalRef.current = { path, at: now };
      return true;
    },
    [lastPreviewPageSignalRef],
  );

  const resolveAdjacentSlidePath = useCallback(
    (fromPath: string, dir: "next" | "prev"): string | null => {
      const normalizedFrom = normalizeProjectRelative(String(fromPath || ""));
      const fromMatch = normalizePath(normalizedFrom).match(
        /^(.*_)([0-9]{3,})\/index\.html$/i,
      );
      if (!fromMatch) return null;
      const familyPrefix = fromMatch[1].toLowerCase();
      const currentNorm = normalizedFrom.toLowerCase();
      const slides = Object.keys(filesRef.current)
        .filter((path) => filesRef.current[path]?.type === "html")
        .map((path) => {
          const match = normalizePath(path).match(
            /^(.*_)([0-9]{3,})\/index\.html$/i,
          );
          if (!match || match[1].toLowerCase() !== familyPrefix) {
            return null;
          }
          return {
            path,
            normalized: normalizeProjectRelative(path).toLowerCase(),
            num: Number.parseInt(match[2], 10),
          };
        })
        .filter(
          (entry): entry is { path: string; normalized: string; num: number } =>
            Boolean(entry),
        )
        .sort((a, b) =>
          a.num !== b.num ? a.num - b.num : a.path.localeCompare(b.path),
        );
      if (slides.length === 0) return null;
      const index = slides.findIndex((item) => item.normalized === currentNorm);
      if (index < 0) return null;
      const nextIndex = dir === "next" ? index + 1 : index - 1;
      if (nextIndex < 0 || nextIndex >= slides.length) return null;
      return slides[nextIndex].path;
    },
    [filesRef],
  );

  const getStablePreviewElementId = useCallback(
    (
      path: number[] | null | undefined,
      explicitId?: string | null,
      fallbackId?: string | null,
    ) => {
      const normalizedExplicitId = String(explicitId || "").trim();
      if (normalizedExplicitId) return normalizedExplicitId;
      const normalizedFallbackId = String(fallbackId || "").trim();
      if (normalizedFallbackId) return normalizedFallbackId;
      if (Array.isArray(path) && path.length > 0) {
        return `preview-${toPreviewLayerId(path)}`;
      }
      return "preview-detached";
    },
    [],
  );

  return {
    getStablePreviewElementId,
    resolveAdjacentSlidePath,
    setActiveFileStable,
    shouldProcessPreviewPageSignal,
  };
};
