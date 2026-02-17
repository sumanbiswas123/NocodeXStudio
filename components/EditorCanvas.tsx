import React, { useRef, useEffect } from 'react';
import { VirtualElement } from '../types';

interface EditorCanvasProps {
  element: VirtualElement;
  selectedId: string | null;
  onSelect: (id: string) => void;
  resolveImage?: (path: string) => string;
  onMoveElement: (draggedId: string, targetId: string) => void;
  onResize: (id: string, width: string, height: string) => void;
  interactionMode?: 'edit' | 'preview';
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({
  element,
  selectedId,
  onSelect,
  resolveImage,
  onMoveElement,
  onResize,
  interactionMode = 'edit'
}) => {
  const isSelected = element.id === selectedId;
  const isPreview = interactionMode === 'preview';
  const elementRef = useRef<HTMLElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (isPreview) return; // Let default behavior happens (e.g. links navigate)
    e.stopPropagation();
    onSelect(element.id);
  };

  // Handle Resizing (Only for selected element)
  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPreview) return;
    e.stopPropagation();
    if (isSelected && elementRef.current) {
      // Check if dimensions changed via CSS resize
      const currentWidth = elementRef.current.style.width;
      const currentHeight = elementRef.current.style.height;

      if (currentWidth !== element.styles.width || currentHeight !== element.styles.height) {
        onResize(element.id, currentWidth, currentHeight);
      }
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent) => {
    if (isPreview) { e.preventDefault(); return; }
    e.stopPropagation();
    e.dataTransfer.setData('application/react-dnd-id', element.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isPreview) return;
    e.preventDefault(); // Necessary to allow dropping
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isPreview) return;
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('application/react-dnd-id');

    if (draggedId && draggedId !== element.id) {
      onMoveElement(draggedId, element.id);
    }
  };

  const commonProps = {
    id: element.id,
    ref: elementRef as any,
    draggable: !isPreview && element.id !== 'root',
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onMouseUp: handleMouseUp,
    // Spread custom attributes (data-id, aria-*, etc.)
    ...(element.attributes || {}),
    style: {
      ...element.styles,
      animation: element.animation,
      // Selection Highlighting
      outline: !isPreview && isSelected ? '2px solid #3b82f6' : (element.id === 'root' ? 'none' : (!isPreview ? '1px dashed transparent' : 'none')),
      outlineOffset: !isPreview && isSelected ? '-2px' : '0px',
      boxShadow: !isPreview && isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.2)' : 'none',

      // Resizing logic 
      resize: !isPreview && isSelected ? 'both' : 'none',
      overflow: !isPreview && isSelected && element.type !== 'img' ? 'hidden' : element.styles.overflow || 'visible',

      position: element.styles.position as any || 'relative',
      cursor: isPreview ? (element.type === 'a' || element.type === 'button' ? 'pointer' : 'default') : (isSelected ? 'default' : 'pointer'),
      minHeight: !isPreview && element.children.length === 0 && !element.styles.height && element.type === 'div' ? '50px' : undefined,
    },
    onClick: handleClick,
    className: `transition-colors ${element.id === 'root' ? 'min-h-full' : (!isPreview ? 'hover:outline-blue-300 hover:outline-dashed hover:outline-1' : '')} ${element.className || ''}`
  };

  // Render children recursively
  const children = element.children.map(child => (
    <EditorCanvas
      key={child.id}
      element={child}
      selectedId={selectedId}
      onSelect={onSelect}
      resolveImage={resolveImage}
      onMoveElement={onMoveElement}
      onResize={onResize}
      interactionMode={interactionMode}
    />
  ));

  switch (element.type) {
    case 'img':
      const imgSrc = resolveImage && element.src ? resolveImage(element.src) : (element.src || 'https://picsum.photos/200/200');
      return (
        <img
          src={imgSrc}
          alt={element.name}
          {...commonProps}
        />
      );
    case 'button':
      return (
        <button {...commonProps}>
          {element.content}
          {children}
        </button>
      );
    case 'a':
      return (
        <a href={element.href || '#'} {...commonProps} onClick={(e) => {
          if (!isPreview) { e.preventDefault(); handleClick(e); }
          else { /* allow default */ }
        }}>
          {element.content}
          {children}
        </a>
      );
    case 'h1': return <h1 {...commonProps}>{element.content}{children}</h1>;
    case 'h2': return <h2 {...commonProps}>{element.content}{children}</h2>;
    case 'p': return <p {...commonProps}>{element.content}{children}</p>;
    case 'section': return <section {...commonProps}>{children}</section>;
    case 'span': return <span {...commonProps}>{element.content}{children}</span>;
    case 'sup':
      return (
        <span style={{ position: 'relative', display: 'inline' }}>
          <sup {...commonProps}>{element.content}{children}</sup>
          {!isPreview && isSelected && (
            <span
              style={{
                position: 'absolute',
                top: '-18px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#8b5cf6',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                zIndex: 1000,
                pointerEvents: 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              SUP
            </span>
          )}
        </span>
      );
    case 'sub':
      return (
        <span style={{ position: 'relative', display: 'inline' }}>
          <sub {...commonProps}>{element.content}{children}</sub>
          {!isPreview && isSelected && (
            <span
              style={{
                position: 'absolute',
                bottom: '-18px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#f59e0b',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                zIndex: 1000,
                pointerEvents: 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              SUB
            </span>
          )}
        </span>
      );
    case 'br': return <br {...commonProps} />;
    case 'text': return <>{element.content}</>;
    default: return <div {...commonProps}>{element.content}{children}</div>;
  }
};

export default EditorCanvas;