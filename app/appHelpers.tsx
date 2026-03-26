import React, { useEffect, useRef } from "react";
import { ElementType, FileMap, ProjectFile, VirtualElement } from "../types";

// --- Helper Functions (Same as before) ---
export const isEdaProject = (files: FileMap) => {
  return Object.keys(files).some(
    (key) =>
      key.endsWith("config.json") ||
      key.endsWith("config.js") ||
      key.endsWith("portfolioconfig.js") ||
      key.endsWith("portfolioconfig.json") ||
      key.includes("shared/js/config.json") ||
      key.includes("shared/config.json"),
  );
};
export const findElementById = (
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

export const collectPathIdsToElement = (
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

export const updateElementInTree = (
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

export const deleteElementFromTree = (
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

export const normalizePath = (path: string): string => path.replace(/\\/g, "/");
export const PREVIEW_LAYER_ID_PREFIX = "preview-path:";
export const PREVIEW_MOUNT_PATH = "/__vh__";
export const SHARED_MOUNT_PATH = "/shared";
export const SHARED_MOUNT_PATH_IN_PREVIEW = "/__vh__/shared";

export const joinPath = (base: string, entry: string): string =>
  `${base.replace(/[\\/]$/, "")}/${entry}`;

export const getParentPath = (path: string): string | null => {
  const normalized = normalizePath(path).replace(/[\\/]$/, "");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return null;
  return normalized.slice(0, idx);
};

export const IGNORED_FOLDERS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);
export const THEME_STORAGE_KEY = "nocode-x-studio-theme";
export const PREVIEW_AUTOSAVE_STORAGE_KEY = "nocode-x-studio-preview-autosave";
export const AI_BACKEND_STORAGE_KEY = "nocode-x-studio-ai-backend";
export const COLAB_URL_STORAGE_KEY = "nocode-x-studio-colab-url";
export const PANEL_SIDE_STORAGE_KEY = "nocode-x-studio-panel-side";
export const SHOW_AI_FEATURES = false;
export const SHOW_SCREENSHOT_FEATURES = false;
export const SHOW_MASTER_TOOLS = true;
export const MAX_CANVAS_HISTORY = 80;
export const MAX_PREVIEW_HISTORY = 60;
export const MAX_PREVIEW_CONSOLE_ENTRIES = 400;
export const MAX_PREVIEW_DOC_CACHE_ENTRIES = 8;
export const MAX_PREVIEW_DOC_CACHE_CHARS = 2_500_000;
export const SHARED_FONT_VIRTUAL_DIR = "shared/media/fonts";
export const PRESENTATION_CSS_VIRTUAL_PATH = "shared/css/presentation.css";
export const FONT_CACHE_VIRTUAL_PATH = "shared/js/nocodex-fonts.json";
export const FONT_CACHE_VERSION = 1;
export const CONFIG_JSON_PATH = "shared/config.json";
export const PORTFOLIO_CONFIG_PATH = "shared/portfolioconfig.json";
export const ADD_TOOL_COMPONENT_PRESETS = new Set([
  "preset:carousel",
  "preset:flip-card",
  "preset:scroll-reveal",
  "preset:drag-card",
  "preset:drop-zone",
  "preset:sortable-list",
  "preset:calendar-dialog",
  "preset:internal-swipe",
  "preset:dots-swipe",
  "preset:video-panel",
  "preset:race-checklist",
  "preset:segmentation-cards",
  "preset:reference-tabs",
  "preset:anim-001-jquery",
  "preset:anim-002-css",
  "preset:clickstream-011",
  "preset:clickstream-012-form",
  "preset:timeline-steps",
  "preset:metric-counters",
  "preset:popup",
]);
export const ADD_TOOL_CSS_MARKER_START = "/* nocodex-add-tool:start */";
export const ADD_TOOL_CSS_MARKER_END = "/* nocodex-add-tool:end */";
export const ADD_TOOL_JS_MARKER_START = "// nocodex-add-tool:start";
export const ADD_TOOL_JS_MARKER_END = "// nocodex-add-tool:end";
export const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
export const ADD_TOOL_COMPONENTS_CSS_CONTENT = `/* Nocode-X Add Tool component styles */
.nx-carousel {
  position: relative;
  display: grid;
  gap: 12px;
  width: min(860px, 100%);
  padding: 14px;
  border: 1px solid rgba(14, 165, 233, 0.35);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.92), rgba(15, 23, 42, 0.88));
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.45);
  overflow: hidden;
}

.nx-carousel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nx-carousel-viewport {
  overflow: hidden;
  border-radius: 12px;
}

.nx-carousel-track {
  display: flex;
  width: 100%;
  transition: transform 0.35s ease;
  will-change: transform;
}

.nx-carousel-slide {
  min-width: 100%;
  height: 170px;
  border-radius: 12px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 16px;
  font-weight: 800;
  font-size: 20px;
}

.nx-carousel-slide.is-a {
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.55), rgba(59, 130, 246, 0.55));
  color: #0f172a;
}

.nx-carousel-slide.is-b {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.62), rgba(99, 102, 241, 0.6));
  color: #fff;
}

.nx-carousel-slide.is-c {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.58), rgba(20, 184, 166, 0.56));
  color: #06281f;
}

.nx-carousel-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.nx-carousel-dot {
  width: 9px;
  height: 9px;
  border: 0;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.55);
  cursor: pointer;
}

.nx-carousel-dot.is-active {
  background: rgba(56, 189, 248, 0.95);
}

.nx-carousel-nav {
  position: absolute;
  top: calc(50% + 12px);
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 2;
}

.nx-carousel-nav.prev { left: 8px; }
.nx-carousel-nav.next { right: 8px; }

.nx-flip-card {
  width: 280px;
  height: 180px;
  perspective: 1000px;
  position: relative;
  cursor: pointer;
}

.nx-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s ease;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 12px 30px rgba(2, 6, 23, 0.16);
}

.nx-flip-card:hover .nx-flip-inner,
.nx-flip-card.is-flipped .nx-flip-inner {
  transform: rotateY(180deg);
}

.nx-flip-face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-weight: 700;
  backface-visibility: hidden;
}

.nx-flip-face.front {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.24));
}

.nx-flip-face.back {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(34, 197, 94, 0.24));
  transform: rotateY(180deg);
}

.nx-scroll-reveal {
  padding: 24px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.3);
  opacity: 0;
  transform: translateY(28px);
  transition: transform 0.5s ease, opacity 0.5s ease;
}

.nx-scroll-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.nx-scroll-reveal-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
}

.nx-scroll-reveal-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.nx-dd-stage {
  display: grid;
  gap: 12px;
  width: min(860px, 100%);
  padding: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.nx-dd-stage-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.nx-dd-stage-help {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.nx-draggable-card {
  width: 180px;
  min-height: 92px;
  border-radius: 10px;
  background: linear-gradient(135deg, #22d3ee, #3b82f6);
  color: #ffffff;
  padding: 12px;
  font-weight: 700;
  cursor: grab;
  user-select: none;
  box-shadow: 0 10px 20px rgba(59, 130, 246, 0.24);
}

.nx-draggable-card.nx-dragging {
  cursor: grabbing;
  opacity: 0.7;
}

.nx-drop-zone {
  min-height: 120px;
  border: 2px dashed #94a3b8;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
  display: grid;
  gap: 8px;
  place-items: center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.nx-drop-zone.nx-drop-over {
  border-color: #2563eb;
  background: #eff6ff;
}

.nx-sortable-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.nx-sortable-item {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  cursor: grab;
  user-select: none;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.nx-sortable-item.nx-dragging {
  opacity: 0.65;
  cursor: grabbing;
}

.nx-file-drop {
  min-height: 128px;
  border: 2px dashed #64748b;
  border-radius: 12px;
  background: #f8fafc;
  display: grid;
  place-items: center;
  padding: 12px;
  text-align: center;
  color: #0f172a;
}

.nx-file-drop.nx-drop-over {
  border-color: #0ea5e9;
  background: #ecfeff;
}

.nx-calendar-wrap {
  display: grid;
  gap: 12px;
  width: min(720px, 100%);
  padding: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.nx-calendar-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nx-calendar-reset {
  border: 1px solid #94a3b8;
  background: #fff;
  color: #0f172a;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}

.nx-calendar-shell {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 10px;
}

.nx-calendar-head {
  display: grid;
  grid-template-columns: 36px 1fr auto 36px;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.nx-calendar-month,
.nx-calendar-year {
  font-size: 30px;
  font-weight: 700;
  color: #0f172a;
}

.nx-calendar-nav {
  border: 0;
  background: transparent;
  font-size: 24px;
  color: #475569;
  cursor: pointer;
}

.nx-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.nx-calendar-day-name {
  background: #475569;
  color: #fff;
  text-align: center;
  font-weight: 700;
  font-size: 12px;
  padding: 8px 0;
}

.nx-calendar-cell {
  background: #f1f5f9;
  min-height: 34px;
  display: grid;
  place-items: center;
  color: #0f172a;
  font-size: 13px;
}

.nx-calendar-cell.is-muted { color: #94a3b8; }
.nx-calendar-cell.is-today { background: #fef08a; }

.nx-swipe-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: min(980px, 100%);
}

.nx-swipe-panel {
  border: 1px solid rgba(15, 23, 42, 0.28);
  border-radius: 14px;
  padding: 10px;
  background: #e5e7eb;
  min-height: 320px;
  position: relative;
}

.nx-swipe-panel-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.nx-swipe-panel .nx-carousel {
  width: 100%;
  min-height: 220px;
  background: transparent;
  box-shadow: none;
  border-color: rgba(15, 23, 42, 0.18);
}

.nx-swipe-panel .nx-carousel-slide {
  height: 150px;
  font-size: 16px;
}

.nx-swipe-panel .nx-carousel-nav {
  top: 55%;
}

.nx-swipe-panel .nx-carousel-dots {
  margin-top: 6px;
}

.nx-function-card {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
  padding: 14px;
  display: grid;
  gap: 10px;
  width: min(720px, 100%);
}

.nx-function-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.nx-function-sub {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.nx-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.nx-chip {
  border: 1px solid #94a3b8;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  color: #0f172a;
  background: #fff;
}

.nx-reference-tabs {
  display: grid;
  gap: 8px;
}

.nx-reference-tabs-head {
  display: flex;
  gap: 8px;
}

.nx-reference-tab {
  border: 1px solid #94a3b8;
  background: #fff;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
}

.nx-reference-list {
  border: 1px dashed #94a3b8;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
}

.nx-anim-card {
  display: grid;
  gap: 10px;
  width: min(760px, 100%);
  padding: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.nx-anim-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.nx-arrow-track {
  width: 100%;
  height: 38px;
  border-radius: 10px;
  background: #ffffff;
  overflow: hidden;
  border: 1px solid #cbd5e1;
}

.nx-arrow-fill {
  width: 0%;
  height: 100%;
  opacity: 1;
  overflow: hidden;
}

.nx-arrow-fill.is-css {
  width: 100%;
  opacity: 0;
}

.nx-arrow-fill img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.nx-anim-card[data-nx-anim-001-ready="true"] .nx-arrow-fill {
  transition: width 2s ease-in-out;
  width: 100%;
}

.nx-arrow-fill.load1 {
  transition: opacity 3s ease-in;
  opacity: 1;
}

.nx-arrow-fill.load2 {
  opacity: 1;
}

.nx-clickstream-card {
  display: grid;
  gap: 10px;
  width: min(760px, 100%);
  padding: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}

.nx-clickstream-grid {
  display: grid;
  gap: 8px;
}

.nx-clickstream-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #0f172a;
}

.nx-clickstream-select,
.nx-clickstream-slider,
.nx-clickstream-submit {
  border: 1px solid #94a3b8;
  border-radius: 8px;
  background: #fff;
  padding: 6px 10px;
}

.nx-clickstream-status {
  font-size: 12px;
  color: #475569;
}

.nx-video-demo {
  display: grid;
  gap: 12px;
  width: min(820px, 100%);
  padding: 16px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #e5e7eb;
}

.nx-video-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.nx-video-dialog-btn {
  border: 1px solid #9ca3af;
  background: #ffffff;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #111827;
  font-weight: 600;
}

.nx-video-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.nx-video-shell {
  border: 1px solid #c7c7c7;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
  position: relative;
}

.nx-video-header {
  padding: 4px 4px 8px;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.nx-video-frame {
  height: 136px;
  border-radius: 8px;
  border: 1px solid #9ca3af;
  background: linear-gradient(130deg, #384454 0%, #1f2937 100%);
  position: relative;
  overflow: hidden;
}

.nx-video-frame::after {
  content: "";
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 2px solid #ffffff;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.08);
}

.nx-video-frame::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-40%, -50%);
  width: 0;
  height: 0;
  border-left: 11px solid #ffffff;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  z-index: 2;
}

.nx-video-tabs {
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
}

.nx-video-tab {
  min-width: 110px;
  border: 1px solid #9ca3af;
  background: #9ca3af;
  border-radius: 12px 12px 0 0;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  text-align: center;
}

.nx-video-tab.is-active {
  background: #ec6608;
  border-color: #ec6608;
}

.nx-video-inline {
  border: 1px solid #c7c7c7;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
}

.nx-video-inline-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: #111827;
}

.nx-video-inline-player {
  width: 100%;
  height: 220px;
  border-radius: 8px;
  background: #0f172a;
  object-fit: cover;
}

/* Backward-compat cleanup for older inserted video blocks */
[data-nx-video-tool] > .nx-function-title,
[data-nx-video-tool] > .nx-function-sub,
[data-nx-video-tool] > .nx-video-actions,
[data-nx-video-tool] .nx-video-inline-title {
  display: none !important;
}

[data-nx-video-tool] .dialog.videoDialog,
[data-nx-video-tool] .videoDialog {
  display: none !important;
}

.nx-file-drop-output {
  margin-top: 8px;
  width: 100%;
  font-size: 12px;
  color: #334155;
  display: grid;
  gap: 4px;
}

/* Popup Styles */
.nx-popup-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  width: 400px;
  min-height: 200px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  z-index: 10001;
  opacity: 0;
  pointer-events: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.nx-popup-content.is-active {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
}

.nx-popup-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 10000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.nx-popup-backdrop.is-active {
  opacity: 1;
  pointer-events: auto;
}

.nx-popup-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}

.nx-popup-close:hover {
  background: rgba(0, 0, 0, 0.1);
}

.nx-popup-trigger {
  cursor: pointer;
}
`;
export const ADD_TOOL_COMPONENTS_JS_CONTENT = `(function () {
  if (window.NXAddToolComponents) return;

  var activeDragId = '';
  var activeSortableId = '';
  var revealObserver = null;

  function closestBySelector(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  function toInt(value, fallback) {
    var parsed = parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function updateCarousel(root, nextIndex) {
    if (!root) return;
    var track = root.querySelector('[data-nx-carousel-track]');
    var slides = root.querySelectorAll('[data-nx-carousel-slide]');
    if (!track || !slides || slides.length === 0) return;
    var maxIndex = Math.max(0, slides.length - 1);
    var index = Math.max(0, Math.min(maxIndex, nextIndex));
    root.setAttribute('data-nx-carousel-index', String(index));
    track.style.transform = 'translateX(' + (-100 * index) + '%)';

    var dots = root.querySelectorAll('[data-nx-carousel-dot]');
    for (var i = 0; i < dots.length; i += 1) {
      var dot = dots[i];
      if (toInt(dot.getAttribute('data-index'), 0) === index) dot.classList.add('is-active');
      else dot.classList.remove('is-active');
    }
  }

  function initCarousel(root) {
    if (!root || root.getAttribute('data-nx-carousel-ready') === 'true') return;
    root.setAttribute('data-nx-carousel-ready', 'true');
    updateCarousel(root, toInt(root.getAttribute('data-nx-carousel-index'), 0));
  }

  function setupRevealObserver() {
    if (revealObserver || !('IntersectionObserver' in window)) return;
    revealObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i];
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }
    }, { threshold: 0.18 });
  }

  function initScrollReveal(root) {
    setupRevealObserver();
    if (!root || root.getAttribute('data-nx-reveal-ready') === 'true') return;
    root.setAttribute('data-nx-reveal-ready', 'true');
    if (revealObserver) revealObserver.observe(root);
    else root.classList.add('is-visible');
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function renderCalendar(root) {
    if (!root) return;
    var month = toInt(root.getAttribute('data-nx-calendar-month'), new Date().getMonth());
    var year = toInt(root.getAttribute('data-nx-calendar-year'), new Date().getFullYear());
    var grid = root.querySelector('[data-nx-calendar-grid]');
    var monthLabel = root.querySelector('[data-nx-calendar-month-label]');
    var yearLabel = root.querySelector('[data-nx-calendar-year-label]');
    if (!(grid instanceof HTMLElement)) return;
    if (monthLabel) monthLabel.textContent = new Date(year, month, 1).toLocaleString('default', { month: 'short' });
    if (yearLabel) yearLabel.textContent = String(year);

    var firstDay = new Date(year, month, 1).getDay();
    var total = daysInMonth(year, month);
    var today = new Date();
    var cells = [];
    var dayNames = ['Su', 'Mo', 'Te', 'We', 'Th', 'Fr', 'Sa'];
    for (var d = 0; d < dayNames.length; d += 1) {
      cells.push('<div class="nx-calendar-day-name">' + dayNames[d] + '</div>');
    }
    for (var i = 0; i < 42; i += 1) {
      var dayNum = i - firstDay + 1;
      var classes = 'nx-calendar-cell';
      var text = '';
      if (dayNum < 1 || dayNum > total) {
        classes += ' is-muted';
      } else {
        text = String(dayNum);
        if (dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
          classes += ' is-today';
        }
      }
      cells.push('<div class="' + classes + '">' + text + '</div>');
    }
    grid.innerHTML = cells.join('');
  }

  function initCalendar(root) {
    if (!root) return;
    if (!root.getAttribute('data-nx-calendar-month')) root.setAttribute('data-nx-calendar-month', String(new Date().getMonth()));
    if (!root.getAttribute('data-nx-calendar-year')) root.setAttribute('data-nx-calendar-year', String(new Date().getFullYear()));
    renderCalendar(root);
  }

  function initAnim001(root) {
    if (!root || root.getAttribute('data-nx-anim-001-ready') === 'true') return;
    root.setAttribute('data-nx-anim-001-ready', 'pending');
    window.setTimeout(function () {
      root.setAttribute('data-nx-anim-001-ready', 'true');
    }, 500);
  }

  function initAnim002(root) {
    if (!root || root.getAttribute('data-nx-anim-002-ready') === 'true') return;
    root.setAttribute('data-nx-anim-002-ready', 'true');
    var fill = root.querySelector('[data-nx-anim-002-fill]');
    if (!fill) return;
    var mode = root.getAttribute('data-nx-anim-mode') || 'animated';
    if (mode === 'animated') {
      window.setTimeout(function () {
        fill.classList.add('load1');
      }, 120);
    } else fill.classList.add('load2');
  }

  function initAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var carousels = scope.querySelectorAll('[data-nx-carousel]');
    for (var i = 0; i < carousels.length; i += 1) initCarousel(carousels[i]);
    var reveals = scope.querySelectorAll('[data-nx-scroll-reveal]');
    for (var j = 0; j < reveals.length; j += 1) initScrollReveal(reveals[j]);
    var calendars = scope.querySelectorAll('[data-nx-calendar]');
    for (var k = 0; k < calendars.length; k += 1) initCalendar(calendars[k]);
    var anim001 = scope.querySelectorAll('[data-nx-anim-001]');
    for (var a = 0; a < anim001.length; a += 1) initAnim001(anim001[a]);
    var anim002 = scope.querySelectorAll('[data-nx-anim-002]');
    for (var b = 0; b < anim002.length; b += 1) initAnim002(anim002[b]);
  }

  function moveSortableItem(container, dragItem, pointerY) {
    var siblings = Array.prototype.slice.call(container.querySelectorAll('[data-nx-sortable-item]'));
    var beforeNode = null;
    for (var i = 0; i < siblings.length; i += 1) {
      var sibling = siblings[i];
      if (sibling === dragItem) continue;
      var rect = sibling.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) { beforeNode = sibling; break; }
    }
    if (beforeNode) container.insertBefore(dragItem, beforeNode);
    else container.appendChild(dragItem);
  }

  function onClick(event) {
    var prevBtn = closestBySelector(event.target, '[data-nx-carousel-prev]');
    if (prevBtn) {
      var prevRoot = closestBySelector(prevBtn, '[data-nx-carousel]');
      updateCarousel(prevRoot, toInt(prevRoot && prevRoot.getAttribute('data-nx-carousel-index'), 0) - 1);
      return;
    }
    var nextBtn = closestBySelector(event.target, '[data-nx-carousel-next]');
    if (nextBtn) {
      var nextRoot = closestBySelector(nextBtn, '[data-nx-carousel]');
      updateCarousel(nextRoot, toInt(nextRoot && nextRoot.getAttribute('data-nx-carousel-index'), 0) + 1);
      return;
    }
    var dot = closestBySelector(event.target, '[data-nx-carousel-dot]');
    if (dot) {
      var dotRoot = closestBySelector(dot, '[data-nx-carousel]');
      updateCarousel(dotRoot, toInt(dot.getAttribute('data-index'), 0));
      return;
    }
    var flipRoot = closestBySelector(event.target, '[data-nx-flip-card]');
    if (flipRoot) flipRoot.classList.toggle('is-flipped');

    var popupTrigger = closestBySelector(event.target, '[data-nx-popup-trigger]');
    if (popupTrigger) {
      var popupId = popupTrigger.getAttribute('data-nx-popup-trigger');
      var content = document.querySelector('[data-nx-popup-content="' + popupId + '"]');
      var backdrop = document.querySelector('[data-nx-popup-backdrop="' + popupId + '"]');
      if (content) content.classList.add('is-active');
      if (backdrop) backdrop.classList.add('is-active');
      return;
    }

    var popupClose = closestBySelector(event.target, '[data-nx-popup-close]');
    var popupBackdrop = closestBySelector(event.target, '[data-nx-popup-backdrop]');
    if (popupClose || popupBackdrop) {
      var closeId = (popupClose || popupBackdrop).getAttribute('data-nx-popup-close') || 
                    (popupClose || popupBackdrop).getAttribute('data-nx-popup-backdrop');
      var contentClose = document.querySelector('[data-nx-popup-content="' + closeId + '"]');
      var backdropClose = document.querySelector('[data-nx-popup-backdrop="' + closeId + '"]');
      if (contentClose) contentClose.classList.remove('is-active');
      if (backdropClose) backdropClose.classList.remove('is-active');
      return;
    }

    var calPrev = closestBySelector(event.target, '[data-nx-calendar-prev]');
    if (calPrev) {
      var calRootPrev = closestBySelector(calPrev, '[data-nx-calendar]');
      if (calRootPrev) {
        var pm = toInt(calRootPrev.getAttribute('data-nx-calendar-month'), new Date().getMonth()) - 1;
        var py = toInt(calRootPrev.getAttribute('data-nx-calendar-year'), new Date().getFullYear());
        if (pm < 0) { pm = 11; py -= 1; }
        calRootPrev.setAttribute('data-nx-calendar-month', String(pm));
        calRootPrev.setAttribute('data-nx-calendar-year', String(py));
        renderCalendar(calRootPrev);
      }
      return;
    }
    var calNext = closestBySelector(event.target, '[data-nx-calendar-next]');
    if (calNext) {
      var calRootNext = closestBySelector(calNext, '[data-nx-calendar]');
      if (calRootNext) {
        var nm = toInt(calRootNext.getAttribute('data-nx-calendar-month'), new Date().getMonth()) + 1;
        var ny = toInt(calRootNext.getAttribute('data-nx-calendar-year'), new Date().getFullYear());
        if (nm > 11) { nm = 0; ny += 1; }
        calRootNext.setAttribute('data-nx-calendar-month', String(nm));
        calRootNext.setAttribute('data-nx-calendar-year', String(ny));
        renderCalendar(calRootNext);
      }
      return;
    }
    var calReset = closestBySelector(event.target, '[data-nx-calendar-reset]');
    if (calReset) {
      var calRootReset = closestBySelector(calReset, '[data-nx-calendar]');
      if (calRootReset) {
        calRootReset.setAttribute('data-nx-calendar-month', String(new Date().getMonth()));
        calRootReset.setAttribute('data-nx-calendar-year', String(new Date().getFullYear()));
        renderCalendar(calRootReset);
      }
    }

    var formSubmit = closestBySelector(event.target, '[data-nx-form-submit]');
    if (formSubmit) {
      var formRoot = closestBySelector(formSubmit, '[data-nx-clickstream-form]');
      if (formRoot) {
        var status = formRoot.querySelector('[data-nx-form-status]');
        if (status) status.textContent = 'Form submitted (OnClickstreamDone)';
      }
    }
  }

  function onKeyDown(event) {
    var flipRoot = closestBySelector(event.target, '[data-nx-flip-card]');
    if (!flipRoot) return;
    var key = String(event.key || '').toLowerCase();
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      flipRoot.classList.toggle('is-flipped');
    }
  }

  function onDragStart(event) {
    var dragItem = closestBySelector(event.target, '[data-nx-drag-item], [data-nx-sortable-item]');
    if (!dragItem) return;
    var isSortable = dragItem.hasAttribute('data-nx-sortable-item');
    var itemId = dragItem.getAttribute('data-nx-drag-item') || dragItem.getAttribute('data-nx-sortable-item') || '';
    if (!itemId) return;
    if (isSortable) activeSortableId = itemId;
    else activeDragId = itemId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', itemId);
    }
    dragItem.classList.add('nx-dragging');
  }

  function onDragOver(event) {
    var dropZone = closestBySelector(event.target, '[data-nx-drop-zone], [data-nx-file-drop]');
    var sortableContainer = closestBySelector(event.target, '[data-nx-sortable]');
    if (dropZone || sortableContainer) event.preventDefault();
    if (dropZone) {
      dropZone.classList.add('nx-drop-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }
    if (sortableContainer && activeSortableId) {
      var dragItem = document.querySelector('[data-nx-sortable-item="' + activeSortableId + '"]');
      if (dragItem) moveSortableItem(sortableContainer, dragItem, event.clientY);
    }
  }

  function onDrop(event) {
    var dropZone = closestBySelector(event.target, '[data-nx-drop-zone]');
    var fileDrop = closestBySelector(event.target, '[data-nx-file-drop]');
    if (dropZone) {
      event.preventDefault();
      var dragItem = activeDragId ? document.querySelector('[data-nx-drag-item="' + activeDragId + '"]') : null;
      if (dragItem) dropZone.appendChild(dragItem);
      dropZone.classList.remove('nx-drop-over');
      return;
    }
    if (fileDrop) {
      event.preventDefault();
      fileDrop.classList.remove('nx-drop-over');
      var output = fileDrop.querySelector('.nx-file-drop-output');
      if (!(output instanceof HTMLElement)) return;
      var files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : null;
      if (!files || files.length === 0) {
        output.textContent = 'No files dropped.';
        return;
      }
      var names = [];
      for (var i = 0; i < files.length; i += 1) names.push(files[i].name);
      output.innerHTML = names.map(function (name) { return '<div>' + name + '</div>'; }).join('');
    }
  }

  function onDragLeave(event) {
    var dropZone = closestBySelector(event.target, '[data-nx-drop-zone], [data-nx-file-drop]');
    if (dropZone) dropZone.classList.remove('nx-drop-over');
  }

  function onDragEnd() {
    var active = document.querySelector('.nx-dragging');
    if (active) active.classList.remove('nx-dragging');
    var activeOver = document.querySelectorAll('.nx-drop-over');
    for (var i = 0; i < activeOver.length; i += 1) activeOver[i].classList.remove('nx-drop-over');
    activeDragId = '';
    activeSortableId = '';
  }

  function init() {
    initAll(document);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragleave', onDragLeave, true);
    document.addEventListener('dragend', onDragEnd, true);
    if ('MutationObserver' in window && document.body) {
      var mo = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i += 1) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j += 1) {
            var node = m.addedNodes[j];
            if (node && node.nodeType === 1) initAll(node);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  function registerDraggable(element, id) {
    if (!element) return;
    var nextId = id || element.getAttribute('data-nx-drag-item') || ('drag-' + Math.random().toString(36).slice(2, 9));
    element.setAttribute('draggable', 'true');
    element.setAttribute('data-nx-drag-item', nextId);
    element.classList.add('nx-draggable-card');
  }

  function registerDropZone(element, zoneId) {
    if (!element) return;
    var nextId = zoneId || element.getAttribute('data-nx-drop-zone') || ('zone-' + Math.random().toString(36).slice(2, 9));
    element.setAttribute('data-nx-drop-zone', nextId);
    element.classList.add('nx-drop-zone');
  }

  function makeSortable(container) {
    if (!container) return;
    container.setAttribute('data-nx-sortable', 'true');
    var items = container.querySelectorAll('[data-nx-sortable-item]');
    for (var i = 0; i < items.length; i += 1) items[i].setAttribute('draggable', 'true');
  }

  function enableFileDrop(element) {
    if (!element) return;
    element.setAttribute('data-nx-file-drop', 'true');
    element.classList.add('nx-file-drop');
  }

  init();
  window.NXAddToolComponents = {
    init: init,
    registerDraggable: registerDraggable,
    registerDropZone: registerDropZone,
    makeSortable: makeSortable,
    enableFileDrop: enableFileDrop
  };
})();`;
export const resolveConfigPathFromFiles = (
  files: FileMap,
  suffix: "config.json" | "portfolioconfig.json",
) => {
  const baseName =
    suffix === "portfolioconfig.json" ? "portfolioconfig" : "config";
  const normalizedPaths = Object.keys(files).map((path) => normalizePath(path));
  const candidates = [
    `shared/${baseName}.json`,
    `shared/${baseName}.js`,
    `shared/js/${baseName}.json`,
    `shared/js/${baseName}.js`,
  ];
  for (const candidate of candidates) {
    const matched = normalizedPaths.find(
      (path) => path.toLowerCase() === candidate.toLowerCase(),
    );
    if (matched) return matched;
  }
  const matcher = new RegExp(
    `(^|/)shared/(?:js/)?${baseName}\\.(?:json|js)$`,
    "i",
  );
  return normalizedPaths.find((path) => matcher.test(path)) || null;
};

export const getConfigPathCandidates = (
  files: FileMap,
  suffix: "config.json" | "portfolioconfig.json",
): string[] => {
  const baseName =
    suffix === "portfolioconfig.json" ? "portfolioconfig" : "config";
  const normalizedPaths = Object.keys(files).map((path) => normalizePath(path));
  const preferred = [
    `shared/${baseName}.json`,
    `shared/${baseName}.js`,
    `shared/js/${baseName}.json`,
    `shared/js/${baseName}.js`,
  ];
  const out: string[] = [];
  for (const candidate of preferred) {
    const matched = normalizedPaths.find(
      (path) => path.toLowerCase() === candidate.toLowerCase(),
    );
    if (matched && !out.includes(matched)) out.push(matched);
  }
  const matcher = new RegExp(
    `(^|/)shared/(?:js/)?${baseName}\\.(?:json|js)$`,
    "i",
  );
  for (const path of normalizedPaths) {
    if (matcher.test(path) && !out.includes(path)) out.push(path);
  }
  return out;
};

export const scoreConfigContent = (raw: string, kind: "config" | "portfolio"): number => {
  const content = String(raw || "");
  if (!content.trim()) return -1000;
  let score = 0;
  if (/com\.gsk\.mtconfig/i.test(content)) score += 60;
  if (/\"pagesAll\"|'pagesAll'|\bpagesAll\b/.test(content)) score += 40;
  if (/\"presentation\"|'presentation'|\bpresentation\b/.test(content)) score += 20;
  if (/^\s*\{[\s\S]*\}\s*$/.test(content)) score += 25;
  if (/\/\*+\s*GSK Veeva Master Template - Presentation CSS/i.test(content)) score -= 150;
  if (/\bfont-face\b|\.maincontainer|\.contentFrame|\.mainContent/i.test(content)) score -= 60;
  if (kind === "portfolio" && /\bportfolio\b/i.test(content)) score += 15;
  return score;
};
export const DEFAULT_EDITOR_FONTS = [
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
export const PREVIEW_DRAW_ALLOWED_TAGS = new Set([
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
export const normalizePreviewDrawTag = (raw: string): string => {
  const next = String(raw || "")
    .trim()
    .toLowerCase();
  if (PREVIEW_DRAW_ALLOWED_TAGS.has(next)) return next;
  return "div";
};

export type FontCachePayload = {
  version: number;
  source: "presentation.css";
  generatedAt: string;
  fonts: string[];
};

export type MaybeViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => {
    finished: Promise<void>;
  };
};

export const sanitizeFontFamilyName = (raw: string): string =>
  String(raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();

export const dedupeFontFamilies = (families: string[]): string[] => {
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

export const buildEditorFontOptions = (projectFamilies: string[]): string[] =>
  dedupeFontFamilies([...projectFamilies, ...DEFAULT_EDITOR_FONTS]);

export const parsePresentationCssFontFamilies = (cssContent: string): string[] => {
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

export const parseFontCacheFamilies = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw) as Partial<FontCachePayload> | null;
    if (!parsed || !Array.isArray(parsed.fonts)) return [];
    return dedupeFontFamilies(parsed.fonts.map((item) => String(item || "")));
  } catch {
    return [];
  }
};

export const deriveFontFamilyFromFontFileName = (fileName: string): string => {
  const base = String(fileName || "").replace(/\.[^.]+$/, "");
  const normalized = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || base || "Custom Font";
};

export const fontFormatFromFileName = (fileName: string): string => {
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

export const relativePathBetweenVirtualFiles = (
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

export const collectSharedFontFamiliesFromFileMap = (fileMap: FileMap): string[] =>
  dedupeFontFamilies(
    Object.values(fileMap)
      .filter((file) => {
        if (file.type !== "font") return false;
        const normalized = normalizeProjectRelative(file.path).toLowerCase();
        return normalized.startsWith(`${SHARED_FONT_VIRTUAL_DIR}/`);
      })
      .map((file) => deriveFontFamilyFromFontFileName(file.name)),
  );

export const inferFileType = (name: string): ProjectFile["type"] => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".js")) return "js";
  if (lower.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return "image";
  if (lower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return "font";
  return "unknown";
};

export const isTextFileType = (type: ProjectFile["type"]): boolean =>
  type !== "image" && type !== "font";

export const isSvgPath = (path: string): boolean =>
  normalizePath(path).toLowerCase().endsWith(".svg");

export const isCodeEditableFile = (path: string, type: ProjectFile["type"]): boolean =>
  isTextFileType(type) || isSvgPath(path);

export const toFileUrl = (absolutePath: string): string => {
  const normalized = normalizePath(absolutePath);
  return normalized.startsWith("/")
    ? `file://${normalized}`
    : `file:///${normalized}`;
};

export const mimeFromType = (type: ProjectFile["type"], fileName: string): string => {
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

export const toByteArray = (value: any): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value?.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer);
  return new Uint8Array();
};

export const isExternalUrl = (raw: string): boolean =>
  /^(https?:|data:|blob:|mailto:|tel:|#|javascript:)/i.test(raw);

export const normalizeProjectRelative = (rawPath: string): string => {
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

export const resolveProjectRelativePath = (
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

export const findFilePathCaseInsensitive = (
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

export const resolvePreviewNavigationPath = (
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

export const isPathWithinBase = (basePath: string, candidatePath: string): boolean => {
  const base = normalizePath(basePath)
    .replace(/[\\/]$/, "")
    .toLowerCase();
  const candidate = normalizePath(candidatePath).toLowerCase();
  return candidate === base || candidate.startsWith(`${base}/`);
};

export const toMountRelativePath = (
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

export const rewriteInlineAssetRefs = (
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

export const buildPreviewRuntimeScript = (
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
    var __NX_THEME_KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
    try {
      var __storageProto = window.Storage && window.Storage.prototype;
      if (__storageProto) {
        var __origGetItem = __storageProto.getItem;
        var __origSetItem = __storageProto.setItem;
        var __origRemoveItem = __storageProto.removeItem;
        __storageProto.getItem = function(key) {
          if (this === window.localStorage && key === __NX_THEME_KEY) return 'light';
          return __origGetItem.call(this, key);
        };
        __storageProto.setItem = function(key, value) {
          if (this === window.localStorage && key === __NX_THEME_KEY) return;
          return __origSetItem.call(this, key, value);
        };
        __storageProto.removeItem = function(key) {
          if (this === window.localStorage && key === __NX_THEME_KEY) return;
          return __origRemoveItem.call(this, key);
        };
      }
    } catch (e) {}

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
      if (!resolved || !resolved.rec) {
         // Prevent Missing JS from crashing Veeva and bouncing to _000
         var lower = String(rawValue).toLowerCase();
         if (lower.endsWith('.js')) {
             return 'data:text/javascript;charset=utf-8,' + encodeURIComponent('console.warn("[NoCodeX] JS file stubbed: ' + rawValue + '");');
         }
         return null;
      }
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

    function isPreviewRuntimeHelperElement(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.getAttribute && (
        el.getAttribute('data-preview-hover-badge') === 'true' ||
        el.getAttribute('data-preview-hover-outline') === 'true' ||
        el.getAttribute('data-preview-draw-draft') === 'true' ||
        el.getAttribute('data-nx-inline-editing') === 'true'
      )) {
        return true;
      }
      var className = typeof el.className === 'string' ? el.className : '';
      return className.indexOf('__nx-preview-runtime-helper') >= 0;
    }

    function getPreviewPathChildren(parent) {
      var children = parent && parent.children ? parent.children : [];
      var filtered = [];
      for (var i = 0; i < children.length; i++) {
        if (!isPreviewRuntimeHelperElement(children[i])) {
          filtered.push(children[i]);
        }
      }
      return filtered;
    }

    function isPreviewBaseSelectable(el) {
      if (!el) return false;
      if (isPreviewRuntimeHelperElement(el)) return false;
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
        var children = getPreviewPathChildren(parent);
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
        var children = getPreviewPathChildren(cursor);
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

    function getStyleSheetSourceLabel(sheet) {
      if (!sheet) return 'stylesheet';
      try {
        if (sheet.href) {
          var href = String(sheet.href);
          var cleanHref = href.split('?')[0].split('#')[0];
          var parts = cleanHref.split('/');
          return parts[parts.length - 1] || cleanHref || 'stylesheet';
        }
        var ownerNode = sheet.ownerNode;
        if (ownerNode && ownerNode.getAttribute) {
          var dataSource = ownerNode.getAttribute('data-source') || ownerNode.getAttribute('data-href');
          if (dataSource) return dataSource;
        }
      } catch (e) {}
      return 'inline stylesheet';
    }

    function collectMatchedCssRulesForElement(el) {
      var matches = [];
      if (!el || !el.matches || !document.styleSheets) return matches;

      function visitRules(ruleList, sourceLabel) {
        if (!ruleList) return;
        for (var i = 0; i < ruleList.length; i++) {
          var rule = ruleList[i];
          if (!rule) continue;
          try {
            if (rule.type === 1 && rule.selectorText) {
              var selectorText = String(rule.selectorText || '').trim();
              if (!selectorText) continue;
              try {
                if (!el.matches(selectorText)) continue;
              } catch (selectorError) {
                continue;
              }
              var declarations = [];
              var style = rule.style;
              if (style) {
                for (var j = 0; j < style.length; j++) {
                  var prop = style[j];
                  var val = style.getPropertyValue(prop);
                  if (!prop || !val) continue;
                  declarations.push({
                    property: prop,
                    value: val,
                    important: style.getPropertyPriority(prop) === 'important'
                  });
                }
              }
              if (declarations.length) {
                matches.push({
                  selector: selectorText,
                  source: sourceLabel,
                  declarations: declarations
                });
              }
              continue;
            }
            if (rule.cssRules && rule.cssRules.length) {
              visitRules(rule.cssRules, sourceLabel);
            }
          } catch (ruleError) {}
        }
      }

      for (var sheetIndex = 0; sheetIndex < document.styleSheets.length; sheetIndex++) {
        var sheet = document.styleSheets[sheetIndex];
        if (!sheet) continue;
        try {
          visitRules(sheet.cssRules, getStyleSheetSourceLabel(sheet));
        } catch (sheetError) {}
      }

      return matches;
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
      if (!__previewEditableTags[tag] && !(tag === 'div' && hasOwnTextNode(el))) return false;
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
      var draftRaf = 0;
      var scheduleDraftSync = function() {
        if (draftRaf) return;
        draftRaf = requestAnimationFrame(function() {
          draftRaf = 0;
          postPreviewMessage('PREVIEW_INLINE_EDIT_DRAFT', {
            path: path,
            html: normalizeEditableHtml(el.innerHTML)
          });
        });
      };
      var finish = function(commit) {
        if (done) return;
        done = true;
        if (draftRaf) {
          cancelAnimationFrame(draftRaf);
          draftRaf = 0;
        }
        el.removeEventListener('blur', onBlur, true);
        el.removeEventListener('keydown', onKeyDown, true);
        el.removeEventListener('input', onInput, true);
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
          scheduleDraftSync();
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      };
      var onInput = function() {
        scheduleDraftSync();
      };

      el.addEventListener('blur', onBlur, true);
      el.addEventListener('keydown', onKeyDown, true);
      el.addEventListener('input', onInput, true);
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
      console.log("DEBUG: Iframe Received PREVIEW_APPLY_STYLE", payload);
        var target = null;
        if (payload.path && payload.path.length) {
          target = readElementByPath(payload.path);
        }
        console.log("DEBUG: Found target element in Iframe:", target);
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
          html: __previewSelectedEl.innerHTML || '',
          src: (__previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('src') || '') : ''),
          href: (__previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('href') || '') : ''),
          inlineStyle: __previewSelectedEl.getAttribute ? (__previewSelectedEl.getAttribute('style') || '') : '',
          computedStyles: getElementComputedStyles(__previewSelectedEl),
          matchedCssRules: collectMatchedCssRulesForElement(__previewSelectedEl)
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
      var target = event && event.target;
      if (__previewEditingEl) {
        if (
          target &&
          (__previewEditingEl === target ||
            (__previewEditingEl.contains &&
              __previewEditingEl.contains(target)))
        ) {
          return;
        }
        try { __previewEditingEl.blur(); } catch (e) {}
      }
      var selected = getPreviewSelectableTarget(target, event);
      if (!selected || !canInlineEdit(selected)) return;
      event.preventDefault();
      event.stopPropagation();
      beginInlineEdit(selected);
    }, true);

    document.addEventListener('keydown', function(event) {
      if (!event) return;
      var key = String(event.key || '').toLowerCase();
      var code = String(event.code || '');
      if (!key) return;
      var hasModifier = !!(event.ctrlKey || event.metaKey);
      var target = event.target;
      var targetTag =
        target && target.tagName ? String(target.tagName).toLowerCase() : '';
      var isInlineEditing =
        !!(
          __previewEditingEl &&
          target &&
          (target === __previewEditingEl ||
            (__previewEditingEl.contains && __previewEditingEl.contains(target)))
        );
      var isTargetEditable =
        isInlineEditing ||
        !!(target && target.isContentEditable) ||
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        targetTag === 'select';

      var shouldForward = false;
      if (isTargetEditable) {
        shouldForward =
          hasModifier &&
          (key === 's' ||
            key === 'p' ||
            key === 't' ||
            key === 'f' ||
            key === 'e' ||
            key === 'k' ||
            code === 'Backquote');
      } else if (key === 'escape') {
        shouldForward = true;
      } else if (!hasModifier && !event.altKey && (key === 'w' || key === 'e')) {
        shouldForward = true;
      } else if (
        hasModifier &&
        (key === 'k' ||
          key === 'f' ||
          key === 'p' ||
          key === 'e' ||
          code === 'Backquote' ||
          key === 'j' ||
          key === 's' ||
          key === 't' ||
          key === 'z' ||
          key === 'u' ||
          key === 'y')
      ) {
        shouldForward = true;
      }
      if (!shouldForward) return;

      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      postPreviewMessage('PREVIEW_HOTKEY', {
        key: key,
        code: code,
        ctrlKey: !!event.ctrlKey,
        metaKey: !!event.metaKey,
        shiftKey: !!event.shiftKey,
        altKey: !!event.altKey,
        editable: isTargetEditable
      });
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

export const createPreviewDocument = (
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

export const pickDefaultHtmlFile = (fileMap: FileMap): string | null => {
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

export const MOUNTED_PREVIEW_BRIDGE_SCRIPT = `
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
  var __previewResizeDrag = null;
  var __previewDrawDraft = null;
  var __previewDrawState = null;
  var __previewSuppressClicksUntil = 0;
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
      html: el.innerHTML || '',
      src: extractImageSource(el),
      href: el.getAttribute ? (el.getAttribute('href') || '') : '',
      inlineStyle: el.getAttribute ? (el.getAttribute('style') || '') : '',
      computedStyles: getElementComputedStyles(el),
      matchedCssRules: collectMatchedCssRulesForElement(el)
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

  function getResizeCursorForDirection(dir) {
    if (dir === 'n' || dir === 's') return 'ns-resize';
    if (dir === 'e' || dir === 'w') return 'ew-resize';
    if (dir === 'ne' || dir === 'sw') return 'nesw-resize';
    if (dir === 'nw' || dir === 'se') return 'nwse-resize';
    return 'grab';
  }

  function getPreviewResizeDirection(el, event) {
    if (!el || !event || !el.getBoundingClientRect) return '';
    var rect = el.getBoundingClientRect();
    var threshold = 10;
    var nearLeft = Math.abs(event.clientX - rect.left) <= threshold;
    var nearRight = Math.abs(event.clientX - rect.right) <= threshold;
    var nearTop = Math.abs(event.clientY - rect.top) <= threshold;
    var nearBottom = Math.abs(event.clientY - rect.bottom) <= threshold;
    if (nearTop && nearLeft) return 'nw';
    if (nearTop && nearRight) return 'ne';
    if (nearBottom && nearLeft) return 'sw';
    if (nearBottom && nearRight) return 'se';
    if (nearTop) return 'n';
    if (nearBottom) return 's';
    if (nearLeft) return 'w';
    if (nearRight) return 'e';
    return '';
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

  function isPreviewRuntimeHelperElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.getAttribute && (
      el.getAttribute('data-preview-hover-badge') === 'true' ||
      el.getAttribute('data-preview-hover-outline') === 'true' ||
      el.getAttribute('data-preview-draw-draft') === 'true' ||
      el.getAttribute('data-nx-inline-editing') === 'true'
    )) {
      return true;
    }
    var className = typeof el.className === 'string' ? el.className : '';
    return className.indexOf('__nx-preview-runtime-helper') >= 0;
  }

  function getPreviewPathChildren(parent) {
    var children = parent && parent.children ? parent.children : [];
    var filtered = [];
    for (var i = 0; i < children.length; i++) {
      if (!isPreviewRuntimeHelperElement(children[i])) {
        filtered.push(children[i]);
      }
    }
    return filtered;
  }

  function isPreviewBaseSelectable(el) {
    if (!el) return false;
    if (isPreviewRuntimeHelperElement(el)) return false;
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
      var children = getPreviewPathChildren(parent);
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
      var children = getPreviewPathChildren(cursor);
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

  function getStyleSheetSourceLabel(sheet) {
    if (!sheet) return 'stylesheet';
    try {
      if (sheet.href) {
        var href = String(sheet.href);
        var cleanHref = href.split('?')[0].split('#')[0];
        var parts = cleanHref.split('/');
        return parts[parts.length - 1] || cleanHref || 'stylesheet';
      }
      var ownerNode = sheet.ownerNode;
      if (ownerNode && ownerNode.getAttribute) {
        var dataSource = ownerNode.getAttribute('data-source') || ownerNode.getAttribute('data-href');
        if (dataSource) return dataSource;
      }
    } catch (e) {}
    return 'inline stylesheet';
  }

  function collectMatchedCssRulesForElement(el) {
    var matches = [];
    if (!el || !el.matches || !document.styleSheets) return matches;

    function visitRules(ruleList, sourceLabel) {
      if (!ruleList) return;
      for (var i = 0; i < ruleList.length; i++) {
        var rule = ruleList[i];
        if (!rule) continue;
        try {
          if (rule.type === 1 && rule.selectorText) {
            var selectorText = String(rule.selectorText || '').trim();
            if (!selectorText) continue;
            try {
              if (!el.matches(selectorText)) continue;
            } catch (selectorError) {
              continue;
            }
            var declarations = [];
            var style = rule.style;
            if (style) {
              for (var j = 0; j < style.length; j++) {
                var prop = style[j];
                var val = style.getPropertyValue(prop);
                if (!prop || !val) continue;
                declarations.push({
                  property: prop,
                  value: val,
                  important: style.getPropertyPriority(prop) === 'important'
                });
              }
            }
            if (declarations.length) {
              matches.push({
                selector: selectorText,
                source: sourceLabel,
                declarations: declarations
              });
            }
            continue;
          }
          if (rule.cssRules && rule.cssRules.length) {
            visitRules(rule.cssRules, sourceLabel);
          }
        } catch (ruleError) {}
      }
    }

    for (var sheetIndex = 0; sheetIndex < document.styleSheets.length; sheetIndex++) {
      var sheet = document.styleSheets[sheetIndex];
      if (!sheet) continue;
      try {
        visitRules(sheet.cssRules, getStyleSheetSourceLabel(sheet));
      } catch (sheetError) {}
    }

    return matches;
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
    if (!__previewEditableTags[tag] && !(tag === 'div' && hasOwnTextNode(el))) return false;
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
    var draftRaf = 0;
    var scheduleDraftSync = function() {
      if (draftRaf) return;
      draftRaf = requestAnimationFrame(function() {
        draftRaf = 0;
        postPreviewMessage('PREVIEW_INLINE_EDIT_DRAFT', {
          path: path,
          html: normalizeEditableHtml(el.innerHTML)
        });
      });
    };
    var finish = function(commit) {
      if (done) return;
      done = true;
      if (draftRaf) {
        cancelAnimationFrame(draftRaf);
        draftRaf = 0;
      }
      el.removeEventListener('blur', onBlur, true);
      el.removeEventListener('keydown', onKeyDown, true);
      el.removeEventListener('input', onInput, true);
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
        scheduleDraftSync();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };
    var onInput = function() {
      scheduleDraftSync();
    };

    el.addEventListener('blur', onBlur, true);
    el.addEventListener('keydown', onKeyDown, true);
    el.addEventListener('input', onInput, true);
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
    console.log("DEBUG: Iframe Received PREVIEW_APPLY_STYLE", payload);
      var target = null;
      if (payload.path && payload.path.length) {
        target = readElementByPath(payload.path);
      }
      console.log("DEBUG: Found target element in Iframe:", target);
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
      var isVoidTag = function(node) {
        if (!node || !node.tagName) return false;
        var tag = String(node.tagName).toLowerCase();
        return tag === 'area' || tag === 'base' || tag === 'br' || tag === 'col' ||
          tag === 'embed' || tag === 'hr' || tag === 'img' || tag === 'input' ||
          tag === 'link' || tag === 'meta' || tag === 'param' || tag === 'source' ||
          tag === 'track' || tag === 'wbr';
      };
      var injectParent = null;
      if (Array.isArray(injectParentPath) && injectParentPath.length > 0) {
        injectParent = readElementByPath(injectParentPath);
      }
      if (!injectParent) injectParent = document.body;
      while (injectParent && injectParent !== document.body && isVoidTag(injectParent)) {
        injectParent = injectParent.parentElement || document.body;
      }
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
        html: newEl.innerHTML || '',
        inlineStyle: newEl.getAttribute('style') || '',
        computedStyles: computedStyles,
        matchedCssRules: collectMatchedCssRulesForElement(newEl)
      }), '*');
    }
    if (payload.type === 'PREVIEW_APPLY_HTML' && payload.html) {
      if (document.body) document.body.innerHTML = payload.html;
      return;
    }
    if (payload.type === 'PREVIEW_GLOBAL_REPLACE' && payload.search) {
      if (!document.body) return;
      // Do a simple html replacement, same as the server
      const htmlTokens = document.body.innerHTML.split(payload.search);
      if (htmlTokens.length > 1) {
        document.body.innerHTML = htmlTokens.join(payload.replace || '');
      } else {
        // Fallback: full reload if we couldn't easily patch it
        location.reload();
      }
      return;
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
    if (!event) return;
    var target = event.target;
    if (isInsideInlineEditor(target)) return;
    // In draw/move mode, block slide interactions (swipe/click/hotspots)
    // but keep our own preview handlers alive.
    if (__previewToolMode === 'move' || __previewToolMode === 'draw') {
      var et = String(event.type || '').toLowerCase();
      // Let dedicated draw/move mouse handlers run unchanged.
      if (et === 'mousedown' || et === 'mousemove' || et === 'mouseup') return;
      event.stopPropagation();
      // Preventing default on pointerdown can suppress downstream mouse events.
      if (event.cancelable && et !== 'pointerdown' && et !== 'pointermove' && et !== 'pointerup') {
        event.preventDefault();
      }
      return;
    }
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

  document.addEventListener('keydown', function(event) {
    if (!event) return;
    var key = String(event.key || '').toLowerCase();
    var code = String(event.code || '');
    if (!key) return;
    var hasModifier = !!(event.ctrlKey || event.metaKey);
    var editableTarget = isInsideInlineEditor(event.target);
    var target = event.target;
    var targetTag =
      target && target.tagName ? String(target.tagName).toLowerCase() : '';
    if (!editableTarget) {
      editableTarget =
        !!(target && target.isContentEditable) ||
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        targetTag === 'select';
    }

    var shouldForward = false;
    if (editableTarget) {
      shouldForward =
        hasModifier &&
        (key === 's' ||
          key === 'p' ||
          key === 't' ||
          key === 'f' ||
          key === 'e' ||
          key === 'k' ||
          code === 'Backquote');
    } else if (key === 'escape') {
      shouldForward = true;
    } else if (!hasModifier && !event.altKey && (key === 'w' || key === 'e')) {
      shouldForward = true;
    } else if (
      hasModifier &&
      (key === 'k' ||
        key === 'f' ||
        key === 'p' ||
        key === 'e' ||
        code === 'Backquote' ||
        key === 'j' ||
        key === 's' ||
        key === 't' ||
        key === 'z' ||
        key === 'u' ||
        key === 'y')
    ) {
      shouldForward = true;
    }
    if (!shouldForward) return;

    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
    postPreviewMessage('PREVIEW_HOTKEY', {
      key: key,
      code: code,
      ctrlKey: !!event.ctrlKey,
      metaKey: !!event.metaKey,
      shiftKey: !!event.shiftKey,
      altKey: !!event.altKey,
      editable: editableTarget
    });
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
      var resizeDir = getPreviewResizeDirection(selected, event);
      if (resizeDir) {
        __previewResizeDrag = {
          element: selected,
          path: path,
          parent: parent,
          parentRect: parentRect,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startLeft: startLeft,
          startTop: startTop,
          latestLeft: startLeft,
          latestTop: startTop,
          startWidth: selectedRect.width || selected.offsetWidth || 0,
          startHeight: selectedRect.height || selected.offsetHeight || 0,
          latestWidth: selectedRect.width || selected.offsetWidth || 0,
          latestHeight: selectedRect.height || selected.offsetHeight || 0,
          direction: resizeDir,
          lockSize: lockSize,
          hasDragged: false
        };
        selectPreviewElement(selected);
        if (document.body) {
          document.body.style.userSelect = 'none';
          document.body.style.cursor = getResizeCursorForDirection(resizeDir);
        }
        selected.style.cursor = getResizeCursorForDirection(resizeDir);
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
        return;
      }
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
    if (__previewResizeDrag) {
      var resizeDrag = __previewResizeDrag;
      var dx = event.clientX - resizeDrag.startClientX;
      var dy = event.clientY - resizeDrag.startClientY;
      if (!resizeDrag.hasDragged && Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return;
      }
      if (!resizeDrag.hasDragged) {
        resizeDrag.hasDragged = true;
        resizeDrag.element.style.position = 'absolute';
        resizeDrag.element.style.left = Math.round(resizeDrag.startLeft) + 'px';
        resizeDrag.element.style.top = Math.round(resizeDrag.startTop) + 'px';
        resizeDrag.element.style.width = Math.round(resizeDrag.startWidth) + 'px';
        resizeDrag.element.style.height = Math.round(resizeDrag.startHeight) + 'px';
      }
      var direction = String(resizeDrag.direction || '');
      var nextWidth = resizeDrag.startWidth;
      var nextHeight = resizeDrag.startHeight;
      var nextLeft = resizeDrag.startLeft;
      var nextTop = resizeDrag.startTop;
      if (direction.indexOf('e') >= 0) {
        nextWidth = Math.max(10, resizeDrag.startWidth + dx);
      }
      if (direction.indexOf('s') >= 0) {
        nextHeight = Math.max(10, resizeDrag.startHeight + dy);
      }
      if (direction.indexOf('w') >= 0) {
        nextWidth = Math.max(10, resizeDrag.startWidth - dx);
        nextLeft = resizeDrag.startLeft + (resizeDrag.startWidth - nextWidth);
      }
      if (direction.indexOf('n') >= 0) {
        nextHeight = Math.max(10, resizeDrag.startHeight - dy);
        nextTop = resizeDrag.startTop + (resizeDrag.startHeight - nextHeight);
      }
      resizeDrag.latestWidth = nextWidth;
      resizeDrag.latestHeight = nextHeight;
      resizeDrag.latestLeft = nextLeft;
      resizeDrag.latestTop = nextTop;
      resizeDrag.element.style.width = Math.round(nextWidth) + 'px';
      resizeDrag.element.style.height = Math.round(nextHeight) + 'px';
      resizeDrag.element.style.left = Math.round(nextLeft) + 'px';
      resizeDrag.element.style.top = Math.round(nextTop) + 'px';
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      return;
    }
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
    if (__previewToolMode === 'move' && __previewSelectedEl) {
      var resizeDirHover = getPreviewResizeDirection(__previewSelectedEl, event);
      var hoverTarget = event && event.target;
      var insideSelected = !!(
        hoverTarget &&
        (hoverTarget === __previewSelectedEl ||
          (__previewSelectedEl.contains && __previewSelectedEl.contains(hoverTarget)))
      );
      var nextCursor = 'grab';
      if (insideSelected && resizeDirHover) {
        nextCursor = getResizeCursorForDirection(resizeDirHover);
      } else if (insideSelected) {
        nextCursor = 'grab';
      } else {
        nextCursor = '';
      }
      if (document.body) {
        document.body.style.cursor = nextCursor;
      }
      __previewSelectedEl.style.cursor = nextCursor || 'grab';
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
    if (__previewResizeDrag) {
      var resizeDrag = __previewResizeDrag;
      __previewResizeDrag = null;
      if (document.body) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
      resizeDrag.element.style.cursor = 'grab';
      if (resizeDrag.hasDragged && resizeDrag.path && resizeDrag.path.length) {
        postPreviewMessage('PREVIEW_MOVE_COMMIT', {
          path: resizeDrag.path,
          styles: {
            position: 'absolute',
            left: Math.round(resizeDrag.latestLeft) + 'px',
            top: Math.round(resizeDrag.latestTop) + 'px',
            width: Math.round(resizeDrag.latestWidth) + 'px',
            height: Math.round(resizeDrag.latestHeight) + 'px'
          }
        });
      }
      if (event) {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        event.stopPropagation();
        if (event.cancelable) event.preventDefault();
      }
      return;
    }
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
        __previewSuppressClicksUntil = Date.now() + 350;
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
    if (
      __previewToolMode === 'move' ||
      __previewToolMode === 'draw' ||
      Date.now() < (__previewSuppressClicksUntil || 0)
    ) {
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      return;
    }
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
    var target = event && event.target;
    if (__previewEditingEl) {
      if (
        target &&
        (__previewEditingEl === target ||
          (__previewEditingEl.contains && __previewEditingEl.contains(target)))
      ) {
        return;
      }
      try { __previewEditingEl.blur(); } catch (e) {}
    }
    var selected = getPreviewSelectableTarget(target, event);
    if (!selected || !canInlineEdit(selected)) return;
    event.preventDefault();
    event.stopPropagation();
    clearPreviewHover();
    beginInlineEdit(selected);
  }, true);
})();
`;

export const toCssPropertyName = (key: string): string =>
  key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export const parseNumericCssValue = (value: unknown): number | null => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const CSS_GENERIC_FONT_FAMILIES = new Set([
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

export const normalizeFontFamilyCssValue = (raw: string): string => {
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

export const readElementByPath = (root: Element, path: number[]): Element | null => {
  const isPreviewRuntimeHelperElement = (element: Element | null): boolean => {
    if (!element || !(element instanceof HTMLElement)) return false;
    if (
      element.getAttribute("data-preview-hover-badge") === "true" ||
      element.getAttribute("data-preview-hover-outline") === "true" ||
      element.getAttribute("data-preview-draw-draft") === "true" ||
      element.getAttribute("data-nx-inline-editing") === "true"
    ) {
      return true;
    }
    return element.classList.contains("__nx-preview-runtime-helper");
  };
  let cursor: Element | null = root;
  for (const step of path) {
    if (!cursor) return null;
    const childElements: Element[] = Array.from(cursor.children).filter(
      (child) => !isPreviewRuntimeHelperElement(child),
    );
    cursor = childElements[step] ?? null;
  }
  return cursor;
};

export const normalizePreviewPath = (rawPath: unknown): number[] | null => {
  if (!Array.isArray(rawPath)) return null;
  const normalized = rawPath
    .map((segment) => Number(segment))
    .filter((segment) => Number.isFinite(segment))
    .map((segment) => Math.max(0, Math.trunc(segment)));
  if (normalized.length !== rawPath.length) return null;
  return normalized;
};

export const toPreviewLayerId = (path: number[]): string =>
  `${PREVIEW_LAYER_ID_PREFIX}${path.join(".")}`;

export const fromPreviewLayerId = (id: string): number[] | null => {
  if (!id.startsWith(PREVIEW_LAYER_ID_PREFIX)) return null;
  const raw = id.slice(PREVIEW_LAYER_ID_PREFIX.length).trim();
  if (!raw) return null;
  const parts = raw.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) return null;
  return parts;
};

export const parseInlineStyleText = (styleText: string): React.CSSProperties => {
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

export const extractComputedStylesFromElement = (
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

export const RESERVED_ATTRIBUTE_NAMES = new Set([
  "id",
  "class",
  "style",
  "src",
  "href",
]);

export const extractCustomAttributesFromElement = (
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

export const normalizeEditorMultilineText = (raw: string): string => {
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

export const extractTextWithBreaks = (element: Element | null): string => {
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

export const extractTextFromHtmlFragment = (html: string): string => {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(
    `<div>${html || ""}</div>`,
    "text/html",
  );
  const root = parsed.body.firstElementChild;
  if (!root) return "";
  return extractTextWithBreaks(root);
};

export const hasRichInlineTextStructure = (element: Element): boolean => {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT,
  );
  let current = walker.currentNode as Element | null;
  while (current) {
    if (current !== element && current.tagName.toLowerCase() !== "br") {
      return true;
    }
    current = walker.nextNode() as Element | null;
  }
  return false;
};

export const collectTextNodeGroupsByBreak = (element: Element): Text[][] => {
  const groups: Text[][] = [[]];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      groups[groups.length - 1].push(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName.toLowerCase() === "br") {
      groups.push([]);
      return;
    }
    Array.from(el.childNodes).forEach(walk);
  };
  Array.from(element.childNodes).forEach(walk);
  return groups;
};

export const chooseTextSplitPoint = (
  value: string,
  start: number,
  ideal: number,
  maxEnd: number,
): number => {
  let end = Math.max(start, Math.min(ideal, maxEnd));
  if (end <= start || end >= value.length) return end;
  const window = 24;
  const lower = Math.max(start + 1, end - window);
  const upper = Math.min(maxEnd, end + window);
  for (let offset = 0; offset <= window; offset += 1) {
    const right = end + offset;
    if (
      right <= upper &&
      right > start &&
      /\s/.test(value.charAt(right - 1) || "")
    ) {
      return right;
    }
    const left = end - offset;
    if (
      left >= lower &&
      left > start &&
      /\s/.test(value.charAt(left - 1) || "")
    ) {
      return left;
    }
  }
  return end;
};

export const distributeTextAcrossNodes = (nodes: Text[], value: string): void => {
  if (!nodes.length) return;
  if (nodes.length === 1) {
    nodes[0].textContent = value;
    return;
  }
  const oldLengths = nodes.map((node) => (node.textContent || "").length);
  const totalOldLength = oldLengths.reduce((sum, len) => sum + len, 0) || 1;
  let cursor = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (index === nodes.length - 1) {
      node.textContent = value.slice(cursor);
      break;
    }
    const remainingNodes = nodes.length - index - 1;
    const maxEnd = Math.max(cursor, value.length - remainingNodes);
    const proportional = Math.round(
      (oldLengths[index] / totalOldLength) * value.length,
    );
    const ideal = cursor + proportional;
    const split = chooseTextSplitPoint(value, cursor, ideal, maxEnd);
    node.textContent = value.slice(cursor, split);
    cursor = split;
  }
};

export const applyMultilineTextToElement = (element: Element, text: string): void => {
  const normalizedInput = text.replace(/\r\n?/g, "\n");
  if (hasRichInlineTextStructure(element)) {
    const groups = collectTextNodeGroupsByBreak(element);
    const allNodes = groups.flat();
    if (allNodes.length > 0) {
      const rawLines = normalizedInput.split("\n");
      const normalizedLines =
        groups.length > 0 && rawLines.length > groups.length
          ? [
            ...rawLines.slice(0, groups.length - 1),
            rawLines.slice(groups.length - 1).join(" "),
          ]
          : rawLines;
      for (let index = 0; index < groups.length; index += 1) {
        const line = normalizedLines[index] ?? "";
        distributeTextAcrossNodes(groups[index], line);
      }
      return;
    }
  }

  const normalized = normalizeEditorMultilineText(normalizedInput);
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

export type PreviewHistoryEntry = {
  past: string[];
  present: string;
  future: string[];
};

export const addElementToTree = (
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
    const updatedChild = addElementToTree(
      child,
      parentId,
      newElement,
      position,
    );
    if (updatedChild !== child) {
      didChange = true;
    }
    return updatedChild;
  });
  if (!didChange) return root;
  return { ...root, children: nextChildren };
};

export const TOOLBOX_DRAG_MIME = "application/x-nocodex-element";
export const hasToolboxDragType = (dataTransfer: DataTransfer | null): boolean => {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []);
  return (
    types.includes(TOOLBOX_DRAG_MIME) ||
    types.includes("text/plain") ||
    types.includes("Text")
  );
};

export const getToolboxDragPayload = (dataTransfer: DataTransfer | null): string => {
  if (!dataTransfer) return "";
  return (
    dataTransfer.getData(TOOLBOX_DRAG_MIME) ||
    dataTransfer.getData("text/plain") ||
    dataTransfer.getData("Text") ||
    ""
  );
};

export const createPresetIdFactory = (
  prefix: string,
): ((segment: string) => string) => {
  const base = `${prefix.replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}`;
  let counter = 0;
  return (segment: string) => {
    counter += 1;
    return `${base}-${segment}-${counter}`;
  };
};

export const createVirtualNode = (
  id: string,
  type: string,
  name: string,
  styles: React.CSSProperties,
  options?: {
    content?: string;
    className?: string;
    attributes?: Record<string, string>;
    children?: VirtualElement[];
    styles?: React.CSSProperties;
    src?: string;
  },
): VirtualElement => ({
  id,
  type,
  name,
  styles,
  children: options?.children || [],
  ...(options?.content !== undefined ? { content: options.content } : {}),
  ...(options?.className ? { className: options.className } : {}),
  ...(options?.attributes ? { attributes: options.attributes } : {}),
  ...(options?.styles ? { styles: { ...styles, ...options.styles } } : {}),
  ...(options?.src ? { src: options.src } : {}),
});

export const buildPresetElement = (
  presetType: string,
  idFor: (segment: string) => string,
): VirtualElement | null => {
  if (presetType === "preset:carousel") {
    return createVirtualNode(
      idFor("carousel"),
      "section",
      "Carousel",
      {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "min(860px, 100%)",
        minHeight: "260px",
        padding: "14px",
        borderRadius: "14px",
        border: "1px solid rgba(14,165,233,0.35)",
        background:
          "linear-gradient(180deg, rgba(2,6,23,0.9), rgba(15,23,42,0.86))",
        boxShadow: "0 18px 40px rgba(2,6,23,0.45)",
        overflow: "hidden",
      },
      {
        children: [
          createVirtualNode(
            idFor("header"),
            "div",
            "Carousel Header",
            {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#e2e8f0",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            },
            { content: "Featured Carousel  •  3 Slides" },
          ),
          createVirtualNode(
            idFor("track"),
            "div",
            "Carousel Track",
            {
              display: "flex",
              gap: "12px",
              overflowX: "auto",
              padding: "4px 2px 8px",
              scrollSnapType: "x mandatory",
            },
            {
              children: [
                createVirtualNode(
                  idFor("card-a"),
                  "div",
                  "Slide Card",
                  {
                    minWidth: "280px",
                    height: "170px",
                    borderRadius: "12px",
                    background:
                      "linear-gradient(135deg, rgba(34,211,238,0.55), rgba(59,130,246,0.55))",
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "flex-start",
                    padding: "16px",
                    scrollSnapAlign: "start",
                    fontWeight: 800,
                    fontSize: "20px",
                    boxShadow: "0 12px 24px rgba(14,116,144,0.35)",
                  },
                  { content: "Slide 1" },
                ),
                createVirtualNode(
                  idFor("card-b"),
                  "div",
                  "Slide Card",
                  {
                    minWidth: "280px",
                    height: "170px",
                    borderRadius: "12px",
                    background:
                      "linear-gradient(135deg, rgba(167,139,250,0.62), rgba(99,102,241,0.6))",
                    color: "#fff",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "flex-start",
                    padding: "16px",
                    scrollSnapAlign: "start",
                    fontWeight: 800,
                    fontSize: "20px",
                    boxShadow: "0 12px 24px rgba(91,33,182,0.35)",
                  },
                  { content: "Slide 2" },
                ),
                createVirtualNode(
                  idFor("card-c"),
                  "div",
                  "Slide Card",
                  {
                    minWidth: "280px",
                    height: "170px",
                    borderRadius: "12px",
                    background:
                      "linear-gradient(135deg, rgba(16,185,129,0.58), rgba(20,184,166,0.56))",
                    color: "#06281f",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "flex-start",
                    padding: "16px",
                    scrollSnapAlign: "start",
                    fontWeight: 800,
                    fontSize: "20px",
                    boxShadow: "0 12px 24px rgba(6,95,70,0.35)",
                  },
                  { content: "Slide 3" },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("dots"),
            "div",
            "Carousel Indicators",
            {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              justifyContent: "center",
            },
            {
              children: [
                createVirtualNode(
                  idFor("dot-1"),
                  "span",
                  "Dot",
                  {
                    width: "9px",
                    height: "9px",
                    display: "inline-block",
                    borderRadius: "999px",
                    backgroundColor: "rgba(56,189,248,0.95)",
                  },
                ),
                createVirtualNode(
                  idFor("dot-2"),
                  "span",
                  "Dot",
                  {
                    width: "9px",
                    height: "9px",
                    display: "inline-block",
                    borderRadius: "999px",
                    backgroundColor: "rgba(148,163,184,0.55)",
                  },
                ),
                createVirtualNode(
                  idFor("dot-3"),
                  "span",
                  "Dot",
                  {
                    width: "9px",
                    height: "9px",
                    display: "inline-block",
                    borderRadius: "999px",
                    backgroundColor: "rgba(148,163,184,0.55)",
                  },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("nav-prev"),
            "button",
            "Carousel Prev",
            {
              position: "absolute",
              left: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              border: "1px solid rgba(148,163,184,0.45)",
              backgroundColor: "rgba(15,23,42,0.7)",
              color: "#e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              zIndex: 2,
            },
            { content: "<" },
          ),
          createVirtualNode(
            idFor("nav-next"),
            "button",
            "Carousel Next",
            {
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              border: "1px solid rgba(148,163,184,0.45)",
              backgroundColor: "rgba(15,23,42,0.7)",
              color: "#e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              zIndex: 2,
            },
            { content: ">" },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:flip-card") {
    return createVirtualNode(
      idFor("flip"),
      "div",
      "Flip Card",
      {
        width: "280px",
        height: "180px",
        perspective: "1000px",
        position: "relative",
      },
      {
        children: [
          createVirtualNode(
            idFor("inner"),
            "div",
            "Flip Inner",
            {
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
              transition: "transform 0.6s ease",
              borderRadius: "14px",
              overflow: "hidden",
              boxShadow: "0 12px 30px rgba(2,6,23,0.16)",
            },
            {
              children: [
                createVirtualNode(
                  idFor("front"),
                  "div",
                  "Front Face",
                  {
                    position: "absolute",
                    inset: "0px",
                    background:
                      "linear-gradient(135deg, rgba(14,165,233,0.2), rgba(99,102,241,0.24))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    backfaceVisibility: "hidden",
                  },
                  { content: "Front" },
                ),
                createVirtualNode(
                  idFor("back"),
                  "div",
                  "Back Face",
                  {
                    position: "absolute",
                    inset: "0px",
                    background:
                      "linear-gradient(135deg, rgba(16,185,129,0.22), rgba(34,197,94,0.24))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    transform: "rotateY(180deg)",
                    backfaceVisibility: "hidden",
                  },
                  { content: "Back" },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:scroll-reveal") {
    return createVirtualNode(
      idFor("reveal"),
      "section",
      "Scroll Reveal Block",
      {
        padding: "24px",
        borderRadius: "12px",
        backgroundColor: "#f8fafc",
        border: "1px solid rgba(148,163,184,0.3)",
      },
      {
        attributes: { "data-scroll-reveal": "true" },
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Reveal Heading",
            {
              marginBottom: "8px",
              fontSize: "24px",
              fontWeight: 700,
            },
            { content: "Reveal On Scroll" },
          ),
          createVirtualNode(
            idFor("body"),
            "p",
            "Reveal Text",
            {
              fontSize: "14px",
              lineHeight: "1.6",
            },
            {
              content:
                "This block is tagged for preview scroll-reveal animations.",
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:drag-card") {
    return createVirtualNode(
      idFor("drag-stage"),
      "section",
      "Drag Card Stage",
      {},
      {
        className: "nx-dd-stage",
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Stage Title",
            {},
            {
              className: "nx-dd-stage-title",
              content: "Drag Card Demo",
            },
          ),
          createVirtualNode(
            idFor("help"),
            "p",
            "Stage Help",
            {},
            {
              className: "nx-dd-stage-help",
              content: "Drag the card and drop it inside the target zone.",
            },
          ),
          createVirtualNode(
            idFor("card"),
            "div",
            "Draggable Card",
            {},
            {
              className: "nx-draggable-card",
              attributes: {
                draggable: "true",
                "data-nx-drag-item": idFor("drag-item"),
              },
              content: "Drag me",
            },
          ),
          createVirtualNode(
            idFor("zone"),
            "div",
            "Drop Zone",
            {},
            {
              className: "nx-drop-zone",
              attributes: {
                "data-nx-drop-zone": idFor("drop-zone"),
              },
              content: "Drop here",
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:drop-zone") {
    return createVirtualNode(
      idFor("file-drop"),
      "section",
      "File Drop Zone",
      {},
      {
        className: "nx-dd-stage",
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Drop Zone Title",
            {},
            {
              className: "nx-dd-stage-title",
              content: "File Drop Zone",
            },
          ),
          createVirtualNode(
            idFor("zone"),
            "div",
            "File Drop",
            {},
            {
              className: "nx-file-drop",
              attributes: {
                "data-nx-file-drop": "true",
              },
              children: [
                createVirtualNode(
                  idFor("hint"),
                  "p",
                  "Drop Hint",
                  {},
                  { content: "Drop files here" },
                ),
                createVirtualNode(
                  idFor("output"),
                  "div",
                  "Drop Output",
                  {},
                  {
                    className: "nx-file-drop-output",
                    content: "No files dropped.",
                  },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:sortable-list") {
    return createVirtualNode(
      idFor("sortable-stage"),
      "section",
      "Sortable List",
      {},
      {
        className: "nx-dd-stage",
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Sortable Title",
            {},
            {
              className: "nx-dd-stage-title",
              content: "Sortable List",
            },
          ),
          createVirtualNode(
            idFor("help"),
            "p",
            "Sortable Help",
            {},
            {
              className: "nx-dd-stage-help",
              content: "Drag list items to reorder them.",
            },
          ),
          createVirtualNode(
            idFor("list"),
            "ul",
            "Sortable Items",
            {},
            {
              className: "nx-sortable-list",
              attributes: {
                "data-nx-sortable": "true",
              },
              children: [
                createVirtualNode(
                  idFor("item-a"),
                  "li",
                  "Sortable Item",
                  {},
                  {
                    className: "nx-sortable-item",
                    attributes: {
                      draggable: "true",
                      "data-nx-sortable-item": idFor("sortable-a"),
                    },
                    content: "Task A",
                  },
                ),
                createVirtualNode(
                  idFor("item-b"),
                  "li",
                  "Sortable Item",
                  {},
                  {
                    className: "nx-sortable-item",
                    attributes: {
                      draggable: "true",
                      "data-nx-sortable-item": idFor("sortable-b"),
                    },
                    content: "Task B",
                  },
                ),
                createVirtualNode(
                  idFor("item-c"),
                  "li",
                  "Sortable Item",
                  {},
                  {
                    className: "nx-sortable-item",
                    attributes: {
                      draggable: "true",
                      "data-nx-sortable-item": idFor("sortable-c"),
                    },
                    content: "Task C",
                  },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  return null;
};

export const buildPresetElementV2 = (
  presetType: string,
  idFor: (segment: string) => string,
): VirtualElement | null => {
  if (presetType === "preset:carousel") {
    return createVirtualNode(
      idFor("carousel"),
      "section",
      "Carousel",
      {},
      {
        className: "nx-carousel",
        attributes: {
          "data-nx-carousel": "true",
          "data-nx-carousel-index": "0",
        },
        children: [
          createVirtualNode(
            idFor("header"),
            "div",
            "Carousel Header",
            {},
            {
              className: "nx-carousel-header",
              content: "Featured Carousel - 3 Slides",
            },
          ),
          createVirtualNode(
            idFor("viewport"),
            "div",
            "Carousel Viewport",
            {},
            {
              className: "nx-carousel-viewport",
              children: [
                createVirtualNode(
                  idFor("track"),
                  "div",
                  "Carousel Track",
                  {},
                  {
                    className: "nx-carousel-track",
                    attributes: { "data-nx-carousel-track": "true" },
                    children: [
                      createVirtualNode(
                        idFor("card-a"),
                        "div",
                        "Slide Card",
                        {},
                        {
                          className: "nx-carousel-slide is-a",
                          attributes: { "data-nx-carousel-slide": "true" },
                          content: "Slide 1",
                        },
                      ),
                      createVirtualNode(
                        idFor("card-b"),
                        "div",
                        "Slide Card",
                        {},
                        {
                          className: "nx-carousel-slide is-b",
                          attributes: { "data-nx-carousel-slide": "true" },
                          content: "Slide 2",
                        },
                      ),
                      createVirtualNode(
                        idFor("card-c"),
                        "div",
                        "Slide Card",
                        {},
                        {
                          className: "nx-carousel-slide is-c",
                          attributes: { "data-nx-carousel-slide": "true" },
                          content: "Slide 3",
                        },
                      ),
                    ],
                  },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("dots"),
            "div",
            "Carousel Indicators",
            {},
            {
              className: "nx-carousel-dots",
              children: [
                createVirtualNode(
                  idFor("dot-1"),
                  "button",
                  "Dot",
                  {},
                  {
                    className: "nx-carousel-dot is-active",
                    attributes: {
                      "data-nx-carousel-dot": "true",
                      "data-index": "0",
                      type: "button",
                      "aria-label": "Slide 1",
                    },
                  },
                ),
                createVirtualNode(
                  idFor("dot-2"),
                  "button",
                  "Dot",
                  {},
                  {
                    className: "nx-carousel-dot",
                    attributes: {
                      "data-nx-carousel-dot": "true",
                      "data-index": "1",
                      type: "button",
                      "aria-label": "Slide 2",
                    },
                  },
                ),
                createVirtualNode(
                  idFor("dot-3"),
                  "button",
                  "Dot",
                  {},
                  {
                    className: "nx-carousel-dot",
                    attributes: {
                      "data-nx-carousel-dot": "true",
                      "data-index": "2",
                      type: "button",
                      "aria-label": "Slide 3",
                    },
                  },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("nav-prev"),
            "button",
            "Carousel Prev",
            {},
            {
              className: "nx-carousel-nav prev",
              attributes: {
                "data-nx-carousel-prev": "true",
                type: "button",
                "aria-label": "Previous slide",
              },
              content: "<",
            },
          ),
          createVirtualNode(
            idFor("nav-next"),
            "button",
            "Carousel Next",
            {},
            {
              className: "nx-carousel-nav next",
              attributes: {
                "data-nx-carousel-next": "true",
                type: "button",
                "aria-label": "Next slide",
              },
              content: ">",
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:flip-card") {
    return createVirtualNode(
      idFor("flip"),
      "div",
      "Flip Card",
      {},
      {
        className: "nx-flip-card",
        attributes: {
          "data-nx-flip-card": "true",
          tabindex: "0",
          role: "button",
          "aria-label": "Flip card",
        },
        children: [
          createVirtualNode(
            idFor("inner"),
            "div",
            "Flip Inner",
            {},
            {
              className: "nx-flip-inner",
              children: [
                createVirtualNode(
                  idFor("front"),
                  "div",
                  "Front Face",
                  {},
                  { className: "nx-flip-face front", content: "Front" },
                ),
                createVirtualNode(
                  idFor("back"),
                  "div",
                  "Back Face",
                  {},
                  { className: "nx-flip-face back", content: "Back" },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:scroll-reveal") {
    return createVirtualNode(
      idFor("reveal"),
      "section",
      "Scroll Reveal Block",
      {},
      {
        className: "nx-scroll-reveal",
        attributes: { "data-nx-scroll-reveal": "true" },
        children: [
          createVirtualNode(
            idFor("title"),
            "h2",
            "Reveal Heading",
            {},
            {
              className: "nx-scroll-reveal-title",
              content: "Reveal On Scroll",
            },
          ),
          createVirtualNode(
            idFor("body"),
            "p",
            "Reveal Text",
            {},
            {
              className: "nx-scroll-reveal-text",
              content:
                "This block is tagged for preview scroll-reveal animations.",
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:calendar-dialog") {
    return createVirtualNode(
      idFor("calendar-wrap"),
      "section",
      "Calendar Dialog",
      {},
      {
        className: "nx-calendar-wrap",
        attributes: {
          "data-nx-calendar": "true",
        },
        children: [
          createVirtualNode(
            idFor("toolbar"),
            "div",
            "Calendar Toolbar",
            {},
            {
              className: "nx-calendar-toolbar",
              children: [
                createVirtualNode(
                  idFor("reset"),
                  "button",
                  "Reset Calendar",
                  {},
                  {
                    className: "nx-calendar-reset",
                    attributes: { type: "button", "data-nx-calendar-reset": "true" },
                    content: "Reset Calendar",
                  },
                ),
              ],
            },
          ),
          createVirtualNode(
            idFor("shell"),
            "div",
            "Calendar Shell",
            {},
            {
              className: "nx-calendar-shell",
              children: [
                createVirtualNode(
                  idFor("head"),
                  "div",
                  "Calendar Head",
                  {},
                  {
                    className: "nx-calendar-head",
                    children: [
                      createVirtualNode(
                        idFor("prev"),
                        "button",
                        "Calendar Prev",
                        {},
                        {
                          className: "nx-calendar-nav",
                          attributes: { type: "button", "data-nx-calendar-prev": "true", "aria-label": "Previous month" },
                          content: "«",
                        },
                      ),
                      createVirtualNode(
                        idFor("month"),
                        "div",
                        "Month Label",
                        {},
                        {
                          className: "nx-calendar-month",
                          attributes: { "data-nx-calendar-month-label": "true" },
                          content: "Mar",
                        },
                      ),
                      createVirtualNode(
                        idFor("year"),
                        "div",
                        "Year Label",
                        {},
                        {
                          className: "nx-calendar-year",
                          attributes: { "data-nx-calendar-year-label": "true" },
                          content: "2026",
                        },
                      ),
                      createVirtualNode(
                        idFor("next"),
                        "button",
                        "Calendar Next",
                        {},
                        {
                          className: "nx-calendar-nav",
                          attributes: { type: "button", "data-nx-calendar-next": "true", "aria-label": "Next month" },
                          content: "»",
                        },
                      ),
                    ],
                  },
                ),
                createVirtualNode(
                  idFor("grid"),
                  "div",
                  "Calendar Grid",
                  {},
                  {
                    className: "nx-calendar-grid",
                    attributes: { "data-nx-calendar-grid": "true" },
                  },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  if (presetType === "preset:internal-swipe") {
    return createVirtualNode(
      idFor("internal-swipe"),
      "section",
      "Internal Swipe",
      {},
      {
        className: "nx-carousel",
        attributes: { "data-nx-carousel": "true", "data-nx-carousel-index": "0" },
        children: [
          createVirtualNode(idFor("header"), "div", "Swipe Header", {}, { className: "nx-carousel-header", content: "Internal Swiping - Arrow Controls" }),
          createVirtualNode(idFor("vp"), "div", "Viewport", {}, {
            className: "nx-carousel-viewport",
            children: [
              createVirtualNode(idFor("track"), "div", "Track", {}, {
                className: "nx-carousel-track",
                attributes: { "data-nx-carousel-track": "true" },
                children: [
                  createVirtualNode(idFor("slide1"), "div", "Slide 1", {}, { className: "nx-carousel-slide is-a", attributes: { "data-nx-carousel-slide": "true" }, content: "Page 1 - On Load Animation" }),
                  createVirtualNode(idFor("slide2"), "div", "Slide 2", {}, { className: "nx-carousel-slide is-b", attributes: { "data-nx-carousel-slide": "true" }, content: "Page 2 - Swipe Left/Right" }),
                  createVirtualNode(idFor("slide3"), "div", "Slide 3", {}, { className: "nx-carousel-slide is-c", attributes: { "data-nx-carousel-slide": "true" }, content: "Page 3 - CTA Section" }),
                ],
              }),
            ],
          }),
          createVirtualNode(idFor("prev"), "button", "Prev", {}, { className: "nx-carousel-nav prev", attributes: { "data-nx-carousel-prev": "true", type: "button" }, content: "<" }),
          createVirtualNode(idFor("next"), "button", "Next", {}, { className: "nx-carousel-nav next", attributes: { "data-nx-carousel-next": "true", type: "button" }, content: ">" }),
          createVirtualNode(idFor("dots"), "div", "Dots", {}, {
            className: "nx-carousel-dots",
            children: [
              createVirtualNode(idFor("dot1"), "button", "Dot", {}, { className: "nx-carousel-dot is-active", attributes: { "data-nx-carousel-dot": "true", "data-index": "0", type: "button" } }),
              createVirtualNode(idFor("dot2"), "button", "Dot", {}, { className: "nx-carousel-dot", attributes: { "data-nx-carousel-dot": "true", "data-index": "1", type: "button" } }),
              createVirtualNode(idFor("dot3"), "button", "Dot", {}, { className: "nx-carousel-dot", attributes: { "data-nx-carousel-dot": "true", "data-index": "2", type: "button" } }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:dots-swipe") {
    const buildSwipePanel = (label: string, suffix: string): VirtualElement =>
      createVirtualNode(
        idFor(`panel-${suffix}`),
        "div",
        "Swipe Panel",
        {},
        {
          className: "nx-swipe-panel",
          children: [
            createVirtualNode(idFor(`title-${suffix}`), "h3", "Panel Title", {}, { className: "nx-swipe-panel-title", content: label }),
            createVirtualNode(idFor(`carousel-${suffix}`), "section", "Carousel", {}, {
              className: "nx-carousel",
              attributes: { "data-nx-carousel": "true", "data-nx-carousel-index": "0" },
              children: [
                createVirtualNode(idFor(`vp-${suffix}`), "div", "Viewport", {}, {
                  className: "nx-carousel-viewport",
                  children: [
                    createVirtualNode(idFor(`track-${suffix}`), "div", "Track", {}, {
                      className: "nx-carousel-track",
                      attributes: { "data-nx-carousel-track": "true" },
                      children: [
                        createVirtualNode(idFor(`s1-${suffix}`), "div", "Slide 1", {}, { className: "nx-carousel-slide is-a", attributes: { "data-nx-carousel-slide": "true" }, content: "Slide 1" }),
                        createVirtualNode(idFor(`s2-${suffix}`), "div", "Slide 2", {}, { className: "nx-carousel-slide is-b", attributes: { "data-nx-carousel-slide": "true" }, content: "Slide 2" }),
                      ],
                    }),
                  ],
                }),
                createVirtualNode(idFor(`dots-${suffix}`), "div", "Dots", {}, {
                  className: "nx-carousel-dots",
                  children: [
                    createVirtualNode(idFor(`d1-${suffix}`), "button", "Dot", {}, { className: "nx-carousel-dot is-active", attributes: { "data-nx-carousel-dot": "true", "data-index": "0", type: "button" } }),
                    createVirtualNode(idFor(`d2-${suffix}`), "button", "Dot", {}, { className: "nx-carousel-dot", attributes: { "data-nx-carousel-dot": "true", "data-index": "1", type: "button" } }),
                  ],
                }),
              ],
            }),
          ],
        },
      );
    return createVirtualNode(
      idFor("swipe-board"),
      "section",
      "Multi Swipe Board",
      {},
      {
        className: "nx-swipe-board",
        children: [
          buildSwipePanel("Internal Swiping - Arrows", "a"),
          buildSwipePanel("Internal Swiping - Vertical Dots", "b"),
          buildSwipePanel("Internal Swiping - Bottom Dots", "c"),
        ],
      },
    );
  }
  if (presetType === "preset:video-panel") {
    return createVirtualNode(
      idFor("video-wrap"),
      "div",
      "Video Functionality",
      {},
      {
        className: "nx-video-inline",
        attributes: { "data-nx-video-tool": "true" },
        children: [
          createVirtualNode(idFor("inline-video"), "video", "Inline Video", {}, {
            className: "nx-video-inline-player noSwipe video-js vjs-default-skin",
            attributes: { controls: "true", preload: "metadata", poster: "media/images/poster.jpg" },
            children: [createVirtualNode(idFor("inline-src"), "source", "Source", {}, { attributes: { src: "media/videos/video.mp4", type: "video/mp4" } })],
          }),
          createVirtualNode(idFor("dialog1"), "div", "Dialog 1", {}, {
            className: "dialog hidden videoDialog",
            styles: { display: "none" },
            attributes: { id: "video1", title: "Video Dialog Demo", "data-width": "100", "data-height": "67" },
            children: [
              createVirtualNode(idFor("d1body"), "div", "Dialog Body", {}, {
                className: "dialogBody",
                children: [
                  createVirtualNode(idFor("d1h"), "h4", "Heading", {}, { content: "Dialog Video With Tracking" }),
                  createVirtualNode(idFor("d1v"), "video", "Video", {}, {
                    className: "noSwipe vjs-default-skin",
                    attributes: { "data-controls": "true", poster: "media/images/poster.jpg" },
                    children: [createVirtualNode(idFor("d1src"), "source", "Source", {}, { attributes: { src: "media/videos/video.mp4", type: "video/mp4" } })],
                  }),
                ],
              }),
            ],
          }),
          createVirtualNode(idFor("dialog2"), "div", "Dialog 2", {}, {
            className: "dialog hidden videoDialog",
            styles: { display: "none" },
            attributes: { id: "dialogTabPopup", title: "Dialog Videos on Tabs", "data-width": "100", "data-height": "67" },
            children: [
              createVirtualNode(idFor("d2body"), "div", "Dialog Body", {}, {
                className: "dialogBody",
                children: [
                  createVirtualNode(idFor("tab1"), "div", "Tab One", {}, { className: "tab1", content: "Video TAB1 content" }),
                  createVirtualNode(idFor("tab2"), "div", "Tab Two", {}, { className: "tab2", content: "Video TAB2 content" }),
                ],
              }),
              createVirtualNode(idFor("d2ext"), "div", "External tabs", {}, {
                className: "externalDialogBody",
                children: [
                  createVirtualNode(idFor("t1"), "div", "Tab", {}, {
                    className: "tab activeColor",
                    attributes: { id: "tab1" },
                    children: [createVirtualNode(idFor("t1s"), "span", "Tab label", {}, { content: "VIDEO TAB1" })],
                  }),
                  createVirtualNode(idFor("t2"), "div", "Tab", {}, {
                    className: "tab",
                    attributes: { id: "tab2" },
                    children: [
                      createVirtualNode(idFor("t2s"), "span", "Tab label", {}, { content: "VIDEO TAB2" }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:race-checklist") {
    return createVirtualNode(
      idFor("race-wrap"),
      "section",
      "Race Checklist",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "Race Questionnaire" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Reusable yes/no progression block from race workflow." }),
          createVirtualNode(idFor("list"), "ol", "Question List", { margin: "0", paddingLeft: "18px", display: "grid", gap: "8px" }, {
            children: [
              createVirtualNode(idFor("q1"), "li", "Question", {}, { content: "Does HCP know the brand and right patient profile?" }),
              createVirtualNode(idFor("q2"), "li", "Question", {}, { content: "Is HCP trying the brand 1-2 times only?" }),
              createVirtualNode(idFor("q3"), "li", "Question", {}, { content: "Any efficacy/safety concern remains?" }),
            ],
          }),
          createVirtualNode(idFor("actions"), "div", "Actions", {}, {
            className: "nx-chip-row",
            children: [
              createVirtualNode(idFor("yes"), "button", "Yes", {}, { className: "nx-chip", content: "Yes" }),
              createVirtualNode(idFor("no"), "button", "No", {}, { className: "nx-chip", content: "No" }),
              createVirtualNode(idFor("next"), "button", "Next", {}, { className: "nx-chip", content: "Next Step" }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:segmentation-cards") {
    return createVirtualNode(
      idFor("seg-wrap"),
      "section",
      "Segmentation Cards",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "Attitudinal Segmentation" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Drag-sort cards to map HCP segment quickly." }),
          createVirtualNode(idFor("cards"), "div", "Cards", { display: "grid", gap: "8px" }, {
            children: [
              createVirtualNode(idFor("c1"), "div", "Card", {}, { className: "nx-chip", content: "Evidence Seeker" }),
              createVirtualNode(idFor("c2"), "div", "Card", {}, { className: "nx-chip", content: "Guideline First" }),
              createVirtualNode(idFor("c3"), "div", "Card", {}, { className: "nx-chip", content: "Fast Adopter" }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:reference-tabs") {
    return createVirtualNode(
      idFor("refs-wrap"),
      "section",
      "Reference Tabs",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "References / Footnotes / Abbreviations" }),
          createVirtualNode(idFor("tabs"), "div", "Tabs", {}, {
            className: "nx-reference-tabs",
            children: [
              createVirtualNode(idFor("head"), "div", "Tab Head", {}, {
                className: "nx-reference-tabs-head",
                children: [
                  createVirtualNode(idFor("tab1"), "button", "References Tab", {}, { className: "nx-reference-tab", content: "References" }),
                  createVirtualNode(idFor("tab2"), "button", "Footnotes Tab", {}, { className: "nx-reference-tab", content: "Footnotes" }),
                  createVirtualNode(idFor("tab3"), "button", "Abbreviations Tab", {}, { className: "nx-reference-tab", content: "Abbreviations" }),
                ],
              }),
              createVirtualNode(idFor("list"), "div", "List", {}, {
                className: "nx-reference-list",
                children: [
                  createVirtualNode(idFor("li1"), "div", "Reference", {}, { content: "1. Place supporting reference text here." }),
                  createVirtualNode(idFor("li2"), "div", "Reference", {}, { content: "2. Add footnote or abbreviation details." }),
                ],
              }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:anim-001-jquery") {
    return createVirtualNode(
      idFor("anim-001"),
      "section",
      "Animation 001 (jQuery style)",
      {},
      {
        className: "nx-anim-card",
        attributes: { "data-nx-anim-001": "true" },
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-anim-title", content: "Slide 001 - JQuery Animation" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Arrow fill animation similar to local.js in slide 001." }),
          createVirtualNode(idFor("track"), "div", "Arrow Track", {}, {
            className: "nx-arrow-track",
            children: [
              createVirtualNode(idFor("fill"), "div", "Arrow Fill", {}, {
                className: "nx-arrow-fill",
                children: [
                  createVirtualNode(
                    idFor("img"),
                    "img",
                    "Arrow Image",
                    {},
                    {
                      src: "media/images/arrow.png",
                      attributes: { alt: "Arrow" },
                    },
                  ),
                ],
              }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:anim-002-css") {
    return createVirtualNode(
      idFor("anim-002"),
      "section",
      "Animation 002 (CSS class)",
      {},
      {
        className: "nx-anim-card",
        attributes: { "data-nx-anim-002": "true", "data-nx-anim-mode": "animated" },
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-anim-title", content: "Slide 002 - CSS Animation" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Class-based load1/load2 animation pattern from slide 002." }),
          createVirtualNode(idFor("track"), "div", "Arrow Track", {}, {
            className: "nx-arrow-track",
            children: [
              createVirtualNode(idFor("fill"), "div", "Arrow Fill", {}, {
                className: "nx-arrow-fill",
                attributes: { "data-nx-anim-002-fill": "true" },
                children: [
                  createVirtualNode(
                    idFor("img"),
                    "img",
                    "Arrow Image",
                    {},
                    {
                      src: "media/images/arrow.png",
                      attributes: { alt: "Arrow" },
                    },
                  ),
                ],
              }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:clickstream-011") {
    return createVirtualNode(
      idFor("click-011"),
      "section",
      "Clickstream 011",
      {},
      {
        className: "nx-clickstream-card",
        attributes: { "data-nx-clickstream-011": "true" },
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-anim-title", content: "Slide 011 - Clickstream Without Form" }),
          createVirtualNode(idFor("grid"), "div", "Fields", {}, {
            className: "nx-clickstream-grid",
            children: [
              createVirtualNode(idFor("line1"), "label", "Checkbox", {}, { className: "nx-clickstream-line", content: "Checkbox" }),
              createVirtualNode(idFor("check"), "input", "Checkbox Input", {}, { attributes: { type: "checkbox", class: "logField", "data-fields": "SurveyQuestion|Answer", "data-description": "checkbox|[data]" } }),
              createVirtualNode(idFor("select"), "select", "Select", {}, {
                className: "nx-clickstream-select logField",
                attributes: { "data-fields": "SurveyQuestion|Answer", "data-description": "select|[data]" },
                children: [
                  createVirtualNode(idFor("o1"), "option", "Option", {}, { attributes: { value: "Option One" }, content: "One" }),
                  createVirtualNode(idFor("o2"), "option", "Option", {}, { attributes: { value: "Option Two" }, content: "Two" }),
                ],
              }),
              createVirtualNode(idFor("slider"), "input", "Slider", {}, { className: "nx-clickstream-slider logField", attributes: { type: "range", min: "1", max: "10", value: "5", "data-fields": "SurveyQuestion|Answer", "data-description": "slider value|[data]" } }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:clickstream-012-form") {
    return createVirtualNode(
      idFor("click-012"),
      "section",
      "Clickstream 012 Form",
      {},
      {
        className: "nx-clickstream-card",
        attributes: { "data-nx-clickstream-form": "true" },
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-anim-title", content: "Slide 012 - Clickstream With Form" }),
          createVirtualNode(idFor("grid"), "div", "Fields", {}, {
            className: "nx-clickstream-grid",
            children: [
              createVirtualNode(idFor("check"), "input", "Checkbox", {}, { attributes: { type: "checkbox", id: "slide12checkbox", class: "logFormField", "data-fields": "SurveyQuestion|Answer", "data-description": "formCheckbox|checked" } }),
              createVirtualNode(idFor("select"), "select", "Select", {}, {
                className: "nx-clickstream-select logFormField",
                attributes: { id: "slide12select", "data-fields": "SurveyQuestion|Answer", "data-description": "formSelect|[data]" },
                children: [
                  createVirtualNode(idFor("o1"), "option", "Option", {}, { attributes: { value: "Option One" }, content: "One" }),
                  createVirtualNode(idFor("o2"), "option", "Option", {}, { attributes: { value: "Option Two" }, content: "Two" }),
                ],
              }),
              createVirtualNode(idFor("slider"), "input", "Slider", {}, { className: "nx-clickstream-slider logFormField", attributes: { id: "slide12slider", type: "range", min: "0", max: "100", step: "10", value: "50", "data-fields": "SurveyQuestion|Answer", "data-description": "slider value|[data]" } }),
              createVirtualNode(idFor("submit"), "button", "Submit", {}, { className: "nx-clickstream-submit logFormSubmit", attributes: { type: "button", "data-nx-form-submit": "true", "data-onetime": "1", "data-callback-name": "OnClickstreamDone" }, content: "Submit Form" }),
              createVirtualNode(idFor("status"), "div", "Status", {}, { className: "nx-clickstream-status", attributes: { "data-nx-form-status": "true" }, content: "Waiting for submit..." }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:timeline-steps") {
    return createVirtualNode(
      idFor("timeline"),
      "section",
      "Timeline Steps",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "Timeline Steps" }),
          createVirtualNode(idFor("sub"), "p", "Sub", {}, { className: "nx-function-sub", content: "Reusable progression widget for key messages." }),
          createVirtualNode(idFor("row"), "div", "Steps", { display: "grid", gap: "8px" }, {
            children: [
              createVirtualNode(idFor("s1"), "div", "Step", {}, { className: "nx-chip", content: "1. Discover" }),
              createVirtualNode(idFor("s2"), "div", "Step", {}, { className: "nx-chip", content: "2. Compare" }),
              createVirtualNode(idFor("s3"), "div", "Step", {}, { className: "nx-chip", content: "3. Act" }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:metric-counters") {
    return createVirtualNode(
      idFor("metrics"),
      "section",
      "Metric Counters",
      {},
      {
        className: "nx-function-card",
        children: [
          createVirtualNode(idFor("title"), "h3", "Title", {}, { className: "nx-function-title", content: "Metric Counters" }),
          createVirtualNode(idFor("row"), "div", "Counter Row", { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "8px" }, {
            children: [
              createVirtualNode(idFor("m1"), "div", "Counter", {}, { className: "nx-chip", content: "85%" }),
              createVirtualNode(idFor("m2"), "div", "Counter", {}, { className: "nx-chip", content: "3.2x" }),
              createVirtualNode(idFor("m3"), "div", "Counter", {}, { className: "nx-chip", content: "120" }),
            ],
          }),
        ],
      },
    );
  }
  if (presetType === "preset:popup") {
    const popupId = `popup-${Math.random().toString(36).slice(2, 9)}`;
    return createVirtualNode(
      idFor("popup-container"),
      "div",
      "Popup Container",
      {},
      {
        children: [
          createVirtualNode(
            idFor("trigger"),
            "button",
            "Popup Trigger",
            { padding: "12px 24px", borderRadius: "10px", background: "#3b82f6", color: "#fff", border: "none" },
            {
              className: "nx-popup-trigger",
              attributes: { "data-nx-popup-trigger": popupId },
              content: "Open Popup",
            },
          ),
          createVirtualNode(
            idFor("backdrop"),
            "div",
            "Popup Backdrop",
            {},
            {
              className: "nx-popup-backdrop",
              attributes: { "data-nx-popup-backdrop": popupId },
            },
          ),
          createVirtualNode(
            idFor("content"),
            "div",
            "Popup Content",
            {},
            {
              className: "nx-popup-content",
              attributes: { "data-nx-popup-content": popupId },
              children: [
                createVirtualNode(
                  idFor("close"),
                  "div",
                  "Close Button",
                  {},
                  {
                    className: "nx-popup-close",
                    attributes: { "data-nx-popup-close": popupId },
                    content: "×",
                  },
                ),
                createVirtualNode(
                  idFor("title"),
                  "h3",
                  "Popup Title",
                  { fontSize: "24px", fontWeight: "700", marginBottom: "12px", color: "#1e293b" },
                  { content: "Customizable Popup" },
                ),
                createVirtualNode(
                  idFor("body"),
                  "div",
                  "Popup Body",
                  { fontSize: "16px", color: "#475569", lineHeight: "1.6" },
                  { content: "This is a fully customizable popup. You can drag other elements into it, resize it, and change its style." },
                ),
              ],
            },
          ),
        ],
      },
    );
  }
  return buildPresetElement(presetType, idFor);
};

export const buildStandardElement = (type: string, id: string): VirtualElement => {
  const normalized = type === "container" || type === "flex" ? "div" : type;
  const baseStyles: React.CSSProperties = {
    padding: "10px",
    minHeight: "20px",
  };
  if (type === "flex") {
    baseStyles.display = "flex";
    baseStyles.gap = "8px";
    baseStyles.alignItems = "center";
  }
  if (type === "container") {
    baseStyles.width = "100%";
    baseStyles.maxWidth = "960px";
    baseStyles.margin = "0 auto";
  }
  if (normalized === "video") {
    baseStyles.width = "360px";
    baseStyles.maxWidth = "100%";
    baseStyles.height = "auto";
    baseStyles.padding = "0";
    baseStyles.display = "block";
    baseStyles.background = "#000000";
    baseStyles.borderRadius = "12px";
    baseStyles.overflow = "hidden";
  }
  const defaultContentByType: Partial<Record<string, string>> = {
    p: "New Text",
    h1: "New Heading",
    h2: "New Heading",
    h3: "New Heading",
    button: "Button",
    span: "New Text",
    div: "New Block",
    section: "New Section",
    a: "Link Text",
  };
  if (type === "container") {
    defaultContentByType.div = "New Container";
  } else if (type === "flex") {
    defaultContentByType.div = "New Flex";
  }
  return {
    id,
    type: normalized as ElementType,
    name: normalized === "video" ? "Video" : normalized.charAt(0).toUpperCase() + normalized.slice(1),
    styles: baseStyles,
    children:
      normalized === "video"
        ? [
            {
              id: `${id}-source`,
              type: "source",
              name: "Source",
              styles: {},
              children: [],
              attributes: {
                src: "../shared/media/video/video1.mp4",
                type: "video/mp4",
              },
            },
          ]
        : [],
    content: normalized === "video" ? undefined : defaultContentByType[normalized],
    ...(normalized === "a" ? { href: "#" } : {}),
    ...(normalized === "img"
      ? { src: "https://picsum.photos/200/300", name: "Image" }
      : {}),
    ...(normalized === "video"
      ? {
          attributes: {
            controls: "true",
            preload: "metadata",
            poster: "../shared/media/images/aferix_video_thumb.png",
            playsinline: "true",
          },
        }
      : {}),
  };
};

export const materializeVirtualElement = (
  doc: Document,
  element: VirtualElement,
): Node => {
  if (element.type === "text") {
    return doc.createTextNode(element.content || "");
  }
  const node = doc.createElement(element.type);
  if (element.id) {
    node.setAttribute("id", element.id);
  }
  if (element.className) {
    node.setAttribute("class", element.className);
  }
  if (element.src) {
    node.setAttribute("src", element.src);
  }
  if (element.href) {
    node.setAttribute("href", element.href);
  }
  if (element.attributes) {
    for (const [key, value] of Object.entries(element.attributes)) {
      if (!key) continue;
      node.setAttribute(key, value);
    }
  }
  for (const [key, rawValue] of Object.entries(element.styles || {})) {
    if (rawValue === undefined || rawValue === null || rawValue === "")
      continue;
    const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
    (node as HTMLElement).style.setProperty(cssKey, String(rawValue));
  }
  if (element.animation) {
    (node as HTMLElement).style.setProperty("animation", element.animation);
  }
  if (element.content) {
    node.appendChild(doc.createTextNode(element.content));
  }
  for (const child of element.children) {
    node.appendChild(materializeVirtualElement(doc, child));
  }
  return node;
};

export const buildPreviewLayerTreeFromElement = (
  element: Element,
  path: number[] = [],
): VirtualElement => {
  const tag = String(element.tagName || "div").toLowerCase();
  const id = toPreviewLayerId(path);
  const elementId = (element.getAttribute("id") || "").trim();
  const classList = (element.getAttribute("class") || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const displayName =
    [
      elementId ? `#${elementId}` : "",
      classList.length > 0 ? `.${classList.join(".")}` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || tag.toUpperCase();
  const children = Array.from(element.children).map((child, index) =>
    buildPreviewLayerTreeFromElement(child, [...path, index]),
  );
  return {
    id,
    type: tag,
    name: displayName,
    content: normalizeEditorMultilineText(extractTextWithBreaks(element)),
    html: element instanceof HTMLElement ? element.innerHTML || "" : "",
    styles: {},
    children,
  };
};

// --- Device Context Menu ---
export const DeviceContextMenu: React.FC<{
  type: "mobile" | "desktop" | "tablet";
  position: { x: number; y: number };
  mobileFrameStyle: "dynamic-island" | "punch-hole" | "notch";
  setMobileFrameStyle: (s: "dynamic-island" | "punch-hole" | "notch") => void;
  desktopResolution: "1080p" | "1.5k" | "2k" | "4k" | "resizable";
  setDesktopResolution: (
    r: "1080p" | "1.5k" | "2k" | "4k" | "resizable",
  ) => void;
  tabletModel: "ipad" | "ipad-pro";
  tabletOrientation: "portrait" | "landscape";
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
  tabletOrientation,
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

    const isLandscape = tabletOrientation === "landscape";
    const tabletItems = [
      {
        label: `iPad (${isLandscape ? "2048 x 1536" : "1536 x 2048"})`,
        value: "ipad" as const,
      },
      {
        label: `iPad Pro (${isLandscape ? "2732 x 2048" : "2048 x 2732"})`,
        value: "ipad-pro" as const,
      },
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

export type PreviewConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
export type PreviewConsoleEntry = {
  id: number;
  level: PreviewConsoleLevel;
  message: string;
  source: string;
  time: number;
};
export type PreviewSelectionMode = "default" | "text" | "image" | "css";
export type PreviewSyncSource = "load" | "navigate" | "path_changed" | "explorer";
export type PendingPageSwitch = {
  mode: "switch" | "refresh" | "preview" | "preview_mode";
  fromPath: string;
  nextPath: string;
  source: PreviewSyncSource;
  nextPreviewMode?: "edit" | "preview";
};
export const PREVIEW_SELECTION_MODE_OPTIONS: Array<{
  value: PreviewSelectionMode;
  label: string;
}> = [
    { value: "default", label: "Default" },
    { value: "text", label: "Text" },
    { value: "image", label: "Assets" },
    { value: "css", label: "CSS" },
  ];

