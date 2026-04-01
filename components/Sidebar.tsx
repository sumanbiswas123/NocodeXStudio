import React, { useEffect, useState } from 'react';
import FileExplorer from './FileExplorer';
import Toolbox from './Toolbox';
import ImagesPanel from './ImagesPanel';
import MasterFeaturePanel from './MasterFeaturePanel';
import AnimationControls from './AnimationControls';
import { FileMap, VirtualElement } from '../types';
import { FolderOpen, Box, Sparkles, Settings, Image as ImageIcon, Wand2, PanelLeftClose, Zap } from 'lucide-react';
import '../app/styles/components/sidebar.css';

interface SidebarProps {
  files: FileMap;
  projectPath: string | null;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onAddFontToPresentationCss: (path: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRenamePath: (path: string) => void;
  onDeletePath: (path: string, kind: 'file' | 'folder') => void;
  onDuplicateFile: (path: string) => void;
  onRefreshFiles: () => void;
  onOpenProjectFolder: () => void;
  onOpenCodePanel: () => void;
  selectedFolderCloneSource: string | null;
  onChooseFolderCloneSource: () => void;
  onAddElement: (type: string) => void;
  root: VirtualElement;
  selectedId: string | null;
  onSelectElement: (id: string) => void;
  interactionMode: 'edit' | 'preview' | 'inspect' | 'draw' | 'move';
  setInteractionMode: (mode: 'edit' | 'preview' | 'inspect' | 'draw' | 'move') => void;
  drawElementTag: string;
  setDrawElementTag: (tag: string) => void;
  theme: 'light' | 'dark';
  showConfigButton: boolean;
  onOpenConfig: () => void;
  onLoadImage: (path: string) => void;
  isPanelOpen: boolean;
  onTogglePanelOpen: (next: boolean) => void;
  showMasterTools?: boolean;
  showCollapseControl?: boolean;
  animationElement?: VirtualElement | null;
  isEditModeActive?: boolean;
  onUpdateAnimation: (animation: string) => void;
  onUpdateAnimationStyle: (styles: Partial<React.CSSProperties>) => void;
}

const TAB_ITEMS = [
  { key: 'files', icon: FolderOpen, label: 'Explorer' },
  { key: 'images', icon: ImageIcon, label: 'Images' },
  { key: 'toolbox', icon: Box, label: 'Add' },
  { key: 'master', icon: Wand2, label: 'Master', beta: true },
  { key: 'animation', icon: Zap, label: 'Animation' },
] as const;

type TabKey = typeof TAB_ITEMS[number]['key'];

const SidebarBase: React.FC<SidebarProps> = ({
  files,
  projectPath,
  activeFile,
  onSelectFile,
  onAddFontToPresentationCss,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
  onDuplicateFile,
  onRefreshFiles,
  onOpenProjectFolder,
  onOpenCodePanel,
  selectedFolderCloneSource,
  onChooseFolderCloneSource,
  onAddElement,
  root,
  selectedId,
  onSelectElement,
  interactionMode,
  setInteractionMode,
  drawElementTag,
  setDrawElementTag,
  theme,
  showConfigButton,
  onOpenConfig,
  onLoadImage,
  isPanelOpen,
  onTogglePanelOpen,
  showMasterTools = true,
  showCollapseControl = false,
  animationElement = null,
  isEditModeActive = false,
  onUpdateAnimation,
  onUpdateAnimationStyle,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('files');
  const selectedAccent = theme === 'dark' ? '#67e8f9' : '#0891b2';
  const selectedGlow = theme === 'dark' ? 'rgba(103, 232, 249, 0.4)' : 'rgba(8, 145, 178, 0.22)';
  const showAnimationTab =
    isEditModeActive &&
    Boolean(animationElement);
  const visibleTabs = (showMasterTools
    ? TAB_ITEMS
    : TAB_ITEMS.filter((tab) => tab.key !== 'master')
  ).filter((tab) => tab.key !== 'animation' || showAnimationTab);

  useEffect(() => {
    if (activeTab === 'animation' && !showAnimationTab) {
      setActiveTab(showMasterTools ? 'master' : 'toolbox');
    }
  }, [activeTab, showAnimationTab, showMasterTools]);


  const handleTabClick = (key: TabKey) => {
    if (isPanelOpen && activeTab === key) {
      onTogglePanelOpen(false);
      return;
    }
    setActiveTab(key);
    if (!isPanelOpen) {
      onTogglePanelOpen(true);
    }
  };

  return (
    <div
      className="sidebar-shell"
      style={
        {
          ['--accent-primary' as any]: selectedAccent,
          ['--accent-glow' as any]: selectedGlow,
        } as React.CSSProperties
      }
    >
      {/* ─── Icon Rail ─── */}
      <div
        className="sidebar-rail"
        style={{
          backgroundColor: 'var(--bg-glass-strong)',
          borderColor: 'var(--border-color)'
        }}
      >
        {/* Tab Icons */}
        {visibleTabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => handleTabClick(key)}
            title={label}
            className={`sidebar-tab-button ${activeTab === key ? 'sidebar-tab-button--active' : ''}`}
            style={{
              color:
                activeTab === key
                  ? selectedAccent
                  : 'var(--icon-color)'
            }}
          >
            <Icon size={16} />
            {/* Active dot indicator */}
            {activeTab === key && (
              <span
                className="sidebar-tab-active-indicator"
                style={{ backgroundColor: selectedAccent }}
              />
            )}
          </button>
        ))}

