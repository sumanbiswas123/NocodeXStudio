import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  Folder,
  Image as ImageIcon,
  RefreshCw,
  Save,
  Search,
  X,
  PanelLeft,
} from "lucide-react";
import { FileMap, ProjectFile } from "../types";
import ColorCodeEditor, { CodeLanguage } from "./ColorCodeEditor";
import "./styles/DetachedCodeEditorWindow.css";

interface DetachedCodeEditorWindowProps {
  isOpen: boolean;
  onClose: () => void;
  theme: "light" | "dark";
  files: FileMap;
  activeFilePath: string | null;
  content: string;
  isDirty: boolean;
  onSelectFile: (path: string) => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onReload: () => void;
  isTextEditable: boolean;
  presentationCssPath?: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  fileType?: ProjectFile["type"];
  children: TreeNode[];
}

const normalizePath = (value: string): string =>
  String(value || "").replace(/\\/g, "/");

const splitPath = (value: string): string[] =>
  normalizePath(value).split("/").filter(Boolean);

const fileNameFromPath = (value: string): string => {
  const parts = splitPath(value);
  return parts[parts.length - 1] || value;
};

const isSvgPath = (value: string): boolean =>
  normalizePath(value).toLowerCase().endsWith(".svg");

const buildTree = (files: FileMap): TreeNode[] => {
  const root: TreeNode[] = [];

  const upsertNode = (parts: string[], file: ProjectFile) => {
    let currentLevel = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = currentLevel.find((entry) => entry.name === part);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "folder",
          fileType: isFile ? file.type : undefined,
          children: [],
        };
        currentLevel.push(node);
      }
      if (!isFile) {
        currentLevel = node.children;
      }
    });
  };

  Object.values(files)
    .sort((a, b) => a.path.localeCompare(b.path))
    .forEach((file) => {
      const parts = splitPath(file.path);
      if (!parts.length) return;
      upsertNode(parts, file);
    });

  const finalize = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((node) =>
        node.type === "folder"
          ? { ...node, children: finalize(node.children) }
          : node,
      )
      .sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === "folder" ? -1 : 1;
      });

  return finalize(root);
};

const collectAncestorPaths = (path: string): Set<string> => {
  const parts = splitPath(path);
  const next = new Set<string>();
  for (let index = 0; index < parts.length - 1; index += 1) {
    next.add(parts.slice(0, index + 1).join("/"));
  }
  return next;
};

const iconForFile = (path: string, type: ProjectFile["type"]) => {
  if (type === "image") {
    return isSvgPath(path) ? <FileCode2 size={14} /> : <FileImage size={14} />;
  }
  if (type === "html" || type === "css" || type === "js") {
    return <FileCode2 size={14} />;
  }
  return <File size={14} />;
};

const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;

  return nodes
    .map((node) => {
      if (node.type === "folder") {
        const children = filterTree(node.children, query);
        if (children.length || node.name.toLowerCase().includes(needle)) {
          return { ...node, children };
        }
        return null;
      }
      return node.name.toLowerCase().includes(needle) ? node : null;
    })
    .filter((node): node is TreeNode => Boolean(node));
};

const isRenderableTextFile = (
  file: ProjectFile | null,
  path: string,
): boolean => {
  if (!file) return false;
  if (file.type === "image") return isSvgPath(path);
  return true;
};

const getDisambiguatedTabName = (path: string, allTabs: string[]) => {
  const name = fileNameFromPath(path);
  const hasConflict = allTabs.some(
    (p) => p !== path && fileNameFromPath(p) === name,
  );
  if (hasConflict) {
    const parts = splitPath(path);
    if (parts.length >= 2) {
      return `${name} - ${parts[parts.length - 2]}`;
    }
  }
  return name;
};

