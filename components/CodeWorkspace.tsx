import React, { useMemo, useState } from "react";
import {
  FileCode2,
  FileJson2,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Save,
  Search,
  FolderTree,
  ChevronDown,
  ChevronRight,
  Code2,
} from "lucide-react";
import ColorCodeEditor from "./ColorCodeEditor";

type CodeFileKind = "html" | "css" | "js" | "svg" | "json";

interface CodeWorkspaceProps {
  filePath: string | null;
  content: string;
  isDirty: boolean;
  theme?: "light" | "dark";
  availableFiles: string[];
  onSelectFile: (path: string) => void;
  onChange: (value: string | undefined) => void;
  onSave: () => void;
  onReload: () => void;
  showSidebar?: boolean; // Optional: hide sidebar for modal/embedded usage
}

// Helper to determine language for Monaco based on extension
const getLanguageFromPath = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
      return "javascript";
    case "ts":
      return "typescript";
    case "css":
      return "css";
    case "html":
      return "html";
    case "json":
      return "json";
    case "svg":
      return "xml";
    default:
      return "plaintext";
  }
};

const getIconForFile = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "ts":
      return <FileJson2 size={16} className="text-yellow-400" />;
    case "css":
      return <FileCode2 size={16} className="text-blue-400" />;
    case "html":
      return <FileText size={16} className="text-orange-400" />;
    case "svg":
      return <ImageIcon size={16} className="text-purple-400" />;
    default:
      return <Code2 size={16} className="text-gray-400" />;
  }
};

export default function CodeWorkspace({
  filePath,
  content,
  isDirty,
  theme = "dark",
  availableFiles,
  onSelectFile,
  onChange,
  onSave,
  onReload,
  showSidebar = true,
}: CodeWorkspaceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(showSidebar);

  // Filter files based on search
  const filteredFiles = useMemo(() => {
    if (!searchTerm) return availableFiles;
    return availableFiles.filter((file) =>
      file.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [availableFiles, searchTerm]);

  const fileName = filePath ? filePath.split("/").pop() : "No file selected";
  const language = filePath ? getLanguageFromPath(filePath) : "plaintext";
  const isDark = theme === "dark";

  return (
    <div
      className={`flex h-full w-full overflow-hidden font-sans ${isDark ? "bg-[#1e1e1e] text-gray-300" : "bg-gray-50 text-gray-800"}`}
    >
      {/* Sidebar Navigation */}
      {showSidebar && isSidebarOpen && (
        <aside
          className={`flex flex-col w-64 border-r ${isDark ? "bg-[#252526] border-[#333]" : "bg-white border-gray-200"}`}
        >
          {/* Sidebar Header */}
          <div
            className={`p-3 border-b flex items-center gap-2 ${isDark ? "border-[#333]" : "border-gray-200"}`}
          >
            <FolderTree size={18} className="text-gray-400" />
            <span className="text-sm font-semibold tracking-wide uppercase text-gray-400">
              Explorer
            </span>
          </div>

          {/* Search Bar */}
          <div className="p-3">
            <div
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${isDark ? "bg-[#3c3c3c] border-transparent focus-within:border-blue-500" : "bg-gray-100 border-gray-200 focus-within:border-blue-400"}`}
            >
              <Search size={14} className="text-gray-400" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full"
              />
            </div>
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto py-2">
            {filteredFiles.length === 0 ? (
              <div className="text-xs text-center text-gray-500 mt-4">
                No matching files
              </div>
            ) : (
              filteredFiles.map((file) => {
                const isActive = file === filePath;
                return (
                  <button
                    key={file}
                    onClick={() => onSelectFile(file)}
                    className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left transition-colors
                      ${
                        isActive
                          ? isDark
                            ? "bg-[#37373d] text-white"
                            : "bg-blue-50 text-blue-700"
                          : isDark
                            ? "hover:bg-[#2a2d2e]"
                            : "hover:bg-gray-100"
                      }
                    `}
                  >
                    {getIconForFile(file)}
                    <span className="truncate">{file.split("/").pop()}</span>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* Main Editor Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Action Bar */}
        <header
          className={`flex items-center justify-between px-4 py-2 border-b ${isDark ? "bg-[#1e1e1e] border-[#333]" : "bg-white border-gray-200"}`}
        >
          <div className="flex items-center gap-3">
            {showSidebar && (
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`p-1 rounded-md transition-colors ${isDark ? "hover:bg-[#333]" : "hover:bg-gray-100"}`}
                title="Toggle Sidebar"
              >
                <FolderTree size={18} className="text-gray-400" />
              </button>
            )}

            {/* Active File Tab */}
            {filePath && (
              <div className="flex items-center gap-2 px-3 py-1 bg-opacity-10 rounded-md bg-blue-500">
                {getIconForFile(filePath)}
                <span
                  className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-700"}`}
                >
                  {fileName}
                  {isDirty && (
                    <span className="ml-1 text-blue-400 font-bold">*</span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onReload}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border
                ${isDark ? "bg-[#2d2d2d] border-[#444] hover:bg-[#3d3d3d]" : "bg-white border-gray-300 hover:bg-gray-50"}`}
            >
              <RefreshCw size={14} /> Reload
            </button>
            <button
              onClick={onSave}
              disabled={!isDirty}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors shadow-sm
                ${
                  isDirty
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : isDark
                      ? "bg-[#2d2d2d] text-gray-500 cursor-not-allowed"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
            >
              <Save size={14} /> Save
            </button>
          </div>
        </header>

        {/* Monaco Editor Container */}
        <div className="flex-1 relative">
          {filePath ? (
            <></>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Code2 size={48} className="mx-auto mb-4 opacity-20" />
                <p>Select a file from the explorer to start coding.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
