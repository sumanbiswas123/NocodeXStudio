import React from 'react';
import { 
  Type, Image, MousePointerClick, Square, Link as LinkIcon, Video
} from 'lucide-react';

interface ToolboxProps {
  onAddElement: (type: string) => void;
}

const Toolbox: React.FC<ToolboxProps> = ({ onAddElement }) => {
  const createDragGhost = (label: string) => {
    const ghost = document.createElement('div');
    ghost.textContent = label;
    ghost.style.position = 'fixed';
    ghost.style.top = '-1000px';
    ghost.style.left = '-1000px';
    ghost.style.padding = '8px 12px';
    ghost.style.borderRadius = '10px';
    ghost.style.background = 'rgba(15, 23, 42, 0.94)';
    ghost.style.color = '#fff';
    ghost.style.fontSize = '12px';
    ghost.style.fontWeight = '600';
    ghost.style.pointerEvents = 'none';
    ghost.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.32)';
    ghost.style.zIndex = '999999';
    document.body.appendChild(ghost);
    window.setTimeout(() => ghost.remove(), 0);
    return ghost;
  };

  const categories = [
    {
      title: 'Layout',
      color: '#6366f1',
      items: [
        { type: 'div', label: 'Container', icon: Square },
      ]
    },
    {
      title: 'Typography',
      color: '#f59e0b',
      items: [
        { type: 'h1', label: 'Text', icon: Type },
      ]
    },
    {
      title: 'Media',
      color: '#ec4899',
      items: [
        { type: 'img', label: 'Image', icon: Image },
        { type: 'video', label: 'Video', icon: Video },
      ]
    },
    {
      title: 'Interactive',
      color: '#10b981',
      items: [
        { type: 'button', label: 'Button', icon: MousePointerClick },
        { type: 'a', label: 'Link', icon: LinkIcon },
      ]
    },
    
  ];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }}>
      <div
        className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-4 custom-scrollbar"
        style={{ overscrollBehavior: 'contain' }}
      >
        {categories.map((cat, catIdx) => (
          <div key={cat.title} className="animate-slideInLeft" style={{ animationDelay: `${catIdx * 50}ms` }}>
            {/* Category Header */}
            <div className="flex items-center gap-2 mb-2 pl-1">
              <div className="w-1 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {cat.title}
              </h3>
            </div>

            {/* Item Cards */}
            <div className="grid grid-cols-2 gap-1.5">
              {cat.items.map((item) => (
                <button
                  key={item.type}
                  onClick={() => onAddElement(item.type)}
                  onMouseDown={() => {
                    window.dispatchEvent(
                      new CustomEvent('nocodex-toolbox-drag-state', {
                        detail: { active: true, type: item.type },
                      }),
                    );
                  }}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData('application/x-nocodex-element', item.type);
                    event.dataTransfer.setData('text/plain', item.type);
                    const ghost = createDragGhost(`Add ${item.label}`);
                    event.dataTransfer.setDragImage(ghost, 18, 18);
                    window.dispatchEvent(
                      new CustomEvent('nocodex-toolbox-drag-state', {
                        detail: { active: true, type: item.type },
                      }),
                    );
                  }}
                  onDragEnd={() => {
                    window.dispatchEvent(
                      new CustomEvent('nocodex-toolbox-drag-state', {
                        detail: { active: false, type: '' },
                      }),
                    );
                  }}
                  className="panel-card flex flex-col items-center justify-center p-2.5 group cursor-pointer active:scale-95 transition-all duration-200"
                  title={`Add ${item.label}`}
                >
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5 transition-all duration-300 group-hover:scale-110"
                    style={{ backgroundColor: `${cat.color}15`, color: cat.color }}
                  >
                    <item.icon size={16} className="transition-transform group-hover:rotate-6" />
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-main)' }}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Toolbox;