        {/* Spacer */}
        <div className="sidebar-rail-spacer" />

        <button
          onClick={onOpenConfig}
          title="Application Settings"
          className="sidebar-settings-button"
          style={{ color: 'var(--icon-color)' }}
        >
          <Settings size={16} />
        </button>

        {showConfigButton && false && (
          <button
            onClick={onOpenConfig}
            title="Presentation Settings"
            className="sidebar-settings-button"
            style={{ color: 'var(--icon-color)' }}
          >
            <Settings size={16} />
          </button>
        )}

        {/* Quick Add FAB - hidden for production */}
        {/* <button
          onClick={() => { setActiveTab('toolbox'); }}
          title="Quick Add Element"
          className={`p-2 rounded-xl text-white shadow-lg active:scale-95 transition-all duration-200 ${
            theme === 'dark'
              ? 'bg-gradient-to-br from-cyan-500 to-blue-500 shadow-cyan-500/35'
              : 'bg-gradient-to-br from-cyan-600 to-sky-600 shadow-cyan-500/25'
          }`}
        >
          <Plus size={16} />
        </button> */}
      </div>

      {/* ─── Content Panel ─── */}
      <div
        className={`sidebar-content-panel ${isPanelOpen ? 'sidebar-content-panel--open' : 'sidebar-content-panel--collapsed'}`}
        style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }}
      >
        {/* Panel Header */}
        <div
          className="sidebar-panel-header"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-glass-strong)' }}
        >
          <div className="sidebar-panel-header-main">
            <Sparkles size={12} style={{ color: selectedAccent }} />
            <span className="sidebar-panel-title" style={{ color: 'var(--text-muted)' }}>
              <span>{TAB_ITEMS.find(t => t.key === activeTab)?.label}</span>
              {showMasterTools && activeTab === 'master' ? (
                <span className="sidebar-panel-badge" style={{ color: '#1d4ed8', backgroundColor: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)' }}>
                  Beta
                </span>
              ) : null}
            </span>
          </div>
          {showCollapseControl && isPanelOpen ? (
            <button
              type="button"
              onClick={() => onTogglePanelOpen(false)}
              className="sidebar-collapse-button"
              style={{
                borderColor: 'var(--border-color)',
                color: selectedAccent,
                backgroundColor:
                  theme === 'dark'
                    ? 'rgba(103,232,249,0.12)'
                    : 'rgba(8,145,178,0.1)',
              }}
              title="Collapse left panel"
            >
              <PanelLeftClose size={14} />
              <span>Hide</span>
            </button>
          ) : null}
        </div>

        {/* Draw Mode Selector (only when draw mode active) */}
        {false && interactionMode === 'draw' && (
          <div className="sidebar-draw-mode" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgba(16,185,129,0.05)' }}>
            <label className="sidebar-draw-mode-label" style={{ color: 'var(--text-muted)' }}>
              Drawing Element
            </label>
            <select
              value={drawElementTag}
              onChange={(e) => setDrawElementTag(e.target.value)}
              className="sidebar-draw-mode-select glass-input"
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
        <div
          className="sidebar-tab-content"
          style={{ overscrollBehavior: 'contain' }}
        >
          {activeTab === 'files' ? (
            <FileExplorer
              files={files}
              projectPath={projectPath}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              onAddFontToPresentationCss={onAddFontToPresentationCss}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRenamePath={onRenamePath}
              onDeletePath={onDeletePath}
              onDuplicateFile={onDuplicateFile}
              onRefreshFiles={onRefreshFiles}
              onOpenProjectFolder={onOpenProjectFolder}
              onOpenCodePanel={onOpenCodePanel}
              selectedFolderCloneSource={selectedFolderCloneSource}
              onChooseFolderCloneSource={onChooseFolderCloneSource}
              theme={theme}
            />
          ) : activeTab === 'images' ? (
            <ImagesPanel files={files} activeFile={activeFile} onLoadImage={onLoadImage} theme={theme} />
          ) : showMasterTools && activeTab === 'master' ? (
            <MasterFeaturePanel files={files} onAddElement={onAddElement} isVisible={isPanelOpen && activeTab === 'master'} theme={theme} />
          ) : activeTab === 'animation' && animationElement ? (
            <div className="sidebar-tab-content sidebar-tab-content--scrollable">
              <div
                className="sidebar-animation-card"
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-glass)',
                }}
              >
                <AnimationControls
                  element={animationElement}
                  onUpdateAnimation={onUpdateAnimation}
                  onUpdateStyle={onUpdateAnimationStyle}
                />
              </div>
            </div>
          ) : (
            <Toolbox onAddElement={onAddElement} />
          )}
        </div>
      </div>
    </div>
  );
};

