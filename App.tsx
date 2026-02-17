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

const updateElementInTree = (
  root: VirtualElement,
  id: string,
  updater: (el: VirtualElement) => VirtualElement,
): VirtualElement => {
  if (root.id === id) {
    return updater(root);
  }
  return {
    ...root,
    children: root.children.map((child) =>
      updateElementInTree(child, id, updater),
    ),
  };
};

const deleteElementFromTree = (
  root: VirtualElement,
  id: string,
): VirtualElement => {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== id)
      .map((child) => deleteElementFromTree(child, id)),
  };
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

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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
  const exactLower = Object.keys(fileMap).find((k) => k.toLowerCase() === lower);
  return exactLower ?? null;
};

const resolvePreviewNavigationPath = (
  currentHtmlPath: string,
  rawTarget: string,
  fileMap: FileMap,
): string | null => {
  const normalizedRaw = String(rawTarget || "").trim();
  if (!normalizedRaw) return null;
  if (/^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(normalizedRaw)) {
    return null;
  }

  const directCandidate = normalizeProjectRelative(normalizedRaw.replace(/^\/+/, ""));
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
  const base = normalizePath(basePath).replace(/[\\/]$/, "").toLowerCase();
  const candidate = normalizePath(candidatePath).toLowerCase();
  return candidate === base || candidate.startsWith(`${base}/`);
};

