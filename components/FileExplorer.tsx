import React, { useEffect, useMemo, useState } from 'react';
import { FileMap, ProjectFile } from '../types';
import {
  FileText,
  Image as ImageIcon,
  FileCode,
  FileType,
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  RefreshCw,
  Pencil,
  Trash2,
  Copy,
  Code2,
} from 'lucide-react';

interface FileExplorerProps {
  files: FileMap;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onAddFontToPresentationCss?: (path: string) => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onRenamePath?: (path: string) => void;
  onDeletePath?: (path: string, kind: 'file' | 'folder') => void;
  onDuplicateFile?: (path: string) => void;
  onRefreshFiles?: () => void;
  onOpenProjectFolder?: () => void;
  onOpenCodePanel?: () => void;
  selectedFolderCloneSource?: string | null;
  onChooseFolderCloneSource?: () => void;
  projectPath: string | null;
  theme: 'light' | 'dark';
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  fileType?: ProjectFile['type'];
  relativePath: string;
  children: Record<string, TreeNode>;
}

type ExplorerContextMenu = {
  x: number;
  y: number;
  node: TreeNode;
};

const getParentVirtualPath = (path: string): string => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return '';
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalized.slice(0, index);
};

const isSlideFolderPath = (path: string): boolean => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const name = normalized.includes('/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : normalized;
  return /_[0-9]{3,}$/i.test(name);
};

const buildAncestorFolderSet = (path: string): Set<string> => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) return new Set();
  const parts = normalized.split('/').filter(Boolean);
  const next = new Set<string>();
  for (let i = 0; i < parts.length; i += 1) {
    next.add(parts.slice(0, i + 1).join('/'));
  }
  return next;
};

const getCompactNodeLabel = (node: TreeNode): string => {
  const normalizedName = node.name.trim();
  if (node.type === 'folder') {
    const versionSuffixMatch = normalizedName.match(
      /_[A-Za-z]{1,}\d+(?:\.\d+)?_(.+)$/i,
    );
    if (versionSuffixMatch) return versionSuffixMatch[1];

    const suffixMatch = normalizedName.match(/_([^_/]+)$/);
    if (suffixMatch) return suffixMatch[1];
  }
  return normalizedName;
};

const getProjectBaseLabel = (name: string): string => {
  const normalizedName = name.trim();
  const versionPrefixMatch = normalizedName.match(
    /^(.*?_[A-Za-z]{1,}\d+(?:\.\d+)?)_/i,
  );
  return versionPrefixMatch ? versionPrefixMatch[1] : normalizedName;
};

