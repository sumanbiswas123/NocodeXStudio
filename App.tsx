import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";
import Sidebar from "./components/Sidebar";
import EditorCanvas from "./components/EditorCanvas";
import PropertiesPanel from "./components/PropertiesPanel";
import StyleInspectorPanel from "./components/StyleInspectorPanel";
import Terminal from "./components/Terminal";
import CodeViewer from "./components/CodeViewer";
import CommandPalette from "./components/CommandPalette";
import TitleBar from "./components/TitleBar";
import { INITIAL_ROOT, INJECTED_STYLES } from "./constants";
import {
  VirtualElement,
  ElementType,
  FileMap,
  HistoryState,
  ProjectFile,
} from "./types";
import * as Neutralino from "@neutralinojs/lib";
import {
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Maximize2,
  Minimize2,
  Command,
  Play,
  Tablet,
  RotateCw,
  FolderOpen,
  Globe,
  Wifi,
  Sun,
  Moon,
  Save,
  Undo2,
  Redo2,
  Settings2,
} from "lucide-react";

// --- Helper Functions (Same as before) ---
const findElementById = (
  root: VirtualElement,
  id: string,
): VirtualElement | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findElementById(child, id);
    if (found) return found;
  }
  return null;
};

const collectPathIdsToElement = (
  root: VirtualElement,
  id: string | null,
): Set<string> | null => {
  if (!id) return null;
  const path: string[] = [];
  const walk = (node: VirtualElement): boolean => {
    if (node.id === id) {
      path.push(node.id);
      return true;
    }
    for (const child of node.children) {
      if (walk(child)) {
        path.push(node.id);
        return true;
      }
    }
    return false;
  };
  if (!walk(root)) return null;
  return new Set(path);
};

const updateElementInTree = (
  root: VirtualElement,
  id: string,
  updater: (el: VirtualElement) => VirtualElement,
): VirtualElement => {
  if (root.id === id) {
    const updated = updater(root);
    return updated === root ? root : updated;
  }
  let didChange = false;
  const nextChildren = root.children.map((child) => {
    const updatedChild = updateElementInTree(child, id, updater);
    if (updatedChild !== child) {
      didChange = true;
    }
    return updatedChild;
  });
  if (!didChange) return root;
  return { ...root, children: nextChildren };
};

const deleteElementFromTree = (
  root: VirtualElement,
  id: string,
): VirtualElement => {
  let didChange = false;
  const nextChildren: VirtualElement[] = [];
  for (const child of root.children) {
    if (child.id === id) {
      didChange = true;
      continue;
    }
    const updatedChild = deleteElementFromTree(child, id);
    if (updatedChild !== child) {
      didChange = true;
    }
    nextChildren.push(updatedChild);
  }
  if (!didChange) return root;
  return { ...root, children: nextChildren };
};

const normalizePath = (path: string): string => path.replace(/\\/g, "/");
const PREVIEW_MOUNT_PATH = "/__vh__";
const SHARED_MOUNT_PATH = "/shared";
const SHARED_MOUNT_PATH_IN_PREVIEW = "/__vh__/shared";

const joinPath = (base: string, entry: string): string =>
  `${base.replace(/[\\/]$/, "")}/${entry}`;

const getParentPath = (path: string): string | null => {
  const normalized = normalizePath(path).replace(/[\\/]$/, "");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return null;
  return normalized.slice(0, idx);
};

const IGNORED_FOLDERS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);
const THEME_STORAGE_KEY = "nocode-x-studio-theme";
const PREVIEW_AUTOSAVE_STORAGE_KEY = "nocode-x-studio-preview-autosave";
const MAX_CANVAS_HISTORY = 80;
const MAX_PREVIEW_HISTORY = 60;
const MAX_PREVIEW_CONSOLE_ENTRIES = 400;
const MAX_PREVIEW_DOC_CACHE_ENTRIES = 8;
const MAX_PREVIEW_DOC_CACHE_CHARS = 2_500_000;
const SHARED_FONT_VIRTUAL_DIR = "shared/media/fonts";
const PRESENTATION_CSS_VIRTUAL_PATH = "shared/css/presentation.css";
const FONT_CACHE_VIRTUAL_PATH = "shared/js/nocodex-fonts.json";
const FONT_CACHE_VERSION = 1;
const DEFAULT_EDITOR_FONTS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Impact",
  "sans-serif",
  "serif",
  "monospace",
];
const PREVIEW_DRAW_ALLOWED_TAGS = new Set([
  "div",
  "section",
  "p",
  "span",
  "h1",
  "h2",
  "h3",
  "button",
  "img",
]);
const normalizePreviewDrawTag = (raw: string): string => {
  const next = String(raw || "")
    .trim()
    .toLowerCase();
  if (PREVIEW_DRAW_ALLOWED_TAGS.has(next)) return next;
  return "div";
};

type FontCachePayload = {
  version: number;
  source: "presentation.css";
  generatedAt: string;
  fonts: string[];
};

const sanitizeFontFamilyName = (raw: string): string =>
  String(raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();

const dedupeFontFamilies = (families: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of families) {
    const normalized = sanitizeFontFamilyName(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
};

const buildEditorFontOptions = (projectFamilies: string[]): string[] =>
  dedupeFontFamilies([...projectFamilies, ...DEFAULT_EDITOR_FONTS]);

const parsePresentationCssFontFamilies = (cssContent: string): string[] => {
  if (!cssContent) return [];
  const out: string[] = [];
  const faceRegex = /@font-face\s*\{[\s\S]*?\}/gi;
  let blockMatch: RegExpExecArray | null = null;
  while ((blockMatch = faceRegex.exec(cssContent)) !== null) {
    const block = blockMatch[0];
    const familyMatch = block.match(/font-family\s*:\s*([^;]+);/i);
    if (!familyMatch) continue;
    out.push(sanitizeFontFamilyName(familyMatch[1]));
  }
  return dedupeFontFamilies(out);
};

const parseFontCacheFamilies = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw) as Partial<FontCachePayload> | null;
    if (!parsed || !Array.isArray(parsed.fonts)) return [];
    return dedupeFontFamilies(parsed.fonts.map((item) => String(item || "")));
  } catch {
    return [];
  }
};

const deriveFontFamilyFromFontFileName = (fileName: string): string => {
  const base = String(fileName || "").replace(/\.[^.]+$/, "");
  const normalized = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || base || "Custom Font";
};

const fontFormatFromFileName = (fileName: string): string => {
  const ext =
    String(fileName || "")
      .split(".")
      .pop()
      ?.toLowerCase() || "";
  if (ext === "woff2") return "woff2";
  if (ext === "woff") return "woff";
  if (ext === "ttf") return "truetype";
  if (ext === "otf") return "opentype";
  if (ext === "eot") return "embedded-opentype";
  return ext || "truetype";
};

const relativePathBetweenVirtualFiles = (
  fromFilePath: string,
  toFilePath: string,
): string => {
  const fromParts = normalizeProjectRelative(fromFilePath)
    .split("/")
    .filter(Boolean);
  const toParts = normalizeProjectRelative(toFilePath)
    .split("/")
    .filter(Boolean);
  if (fromParts.length > 0) fromParts.pop();
  let pivot = 0;
  while (
    pivot < fromParts.length &&
    pivot < toParts.length &&
    fromParts[pivot].toLowerCase() === toParts[pivot].toLowerCase()
  ) {
    pivot += 1;
  }
  const upward = new Array(Math.max(0, fromParts.length - pivot)).fill("..");
  const downward = toParts.slice(pivot);
  const combined = [...upward, ...downward].join("/");
  return combined || toParts[toParts.length - 1] || "";
};

const collectSharedFontFamiliesFromFileMap = (fileMap: FileMap): string[] =>
  dedupeFontFamilies(
    Object.values(fileMap)
      .filter((file) => {
        if (file.type !== "font") return false;
        const normalized = normalizeProjectRelative(file.path).toLowerCase();
        return normalized.startsWith(`${SHARED_FONT_VIRTUAL_DIR}/`);
      })
      .map((file) => deriveFontFamilyFromFontFileName(file.name)),
  );

const inferFileType = (name: string): ProjectFile["type"] => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".js")) return "js";
  if (lower.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return "image";
  if (lower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return "font";
  return "unknown";
};

const toFileUrl = (absolutePath: string): string => {
  const normalized = normalizePath(absolutePath);
  return normalized.startsWith("/")
    ? `file://${normalized}`
    : `file:///${normalized}`;
};

const mimeFromType = (type: ProjectFile["type"], fileName: string): string => {
  if (type === "image") {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "svg") return "image/svg+xml";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    return "image/png";
  }
  if (type === "font") {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "woff2") return "font/woff2";
    if (ext === "woff") return "font/woff";
    if (ext === "ttf") return "font/ttf";
    if (ext === "otf") return "font/otf";
    if (ext === "eot") return "application/vnd.ms-fontobject";
    return "application/octet-stream";
  }
  return "application/octet-stream";
};

const toByteArray = (value: any): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value?.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer);
  return new Uint8Array();
};

