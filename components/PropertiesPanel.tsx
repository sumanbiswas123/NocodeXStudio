import React, { useState, useEffect, useRef } from 'react';
import { VirtualElement, ElementType, FileMap } from '../types';
import { ANIMATIONS } from '../constants';
import {
  Type, Layout, Palette, Image as ImageIcon, BoxSelect, Trash2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ArrowUp, ArrowDown, Move, Layers, Plus, Minimize,
  ChevronRight, ChevronDown, Zap, Monitor, Settings2, Sparkles,
  Hash, CornerUpRight
} from 'lucide-react';
import { DynamicSections } from './DynamicSections';
import { CSS_PROPERTY_NAMES, CSS_PROPERTY_VALUES, filterAndSortProperties } from '../utils/cssProperties';
import ScrollControls from './ScrollControls';
import AnimationControls from './AnimationControls';

interface PropertiesPanelProps {
  element: VirtualElement | null;
  onUpdateStyle: (styles: Partial<React.CSSProperties>) => void;
  onUpdateContent: (data: { content?: string; src?: string; href?: string }) => void;
  onUpdateAttributes: (attributes: Record<string, string>) => void;
  onUpdateAnimation: (animation: string) => void;
  onDelete: () => void;
  onAddElement: (type: string, position: 'inside' | 'before' | 'after') => void;
  onMoveOrder: (direction: 'up' | 'down') => void;
  resolveImage: (path: string) => string;
  availableFonts: string[];
}

// Standalone AccordionSection — prevents remounting on parent re-render
const AccordionSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor?: string;
}> = ({ title, icon, children, defaultOpen = false, accentColor = 'var(--accent-primary)' }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 transition-all duration-200 group hover:bg-black/5"
      >
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: accentColor, opacity: 0.8 }}>{icon}</span>
          {title}
        </div>
        <span 
          className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          style={{ color: 'var(--text-muted)' }}
        >
          <ChevronRight size={12} />
        </span>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 animate-slideUp">
           {children}
        </div>
      )}
    </div>
  );
};

