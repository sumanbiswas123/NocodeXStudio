import { useEffect, useMemo } from "react";
import type React from "react";
import type { VirtualElement } from "../../../types";
import { readElementByPath } from "../../helpers/appHelpers";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";

type UsePreviewRuntimeStateOptions = {
  activeFile: string | null;
  dirtyPathKeysByFile: Record<string, string[]>;
  interactionMode: InteractionMode;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  previewFrameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  previewSelectedHtmlRef: React.MutableRefObject<string | null>;
  previewSelectedPathSetter: React.Dispatch<
    React.SetStateAction<number[] | null>
  >;
  previewSelectedElementSetter: React.Dispatch<
    React.SetStateAction<VirtualElement | null>
  >;
  previewSelectedComputedStylesSetter: React.Dispatch<
    React.SetStateAction<React.CSSProperties | null>
  >;
  selectedPreviewDoc: string;
  selectedPreviewHtml: string | null;
  selectedPreviewSrc: string | null;
  setPreviewNavigationFile: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  projectPath: string | null;
};

type UsePreviewRuntimeStateResult = {
  hasPreviewContent: boolean;
  isMountedPreview: boolean;
  shouldPrepareEditPreviewDoc: boolean;
  shouldShowFrameWelcome: boolean;
};

export const usePreviewRuntimeState = ({
  activeFile,
  dirtyPathKeysByFile,
  interactionMode,
  loadFileContent,
  previewFrameRef,
  previewSelectedHtmlRef,
  previewSelectedPathSetter,
  previewSelectedElementSetter,
  previewSelectedComputedStylesSetter,
  selectedPreviewDoc,
  selectedPreviewHtml,
  selectedPreviewSrc,
  setPreviewNavigationFile,
  projectPath,
}: UsePreviewRuntimeStateOptions): UsePreviewRuntimeStateResult => {
  const isMountedPreview = useMemo(
    () => Boolean(selectedPreviewSrc && interactionMode === "preview"),
    [interactionMode, selectedPreviewSrc],
  );

  const shouldPrepareEditPreviewDoc = useMemo(
    () => Boolean(selectedPreviewHtml && !isMountedPreview),
    [isMountedPreview, selectedPreviewHtml],
  );

  const hasPreviewContent = useMemo(
    () => Boolean(projectPath && (selectedPreviewSrc || selectedPreviewDoc)),
    [projectPath, selectedPreviewDoc, selectedPreviewSrc],
  );

  const shouldShowFrameWelcome = useMemo(() => !projectPath, [projectPath]);

  useEffect(() => {
    if (!isMountedPreview) {
      setPreviewNavigationFile((prev) =>
        prev === selectedPreviewHtml ? prev : selectedPreviewHtml,
      );
    }
  }, [isMountedPreview, selectedPreviewHtml, setPreviewNavigationFile]);

  useEffect(() => {
    previewSelectedHtmlRef.current = selectedPreviewHtml;
    previewSelectedPathSetter(null);
    previewSelectedElementSetter(null);
    previewSelectedComputedStylesSetter(null);
  }, [
    previewSelectedComputedStylesSetter,
    previewSelectedElementSetter,
    previewSelectedHtmlRef,
    previewSelectedPathSetter,
    selectedPreviewHtml,
  ]);

  useEffect(() => {
    if (!activeFile) return;
    void loadFileContent(activeFile);
  }, [activeFile, loadFileContent]);

  useEffect(() => {
    if (!selectedPreviewHtml) return;
    const keys = dirtyPathKeysByFile[selectedPreviewHtml] || [];
    if (keys.length === 0) return;
    const timer = window.setTimeout(() => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      for (const key of keys) {
        const path = key
          .split(".")
          .map((segment) => Number(segment))
          .filter((segment) => Number.isFinite(segment))
          .map((segment) => Math.max(0, Math.trunc(segment)));
        const element = readElementByPath(frameDocument.body, path);
        if (element instanceof HTMLElement) {
          element.classList.add("__nx-preview-dirty");
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    dirtyPathKeysByFile,
    previewFrameRef,
    selectedPreviewDoc,
    selectedPreviewHtml,
  ]);

  return {
    hasPreviewContent,
    isMountedPreview,
    shouldPrepareEditPreviewDoc,
    shouldShowFrameWelcome,
  };
};