const FileExplorerBase: React.FC<FileExplorerProps> = ({
  files,
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
  projectPath,
  theme,
}) => {
  const useCompactSlideExplorer = true;
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenu | null>(null);
  const currentProjectLabel = useMemo(() => {
    if (!projectPath) return '';
    const normalizedRoot = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const folderName = normalizedRoot.split('/').filter(Boolean).pop() || normalizedRoot;
    return getProjectBaseLabel(folderName);
  }, [projectPath]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  // Handle active file path resolution and auto-scroll
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

    // Keep explorer in accordion mode: only the active file's folder chain stays open.
    if (parts.length > 1) {
      const folderChain = parts.slice(0, parts.length - 1).join('/');
      setExpandedFolders(buildAncestorFolderSet(folderChain));
    }

    // Attempt to scroll the active file into view smoothly
    const scrollTimer = setTimeout(() => {
      try {
        const safeId = `file-node-${relativePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const el = document.getElementById(safeId);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } catch (err) {
        // Ignore scroll errors
      }
    }, 100);

    return () => clearTimeout(scrollTimer);
  }, [activeFile, projectPath]);

  const fileTree = useMemo(() => {
    const root: TreeNode = { name: 'root', path: '', type: 'folder', relativePath: '', children: {} };

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

      if (/(^|\/)shared(\/|$)/i.test(relativePath)) {
        return;
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
            path: relativeNodePath,
            type: isFile && !isActuallyFolder ? 'file' : 'folder',
            fileType: isFile && !isActuallyFolder ? file.type : undefined,
            relativePath: relativeNodePath,
            children: {},
          };
        }
        current = current.children[part];
      });
    });

    return root;
  }, [files, projectPath]);

  const selectedMainFolderLabel = useMemo(() => {
    if (!activeFile) return '';
    let relativePath = activeFile.replace(/\\/g, '/');
    if (projectPath) {
      const normalizedRoot = projectPath.replace(/\\/g, '/');
      if (relativePath.startsWith(normalizedRoot)) {
        relativePath = relativePath.slice(normalizedRoot.length);
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
      }
    }

    const [topFolder] = relativePath.split('/').filter(Boolean);
    if (!topFolder) return '';
    return getProjectBaseLabel(topFolder);
  }, [activeFile, projectPath]);

  const compactSlideFolders = useMemo(() => {
    const slideMap = new Map<string, { folderKey: string; label: string; path: string; sortKey: number; isNumeric: boolean }>();

    (Object.values(files) as ProjectFile[]).forEach((file) => {
      if (file.isDirectory || file.type !== 'html') return;

      let relativePath = file.path.replace(/\\/g, '/');
      if (projectPath) {
        const normalizedRoot = projectPath.replace(/\\/g, '/');
        if (relativePath.startsWith(normalizedRoot)) {
          relativePath = relativePath.slice(normalizedRoot.length);
          if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
        }
      }

      if (/(^|\/)shared(\/|$)/i.test(relativePath)) return;

      const parts = relativePath.split('/').filter(Boolean);
      if (parts.length < 2) return;

      const folderKey = parts[0];
      const displayLabel = getCompactNodeLabel({
        name: folderKey,
        path: folderKey,
        type: 'folder',
        relativePath: folderKey,
        children: {},
      });
      const sortKey = Number.parseFloat(displayLabel);
      const isNumeric = /^[0-9]+(?:\.[0-9]+)?$/.test(displayLabel);
      const existing = slideMap.get(folderKey);
      const isBetterPath =
        parts[parts.length - 1].toLowerCase() === 'index.html' &&
        (!existing || !existing.path.replace(/\\/g, '/').toLowerCase().endsWith('/index.html'));

      if (!existing || isBetterPath) {
        slideMap.set(folderKey, {
          folderKey,
          label: displayLabel,
          path: file.path,
          sortKey: Number.isFinite(sortKey) ? sortKey : Number.MAX_SAFE_INTEGER,
          isNumeric,
        });
      }
    });

    return Array.from(slideMap.values()).sort((a, b) => {
      if (a.isNumeric !== b.isNumeric) return a.isNumeric ? -1 : 1;
      if (a.isNumeric && b.isNumeric && a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.label.localeCompare(b.label);
    });
  }, [files, projectPath]);

  const activeCompactSlide = useMemo(() => {
    let normalizedActive = (activeFile || '').replace(/\\/g, '/');
    if (projectPath) {
      const normalizedRoot = projectPath.replace(/\\/g, '/');
      if (normalizedActive.startsWith(normalizedRoot)) {
        normalizedActive = normalizedActive.slice(normalizedRoot.length);
        if (normalizedActive.startsWith('/')) normalizedActive = normalizedActive.slice(1);
      }
    }
    return compactSlideFolders.find((entry) => {
      let entryPath = entry.path.replace(/\\/g, '/');
      if (projectPath) {
        const normalizedRoot = projectPath.replace(/\\/g, '/');
        if (entryPath.startsWith(normalizedRoot)) {
          entryPath = entryPath.slice(normalizedRoot.length);
          if (entryPath.startsWith('/')) entryPath = entryPath.slice(1);
        }
      }
      return normalizedActive === entryPath || normalizedActive.startsWith(`${entry.folderKey}/`);
    })?.folderKey || '';
  }, [activeFile, compactSlideFolders, projectPath]);

  const toggleFolder = (path: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (expandedFolders.has(path)) {
      setExpandedFolders(new Set());
      return;
    }
    setExpandedFolders(buildAncestorFolderSet(path));
  };

  const findPreferredHtmlPath = (folderNode: TreeNode): string | null => {
    const children = Object.values(folderNode.children) as TreeNode[];
    const directFiles = children
      .filter((child) => child.type === 'file' && child.fileType === 'html')
      .sort((a, b) => a.name.localeCompare(b.name));

    const directIndex = directFiles.find((file) => file.name.toLowerCase() === 'index.html');
    if (directIndex) return directIndex.path;
    if (directFiles.length > 0) return directFiles[0].path;

    const subFolders = children
      .filter((child) => child.type === 'folder')
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const sub of subFolders) {
      const nested = findPreferredHtmlPath(sub);
      if (nested) return nested;
    }
    return null;
  };

  const getFileIcon = (type: ProjectFile['type']) => {
    switch (type) {
      case 'html':
        return <FileCode size={16} style={{ color: '#f97316' }} />;
      case 'css':
        return <FileType size={16} style={{ color: '#60a5fa' }} />;
      case 'js':
        return <FileText size={16} style={{ color: '#facc15' }} />;
      case 'image':
        return <ImageIcon size={16} style={{ color: '#a855f7' }} />;
      default:
        return <FileText size={16} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expandedFolders.has(node.path);

    const isSelected = Boolean(
      activeFile &&
      activeFile.replace(/\\/g, '/') === node.path.replace(/\\/g, '/')
    );

    const sortedChildren = (Object.values(node.children) as TreeNode[]).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });

    return (
      <div key={node.path} style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
        {node.path !== '' && (
          <div
            id={`file-node-${node.path.replace(/[^a-zA-Z0-9]/g, '-')}`}
            className={`flex items-center gap-1.5 p-1.5 rounded cursor-pointer text-sm mb-0.5 transition-all select-none ${isSelected ? 'shadow-sm' : ''
              }`}
            style={{
              backgroundColor: isSelected
                ? theme === 'dark'
                  ? 'rgba(79, 70, 229, 0.45)'
                  : 'var(--accent-glow)'
                : 'transparent',
              color: isSelected
                ? theme === 'dark'
                  ? '#eef2ff'
                  : 'var(--accent-primary)'
                : 'var(--text-main)',
              fontWeight: isSelected ? 600 : 400,
              border: isSelected
                ? theme === 'dark'
                  ? '1px solid rgba(129, 140, 248, 0.55)'
                  : '1px solid transparent'
                : '1px solid transparent',
            }}
            onMouseEnter={(event) => {
              if (!isSelected) {
                event.currentTarget.style.backgroundColor =
                  theme === 'dark' ? 'rgba(148,163,184,0.10)' : 'var(--input-bg)';
              }
            }}
            onMouseLeave={(event) => {
              if (!isSelected) event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={(event) => {
              if (node.type === 'folder') {
                toggleFolder(node.path, event);
                const nextHtml = findPreferredHtmlPath(node);
                if (nextHtml) onSelectFile(nextHtml);
              } else {
                onSelectFile(node.path);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                node,
              });
            }}
            title={node.relativePath || node.name}
          >
            {node.type === 'folder' && (
              <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
            {node.type === 'folder' ? (
              isExpanded ? (
                <FolderOpen
                  size={16}
                  className="shrink-0"
                  style={{ color: theme === 'dark' ? '#ffffff' : 'var(--accent-primary)' }}
                />
              ) : (
                <Folder
                  size={16}
                  className="shrink-0"
                  style={{ color: theme === 'dark' ? '#ffffff' : 'var(--accent-primary)' }}
                />
              )
            ) : (
              <span className="shrink-0" style={{ marginLeft: '22px' }}>
                {getFileIcon(node.fileType as any)}
              </span>
            )}
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {getCompactNodeLabel(node)}
            </span>
          </div>
        )}

        {node.type === 'folder' && (isExpanded || node.path === '') && (
          <div className="ml-2.5" style={{ borderLeft: '1px solid var(--border-color)' }}>
            {sortedChildren.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const contextNode = contextMenu?.node ?? null;
  const contextIsFolder = contextNode?.type === 'folder';
  const contextFolderPath = contextNode
    ? contextNode.type === 'folder'
      ? contextNode.path
      : getParentVirtualPath(contextNode.path)
    : '';
  const canDuplicate = contextNode?.type === 'file';
  const canAddFontFace =
    contextNode?.type === 'file' &&
    contextNode.fileType === 'font' &&
    typeof onAddFontToPresentationCss === 'function';

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }}>
      <div
        className="px-2.5 py-2 border-b flex items-center gap-2"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          type="button"
          className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center transition-colors"
          style={{
            background: 'rgba(14,165,233,0.12)',
            color: 'var(--text-main)',
            border: '1px solid rgba(14,165,233,0.22)',
          }}
          onClick={() => onOpenProjectFolder?.()}
          title={projectPath ? 'Select another presentation' : 'Select presentation'}
        >
          <FolderOpen size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[10px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {currentProjectLabel || 'No presentation selected'}
          </div>
        </div>
        {projectPath ? (
          <button
            type="button"
            className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: 'rgba(99,102,241,0.1)',
              color: 'var(--text-main)',
              border: '1px solid rgba(99,102,241,0.2)',
            }}
            onClick={() => onOpenCodePanel?.()}
            title="Open code panel"
          >
            <Code2 size={14} />
          </button>
        ) : null}
        <button
          type="button"
          title={selectedFolderCloneSource ? `Clone ${selectedFolderCloneSource}` : 'Choose folder to clone'}
          className="h-8 w-8 shrink-0 rounded-lg hover:bg-black/10 transition-colors flex items-center justify-center"
          onClick={() => {
            if (selectedFolderCloneSource) {
              onCreateFolder?.('');
              return;
            }
            onChooseFolderCloneSource?.();
          }}
        >
          <FolderPlus size={14} />
        </button>
        <button
          type="button"
          title="Refresh File Index"
          className="h-8 w-8 shrink-0 rounded-lg hover:bg-black/10 transition-colors flex items-center justify-center"
          onClick={() => onRefreshFiles?.()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {!useCompactSlideExplorer && selectedMainFolderLabel ? (
        <div
          className="px-3 py-1.5 text-[10px] uppercase tracking-[0.16em]"
          style={{
            borderBottom: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
          }}
        >
          {selectedMainFolderLabel}
        </div>
      ) : null}
      <div
        className="flex-1 min-h-0 overflow-y-auto p-2 custom-scrollbar"
        style={{ overscrollBehavior: 'contain' }}
      >
        {useCompactSlideExplorer ? (
          compactSlideFolders.length === 0 ? (
            <div className="text-xs text-center mt-10" style={{ color: 'var(--text-muted)' }}>
              No slide folders found.
            </div>
          ) : (
            <div className="space-y-1">
              {compactSlideFolders.map((entry) => {
                const isSelected = activeCompactSlide === entry.folderKey;
                return (
                  <button
                    key={entry.folderKey}
                    type="button"
                    className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors"
                    style={{
                      backgroundColor: isSelected
                        ? theme === 'dark'
                          ? 'rgba(79, 70, 229, 0.45)'
                          : 'var(--accent-glow)'
                        : 'transparent',
                      color: isSelected
                        ? theme === 'dark'
                          ? '#eef2ff'
                          : 'var(--accent-primary)'
                        : 'var(--text-main)',
                      border: isSelected
                        ? theme === 'dark'
                          ? '1px solid rgba(129, 140, 248, 0.55)'
                          : '1px solid rgba(8,145,178,0.16)'
                        : '1px solid transparent',
                    }}
                    onClick={() => onSelectFile(entry.path)}
                    title={entry.folderKey}
                  >
                    <Folder size={15} className="shrink-0" />
                    <span className="text-sm font-medium tracking-[0.12em]">
                      {entry.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )
        ) : Object.keys(fileTree.children).length === 0 ? (
          <div className="text-xs text-center mt-10" style={{ color: 'var(--text-muted)' }}>
            No files loaded.
            <br />
            Open a project folder.
          </div>
        ) : (
          (Object.values(fileTree.children) as TreeNode[])
            .sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'folder' ? -1 : 1;
            })
            .map((child) => renderNode(child, 0))
        )}
      </div>
      {contextMenu && contextNode && (
        <div
          className="fixed z-[4000] min-w-[220px] rounded-lg border shadow-xl backdrop-blur-md p-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: theme === 'dark' ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.96)',
            borderColor: theme === 'dark' ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.3)',
          }}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
            style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              if (selectedFolderCloneSource) {
                onCreateFolder?.(contextFolderPath);
              } else {
                onChooseFolderCloneSource?.();
              }
              setContextMenu(null);
            }}
          >
            <FolderPlus size={13} />
            {selectedFolderCloneSource ? 'Clone Folder Here' : 'Choose Folder To Clone'}
          </button>
          {canDuplicate && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
              style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor =
                  theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => {
                onDuplicateFile?.(contextNode.path);
                setContextMenu(null);
              }}
            >
              <Copy size={13} />
              Duplicate
            </button>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
            style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onRenamePath?.(contextNode.path);
              setContextMenu(null);
            }}
          >
            <Pencil size={13} />
            Rename
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
            style={{ color: '#ef4444' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                theme === 'dark' ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onDeletePath?.(contextNode.path, contextIsFolder ? 'folder' : 'file');
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} />
            Delete
          </button>
          {canAddFontFace && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors"
              style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor =
                  theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => {
                onAddFontToPresentationCss?.(contextNode.path);
                setContextMenu(null);
              }}
            >
              Add @font-face to presentation.css
            </button>
          )}
          <div className="px-3 pt-1 pb-1 text-[10px]" style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
            {contextNode.name}
          </div>
        </div>
      )}
    </div>
  );
};

const hasSameFileStructure = (prevFiles: FileMap, nextFiles: FileMap): boolean => {
  if (prevFiles === nextFiles) return true;
  const prevKeys = Object.keys(prevFiles);
  const nextKeys = Object.keys(nextFiles);
  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    const prev = prevFiles[key];
    const next = nextFiles[key];
    if (!prev || !next) return false;
    if (
      prev.path !== next.path ||
      prev.name !== next.name ||
      prev.type !== next.type ||
      Boolean(prev.isDirectory) !== Boolean(next.isDirectory)
    ) {
      return false;
    }
  }
  return true;
};

const areFileExplorerPropsEqual = (
  prev: Readonly<FileExplorerProps>,
  next: Readonly<FileExplorerProps>,
): boolean => {
  return (
    hasSameFileStructure(prev.files, next.files) &&
    prev.activeFile === next.activeFile &&
    prev.projectPath === next.projectPath &&
    prev.theme === next.theme &&
    prev.onSelectFile === next.onSelectFile &&
    prev.onAddFontToPresentationCss === next.onAddFontToPresentationCss &&
    prev.onCreateFile === next.onCreateFile &&
    prev.onCreateFolder === next.onCreateFolder &&
    prev.onRenamePath === next.onRenamePath &&
    prev.onDeletePath === next.onDeletePath &&
    prev.onDuplicateFile === next.onDuplicateFile &&
    prev.onRefreshFiles === next.onRefreshFiles
  );
};

const FileExplorer = React.memo(FileExplorerBase, areFileExplorerPropsEqual);
FileExplorer.displayName = 'FileExplorer';

export default FileExplorer;