// Element type to gradient mapping
const TYPE_GRADIENTS: Record<string, string> = {
  div: 'from-blue-600/20 to-blue-800/10',
  section: 'from-cyan-600/20 to-cyan-800/10',
  h1: 'from-amber-600/20 to-amber-800/10',
  h2: 'from-amber-500/20 to-amber-700/10',
  h3: 'from-amber-400/20 to-amber-600/10',
  p: 'from-slate-500/20 to-slate-700/10',
  span: 'from-teal-600/20 to-teal-800/10',
  button: 'from-green-600/20 to-green-800/10',
  img: 'from-cyan-600/20 to-cyan-800/10',
  a: 'from-cyan-600/20 to-cyan-800/10',
};

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  element,
  onUpdateStyle,
  onUpdateContent,
  onUpdateAttributes,
  onUpdateAnimation,
  onDelete,
  onAddElement,
  onMoveOrder,
  resolveImage,
  availableFonts
}) => {
  const [insertMode, setInsertMode] = useState<'inside' | 'before' | 'after'>('inside');
  const [localContent, setLocalContent] = useState('');
  const [activeTab, setActiveTab] = useState<'content' | 'style' | 'advanced'>('style');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Extract text content from element
  const extractTextContent = (elem: VirtualElement | null): string => {
    if (!elem) return '';
    if (elem.content !== undefined && elem.children.length === 0) return elem.content;
    if (elem.children.length === 0) return elem.content || '';
    return elem.children
      .map(child => child.type === 'text' ? child.content || '' : '')
      .join('');
  };

  useEffect(() => {
    if (element) {
      setLocalContent(extractTextContent(element));
    }
  }, [element?.id]);

  const handleStyleChange = (key: keyof React.CSSProperties, value: any) => {
    onUpdateStyle({ [key]: value });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => onUpdateContent({ src: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => onUpdateStyle({ backgroundImage: `url('${reader.result}')` });
        reader.readAsDataURL(file);
      }
    };

  // ─── No Selection State ───
  if (!element) return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center backdrop-blur-xl" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-muted)' }}>
       <div 
         className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-inner animate-neonPulse"
         style={{ backgroundColor: 'var(--border-color)' }}
       >
          <BoxSelect size={36} className="opacity-40" />
       </div>
       <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-main)' }}>No Selection</h3>
       <p className="text-[11px] leading-relaxed max-w-[180px]" style={{ color: 'var(--text-muted)' }}>
         Click an element on the canvas to edit its properties.
       </p>
    </div>
  );

  const gradient = TYPE_GRADIENTS[element.type] || TYPE_GRADIENTS['div'];
  const hasContent = element.content !== undefined || ['img', 'a', 'p', 'h1', 'h2', 'h3', 'button', 'span'].includes(element.type);

  return (
    <div
      className="h-full flex flex-col backdrop-blur-xl no-scrollbar"
      style={{
        backgroundColor: 'var(--bg-glass)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-main)',
        ['--accent-primary' as any]: '#06b6d4',
        ['--accent-glow' as any]: 'rgba(6, 182, 212, 0.22)',
      } as React.CSSProperties}
    >
      
      {/* ─── Element Header Card ─── */}
      <div 
        className={`p-3 border-b backdrop-blur-md sticky top-0 z-10 bg-gradient-to-br ${gradient}`}
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2.5">
             <div 
               className="p-2 rounded-xl shadow-sm"
               style={{ backgroundColor: 'var(--accent-glow)' }}
             >
                {element.type === 'img' ? <ImageIcon size={16} style={{ color: '#06b6d4' }}/> : <Layout size={16} style={{ color: 'var(--accent-primary)' }}/>}
             </div>
             <div>
                <h2 className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--text-main)' }}>
                   {element.name}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                    <Hash size={8} className="inline mr-0.5" />{element.id.split('-').pop()}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                    &lt;{element.type}&gt;
                  </span>
                  {element.children.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                      {element.children.length} children
                    </span>
                  )}
                </div>
             </div>
          </div>
        </div>

        {/* Floating Action Bar */}
        {element.id !== 'root' && (
          <div 
            className="flex gap-1 p-1 rounded-lg mt-1"
            style={{ backgroundColor: 'var(--bg-glass)' }}
          >
            <button onClick={() => onMoveOrder('up')} className="glass-icon-btn flex-1 flex items-center justify-center gap-1 py-1 text-[10px]" title="Move Up">
              <ArrowUp size={12} /> Up
            </button>
            <button onClick={() => onMoveOrder('down')} className="glass-icon-btn flex-1 flex items-center justify-center gap-1 py-1 text-[10px]" title="Move Down">
              <ArrowDown size={12} /> Down
            </button>
            <button onClick={onDelete} className="glass-icon-btn flex-1 flex items-center justify-center gap-1 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10" title="Delete">
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>

      {/* ─── Quick Access Tabs ─── */}
      <div className="flex border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        {([
          { key: 'content', label: 'Content', icon: <Type size={12} /> },
          { key: 'style', label: 'Style', icon: <Palette size={12} /> },
          { key: 'advanced', label: 'Advanced', icon: <Settings2 size={12} /> },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all duration-200 border-b-2 ${
              activeTab === tab.key
                ? 'border-cyan-500'
                : 'border-transparent hover:bg-black/5'
            }`}
            style={{ color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)' }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}
      <div className="flex-1 overflow-y-auto no-scrollbar">

        {/* CONTENT TAB */}
        {activeTab === 'content' && (
          <div className="animate-slideInRight">
            {hasContent ? (
              <div className="p-3">
                {element.type === 'img' ? (
                  <div className="space-y-3">
                     <img 
                        src={element.src ? resolveImage(element.src) : ''} 
                        className="w-full h-32 object-cover rounded-xl border shadow-sm"
                        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--input-bg)' }}
                     />
                     <label className="glass-button w-full flex items-center justify-center py-2.5 rounded-lg cursor-pointer text-xs font-medium">
                        <ImageIcon size={14} className="mr-2"/> Change Image
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                     </label>
                  </div>
                ) : (
                  <div className="space-y-3">
                     <div>
                       <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Text Content</label>
                       <textarea
                         value={localContent}
                         onChange={(e) => {
                            setLocalContent(e.target.value);
                            if (debounceTimer.current) clearTimeout(debounceTimer.current);
                            debounceTimer.current = setTimeout(() => onUpdateContent({ content: e.target.value }), 500);
                         }}
                         onBlur={() => onUpdateContent({ content: localContent })}
                         className="w-full glass-input p-2.5 text-xs min-h-[100px] rounded-lg"
                         style={{ color: 'var(--text-main)' }}
                         placeholder="Type text here..."
                       />
                     </div>
                     {element.type === 'a' && (
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Link URL</label>
                          <input
                             type="text"
                             value={element.href || ''}
                             onChange={(e) => onUpdateContent({ href: e.target.value })}
                             className="w-full glass-input p-2 text-xs rounded-lg"
                             style={{ color: 'var(--text-main)' }}
                             placeholder="https://..."
                          />
                        </div>
                     )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>
                <Type size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">This element doesn't have editable content.</p>
              </div>
            )}
          </div>
        )}

        {/* STYLE TAB */}
        {activeTab === 'style' && (
          <div className="animate-slideInRight">
            <DynamicSections
               styles={element.styles}
               onChange={handleStyleChange}
               availableFonts={availableFonts}
               onBgImageUpload={handleBgImageUpload}
            />
          </div>
        )}

        {/* ADVANCED TAB */}
        {activeTab === 'advanced' && (
          <div className="animate-slideInRight">
            {/* Animation Control */}
            <AccordionSection title="Animation & Effects" icon={<Zap size={13}/>} accentColor="#f59e0b" defaultOpen>
               <AnimationControls
                  element={element}
                  onUpdateAnimation={onUpdateAnimation}
                  onUpdateStyle={onUpdateStyle}
               />
            </AccordionSection>

            {/* Scroll Control */}
            <AccordionSection title="Scrolling & Overflow" icon={<Monitor size={13}/>} accentColor="#06b6d4">
                <ScrollControls
                   styles={element.styles}
                   onChange={onUpdateStyle}
                />
            </AccordionSection>

            {/* Interaction (Link/Nav) */}
            <AccordionSection title="Interaction" icon={<CornerUpRight size={13}/>} accentColor="#10b981">
                <div className="space-y-2">
                   <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Navigate to ID</label>
                   <input
                     type="text"
                     value={element.attributes?.['data-id'] || ''}
                     onChange={(e) => {
                        const val = e.target.value;
                        const newAttrs = { ...element.attributes };
                        if (val) newAttrs['data-id'] = val; else delete newAttrs['data-id'];
                        onUpdateAttributes(newAttrs);
                     }}
                     className="w-full glass-input p-2 text-xs rounded-lg"
                     style={{ color: 'var(--text-main)' }}
                     placeholder="e.g. section-contact"
                   />
                </div>
            </AccordionSection>

            {/* Add Child */}
            <AccordionSection title="Insert Element" icon={<Plus size={13}/>} accentColor="#06b6d4" defaultOpen={false}>
                <div className="grid grid-cols-3 gap-1.5">
                   <div className="col-span-3 flex p-0.5 rounded-lg mb-2" style={{ backgroundColor: 'var(--input-bg)' }}>
                     {(['inside', 'before', 'after'] as const).map(mode => (
                        <button
                           key={mode}
                           onClick={() => setInsertMode(mode)}
                           className={`flex-1 py-1 text-[10px] rounded-md capitalize transition-all font-medium ${
                             insertMode === mode 
                               ? 'bg-cyan-600 text-white shadow-sm' 
                               : ''
                           }`}
                           style={insertMode !== mode ? { color: 'var(--text-muted)' } : undefined}
                        >
                           {mode}
                        </button>
                     ))}
                   </div>
                   
                   {['div', 'section', 'p', 'h1', 'button', 'img', 'a'].map(tag => (
                      <button
                         key={tag}
                         onClick={() => onAddElement(tag, insertMode)}
                         className="glass-button py-2 text-xs rounded-lg uppercase font-bold transition-all hover:scale-105 active:scale-95"
                         style={{ color: 'var(--text-main)' }}
                      >
                         {tag}
                      </button>
                   ))}
                </div>
            </AccordionSection>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertiesPanel;
