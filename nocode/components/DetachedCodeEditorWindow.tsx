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
} from "lucide-react";
import { FileMap, ProjectFile } from "../types";
import ColorCodeEditor from "./ColorCodeEditor";

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

const pickInitialFile = (files: FileMap): string | null => {
  const ordered = Object.values(files).sort((a, b) => a.path.localeCompare(b.path));
  const preferred = ordered.find(
    (file) =>
      file.type === "html" ||
      file.type === "css" ||
      file.type === "js" ||
      file.type === "image",
  );
  return preferred?.path ?? ordered[0]?.path ?? null;
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

const isRenderableTextFile = (file: ProjectFile | null, path: string): boolean => {
  if (!file) return false;
  if (file.type === "image") return isSvgPath(path);
  return true;
};

const DetachedCodeEditorWindow: React.FC<DetachedCodeEditorWindowProps> = ({
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
}) => {
  const popupRef = useRef<Window | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [openTabs, setOpenTabs] = useState<string[]>([]);

  const tree = useMemo(() => buildTree(files), [files]);
  const filteredTree = useMemo(() => filterTree(tree, search), [search, tree]);
  const activeFile = activeFilePath ? files[activeFilePath] : null;
  const activePathNormalized = activeFilePath ? normalizePath(activeFilePath) : "";
  const activeImageSrc =
    activeFile?.type === "image" &&
    !isSvgPath(activeFile.path) &&
    typeof activeFile.content === "string"
      ? activeFile.content
      : "";

  useEffect(() => {
    if (!isOpen) return;
    if (activeFilePath) return;
    const next = pickInitialFile(files);
    if (next) onSelectFile(next);
  }, [activeFilePath, files, isOpen, onSelectFile]);

  useEffect(() => {
    if (!activePathNormalized) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      collectAncestorPaths(activePathNormalized).forEach((path) => next.add(path));
      return next;
    });
    setOpenTabs((prev) => {
      const next = prev.filter((path) => files[path]);
      if (!next.includes(activePathNormalized)) next.push(activePathNormalized);
      return next;
    });
  }, [activePathNormalized, files]);

  useEffect(() => {
    setOpenTabs((prev) => prev.filter((path) => files[path]));
  }, [files]);

  useEffect(() => {
    if (!isOpen) {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
      containerRef.current = null;
      setIsReady(false);
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
    mountNode.style.height = "100vh";
    popup.document.body.appendChild(mountNode);

    popup.document.documentElement.style.height = "100%";
    popup.document.body.style.margin = "0";
    popup.document.body.style.height = "100vh";
    popup.document.body.style.overflow = "hidden";
    popup.document.body.style.background = theme === "dark" ? "#0b1220" : "#edf2f7";
    popup.document.documentElement.className = document.documentElement.className;
    popup.document.body.className = document.body.className;

    const sourceStyles = Array.from(
      document.querySelectorAll("style, link[rel='stylesheet']"),
    );
    sourceStyles.forEach((node) => {
      popup.document.head.appendChild(node.cloneNode(true));
    });

    const computedRootStyles = window.getComputedStyle(document.documentElement);
    [
      "--bg-app",
      "--bg-panel",
      "--bg-glass",
      "--bg-glass-strong",
      "--border-color",
      "--text-main",
      "--text-muted",
      "--icon-color",
      "--accent-primary",
      "--accent-glow",
      "--glass-shadow",
      "--input-bg",
      "--toolbar-bg",
    ].forEach((name) => {
      const value = computedRootStyles.getPropertyValue(name);
      if (value) {
        popup.document.documentElement.style.setProperty(name, value);
      }
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
  }, [isOpen, onClose, theme]);

  if (!isOpen || !isReady || !containerRef.current || !popupRef.current) return null;

  const handleTabClose = (path: string) => {
    setOpenTabs((prev) => prev.filter((entry) => entry !== path));
    if (normalizePath(path) !== activePathNormalized) return;
    const remaining = openTabs.filter((entry) => entry !== path);
    const next = remaining[remaining.length - 1] ?? pickInitialFile(files);
    if (next && next !== path) {
      onSelectFile(next);
    }
  };

  const renderTreeNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.type === "folder") {
      const isExpanded = expandedFolders.has(node.path) || Boolean(search.trim());
      return (
        <div key={node.path}>
          <button
            type="button"
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
            style={{
              paddingLeft: `${depth * 16 + 12}px`,
              color: "var(--text-main)",
              background: "transparent",
            }}
            onClick={() =>
              setExpandedFolders((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              })
            }
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Folder size={14} />
            <span className="truncate text-sm">{node.name}</span>
          </button>
          {isExpanded ? node.children.map((child) => renderTreeNode(child, depth + 1)) : null}
        </div>
      );
    }

    const normalizedNodePath = normalizePath(node.path);
    const isActive = activePathNormalized === normalizedNodePath;
    return (
      <button
        key={node.path}
        type="button"
        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
        style={{
          paddingLeft: `${depth * 16 + 12}px`,
          color: isActive ? (theme === "dark" ? "#8be9fd" : "#0f766e") : "var(--text-main)",
          background: isActive
            ? theme === "dark"
              ? "rgba(56,189,248,0.16)"
              : "rgba(14,165,233,0.14)"
            : "transparent",
        }}
        onClick={() => onSelectFile(node.path)}
      >
        {iconForFile(node.path, node.fileType || "unknown")}
        <span className="truncate text-sm">{node.name}</span>
      </button>
    );
  };

  return createPortal(
    <div
      className="h-screen w-screen overflow-hidden"
      style={{
        background: theme === "dark" ? "#0b1220" : "#edf2f7",
        color: "var(--text-main)",
      }}
    >
      <div className="grid h-full grid-cols-[52px_320px_minmax(0,1fr)]">
        <aside
          className="border-r flex h-full flex-col items-center py-3"
          style={{
            borderColor: theme === "dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
            background: theme === "dark" ? "#0f172a" : "#e2e8f0",
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: theme === "dark" ? "rgba(56,189,248,0.14)" : "rgba(14,165,233,0.14)",
              color: theme === "dark" ? "#67e8f9" : "#0f766e",
            }}
          >
            <FileCode2 size={18} />
          </div>
        </aside>

        <aside
          className="border-r h-full overflow-hidden flex flex-col"
          style={{
            borderColor: theme === "dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
            background: theme === "dark" ? "#111827" : "#f8fafc",
          }}
        >
          <div
            className="border-b px-4 py-3"
            style={{ borderColor: theme === "dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)" }}
          >
            <div
              className="text-[11px] uppercase tracking-[0.24em]"
              style={{ color: "var(--text-muted)" }}
            >
              Explorer
            </div>
            <div className="mt-1 text-lg font-semibold">Project Files</div>
            <div
              className="mt-3 flex items-center gap-2 rounded-xl border px-3"
              style={{
                borderColor: theme === "dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)",
                background: theme === "dark" ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.96)",
              }}
            >
              <Search size={14} style={{ color: "var(--text-muted)" }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search files"
                className="h-10 w-full bg-transparent text-sm outline-none"
                style={{ color: "var(--text-main)" }}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2 custom-scrollbar">
            {filteredTree.length ? (
              filteredTree.map((node) => renderTreeNode(node, 0))
            ) : (
              <div className="px-3 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No files match this search.
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 h-full flex flex-col">
          <div
            className="border-b px-4 py-2"
            style={{
              borderColor: theme === "dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
              background: theme === "dark" ? "#0f172a" : "#f8fafc",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">
                  {activeFilePath ? fileNameFromPath(activeFilePath) : "No file selected"}
                </div>
                <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {activeFilePath || "Open any file from the explorer"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 w-9 rounded-xl border flex items-center justify-center"
                  style={{
                    borderColor: theme === "dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)",
                    color: "var(--text-main)",
                  }}
                  onClick={onReload}
                  title="Reload file"
                >
                  <RefreshCw size={14} />
                </button>
                {isTextEditable ? (
                  <button
                    type="button"
                    className="h-9 px-3 rounded-xl border flex items-center gap-2"
                    style={{
                      borderColor: theme === "dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)",
                      color: "var(--text-main)",
                    }}
                    onClick={onSave}
                    title="Save file"
                  >
                    <Save size={14} />
                    Save
                  </button>
                ) : null}
                <button
                  type="button"
                  className="h-9 w-9 rounded-xl border flex items-center justify-center"
                  style={{
                    borderColor: theme === "dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)",
                    color: "var(--text-main)",
                  }}
                  onClick={onClose}
                  title="Close editor window"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>

          <div
            className="border-b flex items-end gap-1 overflow-x-auto px-3 pt-2 custom-scrollbar"
            style={{
              borderColor: theme === "dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
              background: theme === "dark" ? "#111827" : "#e2e8f0",
            }}
          >
            {openTabs.map((path) => {
              const isActive = normalizePath(path) === activePathNormalized;
              const isCurrentDirty = isActive ? isDirty : false;
              return (
                <div
                  key={path}
                  className="group flex min-w-[140px] max-w-[240px] items-center gap-2 rounded-t-xl border border-b-0 px-3 py-2 text-sm"
                  style={{
                    background: isActive
                      ? theme === "dark"
                        ? "#0b1220"
                        : "#ffffff"
                      : theme === "dark"
                        ? "rgba(15,23,42,0.92)"
                        : "rgba(248,250,252,0.9)",
                    borderColor: theme === "dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
                    color: isActive ? "var(--text-main)" : "var(--text-muted)",
                  }}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onSelectFile(path)}
                  >
                    {iconForFile(path, files[path]?.type ?? "unknown")}
                    <span className="truncate">{fileNameFromPath(path)}</span>
                    {isCurrentDirty ? <span className="text-[10px]">●</span> : null}
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-0.5 opacity-60 transition-opacity group-hover:opacity-100"
                    onClick={() => handleTabClose(path)}
                    title="Close tab"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          <div
            className="min-h-0 flex-1 overflow-hidden"
            style={{
              background: theme === "dark" ? "#0b1220" : "#ffffff",
            }}
          >
            {!activeFile ? (
              <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
                Select a file from the left explorer.
              </div>
            ) : activeFile.type === "image" && !isSvgPath(activeFile.path) ? (
              <div className="flex h-full items-center justify-center p-8">
                {activeImageSrc ? (
                  <img
                    src={activeImageSrc}
                    alt={activeFile.name}
                    className="max-h-full max-w-full rounded-2xl object-contain shadow-xl"
                  />
                ) : (
                  <div className="text-center">
                    <ImageIcon size={28} className="mx-auto mb-3" />
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                      Loading image preview...
                    </div>
                  </div>
                )}
              </div>
            ) : isRenderableTextFile(activeFile, activeFile.path) ? (
              <ColorCodeEditor
                value={content}
                onChange={isTextEditable ? onChange : () => {}}
                language={
                  isSvgPath(activeFile.path)
                    ? "svg"
                    : activeFile.type === "css" || activeFile.type === "js" || activeFile.type === "html"
                      ? activeFile.type
                      : "html"
                }
                theme={theme}
                className="h-full"
                style={{
                  background: theme === "dark" ? "#0b1220" : "#ffffff",
                  height: "100%",
                }}
                minHeight="100%"
                readOnly={!isTextEditable}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8">
                <div
                  className="max-w-lg rounded-3xl border px-8 py-8 text-center"
                  style={{
                    borderColor: theme === "dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)",
                  }}
                >
                  <div className="text-lg font-semibold">Preview not available</div>
                  <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    This file type is not renderable in the editor yet.
                  </div>
                  <div className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    {activeFile.path}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            className="h-10 shrink-0 px-4 border-t flex items-center justify-between text-xs"
            style={{
              borderColor: theme === "dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
              background: theme === "dark" ? "#0f172a" : "#f8fafc",
              color: "var(--text-muted)",
            }}
          >
            <span>{activeFile ? String(activeFile.type).toUpperCase() : "NO FILE"}</span>
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: isDirty ? "#f59e0b" : "#22c55e",
              }}
              aria-hidden="true"
            />
          </div>
        </section>
      </div>
    </div>,
    containerRef.current,
  );
};

export default DetachedCodeEditorWindow;
