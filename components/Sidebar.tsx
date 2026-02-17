import React, { useState } from 'react';
import FileExplorer from './FileExplorer';
import Toolbox from './Toolbox';
import LayersPanel from './LayersPanel';
import { FileMap, VirtualElement } from '../types';
import { FolderOpen, Box, Layers, MousePointer2, PenTool, Sparkles, Plus } from 'lucide-react';

interface SidebarProps {
  files: FileMap;
  projectPath: string | null;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onAddElement: (type: string) => void;
  root: VirtualElement;
  selectedId: string | null;
  onSelectElement: (id: string) => void;
  interactionMode: 'edit' | 'preview' | 'inspect' | 'draw';
  setInteractionMode: (mode: 'edit' | 'preview' | 'inspect' | 'draw') => void;
  drawElementTag: string;
  setDrawElementTag: (tag: string) => void;
}

const TAB_ITEMS = [
  { key: 'files', icon: FolderOpen, label: 'Explorer' },
  { key: 'layers', icon: Layers, label: 'Layers' },
  { key: 'toolbox', icon: Box, label: 'Add' },
] as const;

type TabKey = typeof TAB_ITEMS[number]['key'];

const Sidebar: React.FC<SidebarProps> = ({
  files,
  projectPath,
  activeFile,
  onSelectFile,
  onAddElement,
  root,
  selectedId,
  onSelectElement,
  interactionMode,
  setInteractionMode,
  drawElementTag,
  setDrawElementTag
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('files');

  return (
    <div className="flex h-full shrink-0 z-10">
      {/* ─── Icon Rail ─── */}
      <div 
        className="w-12 flex flex-col items-center py-3 gap-1 border-r shrink-0"
        style={{ 
          backgroundColor: 'var(--bg-glass-strong)', 
          borderColor: 'var(--border-color)' 
        }}
      >
        {/* Mode Toggles */}
        <div className="flex flex-col gap-1 mb-3 pb-3 border-b w-8" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={() => setInteractionMode('edit')}
            title="Select / Edit"
            className={`p-2 rounded-lg transition-all duration-200 group relative ${
              interactionMode === 'edit' || interactionMode === 'inspect'
                ? 'tab-active-glow animate-neonPulse'
                : 'hover:bg-black/5'
            }`}
            style={{ color: (interactionMode === 'edit' || interactionMode === 'inspect') ? 'var(--accent-primary)' : 'var(--icon-color)' }}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            onClick={() => setInteractionMode('draw')}
            title="Draw Element"
            className={`p-2 rounded-lg transition-all duration-200 group relative ${
              interactionMode === 'draw'
                ? 'bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10'
                : 'hover:bg-black/5'
            }`}
            style={{ color: interactionMode === 'draw' ? undefined : 'var(--icon-color)' }}
          >
            <PenTool size={16} />
          </button>
        </div>

        {/* Tab Icons */}
        {TAB_ITEMS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            title={label}
            className={`p-2 rounded-lg transition-all duration-200 relative glow-indicator ${
              activeTab === key ? 'tab-active-glow' : 'hover:bg-black/5'
            }`}
            style={{ color: activeTab === key ? 'var(--accent-primary)' : 'var(--icon-color)' }}
          >
            <Icon size={16} />
            {/* Active dot indicator */}
            {activeTab === key && (
              <span className="absolute -right-[7px] top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-l-full bg-indigo-500 transition-all" />
            )}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Quick Add FAB */}
        <button
          onClick={() => { setActiveTab('toolbox'); }}
          title="Quick Add Element"
          className="p-2 pb-7 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-110 active:scale-95 transition-all duration-200"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* ─── Content Panel ─── */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }}>
        {/* Panel Header */}
        <div 
          className="px-3 py-2.5 border-b flex items-center justify-between backdrop-blur-sm"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-glass-strong)' }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={12} style={{ color: 'var(--accent-primary)' }} />
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {TAB_ITEMS.find(t => t.key === activeTab)?.label}
            </span>
          </div>
        </div>

        {/* Draw Mode Selector (only when draw mode active) */}
        {interactionMode === 'draw' && (
          <div className="p-2 border-b animate-slideUp" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgba(16,185,129,0.05)' }}>
            <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>
              Drawing Element
            </label>
            <select
              value={drawElementTag}
              onChange={(e) => setDrawElementTag(e.target.value)}
              className="w-full h-7 text-xs glass-input px-2 focus:outline-none rounded-md"
              style={{ color: 'var(--text-main)' }}
            >
              <option value="div">Box (div)</option>
              <option value="section">Section</option>
              <option value="p">Paragraph</option>
              <option value="span">Span</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="button">Button</option>
              <option value="img">Image</option>
            </select>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden custom-scrollbar animate-slideInLeft">
          {activeTab === 'files' ? (
            <FileExplorer files={files} projectPath={projectPath} activeFile={activeFile} onSelectFile={onSelectFile} />
          ) : activeTab === 'layers' ? (
            <LayersPanel root={root} selectedId={selectedId} onSelect={onSelectElement} />
          ) : (
            <Toolbox onAddElement={onAddElement} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
