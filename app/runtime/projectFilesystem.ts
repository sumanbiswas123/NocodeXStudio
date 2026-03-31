import * as Neutralino from "@neutralinojs/lib";
import { FileMap } from "../../types";
import {
  getParentPath,
  IGNORED_FOLDERS,
  inferFileType,
  joinPath,
  normalizePath,
  normalizeProjectRelative,
} from "../helpers/appHelpers";

type IndexedProjectFileResult = {
  files: FileMap;
  absolutePathIndex: Record<string, string>;
};

type OpenProjectIndexResult = IndexedProjectFileResult & {
  sharedDirectoryPath: string | null;
  nearestSharedParent: string | null;
};

const upsertProjectFile = (
  fileMap: FileMap,
  absolutePathIndex: Record<string, string>,
  virtualPath: string,
  absolutePath: string,
  content: string | Blob = "",
) => {
  const normalizedVirtual = normalizeProjectRelative(virtualPath);
  if (!normalizedVirtual || fileMap[normalizedVirtual]) return;
  const name = normalizedVirtual.includes("/")
    ? normalizedVirtual.slice(normalizedVirtual.lastIndexOf("/") + 1)
    : normalizedVirtual;
  fileMap[normalizedVirtual] = {
    path: normalizedVirtual,
    name,
    type: inferFileType(name),
    content,
  };
  absolutePathIndex[normalizedVirtual] = normalizePath(absolutePath);
};

const walkProjectDirectory = async (
  rootPath: string,
  directoryPath: string,
  fileMap: FileMap,
  absolutePathIndex: Record<string, string>,
) => {
  const entries = await (Neutralino as any).filesystem.readDirectory(
    directoryPath,
  );

  for (const entry of entries as Array<{ entry: string; type: string }>) {
    if (!entry?.entry || entry.entry === "." || entry.entry === "..") {
      continue;
    }

    const absolutePath = joinPath(directoryPath, entry.entry);
    if (entry.type === "DIRECTORY") {
      if (IGNORED_FOLDERS.has(entry.entry.toLowerCase())) continue;
      await walkProjectDirectory(rootPath, absolutePath, fileMap, absolutePathIndex);
      continue;
    }
    if (entry.type !== "FILE") continue;

    const normalizedAbsolute = normalizePath(absolutePath);
    const relativePath = normalizedAbsolute
      .replace(`${rootPath}/`, "")
      .replace(rootPath, "")
      .replace(/^\/+/, "");
    if (!relativePath) continue;
    upsertProjectFile(fileMap, absolutePathIndex, relativePath, normalizedAbsolute);
  }
};

const indexSharedDirectory = async (
  sharedRoot: string,
  fileMap: FileMap,
  absolutePathIndex: Record<string, string>,
) => {
  const sharedBase = normalizePath(sharedRoot);
  const walkShared = async (directoryPath: string): Promise<void> => {
    const entries = await (Neutralino as any).filesystem.readDirectory(
      directoryPath,
    );
    for (const entry of entries as Array<{ entry: string; type: string }>) {
      if (!entry?.entry || entry.entry === "." || entry.entry === "..") {
        continue;
      }
      const absolutePath = joinPath(directoryPath, entry.entry);
      if (entry.type === "DIRECTORY") {
        await walkShared(absolutePath);
        continue;
      }
      if (entry.type !== "FILE") continue;
      const normalizedAbsolute = normalizePath(absolutePath);
      const relativeFromShared = normalizedAbsolute
        .replace(`${sharedBase}/`, "")
        .replace(sharedBase, "");
      const sharedVirtual = `shared/${relativeFromShared.replace(/^\/+/, "")}`;
      upsertProjectFile(fileMap, absolutePathIndex, sharedVirtual, normalizedAbsolute);
    }
  };

  await walkShared(sharedBase);
};