const toMountRelativePath = (basePath: string, absolutePath: string): string | null => {
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

const buildPreviewRuntimeScript = (fileMap: FileMap, htmlPath: string): string => {
  const records: Record<
    string,
    { kind: "text"; content: string } | { kind: "data"; data: string }
  > = {};

  for (const [path, file] of Object.entries(fileMap)) {
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

    document.addEventListener('click', function(event) {
      var target = event && event.target;
      if (!target || !target.closest) return;
      var anchor = target.closest('a[href]');
      if (!anchor) return;
      var href = anchor.getAttribute('href');
      var navTarget = resolveNavigationTarget(href);
      if (!navTarget) return;
      event.preventDefault();
      event.stopPropagation();
      notifyNavigate(navTarget);
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

const createPreviewDocument = (fileMap: FileMap, htmlPath: string): string => {
  const entry = fileMap[htmlPath];
  if (
    !entry ||
    typeof entry.content !== "string" ||
    entry.content.trim().length === 0
  ) {
    return "";
  }
  let html = entry.content;
  const runtimeScript = buildPreviewRuntimeScript(fileMap, htmlPath);

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
      const aNum = aMatch ? Number.parseInt(aMatch[1], 10) : Number.MAX_SAFE_INTEGER;
      const bNum = bMatch ? Number.parseInt(bMatch[1], 10) : Number.MAX_SAFE_INTEGER;
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
  return {
    ...root,
    children: root.children.map((child) =>
      addElementToTree(child, parentId, newElement, position),
    ),
  };
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
            else if (type === "desktop") setDesktopResolution(item.value as any);
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
  const [previewMountBasePath, setPreviewMountBasePath] = useState<string | null>(null);
  const [isPreviewMountReady, setIsPreviewMountReady] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [previewSyncedFile, setPreviewSyncedFile] = useState<string | null>(null);
  const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile" | "tablet">(
    "tablet",
  );
  const [interactionMode, setInteractionMode] = useState<
    "edit" | "preview" | "inspect" | "draw"
  >("edit");
  const [drawElementTag, setDrawElementTag] = useState<string>("div");
  const [showTerminal, setShowTerminal] = useState(false);
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
  const [frameZoom, setFrameZoom] = useState<50 | 75 | 100>(100);
  const [deviceCtxMenu, setDeviceCtxMenu] = useState<{
    type: "mobile" | "desktop" | "tablet";
    x: number;
    y: number;
  } | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState("");
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
  const filePathIndexRef = useRef<Record<string, string>>({});
  const previewRootAliasPathRef = useRef<string | null>(null);
  const loadingFilesRef = useRef<Set<string>>(new Set());
  const loadingFilePromisesRef = useRef<
    Record<string, Promise<string | Blob | undefined>>
  >({});
  const filesRef = useRef<FileMap>({});
  const activeFileRef = useRef<string | null>(null);
  const interactionModeRef = useRef<"edit" | "preview" | "inspect" | "draw">("edit");
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
      setPreviewConsoleEntries((prev) => {
        const nextId = previewConsoleSeqRef.current + 1;
        previewConsoleSeqRef.current = nextId;
        const next = [
          ...prev,
          { id: nextId, level, message, source, time: Date.now() },
        ];
        return next.length > 1000 ? next.slice(next.length - 1000) : next;
      });
    },
    [],
  );

  // Desktop only: both panels open in overlay mode with horizontal scroll.
  const bothPanelsOpen =
    isLeftPanelOpen && isRightPanelOpen && deviceMode !== "mobile";
  const rightOverlayInset = bothPanelsOpen ? RIGHT_PANEL_WIDTH : 0;
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
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
  const syncPreviewActiveFile = useCallback(
    (
      nextPath: string,
      source: "load" | "navigate" | "path_changed" | "explorer",
    ) => {
      if (!nextPath) return;
      setPreviewSyncedFile((prev) => (prev === nextPath ? prev : nextPath));

      if (source === "load" || source === "path_changed") {
        if (interactionModeRef.current !== "preview") {
          setInteractionMode("preview");
        }
        return;
      }

      if (activeFileRef.current === nextPath) return;

      const now = Date.now();
      const last = lastPreviewSyncRef.current;
      if (last && last.path === nextPath && last.source !== source && now - last.at < 1200) {
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
    if (bothPanelsOpen && scrollerRef.current) {
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
    desktopResolution,
    deviceMode,
    isLeftPanelOpen,
    isRightPanelOpen,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors.
    }
  }, [theme]);

  useEffect(() => {
    if (!appRootRef.current) return;
    appRootRef.current.style.setProperty("--left-panel-width", `${leftPanelWidth}px`);
  }, [leftPanelWidth]);

  useEffect(() => {
    if (!isResizingLeftPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - leftPanelResizeStartXRef.current;
      leftPanelPendingWidthRef.current = Math.min(
        LEFT_PANEL_MAX_WIDTH,
        Math.max(LEFT_PANEL_MIN_WIDTH, leftPanelResizeStartWidthRef.current + delta),
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

  const handleLeftPanelResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isLeftPanelOpen) return;
    event.preventDefault();
    leftPanelResizeStartXRef.current = event.clientX;
    leftPanelResizeStartWidthRef.current = leftPanelWidth;
    leftPanelPendingWidthRef.current = leftPanelWidth;
    setIsResizingLeftPanel(true);
  }, [isLeftPanelOpen, leftPanelWidth]);

  // --- History Management ---
  const pushHistory = useCallback((newState: VirtualElement) => {
    setHistory((curr) => ({
      past: [...curr.past, curr.present],
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
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();

      // Ctrl+K — Command Palette
      if (key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      // Ctrl+A — Toggle Left Panel
      if (key === "a") {
        e.preventDefault();
        setIsLeftPanelOpen((prev) => !prev);
      }
      // Ctrl+B — Toggle Right Panel
      if (key === "b") {
        e.preventDefault();
        setIsRightPanelOpen((prev) => !prev);
      }
      // Ctrl+F — Toggle Both Panels (open both, or close both if already open)
      if (key === "f") {
        e.preventDefault();
        const shouldOpen = !(isLeftPanelOpen && isRightPanelOpen);
        setIsLeftPanelOpen(shouldOpen);
        setIsRightPanelOpen(shouldOpen);
      }
      // Ctrl+` — Toggle Terminal
      if (key === "`") {
        e.preventDefault();
        setShowTerminal((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLeftPanelOpen, isRightPanelOpen]);

  // --- Actions ---
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
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
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        animation,
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

  const handleCommandAction = (actionId: string, payload?: any) => {
    switch (actionId) {
      case "undo":
        handleUndo();
        break;
      case "redo":
        handleRedo();
        break;
      case "view-desktop":
        setDeviceMode("desktop");
        break;
      case "view-mobile":
        setDeviceMode("mobile");
        break;
      case "toggle-preview":
        setInteractionMode((prev) => (prev === "preview" ? "edit" : "preview"));
        break;
      case "clear-selection":
        setSelectedId(null);
        break;
      default:
        if (actionId.startsWith("add-")) handleAddElement(payload, "inside");
    }
  };

  const loadFileContent = useCallback(
    async (relativePath: string) => {
      const target = filesRef.current[relativePath];
      if (!target) return;
      if (typeof target.content === "string" && target.content.length > 0) {
        return target.content;
      }
      if (loadingFilePromisesRef.current[relativePath]) {
        return loadingFilePromisesRef.current[relativePath];
      }

      const absolutePath = filePathIndexRef.current[relativePath];
      if (!absolutePath) return;

      const pending = (async () => {
        loadingFilesRef.current.add(relativePath);
        try {
          let content: string | Blob = "";
          if (target.type === "image" || target.type === "font") {
            const binaryData = await (Neutralino as any).filesystem.readBinaryFile(
              absolutePath,
            );
            const bytes = toByteArray(binaryData);
            const base64 = toBase64(bytes);
            const mime = mimeFromType(target.type, target.name);
            content = `data:${mime};base64,${base64}`;
          } else {
            content = await (Neutralino as any).filesystem.readFile(absolutePath);
          }

          setFiles((prev) => {
            const current = prev[relativePath];
            if (!current) return prev;
            if (
              typeof current.content === "string" &&
              current.content.length > 0
            ) {
              return prev;
            }
            return { ...prev, [relativePath]: { ...current, content } };
          });
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
    [],
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

      const indexSharedDirectory = async (sharedRoot: string): Promise<void> => {
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
        await (Neutralino as any).server.mount(PREVIEW_MOUNT_PATH, mountBasePath);
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
            await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH_IN_PREVIEW);
          }
          await (Neutralino as any).server.mount(
            SHARED_MOUNT_PATH_IN_PREVIEW,
            sharedDirectoryPath,
          );
        } else if (mounts?.[SHARED_MOUNT_PATH]) {
          await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH);
          if (mounts?.[SHARED_MOUNT_PATH_IN_PREVIEW]) {
            await (Neutralino as any).server.unmount(SHARED_MOUNT_PATH_IN_PREVIEW);
          }
        }

        mountReady = true;
      } catch (error) {
        console.warn("Virtual host mount failed. Falling back to srcDoc preview.", error);
      }

      filePathIndexRef.current = absolutePathIndex;
      loadingFilesRef.current.clear();
      loadingFilePromisesRef.current = {};
      previewConsoleSeqRef.current = 0;
      setPreviewConsoleEntries([]);
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
  const selectedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (activeFile && files[activeFile]?.type === "html") return activeFile;
    return pickDefaultHtmlFile(files);
  }, [activeFile, files, projectPath]);
  const selectedPreviewSrc = useMemo(() => {
    if (!selectedPreviewHtml || !isPreviewMountReady || !previewMountBasePath) {
      return null;
    }
    const absolutePath = filePathIndexRef.current[selectedPreviewHtml];
    if (!absolutePath) return null;
    const relativePath = toMountRelativePath(previewMountBasePath, absolutePath);
    if (!relativePath) return null;
    const nlPort = String((window as any).NL_PORT || "").trim();
    const previewServerOrigin = nlPort ? `http://127.0.0.1:${nlPort}` : "";
    const mountPath = encodeURI(`${PREVIEW_MOUNT_PATH}/${relativePath}`);
    return previewServerOrigin ? `${previewServerOrigin}${mountPath}` : mountPath;
  }, [
    selectedPreviewHtml,
    isPreviewMountReady,
    previewMountBasePath,
    projectPath,
  ]);
  const hasPreviewContent = Boolean(projectPath && (selectedPreviewSrc || selectedPreviewDoc));

  const resolveVirtualPathFromMountRelative = useCallback(
    (mountRelativePath: string): string | null => {
      if (!previewMountBasePath || !mountRelativePath) return null;
      const normalizedTarget = normalizeProjectRelative(
        decodeURIComponent(mountRelativePath).replace(/^\/+/, ""),
      ).toLowerCase();
      if (!normalizedTarget) return null;

      for (const virtualPath in filePathIndexRef.current) {
        const absolutePath = filePathIndexRef.current[virtualPath];
        const relative = toMountRelativePath(previewMountBasePath, absolutePath);
        if (!relative) continue;
        if (relative.toLowerCase() === normalizedTarget) {
          return virtualPath;
        }
      }
      return null;
    },
    [previewMountBasePath],
  );

  const extractMountRelativePath = useCallback((locationPath: string): string | null => {
    if (!locationPath) return null;
    if (locationPath.startsWith(`${PREVIEW_MOUNT_PATH}/`)) {
      return locationPath.slice(PREVIEW_MOUNT_PATH.length + 1);
    }
    const aliasPath = previewRootAliasPathRef.current;
    if (aliasPath && locationPath.startsWith(`${aliasPath}/`)) {
      return locationPath.slice(aliasPath.length + 1);
    }
    return null;
  }, []);

  const handlePreviewFrameLoad = useCallback((event: React.SyntheticEvent<HTMLIFrameElement>) => {
    if (!isPreviewMountReady) return;
    const frame = event.currentTarget;
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
    const resolvedVirtualPath = resolveVirtualPathFromMountRelative(mountRelativePath);
    if (!resolvedVirtualPath) return;
    const resolvedFile = filesRef.current[resolvedVirtualPath];
    if (!resolvedFile || resolvedFile.type !== "html") return;
    if (resolvedVirtualPath === activeFileRef.current) return;

    console.log("[Preview] Current page:", resolvedVirtualPath);
    syncPreviewActiveFile(resolvedVirtualPath, "load");
  }, [
    extractMountRelativePath,
    isPreviewMountReady,
    resolveVirtualPathFromMountRelative,
    syncPreviewActiveFile,
  ]);

  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent) => {
      const payload = event.data as
        | {
            type?: string;
            path?: string;
            level?: PreviewConsoleLevel;
            message?: string;
            source?: string;
          }
        | undefined;
      if (!payload || !payload.type) return;

      if (payload.type === "PREVIEW_CONSOLE") {
        const level = payload.level ?? "log";
        const message = typeof payload.message === "string" ? payload.message : "";
        if (!message) return;
        appendPreviewConsole(level, message, payload.source || "preview");
        return;
      }

      if (payload.type === "PREVIEW_NAVIGATE") {
        if (!selectedPreviewHtml || !payload.path) return;
        const target = resolvePreviewNavigationPath(
          selectedPreviewHtml,
          payload.path,
          filesRef.current,
        );
        if (!target) return;
        console.log("[Preview] Current page:", target);
        if (selectedPreviewSrc) {
          setPreviewSyncedFile((prev) => (prev === target ? prev : target));
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
        if (!payload.path) return;
        const mountRelativePath = extractMountRelativePath(payload.path);
        if (!mountRelativePath) return;
        const resolvedVirtualPath =
          resolveVirtualPathFromMountRelative(mountRelativePath);
        if (!resolvedVirtualPath) return;
        const resolvedFile = filesRef.current[resolvedVirtualPath];
        if (!resolvedFile || resolvedFile.type !== "html") return;
        if (resolvedVirtualPath === activeFileRef.current) return;
        console.log("[Preview] Current page:", resolvedVirtualPath);
        syncPreviewActiveFile(resolvedVirtualPath, "path_changed");
      }
    };

    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
  }, [
    appendPreviewConsole,
    selectedPreviewSrc,
    extractMountRelativePath,
    resolveVirtualPathFromMountRelative,
    selectedPreviewHtml,
    syncPreviewActiveFile,
  ]);
  useEffect(() => {
    if (!activeFile) return;
    void loadFileContent(activeFile);
  }, [activeFile, loadFileContent]);

  useEffect(() => {
    if (!selectedPreviewHtml) {
      setSelectedPreviewDoc("");
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
          if (resolved && fileMapSnapshot[resolved]) dependencyPaths.add(resolved);
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
          if (resolved && fileMapSnapshot[resolved]) dependencyPaths.add(resolved);
          return _full;
        },
      );

      html.replace(/\b(src|href)=["']([^"']+)["']/gi, (_full, _attr, raw) => {
        const resolved = resolveProjectRelativePath(selectedPreviewHtml, raw);
        if (resolved && fileMapSnapshot[resolved]) dependencyPaths.add(resolved);
        return _full;
      });

      // Legacy projects often request shared HTML fragments dynamically.
      // Preload only these lightweight content fragments to avoid heavy startup cost.
      for (const path of Object.keys(fileMapSnapshot)) {
        const lowerPath = path.toLowerCase();
        if (
          (lowerPath.includes("shared/media/content/") ||
            lowerPath.includes("/shared/media/content/")) &&
          (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm"))
        ) {
          dependencyPaths.add(path);
        }
        if (
          (lowerPath.includes("shared/media/icons/") ||
            lowerPath.includes("/shared/media/icons/")) &&
          (lowerPath.endsWith(".svg") ||
            lowerPath.endsWith(".png") ||
            lowerPath.endsWith(".jpg") ||
            lowerPath.endsWith(".jpeg") ||
            lowerPath.endsWith(".webp") ||
            lowerPath.endsWith(".gif"))
        ) {
          dependencyPaths.add(path);
        }
        if (
          (lowerPath.includes("shared/media/fonts/") ||
            lowerPath.includes("/shared/media/fonts/")) &&
          (lowerPath.endsWith(".woff") ||
            lowerPath.endsWith(".woff2") ||
            lowerPath.endsWith(".ttf") ||
            lowerPath.endsWith(".otf") ||
            lowerPath.endsWith(".eot"))
        ) {
          dependencyPaths.add(path);
        }
      }

      const loaded = await Promise.all(
        Array.from(dependencyPaths).map(async (path) => {
          const content = await loadFileContent(path);
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
      setSelectedPreviewDoc(
        createPreviewDocument(fileMapSnapshot, selectedPreviewHtml),
      );
    };

    void preloadPreviewDependencies();
    return () => {
      canceled = true;
    };
  }, [
    loadFileContent,
    selectedPreviewHtml,
  ]);

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
  const frameScale = frameZoom / 100;

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
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-4 glass-toolbar rounded-full px-6 py-2 transition-all hover:scale-[1.02] animate-slideDown">
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
            onClick={() => setDeviceMode("tablet")}
            onContextMenu={(e) => {
              e.preventDefault();
              setDeviceMode("tablet");
              setDeviceCtxMenu({ type: "tablet", x: e.clientX, y: e.clientY });
            }}
            title="iPad (right-click for model)"
          >
            <Tablet size={16} />
          </button>
          <button
            className="glass-icon-btn"
            onClick={() =>
              setTabletOrientation((prev) =>
                prev === "landscape" ? "portrait" : "landscape",
              )
            }
            title={`Rotate iPad (${tabletOrientation === "landscape" ? "Landscape" : "Portrait"})`}
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
                    ? "bg-indigo-500/25 text-indigo-300"
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
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
              interactionMode === "preview"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20"
            }`}
            onClick={() =>
              setInteractionMode((prev) =>
                prev === "preview" ? "edit" : "preview",
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
        </div>
      </div>

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
          className={`absolute left-0 top-0 bottom-0 z-40 ${isResizingLeftPanel ? "" : "transition-all duration-500"} ${isLeftPanelOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{
            width: "var(--left-panel-width)",
            transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          <div className="h-full glass-panel-strong flex flex-col">
              <Sidebar
                files={files}
                projectPath={projectPath}
                activeFile={previewSyncedFile ?? activeFile}
                onSelectFile={handleSelectFile}
              onAddElement={(type) => handleAddElement(type, "inside")}
              root={root}
              selectedId={selectedId}
              onSelectElement={handleSelect}
              interactionMode={interactionMode}
              setInteractionMode={setInteractionMode}
              drawElementTag={drawElementTag}
              setDrawElementTag={setDrawElementTag}
            />
          </div>
          {isLeftPanelOpen && (
            <div
              onMouseDown={handleLeftPanelResizeStart}
              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-indigo-400/25 transition-colors"
              title="Resize panel"
            />
          )}
          <button
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
            className="absolute -right-6 top-[3.25rem] glass-button p-1 rounded-r-lg border-l-0 shadow-lg z-50 hover:pl-2 transition-all"
          >
            {isLeftPanelOpen ? (
              <PanelLeftClose size={14} />
            ) : (
              <PanelLeft size={14} />
            )}
          </button>
        </div>

        {/* --- Main Canvas Area ("The Stage") --- */}
        {/* Non-mobile: 1 panel = push, both panels = overlay with scrollable content. Mobile: always overlay. */}
        <div
          className={`flex-1 flex flex-col relative ${isResizingLeftPanel ? "" : "transition-all duration-500"}`}
          style={{
            marginLeft:
              deviceMode !== "mobile" && isLeftPanelOpen && !isRightPanelOpen
                ? "var(--left-panel-width)"
                : 0,
            marginRight:
              deviceMode !== "mobile" && !isLeftPanelOpen && isRightPanelOpen
                ? "16.5rem"
                : 0,
            // When both panels open, no margins - content will scroll
          }}
        >
          {/* Background & Scroller */}
          <div
            ref={scrollerRef}
            className={`flex-1 relative transition-all duration-300 ${showTerminal ? "pb-52" : "pb-10"}`}
            style={{
              overflow: bothPanelsOpen ? "auto" : "auto",
              overflowX: bothPanelsOpen ? "scroll" : "auto",
            }}
            onClick={() => setSelectedId(null)}
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
                  transform: `scale(${frameScale})`,
                  transformOrigin: "top center",
                }}
              >
                {/* Actual Device Frame */}
                  <div
                    className={`
                              relative z-10 shrink-0 transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                              ${
                                deviceMode === "desktop"
                                  ? "rounded-xl border-4 border-[#1e293b]"
                                  : deviceMode === "tablet"
                                    ? "w-full h-full rounded-[42px] border-[10px] border-[#0f172a]"
                                    : "w-full h-full rounded-[50px] border-[12px] border-black"
                              }
                              bg-black shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)]
                          `}
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    // No transform on the frame itself - it stays fixed visual size
                  }}
                >
                  {/* Morphing Header (Window Bar <-> Notch) */}
                  <div
                    className={`
                            absolute top-0 left-1/2 -translate-x-1/2 z-20 ${deviceMode === "desktop" ? "bg-[#1e293b]" : deviceMode === "tablet" ? "bg-[#0f172a]" : "bg-black"}
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
                        position: deviceMode === "tablet" ? "absolute" : "relative",
                        left: deviceMode === "tablet" ? "50%" : undefined,
                        top: deviceMode === "tablet" ? 0 : undefined,
                      }}
                    >
                      <div className="w-full h-full relative">
                        {hasPreviewContent && (
                          <iframe
                            ref={previewFrameRef}
                            title="project-preview"
                            src={selectedPreviewSrc || undefined}
                            srcDoc={selectedPreviewSrc ? undefined : selectedPreviewDoc}
                            loading="eager"
                            onLoad={handlePreviewFrameLoad}
                            className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-200 ${
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
                            handleSelect={handleSelect}
                            handleMoveElement={handleMoveElement}
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
          className={`absolute right-0 top-0 bottom-0 z-40 transition-all duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) ${isRightPanelOpen ? "w-[16.5rem] translate-x-0" : "w-[16.5rem] translate-x-full"}`}
        >
          <div className="h-full glass-panel-strong shadow-2xl">
            {selectedId && interactionMode === "inspect" ? (
              <StyleInspectorPanel
                element={selectedElement}
                onUpdateStyle={handleUpdateStyle}
              />
            ) : (
              <PropertiesPanel
                element={selectedElement}
                onUpdateStyle={handleUpdateStyle}
                onUpdateContent={handleUpdateContent}
                onUpdateAttributes={handleUpdateAttributes}
                onUpdateAnimation={handleUpdateAnimation}
                onDelete={handleDeleteElement}
                onAddElement={handleAddElement}
                onMoveOrder={(dir) => {}}
                resolveImage={(p) => p}
                availableFonts={[
                  "Inter",
                  "Roboto",
                  "Open Sans",
                  "Lato",
                  "Poppins",
                ]}
              />
            )}
          </div>
          <button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className="absolute -left-6 top-[3.25rem] glass-button p-1 rounded-l-lg border-r-0 shadow-lg z-50 hover:pr-2 transition-all flex justify-end"
          >
            {isRightPanelOpen ? (
              <PanelRightClose size={14} />
            ) : (
              <PanelRight size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Terminal Panel — Glass effect with smooth transition */}
      <div
        className={`fixed bottom-0 left-0 right-0 flex flex-col z-[100] backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${showTerminal ? "h-52" : "h-8"}`}
        style={{
          backgroundColor: "var(--bg-glass-strong)",
          borderTop: "1px solid var(--border-color)",
          boxShadow: showTerminal ? "0 -10px 40px rgba(0,0,0,0.3)" : "none",
        }}
      >
        <div
          className="px-4 py-1.5 flex justify-between items-center text-xs cursor-pointer select-none transition-colors duration-200 hover:bg-black/5 shrink-0"
          style={{
            borderBottom: "1px solid var(--border-color)",
            color: "var(--text-muted)",
          }}
          onClick={() => setShowTerminal(!showTerminal)}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBottomPanelTab("terminal");
                if (!showTerminal) setShowTerminal(true);
              }}
              className={`font-bold font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded-md border transition-colors ${
                bottomPanelTab === "terminal"
                  ? "bg-black/10"
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
              className={`font-bold font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded-md border transition-colors flex items-center gap-2 ${
                bottomPanelTab === "console" ? "bg-black/10" : "hover:bg-black/5"
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
          <span
            className={`transition-transform duration-300 ${showTerminal ? "rotate-180" : ""}`}
          >
            {showTerminal ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </span>
        </div>
        {/* Always mounted, visibility controlled by parent height */}
        <div
          className={`flex-1 overflow-hidden transition-opacity duration-300 ${showTerminal ? "opacity-100" : "opacity-0"}`}
        >
          {bottomPanelTab === "terminal" ? (
            <Terminal />
          ) : (
            <div className="h-full flex flex-col bg-[linear-gradient(180deg,rgba(15,23,42,0.06)_0%,rgba(15,23,42,0.02)_100%)]">
              <div
                className="px-3 py-2 text-[11px] font-mono flex items-center justify-between"
                style={{
                  borderBottom: "1px solid var(--border-color)",
                  background:
                    "linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(16,185,129,0.04) 100%)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-slate-400/20 bg-slate-500/10 text-slate-700">
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
                  className="px-2.5 py-1 rounded-md border text-[10px] uppercase tracking-wider hover:bg-black/5 transition-colors"
                  style={{
                    borderColor: "var(--border-color)",
                    color: "var(--text-muted)",
                    backgroundColor: "rgba(255,255,255,0.35)",
                  }}
                  onClick={() => {
                    previewConsoleSeqRef.current = 0;
                    setPreviewConsoleEntries([]);
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] space-y-1.5 custom-scrollbar">
                {previewConsoleEntries.length === 0 ? (
                  <div className="h-full min-h-[110px] flex items-center justify-center rounded-xl border border-dashed border-slate-400/25 bg-white/30">
                    <div className="text-center">
                      <div className="text-[12px] font-semibold text-slate-600">No project logs yet</div>
                      <div className="text-[10px] mt-1 text-slate-500">
                        Interact with the preview to stream console output here
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
                            ? "#dc2626"
                            : entry.level === "warn"
                              ? "#d97706"
                              : entry.level === "info"
                                ? "#0369a1"
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
                        <span className="text-[10px] opacity-60">{entry.source}</span>
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
  );
};

// --- Sub-Component for Content (Dry) ---
const EditorContent: React.FC<{
  root: VirtualElement;
  selectedId: string | null;
  handleSelect: any;
  handleMoveElement: any;
  handleResize: any;
  interactionMode: any;
  INJECTED_STYLES: string;
}> = ({
  root,
  selectedId,
  handleSelect,
  handleMoveElement,
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
        onSelect={handleSelect}
        resolveImage={(path) => path}
        onMoveElement={handleMoveElement}
        onResize={handleResize}
        interactionMode={interactionMode}
      />
    </div>
  </>
);

export default App;
