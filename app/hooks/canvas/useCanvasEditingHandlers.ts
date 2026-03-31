import { useCallback } from "react";
import type React from "react";
import type { VirtualElement } from "../../../types";
import {
  addElementToTree,
  buildPresetElementV2,
  buildStandardElement,
  createPresetIdFactory,
  deleteElementFromTree,
  extractTextFromHtmlFragment,
  findElementById,
  updateElementInTree,
} from "../../helpers/appHelpers";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";
type PreviewToolMode = "edit" | "inspect" | "draw" | "move";

type UseCanvasEditingHandlersOptions = {
  root: VirtualElement;
  selectedId: string | null;
  pushHistory: (newRoot: VirtualElement) => void;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  interactionModeRef: React.MutableRefObject<InteractionMode>;
  selectedPreviewHtmlRef: React.MutableRefObject<string | null>;
  previewFrameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  setSidebarToolMode: React.Dispatch<React.SetStateAction<PreviewToolMode>>;
  setInteractionMode: React.Dispatch<React.SetStateAction<InteractionMode>>;
  setPreviewMode: React.Dispatch<React.SetStateAction<"edit" | "preview">>;
  applyPreviewDropCreateRef: React.MutableRefObject<
    ((type: string, clientX: number, clientY: number) => Promise<void>) | null
  >;
};

type UpdateContentPayload = {
  content?: string;
  html?: string;
  src?: string;
  href?: string;
};

export const useCanvasEditingHandlers = ({
  root,
  selectedId,
  pushHistory,
  setSelectedId,
  setIsRightPanelOpen,
  interactionModeRef,
  selectedPreviewHtmlRef,
  previewFrameRef,
  setSidebarToolMode,
  setInteractionMode,
  setPreviewMode,
  applyPreviewDropCreateRef,
}: UseCanvasEditingHandlersOptions) => {
  const handleUpdateStyle = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      if (!selectedId) return;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        styles: { ...el.styles, ...styles },
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateContent = useCallback(
    (data: UpdateContentPayload) => {
      if (!selectedId) return;
      const normalizedData =
        typeof data.html === "string" && typeof data.content !== "string"
          ? {
              ...data,
              content: extractTextFromHtmlFragment(data.html),
            }
          : data;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        ...normalizedData,
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateIdentity = useCallback(
    (identity: { id: string; className: string }) => {
      if (!selectedId) return;
      const nextId = identity.id.trim() || selectedId;
      const nextClassName = identity.className.trim();
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        id: nextId,
        className: nextClassName || undefined,
      }));
      pushHistory(newRoot);
      if (nextId !== selectedId) {
        setSelectedId(nextId);
      }
    },
    [root, selectedId, pushHistory, setSelectedId],
  );

  const handleUpdateAnimation = useCallback(
    (animation: string) => {
      if (!selectedId) return;
      const nextAnimation =
        typeof animation === "string" ? animation.trim() : "";
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        animation: nextAnimation,
        styles: {
          ...el.styles,
          animation: nextAnimation,
        },
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleMoveElement = useCallback(
    (draggedId: string, targetId: string) => {
      const draggedEl = findElementById(root, draggedId);
      if (!draggedEl) return;
      let newRoot = deleteElementFromTree(root, draggedId);
      newRoot = addElementToTree(newRoot, targetId, draggedEl, "inside");
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleMoveElementByPosition = useCallback(
    (id: string, styles: Partial<React.CSSProperties>) => {
      const target = findElementById(root, id);
      if (!target) return;
      let changed = false;
      for (const [key, value] of Object.entries(styles)) {
        if (
          String((target.styles as Record<string, unknown> | undefined)?.[key] ?? "") !==
          String(value ?? "")
        ) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      const newRoot = updateElementInTree(root, id, (el) => ({
        ...el,
        styles: { ...el.styles, ...styles },
      }));
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleResize = useCallback(
    (id: string, width: string, height: string) => {
      const newRoot = updateElementInTree(root, id, (el) => ({
        ...el,
        styles: { ...el.styles, width, height },
      }));
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleAddElement = useCallback(
    (type: string, position: "inside" | "before" | "after" = "inside") => {
      const idFor = createPresetIdFactory(type);
      const newElement =
        buildPresetElementV2(type, idFor) ??
        buildStandardElement(type, idFor("element"));
      const targetId = selectedId || root.id;
      const newRoot = addElementToTree(root, targetId, newElement, position);
      pushHistory(newRoot);
      setSelectedId(newElement.id);
      setIsRightPanelOpen(true);
    },
    [root, selectedId, pushHistory, setSelectedId, setIsRightPanelOpen],
  );

  const handleSidebarAddElement = useCallback(
    (type: string) => {
      if (
        interactionModeRef.current === "preview" &&
        selectedPreviewHtmlRef.current
      ) {
        const frameRect = previewFrameRef.current?.getBoundingClientRect();
        const clientX = frameRect
          ? Math.round(frameRect.left + frameRect.width / 2)
          : Math.round(window.innerWidth / 2);
        const clientY = frameRect
          ? Math.round(frameRect.top + frameRect.height / 2)
          : Math.round(window.innerHeight / 2);
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        setPreviewMode("edit");
        void applyPreviewDropCreateRef.current?.(type, clientX, clientY);
        return;
      }
      handleAddElement(type, "inside");
    },
    [
      applyPreviewDropCreateRef,
      handleAddElement,
      interactionModeRef,
      previewFrameRef,
      selectedPreviewHtmlRef,
      setInteractionMode,
      setPreviewMode,
      setSidebarToolMode,
    ],
  );

  return {
    handleAddElement,
    handleMoveElement,
    handleMoveElementByPosition,
    handleResize,
    handleSidebarAddElement,
    handleUpdateAnimation,
    handleUpdateContent,
    handleUpdateIdentity,
    handleUpdateStyle,
  };
};