function DetachedCodeEditorWindow({
  isOpen,
  onClose,
  theme,
  files,
  activeFilePath,
  content,
  isDirty,
  onSelectFile,
  onChange,
  onSave,
  onReload,
  isTextEditable,
}: DetachedCodeEditorWindowProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const popupRef = useRef<Window | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  const tree = useMemo(() => buildTree(files), [files]);
  const filteredTree = useMemo(
    () => filterTree(tree, searchQuery),
    [searchQuery, tree],
  );
  const activeFile = activeFilePath ? files[activeFilePath] : null;
  const activePathNormalized = activeFilePath
    ? normalizePath(activeFilePath)
    : "";

  const activeImageSrc =
    activeFile?.type === "image" && !isSvgPath(activeFile.path)
      ? typeof activeFile.content === "string"
        ? activeFile.content
        : activeFile.content instanceof Blob
          ? URL.createObjectURL(activeFile.content)
          : ""
      : "";

  const currentLanguage = isSvgPath(activeFilePath || "")
    ? "svg"
    : activeFile?.type === "css" ||
        activeFile?.type === "js" ||
        activeFile?.type === "html"
      ? activeFile.type
      : "text";

  // --- FIX: ONE SINGLE SOURCE OF TRUTH FOR TABS AND FOLDERS ---
  useEffect(() => {
    if (!activePathNormalized) return;

    // Expand the required folders
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      collectAncestorPaths(activePathNormalized).forEach((path) =>
        next.add(path),
      );
      return next;
    });

    // Safely add the tab without causing duplicates
    setOpenTabs((prev) => {
      const existingTabs = prev.filter((path) => files[path]); // Remove deleted files
      if (!existingTabs.includes(activePathNormalized)) {
        return [...existingTabs, activePathNormalized]; // Append only if missing
      }
      return existingTabs; // Do nothing if it's already there
    });
  }, [activePathNormalized, files]);

  useEffect(() => {
    return () => {
      if (activeImageSrc && activeImageSrc.startsWith("blob:")) {
        URL.revokeObjectURL(activeImageSrc);
      }
    };
  }, [activeImageSrc]);

  useEffect(() => {
    if (!isOpen) {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
      containerRef.current = null;
      setIsReady(false);

      // Clean slate on close
      setOpenTabs([]);
      setExpandedFolders(new Set());
      setSearchQuery("");
      return;
    }

    const popup = window.open(
      "",
      "nocodex-editor-window",
      "popup=yes,width=1360,height=900,resizable=yes,scrollbars=yes",
    );
    if (!popup) return;

    popupRef.current = popup;
    popup.document.title = "NoCode X Editor";
    popup.document.body.innerHTML = "";
    popup.document.head.innerHTML = "";

    const mountNode = popup.document.createElement("div");
    mountNode.id = "nocodex-detached-editor-root";
    popup.document.body.appendChild(mountNode);

    const sourceStyles = Array.from(
      document.querySelectorAll("style, link[rel='stylesheet']"),
    );
    sourceStyles.forEach((node) => {
      popup.document.head.appendChild(node.cloneNode(true));
    });

    containerRef.current = mountNode;

    const handleBeforeUnload = () => {
      onClose();
    };
    popup.addEventListener("beforeunload", handleBeforeUnload);
    setIsReady(true);

    return () => {
      popup.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !isReady || !containerRef.current || !popupRef.current)
    return null;

  const handleTabClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    setOpenTabs((prev) => prev.filter((entry) => entry !== path));
    if (normalizePath(path) !== activePathNormalized) return;
    const remaining = openTabs.filter((entry) => entry !== path);
    const next = remaining[remaining.length - 1] ?? null;
    if (next && next !== path) {
      onSelectFile(next);
    }
  };

  const renderTreeNode = (node: TreeNode, depth: number): React.ReactNode => {
    const paddingLeft = `${depth * 16 + 8}px`;

    if (node.type === "folder") {
      const isExpanded =
        expandedFolders.has(node.path) || Boolean(searchQuery.trim());
      return (
        <div key={node.path}>
          <button
            type="button"
            className="nx-tree-item"
            style={{ paddingLeft }}
            onClick={() =>
              setExpandedFolders((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              })
            }
          >
            {isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            <Folder size={14} style={{ opacity: 0.8 }} />
            <span className="nx-truncate">{node.name}</span>
          </button>
          {isExpanded
            ? node.children.map((child) => renderTreeNode(child, depth + 1))
            : null}
        </div>
      );
    }

    const normalizedNodePath = normalizePath(node.path);
    const isActive = activePathNormalized === normalizedNodePath;
    return (
      <button
        key={node.path}
        type="button"
        className={`nx-tree-item ${isActive ? "active" : ""}`}
        style={{ paddingLeft }}
        onClick={() => onSelectFile(node.path)}
      >
        <span
          style={{
            opacity: isActive ? 1 : 0.8,
            display: "flex",
            alignItems: "center",
            marginLeft: "22px",
          }}
        >
          {iconForFile(node.path, node.fileType || "unknown")}
        </span>
        <span className="nx-truncate">{node.name}</span>
      </button>
    );
  };

  const renderBreadcrumbs = () => {
    if (!activeFilePath) return "No file selected";
    const parts = splitPath(activeFilePath);
    return parts.map((part, idx) => (
      <React.Fragment key={idx}>
        <span>{part}</span>
        {idx < parts.length - 1 && (
          <ChevronRight size={10} className="nx-breadcrumb-sep" />
        )}
      </React.Fragment>
    ));
  };

  return createPortal(
    <div className={`nx-root nx-theme-${theme}`}>
      <div
        className="nx-layout-grid"
        style={{
          gridTemplateColumns: isSidebarOpen
            ? "280px minmax(0, 1fr)"
            : "0px minmax(0, 1fr)",
        }}
      >
        <aside className="nx-sidebar">
          <div className="nx-sidebar-header">
            <div className="nx-explorer-title">Explorer</div>
            <div className="nx-explorer-subtitle">Project Files</div>
            <div className="nx-search-box">
              <Search size={14} style={{ opacity: 0.6 }} />
              <input
                type="text"
                className="nx-search-input"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{ opacity: 0.5 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="nx-tree-container nx-scrollbar">
            {filteredTree.length ? (
              filteredTree.map((node) => renderTreeNode(node, 0))
            ) : (
              <div
                className="nx-tree-item"
                style={{ color: "var(--nx-text-muted)" }}
              >
                No files match '{searchQuery}'
              </div>
            )}
          </div>
        </aside>

        <section className="nx-editor-section">
          <div className="nx-editor-header">
            <div className="nx-editor-header-left nx-hide-scroll">
              <button
                type="button"
                className="nx-sidebar-toggle"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
              >
                <PanelLeft size={16} />
              </button>

              {openTabs.length > 0 &&
                openTabs.map((path) => {
                  const normalizedPath = normalizePath(path);
                  const isCurrent = normalizedPath === activePathNormalized;
                  const isCurrentDirty = isCurrent ? isDirty : false;
                  const tabName = getDisambiguatedTabName(path, openTabs);

                  return (
                    <div
                      key={path}
                      className={`nx-tab ${isCurrent ? "active" : ""}`}
                      onClick={() => onSelectFile(path)}
                    >
                      <div className="nx-tab-btn">
                        <span style={{ opacity: isCurrent ? 1 : 0.7 }}>
                          {iconForFile(path, files[path]?.type ?? "unknown")}
                        </span>
                        <span className="nx-truncate">{tabName}</span>
                        {isCurrentDirty ? (
                          <span className="nx-dirty-dot">●</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="nx-tab-close"
                        onClick={(e) => handleTabClose(e, path)}
                        title="Close tab"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="nx-editor-header-right">
              <button
                type="button"
                className="nx-icon-button"
                onClick={onReload}
                title="Reload file"
              >
                <RefreshCw size={14} />
              </button>

              <button
                type="button"
                className={`nx-text-button ${
                  isTextEditable ? "" : "opacity-50"
                }`}
                onClick={() => {
                  if (!activeFilePath || !isTextEditable) return;
                  void onSave();
                }}
                disabled={!isTextEditable}
              >
                <Save size={14} />
                Save
              </button>
            </div>
          </div>

          <div className="nx-breadcrumbs">{renderBreadcrumbs()}</div>

          <div className="nx-workspace">
            {!activeFile ? (
              <div className="nx-center-pane">
                <div className="nx-preview-card">
                  <FileCode2
                    size={48}
                    style={{ margin: "0 auto", opacity: 0.2 }}
                  />
                  <div className="nx-preview-card-title">No file selected</div>
                  <div className="nx-preview-card-subtitle">
                    Open any file from the explorer to begin
                  </div>
                </div>
              </div>
            ) : activeFile.type === "image" && !isSvgPath(activeFile.path) ? (
              <div className="nx-center-pane">
                {activeImageSrc ? (
                  <img
                    src={activeImageSrc}
                    alt={activeFile.name}
                    className="nx-image-preview"
                  />
                ) : (
                  <div className="nx-preview-card">
                    <ImageIcon
                      size={32}
                      style={{ margin: "0 auto", opacity: 0.5 }}
                    />
                    <div className="nx-preview-card-title">
                      Loading image preview...
                    </div>
                  </div>
                )}
              </div>
            ) : isRenderableTextFile(activeFile, activeFile.path) ? (
              isTextEditable ? (
                <ColorCodeEditor
                  value={content}
                  onChange={onChange}
                  language={currentLanguage as CodeLanguage}
                  theme={theme}
                  className="h-full"
                  style={{
                    background: "transparent",
                    height: "100%",
                  }}
                  minHeight="100%"
                />
              ) : (
                <pre className="nx-readonly-text nx-scrollbar">
                  {content || "No content to display"}
                </pre>
              )
            ) : (
              <div className="nx-center-pane">
                <div className="nx-preview-card">
                  <File size={32} className="mx-auto mb-4" />
                  <div className="nx-preview-card-title">
                    Preview not available
                  </div>
                  <div className="nx-preview-card-subtitle">
                    This file type is not supported for preview
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="nx-status-bar">
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                className="nx-status-indicator"
                style={{ backgroundColor: isDirty ? "#f59e0b" : "#10b981" }}
              />
              {activeFile ? String(activeFile.type).toUpperCase() : "READY"}
            </span>
            <span>UTF-8</span>
          </div>
        </section>
      </div>
    </div>,
    containerRef.current,
  );
}

export default DetachedCodeEditorWindow;
