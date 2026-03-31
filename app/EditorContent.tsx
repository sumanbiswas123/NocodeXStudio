import React from "react";
import EditorCanvas from "../components/EditorCanvas";
import { VirtualElement } from "../types";

export type EditorContentProps = {
  root: VirtualElement;
  selectedId: string | null;
  selectedPathIds: Set<string> | null;
  handleSelect: (id: string) => void;
  handleMoveElement: (draggedId: string, targetId: string) => void;
  handleMoveElementByPosition: (
    id: string,
    styles: Partial<React.CSSProperties>,
  ) => void;
  handleResize: (id: string, width: string, height: string) => void;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  INJECTED_STYLES: string;
};

const resolvePreviewImagePath = (path: string) => path;

const EditorContent = React.memo<EditorContentProps>(
  ({
    root,
    selectedId,
    selectedPathIds,
    handleSelect,
    handleMoveElement,
    handleMoveElementByPosition,
    handleResize,
    interactionMode,
    INJECTED_STYLES,
  }) => (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `* { outline: none; } ${selectedId ? `[data-id="${selectedId}"] { outline: 2px solid #6366f1 !important; z-index: 10; cursor: default; }` : ""}`,
        }}
      />
      <div className="w-full h-full overflow-auto custom-scrollbar bg-white">
        <EditorCanvas
          element={root}
          selectedId={selectedId}
          selectedPathIds={selectedPathIds}
          onSelect={handleSelect}
          resolveImage={resolvePreviewImagePath}
          onMoveElement={handleMoveElement}
          onMoveByPosition={handleMoveElementByPosition}
          onResize={handleResize}
          interactionMode={interactionMode}
        />
      </div>
    </>
  ),
);

EditorContent.displayName = "EditorContent";

export default EditorContent;
