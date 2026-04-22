import { useCallback } from "react";
import type React from "react";
import type { VirtualElement } from "../../../types";
import { readElementByPath } from "../../helpers/appHelpers";

type IdentityUpdate = {
  id: string;
  className: string;
};

type UsePreviewIdentityUpdateOptions = {
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  filesRef: React.MutableRefObject<Record<string, any>>;
  persistPreviewHtmlContent: (
    updatedPath: string,
    serialized: string,
    options?: {
      refreshPreviewDoc?: boolean;
      saveNow?: boolean;
      skipAutoSave?: boolean;
      elementPath?: number[];
      pushToHistory?: boolean;
      skipCssExtraction?: boolean;
    },
  ) => Promise<void>;
  previewSelectedPath: number[] | null;
  selectedPreviewHtml: string | null;
  setPreviewSelectedElement: React.Dispatch<
    React.SetStateAction<VirtualElement | null>
  >;
};

type UsePreviewIdentityUpdateResult = {
  applyPreviewIdentityUpdate: (identity: IdentityUpdate) => Promise<void>;
  handlePreviewIdentityUpdateStable: (identity: IdentityUpdate) => void;
};

export const usePreviewIdentityUpdate = ({
  getLivePreviewSelectedElement,
  loadFileContent,
  filesRef,
  persistPreviewHtmlContent,
  previewSelectedPath,
  selectedPreviewHtml,
  setPreviewSelectedElement,
}: UsePreviewIdentityUpdateOptions): UsePreviewIdentityUpdateResult => {
  const applyPreviewIdentityUpdate = useCallback(
    async (identity: IdentityUpdate) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, previewSelectedPath);
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      if (!target && !liveTarget) return;

      const nextId = identity.id.trim();
      const nextClassName = identity.className.trim();

      if (target) {
        if (nextId) target.setAttribute("id", nextId);
        else target.removeAttribute("id");
        if (nextClassName) target.setAttribute("class", nextClassName);
        else target.removeAttribute("class");
      }
      if (liveTarget) {
        if (nextId) liveTarget.setAttribute("id", nextId);
        else liveTarget.removeAttribute("id");
        if (nextClassName) liveTarget.setAttribute("class", nextClassName);
        else liveTarget.removeAttribute("class");
      }

      if (target) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
      }

      setPreviewSelectedElement((prev) =>
        prev
          ? {
              ...prev,
              id: nextId || prev.id,
              className: nextClassName || undefined,
            }
          : prev,
      );
    },
    [
      filesRef,
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
      setPreviewSelectedElement,
    ],
  );

  const handlePreviewIdentityUpdateStable = useCallback(
    (identity: IdentityUpdate) => {
      void applyPreviewIdentityUpdate(identity);
    },
    [applyPreviewIdentityUpdate],
  );

  return {
    applyPreviewIdentityUpdate,
    handlePreviewIdentityUpdateStable,
  };
};