const hasSameFileList = (prevFiles: FileMap, nextFiles: FileMap): boolean => {
  if (prevFiles === nextFiles) return true;
  const prevKeys = Object.keys(prevFiles);
  const nextKeys = Object.keys(nextFiles);
  if (prevKeys.length !== nextKeys.length) return false;
  const nextSet = new Set(nextKeys);
  for (const key of prevKeys) {
    if (!nextSet.has(key)) return false;
  }
  return true;
};

const areSidebarPropsEqual = (
  prev: Readonly<SidebarProps>,
  next: Readonly<SidebarProps>,
): boolean => {
  return (
    hasSameFileList(prev.files, next.files) &&
    prev.projectPath === next.projectPath &&
    prev.activeFile === next.activeFile &&
    prev.onSelectFile === next.onSelectFile &&
    prev.onAddFontToPresentationCss === next.onAddFontToPresentationCss &&
    prev.onCreateFile === next.onCreateFile &&
    prev.onCreateFolder === next.onCreateFolder &&
    prev.onRenamePath === next.onRenamePath &&
    prev.onDeletePath === next.onDeletePath &&
    prev.onDuplicateFile === next.onDuplicateFile &&
    prev.onRefreshFiles === next.onRefreshFiles &&
    prev.onOpenProjectFolder === next.onOpenProjectFolder &&
    prev.onOpenCodePanel === next.onOpenCodePanel &&
    prev.selectedFolderCloneSource === next.selectedFolderCloneSource &&
    prev.onChooseFolderCloneSource === next.onChooseFolderCloneSource &&
    prev.onAddElement === next.onAddElement &&
    prev.root === next.root &&
    prev.selectedId === next.selectedId &&
    prev.onSelectElement === next.onSelectElement &&
    prev.interactionMode === next.interactionMode &&
    prev.setInteractionMode === next.setInteractionMode &&
    prev.drawElementTag === next.drawElementTag &&
    prev.setDrawElementTag === next.setDrawElementTag &&
    prev.theme === next.theme &&
    prev.showConfigButton === next.showConfigButton &&
    prev.onOpenConfig === next.onOpenConfig &&
    prev.onLoadImage === next.onLoadImage &&
    prev.isPanelOpen === next.isPanelOpen &&
    prev.onTogglePanelOpen === next.onTogglePanelOpen &&
    prev.showMasterTools === next.showMasterTools &&
    prev.animationElement === next.animationElement &&
    prev.isEditModeActive === next.isEditModeActive &&
    prev.onUpdateAnimation === next.onUpdateAnimation &&
    prev.onUpdateAnimationStyle === next.onUpdateAnimationStyle
  );
};

const Sidebar = React.memo(SidebarBase, areSidebarPropsEqual);
Sidebar.displayName = 'Sidebar';

export default Sidebar;