const isExternalUrl = (raw: string): boolean =>
  /^(https?:|data:|blob:|mailto:|tel:|#|javascript:)/i.test(raw);

const normalizeProjectRelative = (rawPath: string): string => {
  const normalized = rawPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
};

const resolveProjectRelativePath = (
  currentFile: string,
  target: string,
): string | null => {
  const trimmed = target.trim();
  if (!trimmed || isExternalUrl(trimmed)) return null;

  const pathOnly = trimmed.split("#")[0].split("?")[0];
  if (!pathOnly) return null;

  if (pathOnly.startsWith("/")) {
    return normalizeProjectRelative(pathOnly.slice(1));
  }
  const currentDir = currentFile.includes("/")
    ? currentFile.slice(0, currentFile.lastIndexOf("/"))
    : "";
  const joined = currentDir ? `${currentDir}/${pathOnly}` : pathOnly;
  return normalizeProjectRelative(joined);
};

const findFilePathCaseInsensitive = (
  fileMap: FileMap,
  candidate: string,
): string | null => {
  if (!candidate) return null;
  if (fileMap[candidate]) return candidate;
  const lower = candidate.toLowerCase();
  const exactLower = Object.keys(fileMap).find(
    (k) => k.toLowerCase() === lower,
  );
  return exactLower ?? null;
};

const resolvePreviewNavigationPath = (
  currentHtmlPath: string,
  rawTarget: string,
  fileMap: FileMap,
): string | null => {
  const normalizedRaw = String(rawTarget || "").trim();
  if (!normalizedRaw) return null;
  if (
    /^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(normalizedRaw)
  ) {
    return null;
  }

  const directCandidate = normalizeProjectRelative(
    normalizedRaw.replace(/^\/+/, ""),
  );
  const variants = directCandidate.startsWith("shared/")
    ? [directCandidate, directCandidate.slice("shared/".length)]
    : [directCandidate, `shared/${directCandidate}`];

  for (const candidate of variants) {
    const matched = findFilePathCaseInsensitive(fileMap, candidate);
    if (!matched) continue;
    const file = fileMap[matched];
    if (file?.type === "html") {
      const lower = matched.toLowerCase();
      if (lower.startsWith("shared/media/")) return null;
      return matched;
    }
  }

  const resolved = resolveProjectRelativePath(currentHtmlPath, normalizedRaw);
  if (!resolved) return null;
  const resolvedVariants = resolved.startsWith("shared/")
    ? [resolved, resolved.slice("shared/".length)]
    : [resolved, `shared/${resolved}`];
  for (const candidate of resolvedVariants) {
    const matched = findFilePathCaseInsensitive(fileMap, candidate);
    if (!matched) continue;
    const file = fileMap[matched];
    if (file?.type === "html") {
      const lower = matched.toLowerCase();
      if (lower.startsWith("shared/media/")) return null;
      return matched;
    }
  }

  return null;
};

const isPathWithinBase = (basePath: string, candidatePath: string): boolean => {
  const base = normalizePath(basePath)
    .replace(/[\\/]$/, "")
    .toLowerCase();
  const candidate = normalizePath(candidatePath).toLowerCase();
  return candidate === base || candidate.startsWith(`${base}/`);
};

const toMountRelativePath = (
  basePath: string,
  absolutePath: string,
): string | null => {
  const base = normalizePath(basePath).replace(/[\\/]$/, "");
  const absolute = normalizePath(absolutePath);
  if (!isPathWithinBase(base, absolute)) return null;
  const trimmed = absolute.startsWith(`${base}/`)
    ? absolute.slice(base.length + 1)
    : absolute.slice(base.length);
  return normalizeProjectRelative(trimmed.replace(/^\/+/, ""));
};

const rewriteInlineAssetRefs = (
  raw: string,
  currentFile: string,
  fileMap: FileMap,
): string => {
  let content = raw;

  content = content.replace(
    /\b(src|href)=["']([^"']+)["']/gi,
    (full, attrName, rawValue) => {
      const resolved = resolveProjectRelativePath(currentFile, rawValue);
      if (!resolved) return full;
      const file = fileMap[resolved];
      if (
        !file ||
        typeof file.content !== "string" ||
        file.content.trim().length === 0
      ) {
        return full;
      }
      if (file.type === "image" || file.type === "font") {
        return `${attrName}="${file.content}"`;
      }
      return full;
    },
  );

  content = content.replace(
    /url\((['"]?)([^'")]+)\1\)/gi,
    (full, quote, rawValue) => {
      const resolved = resolveProjectRelativePath(currentFile, rawValue);
      if (!resolved) return full;
      const file = fileMap[resolved];
      if (
        !file ||
        typeof file.content !== "string" ||
        file.content.trim().length === 0
      ) {
        return full;
      }
      if (file.type === "image" || file.type === "font") {
        return `url("${file.content}")`;
      }
      return full;
    },
  );

  content = content.replace(/\bsrcset=["']([^"']+)["']/gi, (full, rawValue) => {
    const rawSrcset = String(rawValue || "").trim();
    if (!rawSrcset || /^data:/i.test(rawSrcset)) return full;
    const parts = rawSrcset.split(",");
    let changed = false;
    const nextParts = parts.map((part) => {
      const token = part.trim();
      if (!token) return token;
      const [rawUrl, ...descriptorParts] = token.split(/\s+/);
      const resolved = resolveProjectRelativePath(currentFile, rawUrl);
      if (!resolved) return token;
      const file = fileMap[resolved];
      if (
        !file ||
        typeof file.content !== "string" ||
        file.content.trim().length === 0 ||
        (file.type !== "image" && file.type !== "font")
      ) {
        return token;
      }
      changed = true;
      const descriptor = descriptorParts.join(" ");
      return descriptor ? `${file.content} ${descriptor}` : file.content;
    });
    if (!changed) return full;
    return `srcset="${nextParts.join(", ")}"`;
  });

  return content;
};

const buildPreviewRuntimeScript = (
  fileMap: FileMap,
  htmlPath: string,
  includePaths?: string[],
): string => {
  const includeSet =
    includePaths && includePaths.length > 0 ? new Set(includePaths) : null;
  const records: Record<
    string,
    { kind: "text"; content: string } | { kind: "data"; data: string }
  > = {};

  for (const [path, file] of Object.entries(fileMap)) {
    const lowerPath = String(path || "").toLowerCase();
    const allowShared = lowerPath.startsWith("shared/");
    if (includeSet && !includeSet.has(path) && !allowShared) continue;
    if (typeof file.content !== "string" || file.content.trim().length === 0) {
      continue;
    }
    if (file.type === "image" || file.type === "font") {
      records[path] = { kind: "data", data: file.content };
      continue;
    }
    const transformed =
      file.type === "html" || file.type === "css"
        ? rewriteInlineAssetRefs(file.content, path, fileMap)
        : file.content;
    records[path] = { kind: "text", content: transformed };
  }

  const payload = JSON.stringify(records).replace(/<\//g, "<\\/");
  const safeEntry = JSON.stringify(htmlPath).replace(/<\//g, "<\\/");

  return `
  (function () {
    var __FILES = ${payload};
    var __FILE_KEYS = Object.keys(__FILES);
    var __LOWER_KEY_MAP = {};
    for (var i = 0; i < __FILE_KEYS.length; i++) {
      __LOWER_KEY_MAP[__FILE_KEYS[i].toLowerCase()] = __FILE_KEYS[i];
    }
    var __ENTRY = ${safeEntry};
    var __ENTRY_DIR = __ENTRY.indexOf('/') > -1 ? __ENTRY.slice(0, __ENTRY.lastIndexOf('/')) : '';
    var __ORIG_FETCH = window.fetch ? window.fetch.bind(window) : null;
    var __XHR_OPEN = XMLHttpRequest.prototype.open;
    var __XHR_SEND = XMLHttpRequest.prototype.send;

    function normalize(path) {
      var normalized = String(path || '').replace(/\\\\/g, '/');
      var parts = normalized.split('/');
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part || part === '.') continue;
        if (part === '..') { out.pop(); continue; }
        out.push(part);
      }
      return out.join('/');
    }

    function resolveFrom(baseFile, target) {
      if (!target) return null;
      if (/^(data:|blob:|mailto:|tel:|javascript:)/i.test(target)) return null;
      var cleaned = String(target).split('#')[0].split('?')[0];
      try { cleaned = decodeURIComponent(cleaned); } catch (e) {}
      if (!cleaned) return null;
      if (/^https?:/i.test(cleaned)) {
        try {
          var u = new URL(cleaned);
          cleaned = u.pathname || '';
        } catch (e) { return null; }
      }
      if (cleaned.startsWith('/')) return normalize(cleaned.slice(1));
      var baseDir = baseFile.indexOf('/') > -1 ? baseFile.slice(0, baseFile.lastIndexOf('/')) : '';
      return normalize(baseDir ? (baseDir + '/' + cleaned) : cleaned);
    }

    function getMime(path) {
      var lower = String(path || '').toLowerCase();
      if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
      if (lower.endsWith('.css')) return 'text/css';
      if (lower.endsWith('.js')) return 'text/javascript';
      if (lower.endsWith('.json')) return 'application/json';
      if (lower.endsWith('.svg')) return 'image/svg+xml';
      return 'text/plain';
    }

    function lookupRecord(path) {
      if (!path) return null;
      if (__FILES[path]) return { key: path, rec: __FILES[path] };

      var lowerPath = String(path).toLowerCase();
      var exactLower = __LOWER_KEY_MAP[lowerPath];
      if (exactLower && __FILES[exactLower]) {
        return { key: exactLower, rec: __FILES[exactLower] };
      }

      for (var i = 0; i < __FILE_KEYS.length; i++) {
        var key = __FILE_KEYS[i];
        var lowerKey = key.toLowerCase();
        if (lowerKey === lowerPath || lowerKey.endsWith('/' + lowerPath)) {
          return { key: key, rec: __FILES[key] };
        }
      }
      return null;
    }

    function getPathVariants(path) {
      var variants = [];
      var normalized = normalize(path);
      if (!normalized) return variants;
      variants.push(normalized);
      if (normalized.startsWith('shared/')) {
        variants.push(normalized.slice('shared/'.length));
      } else {
        variants.push('shared/' + normalized);
      }
      return variants;
    }

    function toPath(input) {
      var raw = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!raw) return null;
      return resolveFrom(__ENTRY, raw);
    }

    function getRecord(input) {
      var path = toPath(input);
      if (!path) return null;
      var variants = getPathVariants(path);
      for (var i = 0; i < variants.length; i++) {
        var found = lookupRecord(variants[i]);
        if (found) return { path: found.key, rec: found.rec };
      }

      if (__ENTRY_DIR) {
        for (var j = 0; j < variants.length; j++) {
          var prefixed = normalize(__ENTRY_DIR + '/' + variants[j]);
          var prefixedFound = lookupRecord(prefixed);
          if (prefixedFound) {
            return { path: prefixedFound.key, rec: prefixedFound.rec };
          }
        }
      }
      return { path: path, rec: null };
    }

    function resolveNavigationTarget(target) {
      if (!target) return null;
      var raw = String(target || '').trim();
      if (!raw) return null;
      if (/^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(raw)) return null;

      var resolved = resolveFrom(__ENTRY, raw);
      if (!resolved) return null;
      var variants = getPathVariants(resolved);

      for (var i = 0; i < variants.length; i++) {
        var found = lookupRecord(variants[i]);
        if (!found || !found.rec || found.rec.kind !== 'text') continue;
        var lower = String(found.key || '').toLowerCase();
        if (lower.endsWith('.html') || lower.endsWith('.htm')) {
          if (lower.startsWith('shared/media/')) return null;
          return found.key;
        }
      }
      return null;
    }

    function toDataUrl(path, rec) {
      if (!rec) return null;
      if (rec.kind === 'data') return rec.data;
      var mime = getMime(path);
      return 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(rec.content);
    }

    function rewriteCssText(cssText) {
      return String(cssText || '').replace(/url\\((['"]?)([^'")]+)\\1\\)/gi, function(full, _quote, raw) {
        var rewritten = rewriteAttrValue(raw);
        if (!rewritten) return full;
        return 'url("' + rewritten + '")';
      });
    }

    function rewriteHtmlMarkup(markup) {
      var next = String(markup || '');
      next = next.replace(/\\b(src|href|srcset)=["']([^"']+)["']/gi, function(full, attr, raw) {
        if (String(attr).toLowerCase() === 'srcset') {
          var rewrittenSet = rewriteSrcsetValue(raw);
          if (!rewrittenSet) return full;
          return attr + '="' + rewrittenSet + '"';
        }
        var rewritten = rewriteAttrValue(raw);
        if (!rewritten) return full;
        return attr + '="' + rewritten + '"';
      });
      next = next.replace(/url\\((['"]?)([^'")]+)\\1\\)/gi, function(full, _q, raw) {
        var rewritten = rewriteAttrValue(raw);
        if (!rewritten) return full;
        return 'url("' + rewritten + '")';
      });
      return next;
    }

    function rewriteAttrValue(rawValue) {
      if (!rawValue) return null;
      var resolved = getRecord(rawValue);
      if (!resolved || !resolved.rec) return null;
      return toDataUrl(resolved.path, resolved.rec);
    }

    function rewriteSrcsetValue(rawValue) {
      if (!rawValue) return null;
      var srcset = String(rawValue).trim();
      if (!srcset || /^data:/i.test(srcset)) return null;
      var parts = srcset.split(',');
      var changed = false;
      for (var i = 0; i < parts.length; i++) {
        var token = String(parts[i] || '').trim();
        if (!token) continue;
        var segs = token.split(/\s+/);
        var rawUrl = segs[0];
        var rewritten = rewriteAttrValue(rawUrl);
        if (!rewritten) continue;
        changed = true;
        var descriptor = segs.slice(1).join(' ');
        parts[i] = descriptor ? (rewritten + ' ' + descriptor) : rewritten;
      }
      return changed ? parts.join(', ') : null;
    }

    function patchElementAttributes(root) {
      if (!root || !root.querySelectorAll) return;
      if (root.tagName === 'STYLE' && root.textContent) {
        root.textContent = rewriteCssText(root.textContent);
      }
      var nodes = root.querySelectorAll('[src], [href], [srcset]');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.tagName === 'STYLE' && node.textContent) {
          node.textContent = rewriteCssText(node.textContent);
        }
        if (node.hasAttribute('src')) {
          var src = node.getAttribute('src');
          var nextSrc = rewriteAttrValue(src);
          if (nextSrc) node.setAttribute('src', nextSrc);
        }
        if (node.hasAttribute('href')) {
          var href = node.getAttribute('href');
          var rel = (node.getAttribute('rel') || '').toLowerCase();
          var nextHref = rewriteAttrValue(href);
          if (nextHref && (rel === 'stylesheet' || node.tagName === 'A' || node.tagName === 'LINK')) {
            node.setAttribute('href', nextHref);
          }
        }
        if (node.hasAttribute('srcset')) {
          var srcset = node.getAttribute('srcset');
          var nextSrcset = rewriteSrcsetValue(srcset);
          if (nextSrcset) node.setAttribute('srcset', nextSrcset);
        }
      }
    }

    var __APPEND_CHILD = Node.prototype.appendChild;
    Node.prototype.appendChild = function(child) {
      patchElementAttributes(child);
      return __APPEND_CHILD.call(this, child);
    };

    var __INSERT_BEFORE = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function(newNode, referenceNode) {
      patchElementAttributes(newNode);
      return __INSERT_BEFORE.call(this, newNode, referenceNode);
    };

    var __SET_ATTR = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      var lower = String(name || '').toLowerCase();
      if (lower === 'srcset') {
        var rewrittenSet = rewriteSrcsetValue(value);
        if (rewrittenSet) value = rewrittenSet;
      } else if (lower === 'src' || lower === 'href') {
        var rewritten = rewriteAttrValue(value);
        if (rewritten) value = rewritten;
      } else if (lower === 'style' && typeof value === 'string') {
        value = rewriteCssText(value);
      }
      return __SET_ATTR.call(this, name, value);
    };

    function patchUrlProperty(proto, propName) {
      if (!proto) return;
      var desc = Object.getOwnPropertyDescriptor(proto, propName);
      if (!desc || !desc.set || !desc.get) return;
      if (!desc.configurable) return;
      Object.defineProperty(proto, propName, {
        configurable: true,
        enumerable: desc.enumerable,
        get: function() {
          return desc.get.call(this);
        },
        set: function(value) {
          if (propName === 'srcset') {
            var rewrittenSet = rewriteSrcsetValue(value);
            return desc.set.call(this, rewrittenSet || value);
          }
          var rewritten = rewriteAttrValue(value);
          return desc.set.call(this, rewritten || value);
        }
      });
    }

    patchUrlProperty(window.HTMLImageElement && window.HTMLImageElement.prototype, 'src');
    patchUrlProperty(window.HTMLImageElement && window.HTMLImageElement.prototype, 'srcset');
    patchUrlProperty(window.HTMLScriptElement && window.HTMLScriptElement.prototype, 'src');
    patchUrlProperty(window.HTMLLinkElement && window.HTMLLinkElement.prototype, 'href');
    patchUrlProperty(window.HTMLAnchorElement && window.HTMLAnchorElement.prototype, 'href');
    patchUrlProperty(window.HTMLSourceElement && window.HTMLSourceElement.prototype, 'src');
    patchUrlProperty(window.HTMLSourceElement && window.HTMLSourceElement.prototype, 'srcset');
    patchUrlProperty(window.HTMLIFrameElement && window.HTMLIFrameElement.prototype, 'src');

    var __INSERT_ADJ = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function(position, text) {
      return __INSERT_ADJ.call(this, position, rewriteHtmlMarkup(text));
    };

    var innerHtmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (innerHtmlDesc && innerHtmlDesc.set && innerHtmlDesc.get) {
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        enumerable: innerHtmlDesc.enumerable,
        get: function() {
          return innerHtmlDesc.get.call(this);
        },
        set: function(value) {
          return innerHtmlDesc.set.call(this, rewriteHtmlMarkup(value));
        }
      });
    }

    var __DOC_WRITE = document.write ? document.write.bind(document) : null;
    if (__DOC_WRITE) {
      document.write = function() {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
          args.push(rewriteHtmlMarkup(arguments[i]));
        }
        return __DOC_WRITE.apply(document, args);
      };
    }

    if (document && document.documentElement) {
      patchElementAttributes(document.documentElement);
      var observer = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            patchElementAttributes(m.addedNodes[j]);
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function notifyNavigate(targetPath) {
      if (!targetPath || !window.parent || window.parent === window) return;
      try {
        window.parent.postMessage({ type: 'PREVIEW_NAVIGATE', path: targetPath }, '*');
      } catch (e) {}
    }

    var __previewSelectedEl = null;
    var __previewEditingEl = null;
    var __previewMode = 'preview';
    var __previewSelectionMode = 'default';
    var __previewEditableTags = {
      p: true, span: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
      a: true, button: true, label: true, strong: true, em: true, small: true, b: true,
      i: true, u: true, li: true, td: true, th: true, blockquote: true, pre: true
    };

    function postPreviewMessage(type, payload) {
      if (!window.parent || window.parent === window) return;
      try {
        var message = { type: type };
        if (payload && typeof payload === 'object') {
          for (var key in payload) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
              message[key] = payload[key];
            }
          }
        }
        window.parent.postMessage(message, '*');
      } catch (e) {}
    }

    function clearPreviewSelection() {
      if (__previewSelectedEl && __previewSelectedEl.classList) {
        __previewSelectedEl.classList.remove('__nx-preview-selected');
      }
      __previewSelectedEl = null;
    }
    function isPreviewEditMode() {
      return __previewMode === 'edit';
    }

    function isPreviewBaseSelectable(el) {
      if (!el) return false;
      var tag = String(el.tagName || '').toLowerCase();
      return Boolean(
        tag &&
        tag !== 'script' &&
        tag !== 'style' &&
        tag !== 'head' &&
        tag !== 'meta' &&
        tag !== 'link' &&
        tag !== 'html' &&
        tag !== 'body'
      );
    }

    function hasOwnTextNode(el) {
      if (!el) return false;
      for (var i = 0; i < el.childNodes.length; i++) {
        var child = el.childNodes[i];
        if (child && child.nodeType === 3 && String(child.textContent || '').trim()) {
          return true;
        }
      }
      return false;
    }

    function isElementImageCandidate(el) {
      if (!el || !isPreviewBaseSelectable(el)) return false;
      var tag = String(el.tagName || '').toLowerCase();
      if (tag === 'img' || tag === 'picture' || tag === 'source') return true;
      try {
        var computed = window.getComputedStyle(el);
        var bg = computed ? String(computed.backgroundImage || '') : '';
        if (bg && bg !== 'none' && /url\\(/i.test(bg)) return true;
      } catch (e) {}
      return false;
    }

    function normalizeSelectionMode(raw) {
      var mode = String(raw || '').toLowerCase();
      if (mode === 'text' || mode === 'image' || mode === 'css') return mode;
      return 'default';
    }

    function findBestDescendant(root, selector, predicate, pointX, pointY) {
      var descendants = root.querySelectorAll ? root.querySelectorAll(selector) : [];
      var best = null;
      var bestArea = Number.POSITIVE_INFINITY;
      var bestDistance = Number.POSITIVE_INFINITY;
      for (var d = 0; d < descendants.length; d++) {
        var candidate = descendants[d];
        if (!candidate || candidate === root) continue;
        if (predicate && !predicate(candidate)) continue;
        var rect = candidate.getBoundingClientRect ? candidate.getBoundingClientRect() : null;
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;
        var distance = 0;
        if (pointX !== null && pointY !== null) {
          var dx = pointX < rect.left ? (rect.left - pointX) : (pointX > rect.right ? (pointX - rect.right) : 0);
          var dy = pointY < rect.top ? (rect.top - pointY) : (pointY > rect.bottom ? (pointY - rect.bottom) : 0);
          distance = (dx * dx) + (dy * dy);
        }
        var area = rect.width * rect.height;
        if (
          distance < bestDistance ||
          (distance === bestDistance && area < bestArea)
        ) {
          best = candidate;
          bestArea = area;
          bestDistance = distance;
        }
      }
      return best;
    }

    function applySelectionModeDecorations() {
      if (!document || !document.body) return;
      var staleImages = document.querySelectorAll('.__nx-preview-image-candidate');
      for (var si = 0; si < staleImages.length; si++) {
        staleImages[si].classList.remove('__nx-preview-image-candidate');
      }
      var staleCss = document.querySelectorAll('.__nx-preview-css-candidate');
      for (var sc = 0; sc < staleCss.length; sc++) {
        staleCss[sc].classList.remove('__nx-preview-css-candidate');
      }
      if (!isPreviewEditMode()) return;
      if (__previewSelectionMode === 'image') {
        var all = document.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (isElementImageCandidate(el)) {
            el.classList.add('__nx-preview-image-candidate');
          }
        }
      } else if (__previewSelectionMode === 'css') {
        var cssEls = document.querySelectorAll('body *');
        for (var j = 0; j < cssEls.length; j++) {
          var cssEl = cssEls[j];
          if (isPreviewBaseSelectable(cssEl)) {
            cssEl.classList.add('__nx-preview-css-candidate');
          }
        }
      }
    }

    function getPreviewSelectableTarget(node, event) {
      var current = node && node.nodeType === 1 ? node : (node && node.parentElement ? node.parentElement : null);
      var pointX = event && typeof event.clientX === 'number' ? event.clientX : null;
      var pointY = event && typeof event.clientY === 'number' ? event.clientY : null;
      while (current && current !== document.body) {
        if (!isPreviewBaseSelectable(current)) {
          current = current.parentElement;
          continue;
        }
        if (__previewSelectionMode === 'text') {
          if (hasOwnTextNode(current)) return current;
          var nearText = findBestDescendant(
            current,
            'p,span,h1,h2,h3,h4,h5,h6,a,button,label,strong,em,small,b,i,u,li,td,th,blockquote,pre,div',
            hasOwnTextNode,
            pointX,
            pointY,
          );
          if (nearText) return nearText;
        } else if (__previewSelectionMode === 'image') {
          if (isElementImageCandidate(current)) return current;
          var nearImage = findBestDescendant(current, '*', isElementImageCandidate, pointX, pointY);
          if (nearImage) return nearImage;
        } else {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    function getPreviewElementPath(el) {
      if (!el || !document.body || !document.body.contains(el)) return null;
      var path = [];
      var cursor = el;
      while (cursor && cursor !== document.body) {
        var parent = cursor.parentElement;
        if (!parent) return null;
        var children = parent.children;
        var idx = -1;
        for (var i = 0; i < children.length; i++) {
          if (children[i] === cursor) {
            idx = i;
            break;
          }
        }
        if (idx < 0) return null;
        path.unshift(idx);
        cursor = parent;
      }
      return path;
    }

    function readElementByPath(path) {
      if (!document.body || !path || !path.length) return null;
      var cursor = document.body;
      for (var i = 0; i < path.length; i++) {
        var idx = Number(path[i]);
        if (!isFinite(idx) || idx < 0) return null;
        var children = cursor.children || [];
        cursor = children[idx];
        if (!cursor) return null;
      }
      return cursor;
    }

    function toCamelStyleKey(raw) {
      return String(raw || '').replace(/-([a-z])/g, function(_all, c) { return c.toUpperCase(); });
    }

    function toCssStyleKey(raw) {
      return String(raw || '').replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
    }

    function normalizeFontFamilyValue(raw) {
      var value = String(raw || '').trim();
      if (!value) return '';
      if (value.indexOf(',') > -1) return value;
      if (
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") ||
        (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"')
      ) {
        return value;
      }
      var lower = value.toLowerCase();
      if (
        lower === 'serif' ||
        lower === 'sans-serif' ||
        lower === 'monospace' ||
        lower === 'cursive' ||
        lower === 'fantasy' ||
        lower === 'system-ui'
      ) {
        return value;
      }
      if (/\\s/.test(value)) {
        return "'" + value.replace(/'/g, "\\\\'") + "'";
      }
      return value;
    }

    function getElementComputedStyles(el) {
      var out = {};
      if (!el || !window.getComputedStyle) return out;
      try {
        var computed = window.getComputedStyle(el);
        for (var i = 0; i < computed.length; i++) {
          var key = computed[i];
          var value = computed.getPropertyValue(key);
          if (!value) continue;
          out[toCamelStyleKey(key)] = value;
        }
      } catch (e) {}
      return out;
    }

    function getCustomAttributes(el) {
      var out = {};
      if (!el || !el.attributes) return out;
      var reserved = { id: true, class: true, style: true, src: true, href: true };
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (!attr || !attr.name) continue;
        var lower = String(attr.name).toLowerCase();
        if (reserved[lower]) continue;
        out[attr.name] = attr.value || '';
      }
      return out;
    }

    function applyStylePatchToElement(el, styles) {
      if (!el || !el.style || !styles || typeof styles !== 'object') return;
      for (var key in styles) {
        if (!Object.prototype.hasOwnProperty.call(styles, key)) continue;
        var cssKey = toCssStyleKey(key);
        var rawValue = styles[key];
        var value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
        if (cssKey === 'font-family') {
          value = normalizeFontFamilyValue(value);
        }
        if (!value) {
          el.style.removeProperty(cssKey);
        } else {
          if (cssKey === 'animation') {
            el.style.setProperty('animation', 'none');
            if (typeof el.offsetWidth === 'number') {
              el.offsetWidth;
            }
          }
          el.style.setProperty(cssKey, value, cssKey === 'font-family' ? 'important' : '');
        }
      }
    }

    function canInlineEdit(el) {
      if (!el) return false;
      if (el.isContentEditable) return false;
      var tag = String(el.tagName || '').toLowerCase();
      if (!__previewEditableTags[tag]) return false;
      if (el.closest('svg,canvas,video,audio,iframe,select,input,textarea')) return false;
      return true;
    }

    function beginInlineEdit(el) {
      if (!el || !canInlineEdit(el)) return;
      if (__previewEditingEl && __previewEditingEl !== el) {
        __previewEditingEl.blur();
      }
      var path = getPreviewElementPath(el);
      if (!path) return;

      __previewEditingEl = el;
      el.classList.add('__nx-preview-editing');
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('data-nx-inline-editing', 'true');
      try {
        var range = document.createRange();
        range.selectNodeContents(el);
        var selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch (e) {}
      try { el.focus(); } catch (e) {}

      var done = false;
      var normalizeEditableHtml = function(raw) {
        var html = String(raw || '');
        // Normalize block splits produced by contentEditable Enter behavior.
        html = html.split('<div><br></div>').join('<br>');
        html = html.split('<div>').join('<br>');
        html = html.split('</div>').join('');
        html = html.split('<p>').join('<br>');
        html = html.split('</p>').join('');
        while (
          html.startsWith('<br>') ||
          html.startsWith('<br/>') ||
          html.startsWith('<br />')
        ) {
          if (html.startsWith('<br />')) {
            html = html.slice(6);
          } else if (html.startsWith('<br/>')) {
            html = html.slice(5);
          } else {
            html = html.slice(4);
          }
        }
        return html;
      };
      var insertLineBreakAtCursor = function() {
        try {
          var sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          var range = sel.getRangeAt(0);
          range.deleteContents();
          var br = document.createElement('br');
          range.insertNode(br);
          range.setStartAfter(br);
          range.setEndAfter(br);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (e) {}
      };
      var finish = function(commit) {
        if (done) return;
        done = true;
        el.removeEventListener('blur', onBlur, true);
        el.removeEventListener('keydown', onKeyDown, true);
        el.removeAttribute('contenteditable');
        el.removeAttribute('data-nx-inline-editing');
        el.classList.remove('__nx-preview-editing');
        __previewEditingEl = null;
        if (commit) {
          postPreviewMessage('PREVIEW_INLINE_EDIT', {
            path: path,
            html: normalizeEditableHtml(el.innerHTML)
          });
        }
      };

      var onBlur = function() {
        finish(true);
      };
      var onKeyDown = function(event) {
        if (!event) return;
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          insertLineBreakAtCursor();
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      };

      el.addEventListener('blur', onBlur, true);
      el.addEventListener('keydown', onKeyDown, true);
    }

    try {
      var __previewStyle = document.createElement('style');
      __previewStyle.setAttribute('data-preview-inline-editor', 'true');
      __previewStyle.textContent =
        '.__nx-preview-selected{outline:2px solid rgba(14,165,233,0.95)!important;outline-offset:1px;}' +
        '.__nx-preview-editing{outline:2px dashed rgba(249,115,22,0.95)!important;outline-offset:1px;}' +
        '.__nx-preview-image-candidate{outline:2px solid rgba(245,158,11,0.92)!important;outline-offset:1px;}' +
        '.__nx-preview-css-candidate{outline:1px solid rgba(56,189,248,0.65)!important;outline-offset:0px;}' +
        '.__nx-preview-dirty{box-shadow:inset 0 0 0 2px rgba(245,158,11,0.95)!important;}' +
        '.__nx-draw-new{outline:2px dashed rgba(99,102,241,0.85)!important;outline-offset:0;}' +
        '[data-nx-inline-editing=\"true\"]{cursor:text!important;}' +
        '@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}' +
        '@keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}' +
        '@keyframes zoomIn{from{transform:scale(0.8);opacity:0;}to{transform:scale(1);opacity:1;}}' +
        '@keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}' +
        '@keyframes pulse{0%{opacity:1;}50%{opacity:.5;}100%{opacity:1;}}' +
        '@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}' +
        '@keyframes flip{0%{transform:perspective(400px) rotateY(90deg);opacity:0;}100%{transform:perspective(400px) rotateY(0deg);opacity:1;}}' +
        '@keyframes wiggle{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(3deg);}}' +
        '@keyframes revealScroll{from{opacity:0;transform:translateY(30px);}to{opacity:1;transform:translateY(0);}}';
      if (document.head) document.head.appendChild(__previewStyle);
    } catch (e) {}

    window.addEventListener('message', function(event) {
      var payload = event && event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          return;
        }
      }
      if (!payload || !payload.type) return;
      if (payload.type === 'PREVIEW_SET_MODE') {
        var nextMode = payload.mode === 'preview' ? 'preview' : 'edit';
        __previewSelectionMode = normalizeSelectionMode(payload.selectionMode);
        __previewMode = nextMode;
        if (nextMode !== 'edit') {
          clearPreviewSelection();
        }
        applySelectionModeDecorations();
        return;
      }
      if (payload.type === 'PREVIEW_APPLY_STYLE') {
        var target = null;
        if (payload.path && payload.path.length) {
          target = readElementByPath(payload.path);
        }
        if (!target && __previewSelectedEl && document.body && document.body.contains(__previewSelectedEl)) {
          target = __previewSelectedEl;
        }
        if (!target) {
          target = document.querySelector('.__nx-preview-selected');
        }
        if (target) {
          applyStylePatchToElement(target, payload.styles);
        }
      }
    });

    document.addEventListener('click', function(event) {
      if (!isPreviewEditMode()) {
        var navCandidate = event && event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (navCandidate) {
          var rawHref = navCandidate.getAttribute('href');
          if (rawHref) {
            var trimmedHref = String(rawHref).trim();
            if (
              trimmedHref &&
              !/^(javascript:|mailto:|tel:|#)/i.test(trimmedHref)
            ) {
              var navTarget = resolveNavigationTarget(trimmedHref);
              if (navTarget) {
                event.preventDefault();
                event.stopPropagation();
                notifyNavigate(navTarget);
              }
            }
          }
        }
        return;
      }
      var target = event && event.target;
      var selected = getPreviewSelectableTarget(target, event);
      if (selected) {
        clearPreviewSelection();
        __previewSelectedEl = selected;
        if (__previewSelectedEl.classList) {
          __previewSelectedEl.classList.add('__nx-preview-selected');
        }
        postPreviewMessage('PREVIEW_SELECT', {
          path: getPreviewElementPath(__previewSelectedEl),
          tag: String(__previewSelectedEl.tagName || '').toLowerCase(),
          id: __previewSelectedEl.id || '',
          className: typeof __previewSelectedEl.className === 'string' ? __previewSelectedEl.className : '',
          attributes: getCustomAttributes(__previewSelectedEl),
          text: __previewSelectedEl.textContent || '',
          src: (__previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('src') || '') : ''),
          href: (__previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('href') || '') : ''),
          inlineStyle: __previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('style') || '') : '',
          computedStyles: getElementComputedStyles(__previewSelectedEl)
        });
      }

      if (__previewEditingEl) return;
      var target = event && event.target;
      if (!target || !target.closest) return;
      if (event.detail && event.detail > 1) return;
      var anchor = target.closest('a[href]');
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    document.addEventListener('dblclick', function(event) {
      if (!isPreviewEditMode()) return;
      if (__previewEditingEl) return;
      var target = event && event.target;
      var selected = getPreviewSelectableTarget(target, event);
      if (!selected || !canInlineEdit(selected)) return;
      event.preventDefault();
      event.stopPropagation();
      beginInlineEdit(selected);
    }, true);

    var __LOCATION_ASSIGN = window.location.assign ? window.location.assign.bind(window.location) : null;
    if (__LOCATION_ASSIGN) {
      try {
        window.location.assign = function(url) {
          var navTarget = resolveNavigationTarget(url);
          if (navTarget) {
            notifyNavigate(navTarget);
            return;
          }
          return __LOCATION_ASSIGN(url);
        };
      } catch (e) {}
    }

    var __LOCATION_REPLACE = window.location.replace ? window.location.replace.bind(window.location) : null;
    if (__LOCATION_REPLACE) {
      try {
        window.location.replace = function(url) {
          var navTarget = resolveNavigationTarget(url);
          if (navTarget) {
            notifyNavigate(navTarget);
            return;
          }
          return __LOCATION_REPLACE(url);
        };
      } catch (e) {}
    }

    if (__ORIG_FETCH) {
      window.fetch = function(input, init) {
        var method = (init && init.method) || (input && input.method) || 'GET';
        if (String(method).toUpperCase() !== 'GET') return __ORIG_FETCH(input, init);
        var resolved = getRecord(input);
        if (!resolved || !resolved.rec) return __ORIG_FETCH(input, init);
        if (resolved.rec.kind === 'data') return __ORIG_FETCH(resolved.rec.data, init);
        return Promise.resolve(
          new Response(resolved.rec.content, {
            status: 200,
            headers: { 'Content-Type': getMime(resolved.path) + '; charset=utf-8' }
          })
        );
      };
    }

    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      this.__codexMethod = method;
      this.__codexUrl = url;
      this.__codexAsync = async;
      this.__codexUser = user;
      this.__codexPassword = password;
      return __XHR_OPEN.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      var method = String(this.__codexMethod || 'GET').toUpperCase();
      if (method === 'GET') {
        var resolved = getRecord(this.__codexUrl);
        if (resolved && resolved.rec) {
          var dataUrl = resolved.rec.kind === 'data'
            ? resolved.rec.data
            : ('data:' + getMime(resolved.path) + ';charset=utf-8,' + encodeURIComponent(resolved.rec.content));
          __XHR_OPEN.call(
            this,
            method,
            dataUrl,
            this.__codexAsync !== false,
            this.__codexUser,
            this.__codexPassword
          );
        }
      }
      return __XHR_SEND.call(this, body);
    };
  })();
  `;
};

const createPreviewDocument = (
  fileMap: FileMap,
  htmlPath: string,
  includePaths?: string[],
): string => {
  const entry = fileMap[htmlPath];
  if (
    !entry ||
    typeof entry.content !== "string" ||
    entry.content.trim().length === 0
  ) {
    return "";
  }
  let html = entry.content;
  const runtimeScript = buildPreviewRuntimeScript(
    fileMap,
    htmlPath,
    includePaths,
  );

  if (/<head[\s>]/i.test(html)) {
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>\n<script data-preview-runtime="true">\n${runtimeScript}\n</script>\n`,
    );
  } else {
    html = `<head><script data-preview-runtime="true">\n${runtimeScript}\n</script></head>\n${html}`;
  }

  html = html.replace(
    /<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (full, beforeHref, hrefValue, afterHref) => {
      if (!/rel=["']stylesheet["']/i.test(full)) return full;
      const resolved = resolveProjectRelativePath(htmlPath, hrefValue);
      if (!resolved) return full;
      const cssFile = fileMap[resolved];
      if (
        !cssFile ||
        typeof cssFile.content !== "string" ||
        cssFile.content.trim().length === 0
      ) {
        return full;
      }
      return `<style data-source="${resolved}">\n${rewriteInlineAssetRefs(cssFile.content, resolved, fileMap)}\n</style>`;
    },
  );

  html = html.replace(
    /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (full, beforeSrc, srcValue, afterSrc) => {
      const resolved = resolveProjectRelativePath(htmlPath, srcValue);
      if (!resolved) return full;
      const jsFile = fileMap[resolved];
      if (
        !jsFile ||
        typeof jsFile.content !== "string" ||
        jsFile.content.trim().length === 0
      ) {
        return full;
      }
      return `<script${beforeSrc}${afterSrc} data-source="${resolved}">\n${jsFile.content}\n</script>`;
    },
  );

  html = rewriteInlineAssetRefs(html, htmlPath, fileMap);

  return html;
};

const pickDefaultHtmlFile = (fileMap: FileMap): string | null => {
  const htmlFiles = Object.values(fileMap).filter((f) => f.type === "html");
  if (htmlFiles.length === 0) return null;

  const slide000 = htmlFiles.find((f) =>
    /_000\/index\.html$/i.test(normalizePath(f.path)),
  );
  if (slide000) return slide000.path;

  const slide001 = htmlFiles.find((f) =>
    /_001\/index\.html$/i.test(normalizePath(f.path)),
  );
  if (slide001) return slide001.path;

  const slideIndexFiles = htmlFiles
    .map((f) => ({ file: f, normalizedPath: normalizePath(f.path) }))
    .filter(({ normalizedPath }) =>
      /_([0-9]{3,})\/index\.html$/i.test(normalizedPath),
    )
    .sort((a, b) => {
      const aMatch = a.normalizedPath.match(/_([0-9]{3,})\/index\.html$/i);
      const bMatch = b.normalizedPath.match(/_([0-9]{3,})\/index\.html$/i);
      const aNum = aMatch
        ? Number.parseInt(aMatch[1], 10)
        : Number.MAX_SAFE_INTEGER;
      const bNum = bMatch
        ? Number.parseInt(bMatch[1], 10)
        : Number.MAX_SAFE_INTEGER;
      if (aNum !== bNum) return aNum - bNum;
      return a.normalizedPath.localeCompare(b.normalizedPath);
    });
  if (slideIndexFiles.length > 0) {
    return slideIndexFiles[0].file.path;
  }

  const indexHtml =
    htmlFiles.find((f) => f.path.toLowerCase() === "index.html") ||
    htmlFiles.find((f) => f.name.toLowerCase() === "index.html");
  return (indexHtml || htmlFiles[0]).path;
};

const MOUNTED_PREVIEW_BRIDGE_SCRIPT = `
(function () {
  var __docEl = document && document.documentElement ? document.documentElement : null;
  if (__docEl && __docEl.getAttribute('data-nx-mounted-preview-bridge') === '1') return;
  if (__docEl) __docEl.setAttribute('data-nx-mounted-preview-bridge', '1');
  window.__nxMountedPreviewBridgeInstalled = true;

  var __previewSelectedEl = null;
  var __previewEditingEl = null;
  var __previewHoverEl = null;
  var __previewHoverBadge = null;
  var __previewHoverOutline = null;
  var __previewHoverRaf = 0;
  var __previewMode = 'preview';
  var __previewSelectionMode = 'default';
  var __previewToolMode = 'edit';
  var __previewDrawTag = 'div';
  var __previewMoveDrag = null;
  var __previewDrawDraft = null;
  var __previewDrawState = null;
  var __previewEditableTags = {
    p: true, span: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
    a: true, button: true, label: true, strong: true, em: true, small: true, b: true,
    i: true, u: true, li: true, td: true, th: true, blockquote: true, pre: true
  };

  function syncModeFromHost() {
    try {
      var hostMode = String(window.__nxPreviewHostMode || '').toLowerCase();
      if (hostMode === 'preview' || hostMode === 'edit') {
        __previewMode = hostMode;
      }
      __previewSelectionMode = normalizeSelectionMode(window.__nxPreviewHostSelectionMode);
      __previewToolMode = normalizeToolMode(window.__nxPreviewHostToolMode);
      __previewDrawTag = normalizeDrawTag(window.__nxPreviewHostDrawTag);
    } catch (e) {}
  }

  function postPreviewMessage(type, payload) {
    if (!window.parent || window.parent === window) return;
    try {
      var message = { type: type };
      if (payload && typeof payload === 'object') {
        for (var key in payload) {
          if (Object.prototype.hasOwnProperty.call(payload, key)) {
            message[key] = payload[key];
          }
        }
      }
      window.parent.postMessage(message, '*');
    } catch (e) {}
  }

  function clearPreviewSelection() {
    if (__previewSelectedEl && __previewSelectedEl.classList) {
      __previewSelectedEl.classList.remove('__nx-preview-selected');
    }
    __previewSelectedEl = null;
    // Also sweep the DOM to catch any elements that had the class added directly
    // (e.g. via PREVIEW_INJECT_ELEMENT) without going through __previewSelectedEl.
    try {
      var extras = document.querySelectorAll('.__nx-preview-selected');
      for (var ci = 0; ci < extras.length; ci++) {
        extras[ci].classList.remove('__nx-preview-selected');
      }
    } catch (e) {}
  }

  function emitPreviewSelection(el) {
    if (!el) return;
    postPreviewMessage('PREVIEW_SELECT', {
      path: getPreviewElementPath(el),
      tag: String(el.tagName || '').toLowerCase(),
      id: el.id || '',
      className: typeof el.className === 'string' ? el.className : '',
      attributes: getCustomAttributes(el),
      text: el.textContent || '',
      src: extractImageSource(el),
      href: el.getAttribute ? (el.getAttribute('href') || '') : '',
      inlineStyle: el.getAttribute ? (el.getAttribute('style') || '') : '',
      computedStyles: getElementComputedStyles(el)
    });
  }

  function selectPreviewElement(el) {
    if (!el) return;
    clearPreviewSelection();
    __previewSelectedEl = el;
    if (__previewSelectedEl.classList) {
      __previewSelectedEl.classList.add('__nx-preview-selected');
    }
    emitPreviewSelection(__previewSelectedEl);
  }

  function clearPreviewHover() {
    __previewHoverEl = null;
    if (__previewHoverRaf) {
      cancelAnimationFrame(__previewHoverRaf);
      __previewHoverRaf = 0;
    }
    if (__previewHoverBadge) {
      __previewHoverBadge.style.display = 'none';
    }
    if (__previewHoverOutline) {
      __previewHoverOutline.style.display = 'none';
    }
  }

  function isPreviewEditMode() {
    syncModeFromHost();
    return __previewMode === 'edit';
  }

  function isPreviewBaseSelectable(el) {
    if (!el) return false;
    var tag = String(el.tagName || '').toLowerCase();
    return Boolean(
      tag &&
      tag !== 'script' &&
      tag !== 'style' &&
      tag !== 'head' &&
      tag !== 'meta' &&
      tag !== 'link' &&
      tag !== 'html' &&
      tag !== 'body'
    );
  }

  function hasOwnTextNode(el) {
    if (!el) return false;
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child && child.nodeType === 3 && String(child.textContent || '').trim()) {
        return true;
      }
    }
    return false;
  }

  function isElementImageCandidate(el) {
    if (!el || !isPreviewBaseSelectable(el)) return false;
    var tag = String(el.tagName || '').toLowerCase();
    if (tag === 'img' || tag === 'picture' || tag === 'source') return true;
    try {
      var computed = window.getComputedStyle(el);
      var bg = computed ? String(computed.backgroundImage || '') : '';
      if (bg && bg !== 'none' && /url\\(/i.test(bg)) return true;
    } catch (e) {}
    return false;
  }

  function extractImageSource(el) {
    if (!el) return '';
    var tag = String(el.tagName || '').toLowerCase();
    if (tag === 'img' || tag === 'source') {
      var attrSrc = el.getAttribute ? (el.getAttribute('src') || '') : '';
      if (attrSrc) return attrSrc;
    }
    try {
      var computed = window.getComputedStyle(el);
      var bg = computed ? String(computed.backgroundImage || '') : '';
      var match = bg && bg.match(/url\\((['"]?)(.*?)\\1\\)/i);
      if (match && match[2]) return match[2];
    } catch (e) {}
    return '';
  }

  function normalizeSelectionMode(raw) {
    var mode = String(raw || '').toLowerCase();
    if (mode === 'text' || mode === 'image' || mode === 'css') return mode;
    return 'default';
  }

  function normalizeToolMode(raw) {
    var mode = String(raw || '').toLowerCase();
    if (mode === 'move' || mode === 'draw' || mode === 'inspect') return mode;
    return 'edit';
  }

  function normalizeDrawTag(raw) {
    var tag = String(raw || '').toLowerCase();
    var allowed = {
      div: true, section: true, p: true, span: true,
      h1: true, h2: true, h3: true, button: true, img: true
    };
    return allowed[tag] ? tag : 'div';
  }

  function findBestDescendant(root, selector, predicate, pointX, pointY) {
    var descendants = root.querySelectorAll ? root.querySelectorAll(selector) : [];
    var best = null;
    var bestArea = Number.POSITIVE_INFINITY;
    var bestDistance = Number.POSITIVE_INFINITY;
    for (var d = 0; d < descendants.length; d++) {
      var candidate = descendants[d];
      if (!candidate || candidate === root) continue;
      if (predicate && !predicate(candidate)) continue;
      var rect = candidate.getBoundingClientRect ? candidate.getBoundingClientRect() : null;
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      var distance = 0;
      if (pointX !== null && pointY !== null) {
        var dx = pointX < rect.left ? (rect.left - pointX) : (pointX > rect.right ? (pointX - rect.right) : 0);
        var dy = pointY < rect.top ? (rect.top - pointY) : (pointY > rect.bottom ? (pointY - rect.bottom) : 0);
        distance = (dx * dx) + (dy * dy);
      }
      var area = rect.width * rect.height;
      if (
        distance < bestDistance ||
        (distance === bestDistance && area < bestArea)
      ) {
        best = candidate;
        bestArea = area;
        bestDistance = distance;
      }
    }
    return best;
  }

  function applySelectionModeDecorations() {
    if (!document || !document.body) return;
    var staleImages = document.querySelectorAll('.__nx-preview-image-candidate');
    for (var si = 0; si < staleImages.length; si++) {
      staleImages[si].classList.remove('__nx-preview-image-candidate');
    }
    var staleCss = document.querySelectorAll('.__nx-preview-css-candidate');
    for (var sc = 0; sc < staleCss.length; sc++) {
      staleCss[sc].classList.remove('__nx-preview-css-candidate');
    }
    if (!isPreviewEditMode()) return;
    if (__previewSelectionMode === 'image') {
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (isElementImageCandidate(el)) {
          el.classList.add('__nx-preview-image-candidate');
        }
      }
    } else if (__previewSelectionMode === 'css') {
      var cssEls = document.querySelectorAll('body *');
      for (var j = 0; j < cssEls.length; j++) {
        var cssEl = cssEls[j];
        if (isPreviewBaseSelectable(cssEl)) {
          cssEl.classList.add('__nx-preview-css-candidate');
        }
      }
    }
  }

  function getPreviewSelectableTarget(node, event) {
    var current = node && node.nodeType === 1 ? node : (node && node.parentElement ? node.parentElement : null);
    var pointX = event && typeof event.clientX === 'number' ? event.clientX : null;
    var pointY = event && typeof event.clientY === 'number' ? event.clientY : null;
    while (current && current !== document.body) {
      if (!isPreviewBaseSelectable(current)) {
        current = current.parentElement;
        continue;
      }
      if (__previewSelectionMode === 'text') {
        if (hasOwnTextNode(current)) return current;
        var nearText = findBestDescendant(
          current,
          'p,span,h1,h2,h3,h4,h5,h6,a,button,label,strong,em,small,b,i,u,li,td,th,blockquote,pre,div',
          hasOwnTextNode,
          pointX,
          pointY,
        );
        if (nearText) return nearText;
      } else if (__previewSelectionMode === 'image') {
        if (isElementImageCandidate(current)) return current;
        var nearImage = findBestDescendant(current, '*', isElementImageCandidate, pointX, pointY);
        if (nearImage) return nearImage;
      } else {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getPreviewElementPath(el) {
    if (!el || !document.body || !document.body.contains(el)) return null;
    var path = [];
    var cursor = el;
    while (cursor && cursor !== document.body) {
      var parent = cursor.parentElement;
      if (!parent) return null;
      var children = parent.children;
      var idx = -1;
      for (var i = 0; i < children.length; i++) {
        if (children[i] === cursor) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return null;
      path.unshift(idx);
      cursor = parent;
    }
    return path;
  }

  function readElementByPath(path) {
    if (!document.body || !path || !path.length) return null;
    var cursor = document.body;
    for (var i = 0; i < path.length; i++) {
      var idx = Number(path[i]);
      if (!isFinite(idx) || idx < 0) return null;
      var children = cursor.children || [];
      cursor = children[idx];
      if (!cursor) return null;
    }
    return cursor;
  }

  function toCamelStyleKey(raw) {
    return String(raw || '').replace(/-([a-z])/g, function(_all, c) { return c.toUpperCase(); });
  }

  function toCssStyleKey(raw) {
    return String(raw || '').replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
  }

  function normalizeFontFamilyValue(raw) {
    var value = String(raw || '').trim();
    if (!value) return '';
    if (value.indexOf(',') > -1) return value;
    if (
      (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") ||
      (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"')
    ) {
      return value;
    }
    var lower = value.toLowerCase();
    if (
      lower === 'serif' ||
      lower === 'sans-serif' ||
      lower === 'monospace' ||
      lower === 'cursive' ||
      lower === 'fantasy' ||
      lower === 'system-ui'
    ) {
      return value;
    }
    if (/\\s/.test(value)) {
      return "'" + value.replace(/'/g, "\\\\'") + "'";
    }
    return value;
  }

  function getElementComputedStyles(el) {
    var out = {};
    if (!el || !window.getComputedStyle) return out;
    try {
      var computed = window.getComputedStyle(el);
      for (var i = 0; i < computed.length; i++) {
        var key = computed[i];
        var value = computed.getPropertyValue(key);
        if (!value) continue;
        out[toCamelStyleKey(key)] = value;
      }
    } catch (e) {}
    return out;
  }

  function getCustomAttributes(el) {
    var out = {};
    if (!el || !el.attributes) return out;
    var reserved = { id: true, class: true, style: true, src: true, href: true };
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (!attr || !attr.name) continue;
      var lower = String(attr.name).toLowerCase();
      if (reserved[lower]) continue;
      out[attr.name] = attr.value || '';
    }
    return out;
  }

  function applyStylePatchToElement(el, styles) {
    if (!el || !el.style || !styles || typeof styles !== 'object') return;
    for (var key in styles) {
      if (!Object.prototype.hasOwnProperty.call(styles, key)) continue;
      var cssKey = toCssStyleKey(key);
      var rawValue = styles[key];
      var value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
      if (cssKey === 'font-family') {
        value = normalizeFontFamilyValue(value);
      }
      if (!value) {
        el.style.removeProperty(cssKey);
      } else {
        if (cssKey === 'animation') {
          el.style.setProperty('animation', 'none');
          if (typeof el.offsetWidth === 'number') {
            el.offsetWidth;
          }
        }
        el.style.setProperty(cssKey, value, cssKey === 'font-family' ? 'important' : '');
      }
    }
  }

  function canInlineEdit(el) {
    if (!el) return false;
    if (el.isContentEditable) return false;
    var tag = String(el.tagName || '').toLowerCase();
    if (!__previewEditableTags[tag]) return false;
    if (el.closest('svg,canvas,video,audio,iframe,select,input,textarea')) return false;
    return true;
  }

  function ensureHoverBadge() {
    if (__previewHoverBadge && document.body && document.body.contains(__previewHoverBadge)) {
      return __previewHoverBadge;
    }
    if (!document.body) return null;
    var badge = document.createElement('div');
    badge.setAttribute('data-preview-hover-badge', 'true');
    badge.style.display = 'none';
    document.body.appendChild(badge);
    __previewHoverBadge = badge;
    return badge;
  }

  function ensureHoverOutline() {
    if (__previewHoverOutline && document.body && document.body.contains(__previewHoverOutline)) {
      return __previewHoverOutline;
    }
    if (!document.body) return null;
    var outline = document.createElement('div');
    outline.setAttribute('data-preview-hover-outline', 'true');
    outline.style.display = 'none';
    document.body.appendChild(outline);
    __previewHoverOutline = outline;
    return outline;
  }

  function getElementMetaLabel(el, rect) {
    if (!el) return '';
    var width = rect ? Math.max(0, Math.round(rect.width)) : 0;
    var height = rect ? Math.max(0, Math.round(rect.height)) : 0;
    var tag = String(el.tagName || 'div').toLowerCase();
    var id = el.id ? ('#' + el.id) : '';
    var cls = '';
    if (typeof el.className === 'string' && el.className.trim()) {
      cls = '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.');
    }
    var dims = width + 'x' + height;
    if (__previewSelectionMode === 'image') {
      var imgSrc = extractImageSource(el);
      var shortSrc = imgSrc ? imgSrc.slice(0, 72) : '';
      return tag + id + cls + '  ' + dims + (shortSrc ? ('  ' + shortSrc) : '');
    }
    if (__previewSelectionMode === 'css') {
      var cssSnippet = '';
      try {
        var computed = window.getComputedStyle(el);
        if (computed) {
          var display = computed.display ? ('display:' + computed.display) : '';
          var position = computed.position ? ('position:' + computed.position) : '';
          var color = computed.color ? ('color:' + computed.color) : '';
          cssSnippet = [display, position, color].filter(Boolean).join('; ');
        }
      } catch (e) {}
      return tag + id + cls + '  ' + dims + (cssSnippet ? ('  ' + cssSnippet) : '');
    }
    return tag + id + cls + '  ' + dims;
  }

  function updateHoverBadgePosition() {
    if (!isPreviewEditMode() || !__previewHoverEl || __previewEditingEl) {
      if (__previewHoverBadge) __previewHoverBadge.style.display = 'none';
      if (__previewHoverOutline) __previewHoverOutline.style.display = 'none';
      return;
    }
    var badge = ensureHoverBadge();
    var outline = ensureHoverOutline();
    if (!badge || !outline) return;
    var rect = __previewHoverEl.getBoundingClientRect ? __previewHoverEl.getBoundingClientRect() : null;
    if (!rect) {
      badge.style.display = 'none';
      outline.style.display = 'none';
      return;
    }
    outline.style.display = 'block';
    outline.style.left = Math.round(rect.left - 2) + 'px';
    outline.style.top = Math.round(rect.top - 2) + 'px';
    outline.style.width = Math.max(0, Math.round(rect.width + 4)) + 'px';
    outline.style.height = Math.max(0, Math.round(rect.height + 4)) + 'px';

    badge.textContent = getElementMetaLabel(__previewHoverEl, rect);
    badge.style.display = 'block';
    var top = rect.top - badge.offsetHeight - 10;
    if (top < 6) top = rect.bottom + 10;
    var left = rect.left + 2;
    var maxLeft = Math.max(6, window.innerWidth - badge.offsetWidth - 6);
    if (left > maxLeft) left = maxLeft;
    if (left < 6) left = 6;
    badge.style.left = Math.round(left) + 'px';
    badge.style.top = Math.round(top) + 'px';
  }

  function setPreviewHover(el) {
    if (__previewHoverEl === el) {
      return;
    }
    __previewHoverEl = el || null;
    updateHoverBadgePosition();
  }

  function requestHoverUpdate() {
    if (__previewHoverRaf) return;
    __previewHoverRaf = requestAnimationFrame(function() {
      __previewHoverRaf = 0;
      updateHoverBadgePosition();
    });
  }

  function beginInlineEdit(el) {
    if (!el || !canInlineEdit(el)) return;
    if (__previewEditingEl && __previewEditingEl !== el) {
      __previewEditingEl.blur();
    }
    var path = getPreviewElementPath(el);
    if (!path) return;

    __previewEditingEl = el;
    el.classList.add('__nx-preview-editing');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-nx-inline-editing', 'true');
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (e) {}
    try { el.focus(); } catch (e) {}

    var done = false;
    var normalizeEditableHtml = function(raw) {
      var html = String(raw || '');
      html = html.split('<div><br></div>').join('<br>');
      html = html.split('<div>').join('<br>');
      html = html.split('</div>').join('');
      html = html.split('<p>').join('<br>');
      html = html.split('</p>').join('');
      while (
        html.startsWith('<br>') ||
        html.startsWith('<br/>') ||
        html.startsWith('<br />')
      ) {
        if (html.startsWith('<br />')) {
          html = html.slice(6);
        } else if (html.startsWith('<br/>')) {
          html = html.slice(5);
        } else {
          html = html.slice(4);
        }
      }
      return html;
    };
    var insertLineBreakAtCursor = function() {
      try {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var range = sel.getRangeAt(0);
        range.deleteContents();
        var br = document.createElement('br');
        range.insertNode(br);
        range.setStartAfter(br);
        range.setEndAfter(br);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
    };
    var finish = function(commit) {
      if (done) return;
      done = true;
      el.removeEventListener('blur', onBlur, true);
      el.removeEventListener('keydown', onKeyDown, true);
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-nx-inline-editing');
      el.classList.remove('__nx-preview-editing');
      __previewEditingEl = null;
      if (commit) {
        postPreviewMessage('PREVIEW_INLINE_EDIT', {
          path: path,
          html: normalizeEditableHtml(el.innerHTML)
        });
      }
    };

    var onBlur = function() {
      finish(true);
    };
    var onKeyDown = function(event) {
      if (!event) return;
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        insertLineBreakAtCursor();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };

    el.addEventListener('blur', onBlur, true);
    el.addEventListener('keydown', onKeyDown, true);
  }

  function emitPathChanged() {
    postPreviewMessage('PREVIEW_PATH_CHANGED', {
      path: window.location.pathname || ''
    });
  }

  try {
    syncModeFromHost();
    if (!document.querySelector('style[data-preview-inline-editor]')) {
      var __previewStyle = document.createElement('style');
      __previewStyle.setAttribute('data-preview-inline-editor', 'true');
      __previewStyle.textContent =
        '.__nx-preview-selected{outline:2px solid rgba(14,165,233,0.95)!important;outline-offset:1px;}' +
        '.__nx-preview-editing{outline:2px dashed rgba(249,115,22,0.95)!important;outline-offset:1px;}' +
        '.__nx-preview-image-candidate{outline:2px solid rgba(245,158,11,0.92)!important;outline-offset:1px;}' +
        '.__nx-preview-css-candidate{outline:1px solid rgba(56,189,248,0.65)!important;outline-offset:0px;}' +
        '.__nx-preview-dirty{box-shadow:inset 0 0 0 2px rgba(245,158,11,0.95)!important;}' +
        '.__nx-draw-new{outline:2px dashed rgba(99,102,241,0.85)!important;outline-offset:0!important;}' +
        '[data-preview-draw-draft="true"]{position:fixed;z-index:2147483645;pointer-events:none;border:2px dashed rgba(250,204,21,0.95);background:rgba(250,204,21,0.18);border-radius:6px;box-shadow:0 0 0 1px rgba(234,179,8,0.7);}'+
        '[data-preview-hover-outline="true"]{position:fixed;z-index:2147483646;pointer-events:none;border:3px solid rgba(16,185,129,0.98);background:rgba(16,185,129,0.12);border-radius:8px;box-shadow:0 0 0 1px rgba(5,150,105,0.9),0 12px 28px rgba(0,0,0,0.28);transition:left .14s cubic-bezier(.2,.8,.2,1),top .14s cubic-bezier(.2,.8,.2,1),width .14s cubic-bezier(.2,.8,.2,1),height .14s cubic-bezier(.2,.8,.2,1),opacity .12s ease;}' +
        '[data-preview-hover-badge="true"]{position:fixed;z-index:2147483647;pointer-events:none;background:rgba(2,6,23,0.99);color:#ecfeff;border:3px solid rgba(34,211,238,0.95);font:800 20px/1.3 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace;letter-spacing:.2px;padding:12px 16px;border-radius:12px;white-space:nowrap;max-width:94vw;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 0 rgba(0,0,0,0.45);box-shadow:0 16px 32px rgba(2,6,23,0.6);}' +
        '[data-nx-inline-editing="true"]{cursor:text!important;}' +
        '@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}' +
        '@keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}' +
        '@keyframes zoomIn{from{transform:scale(0.8);opacity:0;}to{transform:scale(1);opacity:1;}}' +
        '@keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}' +
        '@keyframes pulse{0%{opacity:1;}50%{opacity:.5;}100%{opacity:1;}}' +
        '@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}' +
        '@keyframes flip{0%{transform:perspective(400px) rotateY(90deg);opacity:0;}100%{transform:perspective(400px) rotateY(0deg);opacity:1;}}' +
        '@keyframes wiggle{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(3deg);}}' +
        '@keyframes revealScroll{from{opacity:0;transform:translateY(30px);}to{opacity:1;transform:translateY(0);}}';
      if (document.head) document.head.appendChild(__previewStyle);
    }
  } catch (e) {}

  window.addEventListener('message', function(event) {
    var payload = event && event.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        return;
      }
    }
    if (!payload || !payload.type) return;
    if (payload.type === 'PREVIEW_SET_MODE') {
      var nextMode = payload.mode === 'preview' ? 'preview' : 'edit';
      __previewSelectionMode = normalizeSelectionMode(payload.selectionMode);
      __previewToolMode = normalizeToolMode(payload.toolMode);
      __previewDrawTag = normalizeDrawTag(payload.drawTag);
      __previewMode = nextMode;
      // Clear temporary draw-highlight and selection state
      // whenever the user switches away from draw mode.
      if (__previewToolMode !== 'draw') {
        var drawNewEls = document.querySelectorAll('.__nx-draw-new');
        for (var di = 0; di < drawNewEls.length; di++) {
          drawNewEls[di].classList.remove('__nx-draw-new');
        }
        // Also clear the element selection outline — the drawn element should not
        // remain highlighted with the blue border after you switch tools.
        clearPreviewSelection();
        clearPreviewHover();
      }
      if (nextMode !== 'edit') {
        __previewMoveDrag = null;
        __previewDrawState = null;
        if (__previewDrawDraft) {
          __previewDrawDraft.style.display = 'none';
        }
        if (document.body) {
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        }
      }
      if (nextMode !== 'edit') {
        clearPreviewSelection();
        clearPreviewHover();
        applySelectionModeDecorations();
      } else {
        applySelectionModeDecorations();
        requestHoverUpdate();
      }
      return;
    }
    if (payload.type === 'PREVIEW_APPLY_STYLE') {
      var target = null;
      if (payload.path && payload.path.length) {
        target = readElementByPath(payload.path);
      }
      if (!target && __previewSelectedEl && document.body && document.body.contains(__previewSelectedEl)) {
        target = __previewSelectedEl;
      }
      if (!target) {
        target = document.querySelector('.__nx-preview-selected');
      }
      if (target) {
        applyStylePatchToElement(target, payload.styles);
      }
    }
    if (payload.type === 'PREVIEW_INJECT_ELEMENT') {
      var injectParentPath = payload.parentPath;
      var injectTag = typeof payload.tag === 'string' ? payload.tag : 'div';
      var injectStyles = payload.styles || {};
      var injectIndex = typeof payload.index === 'number' ? payload.index : -1;
      var injectParent = null;
      if (Array.isArray(injectParentPath) && injectParentPath.length > 0) {
        injectParent = readElementByPath(injectParentPath);
      }
      if (!injectParent) injectParent = document.body;
      if (!injectParent) return;
      // Ensure the parent is positioned so absolute children are visible
      if (injectParent !== document.body) {
        var computedParentPos = window.getComputedStyle(injectParent).position;
        if (!computedParentPos || computedParentPos === 'static') {
          injectParent.style.position = 'relative';
        }
      }
      var newEl = document.createElement(injectTag);
      applyStylePatchToElement(newEl, injectStyles);
      // Default visual so empty divs are visible
      var lowerInjectTag = injectTag.toLowerCase();
      if (lowerInjectTag === 'img') {
        newEl.setAttribute('src', 'https://picsum.photos/420/260');
        newEl.setAttribute('alt', 'Image');
      } else if (lowerInjectTag === 'p' || lowerInjectTag === 'span' || lowerInjectTag === 'button' || lowerInjectTag === 'h1' || lowerInjectTag === 'h2' || lowerInjectTag === 'h3') {
        newEl.textContent = 'New Text';
      } else if (lowerInjectTag === 'div' || lowerInjectTag === 'section' || lowerInjectTag === 'article' || lowerInjectTag === 'aside' || lowerInjectTag === 'main' || lowerInjectTag === 'header' || lowerInjectTag === 'footer' || lowerInjectTag === 'nav') {
        // Apply temporary highlight class — no inline styles saved to HTML.
        newEl.classList.add('__nx-draw-new');
      }
      // Insert at the correct child index
      var refSibling = injectIndex >= 0 ? (injectParent.children[injectIndex] || null) : null;
      injectParent.insertBefore(newEl, refSibling);
      // Transfer selection to this new element
      var prevSelected = document.querySelectorAll('.__nx-preview-selected');
      for (var si = 0; si < prevSelected.length; si++) {
        prevSelected[si].classList.remove('__nx-preview-selected');
      }
      __previewSelectedEl = newEl;
      newEl.classList.add('__nx-preview-selected');
      newEl.classList.add('__nx-draw-new');
      // Emit a select event back to the host so the right panel syncs
      var newPath = Array.isArray(injectParentPath) ? injectParentPath.slice() : [];
      newPath.push(injectIndex >= 0 ? injectIndex : injectParent.children.length - 1);
      var computedStyles = getElementComputedStyles(newEl);
      window.parent.postMessage(JSON.stringify({
        type: 'PREVIEW_SELECT',
        path: newPath,
        tag: injectTag,
        id: newEl.id || '',
        className: newEl.className || '',
        attributes: getCustomAttributes(newEl),
        text: newEl.textContent || '',
        inlineStyle: newEl.getAttribute('style') || '',
        computedStyles: computedStyles
      }), '*');
    }
  });

  try {
    var __PUSH = history.pushState ? history.pushState.bind(history) : null;
    if (__PUSH) {
      history.pushState = function() {
        var result = __PUSH.apply(history, arguments);
        emitPathChanged();
        return result;
      };
    }
    var __REPLACE = history.replaceState ? history.replaceState.bind(history) : null;
    if (__REPLACE) {
      history.replaceState = function() {
        var result = __REPLACE.apply(history, arguments);
        emitPathChanged();
        return result;
      };
    }
    window.addEventListener('popstate', emitPathChanged);
    window.addEventListener('hashchange', emitPathChanged);
    setTimeout(emitPathChanged, 0);
  } catch (e) {}

  function isInsideInlineEditor(target) {
    if (!__previewEditingEl || !target || !target.nodeType) return false;
    return target === __previewEditingEl || (__previewEditingEl.contains && __previewEditingEl.contains(target));
  }

  function swallowInteraction(event) {
    if (!isPreviewEditMode()) return;
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') return;
    if (!event) return;
    var target = event.target;
    if (isInsideInlineEditor(target)) return;
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  var __BLOCK_INTERACTION_EVENTS = [
    'touchstart',
    'touchmove',
    'touchend',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointermove',
    'pointerup',
    'dragstart',
    'wheel'
  ];
  for (var __blockIdx = 0; __blockIdx < __BLOCK_INTERACTION_EVENTS.length; __blockIdx++) {
    document.addEventListener(__BLOCK_INTERACTION_EVENTS[__blockIdx], swallowInteraction, true);
  }

  var __NAV_KEYS = {
    ArrowLeft: true,
    ArrowRight: true,
    ArrowUp: true,
    ArrowDown: true,
    PageUp: true,
    PageDown: true,
    Home: true,
    End: true,
    ' ': true,
    Spacebar: true
  };
  document.addEventListener('keydown', function(event) {
    if (!isPreviewEditMode()) return;
    if (!event) return;
    if (isInsideInlineEditor(event.target)) return;
    var key = event.key || '';
    if (!__NAV_KEYS[key]) return;
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    if (event.cancelable) {
      event.preventDefault();
    }
  }, true);

  function ensureDrawDraftElement() {
    if (__previewDrawDraft && document.body && document.body.contains(__previewDrawDraft)) {
      return __previewDrawDraft;
    }
    if (!document.body) return null;
    var draft = document.createElement('div');
    draft.setAttribute('data-preview-draw-draft', 'true');
    draft.style.display = 'none';
    document.body.appendChild(draft);
    __previewDrawDraft = draft;
    return draft;
  }

  document.addEventListener('mousedown', function(event) {
    if (!isPreviewEditMode()) return;
    if (!event || event.button !== 0) return;
    if (__previewEditingEl) return;
    var target = event.target;
    if (__previewToolMode === 'move') {
      var selected = getPreviewSelectableTarget(target, event);
      if (!selected) return;
      var path = getPreviewElementPath(selected);
      if (!path || !path.length) return;
      var parent = selected.offsetParent || selected.parentElement;
      if (!parent || !parent.getBoundingClientRect) return;
      var parentRect = parent.getBoundingClientRect();
      var selectedRect = selected.getBoundingClientRect();
      var computed = window.getComputedStyle(selected);
      var parsedLeft = parseFloat(computed.left || '');
      var parsedTop = parseFloat(computed.top || '');
      var startLeft = isFinite(parsedLeft) ? parsedLeft : (selectedRect.left - parentRect.left + parent.scrollLeft);
      var startTop = isFinite(parsedTop) ? parsedTop : (selectedRect.top - parentRect.top + parent.scrollTop);
      var currentPosition = String(computed.position || '').toLowerCase();
      var lockSize = !(currentPosition === 'absolute' || currentPosition === 'fixed');
      __previewMoveDrag = {
        element: selected,
        path: path,
        parent: parent,
        parentRect: parentRect,
        parentScrollLeft: parent.scrollLeft || 0,
        parentScrollTop: parent.scrollTop || 0,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startLeft: startLeft,
        startTop: startTop,
        latestLeft: startLeft,
        latestTop: startTop,
        width: selectedRect.width || selected.offsetWidth || 0,
        height: selectedRect.height || selected.offsetHeight || 0,
        lockSize: lockSize,
        hasDragged: false
      };
      selectPreviewElement(selected);
      if (document.body) {
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
      }
      selected.style.cursor = 'grabbing';
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (__previewToolMode === 'draw') {
      var parentTarget = getPreviewSelectableTarget(target, event);
      if (!parentTarget) parentTarget = document.body;
      if (!parentTarget || parentTarget === document.documentElement) parentTarget = document.body;
      var parentPath = parentTarget === document.body ? [] : (getPreviewElementPath(parentTarget) || []);
      var parentRectForDraw = parentTarget.getBoundingClientRect ? parentTarget.getBoundingClientRect() : null;
      if (!parentRectForDraw) return;
      var startX = event.clientX - parentRectForDraw.left + (parentTarget.scrollLeft || 0);
      var startY = event.clientY - parentRectForDraw.top + (parentTarget.scrollTop || 0);
      __previewDrawState = {
        parent: parentTarget,
        parentPath: parentPath,
        parentRect: parentRectForDraw,
        startX: startX,
        startY: startY,
        latestX: startX,
        latestY: startY
      };
      var draft = ensureDrawDraftElement();
      if (draft) {
        draft.style.display = 'block';
        draft.style.left = Math.round(event.clientX) + 'px';
        draft.style.top = Math.round(event.clientY) + 'px';
        draft.style.width = '0px';
        draft.style.height = '0px';
      }
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
    }
  }, true);

  document.addEventListener('mousemove', function(event) {
    if (!isPreviewEditMode()) return;
    if (__previewMoveDrag) {
      var drag = __previewMoveDrag;
      var dx = event.clientX - drag.startClientX;
      var dy = event.clientY - drag.startClientY;
      if (!drag.hasDragged && Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return;
      }
      if (!drag.hasDragged) {
        drag.hasDragged = true;
        drag.element.style.position = 'absolute';
        drag.element.style.left = Math.round(drag.startLeft) + 'px';
        drag.element.style.top = Math.round(drag.startTop) + 'px';
        if (drag.lockSize) {
          drag.element.style.width = Math.round(drag.width) + 'px';
          drag.element.style.height = Math.round(drag.height) + 'px';
        }
      }
      var maxLeft = Math.max(0, (drag.parent.clientWidth || drag.parentRect.width) - drag.width);
      var maxTop = Math.max(0, (drag.parent.clientHeight || drag.parentRect.height) - drag.height);
      var nextLeft = Math.max(0, Math.min(maxLeft, drag.startLeft + dx));
      var nextTop = Math.max(0, Math.min(maxTop, drag.startTop + dy));
      drag.latestLeft = nextLeft;
      drag.latestTop = nextTop;
      drag.element.style.left = Math.round(nextLeft) + 'px';
      drag.element.style.top = Math.round(nextTop) + 'px';
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (__previewDrawState) {
      var draw = __previewDrawState;
      var parentRectNow = draw.parent.getBoundingClientRect ? draw.parent.getBoundingClientRect() : draw.parentRect;
      if (!parentRectNow) return;
      var currentX = event.clientX - parentRectNow.left + (draw.parent.scrollLeft || 0);
      var currentY = event.clientY - parentRectNow.top + (draw.parent.scrollTop || 0);
      draw.latestX = currentX;
      draw.latestY = currentY;
      var leftInParent = Math.min(draw.startX, currentX);
      var topInParent = Math.min(draw.startY, currentY);
      var widthInParent = Math.abs(currentX - draw.startX);
      var heightInParent = Math.abs(currentY - draw.startY);
      var draftBox = ensureDrawDraftElement();
      if (draftBox) {
        draftBox.style.display = 'block';
        draftBox.style.left = Math.round(parentRectNow.left - (draw.parent.scrollLeft || 0) + leftInParent) + 'px';
        draftBox.style.top = Math.round(parentRectNow.top - (draw.parent.scrollTop || 0) + topInParent) + 'px';
        draftBox.style.width = Math.round(widthInParent) + 'px';
        draftBox.style.height = Math.round(heightInParent) + 'px';
      }
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
    }
  }, true);

  document.addEventListener('mouseup', function(event) {
    if (__previewMoveDrag) {
      var drag = __previewMoveDrag;
      __previewMoveDrag = null;
      if (document.body) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
      drag.element.style.cursor = 'grab';
      if (drag.hasDragged && drag.path && drag.path.length) {
        var moveStyles = {
          position: 'absolute',
          left: Math.round(drag.latestLeft) + 'px',
          top: Math.round(drag.latestTop) + 'px'
        };
        if (drag.lockSize) {
          moveStyles.width = Math.round(drag.width) + 'px';
          moveStyles.height = Math.round(drag.height) + 'px';
        }
        postPreviewMessage('PREVIEW_MOVE_COMMIT', {
          path: drag.path,
          styles: moveStyles
        });
      }
      if (event) {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
      }
      return;
    }
    if (__previewDrawState) {
      var draw = __previewDrawState;
      __previewDrawState = null;
      var draft = ensureDrawDraftElement();
      if (draft) draft.style.display = 'none';
      var left = Math.min(draw.startX, draw.latestX);
      var top = Math.min(draw.startY, draw.latestY);
      var width = Math.abs(draw.latestX - draw.startX);
      var height = Math.abs(draw.latestY - draw.startY);
      if (width >= 6 && height >= 6) {
        postPreviewMessage('PREVIEW_DRAW_CREATE', {
          parentPath: draw.parentPath || [],
          tag: __previewDrawTag,
          styles: {
            position: 'absolute',
            left: Math.round(left) + 'px',
            top: Math.round(top) + 'px',
            width: Math.round(width) + 'px',
            height: Math.round(height) + 'px',
            zIndex: '50'
          }
        });
      }
      if (event) {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
      }
    }
  }, true);

  document.addEventListener('click', function(event) {
    if (!isPreviewEditMode()) return;
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') return;
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    var target = event && event.target;
    var selected = getPreviewSelectableTarget(target, event);
    if (selected) {
      selectPreviewElement(selected);
    }

    if (__previewEditingEl) return;
    if (!target || !target.closest) return;
    if (event.detail && event.detail > 1) return;
    var anchor = target.closest('a[href]');
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('mousemove', function(event) {
    if (!isPreviewEditMode()) return;
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') return;
    if (__previewEditingEl) return;
    var target = event && event.target;
    var hovered = getPreviewSelectableTarget(target, event);
    setPreviewHover(hovered || null);
  }, true);

  document.addEventListener('mouseleave', function() {
    clearPreviewHover();
  }, true);
  window.addEventListener('scroll', requestHoverUpdate, true);
  window.addEventListener('resize', requestHoverUpdate, true);

  document.addEventListener('dblclick', function(event) {
    if (!isPreviewEditMode()) return;
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') return;
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    if (__previewEditingEl) return;
    var target = event && event.target;
    var selected = getPreviewSelectableTarget(target, event);
    if (!selected || !canInlineEdit(selected)) return;
    event.preventDefault();
    event.stopPropagation();
    clearPreviewHover();
    beginInlineEdit(selected);
  }, true);
})();
`;

const toCssPropertyName = (key: string): string =>
  key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const CSS_GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

const normalizeFontFamilyCssValue = (raw: string): string => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) return trimmed;
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed;
  }
  if (CSS_GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())) return trimmed;
  if (/\s/.test(trimmed)) {
    return `'${trimmed.replace(/'/g, "\\'")}'`;
  }
  return trimmed;
};

const readElementByPath = (root: Element, path: number[]): Element | null => {
  let cursor: Element | null = root;
  for (const step of path) {
    if (!cursor) return null;
    const childElements: Element[] = Array.from(cursor.children);
    cursor = childElements[step] ?? null;
  }
  return cursor;
};

const normalizePreviewPath = (rawPath: unknown): number[] | null => {
  if (!Array.isArray(rawPath)) return null;
  const normalized = rawPath
    .map((segment) => Number(segment))
    .filter((segment) => Number.isFinite(segment))
    .map((segment) => Math.max(0, Math.trunc(segment)));
  if (normalized.length !== rawPath.length) return null;
  return normalized;
};

const parseInlineStyleText = (styleText: string): React.CSSProperties => {
  const styles: Record<string, string> = {};
  if (!styleText) return styles as React.CSSProperties;
  const entries = styleText
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const colonIndex = entry.indexOf(":");
    if (colonIndex <= 0) continue;
    const rawKey = entry.slice(0, colonIndex).trim();
    const rawValue = entry.slice(colonIndex + 1).trim();
    if (!rawKey) continue;
    const camelKey = rawKey.replace(/-([a-z])/g, (_all, c: string) =>
      c.toUpperCase(),
    );
    styles[camelKey] = rawValue;
  }
  return styles as React.CSSProperties;
};

const extractComputedStylesFromElement = (
  element: Element | null,
): React.CSSProperties | null => {
  if (!element || !(element instanceof HTMLElement)) return null;
  const computed = window.getComputedStyle(element);
  const out: Record<string, string> = {};
  for (let i = 0; i < computed.length; i += 1) {
    const key = computed[i];
    const value = computed.getPropertyValue(key);
    if (!value) continue;
    const camelKey = key.replace(/-([a-z])/g, (_all, c: string) =>
      c.toUpperCase(),
    );
    out[camelKey] = value;
  }
  return out as React.CSSProperties;
};

const RESERVED_ATTRIBUTE_NAMES = new Set(["id", "class", "style", "src", "href"]);

const extractCustomAttributesFromElement = (
  element: Element | null,
): Record<string, string> | undefined => {
  if (!element || !element.attributes) return undefined;
  const out: Record<string, string> = {};
  const attrs = element.attributes;
  for (let index = 0; index < attrs.length; index += 1) {
    const attr = attrs.item(index);
    if (!attr || !attr.name) continue;
    if (RESERVED_ATTRIBUTE_NAMES.has(attr.name.toLowerCase())) continue;
    out[attr.name] = attr.value ?? "";
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const normalizeEditorMultilineText = (raw: string): string => {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());

  let start = 0;
  let end = lines.length - 1;
  while (start <= end && !lines[start]) start += 1;
  while (end >= start && !lines[end]) end -= 1;
  if (start > end) return "";

  const compacted: string[] = [];
  let previousEmpty = false;
  for (const line of lines.slice(start, end + 1)) {
    const isEmpty = line.length === 0;
    if (isEmpty && previousEmpty) continue;
    compacted.push(line);
    previousEmpty = isEmpty;
  }
  return compacted.join("\n");
};

const extractTextWithBreaks = (element: Element | null): string => {
  if (!element) return "";
  let out = "";
  const normalizeExtractedTextNode = (raw: string): string => {
    if (!raw) return "";
    const normalized = raw.replace(/\r\n?/g, "\n");
    if (normalized.trim().length === 0) {
      // Keep inline spacing, drop formatting-only line breaks from pretty HTML.
      return /[\n\r]/.test(normalized) ? "" : " ";
    }
    const lines = normalized
      .split("\n")
      .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim());
    const nonEmptyCount = lines.reduce(
      (count, line) => count + (line.length > 0 ? 1 : 0),
      0,
    );
    if (nonEmptyCount <= 1) {
      return normalized.replace(/[ \t\f\v]+/g, " ").trim();
    }
    return lines.join("\n");
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += normalizeExtractedTextNode(node.textContent || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName.toLowerCase() === "br") {
      out += "\n";
      return;
    }
    Array.from(el.childNodes).forEach(walk);
  };
  Array.from(element.childNodes).forEach(walk);
  return normalizeEditorMultilineText(out);
};

const applyMultilineTextToElement = (element: Element, text: string): void => {
  const normalized = normalizeEditorMultilineText(text);
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
  const lines = normalized.split("\n");
  lines.forEach((line, index) => {
    element.appendChild(element.ownerDocument.createTextNode(line));
    if (index < lines.length - 1) {
      element.appendChild(element.ownerDocument.createElement("br"));
    }
  });
};

type PreviewHistoryEntry = {
  past: string[];
  present: string;
  future: string[];
};

const addElementToTree = (
  root: VirtualElement,
  parentId: string,
  newElement: VirtualElement,
  position: "inside" | "before" | "after" = "inside",
): VirtualElement => {
  if (root.id === parentId && position === "inside") {
    return { ...root, children: [...root.children, newElement] };
  }
  if (
    root.children.some((child) => child.id === parentId) &&
    position !== "inside"
  ) {
    const targetIndex = root.children.findIndex(
      (child) => child.id === parentId,
    );
    const newChildren = [...root.children];
    if (position === "before") newChildren.splice(targetIndex, 0, newElement);
    else newChildren.splice(targetIndex + 1, 0, newElement);
    return { ...root, children: newChildren };
  }
  let didChange = false;
  const nextChildren = root.children.map((child) => {
    const updatedChild = addElementToTree(child, parentId, newElement, position);
    if (updatedChild !== child) {
      didChange = true;
    }
    return updatedChild;
  });
  if (!didChange) return root;
  return { ...root, children: nextChildren };
};

// --- Device Context Menu ---
const DeviceContextMenu: React.FC<{
  type: "mobile" | "desktop" | "tablet";
  position: { x: number; y: number };
  mobileFrameStyle: "dynamic-island" | "punch-hole" | "notch";
  setMobileFrameStyle: (s: "dynamic-island" | "punch-hole" | "notch") => void;
  desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
  setDesktopResolution: (
    r: "1080p" | "1.5k" | "2k" | "4k" | "resizable",
  ) => void;
  tabletModel: "ipad" | "ipad-pro";
  setTabletModel: (m: "ipad" | "ipad-pro") => void;
  onClose: () => void;
}> = ({
  type,
  position,
  mobileFrameStyle,
  setMobileFrameStyle,
  desktopResolution,
  setDesktopResolution,
  tabletModel,
  setTabletModel,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClickOut);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOut);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  const mobileItems = [
    { label: "📱  iPhone — Dynamic Island", value: "dynamic-island" as const },
    { label: "📱  iPhone — Notch", value: "notch" as const },
    { label: "🤖  Android — Punch Hole", value: "punch-hole" as const },
  ];

  const desktopItems = [
    { label: "🖥️  1080p (1920 × 1080)", value: "1080p" as const },
    { label: "🖥️  1.5K (1600 × 900)", value: "1.5k" as const },
    { label: "🖥️  2K (2560 × 1440)", value: "2k" as const },
    { label: "🖥️  4K (3840 × 2160)", value: "4k" as const },
    { label: "↔️  Resizable", value: "resizable" as const },
  ];

  const tabletItems = [
    { label: "iPad (1536 x 2048)", value: "ipad" as const },
    { label: "iPad Pro (2048 x 2732)", value: "ipad-pro" as const },
  ];

  const items =
    type === "mobile"
      ? mobileItems
      : type === "desktop"
        ? desktopItems
        : tabletItems;
  const currentValue =
    type === "mobile"
      ? mobileFrameStyle
      : type === "desktop"
        ? desktopResolution
        : tabletModel;

  return (
    <div
      ref={ref}
      className="fixed z-[2000] py-1.5 rounded-xl overflow-hidden animate-fadeIn"
      style={{
        left: position.x,
        top: position.y,
        minWidth: "200px",
        background: "var(--bg-glass-strong)",
        backdropFilter: "blur(24px)",
        border: "1px solid var(--border-color)",
        boxShadow: "0 12px 40px -8px rgba(0,0,0,0.5)",
      }}
    >
      <div
        className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {type === "mobile"
          ? "Frame Style"
          : type === "desktop"
            ? "Resolution"
            : "iPad Model"}
      </div>
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => {
            if (type === "mobile") setMobileFrameStyle(item.value as any);
            else if (type === "desktop")
              setDesktopResolution(item.value as any);
            else setTabletModel(item.value as any);
            onClose();
          }}
          className="w-full px-3 py-2 text-left text-[12px] font-medium flex items-center gap-2 transition-all duration-150"
          style={{
            color:
              currentValue === item.value
                ? "var(--accent-primary)"
                : "var(--text-main)",
            backgroundColor:
              currentValue === item.value
                ? "var(--accent-glow)"
                : "transparent",
          }}
          onMouseEnter={(e) => {
            if (currentValue !== item.value)
              e.currentTarget.style.backgroundColor = "var(--input-bg)";
          }}
          onMouseLeave={(e) => {
            if (currentValue !== item.value)
              e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <span>{item.label}</span>
          {currentValue === item.value && (
            <span className="ml-auto text-[10px] opacity-60">✓</span>
          )}
        </button>
      ))}
    </div>
  );
};

type PreviewConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
type PreviewConsoleEntry = {
  id: number;
  level: PreviewConsoleLevel;
  message: string;
  source: string;
  time: number;
};
type PreviewSelectionMode = "default" | "text" | "image" | "css";
const PREVIEW_SELECTION_MODE_OPTIONS: Array<{
  value: PreviewSelectionMode;
  label: string;
}> = [
  { value: "default", label: "Default" },
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "css", label: "CSS" },
];

const App: React.FC = () => {
  // --- Neutralino Setup ---
  useEffect(() => {
    Neutralino.events.on("ready", () =>
      console.log("Neutralino functionality is ready."),
    );
  }, []);

  // --- State ---
  const [root, setRoot] = useState<VirtualElement>(INITIAL_ROOT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: INITIAL_ROOT,
    future: [],
  });
  const [files, setFiles] = useState<FileMap>({});
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [previewMountBasePath, setPreviewMountBasePath] = useState<
    string | null
  >(null);
  const [isPreviewMountReady, setIsPreviewMountReady] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [previewSyncedFile, setPreviewSyncedFile] = useState<string | null>(
    null,
  );
  const [previewNavigationFile, setPreviewNavigationFile] = useState<
    string | null
  >(null);
  const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile" | "tablet">(
    "tablet",
  );
  const [interactionMode, setInteractionMode] = useState<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >("edit");
  const [sidebarToolMode, setSidebarToolMode] = useState<
    "edit" | "inspect" | "draw" | "move"
  >("edit");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("preview");
  const [previewSelectionMode, setPreviewSelectionMode] =
    useState<PreviewSelectionMode>("default");
  const [availableFonts, setAvailableFonts] =
    useState<string[]>(DEFAULT_EDITOR_FONTS);
  const [drawElementTag, setDrawElementTag] = useState<string>("div");
  const [showTerminal, setShowTerminal] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] = useState<"terminal" | "console">(
    "terminal",
  );
  const [previewConsoleEntries, setPreviewConsoleEntries] = useState<
    PreviewConsoleEntry[]
  >([]);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      // Ignore storage errors and use default theme.
    }
    return "light";
  });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREVIEW_AUTOSAVE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const [dirtyPathKeysByFile, setDirtyPathKeysByFile] = useState<
    Record<string, string[]>
  >({});

  // Design Revamp States
  const [mobileFrameStyle, setMobileFrameStyle] = useState<
    "dynamic-island" | "punch-hole" | "notch"
  >("dynamic-island");
  const [desktopResolution, setDesktopResolution] = useState<
    "1080p" | "1.5k" | "2k" | "4k" | "resizable"
  >("1080p");
  const [tabletModel, setTabletModel] = useState<"ipad" | "ipad-pro">("ipad");
  const [tabletOrientation, setTabletOrientation] = useState<
    "portrait" | "landscape"
  >("landscape");
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
  const [frameZoom, setFrameZoom] = useState<50 | 75 | 100>(100);
  const [deviceCtxMenu, setDeviceCtxMenu] = useState<{
    type: "mobile" | "desktop" | "tablet";
    x: number;
    y: number;
  } | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  // Keep both implementations available: switch to "docked" anytime.
  const panelLayoutMode: "docked" | "floating" = "floating";
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState("");
  const [previewSelectedPath, setPreviewSelectedPath] = useState<
    number[] | null
  >(null);
  const [previewSelectedElement, setPreviewSelectedElement] =
    useState<VirtualElement | null>(null);
  const [previewSelectedComputedStyles, setPreviewSelectedComputedStyles] =
    useState<React.CSSProperties | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
  const filePathIndexRef = useRef<Record<string, string>>({});
  const presentationCssPathRef = useRef<string | null>(null);
  const fontCachePathRef = useRef<string | null>(null);
  const previewRootAliasPathRef = useRef<string | null>(null);
  const loadingFilesRef = useRef<Set<string>>(new Set());
  const loadingFilePromisesRef = useRef<
    Partial<Record<string, Promise<string | undefined>>>
  >({});
  const textFileCacheRef = useRef<Record<string, string>>({});
  const binaryAssetUrlCacheRef = useRef<Record<string, string>>({});
  const previewDependencyIndexRef = useRef<Record<string, string[]>>({});
  const filesRef = useRef<FileMap>({});
  const activeFileRef = useRef<string | null>(null);
  const selectedPreviewHtmlRef = useRef<string | null>(null);
  const interactionModeRef = useRef<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >("edit");
  const zenRestoreRef = useRef<{
    isLeftPanelOpen: boolean;
    isRightPanelOpen: boolean;
    showTerminal: boolean;
    interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  } | null>(null);
  const lastPreviewSyncRef = useRef<{
    path: string;
    at: number;
    source: "load" | "navigate" | "path_changed" | "explorer";
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const appRootRef = useRef<HTMLDivElement>(null);
  const leftPanelResizeStartXRef = useRef(0);
  const leftPanelResizeStartWidthRef = useRef(256);
  const leftPanelPendingWidthRef = useRef(256);
  const leftPanelResizeRafRef = useRef<number | null>(null);
  const previewConsoleSeqRef = useRef(0);
  const previewConsoleBufferRef = useRef<PreviewConsoleEntry[]>([]);
  const previewConsoleFlushTimerRef = useRef<number | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingPreviewWritesRef = useRef<Record<string, string>>({});
  const previewHistoryRef = useRef<Record<string, PreviewHistoryEntry>>({});
  const previewDocCacheRef = useRef<Record<string, string>>({});
  const previewDocCacheOrderRef = useRef<string[]>([]);
  const autoSaveTimerRef = useRef<number | null>(null);
  const lastPreviewPageSignalRef = useRef<{ path: string; at: number } | null>(
    null,
  );
  const BASE_STAGE_PADDING = 40;
  const LEFT_PANEL_MIN_WIDTH = 220;
  const LEFT_PANEL_MAX_WIDTH = 520;
  const RIGHT_PANEL_WIDTH = 264;
  const previewConsoleErrorCount = useMemo(
    () =>
      previewConsoleEntries.reduce(
        (count, item) => count + (item.level === "error" ? 1 : 0),
        0,
      ),
    [previewConsoleEntries],
  );
  const previewConsoleWarnCount = useMemo(
    () =>
      previewConsoleEntries.reduce(
        (count, item) => count + (item.level === "warn" ? 1 : 0),
        0,
      ),
    [previewConsoleEntries],
  );
  const appendPreviewConsole = useCallback(
    (level: PreviewConsoleLevel, message: string, source = "preview") => {
      const nextId = previewConsoleSeqRef.current + 1;
      previewConsoleSeqRef.current = nextId;
      previewConsoleBufferRef.current.push({
        id: nextId,
        level,
        message,
        source,
        time: Date.now(),
      });
      if (previewConsoleFlushTimerRef.current !== null) return;
      previewConsoleFlushTimerRef.current = window.setTimeout(() => {
        previewConsoleFlushTimerRef.current = null;
        const buffered = previewConsoleBufferRef.current.splice(0);
        if (buffered.length === 0) return;
        setPreviewConsoleEntries((prev) => {
          const next = [...prev, ...buffered];
          return next.length > MAX_PREVIEW_CONSOLE_ENTRIES
            ? next.slice(next.length - MAX_PREVIEW_CONSOLE_ENTRIES)
            : next;
        });
      }, 120);
    },
    [],
  );

  const revokeBinaryAssetUrls = useCallback(() => {
    const cache = binaryAssetUrlCacheRef.current;
    for (const url of Object.values(cache)) {
      if (typeof url === "string" && url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revoke failures for stale object URLs.
        }
      }
    }
    binaryAssetUrlCacheRef.current = {};
  }, []);

  const persistLoadedContentToState = useCallback(
    (path: string, content: string) => {
      setFiles((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        if (
          typeof existing.content === "string" &&
          existing.content.length > 0 &&
          existing.content === content
        ) {
          return prev;
        }
        return {
          ...prev,
          [path]: {
            ...existing,
            content,
          },
        };
      });
    },
    [],
  );

  const invalidatePreviewDocCache = useCallback((path: string) => {
    if (!path) return;
    delete previewDocCacheRef.current[path];
    previewDocCacheOrderRef.current = previewDocCacheOrderRef.current.filter(
      (item) => item !== path,
    );
  }, []);

  const cachePreviewDoc = useCallback((path: string, doc: string) => {
    if (!path) return;
    previewDocCacheRef.current[path] = doc;
    const nextOrder = previewDocCacheOrderRef.current.filter(
      (item) => item !== path,
    );
    nextOrder.push(path);

    let totalChars = nextOrder.reduce(
      (sum, key) => sum + (previewDocCacheRef.current[key]?.length || 0),
      0,
    );
    while (
      nextOrder.length > MAX_PREVIEW_DOC_CACHE_ENTRIES ||
      totalChars > MAX_PREVIEW_DOC_CACHE_CHARS
    ) {
      const evicted = nextOrder.shift();
      if (!evicted) break;
      totalChars -= previewDocCacheRef.current[evicted]?.length || 0;
      delete previewDocCacheRef.current[evicted];
    }

    previewDocCacheOrderRef.current = nextOrder;
  }, []);

  // Desktop only: both panels open in overlay mode with horizontal scroll.
  const isFloatingPanels = panelLayoutMode === "floating";
  const bothPanelsOpen =
    !isFloatingPanels &&
    isLeftPanelOpen &&
    isRightPanelOpen &&
    deviceMode !== "mobile";
  const rightOverlayInset = bothPanelsOpen ? RIGHT_PANEL_WIDTH : 0;
  const floatingHorizontalInset =
    isFloatingPanels && deviceMode !== "mobile"
      ? (isLeftPanelOpen ? leftPanelWidth : 0) +
        (isRightPanelOpen ? leftPanelWidth : 0)
      : 0;
  useEffect(() => {
    const next: FileMap = { ...files };
    for (const [path, content] of Object.entries(
      textFileCacheRef.current,
    ) as Array<[string, string]>) {
      const existing = next[path];
      if (
        existing &&
        (typeof existing.content !== "string" || existing.content.length === 0)
      ) {
        next[path] = { ...existing, content };
      }
    }
    for (const [path, content] of Object.entries(
      binaryAssetUrlCacheRef.current,
    ) as Array<[string, string]>) {
      const existing = next[path];
      if (
        existing &&
        (typeof existing.content !== "string" || existing.content.length === 0)
      ) {
        next[path] = { ...existing, content };
      }
    }
    filesRef.current = next;
  }, [files]);
  useEffect(() => {
    return () => {
      revokeBinaryAssetUrls();
      if (previewConsoleFlushTimerRef.current !== null) {
        window.clearTimeout(previewConsoleFlushTimerRef.current);
      }
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [revokeBinaryAssetUrls]);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);
  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  const setActiveFileStable = useCallback((nextPath: string | null) => {
    activeFileRef.current = nextPath;
    setActiveFile((prev) => (prev === nextPath ? prev : nextPath));
  }, []);
  const persistProjectFontCache = useCallback(
    async (fontFamilies: string[]) => {
      const cacheVirtualPath = fontCachePathRef.current;
      if (!cacheVirtualPath) return;
      const cacheAbsolutePath = filePathIndexRef.current[cacheVirtualPath];
      if (!cacheAbsolutePath) return;
      const payload: FontCachePayload = {
        version: FONT_CACHE_VERSION,
        source: "presentation.css",
        generatedAt: new Date().toISOString(),
        fonts: dedupeFontFamilies(fontFamilies),
      };
      const serialized = JSON.stringify(payload, null, 2);
      try {
        await (Neutralino as any).filesystem.writeFile(
          cacheAbsolutePath,
          serialized,
        );
      } catch (error) {
        console.warn("Failed to write font cache file:", error);
        return;
      }
      setFiles((prev) => {
        const existing = prev[cacheVirtualPath];
        const name = cacheVirtualPath.includes("/")
          ? cacheVirtualPath.slice(cacheVirtualPath.lastIndexOf("/") + 1)
          : cacheVirtualPath;
        if (existing) {
          return {
            ...prev,
            [cacheVirtualPath]: {
              ...existing,
              content: serialized,
            },
          };
        }
        return {
          ...prev,
          [cacheVirtualPath]: {
            path: cacheVirtualPath,
            name,
            type: inferFileType(name),
            content: serialized,
          },
        };
      });
    },
    [],
  );
  const handleAddFontToPresentationCss = useCallback(
    async (rawFontPath: string) => {
      const fontPath = normalizeProjectRelative(rawFontPath);
      const file = filesRef.current[fontPath];
      if (!file || file.type !== "font") return;
      if (!fontPath.toLowerCase().startsWith(`${SHARED_FONT_VIRTUAL_DIR}/`)) {
        window.alert(
          `Font must be inside "${SHARED_FONT_VIRTUAL_DIR}" to register.`,
        );
        return;
      }

      const presentationPath =
        presentationCssPathRef.current ??
        findFilePathCaseInsensitive(
          filesRef.current,
          PRESENTATION_CSS_VIRTUAL_PATH,
        );
      if (!presentationPath) {
        window.alert(
          `presentation.css not found at "${PRESENTATION_CSS_VIRTUAL_PATH}".`,
        );
        return;
      }
      presentationCssPathRef.current = presentationPath;
      const presentationAbsolutePath =
        filePathIndexRef.current[presentationPath];
      if (!presentationAbsolutePath) {
        window.alert("Unable to resolve presentation.css absolute path.");
        return;
      }

      let currentCss = "";
      try {
        const rawCss = await (Neutralino as any).filesystem.readFile(
          presentationAbsolutePath,
        );
        currentCss = typeof rawCss === "string" ? rawCss : String(rawCss || "");
      } catch (error) {
        console.warn("Failed reading presentation.css:", error);
        window.alert("Unable to read presentation.css.");
        return;
      }

      const family = deriveFontFamilyFromFontFileName(file.name);
      const existingFamilies = parsePresentationCssFontFamilies(currentCss);
      const alreadyRegistered = existingFamilies.some(
        (name) => name.toLowerCase() === family.toLowerCase(),
      );
      if (alreadyRegistered) {
        setAvailableFonts(buildEditorFontOptions(existingFamilies));
        await persistProjectFontCache(existingFamilies);
        return;
      }

      const relativeFontPath = relativePathBetweenVirtualFiles(
        presentationPath,
        fontPath,
      );
      const fontFormat = fontFormatFromFileName(file.name);
      const fontFaceBlock =
        `@font-face {\n` +
        `  font-family: '${family}';\n` +
        `  src: url('${relativeFontPath}') format('${fontFormat}');\n` +
        `  font-weight: normal;\n` +
        `  font-style: normal;\n` +
        `  font-display: swap;\n` +
        `}`;
      const nextCss = `${currentCss.trimEnd()}\n\n${fontFaceBlock}\n`;

      try {
        await (Neutralino as any).filesystem.writeFile(
          presentationAbsolutePath,
          nextCss,
        );
      } catch (error) {
        console.warn("Failed writing presentation.css:", error);
        window.alert("Unable to update presentation.css.");
        return;
      }

      setFiles((prev) => {
        const existing = prev[presentationPath];
        if (!existing) return prev;
        return {
          ...prev,
          [presentationPath]: {
            ...existing,
            content: nextCss,
          },
        };
      });
      const nextProjectFamilies = parsePresentationCssFontFamilies(nextCss);
      setAvailableFonts(buildEditorFontOptions(nextProjectFamilies));
      await persistProjectFontCache(nextProjectFamilies);
    },
    [persistProjectFontCache],
  );
  const shouldProcessPreviewPageSignal = useCallback((path: string) => {
    if (!path) return false;
    const now = Date.now();
    const last = lastPreviewPageSignalRef.current;
    if (last && last.path === path && now - last.at < 700) {
      return false;
    }
    lastPreviewPageSignalRef.current = { path, at: now };
    return true;
  }, []);
  const syncPreviewActiveFile = useCallback(
    (
      nextPath: string,
      source: "load" | "navigate" | "path_changed" | "explorer",
    ) => {
      if (!nextPath) return;
      setPreviewSyncedFile((prev) => (prev === nextPath ? prev : nextPath));
      if (source === "navigate" || source === "explorer") {
        setPreviewNavigationFile((prev) =>
          prev === nextPath ? prev : nextPath,
        );
      }

      if (source === "load" || source === "path_changed") {
        if (interactionModeRef.current !== "preview") {
          setInteractionMode("preview");
        }
        return;
      }

      if (activeFileRef.current === nextPath) return;

      const now = Date.now();
      const last = lastPreviewSyncRef.current;
      if (
        last &&
        last.path === nextPath &&
        last.source !== source &&
        now - last.at < 1200
      ) {
        return;
      }

      lastPreviewSyncRef.current = { path: nextPath, at: now, source };
      setActiveFileStable(nextPath);
      if (interactionModeRef.current !== "preview") {
        setInteractionMode("preview");
      }
    },
    [setActiveFileStable],
  );
  useEffect(() => {
    console.log("Both panels open?", bothPanelsOpen, {
      isLeftPanelOpen,
      isRightPanelOpen,
      deviceMode,
    });
  }, [bothPanelsOpen, isLeftPanelOpen, isRightPanelOpen, deviceMode]);
  useLayoutEffect(() => {
    if (
      (bothPanelsOpen || floatingHorizontalInset > 0) &&
      scrollerRef.current
    ) {
      const el = scrollerRef.current;
      const alignInitialScroll = () => {
        // Center default view; user can still scroll both sides manually.
        el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      };

      // Multiple attempts while transitions settle.
      alignInitialScroll();
      requestAnimationFrame(() => {
        alignInitialScroll();
        setTimeout(alignInitialScroll, 100);
        setTimeout(alignInitialScroll, 300);
        setTimeout(alignInitialScroll, 550);
        setTimeout(alignInitialScroll, 700);
      });
    }
  }, [
    bothPanelsOpen,
    floatingHorizontalInset,
    desktopResolution,
    deviceMode,
    isLeftPanelOpen,
    isRightPanelOpen,
  ]);
  useLayoutEffect(() => {
    if (!scrollerRef.current) return;
    const el = scrollerRef.current;
    const recenter = () => {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    };
    recenter();
    requestAnimationFrame(() => {
      recenter();
      setTimeout(recenter, 120);
      setTimeout(recenter, 260);
    });
  }, [frameZoom]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors.
    }
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem(
        PREVIEW_AUTOSAVE_STORAGE_KEY,
        autoSaveEnabled ? "1" : "0",
      );
    } catch {
      // Ignore storage errors.
    }
  }, [autoSaveEnabled]);
  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!saveMenuRef.current) return;
      if (!saveMenuRef.current.contains(event.target as Node)) {
        setIsSaveMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);
  useEffect(
    () => () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      if (previewConsoleFlushTimerRef.current !== null) {
        window.clearTimeout(previewConsoleFlushTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!appRootRef.current) return;
    appRootRef.current.style.setProperty(
      "--left-panel-width",
      `${leftPanelWidth}px`,
    );
  }, [leftPanelWidth]);

  useEffect(() => {
    if (!isResizingLeftPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - leftPanelResizeStartXRef.current;
      leftPanelPendingWidthRef.current = Math.min(
        LEFT_PANEL_MAX_WIDTH,
        Math.max(
          LEFT_PANEL_MIN_WIDTH,
          leftPanelResizeStartWidthRef.current + delta,
        ),
      );
      if (leftPanelResizeRafRef.current !== null) return;
      leftPanelResizeRafRef.current = requestAnimationFrame(() => {
        leftPanelResizeRafRef.current = null;
        if (appRootRef.current) {
          appRootRef.current.style.setProperty(
            "--left-panel-width",
            `${leftPanelPendingWidthRef.current}px`,
          );
        }
      });
    };

    const onMouseUp = () => {
      if (leftPanelResizeRafRef.current !== null) {
        cancelAnimationFrame(leftPanelResizeRafRef.current);
        leftPanelResizeRafRef.current = null;
      }
      setLeftPanelWidth(leftPanelPendingWidthRef.current);
      setIsResizingLeftPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingLeftPanel]);

  const handleLeftPanelResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isLeftPanelOpen) return;
      event.preventDefault();
      leftPanelResizeStartXRef.current = event.clientX;
      leftPanelResizeStartWidthRef.current = leftPanelWidth;
      leftPanelPendingWidthRef.current = leftPanelWidth;
      setIsResizingLeftPanel(true);
    },
    [isLeftPanelOpen, leftPanelWidth],
  );

  // --- History Management ---
  const pushHistory = useCallback((newState: VirtualElement) => {
    setHistory((curr) => ({
      past: [
        ...curr.past.slice(-(MAX_CANVAS_HISTORY - 1)),
        curr.present,
      ],
      present: newState,
      future: [],
    }));
    setRoot(newState);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, -1);
      setRoot(previous);
      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);
      setRoot(next);
      return {
        past: [
          ...curr.past.slice(-(MAX_CANVAS_HISTORY - 1)),
          curr.present,
        ],
        present: next,
        future: newFuture,
      };
    });
  }, []);
  const pushPreviewHistory = useCallback(
    (filePath: string, nextHtml: string, previousHtml?: string) => {
      const current = previewHistoryRef.current[filePath];
      if (!current) {
        const baseline =
          typeof previousHtml === "string" ? previousHtml : "";
        previewHistoryRef.current[filePath] =
          baseline && baseline !== nextHtml
            ? {
                past: [baseline],
                present: nextHtml,
                future: [],
              }
            : {
                past: [],
                present: nextHtml,
                future: [],
              };
        return;
      }
      if (current.present === nextHtml) return;
      previewHistoryRef.current[filePath] = {
        past: [
          ...current.past.slice(-(MAX_PREVIEW_HISTORY - 1)),
          current.present,
        ],
        present: nextHtml,
        future: [],
      };
    },
    [],
  );

  const markPreviewPathDirty = useCallback(
    (filePath: string, elementPath: number[]) => {
      if (!elementPath || elementPath.length === 0) return;
      const key = elementPath.join(".");
      setDirtyPathKeysByFile((prev) => {
        const curr = prev[filePath] || [];
        if (curr.includes(key)) return prev;
        return { ...prev, [filePath]: [...curr, key] };
      });

      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      const liveTarget = readElementByPath(frameDocument.body, elementPath);
      if (liveTarget instanceof HTMLElement) {
        liveTarget.classList.add("__nx-preview-dirty");
      }
    },
    [],
  );
  const flushPendingPreviewSaves = useCallback(async () => {
    const entries = Object.entries(pendingPreviewWritesRef.current);
    if (entries.length === 0) return;

    const savedPaths: string[] = [];
    for (const [filePath, content] of entries) {
      const absolutePath = filePathIndexRef.current[filePath];
      if (!absolutePath) continue;
      try {
        await (Neutralino as any).filesystem.writeFile(absolutePath, content);
        delete pendingPreviewWritesRef.current[filePath];
        savedPaths.push(filePath);
      } catch (error) {
        console.warn(`Failed to save ${filePath}:`, error);
      }
    }
    if (savedPaths.length === 0) return;

    setDirtyFiles((prev) => prev.filter((path) => !savedPaths.includes(path)));
    setDirtyPathKeysByFile((prev) => {
      const next = { ...prev };
      for (const path of savedPaths) {
        delete next[path];
      }
      return next;
    });

    const activePath = selectedPreviewHtmlRef.current;
    if (activePath && savedPaths.includes(activePath)) {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (frameDocument) {
        Array.from(
          frameDocument.querySelectorAll<HTMLElement>(".__nx-preview-dirty"),
        ).forEach((el) => {
          if (el instanceof HTMLElement) {
            el.classList.remove("__nx-preview-dirty");
          }
        });
      }
    }
  }, []);
  const schedulePreviewAutoSave = useCallback(() => {
    if (!autoSaveEnabled) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void flushPendingPreviewSaves();
    }, 1200);
  }, [autoSaveEnabled, flushPendingPreviewSaves]);

  const handlePreviewUndo = useCallback(async () => {
    const filePath = selectedPreviewHtmlRef.current;
    if (!filePath) return;
    const current = previewHistoryRef.current[filePath];
    if (!current || current.past.length === 0) return;
    const previous = current.past[current.past.length - 1];
    previewHistoryRef.current[filePath] = {
      past: current.past.slice(0, -1),
      present: previous,
      future: [current.present, ...current.future],
    };
    textFileCacheRef.current[filePath] = previous;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content: previous,
        },
      };
    });
    pendingPreviewWritesRef.current[filePath] = previous;
    setDirtyFiles((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );
    setDirtyPathKeysByFile((prev) => ({
      ...prev,
      [filePath]: [],
    }));
    const currentEntry = filesRef.current[filePath];
    if (currentEntry) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [filePath]: {
          ...currentEntry,
          content: previous,
        },
      };
      const previewDoc = createPreviewDocument(
        previewSnapshot,
        filePath,
        previewDependencyIndexRef.current[filePath],
      );
      cachePreviewDoc(filePath, previewDoc);
      setSelectedPreviewDoc(previewDoc);
    }
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [cachePreviewDoc, schedulePreviewAutoSave]);

  const handlePreviewRedo = useCallback(async () => {
    const filePath = selectedPreviewHtmlRef.current;
    if (!filePath) return;
    const current = previewHistoryRef.current[filePath];
    if (!current || current.future.length === 0) return;
    const next = current.future[0];
    previewHistoryRef.current[filePath] = {
      past: [
        ...current.past.slice(-(MAX_PREVIEW_HISTORY - 1)),
        current.present,
      ],
      present: next,
      future: current.future.slice(1),
    };
    textFileCacheRef.current[filePath] = next;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content: next,
        },
      };
    });
    pendingPreviewWritesRef.current[filePath] = next;
    setDirtyFiles((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );
    setDirtyPathKeysByFile((prev) => ({
      ...prev,
      [filePath]: [],
    }));
    const currentEntry = filesRef.current[filePath];
    if (currentEntry) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [filePath]: {
          ...currentEntry,
          content: next,
        },
      };
      const previewDoc = createPreviewDocument(
        previewSnapshot,
        filePath,
        previewDependencyIndexRef.current[filePath],
      );
      cachePreviewDoc(filePath, previewDoc);
      setSelectedPreviewDoc(previewDoc);
    }
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [cachePreviewDoc, schedulePreviewAutoSave]);

  const runUndo = useCallback(() => {
    if (
      interactionModeRef.current === "preview" &&
      selectedPreviewHtmlRef.current
    ) {
      void handlePreviewUndo();
      return;
    }
    handleUndo();
  }, [handlePreviewUndo, handleUndo]);

  const runRedo = useCallback(() => {
    if (
      interactionModeRef.current === "preview" &&
      selectedPreviewHtmlRef.current
    ) {
      void handlePreviewRedo();
      return;
    }
    handleRedo();
  }, [handlePreviewRedo, handleRedo]);

  const toggleZenMode = useCallback(() => {
    setIsZenMode((prev) => {
      if (!prev) {
        zenRestoreRef.current = {
          isLeftPanelOpen,
          isRightPanelOpen,
          showTerminal,
          interactionMode,
        };
        setIsLeftPanelOpen(false);
        setIsRightPanelOpen(false);
        setShowTerminal(false);
        setInteractionMode("preview");
        return true;
      }

      const restore = zenRestoreRef.current;
      if (restore) {
        setIsLeftPanelOpen(restore.isLeftPanelOpen);
        setIsRightPanelOpen(restore.isRightPanelOpen);
        setShowTerminal(restore.showTerminal);
        setInteractionMode(restore.interactionMode);
      }
      zenRestoreRef.current = null;
      return false;
    });
  }, [interactionMode, isLeftPanelOpen, isRightPanelOpen, showTerminal]); // --- Keyboard Shortcuts ---
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        target.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const hasModifier = e.ctrlKey || e.metaKey;
      const editableTarget = isEditableTarget(e.target);

      if (key === "escape" && isZenMode) {
        e.preventDefault();
        toggleZenMode();
        return;
      }

      if (!hasModifier && !e.altKey && !editableTarget) {
        if (key === "w") {
          e.preventDefault();
          if (!e.repeat) {
            setIsLeftPanelOpen((prev) => !prev);
          }
          return;
        }
        if (key === "e") {
          e.preventDefault();
          if (!e.repeat) {
            setIsRightPanelOpen((prev) => !prev);
          }
          return;
        }
      }

      if (!hasModifier) return;

      if (key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }
      if (key === "f") {
        e.preventDefault();
        setIsLeftPanelOpen(true);
        setIsRightPanelOpen(true);
        return;
      }
      if (key === "p") {
        e.preventDefault();
        setInteractionMode("preview");
        return;
      }
      if (key === "e") {
        e.preventDefault();
        setSidebarToolMode("edit");
        setInteractionMode("edit");
        return;
      }
      if (key === "`") {
        e.preventDefault();
        setShowTerminal((prev) => !prev);
        return;
      }
      if (key === "j") {
        e.preventDefault();
        toggleZenMode();
        return;
      }
      if (key === "s") {
        e.preventDefault();
        void flushPendingPreviewSaves();
        return;
      }
      if (key === "t") {
        e.preventDefault();
        const candidate =
          previewSyncedFile && filesRef.current[previewSyncedFile]?.type === "html"
            ? previewSyncedFile
            : selectedPreviewHtmlRef.current &&
                filesRef.current[selectedPreviewHtmlRef.current]?.type === "html"
              ? selectedPreviewHtmlRef.current
              : null;
        if (candidate) {
          setPreviewNavigationFile((prev) =>
            prev === candidate ? prev : candidate,
          );
        }
        setPreviewRefreshNonce((prev) => prev + 1);
        return;
      }
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        runUndo();
        return;
      }
      if (key === "u" || key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        runRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    flushPendingPreviewSaves,
    isZenMode,
    previewSyncedFile,
    runRedo,
    runUndo,
    toggleZenMode,
  ]);

  // --- Actions ---
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
      if (deviceMode === "tablet") {
        setIsRightPanelOpen(true);
      }
    },
    [deviceMode],
  );

  const handleUpdateStyle = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      if (!selectedId) return;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        styles: { ...el.styles, ...styles },
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateContent = useCallback(
    (data: { content?: string; src?: string; href?: string }) => {
      if (!selectedId) return;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        ...data,
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateAttributes = useCallback(
    (attributes: Record<string, string>) => {
      if (!selectedId) return;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        attributes,
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateAnimation = useCallback(
    (animation: string) => {
      if (!selectedId) return;
      const nextAnimation =
        typeof animation === "string" ? animation.trim() : "";
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        animation: nextAnimation,
        styles: {
          ...el.styles,
          animation: nextAnimation,
        },
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleMoveElement = useCallback(
    (draggedId: string, targetId: string) => {
      const draggedEl = findElementById(root, draggedId);
      if (!draggedEl) return;
      let newRoot = deleteElementFromTree(root, draggedId);
      newRoot = addElementToTree(newRoot, targetId, draggedEl, "inside");
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleMoveElementByPosition = useCallback(
    (id: string, styles: Partial<React.CSSProperties>) => {
      const target = findElementById(root, id);
      if (!target) return;
      let changed = false;
      for (const [key, value] of Object.entries(styles)) {
        if (
          String((target.styles as any)?.[key] ?? "") !== String(value ?? "")
        ) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      const newRoot = updateElementInTree(root, id, (el) => ({
        ...el,
        styles: { ...el.styles, ...styles },
      }));
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleResize = useCallback(
    (id: string, width: string, height: string) => {
      const newRoot = updateElementInTree(root, id, (el) => ({
        ...el,
        styles: { ...el.styles, width, height },
      }));
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleAddElement = useCallback(
    (type: string, position: "inside" | "before" | "after" = "inside") => {
      const newId = `${type}-${Date.now()}`;
      const newElement: VirtualElement = {
        id: newId,
        type: type as ElementType,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        styles: { padding: "10px", minHeight: "20px" },
        children: [],
        content: ["p", "h1", "h2", "h3", "button", "span"].includes(type)
          ? "New Text"
          : undefined,
      };
      if (type === "img") {
        newElement.src = "https://picsum.photos/200/300";
        newElement.name = "Image";
      }
      const targetId = selectedId || root.id;
      const newRoot = addElementToTree(root, targetId, newElement, position);
      pushHistory(newRoot);
      setSelectedId(newId);
    },
    [root, selectedId, pushHistory],
  );

  const handleDeleteElement = useCallback(() => {
    if (!selectedId || selectedId === "root") return;
    const newRoot = deleteElementFromTree(root, selectedId);
    pushHistory(newRoot);
    setSelectedId(null);
  }, [root, selectedId, pushHistory]);
  const handleSidebarAddElement = useCallback(
    (type: string) => {
      handleAddElement(type, "inside");
    },
    [handleAddElement],
  );
  const handleSidebarAddFontToPresentationCss = useCallback(
    (path: string) => {
      void handleAddFontToPresentationCss(path);
    },
    [handleAddFontToPresentationCss],
  );
  const handlePreviewRefresh = useCallback(() => {
    const candidate =
      previewSyncedFile && filesRef.current[previewSyncedFile]?.type === "html"
        ? previewSyncedFile
        : selectedPreviewHtmlRef.current &&
            filesRef.current[selectedPreviewHtmlRef.current]?.type === "html"
          ? selectedPreviewHtmlRef.current
          : null;
    if (candidate) {
      setPreviewNavigationFile((prev) => (prev === candidate ? prev : candidate));
    }
    setPreviewRefreshNonce((prev) => prev + 1);
  }, [previewSyncedFile]);

  const handleCommandAction = (actionId: string, payload?: any) => {
    switch (actionId) {
      case "undo":
        runUndo();
        break;
      case "redo":
        runRedo();
        break;
      case "view-desktop":
        setDeviceMode("desktop");
        break;
      case "view-mobile":
        setDeviceMode("mobile");
        break;
      case "toggle-preview":
        setInteractionMode((prev) => {
          if (prev === "preview") {
            return sidebarToolMode;
          }
          setSidebarToolMode("edit");
          return "preview";
        });
        break;
      case "clear-selection":
        setSelectedId(null);
        break;
      default:
        if (actionId.startsWith("add-")) handleAddElement(payload, "inside");
    }
  };

  const loadFileContent = useCallback(
    async (
      relativePath: string,
      options?: {
        persistToState?: boolean;
      },
    ) => {
      const persistToState = options?.persistToState ?? true;
      const target = filesRef.current[relativePath];
      if (!target) return;

      if (typeof target.content === "string" && target.content.length > 0) {
        if (target.type === "image" || target.type === "font") {
          binaryAssetUrlCacheRef.current[relativePath] = target.content;
          return target.content;
        }
        textFileCacheRef.current[relativePath] = target.content;
        if (persistToState) {
          persistLoadedContentToState(relativePath, target.content);
        }
        return target.content;
      }

      const cachedText = textFileCacheRef.current[relativePath];
      if (typeof cachedText === "string" && cachedText.length > 0) {
        if (persistToState) {
          persistLoadedContentToState(relativePath, cachedText);
        }
        return cachedText;
      }

      const cachedBinary = binaryAssetUrlCacheRef.current[relativePath];
      if (
        (target.type === "image" || target.type === "font") &&
        typeof cachedBinary === "string" &&
        cachedBinary.length > 0
      ) {
        return cachedBinary;
      }

      const existingPending = loadingFilePromisesRef.current[relativePath];
      if (existingPending) {
        if (
          !persistToState ||
          target.type === "image" ||
          target.type === "font"
        ) {
          return existingPending;
        }
        return existingPending.then((content) => {
          if (typeof content === "string" && content.length > 0) {
            persistLoadedContentToState(relativePath, content);
          }
          return content;
        });
      }

      const absolutePath = filePathIndexRef.current[relativePath];
      if (!absolutePath) return;

      const pending = (async (): Promise<string | undefined> => {
        loadingFilesRef.current.add(relativePath);
        try {
          let content = "";
          if (target.type === "image" || target.type === "font") {
            const binaryData = await (
              Neutralino as any
            ).filesystem.readBinaryFile(absolutePath);
            const bytes = toByteArray(binaryData);
            if (bytes.length === 0) return;
            const mime = mimeFromType(target.type, target.name);
            const sourceBuffer = bytes.buffer;
            const binaryBuffer: ArrayBuffer =
              sourceBuffer instanceof ArrayBuffer
                ? sourceBuffer.slice(
                    bytes.byteOffset,
                    bytes.byteOffset + bytes.byteLength,
                  )
                : (() => {
                    const copy = new Uint8Array(bytes.byteLength);
                    copy.set(bytes);
                    return copy.buffer;
                  })();
            const blob = new Blob([binaryBuffer], { type: mime });
            const previousUrl = binaryAssetUrlCacheRef.current[relativePath];
            if (previousUrl && previousUrl.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(previousUrl);
              } catch {
                // Ignore stale blob revocation errors.
              }
            }
            content = URL.createObjectURL(blob);
            binaryAssetUrlCacheRef.current[relativePath] = content;
          } else {
            const loaded = await (Neutralino as any).filesystem.readFile(
              absolutePath,
            );
            content = typeof loaded === "string" ? loaded : String(loaded || "");
            if (content.length > 0) {
              textFileCacheRef.current[relativePath] = content;
            }
          }

          const existingRefEntry = filesRef.current[relativePath];
          if (existingRefEntry) {
            filesRef.current = {
              ...filesRef.current,
              [relativePath]: {
                ...existingRefEntry,
                content,
              },
            };
          }

          if (persistToState && content.length > 0) {
            persistLoadedContentToState(relativePath, content);
          }

          return content;
        } catch (error) {
          console.warn(`Failed loading file content for ${relativePath}:`, error);
        } finally {
          loadingFilesRef.current.delete(relativePath);
          delete loadingFilePromisesRef.current[relativePath];
        }
      })();

      loadingFilePromisesRef.current[relativePath] = pending;
      return pending;
    },
    [persistLoadedContentToState],
  );

  // --- Neutralino File System Integration ---
  const handleOpenFolder = async () => {
    try {
      const selectedFolder = await (Neutralino as any).os.showFolderDialog(
        "Select project folder",
      );
      if (!selectedFolder) return;

      setIsLeftPanelOpen(true);

      const rootPath = normalizePath(selectedFolder);
      const fsFiles: FileMap = {};
      const absolutePathIndex: Record<string, string> = {};
      let sharedDirectoryPath: string | null = null;
      let nearestSharedParent: string | null = null;

      const upsertIndexedFile = (virtualPath: string, absolutePath: string) => {
        const normalizedVirtual = normalizeProjectRelative(virtualPath);
        if (!normalizedVirtual) return;
        if (fsFiles[normalizedVirtual]) return;
        const name = normalizedVirtual.includes("/")
          ? normalizedVirtual.slice(normalizedVirtual.lastIndexOf("/") + 1)
          : normalizedVirtual;
        fsFiles[normalizedVirtual] = {
          path: normalizedVirtual,
          name,
          type: inferFileType(name),
          content: "",
        };
        absolutePathIndex[normalizedVirtual] = normalizePath(absolutePath);
      };

      const walkDirectory = async (directoryPath: string): Promise<void> => {
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
            await walkDirectory(absolutePath);
            continue;
          }
          if (entry.type !== "FILE") continue;

          const normalizedAbsolute = normalizePath(absolutePath);
          const relativePath = normalizedAbsolute
            .replace(`${rootPath}/`, "")
            .replace(rootPath, "");
          const normalizedRelative = relativePath.replace(/^\/+/, "");
          if (!normalizedRelative) continue;
          upsertIndexedFile(normalizedRelative, normalizedAbsolute);
        }
      };

      const indexSharedDirectory = async (
        sharedRoot: string,
      ): Promise<void> => {
        const sharedBase = normalizePath(sharedRoot);
        const walkShared = async (directoryPath: string): Promise<void> => {
          const entries = await (Neutralino as any).filesystem.readDirectory(
            directoryPath,
          );
          for (const entry of entries as Array<{
            entry: string;
            type: string;
          }>) {
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
            upsertIndexedFile(sharedVirtual, normalizedAbsolute);
          }
        };
        await walkShared(sharedBase);
      };
      const patchMtVeevaCheck = async (sharedRoot: string): Promise<void> => {
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
        const markerBlock = `
        ${markerStart}
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
          const endMarkerIndex = raw.indexOf(markerEnd, startIndex);
          const endLineIndex = raw.indexOf("\n", endMarkerIndex);
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

      await walkDirectory(rootPath);

      // Some legacy projects keep `/shared` as a sibling/ancestor directory.
      // Index all discovered ancestor shared dirs as virtual `shared/...`.
      let cursor: string | null = rootPath;
      for (let level = 0; level < 10 && cursor; level += 1) {
        const sharedCandidate = joinPath(cursor, "shared");
        try {
          await (Neutralino as any).filesystem.readDirectory(sharedCandidate);
          await indexSharedDirectory(sharedCandidate);
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

      if (sharedDirectoryPath) {
        await patchMtVeevaCheck(sharedDirectoryPath);
      }

      const presentationCssVirtualPath = findFilePathCaseInsensitive(
        fsFiles,
        PRESENTATION_CSS_VIRTUAL_PATH,
      );
      presentationCssPathRef.current = presentationCssVirtualPath;

      let fontCacheVirtualPath: string | null = null;
      let fontCacheAbsolutePath: string | null = null;
      if (sharedDirectoryPath) {
        const existingCachePath = findFilePathCaseInsensitive(
          fsFiles,
          FONT_CACHE_VIRTUAL_PATH,
        );
        if (existingCachePath) {
          fontCacheVirtualPath = existingCachePath;
          fontCacheAbsolutePath = absolutePathIndex[existingCachePath] || null;
        } else {
          fontCacheVirtualPath = FONT_CACHE_VIRTUAL_PATH;
          fontCacheAbsolutePath = normalizePath(
            joinPath(sharedDirectoryPath, "js/nocodex-fonts.json"),
          );
          absolutePathIndex[fontCacheVirtualPath] = fontCacheAbsolutePath;
        }
      }
      fontCachePathRef.current = fontCacheVirtualPath;

      let projectFontFamilies: string[] = [];
      let loadedFromCache = false;
      if (fontCacheVirtualPath && fontCacheAbsolutePath) {
        try {
          const cacheRaw = await (Neutralino as any).filesystem.readFile(
            fontCacheAbsolutePath,
          );
          if (typeof cacheRaw === "string" && cacheRaw.trim().length > 0) {
            const cachedFamilies = parseFontCacheFamilies(cacheRaw);
            if (cachedFamilies.length > 0) {
              projectFontFamilies = cachedFamilies;
              loadedFromCache = true;
            }
          }
        } catch {
          // Cache file may not exist yet for first-time projects.
        }
      }

      if (!loadedFromCache && presentationCssVirtualPath) {
        const presentationAbsolutePath =
          absolutePathIndex[presentationCssVirtualPath];
        if (presentationAbsolutePath) {
          try {
            const presentationCss = await (
              Neutralino as any
            ).filesystem.readFile(presentationAbsolutePath);
            if (
              typeof presentationCss === "string" &&
              presentationCss.length > 0
            ) {
              projectFontFamilies =
                parsePresentationCssFontFamilies(presentationCss);
            }
          } catch {
            // Ignore missing presentation.css reads and fall back to fonts folder.
          }
        }
      }

      if (projectFontFamilies.length === 0) {
        projectFontFamilies = collectSharedFontFamiliesFromFileMap(fsFiles);
      }
      setAvailableFonts(buildEditorFontOptions(projectFontFamilies));

      if (
        !loadedFromCache &&
        projectFontFamilies.length > 0 &&
        fontCacheVirtualPath &&
        fontCacheAbsolutePath
      ) {
        const cachePayload: FontCachePayload = {
          version: FONT_CACHE_VERSION,
          source: "presentation.css",
          generatedAt: new Date().toISOString(),
          fonts: dedupeFontFamilies(projectFontFamilies),
        };
        const serializedCache = JSON.stringify(cachePayload, null, 2);
        try {
          await (Neutralino as any).filesystem.writeFile(
            fontCacheAbsolutePath,
            serializedCache,
          );
          if (!fsFiles[fontCacheVirtualPath]) {
            fsFiles[fontCacheVirtualPath] = {
              path: fontCacheVirtualPath,
              name: "nocodex-fonts.json",
              type: inferFileType("nocodex-fonts.json"),
              content: serializedCache,
            };
            absolutePathIndex[fontCacheVirtualPath] = fontCacheAbsolutePath;
          } else {
            fsFiles[fontCacheVirtualPath] = {
              ...fsFiles[fontCacheVirtualPath],
              content: serializedCache,
            };
          }
        } catch (error) {
          console.warn("Failed writing initial font cache:", error);
        }
      }

      const mountBasePath = nearestSharedParent || rootPath;
      const mountBaseName =
        normalizePath(mountBasePath).split("/").filter(Boolean).pop() || "";
      const previewRootAliasPath =
        mountBaseName && !mountBaseName.startsWith(".")
          ? `/${mountBaseName}`
          : null;
      let mountReady = false;
      try {
        const mounts = await (Neutralino as any).server.getMounts();
        if (
          previewRootAliasPathRef.current &&
          mounts?.[previewRootAliasPathRef.current]
        ) {
          await (Neutralino as any).server.unmount(
            previewRootAliasPathRef.current,
          );
        }
        if (mounts?.[PREVIEW_MOUNT_PATH]) {
          await (Neutralino as any).server.unmount(PREVIEW_MOUNT_PATH);
        }
        await (Neutralino as any).server.mount(
          PREVIEW_MOUNT_PATH,
          mountBasePath,
        );
        if (
          previewRootAliasPath &&
          previewRootAliasPath !== PREVIEW_MOUNT_PATH &&
          previewRootAliasPath !== SHARED_MOUNT_PATH &&
          previewRootAliasPath !== SHARED_MOUNT_PATH_IN_PREVIEW
        ) {
          if (mounts?.[previewRootAliasPath]) {
            await (Neutralino as any).server.unmount(previewRootAliasPath);
          }
          await (Neutralino as any).server.mount(
            previewRootAliasPath,
            mountBasePath,
          );
          previewRootAliasPathRef.current = previewRootAliasPath;
        } else {
          previewRootAliasPathRef.current = null;
        }

        if (sharedDirectoryPath) {
          if (mounts?.[SHARED_MOUNT_PATH]) {
            await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH);
          }
          await (Neutralino as any).server.mount(
            SHARED_MOUNT_PATH,
            sharedDirectoryPath,
          );
          if (mounts?.[SHARED_MOUNT_PATH_IN_PREVIEW]) {
            await (Neutralino as any).server.unmount(
              SHARED_MOUNT_PATH_IN_PREVIEW,
            );
          }
          await (Neutralino as any).server.mount(
            SHARED_MOUNT_PATH_IN_PREVIEW,
            sharedDirectoryPath,
          );
        } else if (mounts?.[SHARED_MOUNT_PATH]) {
          await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH);
          if (mounts?.[SHARED_MOUNT_PATH_IN_PREVIEW]) {
            await (Neutralino as any).server.unmount(
              SHARED_MOUNT_PATH_IN_PREVIEW,
            );
          }
        }

        mountReady = true;
      } catch (error) {
        console.warn(
          "Virtual host mount failed. Falling back to srcDoc preview.",
          error,
        );
      }

      filePathIndexRef.current = absolutePathIndex;
      loadingFilesRef.current.clear();
      loadingFilePromisesRef.current = {};
      textFileCacheRef.current = {};
      revokeBinaryAssetUrls();
      previewConsoleSeqRef.current = 0;
      previewConsoleBufferRef.current = [];
      if (previewConsoleFlushTimerRef.current !== null) {
        window.clearTimeout(previewConsoleFlushTimerRef.current);
        previewConsoleFlushTimerRef.current = null;
      }
      setPreviewConsoleEntries([]);
      pendingPreviewWritesRef.current = {};
      previewHistoryRef.current = {};
      previewDependencyIndexRef.current = {};
      previewDocCacheRef.current = {};
      previewDocCacheOrderRef.current = [];
      setDirtyFiles([]);
      setDirtyPathKeysByFile({});
      setFiles(fsFiles);
      setProjectPath(rootPath);
      setPreviewMountBasePath(mountBasePath);
      setIsPreviewMountReady(mountReady);

      const defaultHtmlFile = pickDefaultHtmlFile(fsFiles);
      const firstOpenableFile = Object.values(fsFiles).find((file) =>
        ["html", "css", "js", "unknown"].includes(file.type),
      );
      const initialFile = defaultHtmlFile ?? firstOpenableFile?.path ?? null;
      setActiveFileStable(initialFile);
      setPreviewSyncedFile(initialFile);
      setPreviewNavigationFile(initialFile);
      if (initialFile && fsFiles[initialFile]?.type === "html") {
        setInteractionMode("preview");
      }
    } catch (error) {
      console.error("Failed to open folder:", error);
      alert("Could not open folder. Please try again.");
    }
  };
  const handleSelectFile = useCallback(
    (path: string) => {
      console.log("[Preview] Current page:", path);
      if (activeFileRef.current === path) {
        setIsLeftPanelOpen(true);
        if (
          files[path]?.type === "html" &&
          interactionModeRef.current !== "preview"
        ) {
          setInteractionMode("preview");
        }
        return;
      }
      syncPreviewActiveFile(path, "explorer");
      setIsLeftPanelOpen(true);
    },
    [files, syncPreviewActiveFile],
  );
  const selectedElement = selectedId ? findElementById(root, selectedId) : null;
  const selectedPathIds = useMemo(
    () => collectPathIdsToElement(root, selectedId),
    [root, selectedId],
  );
  const inspectorElement = previewSelectedElement ?? selectedElement;
  const selectedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (previewSyncedFile && files[previewSyncedFile]?.type === "html") {
      return previewSyncedFile;
    }
    if (activeFile && files[activeFile]?.type === "html") return activeFile;
    return pickDefaultHtmlFile(files);
  }, [activeFile, files, previewSyncedFile, projectPath]);
  const selectedMountedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (
      previewNavigationFile &&
      files[previewNavigationFile]?.type === "html"
    ) {
      return previewNavigationFile;
    }
    return selectedPreviewHtml;
  }, [files, previewNavigationFile, projectPath, selectedPreviewHtml]);
  const selectedPreviewSrc = useMemo(() => {
    if (
      !selectedMountedPreviewHtml ||
      !isPreviewMountReady ||
      !previewMountBasePath
    ) {
      return null;
    }
    const absolutePath = filePathIndexRef.current[selectedMountedPreviewHtml];
    if (!absolutePath) return null;
    const relativePath = toMountRelativePath(
      previewMountBasePath,
      absolutePath,
    );
    if (!relativePath) return null;
    const nlPort = String((window as any).NL_PORT || "").trim();
    const previewServerOrigin = nlPort ? `http://127.0.0.1:${nlPort}` : "";
    const mountPath = encodeURI(`${PREVIEW_MOUNT_PATH}/${relativePath}`);
    const withRefresh = `${mountPath}${mountPath.includes("?") ? "&" : "?"}nx_refresh=${previewRefreshNonce}`;
    return previewServerOrigin
      ? `${previewServerOrigin}${withRefresh}`
      : withRefresh;
  }, [
    selectedMountedPreviewHtml,
    isPreviewMountReady,
    previewMountBasePath,
    previewRefreshNonce,
    projectPath,
  ]);
  const isMountedPreview = Boolean(
    selectedPreviewSrc && interactionMode === "preview",
  );
  useEffect(() => {
    if (isMountedPreview) return;
    setPreviewNavigationFile((prev) =>
      prev === selectedPreviewHtml ? prev : selectedPreviewHtml,
    );
  }, [isMountedPreview, selectedPreviewHtml]);
  const shouldPrepareEditPreviewDoc = Boolean(
    selectedPreviewHtml && !isMountedPreview,
  );
  const hasPreviewContent = Boolean(
    projectPath && (selectedPreviewSrc || selectedPreviewDoc),
  );
  useEffect(() => {
    selectedPreviewHtmlRef.current = selectedPreviewHtml;
    setPreviewSelectedPath(null);
    setPreviewSelectedElement(null);
    setPreviewSelectedComputedStyles(null);
  }, [selectedPreviewHtml]);

  const resolveVirtualPathFromMountRelative = useCallback(
    (mountRelativePath: string): string | null => {
      if (!previewMountBasePath || !mountRelativePath) return null;
      const normalizedTarget = normalizeProjectRelative(
        decodeURIComponent(mountRelativePath).replace(/^\/+/, ""),
      ).toLowerCase();
      if (!normalizedTarget) return null;

      for (const virtualPath in filePathIndexRef.current) {
        const absolutePath = filePathIndexRef.current[virtualPath];
        const relative = toMountRelativePath(
          previewMountBasePath,
          absolutePath,
        );
        if (!relative) continue;
        if (relative.toLowerCase() === normalizedTarget) {
          return virtualPath;
        }
      }
      return null;
    },
    [previewMountBasePath],
  );

  const extractMountRelativePath = useCallback(
    (locationPath: string): string | null => {
      if (!locationPath) return null;
      if (locationPath.startsWith(`${PREVIEW_MOUNT_PATH}/`)) {
        return locationPath.slice(PREVIEW_MOUNT_PATH.length + 1);
      }
      const aliasPath = previewRootAliasPathRef.current;
      if (aliasPath && locationPath.startsWith(`${aliasPath}/`)) {
        return locationPath.slice(aliasPath.length + 1);
      }
      return null;
    },
    [],
  );
  const injectMountedPreviewBridge = useCallback(
    (frame: HTMLIFrameElement | null) => {
      const frameWindow = frame?.contentWindow ?? null;
      const frameDocument = frameWindow?.document ?? null;
      if (!frameWindow || !frameDocument) return;
      if (
        frameDocument.documentElement?.getAttribute(
          "data-nx-mounted-preview-bridge",
        ) === "1"
      ) {
        return;
      }
      try {
        const script = frameDocument.createElement("script");
        script.type = "text/javascript";
        script.text = MOUNTED_PREVIEW_BRIDGE_SCRIPT;
        const target =
          frameDocument.head ||
          frameDocument.documentElement ||
          frameDocument.body;
        if (!target) return;
        target.appendChild(script);
        script.remove();
      } catch {
        try {
          (frameWindow as any).eval(MOUNTED_PREVIEW_BRIDGE_SCRIPT);
        } catch {
          // Ignore bridge injection failures for locked-down page contexts.
        }
      }
    },
    [],
  );
  const postPreviewModeToFrame = useCallback(
    (overrides?: {
      mode?: "edit" | "preview";
      selectionMode?: PreviewSelectionMode;
      toolMode?: "edit" | "inspect" | "draw" | "move";
      drawTag?: string;
      force?: boolean;
    }) => {
      const frameWindow =
        previewFrameRef.current?.contentWindow ??
        previewFrameRef.current?.contentDocument?.defaultView ??
        null;
      if (!frameWindow) return;
      const nextMode = overrides?.mode ?? previewMode;
      const nextSelectionMode =
        overrides?.selectionMode ?? previewSelectionMode;
      const nextToolMode = overrides?.toolMode ?? sidebarToolMode;
      const nextDrawTag = overrides?.drawTag ?? drawElementTag;
      const shouldSend = overrides?.force
        ? true
        : interactionMode === "preview";
      if (!shouldSend) return;
      try {
        (frameWindow as any).__nxPreviewHostMode = nextMode;
        (frameWindow as any).__nxPreviewHostSelectionMode = nextSelectionMode;
        (frameWindow as any).__nxPreviewHostToolMode = nextToolMode;
        (frameWindow as any).__nxPreviewHostDrawTag = nextDrawTag;
      } catch {
        // Ignore host flag sync issues for transient frame reloads.
      }
      try {
        frameWindow.postMessage(
          JSON.stringify({
            type: "PREVIEW_SET_MODE",
            mode: nextMode,
            selectionMode: nextSelectionMode,
            toolMode: nextToolMode,
            drawTag: nextDrawTag,
          }),
          "*",
        );
      } catch {
        // Ignore postMessage failures for transient frame reloads.
      }
    },
    [
      drawElementTag,
      interactionMode,
      previewMode,
      previewSelectionMode,
      sidebarToolMode,
    ],
  );
  const setPreviewModeWithSync = useCallback(
    (nextMode: "edit" | "preview") => {
      setPreviewMode(nextMode);
      if (interactionModeRef.current !== "preview") return;
      postPreviewModeToFrame({ mode: nextMode, force: true });
      window.setTimeout(() => {
        postPreviewModeToFrame({ mode: nextMode, force: true });
      }, 50);
      window.setTimeout(() => {
        postPreviewModeToFrame({ mode: nextMode, force: true });
      }, 180);
    },
    [postPreviewModeToFrame],
  );
  const handleSidebarInteractionModeChange = useCallback(
    (nextMode: "edit" | "preview" | "inspect" | "draw" | "move") => {
      if (nextMode === "preview") {
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        return;
      }
      setSidebarToolMode(nextMode);
      if (interactionModeRef.current === "preview") {
        // Keep mounted project visible; only switch preview into edit sub-mode.
        setPreviewModeWithSync("edit");
        postPreviewModeToFrame({
          mode: "edit",
          toolMode: nextMode,
          drawTag: drawElementTag,
          force: true,
        });
        return;
      }
      setInteractionMode(nextMode);
    },
    [drawElementTag, postPreviewModeToFrame, setPreviewModeWithSync],
  );
  const sidebarInteractionMode = useMemo<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >(() => {
    if (interactionMode === "preview") {
      return previewMode === "edit" ? sidebarToolMode : "preview";
    }
    return interactionMode;
  }, [interactionMode, previewMode, sidebarToolMode]);
  const isActivePreviewMessageSource = useCallback(
    (source: MessageEventSource | null): boolean => {
      const activeWindow = previewFrameRef.current?.contentWindow ?? null;
      if (!activeWindow || !source) return false;
      return source === activeWindow;
    },
    [],
  );
  const getLivePreviewSelectedElement = useCallback(
    (path?: number[] | null): Element | null => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return null;
      const byMarker = frameDocument.querySelector(".__nx-preview-selected");
      if (byMarker) return byMarker;
      if (Array.isArray(path) && path.length > 0) {
        const byPath = readElementByPath(frameDocument.body, path);
        if (byPath) return byPath;
      }
      return null;
    },
    [],
  );
  const postPreviewPatchToFrame = useCallback(
    (payload: Record<string, unknown>) => {
      const frameWindow =
        previewFrameRef.current?.contentWindow ??
        previewFrameRef.current?.contentDocument?.defaultView ??
        null;
      if (!frameWindow) return;
      if (interactionModeRef.current !== "preview") return;
      try {
        frameWindow.postMessage(JSON.stringify(payload), "*");
      } catch {
        // Ignore transient frame messaging errors.
      }
    },
    [],
  );

  const handlePreviewFrameLoad = useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      const frame = event.currentTarget;
      if (selectedPreviewSrc) {
        injectMountedPreviewBridge(frame);
      }
      postPreviewModeToFrame();
      window.setTimeout(postPreviewModeToFrame, 0);
      window.setTimeout(postPreviewModeToFrame, 120);
      window.setTimeout(postPreviewModeToFrame, 360);

      if (!isPreviewMountReady) return;
      const frameSrc = frame.getAttribute("src") || frame.src || "";
      if (!frameSrc) return;

      let locationPath = "";
      try {
        locationPath = new URL(frameSrc).pathname || "";
      } catch {
        return;
      }

      if (!locationPath) return;
      const mountRelativePath = extractMountRelativePath(locationPath);
      if (!mountRelativePath) return;
      const resolvedVirtualPath =
        resolveVirtualPathFromMountRelative(mountRelativePath);
      if (!resolvedVirtualPath) return;
      const resolvedFile = filesRef.current[resolvedVirtualPath];
      if (!resolvedFile || resolvedFile.type !== "html") return;
      if (resolvedVirtualPath === activeFileRef.current) return;

      if (!shouldProcessPreviewPageSignal(resolvedVirtualPath)) return;
      console.log("[Preview] Current page:", resolvedVirtualPath);
      syncPreviewActiveFile(resolvedVirtualPath, "load");
    },
    [
      extractMountRelativePath,
      injectMountedPreviewBridge,
      isPreviewMountReady,
      postPreviewModeToFrame,
      resolveVirtualPathFromMountRelative,
      selectedPreviewSrc,
      shouldProcessPreviewPageSignal,
      syncPreviewActiveFile,
    ],
  );
  useEffect(() => {
    if (selectedPreviewSrc) {
      injectMountedPreviewBridge(previewFrameRef.current);
    }
    postPreviewModeToFrame();
    const t0 = window.setTimeout(postPreviewModeToFrame, 0);
    const t120 = window.setTimeout(postPreviewModeToFrame, 120);
    const t360 = window.setTimeout(postPreviewModeToFrame, 360);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t120);
      window.clearTimeout(t360);
    };
  }, [
    injectMountedPreviewBridge,
    postPreviewModeToFrame,
    selectedPreviewDoc,
    selectedPreviewSrc,
    previewMode,
  ]);
  const persistPreviewHtmlContent = useCallback(
    async (
      updatedPath: string,
      serialized: string,
      options?: {
        refreshPreviewDoc?: boolean;
        saveNow?: boolean;
        elementPath?: number[];
        pushToHistory?: boolean;
      },
    ) => {
      const shouldRefreshPreviewDoc = options?.refreshPreviewDoc ?? false;
      const shouldSaveNow = options?.saveNow ?? false;
      const shouldPushToHistory = options?.pushToHistory ?? true;
      const previousSerialized =
        typeof filesRef.current[updatedPath]?.content === "string"
          ? (filesRef.current[updatedPath]?.content as string)
          : typeof textFileCacheRef.current[updatedPath] === "string"
            ? textFileCacheRef.current[updatedPath]
            : "";
      textFileCacheRef.current[updatedPath] = serialized;
      setFiles((prev) => {
        const current = prev[updatedPath];
        if (!current) return prev;
        return {
          ...prev,
          [updatedPath]: {
            ...current,
            content: serialized,
          },
        };
      });
      // Also synchronously update the ref so any code that reads filesRef.current
      // in the same tick (e.g. applyPreviewContentUpdate called right after draw)
      // immediately sees the new HTML with the just-created element.
      const existingRefEntry = filesRef.current[updatedPath];
      if (existingRefEntry) {
        filesRef.current = {
          ...filesRef.current,
          [updatedPath]: { ...existingRefEntry, content: serialized },
        };
      }
      invalidatePreviewDocCache(updatedPath);
      pendingPreviewWritesRef.current[updatedPath] = serialized;
      setDirtyFiles((prev) =>
        prev.includes(updatedPath) ? prev : [...prev, updatedPath],
      );
      if (options?.elementPath && options.elementPath.length > 0) {
        markPreviewPathDirty(updatedPath, options.elementPath);
      }
      if (shouldPushToHistory) {
        pushPreviewHistory(updatedPath, serialized, previousSerialized);
      }

      const currentEntry = filesRef.current[updatedPath];
      if (shouldRefreshPreviewDoc && !isMountedPreview && currentEntry) {
        const previewSnapshot: FileMap = {
          ...filesRef.current,
          [updatedPath]: {
            ...currentEntry,
            content: serialized,
          },
        };
        setSelectedPreviewDoc(
          createPreviewDocument(
            previewSnapshot,
            updatedPath,
            previewDependencyIndexRef.current[updatedPath],
          ),
        );
      }

      if (shouldSaveNow) {
        await flushPendingPreviewSaves();
        return;
      }
      schedulePreviewAutoSave();
    },
    [
      flushPendingPreviewSaves,
      invalidatePreviewDocCache,
      isMountedPreview,
      markPreviewPathDirty,
      pushPreviewHistory,
      schedulePreviewAutoSave,
    ],
  );
  const applyPreviewInlineEdit = useCallback(
    async (elementPath: number[], nextInnerHtml: string) => {
      if (
        !selectedPreviewHtml ||
        !Array.isArray(elementPath) ||
        elementPath.length === 0
      ) {
        return;
      }

      const normalizedPath = elementPath
        .map((segment) => {
          const numeric = Number(segment);
          if (!Number.isFinite(numeric)) return -1;
          return Math.max(0, Math.trunc(numeric));
        })
        .filter((segment) => segment >= 0);

      if (normalizedPath.length !== elementPath.length) return;

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, normalizedPath);
      if (!target) return;

      target.innerHTML = nextInnerHtml;
      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
        elementPath: normalizedPath,
      });
    },
    [loadFileContent, persistPreviewHtmlContent, selectedPreviewHtml],
  );
  const applyPreviewStyleUpdateAtPath = useCallback(
    async (
      elementPath: number[],
      styles: Partial<React.CSSProperties>,
      options?: { syncSelectedElement?: boolean },
    ) => {
      if (
        !selectedPreviewHtml ||
        !Array.isArray(elementPath) ||
        elementPath.length === 0
      ) {
        return;
      }

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, elementPath);
      const liveTarget = getLivePreviewSelectedElement(elementPath);
      if (
        !(target instanceof HTMLElement) &&
        !(liveTarget instanceof HTMLElement)
      )
        return;
      const previewStylePatch: Record<string, string> = {};

      for (const [key, rawValue] of Object.entries(styles)) {
        const cssKey = toCssPropertyName(key);
        const valueRaw =
          rawValue === undefined || rawValue === null ? "" : String(rawValue);
        const value =
          cssKey === "font-family"
            ? normalizeFontFamilyCssValue(valueRaw)
            : valueRaw;
        previewStylePatch[key] = value;
        if (!value) {
          if (target instanceof HTMLElement) {
            target.style.removeProperty(cssKey);
          }
          if (liveTarget instanceof HTMLElement) {
            liveTarget.style.removeProperty(cssKey);
          }
          continue;
        }
        if (target instanceof HTMLElement) {
          target.style.setProperty(
            cssKey,
            value,
            cssKey === "font-family" ? "important" : "",
          );
        }
        if (liveTarget instanceof HTMLElement) {
          if (cssKey === "animation") {
            liveTarget.style.setProperty("animation", "none");
            // Force layout so the next assignment retriggers animation playback.
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            liveTarget.offsetWidth;
          }
          liveTarget.style.setProperty(
            cssKey,
            value,
            cssKey === "font-family" ? "important" : "",
          );
        }
      }
      postPreviewPatchToFrame({
        type: "PREVIEW_APPLY_STYLE",
        path: elementPath,
        styles: previewStylePatch,
      });

      if (target instanceof HTMLElement) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath,
        });
      }

      const pathMatchesSelection =
        Array.isArray(previewSelectedPath) &&
        previewSelectedPath.length === elementPath.length &&
        previewSelectedPath.every(
          (segment, idx) => segment === elementPath[idx],
        );
      const shouldSyncSelected =
        options?.syncSelectedElement ?? pathMatchesSelection;
      if (!shouldSyncSelected) return;

      setPreviewSelectedElement((prev) =>
        prev
          ? {
              ...prev,
              styles: {
                ...prev.styles,
                ...Object.fromEntries(
                  Object.entries(styles).map(([key, rawValue]) => {
                    if (key !== "fontFamily") return [key, rawValue];
                    return [
                      key,
                      typeof rawValue === "string"
                        ? normalizeFontFamilyCssValue(rawValue)
                        : rawValue,
                    ];
                  }),
                ),
              },
            }
          : prev,
      );
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      postPreviewPatchToFrame,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewStyleUpdate = useCallback(
    async (styles: Partial<React.CSSProperties>) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      await applyPreviewStyleUpdateAtPath(previewSelectedPath, styles, {
        syncSelectedElement: true,
      });
    },
    [applyPreviewStyleUpdateAtPath, previewSelectedPath],
  );
  const applyPreviewContentUpdate = useCallback(
    async (data: { content?: string; src?: string; href?: string }) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, previewSelectedPath);
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      if (!target && !liveTarget) return;

      if (typeof data.content === "string") {
        const normalizedText = data.content.replace(/\r\n?/g, "\n");
        if (target) {
          applyMultilineTextToElement(target, normalizedText);
        }
        if (liveTarget) {
          applyMultilineTextToElement(liveTarget, normalizedText);
        }
      }
      if (
        typeof data.src === "string" &&
        (target instanceof HTMLElement || liveTarget instanceof HTMLElement)
      ) {
        const sourceValue = data.src.trim();
        const lowerTag =
          target instanceof HTMLElement
            ? target.tagName.toLowerCase()
            : liveTarget instanceof HTMLElement
              ? liveTarget.tagName.toLowerCase()
              : "";
        const isDirectImageTag =
          lowerTag === "img" || lowerTag === "source" || lowerTag === "video";
        if (isDirectImageTag) {
          if (target instanceof HTMLElement) {
            target.setAttribute("src", sourceValue);
          }
          if (liveTarget instanceof HTMLElement) {
            liveTarget.setAttribute("src", sourceValue);
          }
        } else {
          const nextBackground =
            sourceValue.length === 0
              ? ""
              : /^url\(/i.test(sourceValue)
                ? sourceValue
                : `url("${sourceValue}")`;
          if (nextBackground) {
            if (target instanceof HTMLElement) {
              target.style.setProperty("background-image", nextBackground);
            }
            if (liveTarget instanceof HTMLElement) {
              liveTarget.style.setProperty("background-image", nextBackground);
            }
          } else {
            if (target instanceof HTMLElement) {
              target.style.removeProperty("background-image");
            }
            if (liveTarget instanceof HTMLElement) {
              liveTarget.style.removeProperty("background-image");
            }
          }
        }
      }
      if (typeof data.href === "string") {
        if (target instanceof HTMLElement) {
          target.setAttribute("href", data.href);
        }
        if (liveTarget instanceof HTMLElement) {
          liveTarget.setAttribute("href", data.href);
        }
      }

      if (target) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
      }

      setPreviewSelectedElement((prev) =>
        prev
          ? {
              ...prev,
              ...(typeof data.content === "string"
                ? { content: data.content.replace(/\r\n?/g, "\n") }
                : {}),
              ...(typeof data.src === "string" ? { src: data.src } : {}),
              ...(typeof data.href === "string" ? { href: data.href } : {}),
            }
          : prev,
      );
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewAttributesUpdate = useCallback(
    async (attributes: Record<string, string>) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, previewSelectedPath);
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      if (!target && !liveTarget) return;

      const reserved = new Set(["id", "class", "style", "src", "href"]);
      if (target) {
        const targetAttrs = target.attributes;
        Array.from(targetAttrs).forEach((attr) => {
          if (!reserved.has(attr.name.toLowerCase())) {
            target.removeAttribute(attr.name);
          }
        });
      }
      if (liveTarget) {
        const liveAttrs = liveTarget.attributes;
        Array.from(liveAttrs).forEach((attr) => {
          if (!reserved.has(attr.name.toLowerCase())) {
            liveTarget.removeAttribute(attr.name);
          }
        });
      }
      Object.entries(attributes || {}).forEach(([key, value]) => {
        if (!key) return;
        if (target) {
          target.setAttribute(key, value);
        }
        if (liveTarget) {
          liveTarget.setAttribute(key, value);
        }
      });

      if (target) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
      }

      setPreviewSelectedElement((prev) =>
        prev
          ? {
              ...prev,
              attributes,
            }
          : prev,
      );
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewDeleteSelected = useCallback(async () => {
    if (
      !selectedPreviewHtml ||
      !previewSelectedPath ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return;
    }

    const loaded = await loadFileContent(selectedPreviewHtml);
    const sourceHtml =
      typeof loaded === "string" && loaded.length > 0
        ? loaded
        : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
          ? (filesRef.current[selectedPreviewHtml]?.content as string)
          : "";
    if (!sourceHtml) return;

    const parser = new DOMParser();
    const parsed = parser.parseFromString(sourceHtml, "text/html");
    const target = readElementByPath(parsed.body, previewSelectedPath);
    if (!target || !target.parentElement) return;

    target.parentElement.removeChild(target);

    const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
    if (liveTarget && liveTarget.parentElement) {
      liveTarget.parentElement.removeChild(liveTarget);
    }

    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    const parentPath = previewSelectedPath.slice(0, -1);
    await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
      refreshPreviewDoc: false,
      ...(parentPath.length > 0 ? { elementPath: parentPath } : {}),
    });

    setPreviewSelectedPath(null);
    setPreviewSelectedElement(null);
    setPreviewSelectedComputedStyles(null);
    setSelectedId(null);
  }, [
    getLivePreviewSelectedElement,
    loadFileContent,
    persistPreviewHtmlContent,
    previewSelectedPath,
    selectedPreviewHtml,
  ]);
  const applyPreviewAnimationUpdate = useCallback(
    async (animation: string) => {
      const nextAnimation =
        typeof animation === "string" ? animation.trim() : "";
      await applyPreviewStyleUpdate({ animation: nextAnimation });
      setPreviewSelectedElement((prev) =>
        prev
          ? {
              ...prev,
              animation: nextAnimation,
              styles: {
                ...prev.styles,
                animation: nextAnimation,
              },
            }
          : prev,
      );
    },
    [applyPreviewStyleUpdate],
  );
  const applyPreviewDrawCreate = useCallback(
    async (
      parentPath: number[],
      tag: string,
      rawStyles: Record<string, string>,
    ) => {
      if (!selectedPreviewHtml || !Array.isArray(parentPath)) return;
      const normalizedParentPath = parentPath
        .map((segment) => Number(segment))
        .filter((segment) => Number.isFinite(segment))
        .map((segment) => Math.max(0, Math.trunc(segment)));
      if (normalizedParentPath.length !== parentPath.length) return;

      const loaded = await loadFileContent(selectedPreviewHtml);
      const sourceHtml =
        typeof loaded === "string" && loaded.length > 0
          ? loaded
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const parsedParent =
        normalizedParentPath.length > 0
          ? readElementByPath(parsed.body, normalizedParentPath)
          : parsed.body;
      if (
        !(parsedParent instanceof HTMLElement) &&
        !(parsedParent instanceof HTMLBodyElement)
      ) {
        return;
      }

      const drawTag = normalizePreviewDrawTag(tag);
      const normalizedStyles = Object.fromEntries(
        Object.entries(rawStyles || {}).filter(([key]) => Boolean(key)),
      ) as Record<string, string>;

      const applyStyleMap = (
        el: HTMLElement,
        styleMap: Record<string, string>,
      ) => {
        for (const [key, value] of Object.entries(styleMap)) {
          const cssKey = toCssPropertyName(key);
          const nextValue = String(value ?? "");
          if (!nextValue) {
            el.style.removeProperty(cssKey);
          } else {
            el.style.setProperty(cssKey, nextValue);
          }
        }
      };

      const buildDrawElement = (doc: Document): HTMLElement => {
        const element = doc.createElement(drawTag);
        applyStyleMap(element, normalizedStyles);
        if (drawTag === "img") {
          element.setAttribute("src", "https://picsum.photos/420/260");
          element.setAttribute("alt", "Image");
        } else if (
          drawTag === "p" ||
          drawTag === "span" ||
          drawTag === "button" ||
          drawTag === "h1" ||
          drawTag === "h2" ||
          drawTag === "h3"
        ) {
          element.textContent = "New Text";
        } else if (
          drawTag === "div" ||
          drawTag === "section" ||
          drawTag === "article" ||
          drawTag === "aside" ||
          drawTag === "main" ||
          drawTag === "header" ||
          drawTag === "footer" ||
          drawTag === "nav"
        ) {
          // No default styles saved to HTML — visual highlight is applied via
          // a temporary CSS class (__nx-draw-new) in the iframe only.
        }
        return element;
      };

      const parsedNewElement = buildDrawElement(parsed);
      parsedParent.appendChild(parsedNewElement);
      const newIndex = Math.max(0, parsedParent.children.length - 1);
      const newPath = [...normalizedParentPath, newIndex];

      // Send PREVIEW_INJECT_ELEMENT into the iframe via postMessage.
      // This is the correct architecture — the iframe inserts the element itself,
      // just like how PREVIEW_APPLY_STYLE works. Direct contentDocument mutation
      // can fail in sandboxed/mounted-preview contexts and causes index mismatches.
      postPreviewPatchToFrame({
        type: "PREVIEW_INJECT_ELEMENT",
        parentPath: normalizedParentPath,
        tag: drawTag,
        styles: normalizedStyles,
        index: newIndex,
      });

      // Also update parsedParent positioning in the serialized HTML
      if (normalizedParentPath.length > 0) {
        const computedStyleStr = parsedParent.getAttribute("style") || "";
        if (
          !computedStyleStr.includes("position") ||
          computedStyleStr.includes("position: static") ||
          computedStyleStr.includes("position:static")
        ) {
          parsedParent.style.position = "relative";
        }
      }

      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
        // Do NOT pass elementPath here — that triggers markPreviewPathDirty which
        // adds the orange __nx-preview-dirty overlay. A freshly drawn element is
        // already committed so it should not appear as unsaved.
      });

      // Set optimistic React state immediately so the right panel opens.
      // The iframe will send back PREVIEW_SELECT shortly which will fully sync the state.
      const optimisticInlineStyles = parseInlineStyleText(
        parsedNewElement.getAttribute("style") || "",
      );
      const mergedStyles: React.CSSProperties = {
        ...optimisticInlineStyles,
      };

      const isContainerTag = [
        "div",
        "section",
        "article",
        "aside",
        "main",
        "header",
        "footer",
        "nav",
      ].includes(drawTag);
      const nextElement: VirtualElement = {
        id: `preview-${Date.now()}`,
        type: drawTag,
        name: drawTag.toUpperCase(),
        content:
          drawTag === "img" ? undefined : isContainerTag ? "" : "New Text",
        ...(drawTag === "img" ? { src: "https://picsum.photos/420/260" } : {}),
        styles: mergedStyles,
        children: [],
      };

      setPreviewSelectedPath(newPath);
      setPreviewSelectedElement(nextElement);
      setPreviewSelectedComputedStyles(null);
      setSelectedId(null);
      setIsRightPanelOpen(true);
    },
    [
      loadFileContent,
      persistPreviewHtmlContent,
      postPreviewPatchToFrame,
      selectedPreviewHtml,
    ],
  );
  const handlePreviewStyleUpdateStable = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      void applyPreviewStyleUpdate(styles);
    },
    [applyPreviewStyleUpdate],
  );
  const handlePreviewContentUpdateStable = useCallback(
    (data: { content?: string; src?: string; href?: string }) => {
      void applyPreviewContentUpdate(data);
    },
    [applyPreviewContentUpdate],
  );
  const handlePreviewAttributesUpdateStable = useCallback(
    (attributes: Record<string, string>) => {
      void applyPreviewAttributesUpdate(attributes);
    },
    [applyPreviewAttributesUpdate],
  );
  const handlePreviewAnimationUpdateStable = useCallback(
    (animation: string) => {
      void applyPreviewAnimationUpdate(animation);
    },
    [applyPreviewAnimationUpdate],
  );
  const handlePreviewDeleteStable = useCallback(() => {
    void applyPreviewDeleteSelected();
  }, [applyPreviewDeleteSelected]);
  const noopPropertiesAction = useCallback(() => {}, []);
  const noopMoveOrder = useCallback((_dir: "up" | "down") => {}, []);

  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent) => {
      if (!isActivePreviewMessageSource(event.source)) return;
      let payload = event.data as
        | {
            type?: string;
            path?: string | number[];
            level?: PreviewConsoleLevel;
            message?: string;
            source?: string;
            html?: string;
            tag?: string;
            id?: string;
            className?: string;
            attributes?: Record<string, string>;
            text?: string;
            inlineStyle?: string;
            src?: string;
            href?: string;
            computedStyles?: Record<string, string>;
            parentPath?: number[];
            styles?: Record<string, string | number>;
          }
        | undefined;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || !payload.type) return;

      if (payload.type === "PREVIEW_CONSOLE") {
        const level = payload.level ?? "log";
        const message =
          typeof payload.message === "string" ? payload.message : "";
        if (!message) return;
        appendPreviewConsole(level, message, payload.source || "preview");
        return;
      }

      if (payload.type === "PREVIEW_NAVIGATE") {
        if (
          !selectedPreviewHtml ||
          typeof payload.path !== "string" ||
          !payload.path
        )
          return;
        const target = resolvePreviewNavigationPath(
          selectedPreviewHtml,
          payload.path,
          filesRef.current,
        );
        if (!target) return;
        if (!shouldProcessPreviewPageSignal(target)) return;
        console.log("[Preview] Current page:", target);
        if (isMountedPreview) {
          setPreviewSyncedFile((prev) => (prev === target ? prev : target));
          setPreviewNavigationFile((prev) => (prev === target ? prev : target));
          if (interactionModeRef.current !== "preview") {
            setInteractionMode("preview");
          }
        } else {
          if (target === activeFileRef.current) return;
          syncPreviewActiveFile(target, "navigate");
        }
        return;
      }

      if (payload.type === "PREVIEW_PATH_CHANGED") {
        if (typeof payload.path !== "string" || !payload.path) return;
        const mountRelativePath = extractMountRelativePath(payload.path);
        if (!mountRelativePath) return;
        const resolvedVirtualPath =
          resolveVirtualPathFromMountRelative(mountRelativePath);
        if (!resolvedVirtualPath) return;
        const resolvedFile = filesRef.current[resolvedVirtualPath];
        if (!resolvedFile || resolvedFile.type !== "html") return;
        if (resolvedVirtualPath === activeFileRef.current) return;
        if (!shouldProcessPreviewPageSignal(resolvedVirtualPath)) return;
        console.log("[Preview] Current page:", resolvedVirtualPath);
        syncPreviewActiveFile(resolvedVirtualPath, "path_changed");
        return;
      }

      if (payload.type === "PREVIEW_INLINE_EDIT") {
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath) return;
        void applyPreviewInlineEdit(
          nextPath,
          typeof payload.html === "string" ? payload.html : "",
        );
        return;
      }

      if (payload.type === "PREVIEW_MOVE_COMMIT") {
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath) return;
        if (!payload.styles || typeof payload.styles !== "object") return;
        const stylePatch = Object.fromEntries(
          Object.entries(payload.styles).map(([key, value]) => [
            key,
            value == null ? "" : String(value),
          ]),
        ) as Partial<React.CSSProperties>;
        void applyPreviewStyleUpdateAtPath(nextPath, stylePatch, {
          syncSelectedElement: true,
        });
        return;
      }

      if (payload.type === "PREVIEW_DRAW_CREATE") {
        const nextParentPath = normalizePreviewPath(payload.parentPath || []);
        if (!nextParentPath) return;
        if (typeof payload.tag !== "string" || !payload.tag.trim()) return;
        const stylePatch = Object.fromEntries(
          Object.entries(payload.styles || {}).map(([key, value]) => [
            key,
            value == null ? "" : String(value),
          ]),
        ) as Record<string, string>;
        void applyPreviewDrawCreate(nextParentPath, payload.tag, stylePatch);
        return;
      }

      if (payload.type === "PREVIEW_SELECT") {
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath || nextPath.length === 0) return;

        const tag = (payload.tag || "div").toLowerCase();
        const id = payload.id ? String(payload.id) : `preview-${Date.now()}`;
        const inlineStyles = parseInlineStyleText(
          typeof payload.inlineStyle === "string" ? payload.inlineStyle : "",
        );
        const payloadComputedStyles =
          payload.computedStyles && typeof payload.computedStyles === "object"
            ? (payload.computedStyles as React.CSSProperties)
            : null;

        const liveElement = getLivePreviewSelectedElement(nextPath);
        const computedStyles =
          payloadComputedStyles ||
          extractComputedStylesFromElement(liveElement);

        // Prefer the text sent directly from the iframe at click time (el.textContent)
        // since it's the most reliable source. Fall back to DOM extraction if needed.
        const payloadText =
          typeof payload.text === "string" ? payload.text.trim() : "";
        const liveText = liveElement ? extractTextWithBreaks(liveElement) : "";
        const payloadAttributes =
          payload.attributes && typeof payload.attributes === "object"
            ? (Object.fromEntries(
                Object.entries(payload.attributes).filter(
                  ([key, value]) => Boolean(key) && typeof value === "string",
                ),
              ) as Record<string, string>)
            : {};
        const liveAttributes =
          extractCustomAttributesFromElement(liveElement) || {};

        // Third-layer fallback: parse the saved source HTML from filesRef and read
        // the text directly at the element path. This handles cases where the live
        // DOM was reloaded/refreshed and payload.text is empty (e.g. immediately
        // after a tool switch with no prior click).
        let savedHtmlText = "";
        let savedHtmlAttributes: Record<string, string> = {};
        if (
          !payloadText &&
          !liveText &&
          selectedPreviewHtml &&
          nextPath.length > 0
        ) {
          try {
            const savedHtmlContent =
              filesRef.current[selectedPreviewHtml]?.content;
            if (
              typeof savedHtmlContent === "string" &&
              savedHtmlContent.length > 0
            ) {
              const tempParser = new DOMParser();
              const tempDoc = tempParser.parseFromString(
                savedHtmlContent,
                "text/html",
              );
              const savedEl = readElementByPath(tempDoc.body, nextPath);
              if (savedEl) {
                savedHtmlText = extractTextWithBreaks(savedEl);
                savedHtmlAttributes =
                  extractCustomAttributesFromElement(savedEl) || {};
              }
            }
          } catch {
            // Ignore parse errors.
          }
        }

        const editableText = normalizeEditorMultilineText(
          payloadText || liveText || savedHtmlText,
        );
        const payloadSrc =
          typeof payload.src === "string" && payload.src.trim().length > 0
            ? payload.src.trim()
            : "";
        const payloadHref =
          typeof payload.href === "string" && payload.href.trim().length > 0
            ? payload.href.trim()
            : "";
        const liveSrc =
          liveElement && liveElement instanceof HTMLElement
            ? liveElement.getAttribute("src") || ""
            : "";
        const liveHref =
          liveElement && liveElement instanceof HTMLElement
            ? liveElement.getAttribute("href") || ""
            : "";
        const resolvedSrc = payloadSrc || liveSrc || undefined;
        const resolvedHref = payloadHref || liveHref || undefined;
        const mergedAttributes = {
          ...savedHtmlAttributes,
          ...liveAttributes,
          ...payloadAttributes,
        };
        const resolvedAttributes =
          Object.keys(mergedAttributes).length > 0
            ? mergedAttributes
            : undefined;
        const mergedStyles: React.CSSProperties = {
          ...(computedStyles || {}),
          ...inlineStyles,
        };
        const inlineAnimation =
          typeof inlineStyles.animation === "string"
            ? inlineStyles.animation.trim()
            : "";
        const computedAnimationCandidate =
          computedStyles && typeof computedStyles.animation === "string"
            ? computedStyles.animation.trim()
            : "";
        const resolvedAnimation =
          inlineAnimation ||
          (computedAnimationCandidate &&
          !/^none(?:\s|$)/i.test(computedAnimationCandidate)
            ? computedAnimationCandidate
            : "");

        const nextElement: VirtualElement = {
          id,
          type: tag,
          name: tag.toUpperCase(),
          content: editableText,
          ...(resolvedSrc ? { src: resolvedSrc } : {}),
          ...(resolvedHref ? { href: resolvedHref } : {}),
          className:
            typeof payload.className === "string" &&
            payload.className.length > 0
              ? payload.className
              : undefined,
          ...(resolvedAttributes ? { attributes: resolvedAttributes } : {}),
          styles: mergedStyles,
          ...(resolvedAnimation ? { animation: resolvedAnimation } : {}),
          children: [],
        };

        setPreviewSelectedPath(nextPath);
        setPreviewSelectedElement(nextElement);
        setPreviewSelectedComputedStyles(computedStyles);
        setSelectedId(null);
        setIsRightPanelOpen(true);
      }
    };

    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
  }, [
    applyPreviewDrawCreate,
    applyPreviewStyleUpdateAtPath,
    appendPreviewConsole,
    getLivePreviewSelectedElement,
    isActivePreviewMessageSource,
    isMountedPreview,
    extractMountRelativePath,
    resolveVirtualPathFromMountRelative,
    selectedPreviewHtml,
    shouldProcessPreviewPageSignal,
    syncPreviewActiveFile,
    applyPreviewInlineEdit,
  ]);
  useEffect(() => {
    if (!activeFile) return;
    void loadFileContent(activeFile);
  }, [activeFile, loadFileContent]);

  useEffect(() => {
    if (!shouldPrepareEditPreviewDoc) {
      setSelectedPreviewDoc("");
      return;
    }
    if (!selectedPreviewHtml) {
      setSelectedPreviewDoc("");
      return;
    }
    const cachedDoc = previewDocCacheRef.current[selectedPreviewHtml];
    if (cachedDoc) {
      setSelectedPreviewDoc(cachedDoc);
      return;
    }

    let canceled = false;
    const preloadPreviewDependencies = async () => {
      const htmlContent = await loadFileContent(selectedPreviewHtml);
      const fileMapSnapshot: FileMap = { ...filesRef.current };
      let html =
        typeof htmlContent === "string" && htmlContent.length > 0
          ? htmlContent
          : typeof fileMapSnapshot[selectedPreviewHtml]?.content === "string"
            ? (fileMapSnapshot[selectedPreviewHtml]?.content as string)
            : "";
      if (!html) {
        const absoluteHtmlPath = filePathIndexRef.current[selectedPreviewHtml];
        if (absoluteHtmlPath) {
          try {
            const directHtml = await (Neutralino as any).filesystem.readFile(
              absoluteHtmlPath,
            );
            if (typeof directHtml === "string" && directHtml.length > 0) {
              html = directHtml;
            }
          } catch {
            // Keep empty html; caller handles as unavailable preview.
          }
        }
      }
      if (!html) return;

      if (!previewHistoryRef.current[selectedPreviewHtml]) {
        previewHistoryRef.current[selectedPreviewHtml] = {
          past: [],
          present: html,
          future: [],
        };
      }

      if (fileMapSnapshot[selectedPreviewHtml]) {
        fileMapSnapshot[selectedPreviewHtml] = {
          ...fileMapSnapshot[selectedPreviewHtml],
          content: html,
        };
      }

      const dependencyPaths = new Set<string>();

      html.replace(
        /<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
        (full, _beforeHref, hrefValue) => {
          if (!/rel=["']stylesheet["']/i.test(full)) return full;
          const resolved = resolveProjectRelativePath(
            selectedPreviewHtml,
            hrefValue,
          );
          if (resolved && fileMapSnapshot[resolved])
            dependencyPaths.add(resolved);
          return full;
        },
      );

      html.replace(
        /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
        (_full, _beforeSrc, srcValue) => {
          const resolved = resolveProjectRelativePath(
            selectedPreviewHtml,
            srcValue,
          );
          if (resolved && fileMapSnapshot[resolved])
            dependencyPaths.add(resolved);
          return _full;
        },
      );

      html.replace(/\b(src|href)=["']([^"']+)["']/gi, (_full, _attr, raw) => {
        const resolved = resolveProjectRelativePath(selectedPreviewHtml, raw);
        if (resolved && fileMapSnapshot[resolved])
          dependencyPaths.add(resolved);
        return _full;
      });

      // Legacy projects often request shared HTML fragments dynamically.
      // Keep preload intentionally narrow; avoid eager icon/font loading.
      for (const path of Object.keys(fileMapSnapshot)) {
        const lowerPath = path.toLowerCase();
        if (
          (lowerPath.includes("shared/media/content/") ||
            lowerPath.includes("/shared/media/content/")) &&
          (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm"))
        ) {
          dependencyPaths.add(path);
        }
      }

      const loaded = await Promise.all(
        Array.from(dependencyPaths).map(async (path) => {
          const content = await loadFileContent(path, {
            persistToState: false,
          });
          return { path, content };
        }),
      );

      for (const item of loaded) {
        if (
          item &&
          fileMapSnapshot[item.path] &&
          typeof item.content === "string" &&
          item.content.length > 0
        ) {
          fileMapSnapshot[item.path] = {
            ...fileMapSnapshot[item.path],
            content: item.content,
          };
        }
      }

      if (canceled) return;
      previewDependencyIndexRef.current[selectedPreviewHtml] = [
        selectedPreviewHtml,
        ...Array.from(dependencyPaths),
      ];
      const doc = createPreviewDocument(
        fileMapSnapshot,
        selectedPreviewHtml,
        previewDependencyIndexRef.current[selectedPreviewHtml],
      );
      cachePreviewDoc(selectedPreviewHtml, doc);
      setSelectedPreviewDoc(doc);
    };

    void preloadPreviewDependencies();
    return () => {
      canceled = true;
    };
  }, [
    cachePreviewDoc,
    loadFileContent,
    selectedPreviewHtml,
    shouldPrepareEditPreviewDoc,
  ]);
  useEffect(() => {
    if (!selectedPreviewHtml) return;
    const keys = dirtyPathKeysByFile[selectedPreviewHtml] || [];
    if (keys.length === 0) return;
    const timer = window.setTimeout(() => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      for (const key of keys) {
        const path = key
          .split(".")
          .map((segment) => Number(segment))
          .filter((segment) => Number.isFinite(segment))
          .map((segment) => Math.max(0, Math.trunc(segment)));
        const element = readElementByPath(frameDocument.body, path);
        if (element instanceof HTMLElement) {
          element.classList.add("__nx-preview-dirty");
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dirtyPathKeysByFile, selectedPreviewDoc, selectedPreviewHtml]);

  const tabletMetrics = useMemo(() => {
    const base =
      tabletModel === "ipad-pro"
        ? {
            framePortraitWidth: 834,
            framePortraitHeight: 1112,
            contentPortraitWidth: 2048,
            contentPortraitHeight: 2732,
          }
        : {
            framePortraitWidth: 768,
            framePortraitHeight: 1024,
            contentPortraitWidth: 1536,
            contentPortraitHeight: 2048,
          };

    if (tabletOrientation === "landscape") {
      return {
        frameWidth: base.framePortraitHeight,
        frameHeight: base.framePortraitWidth,
        contentWidth: base.contentPortraitHeight,
        contentHeight: base.contentPortraitWidth,
      };
    }

    return {
      frameWidth: base.framePortraitWidth,
      frameHeight: base.framePortraitHeight,
      contentWidth: base.contentPortraitWidth,
      contentHeight: base.contentPortraitHeight,
    };
  }, [tabletModel, tabletOrientation]);
  const tabletViewportScale = useMemo(() => {
    const tabletBezelPx = 20; // 10px border on each side
    const usableWidth = Math.max(1, tabletMetrics.frameWidth - tabletBezelPx);
    const usableHeight = Math.max(1, tabletMetrics.frameHeight - tabletBezelPx);
    return Math.min(
      usableWidth / tabletMetrics.contentWidth,
      usableHeight / tabletMetrics.contentHeight,
    );
  }, [tabletMetrics]);
  const currentDevicePixelRatio =
    typeof window !== "undefined" && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1;
  const shouldPushTabletFrame =
    deviceMode === "tablet" &&
    frameZoom === 75 &&
    currentDevicePixelRatio !== 1;
  const tabletPanelPushX = useMemo(() => {
    if (!shouldPushTabletFrame) return 0;
    if (isLeftPanelOpen === isRightPanelOpen) return 0;
    const push = Math.round(leftPanelWidth * 0.42);
    return isLeftPanelOpen ? push : -push;
  }, [
    isLeftPanelOpen,
    isRightPanelOpen,
    leftPanelWidth,
    shouldPushTabletFrame,
  ]);
  const baseOverflowX = bothPanelsOpen ? "scroll" : "auto";
  const isTabletZoomMode = deviceMode === "tablet";
  const lockAllScrollAt50 = isTabletZoomMode && frameZoom === 50;
  const lockVerticalAt75Landscape =
    isTabletZoomMode && frameZoom === 75 && tabletOrientation === "landscape";
  const lockHorizontalAt75Portrait =
    isTabletZoomMode && frameZoom === 75 && tabletOrientation === "portrait";
  const shouldLockHorizontalScroll =
    lockAllScrollAt50 || lockHorizontalAt75Portrait;
  const shouldLockVerticalScroll =
    lockAllScrollAt50 || lockVerticalAt75Landscape;
  const frameScale = frameZoom / 100;
  const darkTabletReflectionOpacity =
    theme === "dark" && deviceMode === "tablet"
      ? Math.min(
          0.72,
          0.28 +
            (isLeftPanelOpen ? 0.12 : 0) +
            (isRightPanelOpen ? 0.12 : 0) +
            (showTerminal ? 0.14 : 0),
        )
      : 0;

  return (
    <div
      ref={appRootRef}
      className={`h-screen w-screen flex flex-col font-sans relative overflow-hidden ${theme === "light" ? "light-mode" : ""}`}
      style={{
        backgroundColor: "var(--bg-app)",
        color: "var(--text-main)",
        ["--left-panel-width" as any]: `${leftPanelWidth}px`,
        ...(theme !== "light"
          ? {
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 0 rgba(255,255,255,0.12), inset 1px 0 0 0 rgba(255,255,255,0.06), inset -1px 0 0 0 rgba(255,255,255,0.06), inset 0 -1px 0 0 rgba(255,255,255,0.04)",
            }
          : {}),
      }}
    >
      <TitleBar />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onAction={handleCommandAction}
      />

      {/* --- Floating Toolbar --- */}
      <div
        className={`absolute top-6 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-4 glass-toolbar rounded-full px-6 py-2 transition-all animate-slideDown ${isZenMode ? "opacity-65 hover:opacity-90" : "hover:scale-[1.02]"}`}
      >
        <div className="flex items-center gap-2 pr-4 border-r border-gray-500/20">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 shadow-red-500/50 shadow-sm"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 shadow-yellow-500/50 shadow-sm"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80 shadow-green-500/50 shadow-sm"></div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="glass-icon-btn group"
            onClick={() => setIsCommandPaletteOpen(true)}
            title="Command Palette (Ctrl+K)"
          >
            <Command
              size={16}
              className="group-hover:text-indigo-400 transition-colors"
            />
          </button>
          <button
            className="glass-icon-btn group"
            onClick={handleOpenFolder}
            title="Open Project Folder"
          >
            <FolderOpen
              size={16}
              className="group-hover:text-indigo-400 transition-colors"
            />
          </button>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className={`glass-icon-btn ${deviceMode === "tablet" ? "active" : ""}`}
            onClick={() => {
              setDeviceMode("tablet");
              setTabletOrientation((prev) =>
                prev === "landscape" ? "portrait" : "landscape",
              );
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setDeviceMode("tablet");
              setDeviceCtxMenu({ type: "tablet", x: e.clientX, y: e.clientY });
            }}
            title={`iPad (${tabletOrientation === "landscape" ? "Landscape" : "Portrait"}) - click to rotate, right-click for model`}
          >
            <Tablet
              size={16}
              className="transition-transform duration-300 ease-out"
              style={{
                transform: `rotate(${tabletOrientation === "landscape" ? 90 : 0}deg)`,
              }}
            />
          </button>
          <button
            className="glass-icon-btn"
            onClick={handlePreviewRefresh}
            title="Refresh iPad content (Ctrl+T)"
          >
            <RotateCw size={16} />
          </button>
          <div className="flex items-center gap-1 rounded-full px-1 py-1 border border-gray-500/20">
            {[50, 75, 100].map((zoom) => (
              <button
                key={zoom}
                onClick={() => setFrameZoom(zoom as 50 | 75 | 100)}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  frameZoom === zoom
                    ? theme === "light"
                      ? "bg-cyan-500/20 text-cyan-700 border border-cyan-500/35"
                      : "bg-indigo-500/25 text-indigo-300"
                    : theme === "light"
                      ? "text-slate-500 hover:bg-slate-200/70"
                      : "text-gray-300 hover:bg-white/10"
                }`}
                title={`Set frame zoom to ${zoom}%`}
              >
                {zoom}%
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className="glass-icon-btn"
            onClick={() =>
              setTheme((prev) => (prev === "dark" ? "light" : "dark"))
            }
            title="Toggle Theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className="glass-icon-btn"
            onClick={runUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="glass-icon-btn"
            onClick={runRedo}
            title="Redo (Ctrl+U)"
          >
            <Redo2 size={16} />
          </button>
          <div className="relative" ref={saveMenuRef}>
            <button
              className={`glass-icon-btn ${dirtyFiles.length > 0 ? "text-amber-400" : ""}`}
              onClick={() => setIsSaveMenuOpen((prev) => !prev)}
              title="Save settings"
            >
              <Settings2 size={16} />
            </button>
            {dirtyFiles.length > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500"
                aria-hidden="true"
              />
            )}
            {isSaveMenuOpen && (
              <div
                className="absolute top-10 right-0 w-56 rounded-xl border p-2 shadow-2xl z-[1200]"
                style={{
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.98)"
                      : "rgba(255,255,255,0.98)",
                  borderColor:
                    theme === "dark"
                      ? "rgba(148,163,184,0.35)"
                      : "rgba(15,23,42,0.15)",
                  color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                }}
              >
                <button
                  className="w-full text-left px-2 py-2 rounded-md text-xs font-semibold hover:bg-cyan-500/15 flex items-center justify-between"
                  onClick={() => {
                    void flushPendingPreviewSaves();
                    setIsSaveMenuOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Save size={13} />
                    Save Now
                  </span>
                  <span className="opacity-70">Ctrl+S</span>
                </button>
                <label className="mt-1 w-full px-2 py-2 rounded-md text-xs flex items-center justify-between gap-2 cursor-pointer hover:bg-cyan-500/10">
                  <span>Auto Save</span>
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  />
                </label>
                <div className="px-2 pt-1 text-[10px] opacity-70">
                  Smart debounce (about 1.2s idle), not every keystroke.
                </div>
                {dirtyFiles.length > 0 && (
                  <div className="px-2 pt-2 text-[10px] text-amber-400">
                    {dirtyFiles.length} unsaved file
                    {dirtyFiles.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="h-4 w-px bg-gray-500/20"></div>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
              interactionMode === "preview"
                ? theme === "light"
                  ? "bg-cyan-500/20 text-cyan-700 border border-cyan-500/35"
                  : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/35"
                : theme === "light"
                  ? "bg-cyan-500/10 text-cyan-600 border border-cyan-500/25 hover:bg-cyan-500/20"
                  : "bg-cyan-500/10 text-cyan-200 border border-cyan-500/20 hover:bg-cyan-500/20"
            }`}
            onClick={() =>
              setInteractionMode((prev) =>
                prev === "preview" ? sidebarToolMode : "preview",
              )
            }
            title="Run Project on Device"
          >
            <Play
              size={10}
              fill={interactionMode === "preview" ? "currentColor" : "none"}
            />
            {interactionMode === "preview" ? "LIVE" : "Run"}
          </button>
          {interactionMode === "preview" && (
            <div className="flex items-center gap-1 rounded-full px-1 py-1 border border-gray-500/20">
              <button
                onClick={() => setPreviewModeWithSync("edit")}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  previewMode === "edit"
                    ? theme === "light"
                      ? "bg-amber-500/20 text-amber-700 border border-amber-500/35"
                      : "bg-amber-500/25 text-amber-200 border border-amber-500/35"
                    : theme === "light"
                      ? "text-slate-500 hover:bg-slate-200/70"
                      : "text-gray-300 hover:bg-white/10"
                }`}
                title="LIVE Edit mode: select and edit elements"
              >
                Edit
              </button>
              <button
                onClick={() => setPreviewModeWithSync("preview")}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  previewMode === "preview"
                    ? theme === "light"
                      ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/35"
                      : "bg-emerald-500/25 text-emerald-200 border border-emerald-500/35"
                    : theme === "light"
                      ? "text-slate-500 hover:bg-slate-200/70"
                      : "text-gray-300 hover:bg-white/10"
                }`}
                title="LIVE Preview mode: navigate and interact"
              >
                Preview
              </button>
            </div>
          )}
        </div>
      </div>
      {isZenMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[999] px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider border backdrop-blur-md bg-black/20 text-white/90 border-white/20">
          Zen Mode Active • Press Esc to exit
        </div>
      )}

      {/* Device Context Menu */}
      {deviceCtxMenu && (
        <DeviceContextMenu
          type={deviceCtxMenu.type}
          position={{ x: deviceCtxMenu.x, y: deviceCtxMenu.y }}
          mobileFrameStyle={mobileFrameStyle}
          setMobileFrameStyle={setMobileFrameStyle}
          desktopResolution={desktopResolution}
          setDesktopResolution={setDesktopResolution}
          tabletModel={tabletModel}
          setTabletModel={setTabletModel}
          onClose={() => setDeviceCtxMenu(null)}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <div
          className={`absolute z-40 no-scrollbar ${isResizingLeftPanel ? "" : "transition-all duration-500"} ${isFloatingPanels ? "left-10 top-24" : "left-0 top-0 bottom-0"} ${isZenMode ? "opacity-0 pointer-events-none" : ""} ${isLeftPanelOpen ? "animate-panelInLeft" : ""}`}
          style={{
            transform: isLeftPanelOpen
              ? "translateX(0)"
              : isFloatingPanels
                ? "translateX(calc(-100% - 2.5rem))"
                : "translateX(-100%)",
            width: "var(--left-panel-width)",
            minHeight: isFloatingPanels ? "30vh" : undefined,
            maxHeight: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            height: isFloatingPanels ? "fit-content" : undefined,
            borderRadius: isFloatingPanels ? "1rem" : undefined,
            border: isFloatingPanels
              ? theme === "light"
                ? "1px solid rgba(15, 23, 42, 0.18)"
                : "1px solid rgba(255, 255, 255, 0.25)"
              : undefined,
            background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
            overflowY: isFloatingPanels ? "auto" : undefined,
            overflowX: isFloatingPanels ? "hidden" : undefined,
            transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          <div
            className={`h-full min-h-full relative flex flex-col overflow-hidden ${
              isFloatingPanels ? "rounded-2xl overflow-hidden" : ""
            }`}
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,250,252,0.74) 100%)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              className="h-11 shrink-0 px-3 flex items-center justify-between"
              style={{
                borderBottom:
                  theme === "dark"
                    ? "1px solid rgba(148,163,184,0.28)"
                    : "1px solid rgba(0,0,0,0.1)",
                background:
                  theme === "dark"
                    ? "linear-gradient(90deg, rgba(14,165,233,0.18), rgba(99,102,241,0.16), rgba(15,23,42,0.0))"
                    : "linear-gradient(90deg,rgba(14,165,233,0.12),rgba(99,102,241,0.1),transparent)",
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                <span
                  className="text-[11px] uppercase tracking-[0.2em] font-semibold"
                  style={{ color: theme === "dark" ? "#cbd5e1" : "#475569" }}
                >
                  Explorer
                </span>
              </div>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.7)"
                      : "rgba(255,255,255,0.7)",
                  border:
                    theme === "dark"
                      ? "1px solid rgba(148,163,184,0.32)"
                      : "1px solid rgba(0,0,0,0.1)",
                  color: theme === "dark" ? "#94a3b8" : "#64748b",
                }}
              >
                {Object.keys(files).length} files
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar
                files={files}
                projectPath={projectPath}
                activeFile={previewSyncedFile ?? activeFile}
                onSelectFile={handleSelectFile}
                onAddFontToPresentationCss={
                  handleSidebarAddFontToPresentationCss
                }
                onAddElement={handleSidebarAddElement}
                root={root}
                selectedId={selectedId}
                onSelectElement={handleSelect}
                interactionMode={sidebarInteractionMode}
                setInteractionMode={handleSidebarInteractionModeChange}
                drawElementTag={drawElementTag}
                setDrawElementTag={setDrawElementTag}
                theme={theme}
              />
            </div>
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                boxShadow:
                  theme === "dark"
                    ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                    : "inset 0 0 0 1px rgba(255,255,255,0.45)",
              }}
            />
          </div>
          {isLeftPanelOpen && (
            <div
              onMouseDown={handleLeftPanelResizeStart}
              className="absolute top-0 right-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors"
              title="Resize panel"
            />
          )}
        </div>

        {/* --- Main Canvas Area ("The Stage") --- */}
        {/* Non-mobile: 1 panel = push, both panels = overlay with scrollable content. Mobile: always overlay. */}
        <div
          className={`flex-1 flex flex-col relative ${isResizingLeftPanel ? "" : "transition-all duration-500"}`}
          style={{
            marginLeft:
              !isFloatingPanels &&
              deviceMode !== "mobile" &&
              isLeftPanelOpen &&
              !isRightPanelOpen
                ? "var(--left-panel-width)"
                : 0,
            marginRight:
              !isFloatingPanels &&
              deviceMode !== "mobile" &&
              !isLeftPanelOpen &&
              isRightPanelOpen
                ? "16.5rem"
                : 0,
            // When both panels open, no margins - content will scroll
          }}
        >
          {/* Background & Scroller */}
          <div
            ref={scrollerRef}
            className={`flex-1 relative no-scrollbar transition-all duration-300 ${showTerminal ? "pb-52" : "pb-10"}`}
            style={{
              overflowX: shouldLockHorizontalScroll ? "hidden" : baseOverflowX,
              overflowY: shouldLockVerticalScroll ? "hidden" : "auto",
            }}
            onClick={() => {
              setSelectedId(null);
              setPreviewSelectedPath(null);
              setPreviewSelectedElement(null);
              setPreviewSelectedComputedStyles(null);
            }}
          >
            {/* Dynamic Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
              <div className="absolute inset-0 bg-[linear-gradient(var(--border-color)_1px,transparent_1px),linear-gradient(90deg,var(--border-color)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
              <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] mix-blend-screen animate-pulse duration-[10s]"></div>
              <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] mix-blend-screen animate-pulse duration-[7s]"></div>
            </div>

            {/* Content wrapper — adds padding when both panels overlay so scroll reveals content behind panels */}
            <div
              className="min-h-full relative flex flex-col p-10 outline-none bg-grid-pattern"
              style={{
                perspective: "1000px",
                paddingLeft: `${BASE_STAGE_PADDING}px`,
                paddingRight: `${BASE_STAGE_PADDING}px`,
                width: "100%",
                minWidth: bothPanelsOpen
                  ? `calc(100% + var(--left-panel-width) + ${rightOverlayInset}px)`
                  : floatingHorizontalInset > 0
                    ? `calc(100% + ${floatingHorizontalInset}px)`
                    : "100%",
              }}
            >
              {/* Safe Spacing for Toolbar */}
              <div className="w-full shrink-0 h-[3.5rem] pointer-events-none"></div>
              {/* --- Device Frame Container --- */}
              {/* --- Device Frame Wrapper (Layout Isolation) --- */}
              <div
                className="relative shrink-0 flex items-center justify-center transition-all duration-700 m-auto"
                style={{
                  width:
                    deviceMode === "mobile"
                      ? "375px"
                      : deviceMode === "tablet"
                        ? `${tabletMetrics.frameWidth}px`
                        : desktopResolution === "resizable"
                          ? "80%"
                          : "921.6px",
                  height:
                    deviceMode === "mobile"
                      ? "812px"
                      : deviceMode === "tablet"
                        ? `${tabletMetrics.frameHeight}px`
                        : desktopResolution === "resizable"
                          ? "75vh"
                          : "518.4px",
                  transform:
                    deviceMode === "tablet"
                      ? `translateX(${tabletPanelPushX}px) scale(${frameScale})`
                      : `scale(${frameScale})`,
                  transformOrigin: "top center",
                }}
              >
                {/* Actual Device Frame */}
                <div
                  className={`
                              relative z-10 shrink-0 transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                              ${
                                deviceMode === "desktop"
                                  ? "rounded-xl border-4"
                                  : deviceMode === "tablet"
                                    ? "w-full h-full rounded-[42px] border-[10px]"
                                    : "w-full h-full rounded-[50px] border-[12px]"
                              }
                          `}
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    borderColor:
                      deviceMode === "desktop"
                        ? "#1e293b"
                        : deviceMode === "tablet"
                          ? theme === "dark"
                            ? "#c7d0dc"
                            : "#0f172a"
                          : "#000000",
                    background:
                      deviceMode === "tablet" && theme === "dark"
                        ? [
                            "linear-gradient(145deg, #eef3fa 0%, #cfd8e5 16%, #9aa7b8 34%, #748396 50%, #9fadbe 68%, #dce4ee 84%, #f3f7fb 100%)",
                            "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.06) 24%, rgba(0,0,0,0.12) 100%)",
                            "radial-gradient(130% 70% at 50% -5%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.0) 62%)",
                          ].join(", ")
                        : "#000000",
                    boxShadow:
                      deviceMode === "tablet" && theme === "dark"
                        ? "0 28px 62px -16px rgba(0,0,0,0.62), 0 0 0 1px rgba(203,213,225,0.22), 0 0 28px rgba(148,163,184,0.2), inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -1px 0 rgba(255,255,255,0.22), inset 1px 0 0 rgba(255,255,255,0.2), inset -1px 0 0 rgba(0,0,0,0.26)"
                        : "0 20px 50px -10px rgba(0,0,0,0.5)",
                    // No transform on the frame itself - it stays fixed visual size
                  }}
                >
                  {deviceMode === "tablet" && theme === "dark" && (
                    <>
                      <div
                        className="pointer-events-none absolute inset-[2px] rounded-[34px]"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.13) 18%, rgba(255,255,255,0.03) 36%, rgba(0,0,0,0.06) 100%)",
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[1px] rounded-[36px]"
                        style={{
                          background: [
                            "linear-gradient(120deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.0) 28%, rgba(255,255,255,0.0) 72%, rgba(255,255,255,0.22) 100%)",
                            "repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 3px)",
                          ].join(", "),
                          opacity: 0.3,
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[0px] rounded-[36px]"
                        style={{
                          opacity: darkTabletReflectionOpacity,
                          mixBlendMode: "screen",
                          background: [
                            "radial-gradient(60% 26% at 50% -4%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.0) 78%)",
                            "radial-gradient(40% 34% at 6% 18%, rgba(147,197,253,0.42) 0%, rgba(147,197,253,0.0) 72%)",
                            "radial-gradient(40% 34% at 94% 18%, rgba(167,243,208,0.4) 0%, rgba(167,243,208,0.0) 72%)",
                          ].join(", "),
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[0px] rounded-[36px]"
                        style={{
                          opacity: Math.min(
                            0.56,
                            darkTabletReflectionOpacity * 0.9,
                          ),
                          background:
                            "linear-gradient(112deg, rgba(255,255,255,0.0) 18%, rgba(255,255,255,0.42) 31%, rgba(255,255,255,0.0) 46%, rgba(255,255,255,0.0) 60%, rgba(255,255,255,0.28) 71%, rgba(255,255,255,0.0) 85%)",
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[3px] rounded-[33px]"
                        style={{
                          boxShadow:
                            "inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 0 26px rgba(255,255,255,0.08)",
                        }}
                      />
                    </>
                  )}
                  {/* Morphing Header (Window Bar <-> Notch) */}
                  <div
                    className={`
                            absolute top-0 left-1/2 -translate-x-1/2 z-20 ${deviceMode === "desktop" ? "bg-[#1e293b]" : deviceMode === "tablet" ? (theme === "dark" ? "bg-[#5f6f82]" : "bg-[#0f172a]") : "bg-black"}
                            transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)] flex items-center justify-center overflow-hidden
                            ${
                              deviceMode === "desktop"
                                ? "w-full h-9 rounded-t-lg rounded-b-none px-4"
                                : deviceMode === "tablet"
                                  ? "w-[120px] h-[9px] rounded-full top-[12px] px-0"
                                  : mobileFrameStyle === "dynamic-island"
                                    ? "w-[120px] h-[35px] rounded-full top-[11px] px-0"
                                    : mobileFrameStyle === "notch"
                                      ? "w-[160px] h-[30px] rounded-b-[20px] rounded-t-none px-0"
                                      : "w-[10px] h-[10px] rounded-full top-[12px] left-1/2 -translate-x-1/2"
                            }
                        `}
                  >
                    {/* Desktop Elements: Traffic Lights & URL */}
                    <div
                      className={`absolute left-4 flex gap-1.5 transition-opacity duration-500 ${deviceMode === "desktop" ? "opacity-100 delay-200" : "opacity-0"}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"></div>
                    </div>

                    <div
                      className={`transition-opacity duration-300 ${deviceMode === "desktop" ? "opacity-100 delay-200" : "opacity-0"}`}
                    >
                      <div className="bg-black/30 h-5 w-64 rounded-md flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono">
                        <Globe size={10} />
                        <span>nocode-x-preview.app</span>
                      </div>
                    </div>

                    {/* Mobile Elements: Notch Speaker/Cam */}
                    {mobileFrameStyle === "dynamic-island" && (
                      <div
                        className={`absolute top-2 w-12 h-1 bg-[#1a1a1a] rounded-full transition-opacity duration-300 ${deviceMode === "mobile" ? "opacity-100 delay-300" : "opacity-0"}`}
                      ></div>
                    )}
                  </div>

                  {/* Mobile Status Bar Indicators (Fade In) */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-[30px] z-30 pointer-events-none transition-opacity duration-500 ${deviceMode === "mobile" ? "opacity-100 delay-200" : "opacity-0"}`}
                  >
                    <div className="absolute top-4 left-7 text-[10px] text-white font-medium tracking-wide">
                      9:41
                    </div>
                    <div className="absolute top-4 right-7 flex gap-1.5 text-white">
                      <Wifi size={12} />
                      <div className="w-4 h-2.5 border border-white/30 rounded-[2px] relative">
                        <div className="absolute left-[1px] top-[1px] bottom-[1px] right-1 bg-white rounded-[1px]"></div>
                      </div>
                    </div>
                  </div>

                  {/* Screen Content Wrapper */}
                  <div
                    className={`w-full h-full bg-white overflow-hidden relative transition-all duration-700 ${deviceMode === "desktop" ? "rounded-lg pt-9" : deviceMode === "tablet" ? "rounded-[32px]" : "rounded-[38px]"}`}
                  >
                    {/* Inner Content Scaler - Handles High Res Scaling independent of Frame */}
                    <div
                      className="origin-top-left transition-transform duration-500"
                      style={{
                        width:
                          deviceMode === "mobile"
                            ? "100%"
                            : deviceMode === "tablet"
                              ? `${tabletMetrics.contentWidth}px`
                              : desktopResolution === "resizable"
                                ? "100%"
                                : desktopResolution === "4k"
                                  ? "3840px"
                                  : desktopResolution === "2k"
                                    ? "2560px"
                                    : desktopResolution === "1.5k"
                                      ? "1600px"
                                      : "1920px",
                        height:
                          deviceMode === "mobile"
                            ? "100%"
                            : deviceMode === "tablet"
                              ? `${tabletMetrics.contentHeight}px`
                              : desktopResolution === "resizable"
                                ? "100%"
                                : desktopResolution === "4k"
                                  ? "2160px"
                                  : desktopResolution === "2k"
                                    ? "1440px"
                                    : desktopResolution === "1.5k"
                                      ? "900px"
                                      : "1080px",
                        transform:
                          deviceMode === "tablet"
                            ? `translateX(-50%) scale(${tabletViewportScale})`
                            : `scale(${
                                deviceMode === "mobile"
                                  ? 1
                                  : desktopResolution === "resizable"
                                    ? 1
                                    : desktopResolution === "4k"
                                      ? 0.24
                                      : desktopResolution === "2k"
                                        ? 0.36
                                        : desktopResolution === "1.5k"
                                          ? 0.576
                                          : 0.48
                              })`,
                        transformOrigin:
                          deviceMode === "tablet" ? "top center" : "top left",
                        position:
                          deviceMode === "tablet" ? "absolute" : "relative",
                        left: deviceMode === "tablet" ? "50%" : undefined,
                        top: deviceMode === "tablet" ? 0 : undefined,
                      }}
                    >
                      <div className="w-full h-full relative">
                        {hasPreviewContent && (
                          <iframe
                            key={
                              selectedPreviewSrc ||
                              `preview-doc:${selectedPreviewHtml || "none"}:${previewRefreshNonce}`
                            }
                            ref={previewFrameRef}
                            title="project-preview"
                            src={selectedPreviewSrc || undefined}
                            srcDoc={
                              selectedPreviewSrc
                                ? undefined
                                : selectedPreviewDoc
                            }
                            loading="eager"
                            onLoad={handlePreviewFrameLoad}
                            className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-150 ${
                              interactionMode === "preview"
                                ? "opacity-100 pointer-events-auto"
                                : "opacity-0 pointer-events-none"
                            }`}
                          />
                        )}
                        <div
                          className={`w-full h-full transition-opacity duration-200 ${
                            interactionMode === "preview"
                              ? "opacity-0 pointer-events-none"
                              : "opacity-100 pointer-events-auto"
                          }`}
                        >
                          <EditorContent
                            root={root}
                            selectedId={selectedId}
                            selectedPathIds={selectedPathIds}
                            handleSelect={handleSelect}
                            handleMoveElement={handleMoveElement}
                            handleMoveElementByPosition={
                              handleMoveElementByPosition
                            }
                            handleResize={handleResize}
                            interactionMode={interactionMode}
                            INJECTED_STYLES={INJECTED_STYLES}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* iPhone Home Indicator */}
                  <div
                    className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[4px] bg-white/20 rounded-full z-30 pointer-events-none transition-opacity duration-500 ${deviceMode === "mobile" ? "opacity-100 delay-200" : "opacity-0"}`}
                  ></div>
                </div>
              </div>{" "}
              {/* End of Device Frame Visual Wrapper */}
            </div>
            {/* end content wrapper */}
          </div>
          {/* end scroller */}
        </div>
        {/* end stage */}

        {/* Right Sidebar */}
        <div
          className={`absolute z-40 no-scrollbar transition-all duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) ${isFloatingPanels ? "right-10 top-24" : "right-0 top-0 bottom-0"} ${isZenMode ? "opacity-0 pointer-events-none" : ""} ${isRightPanelOpen ? "animate-panelInRight" : ""}`}
          style={{
            transform: isRightPanelOpen
              ? "translateX(0)"
              : isFloatingPanels
                ? "translateX(calc(100% + 2.5rem))"
                : "translateX(100%)",
            width: isFloatingPanels ? "var(--left-panel-width)" : "16.5rem",
            minHeight: isFloatingPanels ? "30vh" : undefined,
            maxHeight: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            height: isFloatingPanels ? "fit-content" : undefined,
            borderRadius: isFloatingPanels ? "1rem" : undefined,
            border: isFloatingPanels
              ? theme === "light"
                ? "1px solid rgba(15, 23, 42, 0.18)"
                : "1px solid rgba(255, 255, 255, 0.25)"
              : undefined,
            background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
            overflowY: isFloatingPanels ? "auto" : undefined,
            overflowX: isFloatingPanels ? "hidden" : undefined,
          }}
        >
          <div
            className={`h-full min-h-full relative flex flex-col overflow-hidden ${
              isFloatingPanels ? "rounded-2xl overflow-hidden" : ""
            }`}
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(248,250,252,0.76) 100%)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              className="h-11 shrink-0 px-3 flex items-center justify-between"
              style={{
                borderBottom:
                  theme === "dark"
                    ? "1px solid rgba(148,163,184,0.28)"
                    : "1px solid rgba(0,0,0,0.1)",
                background:
                  theme === "dark"
                    ? "linear-gradient(90deg, rgba(99,102,241,0.2), rgba(16,185,129,0.16), rgba(15,23,42,0.0))"
                    : "linear-gradient(90deg,rgba(99,102,241,0.12),rgba(16,185,129,0.1),transparent)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: theme === "dark" ? "#ffffff" : "#8b5cf6",
                    boxShadow:
                      theme === "dark"
                        ? "0 0 10px rgba(255,255,255,0.8)"
                        : "0 0 10px rgba(139,92,246,0.8)",
                  }}
                />
                <span
                  className="text-[11px] uppercase tracking-[0.2em] font-semibold"
                  style={{ color: theme === "dark" ? "#cbd5e1" : "#475569" }}
                >
                  Inspector
                </span>
              </div>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.7)"
                      : "rgba(255,255,255,0.7)",
                  border:
                    theme === "dark"
                      ? "1px solid rgba(148,163,184,0.32)"
                      : "1px solid rgba(0,0,0,0.1)",
                  color: theme === "dark" ? "#94a3b8" : "#64748b",
                }}
              >
                {selectedId || previewSelectedElement ? "Element" : "Project"}
              </span>
            </div>
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
              {interactionMode === "preview" && (
                <div
                  className="shrink-0 px-2.5 py-2 border-b"
                  style={{
                    borderColor:
                      theme === "dark"
                        ? "rgba(148,163,184,0.28)"
                        : "rgba(0,0,0,0.1)",
                    background:
                      theme === "dark"
                        ? "rgba(15,23,42,0.42)"
                        : "rgba(255,255,255,0.72)",
                  }}
                >
                  <div
                    className="text-[9px] font-semibold uppercase tracking-[0.16em] px-1"
                    style={{ color: theme === "dark" ? "#94a3b8" : "#64748b" }}
                  ></div>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {PREVIEW_SELECTION_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setPreviewSelectionMode(option.value)}
                        className="px-1.5 py-1 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-all"
                        style={{
                          color:
                            previewSelectionMode === option.value
                              ? theme === "dark"
                                ? "#ecfeff"
                                : "#155e75"
                              : theme === "dark"
                                ? "#cbd5e1"
                                : "#475569",
                          background:
                            previewSelectionMode === option.value
                              ? theme === "dark"
                                ? "rgba(34,211,238,0.2)"
                                : "rgba(14,165,233,0.16)"
                              : theme === "dark"
                                ? "rgba(15,23,42,0.68)"
                                : "rgba(241,245,249,0.9)",
                          border:
                            previewSelectionMode === option.value
                              ? "1px solid rgba(34,211,238,0.55)"
                              : theme === "dark"
                                ? "1px solid rgba(148,163,184,0.28)"
                                : "1px solid rgba(148,163,184,0.26)",
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                {interactionMode === "inspect" && selectedId ? (
                  <StyleInspectorPanel
                    element={inspectorElement}
                    onUpdateStyle={handleUpdateStyle}
                    computedStyles={null}
                  />
                ) : (
                  <PropertiesPanel
                    element={
                      interactionMode === "preview" && previewSelectedElement
                        ? previewSelectedElement
                        : selectedElement
                    }
                    onUpdateStyle={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewStyleUpdateStable
                        : handleUpdateStyle
                    }
                    onUpdateContent={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewContentUpdateStable
                        : handleUpdateContent
                    }
                    onUpdateAttributes={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewAttributesUpdateStable
                        : handleUpdateAttributes
                    }
                    onUpdateAnimation={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewAnimationUpdateStable
                        : handleUpdateAnimation
                    }
                    onDelete={
                      interactionMode === "preview" && previewSelectedElement
                        ? handlePreviewDeleteStable
                        : handleDeleteElement
                    }
                    onAddElement={
                      interactionMode === "preview" && previewSelectedElement
                        ? noopPropertiesAction
                        : handleAddElement
                    }
                    onMoveOrder={noopMoveOrder}
                    resolveImage={resolvePreviewImagePath}
                    availableFonts={availableFonts}
                  />
                )}
              </div>
            </div>
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                boxShadow:
                  theme === "dark"
                    ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                    : "inset 0 0 0 1px rgba(255,255,255,0.45)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Terminal Panel — Glass effect with smooth transition */}
      <div
        className={`fixed bottom-3 left-10 right-10 flex flex-col z-[100] transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-visible rounded-2xl ${isZenMode ? "translate-y-full opacity-0 pointer-events-none" : ""}`}
      >
        {!showTerminal && (
          <>
            <div
              className="pointer-events-none absolute -inset-3 rounded-[24px] blur-2xl"
              style={{
                background:
                  theme === "dark"
                    ? "conic-gradient(from 180deg at 50% 50%, rgba(56,189,248,0.42), rgba(16,185,129,0.36), rgba(167,139,250,0.4), rgba(56,189,248,0.42))"
                    : "conic-gradient(from 180deg at 50% 50%, rgba(56,189,248,0.22), rgba(16,185,129,0.2), rgba(167,139,250,0.2), rgba(56,189,248,0.22))",
              }}
            />
            <div
              className="pointer-events-none absolute -inset-5 rounded-[28px] blur-3xl"
              style={{
                opacity: theme === "dark" ? 0.92 : 0.45,
                background:
                  theme === "dark"
                    ? "radial-gradient(120% 90% at 50% 50%, rgba(99,102,241,0.28) 0%, rgba(14,165,233,0.24) 35%, rgba(16,185,129,0.2) 65%, rgba(0,0,0,0) 100%)"
                    : "radial-gradient(120% 90% at 50% 50%, rgba(99,102,241,0.16) 0%, rgba(14,165,233,0.14) 35%, rgba(16,185,129,0.1) 65%, rgba(0,0,0,0) 100%)",
              }}
            />
          </>
        )}
        <div
          className={`relative z-10 flex flex-col backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden rounded-2xl ${showTerminal ? "h-56" : "h-11"}`}
          style={{
            background:
              theme === "light"
                ? "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)"
                : "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(15,23,42,0.9) 100%)",
            border: "1px solid var(--border-color)",
            boxShadow: showTerminal
              ? "0 20px 45px rgba(15,23,42,0.28)"
              : "0 8px 20px rgba(15,23,42,0.2)",
          }}
        >
          <div
            className={`px-4 py-2 flex justify-between items-center text-xs cursor-pointer select-none transition-colors duration-200 shrink-0 ${
              theme === "dark" ? "hover:bg-white/5" : "hover:bg-black/5"
            }`}
            style={{
              borderBottom: "1px solid var(--border-color)",
              color: "var(--text-muted)",
            }}
            onClick={() => setShowTerminal(!showTerminal)}
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBottomPanelTab("terminal");
                  if (!showTerminal) setShowTerminal(true);
                }}
                className={`font-bold font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                  bottomPanelTab === "terminal"
                    ? theme === "dark"
                      ? "bg-indigo-500/30 text-indigo-100 border-indigo-300/70 shadow-[0_0_0_1px_rgba(129,140,248,0.35)_inset]"
                      : "bg-indigo-500/15 text-indigo-600 border-indigo-400/40"
                    : theme === "dark"
                      ? "hover:bg-white/5 text-slate-200"
                      : "hover:bg-black/5"
                }`}
                style={{ borderColor: "var(--border-color)" }}
              >
                Terminal
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBottomPanelTab("console");
                  if (!showTerminal) setShowTerminal(true);
                }}
                className={`font-bold font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 rounded-lg border transition-all duration-200 flex items-center gap-2 ${
                  bottomPanelTab === "console"
                    ? theme === "dark"
                      ? "bg-cyan-500/30 text-cyan-100 border-cyan-300/70 shadow-[0_0_0_1px_rgba(103,232,249,0.35)_inset]"
                      : "bg-cyan-500/15 text-cyan-700 border-cyan-400/40"
                    : theme === "dark"
                      ? "hover:bg-white/5 text-slate-200"
                      : "hover:bg-black/5"
                }`}
                style={{ borderColor: "var(--border-color)" }}
              >
                Console
                {previewConsoleErrorCount > 0 && (
                  <span className="inline-flex min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] leading-4 justify-center">
                    {previewConsoleErrorCount}
                  </span>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTerminal((prev) => !prev);
              }}
              className={`h-7 w-7 rounded-lg border transition-all duration-300 flex items-center justify-center ${
                showTerminal
                  ? theme === "dark"
                    ? "rotate-180 bg-white/10"
                    : "rotate-180 bg-black/5"
                  : ""
              }`}
              style={{ borderColor: "var(--border-color)" }}
            >
              {showTerminal ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
          {/* Always mounted, visibility controlled by parent height */}
          <div
            className={`flex-1 overflow-hidden transition-opacity duration-300 ${showTerminal ? "opacity-100" : "opacity-0"}`}
          >
            {bottomPanelTab === "terminal" ? (
              <Terminal />
            ) : (
              <div
                className="h-full flex flex-col"
                style={{
                  background:
                    theme === "dark"
                      ? "linear-gradient(180deg, rgba(2,6,23,0.58) 0%, rgba(2,6,23,0.42) 100%)"
                      : "linear-gradient(180deg,rgba(15,23,42,0.06)_0%,rgba(15,23,42,0.02)_100%)",
                }}
              >
                <div
                  className="px-3 py-2 text-[11px] font-mono flex items-center justify-between"
                  style={{
                    borderBottom: "1px solid var(--border-color)",
                    background:
                      theme === "dark"
                        ? "linear-gradient(90deg, rgba(59,130,246,0.2) 0%, rgba(16,185,129,0.14) 100%)"
                        : "linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(16,185,129,0.04) 100%)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border"
                      style={{
                        borderColor:
                          theme === "dark"
                            ? "rgba(148,163,184,0.35)"
                            : "rgba(148,163,184,0.2)",
                        backgroundColor:
                          theme === "dark"
                            ? "rgba(148,163,184,0.16)"
                            : "rgba(100,116,139,0.1)",
                        color: theme === "dark" ? "#e2e8f0" : "#334155",
                      }}
                    >
                      Logs {previewConsoleEntries.length}
                    </span>
                    {previewConsoleWarnCount > 0 && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-amber-400/30 bg-amber-500/15 text-amber-700">
                        Warn {previewConsoleWarnCount}
                      </span>
                    )}
                    {previewConsoleErrorCount > 0 && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-red-400/30 bg-red-500/15 text-red-700">
                        Error {previewConsoleErrorCount}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-md border text-[10px] uppercase tracking-wider transition-colors ${
                      theme === "dark"
                        ? "hover:bg-white/10"
                        : "hover:bg-black/5"
                    }`}
                    style={{
                      borderColor: "var(--border-color)",
                      color: "var(--text-muted)",
                      backgroundColor:
                        theme === "dark"
                          ? "rgba(15,23,42,0.5)"
                          : "rgba(255,255,255,0.35)",
                    }}
                    onClick={() => {
                      previewConsoleSeqRef.current = 0;
                      previewConsoleBufferRef.current = [];
                      if (previewConsoleFlushTimerRef.current !== null) {
                        window.clearTimeout(
                          previewConsoleFlushTimerRef.current,
                        );
                        previewConsoleFlushTimerRef.current = null;
                      }
                      setPreviewConsoleEntries([]);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] space-y-1.5 custom-scrollbar">
                  {previewConsoleEntries.length === 0 ? (
                    <div
                      className="h-full min-h-[110px] flex items-center justify-center rounded-xl border border-dashed"
                      style={{
                        borderColor:
                          theme === "dark"
                            ? "rgba(148,163,184,0.35)"
                            : "rgba(148,163,184,0.25)",
                        backgroundColor:
                          theme === "dark"
                            ? "rgba(15,23,42,0.55)"
                            : "rgba(255,255,255,0.3)",
                      }}
                    >
                      <div className="text-center">
                        <div
                          className="text-[12px] font-semibold"
                          style={{
                            color: theme === "dark" ? "#e2e8f0" : "#475569",
                          }}
                        >
                          No project logs yet
                        </div>
                        <div
                          className="text-[10px] mt-1"
                          style={{
                            color: theme === "dark" ? "#94a3b8" : "#64748b",
                          }}
                        >
                          Interact with the preview to stream console output
                          here
                        </div>
                      </div>
                    </div>
                  ) : (
                    previewConsoleEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="whitespace-pre-wrap break-words px-2.5 py-2 rounded-lg border shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]"
                        style={{
                          backgroundColor:
                            entry.level === "error"
                              ? "rgba(239, 68, 68, 0.10)"
                              : entry.level === "warn"
                                ? "rgba(245, 158, 11, 0.10)"
                                : entry.level === "info"
                                  ? "rgba(14, 165, 233, 0.10)"
                                  : "rgba(15, 23, 42, 0.05)",
                          borderColor:
                            entry.level === "error"
                              ? "rgba(239, 68, 68, 0.35)"
                              : entry.level === "warn"
                                ? "rgba(245, 158, 11, 0.35)"
                                : entry.level === "info"
                                  ? "rgba(14, 165, 233, 0.35)"
                                  : "rgba(100, 116, 139, 0.22)",
                          color:
                            entry.level === "error"
                              ? theme === "dark"
                                ? "#fca5a5"
                                : "#dc2626"
                              : entry.level === "warn"
                                ? theme === "dark"
                                  ? "#fcd34d"
                                  : "#d97706"
                                : entry.level === "info"
                                  ? theme === "dark"
                                    ? "#7dd3fc"
                                    : "#0369a1"
                                  : theme === "dark"
                                    ? "#e2e8f0"
                                    : "var(--text-main)",
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border"
                            style={{
                              borderColor:
                                entry.level === "error"
                                  ? "rgba(239, 68, 68, 0.5)"
                                  : entry.level === "warn"
                                    ? "rgba(245, 158, 11, 0.5)"
                                    : entry.level === "info"
                                      ? "rgba(14, 165, 233, 0.5)"
                                      : "rgba(100, 116, 139, 0.35)",
                              backgroundColor:
                                entry.level === "error"
                                  ? "rgba(239,68,68,0.12)"
                                  : entry.level === "warn"
                                    ? "rgba(245,158,11,0.12)"
                                    : entry.level === "info"
                                      ? "rgba(14,165,233,0.12)"
                                      : "rgba(100,116,139,0.10)",
                            }}
                          >
                            {entry.level}
                          </span>
                          <span className="text-[10px] opacity-70">
                            {new Date(entry.time).toLocaleTimeString()}
                          </span>
                          <span className="text-[10px] opacity-60">
                            {entry.source}
                          </span>
                        </div>
                        <div className="leading-5">{entry.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

type EditorContentProps = {
  root: VirtualElement;
  selectedId: string | null;
  selectedPathIds: Set<string> | null;
  handleSelect: (id: string) => void;
  handleMoveElement: (draggedId: string, targetId: string) => void;
  handleMoveElementByPosition: (
    id: string,
    styles: Partial<React.CSSProperties>,
  ) => void;
  handleResize: (id: string, width: string, height: string) => void;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  INJECTED_STYLES: string;
};

const resolvePreviewImagePath = (path: string) => path;

// --- Sub-Component for Content (Dry) ---
const EditorContent = React.memo<EditorContentProps>(
  ({
    root,
    selectedId,
    selectedPathIds,
    handleSelect,
    handleMoveElement,
    handleMoveElementByPosition,
    handleResize,
    interactionMode,
    INJECTED_STYLES,
  }) => (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `* { outline: none; } ${selectedId ? `[data-id="${selectedId}"] { outline: 2px solid #6366f1 !important; z-index: 10; cursor: default; }` : ""}`,
        }}
      />
      <div className="w-full h-full overflow-auto custom-scrollbar bg-white">
        <EditorCanvas
          element={root}
          selectedId={selectedId}
          selectedPathIds={selectedPathIds}
          onSelect={handleSelect}
          resolveImage={resolvePreviewImagePath}
          onMoveElement={handleMoveElement}
          onMoveByPosition={handleMoveElementByPosition}
          onResize={handleResize}
          interactionMode={interactionMode}
        />
      </div>
    </>
  ),
);
EditorContent.displayName = "EditorContent";

export default App;
