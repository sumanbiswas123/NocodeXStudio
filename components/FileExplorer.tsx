import React, { useEffect, useState, useMemo } from 'react';
import { FileMap, ProjectFile } from '../types';
import { FileText, Image as ImageIcon, FileCode, FileType, FolderOpen, Folder, ChevronRight, ChevronDown } from 'lucide-react';

interface FileExplorerProps {
  files: FileMap;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onAddFontToPresentationCss?: (path: string) => void;
  projectPath: string | null;
  theme: 'light' | 'dark';
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  fileType?: ProjectFile['type'];
  children: Record<string, TreeNode>;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  activeFile,
  onSelectFile,
  onAddFontToPresentationCss,
  projectPath,
  theme,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fontContextMenu, setFontContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (!fontContextMenu) return;
    const close = () => setFontContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [fontContextMenu]);

  useEffect(() => {
    if (!activeFile) return;

    let relativePath = activeFile.replace(/\\/g, '/');
    if (projectPath) {
      const normalizedRoot = projectPath.replace(/\\/g, '/');
      if (relativePath.startsWith(normalizedRoot)) {
        relativePath = relativePath.slice(normalizedRoot.length);
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
      }
    }

    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length <= 1) {
      setExpandedFolders(new Set());
      return;
    }

    const ancestors = new Set<string>();
    for (let i = 0; i < parts.length - 1; i += 1) {
      ancestors.add(parts.slice(0, i + 1).join('/'));
    }
    setExpandedFolders(ancestors);
  }, [activeFile, projectPath]);

  const fileTree = useMemo(() => {
    const root: TreeNode = { name: 'root', path: '', type: 'folder', children: {} };

    (Object.values(files) as ProjectFile[]).forEach((file) => {
      let relativePath = file.path;
      if (projectPath) {
          const normalizedFile = file.path.replace(/\\/g, '/');
          const normalizedRoot = projectPath.replace(/\\/g, '/');
          if (normalizedFile.startsWith(normalizedRoot)) {
              relativePath = normalizedFile.substring(normalizedRoot.length);
              if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
          }
      }
      
      const parts = relativePath.split('/');
      let current = root;

      parts.forEach((part, index) => {
        if (!part) return;
        const isFile = index === parts.length - 1;
        const relativeNodePath = parts.slice(0, index + 1).join('/');

        if (!current.children[part]) {
          const isActuallyFolder = isFile && file.isDirectory;
          current.children[part] = {
            name: part,
            path: isFile ? file.path : relativeNodePath,
            type: (isFile && !isActuallyFolder) ? 'file' : 'folder',
            fileType: (isFile && !isActuallyFolder) ? file.type : undefined,
            children: {}
          };
        }
        current = current.children[part];
      });
    });

    return root;
  }, [files, projectPath]);

  const toggleFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) newExpanded.delete(path);
    else newExpanded.add(path);
    setExpandedFolders(newExpanded);
  };

  const getFileIcon = (type: ProjectFile['type']) => {
    switch (type) {
      case 'html': return <FileCode size={16} style={{ color: '#f97316' }} />;
      case 'css': return <FileType size={16} style={{ color: '#60a5fa' }} />;
      case 'js': return <FileText size={16} style={{ color: '#facc15' }} />;
      case 'image': return <ImageIcon size={16} style={{ color: '#a855f7' }} />;
      default: return <FileText size={16} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const findPreviewFileForFolder = (folderPath: string): string | null => {
    const normalized = folderPath.replace(/\\/g, '/');
    const prefix = normalized ? `${normalized}/` : '';
    const candidates = Object.keys(files).filter((p) =>
      p.replace(/\\/g, '/').startsWith(prefix),
    );
    if (candidates.length === 0) return null;

    const indexHtml = candidates.find(
      (p) => p.toLowerCase() === `${prefix}index.html`,
    );
    if (indexHtml) return indexHtml;

    const firstHtml = candidates.find((p) => p.toLowerCase().endsWith('.html'));
    return firstHtml || null;
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = activeFile === node.path;

    const sortedChildren = (Object.values(node.children) as TreeNode[]).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });

    return (
      <div key={node.path} style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
        {node.path !== '' && (
          <div
            className={`flex items-center gap-1.5 p-1.5 rounded cursor-pointer text-sm mb-0.5 transition-all select-none ${
              isSelected ? 'shadow-sm' : ''
            }`}
            style={{
              backgroundColor: isSelected
                ? (theme === 'dark' ? 'rgba(79, 70, 229, 0.45)' : 'var(--accent-glow)')
                : 'transparent',
              color: isSelected
                ? (theme === 'dark' ? '#eef2ff' : 'var(--accent-primary)')
                : 'var(--text-main)',
              fontWeight: isSelected ? 600 : 400,
              border: isSelected
                ? (theme === 'dark' ? '1px solid rgba(129, 140, 248, 0.55)' : '1px solid transparent')
                : '1px solid transparent'
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor =
                  theme === 'dark' ? 'rgba(148,163,184,0.10)' : 'var(--input-bg)';
              }
            }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
            onClick={(e) => {
              if (node.type === 'folder') {
                toggleFolder(node.path, e);
              } else {
                onSelectFile(node.path);
              }
            }}
            onContextMenu={(e) => {
              if (node.type !== 'file' || node.fileType !== 'font') return;
              e.preventDefault();
              e.stopPropagation();
              setFontContextMenu({
                x: e.clientX,
                y: e.clientY,
                path: node.path,
                name: node.name,
              });
            }}
            title={node.name}
          >
            {node.type === 'folder' && (
              <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
            {node.type === 'folder' ? (
              isExpanded 
                ? <FolderOpen size={16} className="shrink-0" style={{ color: theme === 'dark' ? '#ffffff' : 'var(--accent-primary)' }} /> 
                : <Folder size={16} className="shrink-0" style={{ color: theme === 'dark' ? '#ffffff' : 'var(--accent-primary)' }} />
            ) : (
              <span className="shrink-0" style={{ marginLeft: '22px' }}>
                {getFileIcon(node.fileType as any)}
              </span>
            )}
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{node.name}</span>
          </div>
        )}

        {node.type === 'folder' && (isExpanded || node.path === '') && (
          <div className="ml-2.5" style={{ borderLeft: '1px solid var(--border-color)' }}>
            {sortedChildren.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }}>
      <div className="p-4 font-semibold flex items-center gap-2 text-sm uppercase tracking-wide" style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
        <FolderOpen size={18} />
        <span>Files</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {Object.keys(fileTree.children).length === 0 ? (
          <div className="text-xs text-center mt-10" style={{ color: 'var(--text-muted)' }}>
            No files loaded.<br />Open a project folder.
          </div>
        ) : (
          (Object.values(fileTree.children) as TreeNode[])
            .sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'folder' ? -1 : 1;
            })
            .map(child => renderNode(child, 0))
        )}
      </div>
      {fontContextMenu && (
        <div
          className="fixed z-[4000] min-w-[220px] rounded-lg border shadow-xl backdrop-blur-md p-1"
          style={{
            left: fontContextMenu.x,
            top: fontContextMenu.y,
            backgroundColor: theme === 'dark' ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.96)',
            borderColor: theme === 'dark' ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.3)',
          }}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors"
            style={{
              color: theme === 'dark' ? '#e2e8f0' : '#0f172a',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onAddFontToPresentationCss?.(fontContextMenu.path);
              setFontContextMenu(null);
            }}
          >
            Add @font-face to presentation.css
          </button>
          <div
            className="px-3 pt-1 pb-1 text-[10px]"
            style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}
          >
            {fontContextMenu.name}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