export const patchMtVeevaCheck = async (sharedRoot: string): Promise<void> => {
  const mtPath = joinPath(sharedRoot, "js/mt.js");
  let raw = "";
  try {
    raw = await (Neutralino as any).filesystem.readFile(mtPath);
  } catch {
    console.warn(
      "Preview mt.js patch skipped: shared/js/mt.js not found at:",
      mtPath,
    );
    return;
  }
  if (typeof raw !== "string" || raw.length === 0) return;

  const markerStart = "// nocode-x-veeva-bypass:start";
  const markerEnd = "// nocode-x-veeva-bypass:end";
  const markerVersion = "// nocode-x-veeva-bypass:v4";

  const markerBlock = `
  ${markerStart}
  ${markerVersion}
  try {
    var host = (window.location && window.location.hostname) ? window.location.hostname : "";
    var isLocalPreviewHost = (host === "127.0.0.1" || host === "localhost");
    var isInIframe = window.parent && window.parent !== window;
    if (isLocalPreviewHost && isInIframe) {
      try {
        if (!window.__nocodeXPreviewConsoleBridge) {
          window.__nocodeXPreviewConsoleBridge = true;
          var toText = function(v) {
            if (typeof v === "string") return v;
            try { return JSON.stringify(v); } catch (_e) { return String(v); }
          };
          var postToHost = function(level, args, source) {
            if (typeof window.parent.postMessage !== "function") return;
            var msg = Array.prototype.map.call(args || [], toText).join(" ");
            window.parent.postMessage({
              type: "PREVIEW_CONSOLE",
              level: level,
              source: source || "preview",
              message: msg
            }, "*");
          };
          ["log", "info", "warn", "error", "debug"].forEach(function(level) {
            if (!window.console || typeof window.console[level] !== "function") return;
            var original = window.console[level].bind(window.console);
            window.console[level] = function() {
              try { postToHost(level, arguments, "console"); } catch (_e) {}
              return original.apply(window.console, arguments);
            };
          });
          window.addEventListener("error", function(ev) {
            try {
              postToHost("error", [ev.message, ev.filename + ":" + ev.lineno + ":" + ev.colno], "window.onerror");
            } catch (_e) {}
          });
          window.addEventListener("unhandledrejection", function(ev) {
            try {
              var reason = ev && ev.reason ? ev.reason : "Unhandled promise rejection";
              postToHost("error", [reason], "unhandledrejection");
            } catch (_e) {}
          });
        }
      } catch (e) {}
      try {
        if (window.com && com.veeva && com.veeva.clm && typeof com.veeva.clm.isEngage === "function") {
          com.veeva.clm.isEngage = function() { return false; };
        }
      } catch (e) {}
      if (typeof window.parent.postMessage === "function") {
        window.parent.postMessage({
          type: "PREVIEW_PATH_CHANGED",
          path: window.location.pathname || ""
        }, "*");
      }
      try { console.log("[NoCodeX] Preview Veeva bypass active"); } catch (e) {}
      return false;
    }
  } catch (e) {}
  ${markerEnd}
`;

  const patchTargetRegex = /isVeevaEnvironment:\s*function\s*\(\)\s*\{/;
  let patched = raw;

  if (raw.includes(markerStart) && raw.includes(markerEnd)) {
    const startIndex = raw.indexOf(markerStart);
    const endIndex = raw.indexOf(markerEnd, startIndex);
    const existingBlock =
      startIndex >= 0 && endIndex > startIndex
        ? raw.slice(startIndex, endIndex + markerEnd.length)
        : "";
    const isCurrent = existingBlock.includes(markerVersion);
    if (isCurrent) {
      return;
    }
    const endLineIndex = raw.indexOf("\n", endIndex);
    const afterEnd = endLineIndex >= 0 ? endLineIndex + 1 : raw.length;
    patched = `${raw.slice(0, startIndex)}${markerBlock}${raw.slice(afterEnd)}`;
  } else if (patchTargetRegex.test(raw)) {
    patched = raw.replace(
      patchTargetRegex,
      (matched) => `${matched}${markerBlock}`,
    );
  } else {
    console.warn(
      "Preview mt.js patch skipped: isVeevaEnvironment hook not found.",
    );
    return;
  }

  if (patched === raw) return;

  try {
    await (Neutralino as any).filesystem.writeFile(mtPath, patched);
    console.log("[Preview] Applied mt.js Veeva bypass patch:", mtPath);
  } catch (error) {
    console.warn("Preview mt.js patch failed:", error);
  }
};

export const indexProjectForOpen = async (
  rootPath: string,
): Promise<OpenProjectIndexResult> => {
  const normalizedRoot = normalizePath(rootPath);
  const files: FileMap = {};
  const absolutePathIndex: Record<string, string> = {};
  let sharedDirectoryPath: string | null = null;
  let nearestSharedParent: string | null = null;

  await walkProjectDirectory(
    normalizedRoot,
    normalizedRoot,
    files,
    absolutePathIndex,
  );

  let cursor: string | null = normalizedRoot;
  for (let level = 0; level < 10 && cursor; level += 1) {
    const sharedCandidate = joinPath(cursor, "shared");
    try {
      await (Neutralino as any).filesystem.readDirectory(sharedCandidate);
      await indexSharedDirectory(sharedCandidate, files, absolutePathIndex);
      if (!sharedDirectoryPath) {
        sharedDirectoryPath = sharedCandidate;
      }
      if (!nearestSharedParent) {
        nearestSharedParent = cursor;
      }
    } catch {
      // shared directory doesn't exist at this ancestor; continue upward.
    }
    cursor = getParentPath(cursor);
  }

  return {
    files,
    absolutePathIndex,
    sharedDirectoryPath,
    nearestSharedParent,
  };
};

export const refreshProjectFileIndex = async ({
  projectPath,
  previousFileIndex,
  existingFiles,
  textFileCache,
  binaryAssetUrlCache,
}: {
  projectPath: string;
  previousFileIndex: Record<string, string>;
  existingFiles: FileMap;
  textFileCache: Record<string, string>;
  binaryAssetUrlCache: Record<string, string>;
}): Promise<IndexedProjectFileResult> => {
  const rootPath = normalizePath(projectPath);
  const nextFiles: FileMap = {};
  const absolutePathIndex: Record<string, string> = {};

  const upsertFile = (virtualPath: string, absolutePath: string) => {
    const normalizedVirtual = normalizeProjectRelative(virtualPath);
    if (!normalizedVirtual || nextFiles[normalizedVirtual]) return;

    const name = normalizedVirtual.includes("/")
      ? normalizedVirtual.slice(normalizedVirtual.lastIndexOf("/") + 1)
      : normalizedVirtual;
    const oldEntry = existingFiles[normalizedVirtual];
    const cachedText = textFileCache[normalizedVirtual];
    const cachedBinary = binaryAssetUrlCache[normalizedVirtual];
    let content: string | Blob = "";

    if (
      oldEntry &&
      typeof oldEntry.content === "string" &&
      oldEntry.content.length > 0
    ) {
      content = oldEntry.content;
    } else if (typeof cachedText === "string" && cachedText.length > 0) {
      content = cachedText;
    } else if (typeof cachedBinary === "string" && cachedBinary.length > 0) {
      content = cachedBinary;
    }

    upsertProjectFile(
      nextFiles,
      absolutePathIndex,
      normalizedVirtual,
      absolutePath,
      content,
    );
  };

  const walkDirectory = async (directoryPath: string): Promise<void> => {
    const entries = await (Neutralino as any).filesystem.readDirectory(
      directoryPath,
    );
    for (const entry of entries as Array<{ entry: string; type: string }>) {
      if (!entry?.entry || entry.entry === "." || entry.entry === "..") continue;
      const absolutePath = joinPath(directoryPath, entry.entry);
      if (entry.type === "DIRECTORY") {
        if (IGNORED_FOLDERS.has(entry.entry.toLowerCase())) continue;
        await walkDirectory(absolutePath);
        continue;
      }
      if (entry.type !== "FILE") continue;
      const normalizedAbsolute = normalizePath(absolutePath);
      const relativePath = normalizedAbsolute
        .replace(`${rootPath}/`, "")
        .replace(rootPath, "")
        .replace(/^\/+/, "");
      if (!relativePath) continue;
      upsertFile(relativePath, normalizedAbsolute);
    }
  };

  await walkDirectory(rootPath);

  for (const [virtualPath, absolutePath] of Object.entries(previousFileIndex)) {
    if (!virtualPath.toLowerCase().startsWith("shared/")) continue;
    if (absolutePathIndex[virtualPath]) continue;
    try {
      await (Neutralino as any).filesystem.getStats(absolutePath);
      upsertFile(virtualPath, absolutePath);
    } catch {
      // Removed shared file; ignore.
    }
  }

  return { files: nextFiles, absolutePathIndex };
};

export const ensureDirectoryTree = async (absolutePath: string) => {
  const normalized = normalizePath(absolutePath).replace(/[\\/]$/, "");
  if (!normalized) return;
  const parts = normalized.split("/");
  if (parts.length === 0) return;
  let current = "";
  let startIndex = 0;
  if (/^[A-Za-z]:$/.test(parts[0])) {
    current = `${parts[0]}/`;
    startIndex = 1;
  } else if (parts[0] === "") {
    current = "/";
    startIndex = 1;
  } else {
    current = parts[0];
    startIndex = 1;
  }
  for (let index = startIndex; index < parts.length; index += 1) {
    const segment = parts[index];
    if (!segment) continue;
    current = current.replace(/[\\/]$/, "");
    current = `${current}/${segment}`;
    try {
      await (Neutralino as any).filesystem.createDirectory(current);
    } catch {
      // Ignore "already exists" and permission rejections for existing roots.
    }
  }
};

export const ensureDirectoryForFile = async (absoluteFilePath: string) => {
  const parent = getParentPath(normalizePath(absoluteFilePath));
  if (!parent) return;
  await ensureDirectoryTree(parent);
};
