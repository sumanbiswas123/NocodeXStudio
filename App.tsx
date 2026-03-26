import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";
import html2canvas from "html2canvas";
import { flushSync } from "react-dom";
import Sidebar from "./components/Sidebar";
import PropertiesPanel from "./components/PropertiesPanel";
import StyleInspectorPanel from "./components/StyleInspectorPanel";
import Terminal from "./components/Terminal";
import ColorCodeEditor from "./components/ColorCodeEditor";
import DetachedCodeEditorWindow from "./components/DetachedCodeEditorWindow";
import CommandPalette from "./components/CommandPalette";
import ConfigEditorModal from "./components/ConfigEditorModal";
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
  Tablet,
  RotateCw,
  FolderOpen,
  Globe,
  Wifi,
  Sun,
  Moon,
  FileText,
  Upload,
  Save,
  Undo2,
  Redo2,
  Settings2,
  Code2,
  Sparkles,
  Copy,
  Trash2,
  MoveUp,
  MoveDown,
  Shrink,
  Expand,
  StickyNote,
  Camera,
  FileDown,
  MousePointer2,
  Move,
} from "lucide-react";

import VibeAssistant from "./components/VibeAssistant";
import { AIPipeline } from "./utils/ai/AIPipeline";

import EditorContent from "./app/EditorContent";
import { Provider } from "react-redux";
import { store } from "./src/store";
import PdfAnnotationsOverlay from "./src/components/PdfAnnotationsOverlay";
import {
  setRecords,
  setFileName,
  setSourcePath,
  setError,
  setIsOpen,
  setIsLoading,
  setFocusedAnnotation,
  setViewMode,
  setTypeOverrides,
  setClassifierMetrics,
  addProcessingLog,
  clearProcessingLogs,
  resetState,
} from "./src/store/annotationSlice";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./src/store";
import {
  buildMappedPdfAnnotations,
  evaluateAnnotationTypeClassifier,
  PdfAnnotationRecord,
  PdfAnnotationUiRecord,
} from "./app/pdfAnnotationHelpers";
import {
  isEdaProject,
  findElementById,
  collectPathIdsToElement,
  updateElementInTree,
  deleteElementFromTree,
  normalizePath,
  PREVIEW_LAYER_ID_PREFIX,
  PREVIEW_MOUNT_PATH,
  SHARED_MOUNT_PATH,
  SHARED_MOUNT_PATH_IN_PREVIEW,
  joinPath,
  getParentPath,
  IGNORED_FOLDERS,
  THEME_STORAGE_KEY,
  PREVIEW_AUTOSAVE_STORAGE_KEY,
  AI_BACKEND_STORAGE_KEY,
  COLAB_URL_STORAGE_KEY,
  PANEL_SIDE_STORAGE_KEY,
  SHOW_AI_FEATURES,
  SHOW_SCREENSHOT_FEATURES,
  SHOW_MASTER_TOOLS,
  MAX_CANVAS_HISTORY,
  MAX_PREVIEW_HISTORY,
  MAX_PREVIEW_CONSOLE_ENTRIES,
  MAX_PREVIEW_DOC_CACHE_ENTRIES,
  MAX_PREVIEW_DOC_CACHE_CHARS,
  SHARED_FONT_VIRTUAL_DIR,
  PRESENTATION_CSS_VIRTUAL_PATH,
  FONT_CACHE_VIRTUAL_PATH,
  FONT_CACHE_VERSION,
  CONFIG_JSON_PATH,
  PORTFOLIO_CONFIG_PATH,
  ADD_TOOL_COMPONENT_PRESETS,
  ADD_TOOL_CSS_MARKER_START,
  ADD_TOOL_CSS_MARKER_END,
  ADD_TOOL_JS_MARKER_START,
  ADD_TOOL_JS_MARKER_END,
  VOID_HTML_TAGS,
  ADD_TOOL_COMPONENTS_CSS_CONTENT,
  ADD_TOOL_COMPONENTS_JS_CONTENT,
  resolveConfigPathFromFiles,
  getConfigPathCandidates,
  scoreConfigContent,
  DEFAULT_EDITOR_FONTS,
  PREVIEW_DRAW_ALLOWED_TAGS,
  normalizePreviewDrawTag,
  FontCachePayload,
  MaybeViewTransitionDocument,
  sanitizeFontFamilyName,
  dedupeFontFamilies,
  buildEditorFontOptions,
  parsePresentationCssFontFamilies,
  parseFontCacheFamilies,
  deriveFontFamilyFromFontFileName,
  fontFormatFromFileName,
  relativePathBetweenVirtualFiles,
  collectSharedFontFamiliesFromFileMap,
  inferFileType,
  isTextFileType,
  isSvgPath,
  isCodeEditableFile,
  toFileUrl,
  mimeFromType,
  toByteArray,
  isExternalUrl,
  normalizeProjectRelative,
  resolveProjectRelativePath,
  findFilePathCaseInsensitive,
  resolvePreviewNavigationPath,
  isPathWithinBase,
  toMountRelativePath,
  rewriteInlineAssetRefs,
  buildPreviewRuntimeScript,
  createPreviewDocument,
  pickDefaultHtmlFile,
  MOUNTED_PREVIEW_BRIDGE_SCRIPT,
  toCssPropertyName,
  parseNumericCssValue,
  CSS_GENERIC_FONT_FAMILIES,
  normalizeFontFamilyCssValue,
  readElementByPath,
  normalizePreviewPath,
  toPreviewLayerId,
  fromPreviewLayerId,
  parseInlineStyleText,
  extractComputedStylesFromElement,
  RESERVED_ATTRIBUTE_NAMES,
  extractCustomAttributesFromElement,
  normalizeEditorMultilineText,
  extractTextWithBreaks,
  extractTextFromHtmlFragment,
  hasRichInlineTextStructure,
  collectTextNodeGroupsByBreak,
  chooseTextSplitPoint,
  distributeTextAcrossNodes,
  applyMultilineTextToElement,
  PreviewHistoryEntry,
  addElementToTree,
  TOOLBOX_DRAG_MIME,
  hasToolboxDragType,
  getToolboxDragPayload,
  createPresetIdFactory,
  createVirtualNode,
  buildPresetElement,
  buildPresetElementV2,
  buildStandardElement,
  materializeVirtualElement,
  buildPreviewLayerTreeFromElement,
  DeviceContextMenu,
  PreviewConsoleLevel,
  PreviewConsoleEntry,
  PreviewSelectionMode,
  PreviewSyncSource,
  PendingPageSwitch,
} from "./app/appHelpers";
import { resourceScanner } from "./utils/ai/ResourceScanner";
const escapeConsoleHtml = (value: string): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const RECENT_PROJECTS_STORAGE_KEY = "nocodex_recent_projects_v1";
const PDF_ANNOTATION_CACHE_KEY = "nocodex_pdf_annotation_cache_v1";
const DEFAULT_COLAB_URL = "https://upset-hands-hope.loca.lt";
const SCREENSHOT_INDEX_FILE = "shared/screenshots/index.json";
const SCREENSHOT_DIR = "shared/screenshots";
const PDF_EXPORT_DIR = "shared/pdf_exports";

type ScreenshotMetadata = {
  id: string;
  createdAt: string;
  projectPath: string;
  slidePath: string | null;
  slideId: string | null;
  popupId: string | null;
  popupSelector: string | null;
  deviceMode: "desktop" | "mobile" | "tablet";
  tabletModel: "ipad" | "ipad-pro";
  tabletOrientation: "landscape" | "portrait";
  frameZoom: number;
  viewportWidth: number;
  viewportHeight: number;
  previewMode: "edit" | "preview";
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  imagePath: string;
  imageFileName: string;
};

type PreviewMatchedCssDeclaration = {
  property: string;
  value: string;
  important?: boolean;
  active?: boolean;
};

type PreviewMatchedCssRule = {
  selector: string;
  source: string;
  declarations: PreviewMatchedCssDeclaration[];
};

type PreviewMatchedRuleMutation = {
  selector: string;
  source: string;
  occurrenceIndex?: number;
  originalProperty?: string;
  isActive?: boolean;
};

type CssSpecificity = [number, number, number];

type CdpComputedStyleEntry = {
  name?: string;
  value?: string;
};

type CdpComputedStyleForNodeResult = {
  computedStyle?: CdpComputedStyleEntry[];
};

type CdpSpecificity = {
  a?: number;
  b?: number;
  c?: number;
};

type CdpSelector = {
  text?: string;
  specificity?: CdpSpecificity;
};

type CdpSelectorList = {
  text?: string;
  selectors?: CdpSelector[];
};

type CdpCssProperty = {
  name?: string;
  value?: string;
  important?: boolean;
  disabled?: boolean;
};

type CdpRuleStyle = {
  styleSheetId?: string;
  cssProperties?: CdpCssProperty[];
};

type CdpRule = {
  origin?: string;
  styleSheetId?: string;
  selectorList?: CdpSelectorList;
  style?: CdpRuleStyle;
};

type CdpRuleMatch = {
  rule?: CdpRule;
  matchingSelectors?: number[];
};

type CdpMatchedStylesForNodeResult = {
  matchedCSSRules?: CdpRuleMatch[];
};

type CdpInspectSelectedResponse = {
  ok?: boolean;
  matchedStyles?: CdpMatchedStylesForNodeResult;
  computedStyles?: CdpComputedStyleForNodeResult;
};

const normalizeMatchedCssProperty = (property: string) =>
  String(property || "").trim().toLowerCase();

const splitSelectorList = (selectorText: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index];
    if (quote) {
      current += char;
      if (char === quote && selectorText[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[") {
      depth += 1;
      current += char;
      continue;
    }
    if ((char === ")" || char === "]") && depth > 0) {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
};

const compareSpecificity = (
  left: CssSpecificity,
  right: CssSpecificity,
): number => {
  if (left[0] !== right[0]) return left[0] - right[0];
  if (left[1] !== right[1]) return left[1] - right[1];
  return left[2] - right[2];
};

const maxSpecificity = (
  left: CssSpecificity,
  right: CssSpecificity,
): CssSpecificity => (compareSpecificity(left, right) >= 0 ? left : right);

const addSpecificity = (
  base: CssSpecificity,
  extra: CssSpecificity,
): CssSpecificity => [base[0] + extra[0], base[1] + extra[1], base[2] + extra[2]];

const calculateSelectorSpecificity = (selectorText: string): CssSpecificity => {
  let working = String(selectorText || "");
  let specificity: CssSpecificity = [0, 0, 0];

  const functionalPseudoPattern =
    /:(is|not|has|where)\(([^()]*|\((?:[^()]*|\([^()]*\))*\))*\)/gi;
  working = working.replace(functionalPseudoPattern, (match, fnName, args) => {
    if (String(fnName).toLowerCase() === "where") return " ";
    const best = splitSelectorList(String(args || "")).reduce<CssSpecificity>(
      (current, part) =>
        maxSpecificity(current, calculateSelectorSpecificity(part)),
      [0, 0, 0],
    );
    specificity = addSpecificity(specificity, best);
    return " ";
  });

  const idMatches = working.match(/#[\w-]+/g) || [];
  specificity[0] += idMatches.length;
  working = working.replace(/#[\w-]+/g, " ");

  const classMatches = working.match(/\.[\w-]+/g) || [];
  specificity[1] += classMatches.length;
  working = working.replace(/\.[\w-]+/g, " ");

  const attributeMatches = working.match(/\[[^\]]+\]/g) || [];
  specificity[1] += attributeMatches.length;
  working = working.replace(/\[[^\]]+\]/g, " ");

  const pseudoElementMatches = working.match(/::[\w-]+/g) || [];
  specificity[2] += pseudoElementMatches.length;
  working = working.replace(/::[\w-]+/g, " ");

  const pseudoClassMatches =
    working.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) || [];
  specificity[1] += pseudoClassMatches.length;
  working = working.replace(/:(?!:)[\w-]+(?:\([^)]*\))?/g, " ");

  const elementMatches = working.match(
    /(^|[\s>+~])([a-zA-Z][\w-]*|\*)/g,
  ) || [];
  elementMatches.forEach((match) => {
    const token = match.trim();
    if (token && token !== "*") {
      specificity[2] += 1;
    }
  });

  return specificity;
};

const getMatchedSelectorSpecificity = (
  element: Element,
  selectorText: string,
): CssSpecificity =>
  splitSelectorList(selectorText).reduce<CssSpecificity>((best, selector) => {
    if (!selector) return best;
    try {
      if (!element.matches(selector)) return best;
      return maxSpecificity(best, calculateSelectorSpecificity(selector));
    } catch {
      return best;
    }
  }, [0, 0, 0]);

const annotateMatchedCssRuleActivity = (
  element: Element,
  rules: PreviewMatchedCssRule[],
): PreviewMatchedCssRule[] => {
  type Winner = {
    important: boolean;
    specificity: CssSpecificity;
    ruleIndex: number;
    declarationIndex: number;
    inline: boolean;
  };

  const winnerByProperty = new Map<string, Winner>();

  rules.forEach((rule, ruleIndex) => {
    const specificity = getMatchedSelectorSpecificity(element, rule.selector);
    rule.declarations.forEach((declaration, declarationIndex) => {
      const property = normalizeMatchedCssProperty(declaration.property);
      if (!property) return;
      const candidate: Winner = {
        important: Boolean(declaration.important),
        specificity,
        ruleIndex,
        declarationIndex,
        inline: false,
      };
      const current = winnerByProperty.get(property);
      if (!current) {
        winnerByProperty.set(property, candidate);
        return;
      }
      if (current.important !== candidate.important) {
        if (candidate.important) {
          winnerByProperty.set(property, candidate);
        }
        return;
      }
      const specificityDiff = compareSpecificity(
        candidate.specificity,
        current.specificity,
      );
      if (specificityDiff > 0) {
        winnerByProperty.set(property, candidate);
        return;
      }
      if (specificityDiff < 0) return;
      if (candidate.ruleIndex > current.ruleIndex) {
        winnerByProperty.set(property, candidate);
        return;
      }
      if (
        candidate.ruleIndex === current.ruleIndex &&
        candidate.declarationIndex > current.declarationIndex
      ) {
        winnerByProperty.set(property, candidate);
      }
    });
  });

  if (element instanceof HTMLElement) {
    const inlineStyle = element.style;
    Array.from(inlineStyle).forEach((property) => {
      const normalized = normalizeMatchedCssProperty(property);
      if (!normalized) return;
      winnerByProperty.set(normalized, {
        important: inlineStyle.getPropertyPriority(property) === "important",
        specificity: [Infinity, Infinity, Infinity],
        ruleIndex: Number.MAX_SAFE_INTEGER,
        declarationIndex: Number.MAX_SAFE_INTEGER,
        inline: true,
      });
    });
  }

  return rules.map((rule, ruleIndex) => ({
    ...rule,
    declarations: rule.declarations.map((declaration, declarationIndex) => {
      const winner = winnerByProperty.get(
        normalizeMatchedCssProperty(declaration.property),
      );
      return {
        ...declaration,
        active:
          Boolean(winner) &&
          !winner?.inline &&
          winner.ruleIndex === ruleIndex &&
          winner.declarationIndex === declarationIndex,
      };
    }),
  }));
};

const collectMatchedCssRulesFromElement = (
  element: Element | null,
): PreviewMatchedCssRule[] => {
  if (
    !element ||
    !(element instanceof Element) ||
    typeof element.matches !== "function"
  ) {
    return [];
  }

  const getSourceLabel = (sheet: CSSStyleSheet) => {
    if (sheet.href) {
      const cleanHref = String(sheet.href).split("?")[0].split("#")[0];
      const parts = cleanHref.split("/");
      return parts[parts.length - 1] || cleanHref || "stylesheet";
    }
    const ownerNode = sheet.ownerNode;
    if (ownerNode instanceof Element) {
      return (
        ownerNode.getAttribute("data-source") ||
        ownerNode.getAttribute("data-href") ||
        "inline stylesheet"
      );
    }
    return "inline stylesheet";
  };

  const results: PreviewMatchedCssRule[] = [];

  const visitRules = (rules: CSSRuleList | undefined, source: string) => {
    if (!rules) return;
    Array.from(rules).forEach((rule) => {
      try {
        const candidateRule = rule as CSSRule & {
          selectorText?: string;
          style?: CSSStyleDeclaration;
          cssRules?: CSSRuleList;
        };
        if (rule.type === 1 && candidateRule.selectorText) {
          const selector = String(candidateRule.selectorText || "").trim();
          if (!selector) return;
          try {
            if (!element.matches(selector)) return;
          } catch {
            return;
          }
          const declarations: PreviewMatchedCssDeclaration[] = [];
          Array.from(candidateRule.style || []).forEach((property) => {
            const value = candidateRule.style?.getPropertyValue(property);
            if (!property || !value) return;
            declarations.push({
              property,
              value,
              important:
                candidateRule.style?.getPropertyPriority(property) ===
                "important",
            });
          });
          if (declarations.length) {
            results.push({ selector, source, declarations });
          }
          return;
        }

        if (candidateRule.cssRules) {
          visitRules(candidateRule.cssRules, source);
        }
      } catch {
        // Ignore inaccessible or unsupported rules.
      }
    });
  };

  const doc = element.ownerDocument;
  if (!doc) return [];

  Array.from(doc.styleSheets).forEach((sheet) => {
    try {
      visitRules(
        (sheet as CSSStyleSheet).cssRules,
        getSourceLabel(sheet as CSSStyleSheet),
      );
    } catch {
      // Ignore inaccessible stylesheet rules.
    }
  });

  return annotateMatchedCssRuleActivity(element, results);
};

const getCssSourceBasename = (value: string) => {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .split("?")[0]
    .split("#")[0];
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
};

const normalizeSelectorSignature = (value: string) =>
  String(value || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCdpSpecificity = (
  specificity: CdpSpecificity | undefined,
): CssSpecificity => [
  Number(specificity?.a || 0),
  Number(specificity?.b || 0),
  Number(specificity?.c || 0),
];

const toReactComputedStylesFromCdp = (
  payload: CdpComputedStyleForNodeResult | undefined,
): React.CSSProperties | null => {
  const entries = Array.isArray(payload?.computedStyle)
    ? payload.computedStyle
    : [];
  if (entries.length === 0) return null;
  const out: Record<string, string> = {};
  entries.forEach((entry) => {
    if (!entry?.name || typeof entry.value !== "string") return;
    out[toReactName(entry.name)] = entry.value;
  });
  return out as React.CSSProperties;
};

const derivePreviewMatchedCssRulesFromCdp = (
  payload: CdpMatchedStylesForNodeResult | undefined,
  fallbackRules: PreviewMatchedCssRule[],
  inlineStyles?: React.CSSProperties | null,
): PreviewMatchedCssRule[] => {
  const matches = Array.isArray(payload?.matchedCSSRules)
    ? payload.matchedCSSRules
    : [];
  if (matches.length === 0) return [];

  const unusedFallbackIndexes = new Set(
    fallbackRules.map((_rule, index) => index),
  );

  type DerivedRule = PreviewMatchedCssRule & {
    derivedSpecificity: CssSpecificity;
    sourceOrder: number;
  };

  const derivedRules: DerivedRule[] = matches
    .map((match, matchIndex) => {
      const rule = match?.rule;
      const selectorText = String(rule?.selectorList?.text || "").trim();
      if (!selectorText) return null;

      const declarations = Array.isArray(rule?.style?.cssProperties)
        ? rule.style.cssProperties
            .filter(
              (property) =>
                property &&
                !property.disabled &&
                typeof property.name === "string" &&
                property.name.trim().length > 0 &&
                typeof property.value === "string" &&
                property.value.trim().length > 0,
            )
            .map((property) => ({
              property: String(property.name || "").trim(),
              value: String(property.value || "").trim(),
              important: Boolean(property.important),
            }))
        : [];
      if (declarations.length === 0) return null;

      const selectors = Array.isArray(rule?.selectorList?.selectors)
        ? rule.selectorList.selectors
        : [];
      const matchingSelectors =
        Array.isArray(match?.matchingSelectors) && match.matchingSelectors.length > 0
          ? match.matchingSelectors
          : selectors.map((_selector, index) => index);

      const derivedSpecificity = matchingSelectors.reduce<CssSpecificity>(
        (best, selectorIndex) => {
          const selector = selectors[selectorIndex];
          const selectorTextPart = String(selector?.text || "").trim();
          const nextSpecificity =
            selector?.specificity &&
            (selector.specificity.a !== undefined ||
              selector.specificity.b !== undefined ||
              selector.specificity.c !== undefined)
              ? normalizeCdpSpecificity(selector.specificity)
              : selectorTextPart
                ? calculateSelectorSpecificity(selectorTextPart)
                : best;
          return maxSpecificity(best, nextSpecificity);
        },
        [0, 0, 0],
      );

      let source = rule?.styleSheetId || rule?.origin || "stylesheet";
      const matchingFallbackIndex = fallbackRules.findIndex(
        (fallbackRule, fallbackIndex) =>
          unusedFallbackIndexes.has(fallbackIndex) &&
          normalizeSelectorSignature(fallbackRule.selector) ===
            normalizeSelectorSignature(selectorText),
      );
      if (matchingFallbackIndex >= 0) {
        source = fallbackRules[matchingFallbackIndex].source;
        unusedFallbackIndexes.delete(matchingFallbackIndex);
      } else {
        source = getCssSourceBasename(source) || source;
      }

      return {
        selector: selectorText,
        source,
        declarations,
        derivedSpecificity,
        sourceOrder: matchIndex,
      };
    })
    .filter(Boolean) as DerivedRule[];

  type Winner = {
    important: boolean;
    specificity: CssSpecificity;
    sourceOrder: number;
    declarationIndex: number;
    inline: boolean;
  };

  const winnerByProperty = new Map<string, Winner>();
  const applyWinnerCandidate = (property: string, candidate: Winner) => {
    const current = winnerByProperty.get(property);
    if (!current) {
      winnerByProperty.set(property, candidate);
      return;
    }
    if (current.important !== candidate.important) {
      if (candidate.important) {
        winnerByProperty.set(property, candidate);
      }
      return;
    }
    const specificityDiff = compareSpecificity(
      candidate.specificity,
      current.specificity,
    );
    if (specificityDiff > 0) {
      winnerByProperty.set(property, candidate);
      return;
    }
    if (specificityDiff < 0) return;
    if (candidate.sourceOrder > current.sourceOrder) {
      winnerByProperty.set(property, candidate);
      return;
    }
    if (
      candidate.sourceOrder === current.sourceOrder &&
      candidate.declarationIndex > current.declarationIndex
    ) {
      winnerByProperty.set(property, candidate);
    }
  };

  derivedRules.forEach((rule) => {
    rule.declarations.forEach((declaration, declarationIndex) => {
      const property = normalizeMatchedCssProperty(declaration.property);
      if (!property) return;
      applyWinnerCandidate(property, {
        important: Boolean(declaration.important),
        specificity: rule.derivedSpecificity,
        sourceOrder: rule.sourceOrder,
        declarationIndex,
        inline: false,
      });
    });
  });

  Object.keys(inlineStyles || {}).forEach((property) => {
    const cssProperty = normalizeMatchedCssProperty(toCssPropertyName(property));
    if (!cssProperty) return;
    applyWinnerCandidate(cssProperty, {
      important: false,
      specificity: [Infinity, Infinity, Infinity],
      sourceOrder: Number.MAX_SAFE_INTEGER,
      declarationIndex: Number.MAX_SAFE_INTEGER,
      inline: true,
    });
  });

  return derivedRules.map((rule) => ({
    selector: rule.selector,
    source: rule.source,
    declarations: rule.declarations.map((declaration, declarationIndex) => {
      const winner = winnerByProperty.get(
        normalizeMatchedCssProperty(declaration.property),
      );
      return {
        ...declaration,
        active:
          Boolean(winner) &&
          !winner?.inline &&
          winner.sourceOrder === rule.sourceOrder &&
          winner.declarationIndex === declarationIndex,
      };
    }),
  }));
};

const getStyleSheetSourceLabel = (sheet: CSSStyleSheet) => {
  if (sheet.href) {
    const cleanHref = String(sheet.href).split("?")[0].split("#")[0];
    const parts = cleanHref.split("/");
    return parts[parts.length - 1] || cleanHref || "stylesheet";
  }
  const ownerNode = sheet.ownerNode;
  if (ownerNode instanceof Element) {
    return (
      ownerNode.getAttribute("data-source") ||
      ownerNode.getAttribute("data-href") ||
      "inline stylesheet"
    );
  }
  return "inline stylesheet";
};

type LiveMatchedCssRuleRef = PreviewMatchedCssRule & {
  styleRule: CSSStyleRule;
};

const collectLiveMatchedCssRuleRefsFromElement = (
  element: Element | null,
): LiveMatchedCssRuleRef[] => {
  if (
    !element ||
    !(element instanceof Element) ||
    typeof element.matches !== "function"
  ) {
    return [];
  }

  const results: LiveMatchedCssRuleRef[] = [];
  const visitRules = (rules: CSSRuleList | undefined, source: string) => {
    if (!rules) return;
    Array.from(rules).forEach((rule) => {
      try {
        if (rule instanceof CSSStyleRule) {
          const selector = String(rule.selectorText || "").trim();
          if (!selector) return;
          try {
            if (!element.matches(selector)) return;
          } catch {
            return;
          }
          const declarations: PreviewMatchedCssDeclaration[] = [];
          Array.from(rule.style || []).forEach((property) => {
            const value = rule.style?.getPropertyValue(property);
            if (!property || !value) return;
            declarations.push({
              property,
              value,
              important: rule.style?.getPropertyPriority(property) === "important",
            });
          });
          if (declarations.length > 0) {
            results.push({
              selector,
              source,
              declarations,
              styleRule: rule,
            });
          }
          return;
        }
        const nestedRule = rule as CSSRule & { cssRules?: CSSRuleList };
        if (nestedRule.cssRules) {
          visitRules(nestedRule.cssRules, source);
        }
      } catch {
        // Ignore inaccessible or unsupported rules.
      }
    });
  };

  const doc = element.ownerDocument;
  if (!doc) return [];

  Array.from(doc.styleSheets).forEach((sheet) => {
    try {
      visitRules(
        (sheet as CSSStyleSheet).cssRules,
        getStyleSheetSourceLabel(sheet as CSSStyleSheet),
      );
    } catch {
      // Ignore inaccessible stylesheet rules.
    }
  });

  return results;
};

const cssRuleSourcesMatch = (left: string, right: string) => {
  const normalizedLeft = normalizeProjectRelative(String(left || "")).toLowerCase();
  const normalizedRight = normalizeProjectRelative(String(right || "")).toLowerCase();
  if (normalizedLeft && normalizedRight && normalizedLeft === normalizedRight) {
    return true;
  }
  const baseLeft = getCssSourceBasename(left).toLowerCase();
  const baseRight = getCssSourceBasename(right).toLowerCase();
  return Boolean(baseLeft && baseRight && baseLeft === baseRight);
};

const extractAssetUrlFromCssValue = (raw: string) => {
  const text = String(raw || "").trim();
  if (!text) return "";
  const match = text.match(/url\((['"]?)(.*?)\1\)/i);
  if (!match?.[2]) return "";
  return match[2].trim();
};

const applyPatchToDeclarationEntries = (
  declarations: PreviewMatchedCssDeclaration[],
  rule: PreviewMatchedRuleMutation,
  styles: Partial<React.CSSProperties>,
): PreviewMatchedCssDeclaration[] => {
  const nextDeclarations = [...declarations];
  const normalizedNextKeys = new Set<string>();
  const originalCssProperty = rule.originalProperty
    ? toCssPropertyName(rule.originalProperty)
    : "";

  Object.entries(styles).forEach(([key, rawValue]) => {
    const cssProperty = toCssPropertyName(key);
    const valueRaw =
      rawValue === undefined || rawValue === null ? "" : String(rawValue);
    const value =
      cssProperty === "font-family"
        ? normalizeFontFamilyCssValue(valueRaw)
        : valueRaw;
    normalizedNextKeys.add(cssProperty.toLowerCase());
    const existingIndex = nextDeclarations.findIndex(
      (entry) => entry.property.toLowerCase() === cssProperty.toLowerCase(),
    );
    if (!value) {
      if (existingIndex >= 0) nextDeclarations.splice(existingIndex, 1);
      return;
    }
    if (existingIndex >= 0) {
      nextDeclarations[existingIndex] = {
        ...nextDeclarations[existingIndex],
        property: cssProperty,
        value,
      };
      return;
    }
    nextDeclarations.push({
      property: cssProperty,
      value,
    });
  });

  if (
    originalCssProperty &&
    !normalizedNextKeys.has(originalCssProperty.toLowerCase())
  ) {
    const originalIndex = nextDeclarations.findIndex(
      (entry) =>
        entry.property.toLowerCase() === originalCssProperty.toLowerCase(),
    );
    if (originalIndex >= 0) {
      nextDeclarations.splice(originalIndex, 1);
    }
  }

  return nextDeclarations;
};

const findMatchingCssBrace = (source: string, openIndex: number) => {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let inComment = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === inString) inString = null;
      continue;
    }
    if (char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const findCssRuleRange = (
  source: string,
  selector: string,
  occurrenceIndex = 0,
) => {
  const normalizedSelector = normalizeSelectorSignature(selector);
  let currentOccurrence = 0;
  let segmentStart = 0;
  let inString: '"' | "'" | null = null;
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === inString) inString = null;
      continue;
    }
    if (char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if (char === ";") {
      segmentStart = index + 1;
      continue;
    }
    if (char === "}") {
      segmentStart = index + 1;
      continue;
    }
    if (char !== "{") continue;

    const rawHeader = source.slice(segmentStart, index);
    const headerText = rawHeader.trim();
    if (
      headerText &&
      !headerText.startsWith("@") &&
      normalizeSelectorSignature(headerText) === normalizedSelector
    ) {
      if (currentOccurrence === occurrenceIndex) {
        const closeIndex = findMatchingCssBrace(source, index);
        if (closeIndex < 0) return null;
        const leadingWhitespace = rawHeader.match(/^\s*/)?.[0] || "";
        return {
          start: segmentStart,
          end: closeIndex + 1,
          selectorText: headerText,
          indent: leadingWhitespace,
          body: source.slice(index + 1, closeIndex),
        };
      }
      currentOccurrence += 1;
    }

    segmentStart = index + 1;
  }

  return null;
};
const ANNOTATION_INTENT_OPTIONS = [
  "stylingChange",
  "textualChange",
  "textInImage",
  "notFound",
  "referenceChange",
  "assetChange",
  "flowChange",
  "piChange",
  "siChange",
];

const extractAssetSourceFromElement = (element: VirtualElement | null) => {
  if (!element) return "";
  if (typeof element.src === "string" && element.src.trim()) {
    return element.src.trim();
  }
  const backgroundImage =
    typeof element.styles?.backgroundImage === "string"
      ? String(element.styles.backgroundImage)
      : "";
  const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ? match[2] : "";
};

const ALLOW_POPUP_OPEN_FROM_PDF = false;

const resolvePreviewImagePath = (path: string) => path;

const App: React.FC = () => {
  // --- Redux Dispatch Setup ---
  const dispatch = useDispatch();
  const {
    records: pdfAnnotationRecords,
    fileName: pdfAnnotationFileName,
    sourcePath: pdfAnnotationSourcePath,
    error: pdfAnnotationError,
    isOpen: isPdfAnnotationPanelOpen,
    isLoading: isPdfAnnotationLoading,
    focusedAnnotation: focusedPdfAnnotation,
    viewMode: pdfAnnotationViewMode,
    typeFilter: pdfAnnotationTypeFilter,
    typeOverrides: pdfAnnotationTypeOverrides,
    classifierMetrics: pdfAnnotationClassifierMetrics,
    processingLogs: pdfAnnotationProcessingLogs,
  } = useSelector((state: RootState) => state.annotations);

  // --- Neutralino Setup ---
  useEffect(() => {
    Neutralino.events.on("ready", () =>
      console.log("Neutralino functionality is ready."),
    );
  }, []);

  // --- State ---
  const [root, setRoot] = useState<VirtualElement>(INITIAL_ROOT);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalInitialTab, setConfigModalInitialTab] = useState<
    "references" | "slides" | "configRaw"
  >("references");
  const [isConfigModalSlidesOnly, setIsConfigModalSlidesOnly] = useState(false);
  const [configModalConfigPath, setConfigModalConfigPath] = useState<
    string | null
  >(null);
  const [configModalPortfolioPath, setConfigModalPortfolioPath] = useState<
    string | null
  >(null);
  const [selectedFolderCloneSource, setSelectedFolderCloneSource] = useState<
    string | null
  >(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: INITIAL_ROOT,
    future: [],
  });
  const [files, setFiles] = useState<FileMap>({});
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed
            .filter((entry) => typeof entry === "string" && entry.trim())
            .slice(0, 5)
        : [];
    } catch {
      return [];
    }
  });
  const [previewMountBasePath, setPreviewMountBasePath] = useState<
    string | null
  >(null);
  const [isPreviewMountReady, setIsPreviewMountReady] = useState(false);
  const [activeFile, setActiveFileRaw] = useState<string | null>(null);
  const setActiveFile = useCallback(
    (path: string | null | ((prev: string | null) => string | null)) => {
      setActiveFileRaw((prev) => {
        const next = typeof path === "function" ? path(prev) : path;
        console.log("[DEBUG] activeFile changing from", prev, "to", next);
        return next;
      });
    },
    [],
  );
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
  const [isCompactConsoleOpening, setIsCompactConsoleOpening] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
  const [isDetachedEditorOpen, setIsDetachedEditorOpen] = useState(false);
  const [isStyleInspectorSectionOpen, setIsStyleInspectorSectionOpen] =
    useState(true);
  const [bottomPanelTab, setBottomPanelTab] = useState<"terminal" | "console">(
    "terminal",
  );
  const [codeDraftByPath, setCodeDraftByPath] = useState<
    Record<string, string>
  >({});
  const [codeDirtyPathSet, setCodeDirtyPathSet] = useState<
    Record<string, true>
  >({});
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
  const [panelSide, setPanelSide] = useState<"default" | "swapped">(() => {
    try {
      return localStorage.getItem(PANEL_SIDE_STORAGE_KEY) === "swapped"
        ? "swapped"
        : "default";
    } catch {
      return "default";
    }
  });
  const isPanelsSwapped = panelSide === "swapped";
  const [aiBackend, setAiBackend] = useState<"local" | "colab">(() => {
    try {
      const saved = localStorage.getItem(AI_BACKEND_STORAGE_KEY);
      return (saved as "local" | "colab") || "local";
    } catch {
      return "local";
    }
  });
  const [colabUrl, setColabUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(COLAB_URL_STORAGE_KEY) || DEFAULT_COLAB_URL;
    } catch {
      return DEFAULT_COLAB_URL;
    }
  });
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const [dirtyPathKeysByFile, setDirtyPathKeysByFile] = useState<
    Record<string, string[]>
  >({});
  // PDF Annotation local states removed and managed by Redux.

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
  const [previewFrameLoadNonce, setPreviewFrameLoadNonce] = useState(0);
  const [frameZoom, setFrameZoom] = useState<50 | 75 | 100>(100);
  const [deviceCtxMenu, setDeviceCtxMenu] = useState<{
    type: "mobile" | "desktop" | "tablet";
    x: number;
    y: number;
  } | null>(null);

  const [isVibeAssistantOpen, setIsVibeAssistantOpen] = useState(false);
  const [vibeErrorContext, setVibeErrorContext] = useState<
    string | undefined
  >();

  // Use a ref to track if a vibe update was just applied to handle errors
  const lastVibeUpdateRef = useRef<number>(0);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<"inspector" | "gallery">(
    "inspector",
  );
  const [isScreenshotGalleryOpen, setIsScreenshotGalleryOpen] = useState(false);
  const [screenshotItems, setScreenshotItems] = useState<ScreenshotMetadata[]>(
    [],
  );
  const [screenshotPreviewUrls, setScreenshotPreviewUrls] = useState<
    Record<string, string>
  >({});
  const [screenshotCaptureBusy, setScreenshotCaptureBusy] = useState(false);
  const [screenshotSessionRestore, setScreenshotSessionRestore] = useState<{
    leftOpen: boolean;
    rightOpen: boolean;
    rightMode: "inspector" | "gallery";
  } | null>(null);
  const [pdfExportLogs, setPdfExportLogs] = useState<string[]>([]);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isToolboxDragging, setIsToolboxDragging] = useState(false);
  const toolboxDragTypeRef = useRef("");
  const [pendingPageSwitch, setPendingPageSwitch] =
    useState<PendingPageSwitch | null>(null);

  const readPdfAnnotationCache = useCallback(() => {
    try {
      const raw = localStorage.getItem(PDF_ANNOTATION_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        version: number;
        projects: Record<
          string,
          {
            lastPdfPath: string | null;
            entries: Record<
              string,
              {
                fileName: string;
                records: PdfAnnotationUiRecord[];
                storedAt: number;
              }
            >;
          }
        >;
      };
      if (!parsed || parsed.version !== 2) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const writePdfAnnotationCache = useCallback(
    (
      projectKey: string,
      pdfPath: string,
      fileName: string,
      records: PdfAnnotationUiRecord[],
    ) => {
      try {
        const existing = readPdfAnnotationCache() || {
          version: 1,
          projects: {},
        };
        const nextProjects = { ...existing.projects };
        const projectEntry = nextProjects[projectKey] || {
          lastPdfPath: null,
          entries: {},
        };
        projectEntry.lastPdfPath = pdfPath;
        projectEntry.entries = {
          ...projectEntry.entries,
          [pdfPath]: {
            fileName,
            records,
            storedAt: Date.now(),
          },
        };
        nextProjects[projectKey] = projectEntry;
        localStorage.setItem(
          PDF_ANNOTATION_CACHE_KEY,
          JSON.stringify({ version: 2, projects: nextProjects }),
        );
      } catch {
        // Ignore storage errors.
      }
    },
    [readPdfAnnotationCache],
  );
  const [isPageSwitchPromptOpen, setIsPageSwitchPromptOpen] = useState(false);
  const [isPageSwitchPromptBusy, setIsPageSwitchPromptBusy] = useState(false);
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
  const [previewSelectedMatchedCssRules, setPreviewSelectedMatchedCssRules] =
    useState<PreviewMatchedCssRule[]>([]);
  const [propertiesPanelRequestedTab, setPropertiesPanelRequestedTab] =
    useState<"content" | "style" | "advanced" | null>(null);
  const [
    propertiesPanelRequestedTabNonce,
    setPropertiesPanelRequestedTabNonce,
  ] = useState(0);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const previewFocusedPdfElementRef = useRef<HTMLElement | null>(null);
  const [previewSelectionBox, setPreviewSelectionBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [quickTextEdit, setQuickTextEdit] = useState<{
    open: boolean;
    x: number;
    y: number;
  }>({ open: false, x: 0, y: 0 });
  const quickTextEditRef = useRef<HTMLDivElement | null>(null);
  const quickTextRangeRef = useRef<Range | null>(null);
  const lastAutoAssetReplaceKeyRef = useRef<string | null>(null);
  const QUICK_TEXT_PANEL_WIDTH = 320;
  const QUICK_TEXT_PANEL_HEIGHT = 220;
  const showQuickTextEdit = useCallback((x: number, y: number) => {
    setQuickTextEdit({ open: true, x, y });
  }, []);
  const hideQuickTextEdit = useCallback(() => {
    setQuickTextEdit((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, []);
  const positionQuickTextEditAtRange = useCallback(
    (range: Range) => {
      const frame = previewFrameRef.current;
      if (!frame) return;
      const rect = range.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        hideQuickTextEdit();
        return;
      }
      const frameRect = frame.getBoundingClientRect();
      const spacing = 12;
      const rightX = frameRect.left + rect.right + spacing;
      const leftX =
        frameRect.left + rect.left - QUICK_TEXT_PANEL_WIDTH - spacing;
      let nextX = rightX;
      if (nextX + QUICK_TEXT_PANEL_WIDTH > frameRect.right - spacing) {
        nextX = leftX;
      }
      nextX = Math.max(
        frameRect.left + spacing,
        Math.min(nextX, frameRect.right - QUICK_TEXT_PANEL_WIDTH - spacing),
      );
      const nextY = Math.max(
        frameRect.top + spacing,
        Math.min(
          frameRect.top + rect.top,
          frameRect.bottom - QUICK_TEXT_PANEL_HEIGHT - spacing,
        ),
      );
      showQuickTextEdit(nextX, nextY);
    },
    [hideQuickTextEdit, showQuickTextEdit],
  );
  const [isPreviewResizing, setIsPreviewResizing] = useState(false);
  const previewResizeDragRef = useRef<{
    path: number[];
    target: HTMLElement;
    direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
    scaleX: number;
    scaleY: number;
    canMoveLeft: boolean;
    canMoveTop: boolean;
  } | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [rightPanelWidth, setRightPanelWidth] = useState(264);
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
  const [rightPanelFloatingPosition, setRightPanelFloatingPosition] = useState({
    left: 0,
    top: 96,
  });
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
  const configModalConfigPathRef = useRef<string | null>(null);
  const configModalPortfolioPathRef = useRef<string | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const selectedPreviewHtmlRef = useRef<string | null>(null);
  const interactionModeRef = useRef<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >("edit");
  const previewModeRef = useRef<"edit" | "preview">("preview");
  const zenRestoreRef = useRef<{
    isLeftPanelOpen: boolean;
    isRightPanelOpen: boolean;
    showTerminal: boolean;
    isCodePanelOpen: boolean;
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
  const rightPanelResizeStartXRef = useRef(0);
  const rightPanelResizeStartWidthRef = useRef(264);
  const rightPanelPendingWidthRef = useRef(264);
  const rightPanelResizeRafRef = useRef<number | null>(null);
  const rightPanelDragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    left: number;
    top: number;
  } | null>(null);
  const [isDraggingRightPanel, setIsDraggingRightPanel] = useState(false);
  const rightPanelManualClosedRef = useRef(false);
  const lastEditSelectionRef = useRef<string | null>(null);
  const rightPanelRestorePendingRef = useRef(false);
  const lastPanelDprRef = useRef<number | null>(null);
  const pendingPopupOpenRef = useRef<{
    selector: string | null;
    popupId: string | null;
  } | null>(null);
  const codePanelRestoreRef = useRef<{
    isLeftPanelOpen: boolean;
    isRightPanelOpen: boolean;
    showTerminal: boolean;
  } | null>(null);
  const previewConsoleSeqRef = useRef(0);
  const previewConsoleBufferRef = useRef<PreviewConsoleEntry[]>([]);
  const previewConsoleFlushTimerRef = useRef<number | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const bottomPanelRef = useRef<HTMLDivElement | null>(null);
  const detachedConsoleWindowRef = useRef<Window | null>(null);
  const isRefreshingFilesRef = useRef(false);
  const saveCodeDraftsRef = useRef<(() => Promise<void>) | null>(null);
  const pendingPreviewWritesRef = useRef<Record<string, string>>({});
  const codeDraftByPathRef = useRef<Record<string, string>>({});
  const codeDirtyPathSetRef = useRef<Record<string, true>>({});
  const dirtyFilesRef = useRef<string[]>([]);
  const lastAutoDprZoomRef = useRef<50 | 75 | 100>(100);
  const previewHistoryRef = useRef<Record<string, PreviewHistoryEntry>>({});
  const previewDocCacheRef = useRef<Record<string, string>>({});
  const previewDocCacheOrderRef = useRef<string[]>([]);
  const autoSaveTimerRef = useRef<number | null>(null);
  const inlineEditDraftTimerRef = useRef<number | null>(null);
  const inlineEditDraftPendingRef = useRef<{
    filePath: string;
    elementPath: number[];
    html: string;
  } | null>(null);
  const previewStyleDraftPendingRef = useRef<{
    filePath: string;
    elementPath: number[];
    styles: Partial<React.CSSProperties>;
  } | null>(null);
  const previewLocalCssDraftPendingRef = useRef<{
    elementPath: number[];
    rule: PreviewMatchedRuleMutation;
    styles: Partial<React.CSSProperties>;
  } | null>(null);
  const applyPreviewDropCreateRef = useRef<
    ((type: string, clientX: number, clientY: number) => Promise<void>) | null
  >(null);
  const explorerSelectionLockRef = useRef<string | null>(null);
  const explorerSelectionLockUntilRef = useRef<number>(0);
  const themeTransitionInFlightRef = useRef(false);
  const lastPreviewPageSignalRef = useRef<{ path: string; at: number } | null>(
    null,
  );
  const previewStyleDraftTimerRef = useRef<number | null>(null);
  const previewLocalCssDraftTimerRef = useRef<number | null>(null);
  const BASE_STAGE_PADDING = 40;
  const EXPLORER_LOCK_TTL_MS = 6000;
  const LEFT_PANEL_MIN_WIDTH = 220;
  const LEFT_PANEL_MAX_WIDTH = 520;
  const LEFT_PANEL_STRETCHED_WIDTH = 360;
  const LEFT_PANEL_COLLAPSED_WIDTH = 48;
  const RIGHT_PANEL_MIN_WIDTH = 264;
  const RIGHT_PANEL_MAX_WIDTH = 640;
  const CODE_PANEL_WIDTH = 620;

  const requestPropertiesPanelTab = useCallback(
    (tab: "content" | "style" | "advanced") => {
      setPropertiesPanelRequestedTab(tab);
      setPropertiesPanelRequestedTabNonce((prev) => prev + 1);
    },
    [],
  );

  const getDefaultRightPanelPosition = useCallback((width: number) => {
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 900;
    return {
      left: Math.max(8, viewportWidth - width - 40),
      top: Math.max(56, Math.min(96, viewportHeight - 160)),
    };
  }, []);

  useEffect(() => {
    setRightPanelFloatingPosition((prev) => {
      if (prev.left > 0) return prev;
      const next = getDefaultRightPanelPosition(rightPanelWidth);
      return {
        left: next.left,
        top: prev.top,
      };
    });
  }, [getDefaultRightPanelPosition, rightPanelWidth]);
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

  const invalidatePreviewDocCache = useCallback((path: string) => {
    if (!path) return;
    delete previewDocCacheRef.current[path];
    previewDocCacheOrderRef.current = previewDocCacheOrderRef.current.filter(
      (item) => item !== path,
    );
  }, []);

  const invalidatePreviewDocsForDependency = useCallback(
    (dependencyPath: string) => {
      const normalizedDependency = normalizeProjectRelative(
        dependencyPath || "",
      ).toLowerCase();
      if (!normalizedDependency) return;
      Object.entries(previewDependencyIndexRef.current).forEach(
        ([previewPath, dependencies]) => {
          if (
            dependencies.some(
              (dependency) =>
                normalizeProjectRelative(dependency || "").toLowerCase() ===
                normalizedDependency,
            )
          ) {
            invalidatePreviewDocCache(previewPath);
          }
        },
      );
    },
    [invalidatePreviewDocCache],
  );

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
  const rightOverlayInset = bothPanelsOpen ? rightPanelWidth : 0;
  const floatingHorizontalInset =
    isFloatingPanels && deviceMode !== "mobile"
      ? (isLeftPanelOpen ? leftPanelWidth : 0) +
        (isRightPanelOpen ? rightPanelWidth : 0)
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
      if (inlineEditDraftTimerRef.current !== null) {
        window.clearTimeout(inlineEditDraftTimerRef.current);
      }
    };
  }, [revokeBinaryAssetUrls]);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);
  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);
  useEffect(() => {
    previewModeRef.current = previewMode;
  }, [previewMode]);
  useEffect(() => {
    codeDraftByPathRef.current = codeDraftByPath;
  }, [codeDraftByPath]);
  useEffect(() => {
    codeDirtyPathSetRef.current = codeDirtyPathSet;
  }, [codeDirtyPathSet]);
  useEffect(() => {
    dirtyFilesRef.current = dirtyFiles;
  }, [dirtyFiles]);
  useEffect(() => {
    configModalConfigPathRef.current = configModalConfigPath;
  }, [configModalConfigPath]);
  useEffect(() => {
    configModalPortfolioPathRef.current = configModalPortfolioPath;
  }, [configModalPortfolioPath]);

  const setActiveFileStable = useCallback((nextPath: string | null) => {
    activeFileRef.current = nextPath;
    setActiveFile((prev) => (prev === nextPath ? prev : nextPath));
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
            content =
              typeof loaded === "string" ? loaded : String(loaded || "");
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
          console.warn(
            `Failed loading file content for ${relativePath}:`,
            error,
          );
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

    // GUARD: Ignore common system/bridge files that cause sync loops
    const lower = path.toLowerCase();
    if (
      lower.includes("shared/index.html") ||
      lower.includes("__bridge.html") ||
      lower.includes("vibe-bridge.html")
    ) {
      return false;
    }

    const now = Date.now();
    const last = lastPreviewPageSignalRef.current;
    if (last && last.path === path && now - last.at < 700) {
      return false;
    }
    lastPreviewPageSignalRef.current = { path, at: now };
    return true;
  }, []);
  const hasUnsavedChangesForFile = useCallback(
    (path: string | null): boolean => {
      if (!path) return false;
      if (typeof pendingPreviewWritesRef.current[path] === "string")
        return true;
      if (typeof codeDraftByPathRef.current[path] === "string") return true;
      if (codeDirtyPathSetRef.current[path]) return true;
      return dirtyFilesRef.current.includes(path);
    },
    [],
  );
  const commitPreviewActiveFileSync = useCallback(
    (nextPath: string, source: PreviewSyncSource) => {
      if (!nextPath) return;
      setPreviewSyncedFile((prev) => (prev === nextPath ? prev : nextPath));
      if (source === "navigate" || source === "explorer") {
        setPreviewNavigationFile((prev) =>
          prev === nextPath ? prev : nextPath,
        );
      }

      if (activeFileRef.current === nextPath) {
        if (
          interactionModeRef.current !== "preview" &&
          (source === "load" || source === "path_changed")
        ) {
          setInteractionMode("preview");
        }
        return;
      }

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
  const syncPreviewActiveFile = useCallback(
    (
      nextPath: string,
      source: PreviewSyncSource,
      options?: { skipUnsavedPrompt?: boolean },
    ) => {
      if (!nextPath) return;
      const currentPath = selectedPreviewHtmlRef.current;
      const nextFile = filesRef.current[nextPath];
      const shouldPrompt =
        !options?.skipUnsavedPrompt &&
        source !== "load" &&
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        Boolean(currentPath) &&
        currentPath !== nextPath &&
        nextFile?.type === "html" &&
        hasUnsavedChangesForFile(currentPath);
      if (shouldPrompt && currentPath) {
        setPendingPageSwitch({
          mode: "switch",
          fromPath: currentPath,
          nextPath,
          source,
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      commitPreviewActiveFileSync(nextPath, source);
    },
    [commitPreviewActiveFileSync, hasUnsavedChangesForFile],
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
    try {
      localStorage.setItem(
        RECENT_PROJECTS_STORAGE_KEY,
        JSON.stringify(recentProjects.slice(0, 5)),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [recentProjects]);
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
      if (previewStyleDraftTimerRef.current !== null) {
        window.clearTimeout(previewStyleDraftTimerRef.current);
      }
      if (previewLocalCssDraftTimerRef.current !== null) {
        window.clearTimeout(previewLocalCssDraftTimerRef.current);
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
    appRootRef.current.style.setProperty(
      "--right-panel-width",
      `${rightPanelWidth}px`,
    );
  }, [leftPanelWidth, rightPanelWidth]);

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

  useEffect(() => {
    if (!isResizingRightPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = rightPanelResizeStartXRef.current - event.clientX;
      rightPanelPendingWidthRef.current = Math.min(
        RIGHT_PANEL_MAX_WIDTH,
        Math.max(
          RIGHT_PANEL_MIN_WIDTH,
          rightPanelResizeStartWidthRef.current + delta,
        ),
      );
      if (rightPanelResizeRafRef.current !== null) return;
      rightPanelResizeRafRef.current = requestAnimationFrame(() => {
        rightPanelResizeRafRef.current = null;
        if (appRootRef.current) {
          appRootRef.current.style.setProperty(
            "--right-panel-width",
            `${rightPanelPendingWidthRef.current}px`,
          );
        }
      });
    };

    const onMouseUp = () => {
      if (rightPanelResizeRafRef.current !== null) {
        cancelAnimationFrame(rightPanelResizeRafRef.current);
        rightPanelResizeRafRef.current = null;
      }
      setRightPanelWidth(rightPanelPendingWidthRef.current);
      setIsResizingRightPanel(false);
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
  }, [isResizingRightPanel]);

  useEffect(() => {
    if (!isDraggingRightPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const start = rightPanelDragStartRef.current;
      if (!start) return;
      const viewportWidth =
        typeof window !== "undefined" ? window.innerWidth : 1440;
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 900;
      const nextLeft = Math.max(
        8,
        Math.min(
          Math.max(8, viewportWidth - rightPanelWidth - 8),
          start.left + (event.clientX - start.pointerX),
        ),
      );
      const nextTop = Math.max(
        56,
        Math.min(
          Math.max(56, viewportHeight - 140),
          start.top + (event.clientY - start.pointerY),
        ),
      );
      setRightPanelFloatingPosition({ left: nextLeft, top: nextTop });
    };

    const onMouseUp = () => {
      rightPanelDragStartRef.current = null;
      setIsDraggingRightPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDraggingRightPanel, rightPanelWidth]);

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
  const handleLeftPanelStretchToggle = useCallback(() => {
    setLeftPanelWidth((prev) =>
      prev >= LEFT_PANEL_STRETCHED_WIDTH ? 256 : LEFT_PANEL_STRETCHED_WIDTH,
    );
  }, []);

  const handleRightPanelResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isRightPanelOpen) return;
      event.preventDefault();
      rightPanelResizeStartXRef.current = event.clientX;
      rightPanelResizeStartWidthRef.current = rightPanelWidth;
      rightPanelPendingWidthRef.current = rightPanelWidth;
      setIsResizingRightPanel(true);
    },
    [isRightPanelOpen, rightPanelWidth],
  );

  const handleRightPanelDragStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isFloatingPanels || !isRightPanelOpen) return;
      if (
        (event.target as HTMLElement).closest("button, input, select, textarea")
      ) {
        return;
      }
      event.preventDefault();
      rightPanelDragStartRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: rightPanelFloatingPosition.left,
        top: rightPanelFloatingPosition.top,
      };
      setIsDraggingRightPanel(true);
    },
    [isFloatingPanels, isRightPanelOpen, rightPanelFloatingPosition],
  );

  // --- History Management ---
  const pushHistory = useCallback((newState: VirtualElement) => {
    setHistory((curr) => ({
      past: [...curr.past.slice(-(MAX_CANVAS_HISTORY - 1)), curr.present],
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
        past: [...curr.past.slice(-(MAX_CANVAS_HISTORY - 1)), curr.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);
  const pushPreviewHistory = useCallback(
    (filePath: string, nextHtml: string, previousHtml?: string) => {
      const current = previewHistoryRef.current[filePath];
      if (!current) {
        const baseline = typeof previousHtml === "string" ? previousHtml : "";
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

    dirtyFilesRef.current = dirtyFilesRef.current.filter(
      (path) => !savedPaths.includes(path),
    );
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
  const discardUnsavedChangesForFile = useCallback(
    async (path: string) => {
      if (!path) return;
      const hadCodeDraft =
        typeof codeDraftByPath[path] === "string" ||
        Boolean(codeDirtyPathSet[path]);
      if (hadCodeDraft) {
        delete codeDraftByPathRef.current[path];
        delete codeDirtyPathSetRef.current[path];
        setCodeDraftByPath((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setCodeDirtyPathSet((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
      const hadPreviewDraft =
        typeof pendingPreviewWritesRef.current[path] === "string";
      if (!hadPreviewDraft) {
        if (hadCodeDraft) {
          dirtyFilesRef.current = dirtyFilesRef.current.filter(
            (entry) => entry !== path,
          );
          setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
        }
        return;
      }

      const absolutePath = filePathIndexRef.current[path];
      if (!absolutePath) return;
      let diskContent = "";
      try {
        diskContent = await (Neutralino as any).filesystem.readFile(
          absolutePath,
        );
      } catch (error) {
        console.warn(`Failed discarding unsaved changes for ${path}:`, error);
        window.alert("Could not discard changes. Please try again.");
        return;
      }

      delete pendingPreviewWritesRef.current[path];
      textFileCacheRef.current[path] = diskContent;
      setFiles((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        return {
          ...prev,
          [path]: {
            ...existing,
            content: diskContent,
          },
        };
      });
      dirtyFilesRef.current = dirtyFilesRef.current.filter(
        (entry) => entry !== path,
      );
      setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
      setDirtyPathKeysByFile((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      previewHistoryRef.current[path] = {
        past: [],
        present: diskContent,
        future: [],
      };
      invalidatePreviewDocCache(path);

      const currentEntry = filesRef.current[path];
      if (currentEntry) {
        const previewSnapshot: FileMap = {
          ...filesRef.current,
          [path]: {
            ...currentEntry,
            content: diskContent,
          },
        };
        const previewDoc = createPreviewDocument(
          previewSnapshot,
          path,
          previewDependencyIndexRef.current[path],
        );
        cachePreviewDoc(path, previewDoc);
        if (selectedPreviewHtmlRef.current === path) {
          setSelectedPreviewDoc(previewDoc);
          setPreviewRefreshNonce((prev) => prev + 1);
        }
      }
    },
    [
      cachePreviewDoc,
      codeDirtyPathSet,
      codeDraftByPath,
      invalidatePreviewDocCache,
    ],
  );
  const requestPreviewRefreshWithUnsavedGuard = useCallback(() => {
    const candidate =
      previewSyncedFile && filesRef.current[previewSyncedFile]?.type === "html"
        ? previewSyncedFile
        : selectedPreviewHtmlRef.current &&
            filesRef.current[selectedPreviewHtmlRef.current]?.type === "html"
          ? selectedPreviewHtmlRef.current
          : null;
    if (!candidate) {
      setPreviewRefreshNonce((prev) => prev + 1);
      return;
    }
    if (hasUnsavedChangesForFile(candidate)) {
      setPendingPageSwitch({
        mode: "refresh",
        fromPath: candidate,
        nextPath: candidate,
        source: "navigate",
      });
      setIsPageSwitchPromptOpen(true);
      return;
    }
    setPreviewNavigationFile((prev) => (prev === candidate ? prev : candidate));
    setPreviewRefreshNonce((prev) => prev + 1);
  }, [hasUnsavedChangesForFile, previewSyncedFile]);
  const handleOpenConfigModal = useCallback(() => {
    setConfigModalInitialTab("references");
    setIsConfigModalSlidesOnly(false);
    if (!projectPath) {
      setConfigModalConfigPath(null);
      setConfigModalPortfolioPath(null);
      setIsConfigModalOpen(true);
      return;
    }
    const pickBestPath = async (
      suffix: "config.json" | "portfolioconfig.json",
      kind: "config" | "portfolio",
    ): Promise<string> => {
      const candidates = getConfigPathCandidates(filesRef.current, suffix);
      const fallback =
        resolveConfigPathFromFiles(filesRef.current, suffix) ||
        (suffix === "config.json" ? CONFIG_JSON_PATH : PORTFOLIO_CONFIG_PATH);
      if (candidates.length === 0) return fallback;

      let bestPath = fallback;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const path of candidates) {
        const loaded = await loadFileContent(path, { persistToState: true });
        const score = scoreConfigContent(String(loaded || ""), kind);
        console.info("[ConfigModal] Candidate score", { kind, path, score });
        if (score > bestScore) {
          bestScore = score;
          bestPath = path;
        }
      }
      return bestPath;
    };

    void (async () => {
      const [configPath, portfolioPath] = await Promise.all([
        pickBestPath("config.json", "config"),
        pickBestPath("portfolioconfig.json", "portfolio"),
      ]);
      const refineConfigPath = async (initialPath: string | null) => {
        if (!initialPath) return initialPath;
        const initialContent = await loadFileContent(initialPath, {
          persistToState: true,
        });
        const initialScore = scoreConfigContent(
          String(initialContent || ""),
          "config",
        );
        if (initialScore >= 20) return initialPath;
        const pattern = /(^|\/)(?:mtconfig|config)\.(?:js|json)$/i;
        const candidates = Object.keys(filesRef.current).filter((path) =>
          pattern.test(path),
        );
        let bestPath = initialPath;
        let bestScore = initialScore;
        for (const candidate of candidates) {
          const loaded = await loadFileContent(candidate, {
            persistToState: false,
          });
          const score = scoreConfigContent(String(loaded || ""), "config");
          if (score > bestScore) {
            bestScore = score;
            bestPath = candidate;
          }
        }
        return bestPath;
      };
      const refinedConfigPath = await refineConfigPath(configPath);
      setConfigModalConfigPath(refinedConfigPath);
      setConfigModalPortfolioPath(portfolioPath);
      console.groupCollapsed("[ConfigModal] Open");
      console.info("[ConfigModal] Chosen config path:", refinedConfigPath);
      console.info("[ConfigModal] Chosen portfolio path:", portfolioPath);
      console.groupEnd();
      await Promise.all([
        refinedConfigPath
          ? loadFileContent(refinedConfigPath, { persistToState: true })
          : Promise.resolve(),
        loadFileContent(portfolioPath, { persistToState: true }),
      ]);
      for (const [path, entry] of Object.entries(filesRef.current)) {
        if (
          entry?.type === "image" &&
          /(^|\/)thumb\.(png|jpg|jpeg|webp|gif|svg)$/i.test(path)
        ) {
          void loadFileContent(path, { persistToState: true });
        }
      }
      setIsConfigModalOpen(true);
    })();
  }, [loadFileContent, projectPath]);
  const handleChooseFolderCloneSource = useCallback(() => {
    setConfigModalInitialTab("slides");
    setIsConfigModalSlidesOnly(true);
    setIsConfigModalOpen(true);
  }, []);
  const handleSidebarLoadImage = useCallback(
    (path: string) => {
      void loadFileContent(path, { persistToState: true });
    },
    [loadFileContent],
  );

  const handleSaveConfig = useCallback(
    async (newConfig: string, newPortfolio: string) => {
      try {
        const configPath =
          configModalConfigPathRef.current ||
          resolveConfigPathFromFiles(filesRef.current, "config.json") ||
          CONFIG_JSON_PATH;
        const portfolioPath =
          configModalPortfolioPathRef.current ||
          resolveConfigPathFromFiles(
            filesRef.current,
            "portfolioconfig.json",
          ) ||
          PORTFOLIO_CONFIG_PATH;

        if (filesRef.current[configPath]) {
          filesRef.current = {
            ...filesRef.current,
            [configPath]: {
              ...filesRef.current[configPath],
              content: newConfig,
            },
          };
          setFiles(filesRef.current);

          // mark dirty
          if (!dirtyFilesRef.current.includes(configPath)) {
            dirtyFilesRef.current.push(configPath);
            setDirtyFiles((prev) => [...prev, configPath]);
          }

          if (filePathIndexRef.current[configPath]) {
            await (Neutralino as any).filesystem.writeFile(
              filePathIndexRef.current[configPath],
              newConfig,
            );

            // mark clean
            dirtyFilesRef.current = dirtyFilesRef.current.filter(
              (entry) => entry !== configPath,
            );
            setDirtyFiles((prev) =>
              prev.filter((entry) => entry !== configPath),
            );
          }
        }

        if (filesRef.current[portfolioPath]) {
          filesRef.current = {
            ...filesRef.current,
            [portfolioPath]: {
              ...filesRef.current[portfolioPath],
              content: newPortfolio,
            },
          };
          setFiles(filesRef.current);

          // mark dirty
          if (!dirtyFilesRef.current.includes(portfolioPath)) {
            dirtyFilesRef.current.push(portfolioPath);
            setDirtyFiles((prev) => [...prev, portfolioPath]);
          }

          if (filePathIndexRef.current[portfolioPath]) {
            await (Neutralino as any).filesystem.writeFile(
              filePathIndexRef.current[portfolioPath],
              newPortfolio,
            );

            // mark clean
            dirtyFilesRef.current = dirtyFilesRef.current.filter(
              (entry) => entry !== portfolioPath,
            );
            setDirtyFiles((prev) =>
              prev.filter((entry) => entry !== portfolioPath),
            );
          }
        }

        requestPreviewRefreshWithUnsavedGuard();
      } catch (err) {
        console.error("Failed to save config:", err);
        alert("Failed to save configuration files.");
      }
    },
    [requestPreviewRefreshWithUnsavedGuard],
  );

  const requestSwitchToPreviewMode = useCallback(() => {
    if (interactionModeRef.current === "preview") {
      const currentPath = selectedPreviewHtmlRef.current;
      if (
        previewModeRef.current === "edit" &&
        currentPath &&
        hasUnsavedChangesForFile(currentPath)
      ) {
        setPendingPageSwitch({
          mode: "preview_mode",
          fromPath: currentPath,
          nextPath: currentPath,
          source: "navigate",
          nextPreviewMode: "preview",
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      setPreviewMode("preview");
      return;
    }
    if (interactionModeRef.current !== "edit") {
      setInteractionMode("preview");
      setPreviewMode("preview");
      return;
    }
    const currentPath = selectedPreviewHtmlRef.current;
    if (currentPath && hasUnsavedChangesForFile(currentPath)) {
      setPendingPageSwitch({
        mode: "preview",
        fromPath: currentPath,
        nextPath: currentPath,
        source: "navigate",
      });
      setIsPageSwitchPromptOpen(true);
      return;
    }
    setInteractionMode("preview");
    setPreviewMode("preview");
  }, [hasUnsavedChangesForFile]);
  const resolvePendingPageSwitchWithSave = useCallback(async () => {
    if (!pendingPageSwitch) return;
    setIsPageSwitchPromptBusy(true);
    const pending = pendingPageSwitch;
    const waitForStateFlush = () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    try {
      await saveCodeDraftsRef.current?.();
      await flushPendingPreviewSaves();
      // React state cleanup for dirty flags may settle one tick later.
      await waitForStateFlush();
      let stillUnsaved = hasUnsavedChangesForFile(pending.fromPath);
      if (stillUnsaved) {
        await waitForStateFlush();
        stillUnsaved = hasUnsavedChangesForFile(pending.fromPath);
      }
      if (stillUnsaved) {
        window.alert("Some changes could not be saved. Please retry.");
        return;
      }
      setIsPageSwitchPromptOpen(false);
      setPendingPageSwitch(null);
      if (pending.mode === "refresh") {
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewRefreshNonce((prev) => prev + 1);
      } else if (pending.mode === "preview_mode") {
        setActiveFileStable(pending.fromPath);
        setPreviewSyncedFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewMode(pending.nextPreviewMode ?? "preview");
      } else if (pending.mode === "preview") {
        setInteractionMode("preview");
      } else {
        commitPreviewActiveFileSync(pending.nextPath, pending.source);
      }
    } finally {
      setIsPageSwitchPromptBusy(false);
    }
  }, [
    commitPreviewActiveFileSync,
    flushPendingPreviewSaves,
    hasUnsavedChangesForFile,
    pendingPageSwitch,
  ]);
  const resolvePendingPageSwitchWithDiscard = useCallback(async () => {
    if (!pendingPageSwitch) return;
    setIsPageSwitchPromptBusy(true);
    const pending = pendingPageSwitch;
    try {
      await discardUnsavedChangesForFile(pending.fromPath);
      setIsPageSwitchPromptOpen(false);
      setPendingPageSwitch(null);
      if (pending.mode === "refresh") {
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewRefreshNonce((prev) => prev + 1);
      } else if (pending.mode === "preview_mode") {
        setActiveFileStable(pending.fromPath);
        setPreviewSyncedFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewMode(pending.nextPreviewMode ?? "preview");
      } else if (pending.mode === "preview") {
        setInteractionMode("preview");
      } else {
        commitPreviewActiveFileSync(pending.nextPath, pending.source);
      }
    } finally {
      setIsPageSwitchPromptBusy(false);
    }
  }, [
    commitPreviewActiveFileSync,
    discardUnsavedChangesForFile,
    pendingPageSwitch,
  ]);
  const closePendingPageSwitchPrompt = useCallback(() => {
    if (isPageSwitchPromptBusy) return;
    setIsPageSwitchPromptOpen(false);
    setPendingPageSwitch(null);
  }, [isPageSwitchPromptBusy]);

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
    await flushPendingPreviewSaves();
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [cachePreviewDoc, flushPendingPreviewSaves, schedulePreviewAutoSave]);

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
    await flushPendingPreviewSaves();
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [cachePreviewDoc, flushPendingPreviewSaves, schedulePreviewAutoSave]);

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
          isCodePanelOpen,
          interactionMode,
        };
        setIsLeftPanelOpen(false);
        setIsRightPanelOpen(false);
        setShowTerminal(false);
        setIsCodePanelOpen(false);
        setInteractionMode("preview");
        return true;
      }

      const restore = zenRestoreRef.current;
      if (restore) {
        setIsLeftPanelOpen(restore.isLeftPanelOpen);
        setIsRightPanelOpen(restore.isRightPanelOpen);
        setShowTerminal(restore.showTerminal);
        setIsCodePanelOpen(restore.isCodePanelOpen);
        setInteractionMode(restore.interactionMode);
      }
      zenRestoreRef.current = null;
      return false;
    });
  }, [
    interactionMode,
    isLeftPanelOpen,
    isRightPanelOpen,
    isCodePanelOpen,
    showTerminal,
  ]); // --- Keyboard Shortcuts ---
  useEffect(() => {
    if (isCodePanelOpen) {
      return;
    }

    if (interactionMode === "preview") {
      rightPanelManualClosedRef.current = false;
      setIsRightPanelOpen(false);
      return;
    }

    if (interactionMode !== "edit") {
      return;
    }

    if (rightPanelRestorePendingRef.current) {
      rightPanelRestorePendingRef.current = false;
      return;
    }

    if (selectedId !== lastEditSelectionRef.current) {
      lastEditSelectionRef.current = selectedId;
      rightPanelManualClosedRef.current = false;
    }

    if (!selectedId) {
      setIsRightPanelOpen(false);
      return;
    }

    if (!rightPanelManualClosedRef.current) {
      setIsRightPanelOpen(true);
    }
  }, [interactionMode, isCodePanelOpen, selectedId]);

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

      if (hasModifier && editableTarget) {
        if (key === "s") {
          e.preventDefault();
          void saveCodeDraftsRef.current?.();
          void flushPendingPreviewSaves();
          return;
        }
        if (key === "t") {
          e.preventDefault();
          requestPreviewRefreshWithUnsavedGuard();
          return;
        }
        if (key === "p") {
          e.preventDefault();
          requestSwitchToPreviewMode();
          return;
        }
        if (key === "f") {
          e.preventDefault();
          setIsLeftPanelOpen(true);
          setIsRightPanelOpen(true);
          setIsCodePanelOpen(false);
          return;
        }
        if (key === "b") {
          e.preventDefault();
          setIsLeftPanelOpen(true);
          return;
        }
        if (key === "i" && interactionModeRef.current === "edit") {
          e.preventDefault();
          rightPanelManualClosedRef.current = !isRightPanelOpen;
          setIsRightPanelOpen((prev) => {
            if (prev) return false;
            return Boolean(selectedId);
          });
          return;
        }
        if (key === "e") {
          e.preventDefault();
          setSidebarToolMode("edit");
          setInteractionMode("preview");
          setPreviewMode("edit");
          return;
        }
        if (key === "k") {
          e.preventDefault();
          setIsCommandPaletteOpen((prev) => !prev);
          return;
        }
        if (e.code === "Backquote") {
          e.preventDefault();
          setShowTerminal((prev) => !prev);
        }
        // Let native editor undo/redo work inside inputs/contentEditable.
        return;
      }
      if (
        key === "escape" &&
        isPageSwitchPromptOpen &&
        !isPageSwitchPromptBusy
      ) {
        e.preventDefault();
        closePendingPageSwitchPrompt();
        return;
      }

      if (key === "escape" && isZenMode) {
        e.preventDefault();
        toggleZenMode();
        return;
      }

      if (!hasModifier && !e.altKey && !editableTarget) {
        if (key === "w") {
          e.preventDefault();
          if (!e.repeat) {
            setIsLeftPanelOpen(true);
          }
          return;
        }
        if (key === "e") {
          e.preventDefault();
          if (!e.repeat) {
            setIsRightPanelOpen((prev) => {
              const next = !prev;
              if (next) setIsCodePanelOpen(false);
              return next;
            });
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
        setIsCodePanelOpen(false);
        return;
      }
      if (key === "b") {
        e.preventDefault();
        setIsLeftPanelOpen(true);
        return;
      }
      if (key === "i" && interactionModeRef.current === "edit") {
        e.preventDefault();
        rightPanelManualClosedRef.current = !isRightPanelOpen;
        setIsRightPanelOpen((prev) => {
          if (prev) return false;
          return Boolean(selectedId);
        });
        return;
      }
      if (key === "p") {
        e.preventDefault();
        requestSwitchToPreviewMode();
        return;
      }
      if (key === "e") {
        e.preventDefault();
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        setPreviewMode("edit");
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
        void saveCodeDraftsRef.current?.();
        void flushPendingPreviewSaves();
        return;
      }
      if (key === "t") {
        e.preventDefault();
        requestPreviewRefreshWithUnsavedGuard();
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
    closePendingPageSwitchPrompt,
    flushPendingPreviewSaves,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    isZenMode,
    previewSyncedFile,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    runRedo,
    runUndo,
    selectedId,
    toggleZenMode,
    isRightPanelOpen,
  ]);

  // --- Actions ---
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
      if (interactionModeRef.current === "inspect") {
        setInteractionMode("edit");
        setSidebarToolMode("edit");
      }
      if (deviceMode === "tablet" && interactionModeRef.current === "edit") {
        setIsCodePanelOpen(false);
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
    (data: {
      content?: string;
      html?: string;
      src?: string;
      href?: string;
    }) => {
      if (!selectedId) return;
      const normalizedData =
        typeof data.html === "string" && typeof data.content !== "string"
          ? {
              ...data,
              content: extractTextFromHtmlFragment(data.html),
            }
          : data;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        ...normalizedData,
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
  const handleUpdateIdentity = useCallback(
    (identity: { id: string; className: string }) => {
      if (!selectedId) return;
      const nextId = identity.id.trim() || selectedId;
      const nextClassName = identity.className.trim();
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        id: nextId,
        className: nextClassName || undefined,
      }));
      pushHistory(newRoot);
      if (nextId !== selectedId) {
        setSelectedId(nextId);
      }
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
      const idFor = createPresetIdFactory(type);
      const newElement =
        buildPresetElementV2(type, idFor) ??
        buildStandardElement(type, idFor("element"));
      const targetId = selectedId || root.id;
      const newRoot = addElementToTree(root, targetId, newElement, position);
      pushHistory(newRoot);
      setSelectedId(newElement.id);
      setIsRightPanelOpen(true);
      requestPropertiesPanelTab("content");
    },
    [root, selectedId, pushHistory, requestPropertiesPanelTab],
  );

  const handleDeleteElement = useCallback(() => {
    if (!selectedId || selectedId === "root") return;
    const newRoot = deleteElementFromTree(root, selectedId);
    pushHistory(newRoot);
    setSelectedId(null);
  }, [root, selectedId, pushHistory]);
  const handleSidebarAddElement = useCallback(
    (type: string) => {
      if (
        interactionModeRef.current === "preview" &&
        selectedPreviewHtmlRef.current
      ) {
        const frameRect = previewFrameRef.current?.getBoundingClientRect();
        const clientX = frameRect
          ? Math.round(frameRect.left + frameRect.width / 2)
          : Math.round(window.innerWidth / 2);
        const clientY = frameRect
          ? Math.round(frameRect.top + frameRect.height / 2)
          : Math.round(window.innerHeight / 2);
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        setPreviewMode("edit");
        void applyPreviewDropCreateRef.current?.(type, clientX, clientY);
        return;
      }
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
    requestPreviewRefreshWithUnsavedGuard();
  }, [requestPreviewRefreshWithUnsavedGuard]);
  const appendPdfAnnotationLog = useCallback(
    (message: string, level: "info" | "warn" | "error" = "info") => {
      dispatch(
        addProcessingLog({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          message,
          level,
        }),
      );
    },
    [dispatch],
  );
  const runPdfAnnotationMapping = useCallback(
    async (pdfPath: string, useCache: boolean) => {
      if (!projectPath || isPdfAnnotationLoading) return;
      const normalizedPdfPath = normalizePath(pdfPath);
      const normalizedProject = normalizePath(projectPath);
      dispatch(clearProcessingLogs());
      appendPdfAnnotationLog("Starting PDF annotation mapping.");
      if (useCache) {
        appendPdfAnnotationLog("Checking local cache for previous results.");
        const cache = readPdfAnnotationCache();
        const cachedEntry =
          cache?.projects?.[normalizedProject]?.entries?.[normalizedPdfPath];
        if (cachedEntry) {
          const cachedRecords = cachedEntry.records || [];
          dispatch(setRecords(cachedRecords));
          const metrics = evaluateAnnotationTypeClassifier(cachedRecords).micro;
          dispatch(setClassifierMetrics(metrics as any));
          dispatch(setFileName(cachedEntry.fileName || ""));
          dispatch(setSourcePath(normalizedPdfPath));
          dispatch(setError(null));
          dispatch(setIsOpen(true));
          dispatch(setFocusedAnnotation(null));
          appendPdfAnnotationLog(
            `Cache hit. Loaded ${cachedRecords.length} annotations.`,
          );
          return;
        }
        appendPdfAnnotationLog("Cache miss. Running full extraction.");
      }

      dispatch(setIsLoading(true));
      dispatch(setError(null));
      dispatch(setIsOpen(true));
      dispatch(setFocusedAnnotation(null));
      dispatch(setRecords([]));
      try {
        appendPdfAnnotationLog("Reading PDF file into memory.");
        const binaryData = await (Neutralino as any).filesystem.readBinaryFile(
          normalizedPdfPath,
        );
        const pdfData = toByteArray(binaryData);
        appendPdfAnnotationLog("Preparing PDF data for extraction.");
        let preExtractedAnnotations: PdfAnnotationRecord[] | null = null;
        try {
          appendPdfAnnotationLog("Running background extractor script.");
          const appRoot = normalizePath(String((window as any).NL_PATH || ""));
          const workerScriptPath = appRoot
            ? `${appRoot}/scripts/pdf_annotation_worker.mjs`
            : "";
          const workerOutputPath = projectPath
            ? `${normalizePath(projectPath)}/.nx_tmp_pdf_annotations_${Date.now()}.json`
            : "";
          if (workerScriptPath && workerOutputPath) {
            let nodeExecutable = "node";
            if (appRoot) {
              const bundledNode = normalizePath(`${appRoot}/node/node.exe`);
              try {
                await (Neutralino as any).filesystem.getStats(bundledNode);
                nodeExecutable = `"${bundledNode}"`;
              } catch {
                nodeExecutable = "node";
              }
            }
            appendPdfAnnotationLog(
              `PDF worker paths: node=${nodeExecutable}, script=${workerScriptPath}`,
            );
            console.log("[PDF Worker] node:", nodeExecutable);
            console.log("[PDF Worker] script:", workerScriptPath);
            console.log("[PDF Worker] output:", workerOutputPath);
            const command = `${nodeExecutable} "${workerScriptPath}" "${normalizedPdfPath}" "${workerOutputPath}"`;
            const execResult = await (Neutralino as any).os.execCommand(
              command,
            );
            console.log("[PDF Worker] execResult:", execResult);
            if ((execResult?.exitCode ?? 1) === 0) {
              appendPdfAnnotationLog("Parsing extractor output.");
              const workerRaw = await (Neutralino as any).filesystem.readFile(
                workerOutputPath,
              );
              const parsed = JSON.parse(String(workerRaw || "{}"));
              if (Array.isArray(parsed?.annotations)) {
                preExtractedAnnotations = parsed.annotations;
                appendPdfAnnotationLog(
                  `Extractor produced ${preExtractedAnnotations.length} annotations.`,
                );
              }
            }
            try {
              await (Neutralino as any).filesystem.removeFile(workerOutputPath);
            } catch {}
          }
        } catch (workerError) {
          console.warn("Background PDF extraction failed:", workerError);
          appendPdfAnnotationLog(
            "Background extractor failed. No annotations returned.",
            "warn",
          );
        }
        if (!preExtractedAnnotations || preExtractedAnnotations.length === 0) {
          appendPdfAnnotationLog(
            "Background extractor returned no annotations. Falling back to in-app worker.",
            "warn",
          );
          preExtractedAnnotations = null;
        }
        appendPdfAnnotationLog("Mapping annotations to project files.");
        const details = await buildMappedPdfAnnotations({
          pdfData,
          files,
          absolutePathIndex: filePathIndexRef.current,
          preExtractedAnnotations,
          readBinaryFile: async (absolutePath: string) => {
            const nextBinary = await (
              Neutralino as any
            ).filesystem.readBinaryFile(normalizePath(absolutePath));
            const bytes = toByteArray(nextBinary);
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            return copy.buffer;
          },
        });
        const fileName =
          normalizePath(normalizedPdfPath)
            .split("/")
            .filter(Boolean)
            .slice(-1)[0] || normalizedPdfPath;
        dispatch(setRecords(details));
        appendPdfAnnotationLog("Scoring annotation types.");
        const metrics = evaluateAnnotationTypeClassifier(details).micro;
        dispatch(setClassifierMetrics(metrics as any));
        dispatch(setFileName(fileName));
        dispatch(setSourcePath(normalizedPdfPath));
        appendPdfAnnotationLog(
          `Mapping complete. ${details.length} annotations ready.`,
        );
        appendPdfAnnotationLog("Caching results locally.");
        writePdfAnnotationCache(
          normalizedProject,
          normalizedPdfPath,
          fileName,
          details,
        );
        appendPdfAnnotationLog("Results cached for faster reloads.");

        // --- DEBUG EXPORT: Save mapping JSON to project root ---
        try {
          const debugOutputPath = `${normalizePath(projectPath)}/pdf_mapping_debug.json`;
          await (Neutralino as any).filesystem.writeFile(
            debugOutputPath,
            JSON.stringify(details, null, 2),
          );
          console.log(
            `[NX-DEBUG] Mapping JSON exported to: ${debugOutputPath}`,
          );
        } catch (exportError) {
          console.warn(
            "[NX-DEBUG] Failed to export mapping JSON:",
            exportError,
          );
          appendPdfAnnotationLog("Debug export failed (non-blocking).", "warn");
        }
      } catch (error) {
        console.error("Failed to analyze annotated PDF:", error);
        dispatch(setRecords([]));
        dispatch(setClassifierMetrics(null));
        dispatch(
          setError(
            error instanceof Error
              ? error.message
              : "Could not analyze this PDF inside the app.",
          ),
        );
        appendPdfAnnotationLog(
          error instanceof Error
            ? `Error: ${error.message}`
            : "Error: Could not analyze this PDF inside the app.",
          "error",
        );
      } finally {
        dispatch(setIsLoading(false));
        appendPdfAnnotationLog("Processing finished.");
      }
    },
    [
      files,
      isPdfAnnotationLoading,
      projectPath,
      readPdfAnnotationCache,
      writePdfAnnotationCache,
      dispatch,
      appendPdfAnnotationLog,
    ],
  );
  const handleOpenPdfAnnotationsPicker = useCallback(async () => {
    if (!projectPath || isPdfAnnotationLoading) return;
    if (pdfAnnotationRecords.length > 0) {
      dispatch(setIsOpen(true));
      return;
    }

    try {
      const selections = await (Neutralino as any).os.showOpenDialog(
        "Select annotated PDF",
        {
          multiSelections: false,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        },
      );
      const pdfPath = Array.isArray(selections) ? selections[0] : null;
      if (!pdfPath) return;
      await runPdfAnnotationMapping(pdfPath, true);
    } catch (error) {
      console.error("Failed to analyze annotated PDF:", error);
      dispatch(setRecords([]));
      dispatch(
        setError(
          error instanceof Error
            ? error.message
            : "Could not analyze this PDF inside the app.",
        ),
      );
    } finally {
      // Loading handled by mapping helper.
    }
  }, [
    isPdfAnnotationLoading,
    pdfAnnotationRecords.length,
    projectPath,
    runPdfAnnotationMapping,
    dispatch,
  ]);
  const handleRefreshPdfAnnotationMapping = useCallback(async () => {
    if (!projectPath || isPdfAnnotationLoading) return;
    try {
      const selections = await (Neutralino as any).os.showOpenDialog(
        "Select annotated PDF",
        {
          multiSelections: false,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        },
      );
      const pdfPath = Array.isArray(selections) ? selections[0] : null;
      if (!pdfPath) return;
      await runPdfAnnotationMapping(pdfPath, false);
    } catch (error) {
      console.error("Failed to refresh annotated PDF:", error);
    }
  }, [isPdfAnnotationLoading, projectPath, runPdfAnnotationMapping]);
  const handleJumpToPdfAnnotation = useCallback(
    (annotation: PdfAnnotationUiRecord) => {
      if (!annotation.mappedFilePath) return;

      const currentSlide = selectedPreviewHtmlRef.current;
      const targetPath = normalizePath(annotation.mappedFilePath);
      const normalizedCurrent = currentSlide ? normalizePath(currentSlide) : "";

      const isTargetingCurrentSlide =
        normalizedCurrent && targetPath === normalizedCurrent;
      const hasInvocation = !!annotation.popupInvocation;

      const isSharedPopup =
        annotation.mappedFilePath.includes("/shared/") ||
        annotation.detectedPageType === "Child/Popup" ||
        hasInvocation;

      console.log(`[NX-DEBUG] Jump Triggered:
        Target: ${annotation.mappedFilePath}
        Current: ${currentSlide}
        Match: ${isTargetingCurrentSlide}
        Type: ${annotation.detectedPageType}
        Invocation: ${hasInvocation}
      `);

      // --- FIX: Logic for staying on context vs navigating ---
      const isTargetingSlideButNotCurrent =
        !isTargetingCurrentSlide &&
        !annotation.mappedFilePath.includes("/shared/");

      // If we are targeting the CURRENT slide OR it's a popup that belongs here, STAY.
      if (isTargetingCurrentSlide) {
        console.log(`[NX] Staying on current context. Same slide match.`);
        dispatch(setFocusedAnnotation({ ...annotation }));
        setPreviewMode("preview");
        setInteractionMode("preview");
        return;
      }

      // If it's a shared popup trigger BUT we are on some slide,
      // check if we should navigate to the target slide first.
      if (!isTargetingCurrentSlide && isTargetingSlideButNotCurrent) {
        console.log(
          `[NX] Navigating to target slide: ${annotation.mappedFilePath}`,
        );
        // Let it fall through to the navigation logic below
      } else if (currentSlide && isSharedPopup) {
        // This case handles truly "shared" resources that have no slide parent (legacy fallback)
        console.log(`[NX] Shared popup case - staying on context.`);
        dispatch(setFocusedAnnotation({ ...annotation }));
        setPreviewMode("preview");
        setInteractionMode("preview");
        return;
      }

      dispatch(setFocusedAnnotation({ ...annotation }));
      setSelectedId(null);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
      setSidebarToolMode("edit");
      setPreviewMode("preview");
      setInteractionMode("preview");
      setActiveFileStable(annotation.mappedFilePath || "");
      setPreviewSyncedFile(annotation.mappedFilePath);
      setPreviewNavigationFile(annotation.mappedFilePath);
      dispatch(setIsOpen(true));
    },
    [setActiveFileStable, dispatch],
  );
  const openCodePanel = useCallback(() => {
    const currentPreview = selectedPreviewHtmlRef.current;
    if (currentPreview && filesRef.current[currentPreview]?.type === "html") {
      setActiveFileStable(currentPreview);
      setPreviewSyncedFile((prev) =>
        prev === currentPreview ? prev : currentPreview,
      );
      setPreviewNavigationFile((prev) =>
        prev === currentPreview ? prev : currentPreview,
      );
    }
    setIsDetachedEditorOpen(true);
  }, [setActiveFileStable]);
  const closeCodePanel = useCallback(() => {
    setIsDetachedEditorOpen(false);
    setIsCodePanelOpen(false);
  }, []);
  const toggleThemeWithTransition = useCallback(() => {
    if (themeTransitionInFlightRef.current) return;
    themeTransitionInFlightRef.current = true;
    const nextTheme = theme === "dark" ? "light" : "dark";
    const rootEl = document.documentElement;
    rootEl.classList.add("theme-transitioning");
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanupTransitionVars = () => {
      const rootStyle = document.documentElement.style;
      rootStyle.removeProperty("--theme-transition-x");
      rootStyle.removeProperty("--theme-transition-y");
      rootStyle.removeProperty("--theme-transition-radius");
      rootEl.classList.remove("theme-transitioning");
      themeTransitionInFlightRef.current = false;
    };
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--theme-transition-x", `${window.innerWidth}px`);
    rootStyle.setProperty("--theme-transition-y", "0px");
    rootStyle.setProperty(
      "--theme-transition-radius",
      `${Math.hypot(window.innerWidth, window.innerHeight)}px`,
    );

    if (prefersReducedMotion) {
      setTheme(nextTheme);
      cleanupTransitionVars();
      return;
    }

    const doc = document as MaybeViewTransitionDocument;
    if (typeof doc.startViewTransition !== "function") {
      setTheme(nextTheme);
      cleanupTransitionVars();
      return;
    }

    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
    });
    void transition.finished.finally(cleanupTransitionVars);
  }, [theme]);

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
        if (interactionModeRef.current === "preview") {
          setSidebarToolMode("edit");
          setPreviewMode("edit");
        } else {
          setSidebarToolMode("edit");
          requestSwitchToPreviewMode();
        }
        break;
      case "clear-selection":
        setSelectedId(null);
        break;
      default:
        if (actionId.startsWith("add-")) handleAddElement(payload, "inside");
    }
  };

  // --- Neutralino File System Integration ---
  const handleOpenFolder = async (preselectedFolder?: string | null) => {
    try {
      const selectedFolder =
        preselectedFolder ||
        (await (Neutralino as any).os.showFolderDialog(
          "Select project folder",
        ));
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
      setRecentProjects((prev) =>
        [
          rootPath,
          ...prev.filter((entry) => normalizePath(entry) !== rootPath),
        ].slice(0, 5),
      );
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
      selectedPreviewHtmlRef.current =
        initialFile && fsFiles[initialFile]?.type === "html"
          ? initialFile
          : null;
      setSidebarToolMode("edit");
      setPreviewMode("preview");
      setInteractionMode("preview");
    } catch (error) {
      console.error("Failed to open folder:", error);
      alert("Could not open folder. Please try again.");
    }
  };
  useEffect(() => {
    if (!projectPath) {
      dispatch(setRecords([]));
      dispatch(setFileName(""));
      dispatch(setSourcePath(null));
      dispatch(setClassifierMetrics(null));
      dispatch(setError(null));
      dispatch(setIsOpen(false));
      dispatch(setIsLoading(false));
      dispatch(setFocusedAnnotation(null));
      return;
    }
    const cache = readPdfAnnotationCache();
    const normalizedProject = normalizePath(projectPath);
    const cachedProject = cache?.projects?.[normalizedProject];
    const cachedPath = cachedProject?.lastPdfPath || null;
    if (cachedPath && cachedProject?.entries?.[cachedPath]) {
      const cachedEntry = cachedProject.entries[cachedPath];
      const cachedRecords = cachedEntry.records || [];
      dispatch(setRecords(cachedRecords));
      const metrics = evaluateAnnotationTypeClassifier(cachedRecords).micro;
      dispatch(setClassifierMetrics(metrics as any));
      dispatch(setFileName(cachedEntry.fileName || ""));
      dispatch(setSourcePath(cachedPath));
      dispatch(setIsOpen(false));
    } else {
      dispatch(setRecords([]));
      dispatch(setFileName(""));
      dispatch(setSourcePath(null));
      dispatch(setClassifierMetrics(null));
    }
    dispatch(setError(null));
    dispatch(setIsLoading(false));
    dispatch(setFocusedAnnotation(null));
  }, [projectPath, readPdfAnnotationCache, dispatch]);
  useEffect(() => {
    if (!focusedPdfAnnotation) return;
    const timer = window.setTimeout(() => {
      dispatch(setFocusedAnnotation(null));
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [focusedPdfAnnotation]);
  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        quickTextEditRef.current &&
        target &&
        quickTextEditRef.current.contains(target)
      ) {
        return;
      }
      hideQuickTextEdit();
    };
    window.addEventListener("mousedown", handlePointer);
    return () => window.removeEventListener("mousedown", handlePointer);
  }, [hideQuickTextEdit]);
  const ensureDirectoryTree = useCallback(async (absolutePath: string) => {
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
  }, []);
  const ensureDirectoryForFile = useCallback(
    async (absoluteFilePath: string) => {
      const parent = getParentPath(normalizePath(absoluteFilePath));
      if (!parent) return;
      await ensureDirectoryTree(parent);
    },
    [ensureDirectoryTree],
  );
  const dataUrlToBytes = useCallback((dataUrl: string): Uint8Array => {
    const base64 = dataUrl.split(",")[1] || "";
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }, []);
  const resolveScreenshotIndexPath = useCallback(() => {
    if (!projectPath) return null;
    return `${normalizePath(projectPath)}/${SCREENSHOT_INDEX_FILE}`;
  }, [projectPath]);
  const resolveScreenshotDir = useCallback(() => {
    if (!projectPath) return null;
    return `${normalizePath(projectPath)}/${SCREENSHOT_DIR}`;
  }, [projectPath]);
  const resolvePdfExportDir = useCallback(() => {
    if (!projectPath) return null;
    return `${normalizePath(projectPath)}/${PDF_EXPORT_DIR}`;
  }, [projectPath]);
  const resolvePreviewAssetUrl = useCallback(
    (rawUrl: string | null | undefined) => {
      if (!rawUrl) return rawUrl || null;
      if (isExternalUrl(rawUrl)) return rawUrl;
      if (!projectPath || !previewMountBasePath) return rawUrl;
      const cleaned = rawUrl.split("#")[0].split("?")[0];
      const basePath = selectedPreviewHtmlRef.current || "";
      const normalizedRelative = cleaned.startsWith("/")
        ? normalizeProjectRelative(cleaned.slice(1))
        : resolveProjectRelativePath(basePath, cleaned) || cleaned;
      const absolutePath =
        filePathIndexRef.current[normalizedRelative] ||
        normalizePath(joinPath(projectPath, normalizedRelative));
      const relativePath = toMountRelativePath(
        previewMountBasePath,
        absolutePath,
      );
      if (!relativePath) return rawUrl;
      const nlPort = String((window as any).NL_PORT || "").trim();
      const previewServerOrigin = nlPort ? `http://127.0.0.1:${nlPort}` : "";
      const mountPath = encodeURI(`${PREVIEW_MOUNT_PATH}/${relativePath}`);
      return previewServerOrigin
        ? `${previewServerOrigin}${mountPath}`
        : mountPath;
    },
    [projectPath, previewMountBasePath],
  );
  const loadScreenshotIndex = useCallback(async () => {
    const indexPath = resolveScreenshotIndexPath();
    if (!indexPath) return [];
    try {
      const raw = await (Neutralino as any).filesystem.readFile(indexPath);
      const parsed = JSON.parse(String(raw || "[]"));
      if (Array.isArray(parsed)) {
        return parsed as ScreenshotMetadata[];
      }
    } catch {
      // Ignore missing or malformed index.
    }
    return [];
  }, [resolveScreenshotIndexPath]);
  const writeScreenshotIndex = useCallback(
    async (items: ScreenshotMetadata[]) => {
      const indexPath = resolveScreenshotIndexPath();
      if (!indexPath) return;
      await ensureDirectoryForFile(indexPath);
      await (Neutralino as any).filesystem.writeFile(
        indexPath,
        JSON.stringify(items, null, 2),
      );
    },
    [ensureDirectoryForFile, resolveScreenshotIndexPath],
  );
  const findVisiblePopupInDoc = useCallback((doc: Document | null) => {
    if (!doc) return null;
    const selectors = [
      "[data-popup-id]",
      ".modal",
      ".dialog",
      "[role='dialog']",
      ".popup",
    ];
    const candidates = selectors
      .flatMap(
        (selector) =>
          Array.from(doc.querySelectorAll(selector)) as HTMLElement[],
      )
      .filter(Boolean);
    for (const el of candidates) {
      const style = doc.defaultView?.getComputedStyle(el);
      if (!style) continue;
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (Number.parseFloat(style.opacity || "1") <= 0.05) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      const popupId = el.getAttribute("data-popup-id") || el.id || null;
      const popupSelector = el.getAttribute("data-popup-id")
        ? `[data-popup-id="${el.getAttribute("data-popup-id")}"]`
        : el.id
          ? `#${el.id}`
          : null;
      return { popupId, popupSelector };
    }
    return null;
  }, []);
  const openPopupInPreview = useCallback(
    (selector: string | null, popupId: string | null) => {
      const doc =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!doc) return false;
      let target: HTMLElement | null = null;
      if (selector) {
        target = doc.querySelector(selector) as HTMLElement | null;
      }
      if (!target && popupId) {
        target = doc.querySelector(
          `[data-popup-id="${popupId}"], #${popupId}`,
        ) as HTMLElement | null;
      }
      if (!target) return false;
      target.style.display = target.style.display || "block";
      target.style.visibility = "visible";
      target.style.opacity = target.style.opacity || "1";
      target.classList.add("open", "active", "show");
      target.classList.remove("hidden", "is-hidden", "closed");
      target.removeAttribute("hidden");
      target.setAttribute("aria-hidden", "false");
      target.style.pointerEvents = "auto";
      target.scrollIntoView({ block: "center", inline: "center" });
      return true;
    },
    [],
  );
  const handleScreenshotCapture = useCallback(async () => {
    if (!projectPath || screenshotCaptureBusy) return;
    const doc =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    if (!doc?.body) return;
    setScreenshotCaptureBusy(true);
    try {
      const popupInfo = findVisiblePopupInDoc(doc);
      const createdAt = new Date();
      const slidePath = selectedPreviewHtmlRef.current || null;
      const slideId = slidePath
        ? normalizePath(slidePath).split("/").filter(Boolean).slice(-2)[0] ||
          null
        : null;
      const timestamp = createdAt.getTime();
      const randTag = Math.random().toString(36).slice(2, 8);
      // Keep filenames short to avoid Windows path length limits.
      const baseName = `screenshot-${timestamp}-${randTag}`;
      const imageRelPath = `${SCREENSHOT_DIR}/${baseName}.png`;
      const jsonRelPath = `${SCREENSHOT_DIR}/${baseName}.json`;
      const absImagePath = `${normalizePath(projectPath)}/${imageRelPath}`;
      const absJsonPath = `${normalizePath(projectPath)}/${jsonRelPath}`;
      await ensureDirectoryForFile(absImagePath);
      const canvas = await html2canvas(doc.body, {
        backgroundColor: null,
        useCORS: true,
        scale: Math.max(1, window.devicePixelRatio || 1),
        onclone: (clonedDoc) => {
          const images = clonedDoc.querySelectorAll("img");
          images.forEach((img) => {
            const next = resolvePreviewAssetUrl(img.getAttribute("src"));
            if (next) img.setAttribute("src", next);
          });
          const sources = clonedDoc.querySelectorAll("source");
          sources.forEach((source) => {
            const next = resolvePreviewAssetUrl(source.getAttribute("src"));
            if (next) source.setAttribute("src", next);
          });
          const links = clonedDoc.querySelectorAll("link[rel='stylesheet']");
          links.forEach((link) => {
            const next = resolvePreviewAssetUrl(link.getAttribute("href"));
            if (next) link.setAttribute("href", next);
          });
        },
      });
      const dataUrl = canvas.toDataURL("image/png");
      const bytes = dataUrlToBytes(dataUrl);
      await (Neutralino as any).filesystem.writeBinaryFile(absImagePath, bytes);
      const metadata: ScreenshotMetadata = {
        id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: createdAt.toISOString(),
        projectPath: normalizePath(projectPath),
        slidePath,
        slideId,
        popupId: popupInfo?.popupId || null,
        popupSelector: popupInfo?.popupSelector || null,
        deviceMode,
        tabletModel,
        tabletOrientation,
        frameZoom,
        viewportWidth: doc.body.scrollWidth,
        viewportHeight: doc.body.scrollHeight,
        previewMode,
        interactionMode,
        imagePath: imageRelPath,
        imageFileName: `${baseName}.png`,
      };
      await ensureDirectoryForFile(absJsonPath);
      await (Neutralino as any).filesystem.writeFile(
        absJsonPath,
        JSON.stringify(metadata, null, 2),
      );
      const existing = await loadScreenshotIndex();
      const nextIndex = [metadata, ...existing];
      await writeScreenshotIndex(nextIndex);
      setScreenshotItems(nextIndex);
    } catch (error) {
      console.error("Screenshot capture failed:", error);
      window.alert("Screenshot capture failed. Check console for details.");
    } finally {
      setScreenshotCaptureBusy(false);
    }
  }, [
    projectPath,
    screenshotCaptureBusy,
    deviceMode,
    tabletModel,
    tabletOrientation,
    frameZoom,
    previewMode,
    interactionMode,
    dataUrlToBytes,
    ensureDirectoryForFile,
    findVisiblePopupInDoc,
    loadScreenshotIndex,
    resolvePreviewAssetUrl,
    writeScreenshotIndex,
  ]);
  const loadGalleryItems = useCallback(async () => {
    const items = await loadScreenshotIndex();
    setScreenshotItems(items);
    if (!projectPath) return items;
    const nextUrls: Record<string, string> = {};
    await Promise.all(
      items.map(async (item) => {
        const absImage = `${normalizePath(projectPath)}/${item.imagePath}`;
        try {
          const binary = await (Neutralino as any).filesystem.readBinaryFile(
            absImage,
          );
          const bytes = toByteArray(binary);
          const arrayBuffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          const blob = new Blob([arrayBuffer], { type: "image/png" });
          nextUrls[item.id] = URL.createObjectURL(blob);
        } catch (error) {
          console.warn("Failed to read screenshot image:", error);
        }
      }),
    );
    setScreenshotPreviewUrls((prev) => {
      Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
      return nextUrls;
    });
    return items;
  }, [loadScreenshotIndex, projectPath]);
  const openScreenshotGallery = useCallback(
    async (captureNow: boolean) => {
      if (!SHOW_SCREENSHOT_FEATURES) return;
      if (!projectPath) return;
      if (!screenshotSessionRestore) {
        setScreenshotSessionRestore({
          leftOpen: isLeftPanelOpen,
          rightOpen: isRightPanelOpen,
          rightMode: rightPanelMode,
        });
      }
      setIsLeftPanelOpen(false);
      setIsRightPanelOpen(true);
      setRightPanelMode("gallery");
      setIsScreenshotGalleryOpen(true);
      await loadGalleryItems();
      if (captureNow) {
        void handleScreenshotCapture();
      }
    },
    [
      projectPath,
      screenshotSessionRestore,
      isLeftPanelOpen,
      isRightPanelOpen,
      rightPanelMode,
      loadGalleryItems,
      handleScreenshotCapture,
      SHOW_SCREENSHOT_FEATURES,
    ],
  );
  const closeScreenshotGallery = useCallback(() => {
    setIsScreenshotGalleryOpen(false);
    if (screenshotSessionRestore) {
      setIsLeftPanelOpen(screenshotSessionRestore.leftOpen);
      setIsRightPanelOpen(screenshotSessionRestore.rightOpen);
      setRightPanelMode(screenshotSessionRestore.rightMode);
      setScreenshotSessionRestore(null);
      return;
    }
    setRightPanelMode("inspector");
  }, [screenshotSessionRestore]);
  useEffect(() => {
    if (rightPanelMode === "gallery" && !isRightPanelOpen) {
      closeScreenshotGallery();
    }
  }, [rightPanelMode, isRightPanelOpen, closeScreenshotGallery]);
  useEffect(() => {
    if (isScreenshotGalleryOpen) {
      void loadGalleryItems();
    }
  }, [isScreenshotGalleryOpen, loadGalleryItems]);
  useEffect(() => {
    if (!isScreenshotGalleryOpen && rightPanelMode === "gallery") {
      setRightPanelMode("inspector");
    }
  }, [isScreenshotGalleryOpen, rightPanelMode, SHOW_SCREENSHOT_FEATURES]);
  useEffect(() => {
    if (!SHOW_SCREENSHOT_FEATURES) {
      if (isScreenshotGalleryOpen) {
        setIsScreenshotGalleryOpen(false);
      }
      if (rightPanelMode === "gallery") {
        setRightPanelMode("inspector");
      }
    }
  }, [isScreenshotGalleryOpen, rightPanelMode]);
  const handleOpenScreenshotItem = useCallback(
    async (item: ScreenshotMetadata) => {
      if (!item.slidePath) return;
      setPreviewMode("preview");
      setInteractionMode("preview");
      setSelectedId(null);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
      setPreviewNavigationFile(item.slidePath);
      pendingPopupOpenRef.current = {
        selector: item.popupSelector,
        popupId: item.popupId,
      };
      window.setTimeout(() => {
        if (!pendingPopupOpenRef.current) return;
        const success = openPopupInPreview(
          pendingPopupOpenRef.current.selector,
          pendingPopupOpenRef.current.popupId,
        );
        if (success) {
          pendingPopupOpenRef.current = null;
        }
      }, 700);
    },
    [openPopupInPreview],
  );
  const handleDeleteScreenshotItem = useCallback(
    async (item: ScreenshotMetadata) => {
      if (!projectPath) return;
      const absImage = `${normalizePath(projectPath)}/${item.imagePath}`;
      const absJson = absImage.replace(/\.png$/i, ".json");
      try {
        await (Neutralino as any).filesystem.remove(absImage);
      } catch {}
      try {
        await (Neutralino as any).filesystem.remove(absJson);
      } catch {}
      const nextItems = screenshotItems.filter((entry) => entry.id !== item.id);
      setScreenshotItems(nextItems);
      setScreenshotPreviewUrls((prev) => {
        const next = { ...prev };
        if (next[item.id]) {
          URL.revokeObjectURL(next[item.id]);
          delete next[item.id];
        }
        return next;
      });
      await writeScreenshotIndex(nextItems);
    },
    [projectPath, screenshotItems, writeScreenshotIndex],
  );
  const handleRevealScreenshotsFolder = useCallback(async () => {
    const folderPath = resolveScreenshotDir();
    if (!folderPath) return;
    try {
      await (Neutralino as any).os.open({ url: folderPath });
    } catch (error) {
      console.warn("Failed to open screenshots folder:", error);
    }
  }, [resolveScreenshotDir]);
  const handleExportEditablePdf = useCallback(async () => {
    if (!projectPath || isPdfExporting) return;
    const appRoot = normalizePath(String((window as any).NL_PATH || ""));
    const scriptPath = appRoot
      ? `${appRoot}/scripts/export_slides_pdf.mjs`
      : "";
    if (!scriptPath) return;
    const exportDir = resolvePdfExportDir();
    if (!exportDir) return;
    setIsPdfExporting(true);
    setPdfExportLogs(["Starting editable PDF export..."]);
    try {
      await ensureDirectoryTree(exportDir);
      const command = `node "${scriptPath}" "${normalizePath(
        projectPath,
      )}" "${exportDir}"`;
      const execResult = await (Neutralino as any).os.execCommand(command);
      const output = String(execResult?.stdOut || "").trim();
      const errorOutput = String(execResult?.stdErr || "").trim();
      const nextLogs: string[] = [];
      if (output) nextLogs.push(...output.split(/\r?\n/));
      if (errorOutput) nextLogs.push(...errorOutput.split(/\r?\n/));
      if ((execResult?.exitCode ?? 1) !== 0) {
        nextLogs.push("Export failed. See logs above.");
      } else if (nextLogs.length === 0) {
        nextLogs.push("Export finished.");
      }
      setPdfExportLogs((prev) => [...prev, ...nextLogs]);
    } catch (error) {
      console.error("Editable PDF export failed:", error);
      setPdfExportLogs((prev) => [
        ...prev,
        "Export failed. Check console for details.",
      ]);
    } finally {
      setIsPdfExporting(false);
    }
  }, [projectPath, isPdfExporting, ensureDirectoryTree, resolvePdfExportDir]);
  const clearPdfExportLogs = useCallback(() => {
    setPdfExportLogs([]);
  }, []);
  const refreshProjectFiles = useCallback(async () => {
    if (!projectPath) return;
    if (isRefreshingFilesRef.current) return;
    isRefreshingFilesRef.current = true;
    try {
      const rootPath = normalizePath(projectPath);
      const nextFiles: FileMap = {};
      const absolutePathIndex: Record<string, string> = {};
      const upsertFile = (virtualPath: string, absolutePath: string) => {
        const normalizedVirtual = normalizeProjectRelative(virtualPath);
        if (!normalizedVirtual) return;
        const existing = nextFiles[normalizedVirtual];
        if (existing) return;
        const name = normalizedVirtual.includes("/")
          ? normalizedVirtual.slice(normalizedVirtual.lastIndexOf("/") + 1)
          : normalizedVirtual;
        const oldEntry = filesRef.current[normalizedVirtual];
        const cachedText = textFileCacheRef.current[normalizedVirtual];
        const cachedBinary = binaryAssetUrlCacheRef.current[normalizedVirtual];
        let content: string | Blob = "";
        if (
          oldEntry &&
          typeof oldEntry.content === "string" &&
          oldEntry.content.length > 0
        ) {
          content = oldEntry.content;
        } else if (typeof cachedText === "string" && cachedText.length > 0) {
          content = cachedText;
        } else if (
          typeof cachedBinary === "string" &&
          cachedBinary.length > 0
        ) {
          content = cachedBinary;
        }
        nextFiles[normalizedVirtual] = {
          path: normalizedVirtual,
          name,
          type: inferFileType(name),
          content,
        };
        absolutePathIndex[normalizedVirtual] = normalizePath(absolutePath);
      };

      const walkDirectory = async (directoryPath: string): Promise<void> => {
        const entries = await (Neutralino as any).filesystem.readDirectory(
          directoryPath,
        );
        for (const entry of entries as Array<{ entry: string; type: string }>) {
          if (!entry?.entry || entry.entry === "." || entry.entry === "..")
            continue;
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

      for (const [virtualPath, absolutePath] of Object.entries(
        filePathIndexRef.current,
      )) {
        if (!virtualPath.toLowerCase().startsWith("shared/")) continue;
        if (absolutePathIndex[virtualPath]) continue;
        try {
          await (Neutralino as any).filesystem.getStats(absolutePath);
          upsertFile(virtualPath, absolutePath);
        } catch {
          // Removed shared file; ignore.
        }
      }

      filePathIndexRef.current = absolutePathIndex;
      setFiles(nextFiles);
      setCodeDraftByPath((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(
            ([path]) => nextFiles[path] && isTextFileType(nextFiles[path].type),
          ),
        ),
      );
      setCodeDirtyPathSet(
        (prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(
              ([path]) =>
                nextFiles[path] && isTextFileType(nextFiles[path].type),
            ),
          ) as Record<string, true>,
      );
      setDirtyFiles((prev) => prev.filter((path) => Boolean(nextFiles[path])));

      const existingActive = activeFileRef.current;
      const preferredPreview = selectedPreviewHtmlRef.current;
      if (!existingActive || !nextFiles[existingActive]) {
        const fallback =
          (preferredPreview && nextFiles[preferredPreview]
            ? preferredPreview
            : null) ??
          pickDefaultHtmlFile(nextFiles) ??
          Object.keys(nextFiles).find((path) =>
            isTextFileType(nextFiles[path].type),
          ) ??
          null;
        setActiveFileStable(fallback);
        setPreviewSyncedFile(fallback);
        setPreviewNavigationFile(fallback);
      }
    } catch (error) {
      console.warn("Failed to refresh file index:", error);
    } finally {
      isRefreshingFilesRef.current = false;
    }
  }, [projectPath, setActiveFileStable]);
  const handleCreateFileAtPath = useCallback(
    async (parentPath: string) => {
      if (!projectPath) return;
      const defaultName = "new-file.html";
      const nextName = window.prompt("New file name", defaultName);
      if (!nextName) return;
      const cleanedName = normalizeProjectRelative(nextName);
      if (!cleanedName) return;

      const baseVirtual = normalizeProjectRelative(parentPath || "");
      const nextVirtual = normalizeProjectRelative(
        baseVirtual ? `${baseVirtual}/${cleanedName}` : cleanedName,
      );
      if (!nextVirtual) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("A file with the same path already exists.");
        return;
      }

      const absolutePath = normalizePath(joinPath(projectPath, nextVirtual));
      const absoluteParent = getParentPath(absolutePath);
      if (absoluteParent) {
        await ensureDirectoryTree(absoluteParent);
      }
      try {
        await (Neutralino as any).filesystem.writeFile(absolutePath, "");
      } catch (error) {
        console.warn("Failed to create file:", error);
        window.alert("Could not create file.");
        return;
      }
      await refreshProjectFiles();
      setActiveFileStable(nextVirtual);
      setPreviewSyncedFile((prev) =>
        prev === nextVirtual ? prev : nextVirtual,
      );
      setPreviewNavigationFile((prev) =>
        prev === nextVirtual ? prev : nextVirtual,
      );
      setIsLeftPanelOpen(true);
    },
    [
      ensureDirectoryTree,
      projectPath,
      refreshProjectFiles,
      setActiveFileStable,
    ],
  );
  const handleCreateFolderAtPath = useCallback(
    async (parentPath: string) => {
      if (!projectPath) return;
      if (!selectedFolderCloneSource) {
        setIsConfigModalOpen(true);
        return;
      }
      const nextName = window.prompt("New folder name", "new-folder");
      if (!nextName) return;
      const cleanedName = normalizeProjectRelative(nextName);
      if (!cleanedName) return;
      const baseVirtual = normalizeProjectRelative(parentPath || "");
      const nextVirtual = normalizeProjectRelative(
        baseVirtual ? `${baseVirtual}/${cleanedName}` : cleanedName,
      );
      if (!nextVirtual) return;
      const absoluteSource = normalizePath(
        joinPath(projectPath, selectedFolderCloneSource),
      );
      const absolutePath = normalizePath(joinPath(projectPath, nextVirtual));
      try {
        await (Neutralino as any).filesystem.copy(
          absoluteSource,
          absolutePath,
          {
            recursive: true,
            overwrite: false,
            skip: false,
          },
        );
      } catch (error) {
        console.warn("Failed to clone directory:", error);
        window.alert("Could not clone folder.");
        return;
      }
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, selectedFolderCloneSource],
  );
  const handleRenamePath = useCallback(
    async (path: string) => {
      if (!projectPath) return;
      if (!path) return;
      const currentName = path.includes("/")
        ? path.slice(path.lastIndexOf("/") + 1)
        : path;
      const nextName = window.prompt("Rename to", currentName);
      if (!nextName) return;
      const normalizedName = normalizeProjectRelative(nextName);
      if (!normalizedName) return;
      const parentVirtual = getParentPath(path) || "";
      const nextVirtual = normalizeProjectRelative(
        parentVirtual ? `${parentVirtual}/${normalizedName}` : normalizedName,
      );
      if (!nextVirtual || nextVirtual === path) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("Another item with the same name already exists.");
        return;
      }
      const absoluteSource =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      const absoluteParent = getParentPath(absoluteSource);
      if (!absoluteParent) return;
      const absoluteDestination = normalizePath(
        joinPath(absoluteParent, normalizedName),
      );
      try {
        await (Neutralino as any).filesystem.move(
          absoluteSource,
          absoluteDestination,
        );
      } catch (error) {
        console.warn("Rename failed:", error);
        window.alert("Could not rename item.");
        return;
      }
      await refreshProjectFiles();
      if (activeFileRef.current === path) {
        setActiveFileStable(nextVirtual);
      }
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  const handleDeletePath = useCallback(
    async (path: string, kind: "file" | "folder") => {
      if (!projectPath || !path) return;
      const label = kind === "folder" ? "folder" : "file";
      const ok = window.confirm(`Delete ${label} "${path}"?`);
      if (!ok) return;
      const absoluteTarget =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      try {
        await (Neutralino as any).filesystem.remove(absoluteTarget);
      } catch (error) {
        console.warn("Delete failed:", error);
        window.alert("Could not delete item.");
        return;
      }
      if (
        activeFileRef.current &&
        (activeFileRef.current === path ||
          activeFileRef.current.startsWith(`${path}/`))
      ) {
        setActiveFileStable(null);
      }
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  const handleDuplicateFile = useCallback(
    async (path: string) => {
      if (!projectPath || !path) return;
      const absoluteSource =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      const currentName = path.includes("/")
        ? path.slice(path.lastIndexOf("/") + 1)
        : path;
      const dotIndex = currentName.lastIndexOf(".");
      const stem = dotIndex > 0 ? currentName.slice(0, dotIndex) : currentName;
      const ext = dotIndex > 0 ? currentName.slice(dotIndex) : "";
      const defaultName = `${stem}-copy${ext}`;
      const nextName = window.prompt("Duplicate as", defaultName);
      if (!nextName) return;
      const normalizedName = normalizeProjectRelative(nextName);
      if (!normalizedName) return;
      const parentVirtual = getParentPath(path) || "";
      const nextVirtual = normalizeProjectRelative(
        parentVirtual ? `${parentVirtual}/${normalizedName}` : normalizedName,
      );
      if (!nextVirtual) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("A file with this name already exists.");
        return;
      }
      const absoluteParent = getParentPath(absoluteSource);
      if (!absoluteParent) return;
      const absoluteDestination = normalizePath(
        joinPath(absoluteParent, normalizedName),
      );
      try {
        await (Neutralino as any).filesystem.copy(
          absoluteSource,
          absoluteDestination,
          {
            recursive: false,
            overwrite: false,
            skip: false,
          },
        );
      } catch (error) {
        console.warn("Duplicate failed:", error);
        window.alert("Could not duplicate file.");
        return;
      }
      await refreshProjectFiles();
      setActiveFileStable(nextVirtual);
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  useEffect(() => {
    if (!projectPath) return;
    const timer = window.setInterval(() => {
      void refreshProjectFiles();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [projectPath, refreshProjectFiles]);
  const resolveAdjacentSlidePath = useCallback(
    (fromPath: string, dir: "next" | "prev"): string | null => {
      const normalizedFrom = normalizeProjectRelative(String(fromPath || ""));
      const fromMatch = normalizePath(normalizedFrom).match(
        /^(.*_)([0-9]{3,})\/index\.html$/i,
      );
      if (!fromMatch) return null;
      const familyPrefix = fromMatch[1].toLowerCase();
      const currentNorm = normalizedFrom.toLowerCase();
      const slides = Object.keys(filesRef.current)
        .filter((path) => filesRef.current[path]?.type === "html")
        .map((path) => {
          const match = normalizePath(path).match(
            /^(.*_)([0-9]{3,})\/index\.html$/i,
          );
          if (!match || match[1].toLowerCase() !== familyPrefix) {
            return null;
          }
          return {
            path,
            normalized: normalizeProjectRelative(path).toLowerCase(),
            num: Number.parseInt(match[2], 10),
          };
        })
        .filter(
          (entry): entry is { path: string; normalized: string; num: number } =>
            Boolean(entry),
        )
        .sort((a, b) =>
          a.num !== b.num ? a.num - b.num : a.path.localeCompare(b.path),
        );
      if (slides.length === 0) return null;
      const index = slides.findIndex((item) => item.normalized === currentNorm);
      if (index < 0) return null;
      const nextIndex = dir === "next" ? index + 1 : index - 1;
      if (nextIndex < 0 || nextIndex >= slides.length) return null;
      return slides[nextIndex].path;
    },
    [],
  );
  const resolveExplorerHtmlPath = useCallback(
    (rawPath: string): string | null => {
      const normalized = normalizeProjectRelative(String(rawPath || ""));
      if (!normalized) return null;

      const direct =
        findFilePathCaseInsensitive(filesRef.current, normalized) || normalized;
      const directFile = filesRef.current[direct];
      if (directFile?.type === "html") return direct;

      const baseFolder = direct.replace(/\/+$/, "");
      const directIndex = findFilePathCaseInsensitive(
        filesRef.current,
        `${baseFolder}/index.html`,
      );
      if (directIndex && filesRef.current[directIndex]?.type === "html") {
        return directIndex;
      }

      const htmlUnderFolder = Object.keys(filesRef.current)
        .filter((path) => {
          const normalizedPath = normalizeProjectRelative(path);
          if (!normalizedPath.startsWith(`${baseFolder}/`)) return false;
          return filesRef.current[path]?.type === "html";
        })
        .sort((a, b) => a.localeCompare(b));
      if (htmlUnderFolder.length === 0) return null;
      return htmlUnderFolder[0];
    },
    [],
  );
  const handleSelectFile = useCallback(
    (path: string) => {
      const resolvedPath = resolveExplorerHtmlPath(path) || path;
      console.log("[Preview] Current page:", resolvedPath);

      const currentPath = selectedPreviewHtmlRef.current;
      const targetIsHtml = filesRef.current[resolvedPath]?.type === "html";

      if (targetIsHtml) {
        // THE FIX: Tag the exact time of the user's manual click
        (window as any).__explorerNavTime = Date.now();
      }

      if (
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        targetIsHtml &&
        currentPath &&
        currentPath !== resolvedPath &&
        hasUnsavedChangesForFile(currentPath)
      ) {
        setPendingPageSwitch({
          mode: "switch",
          fromPath: currentPath,
          nextPath: resolvedPath,
          source: "explorer",
        });
        setIsPageSwitchPromptOpen(true);
        setIsLeftPanelOpen(true);
        return;
      }

      if (activeFileRef.current === resolvedPath) {
        setIsLeftPanelOpen(true);
        if (
          filesRef.current[resolvedPath]?.type === "html" &&
          interactionModeRef.current !== "preview"
        ) {
          setInteractionMode("preview");
        }
        return;
      }

      if (targetIsHtml) {
        explorerSelectionLockRef.current = resolvedPath;
        explorerSelectionLockUntilRef.current =
          Date.now() + EXPLORER_LOCK_TTL_MS;
      }
      syncPreviewActiveFile(resolvedPath, "explorer");
      setIsLeftPanelOpen(true);
    },
    [
      EXPLORER_LOCK_TTL_MS,
      hasUnsavedChangesForFile,
      resolveExplorerHtmlPath,
      syncPreviewActiveFile,
    ],
  );
  const selectedElement = selectedId ? findElementById(root, selectedId) : null;
  const selectedPathIds = useMemo(
    () => collectPathIdsToElement(root, selectedId),
    [root, selectedId],
  );
  const previewLayerSelectedId = useMemo(() => {
    if (
      interactionMode !== "preview" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return null;
    }
    return toPreviewLayerId(previewSelectedPath);
  }, [interactionMode, previewSelectedPath]);
  const previewLayersRoot = useMemo<VirtualElement>(() => {
    if (interactionMode !== "preview") return root;
    const emptyPreviewRoot: VirtualElement = {
      id: "preview-live-root",
      type: "body",
      name: "Body",
      content: "",
      html: "",
      styles: {},
      children: [],
    };
    const liveDocument =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    const liveBody = liveDocument?.body ?? null;
    if (liveBody) {
      return {
        id: "preview-live-root",
        type: "body",
        name: "Body",
        content: "",
        html: liveBody.innerHTML || "",
        styles: {},
        children: Array.from(liveBody.children).map((child, index) =>
          buildPreviewLayerTreeFromElement(child, [index]),
        ),
      };
    }
    const activeHtmlPath = selectedPreviewHtmlRef.current;
    const activeHtmlFile =
      activeHtmlPath && files[activeHtmlPath] ? files[activeHtmlPath] : null;
    const activeHtmlContent =
      activeHtmlFile && typeof activeHtmlFile.content === "string"
        ? activeHtmlFile.content
        : "";
    const fallbackHtml =
      activeHtmlPath &&
      typeof textFileCacheRef.current[activeHtmlPath] === "string"
        ? textFileCacheRef.current[activeHtmlPath]
        : "";
    const sourceHtml =
      activeHtmlContent && activeHtmlContent.trim().length > 0
        ? activeHtmlContent
        : fallbackHtml && fallbackHtml.trim().length > 0
          ? fallbackHtml
          : selectedPreviewDoc;
    if (!sourceHtml || sourceHtml.trim().length === 0) return emptyPreviewRoot;
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const body = parsed.body;
      return {
        id: "preview-live-root",
        type: "body",
        name: "Body",
        content: "",
        html: body?.innerHTML || "",
        styles: {},
        children: body
          ? Array.from(body.children).map((child, index) =>
              buildPreviewLayerTreeFromElement(child, [index]),
            )
          : [],
      };
    } catch {
      return emptyPreviewRoot;
    }
  }, [files, interactionMode, previewRefreshNonce, root, selectedPreviewDoc]);
  const selectPreviewElementAtPath = useCallback((path: number[]) => {
    if (
      interactionModeRef.current !== "preview" ||
      !Array.isArray(path) ||
      path.length === 0
    ) {
      return;
    }
    const frameDocument =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    if (!frameDocument?.body) return;
    const target = readElementByPath(frameDocument.body, path);
    if (!target) return;
    Array.from(
      frameDocument.querySelectorAll<HTMLElement>(".__nx-preview-selected"),
    ).forEach((el) => el.classList.remove("__nx-preview-selected"));
    target.classList.add("__nx-preview-selected");
    const inlineStyles = parseInlineStyleText(
      target.getAttribute("style") || "",
    );
    const computedStyles = extractComputedStylesFromElement(target);
    const matchedCssRules = collectMatchedCssRulesFromElement(target);
    const nextElement: VirtualElement = {
      id:
        target.getAttribute("id") ||
        `preview-${toPreviewLayerId(path)}-${Date.now()}`,
      type: String(target.tagName || "div").toLowerCase(),
      name: String(target.tagName || "div").toUpperCase(),
      content: normalizeEditorMultilineText(extractTextWithBreaks(target)),
      html: target instanceof HTMLElement ? target.innerHTML || "" : "",
      ...(target.getAttribute("src")
        ? { src: target.getAttribute("src") || "" }
        : {}),
      ...(target.getAttribute("href")
        ? { href: target.getAttribute("href") || "" }
        : {}),
      ...(target.getAttribute("class")
        ? { className: target.getAttribute("class") || "" }
        : {}),
      ...(extractCustomAttributesFromElement(target)
        ? { attributes: extractCustomAttributesFromElement(target) || {} }
        : {}),
      styles: inlineStyles,
      children: [],
    };
    setPreviewSelectedPath(path);
    setPreviewSelectedElement(nextElement);
    setPreviewSelectedComputedStyles(computedStyles);
    setPreviewSelectedMatchedCssRules(matchedCssRules);
    setSelectedId(null);
    setIsCodePanelOpen(false);
    setIsRightPanelOpen(true);
  }, []);
  const handleSidebarSelectElement = useCallback(
    (id: string) => {
      const previewPath = fromPreviewLayerId(id);
      if (previewPath) {
        selectPreviewElementAtPath(previewPath);
        return;
      }
      handleSelect(id);
    },
    [handleSelect, selectPreviewElementAtPath],
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
  const currentPreviewSlideId = useMemo(() => {
    if (!selectedPreviewHtml) return null;
    const parts = normalizePath(selectedPreviewHtml).split("/").filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : null;
  }, [selectedPreviewHtml]);
  const unmappedPdfAnnotationCount = useMemo(
    () =>
      pdfAnnotationRecords.filter((record) => !record.mappedFilePath).length,
    [pdfAnnotationRecords],
  );

  // Sync ref with reactive state for use in callbacks
  useEffect(() => {
    selectedPreviewHtmlRef.current = selectedPreviewHtml;
  }, [selectedPreviewHtml]);

  const resolveMappedLabelShort = useCallback(
    (annotation: PdfAnnotationUiRecord) => {
      const raw =
        annotation.mappedSlideId ||
        (annotation.mappedFilePath
          ? annotation.mappedFilePath.split("/").filter(Boolean).slice(-2)[0]
          : null);
      if (!raw) return null;
      const normalized = String(raw);
      const match = normalized.match(/1\.\d/);
      if (match) {
        const index = normalized.lastIndexOf(match[0]);
        if (index >= 0) {
          const suffix = normalized.slice(index + match[0].length);
          const cleaned = suffix
            .replace(/^[\s._-]+/, "")
            .replace(/[\s._-]+$/, "");
          if (cleaned) {
            const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
            if (parts.length > 0) return parts[parts.length - 1];
          }
        }
      }
      const parts = normalized.split(/[\s._-]+/).filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : normalized;
    },
    [],
  );
  const visiblePdfAnnotations = useMemo(() => {
    if (pdfAnnotationViewMode === "perSlide") {
      if (!selectedPreviewHtml) return [];
      return pdfAnnotationRecords.filter(
        (record) => record.mappedFilePath === selectedPreviewHtml,
      );
    }
    return pdfAnnotationRecords;
  }, [pdfAnnotationRecords, pdfAnnotationViewMode, selectedPreviewHtml]);
  const annotationsForCurrentSlide = useMemo(() => {
    if (!selectedPreviewHtml) return [];
    const normalizedCurrent = normalizePath(selectedPreviewHtml);
    return pdfAnnotationRecords.filter((record) =>
      record.mappedFilePath
        ? normalizePath(record.mappedFilePath) === normalizedCurrent
        : false,
    );
  }, [pdfAnnotationRecords, selectedPreviewHtml]);
  const isPopupAnnotation = useCallback((annotation: PdfAnnotationUiRecord) => {
    if (annotation.annotationStatus) {
      return annotation.annotationStatus === "Popup";
    }
    if (annotation.detectedPageType === "Main") return false;
    if (
      annotation.subtype === "Popup" ||
      annotation.detectedSubtype === "Popup"
    ) {
      return true;
    }
    if (annotation.detectedPageType === "Child/Popup") return true;
    if (annotation.popupInvocation?.popupId) return true;
    if (annotation.mappedFilePath?.includes("/shared/")) return true;
    return false;
  }, []);
  const filteredAnnotationsForCurrentSlide = useMemo(() => {
    if (pdfAnnotationTypeFilter === "all") return annotationsForCurrentSlide;
    return annotationsForCurrentSlide.filter((annotation) => {
      const isPopup = isPopupAnnotation(annotation);
      return pdfAnnotationTypeFilter === "popup" ? isPopup : !isPopup;
    });
  }, [annotationsForCurrentSlide, pdfAnnotationTypeFilter, isPopupAnnotation]);
  const focusedAnnotationForCurrentSlide = useMemo(() => {
    if (!focusedPdfAnnotation || !selectedPreviewHtml) return null;
    return focusedPdfAnnotation.mappedFilePath === selectedPreviewHtml
      ? focusedPdfAnnotation
      : null;
  }, [focusedPdfAnnotation, selectedPreviewHtml]);
  useEffect(() => {
    const frame = previewFrameRef.current;
    const doc = frame?.contentDocument;

    const previous = previewFocusedPdfElementRef.current;
    if (previous) {
      previous.style.outline = "";
      previous.style.boxShadow = "";
      previous.style.transition = "";
      previous.removeAttribute("data-nx-pdf-focus");
      previewFocusedPdfElementRef.current = null;
    }

    if (!doc) return;

    const previousHighlights = [
      ...doc.querySelectorAll("[data-nx-pdf-anno]"),
    ] as HTMLElement[];
    for (const el of previousHighlights) {
      el.style.outline = "";
      el.style.boxShadow = "";
      el.style.transition = "";
      el.removeAttribute("data-nx-pdf-anno");
    }

    const normalizedCurrentPath = selectedPreviewHtml
      ? normalizePath(selectedPreviewHtml)
      : null;
    const annotationsForCurrentSlide = normalizedCurrentPath
      ? pdfAnnotationRecords.filter((record) =>
          record.mappedFilePath
            ? normalizePath(record.mappedFilePath) === normalizedCurrentPath
            : false,
        )
      : [];

    const resolveAnnotationTarget = (annotation: PdfAnnotationUiRecord) => {
      const selectors = [
        annotation.foundSelector,
        annotation.popupInvocation?.triggerSelector,
        annotation.popupInvocation?.containerSelector,
      ].filter((entry): entry is string => Boolean(entry));
      for (const selector of selectors) {
        const node = doc.querySelector(selector) as HTMLElement | null;
        if (node) return node;
      }
      return null;
    };

    const filteredAnnotations =
      pdfAnnotationTypeFilter === "all"
        ? annotationsForCurrentSlide
        : annotationsForCurrentSlide.filter((annotation) => {
            const isPopup = isPopupAnnotation(annotation);
            return pdfAnnotationTypeFilter === "popup" ? isPopup : !isPopup;
          });

    for (const annotation of filteredAnnotations) {
      const target = resolveAnnotationTarget(annotation);
      if (!target) continue;
      const isPopup = isPopupAnnotation(annotation);
      target.setAttribute("data-nx-pdf-anno", "true");
      target.style.transition = "outline 0.2s ease, box-shadow 0.2s ease";
      target.style.outline = isPopup
        ? "2px solid rgba(56,189,248,0.55)"
        : "2px solid rgba(34,197,94,0.65)";
      target.style.boxShadow = isPopup
        ? "0 0 0 4px rgba(56,189,248,0.16)"
        : "0 0 0 4px rgba(34,197,94,0.18)";
    }

    if (!focusedAnnotationForCurrentSlide) return;
    const focusedIsPopup = isPopupAnnotation(focusedAnnotationForCurrentSlide);
    if (
      pdfAnnotationTypeFilter !== "all" &&
      ((pdfAnnotationTypeFilter === "popup" && !focusedIsPopup) ||
        (pdfAnnotationTypeFilter === "slide" && focusedIsPopup))
    ) {
      return;
    }

    // --- NEW: Close all existing dialogs first to ensure clean transition ---
    try {
      // 1. Click all obvious close buttons
      const closeButtons = [
        ...doc.querySelectorAll(
          ".closeDialog, .close-dialog, .close, [data-dialog-close], .nx-close-overlay, .closePopup",
        ),
      ] as HTMLElement[];
      for (const btn of closeButtons) {
        try {
          btn.click();
        } catch {}
      }

      // 2. Force hide all common dialog containers
      const containers = [
        ...doc.querySelectorAll(
          ".popup, .dialog, .modal, [role='dialog'], [data-popup-id], .nx-popup-overlay",
        ),
      ] as HTMLElement[];
      for (const container of containers) {
        container.style.display = "none";
        container.style.visibility = "hidden";
        container.classList.remove("open", "active", "show", "is-visible");
        container.setAttribute("aria-hidden", "true");
      }

      // 3. Presentation Runtime Cleanup (GSK/Veeva specific)
      const frameWindow = frame?.contentWindow as any;
      if (frameWindow) {
        if (frameWindow.com?.gsk?.mt?.closeDialog) {
          try {
            frameWindow.com.gsk.mt.closeDialog();
          } catch {}
        }
        if (typeof frameWindow.$ === "function") {
          try {
            frameWindow
              .$(".popup, .dialog, .modal")
              .hide()
              .removeClass("open active show");
          } catch {}
        }
      }
    } catch (e) {
      console.warn("[NX] Failed to cleanup existing dialogs:", e);
    }
    // --------------------------------------------------------------------------

    const focusedTarget = resolveAnnotationTarget(
      focusedAnnotationForCurrentSlide,
    );
    if (focusedTarget) {
      focusedTarget.setAttribute("data-nx-pdf-focus", "true");
      focusedTarget.style.transition =
        "outline 0.2s ease, box-shadow 0.2s ease";
      focusedTarget.style.outline = "3px solid rgba(239,68,68,0.98)";
      focusedTarget.style.boxShadow = "0 0 0 6px rgba(239,68,68,0.35)";
      focusedTarget.scrollIntoView({ block: "center", inline: "center" });
      previewFocusedPdfElementRef.current = focusedTarget;
    }

    return;

    try {
      const popupInvocation =
        focusedAnnotationForCurrentSlide.popupInvocation || null;
      const normalizePopupId = (value: string | null | undefined) => {
        if (!value) return null;
        const cleaned = String(value).trim();
        if (!cleaned) return null;
        return cleaned.replace(/^#/, "");
      };
      const extractPopupIdFromNode = (node: Element | null): string | null => {
        if (!node) return null;
        const direct =
          normalizePopupId(node.getAttribute("data-dialog")) ||
          normalizePopupId(node.getAttribute("data-target")) ||
          normalizePopupId(node.getAttribute("href")) ||
          normalizePopupId(node.getAttribute("data-popup-id")) ||
          normalizePopupId((node as HTMLElement).id);
        if (direct) return direct;
        const onclick = node.getAttribute("onclick") || "";
        const match = onclick.match(/dialog[\w-]*/i);
        return normalizePopupId(match ? match[0] : null);
      };
      const getContainerSelectorFromElement = (
        node: Element | null,
      ): string | null => {
        if (!node) return null;
        const element = node as HTMLElement;
        if (element.id) return `#${element.id}`;
        const popupDataId = element.getAttribute("data-popup-id");
        if (popupDataId) return `[data-popup-id="${popupDataId}"]`;
        const role = element.getAttribute("role");
        if (role === "dialog") return `[role="dialog"]`;
        return null;
      };
      const overlapScore = (candidate: string, target: string) => {
        const normalizedCandidate = candidate
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const normalizedTarget = target
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (!normalizedCandidate || !normalizedTarget) return 0;
        if (normalizedCandidate.includes(normalizedTarget)) return 120;
        const candidateWords = normalizedCandidate
          .split(/[^a-z0-9]+/i)
          .filter((word) => word.length > 2);
        const targetWords = new Set(
          normalizedTarget
            .split(/[^a-z0-9]+/i)
            .filter((word) => word.length > 2),
        );
        if (!candidateWords.length || !targetWords.size) return 0;
        let overlap = 0;
        for (const word of candidateWords) {
          if (targetWords.has(word)) overlap += 1;
        }
        if (overlap < 1) return 0;
        return overlap * 14 + Math.min(candidateWords.length, 8);
      };
      const textHints = [
        focusedAnnotationForCurrentSlide.annotationText,
        focusedAnnotationForCurrentSlide.pdfContextText || "",
        ...focusedAnnotationForCurrentSlide.threadEntries.map(
          (entry) => entry.text,
        ),
      ]
        .map((entry) => String(entry || "").trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 8);
      const triggerNodes = [
        ...doc.querySelectorAll(
          "[data-dialog], .openDialog[data-dialog], [data-target], [href^='#dialog'], [onclick*='dialog']",
        ),
      ] as HTMLElement[];
      const containerNodes = [
        ...doc.querySelectorAll(
          ".popup, [data-popup-id], [role='dialog'], .modal, .dialog, [id*='dialog']",
        ),
      ] as HTMLElement[];
      const containerById = new Map<string, HTMLElement>();
      for (const containerNode of containerNodes) {
        const popupId = extractPopupIdFromNode(containerNode);
        if (!popupId || containerById.has(popupId)) continue;
        containerById.set(popupId, containerNode);
      }
      const genericPopupContainers = [
        ...doc.querySelectorAll(
          "[id*='popup'], [id*='modal'], [id*='dialog'], [class*='popup'], [class*='modal'], [class*='dialog'], [data-popup], [data-modal], [aria-haspopup='dialog']",
        ),
      ] as HTMLElement[];
      let runtimeResolvedPopup: {
        popupId: string;
        trigger: HTMLElement | null;
        container: HTMLElement | null;
      } | null = null;
      let bestScore = 0;
      for (const triggerNode of triggerNodes) {
        const popupId = extractPopupIdFromNode(triggerNode);
        if (!popupId) continue;
        const containerNode = containerById.get(popupId) || null;
        const candidateText = [
          triggerNode.textContent || "",
          containerNode?.textContent || "",
          popupId,
        ]
          .join(" ")
          .trim();
        let score = 0;
        for (const hint of textHints) {
          score = Math.max(score, overlapScore(candidateText, hint));
        }
        if (popupInvocation?.popupId && popupInvocation.popupId === popupId)
          score += 45;
        if (
          popupInvocation?.triggerSelector &&
          popupInvocation.triggerSelector ===
            (triggerNode.id
              ? `#${triggerNode.id}`
              : popupInvocation.triggerSelector)
        ) {
          score += 20;
        }
        if (score > bestScore) {
          bestScore = score;
          runtimeResolvedPopup = {
            popupId,
            trigger: triggerNode,
            container: containerNode,
          };
        }
      }
      const isExplicitPopup =
        focusedAnnotationForCurrentSlide.subtype === "Popup" ||
        focusedAnnotationForCurrentSlide.detectedSubtype === "Popup";

      const minRequiredScore = isExplicitPopup ? 20 : 65; // Non-popups need MUCH higher proof to trigger a dialog

      if (bestScore < minRequiredScore) {
        for (const [popupId, containerNode] of containerById.entries()) {
          const candidateText = [containerNode.textContent || "", popupId]
            .join(" ")
            .trim();
          let score = 0;
          for (const hint of textHints) {
            score = Math.max(score, overlapScore(candidateText, hint));
          }
          if (score > bestScore) {
            bestScore = score;
            runtimeResolvedPopup = {
              popupId,
              trigger: null,
              container: containerNode,
            };
          }
        }
      }
      if (bestScore < minRequiredScore) {
        for (const containerNode of genericPopupContainers) {
          const popupId =
            extractPopupIdFromNode(containerNode) ||
            normalizePopupId(containerNode.id) ||
            `runtime-${Math.random().toString(36).slice(2, 8)}`;
          const candidateText = [
            containerNode.textContent || "",
            popupId,
            containerNode.className || "",
          ]
            .join(" ")
            .trim();
          let score = 0;
          for (const hint of textHints) {
            score = Math.max(score, overlapScore(candidateText, hint));
          }
          if (score > bestScore) {
            bestScore = score;
            runtimeResolvedPopup = {
              popupId,
              trigger: null,
              container: containerNode,
            };
          }
        }
      }

      // If after all scans the score is still below threshold, discard the runtime result
      if (bestScore < minRequiredScore) {
        runtimeResolvedPopup = null;
      }

      if (!runtimeResolvedPopup && popupInvocation?.popupId) {
        const fallbackContainer =
          containerById.get(popupInvocation.popupId) || null;
        runtimeResolvedPopup = {
          popupId: popupInvocation.popupId,
          trigger: null,
          container: fallbackContainer,
        };
      }
      const primarySelector = focusedAnnotationForCurrentSlide.foundSelector;
      const fallbackPopupTriggerSelector =
        popupInvocation?.triggerSelector || null;
      const target = ((primarySelector
        ? doc.querySelector(primarySelector)
        : null) ||
        (fallbackPopupTriggerSelector
          ? doc.querySelector(fallbackPopupTriggerSelector)
          : null) ||
        runtimeResolvedPopup?.trigger ||
        runtimeResolvedPopup?.container) as HTMLElement | null;
      if (target) {
        target.setAttribute("data-nx-pdf-focus", "true");
        target.style.transition = "outline 0.2s ease, box-shadow 0.2s ease";
        target.style.outline = "3px solid rgba(34,211,238,0.95)";
        target.style.boxShadow =
          "0 0 0 6px rgba(34,211,238,0.18), 0 0 28px rgba(34,211,238,0.32)";
        target.scrollIntoView({ block: "center", inline: "center" });
        previewFocusedPdfElementRef.current = target;
      }

      const isNavBottomSpecial = !!(
        target &&
        (target.id === "pi" ||
          target.id === "si" ||
          target.id === "references" ||
          target.id === "objection" ||
          target.id === "quickres" ||
          target.classList.contains("gotoSlide") ||
          target
            .getAttribute("data-description")
            ?.toLowerCase()
            .includes("pi") ||
          target
            .getAttribute("data-description")
            ?.toLowerCase()
            .includes("reference"))
      );

      const intent = focusedAnnotationForCurrentSlide.annotationIntent;
      const subtype = focusedAnnotationForCurrentSlide.annotationType;
      const isExcludedIntent = intent === "flowChange" || intent === "notFound";

      const shouldOpenSlidePopup = Boolean(
        !isExcludedIntent &&
        (isNavBottomSpecial ||
          popupInvocation?.triggerSelector ||
          popupInvocation?.containerSelector ||
          popupInvocation?.popupId ||
          runtimeResolvedPopup?.trigger ||
          runtimeResolvedPopup?.container ||
          runtimeResolvedPopup?.popupId ||
          (target &&
            (target.classList.contains("openDialog") ||
              Boolean(target.getAttribute("data-dialog"))))),
      );
      if (shouldOpenSlidePopup && ALLOW_POPUP_OPEN_FROM_PDF) {
        const popupTriggerCandidates: Array<HTMLElement | null> = [
          primarySelector
            ? (doc.querySelector(primarySelector) as HTMLElement | null)
            : null, // HIGHEST PRIORITY
          runtimeResolvedPopup?.trigger || null,
          popupInvocation?.triggerSelector
            ? (doc.querySelector(
                popupInvocation.triggerSelector,
              ) as HTMLElement | null)
            : null,
          popupInvocation?.popupId
            ? (doc.querySelector(
                `[data-dialog="#${popupInvocation.popupId}"], [data-dialog="${popupInvocation.popupId}"], .openDialog[data-dialog="#${popupInvocation.popupId}"], .openDialog[data-dialog="${popupInvocation.popupId}"]`,
              ) as HTMLElement | null)
            : null,
          target,
        ];
        const popupTrigger =
          popupTriggerCandidates.find((entry) => Boolean(entry)) || null;
        if (popupTrigger) {
          try {
            popupTrigger.click();
          } catch {
            // ignore
          }
          popupTrigger.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
          );
        }
        const popupIdForOpen =
          runtimeResolvedPopup?.popupId || popupInvocation?.popupId || null;
        if (popupIdForOpen) {
          const normalizedPopupId = popupIdForOpen.replace(/^#/, "");
          const directDialogSelector = `#${normalizedPopupId}`;
          const openViaMtRuntime = () => {
            const nextFrameWindow = frame?.contentWindow as any;
            const nextFrameJquery = nextFrameWindow?.$;
            const nextFrameMt = nextFrameWindow?.com?.gsk?.mt;
            if (
              !nextFrameMt ||
              typeof nextFrameMt.openDialog !== "function" ||
              typeof nextFrameJquery !== "function"
            ) {
              return false;
            }
            try {
              const directDialogNode = nextFrameJquery(directDialogSelector);
              if (directDialogNode && directDialogNode.length > 0) {
                nextFrameMt.openDialog(directDialogNode);
                return true;
              }
            } catch {}
            return false;
          };
          const frameWindow = frame?.contentWindow as any;
          const frameJquery = frameWindow?.$;
          const frameMt = frameWindow?.com?.gsk?.mt;
          const frameReleaseEvent =
            typeof frameMt?.releaseEvent === "string" && frameMt.releaseEvent
              ? frameMt.releaseEvent
              : "mouseup";
          const mtOpenedImmediately = openViaMtRuntime();
          if (!mtOpenedImmediately) {
            window.setTimeout(openViaMtRuntime, 80);
            window.setTimeout(openViaMtRuntime, 180);
            window.setTimeout(openViaMtRuntime, 320);
            window.setTimeout(openViaMtRuntime, 560);
            window.setTimeout(openViaMtRuntime, 900);
          }
          const popupFunctionCandidates = [
            "openDialog",
            "showDialog",
            "openPopup",
            "showPopup",
            "toggleDialog",
            "togglePopup",
          ];
          for (const functionName of popupFunctionCandidates) {
            const fn = frameWindow?.[functionName];
            if (typeof fn !== "function") continue;
            try {
              fn(`#${popupIdForOpen}`);
            } catch {}
            try {
              fn(popupIdForOpen);
            } catch {}
          }
          const allPopupTriggers = [
            ...doc.querySelectorAll(
              `[data-dialog="#${popupIdForOpen}"], [data-dialog="${popupIdForOpen}"], .openDialog[data-dialog="#${popupIdForOpen}"], .openDialog[data-dialog="${popupIdForOpen}"], [data-target="#${popupIdForOpen}"], [href="#${popupIdForOpen}"]`,
            ),
          ] as HTMLElement[];
          for (const triggerNode of allPopupTriggers) {
            try {
              triggerNode.click();
            } catch {
              // ignore
            }
            try {
              if (typeof frameJquery === "function") {
                frameJquery(triggerNode).trigger(frameReleaseEvent);
              }
            } catch {}
            triggerNode.dispatchEvent(
              new MouseEvent("click", { bubbles: true, cancelable: true }),
            );
            triggerNode.dispatchEvent(
              new MouseEvent(frameReleaseEvent, {
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        }
        const resolvedContainerSelector = runtimeResolvedPopup?.container
          ? getContainerSelectorFromElement(runtimeResolvedPopup.container)
          : null;
        const dialogSelector =
          resolvedContainerSelector ||
          popupInvocation?.containerSelector ||
          popupTrigger?.getAttribute("data-dialog") ||
          (runtimeResolvedPopup?.popupId
            ? `#${runtimeResolvedPopup.popupId}`
            : popupInvocation?.popupId
              ? `#${popupInvocation.popupId}`
              : null);
        const popupOpenSelectors = [
          dialogSelector,
          popupInvocation?.popupId
            ? `[data-popup-id="${popupInvocation.popupId}"], #${popupInvocation.popupId}`
            : null,
          runtimeResolvedPopup?.popupId
            ? `[data-popup-id="${runtimeResolvedPopup.popupId}"], #${runtimeResolvedPopup.popupId}`
            : null,
          runtimeResolvedPopup?.container
            ? getContainerSelectorFromElement(runtimeResolvedPopup.container)
            : null,
        ].filter((entry): entry is string => Boolean(entry));
        if (popupOpenSelectors.length > 0 || runtimeResolvedPopup?.container) {
          const applyPopupFocus = () => {
            try {
              let popupTarget: HTMLElement | null = null;
              for (const selector of popupOpenSelectors) {
                popupTarget = doc.querySelector(selector) as HTMLElement | null;
                if (popupTarget) break;
              }
              if (!popupTarget) {
                popupTarget = (runtimeResolvedPopup?.container ||
                  null) as HTMLElement | null;
              }
              if (!popupTarget) return;
              popupTarget.style.display = popupTarget.style.display || "block";
              popupTarget.style.visibility = "visible";
              popupTarget.style.opacity = popupTarget.style.opacity || "1";
              popupTarget.classList.add("open");
              popupTarget.classList.add("active");
              popupTarget.classList.add("show");
              popupTarget.classList.remove("hidden");
              popupTarget.classList.remove("is-hidden");
              popupTarget.classList.remove("closed");
              popupTarget.setAttribute("aria-hidden", "false");
              popupTarget.removeAttribute("hidden");
              popupTarget.style.pointerEvents = "auto";
              if (
                previewFocusedPdfElementRef.current &&
                previewFocusedPdfElementRef.current !== popupTarget
              ) {
                previewFocusedPdfElementRef.current.style.outline = "";
                previewFocusedPdfElementRef.current.style.boxShadow = "";
                previewFocusedPdfElementRef.current.style.transition = "";
                previewFocusedPdfElementRef.current.removeAttribute(
                  "data-nx-pdf-focus",
                );
              }
              popupTarget.setAttribute("data-nx-pdf-focus", "true");
              popupTarget.style.transition =
                "outline 0.2s ease, box-shadow 0.2s ease";
              popupTarget.style.outline = "3px solid rgba(34,211,238,0.95)";
              popupTarget.style.boxShadow =
                "0 0 0 6px rgba(34,211,238,0.18), 0 0 28px rgba(34,211,238,0.32)";
              popupTarget.scrollIntoView({ block: "center", inline: "center" });
              previewFocusedPdfElementRef.current = popupTarget;
            } catch (error) {
              console.warn("Failed to focus popup container:", error);
            }
          };
          window.setTimeout(applyPopupFocus, 40);
          window.setTimeout(applyPopupFocus, 140);
          window.setTimeout(applyPopupFocus, 280);
        }
      }
    } catch (error) {
      console.warn("Failed to focus PDF annotation target:", error);
    }
  }, [
    focusedAnnotationForCurrentSlide,
    isPopupAnnotation,
    pdfAnnotationRecords,
    pdfAnnotationTypeFilter,
    previewRefreshNonce,
    previewFrameLoadNonce,
    selectedPreviewHtml,
  ]);

  // --- NEW: Automatic Tablet Orientation Switching ---
  useEffect(() => {
    if (!selectedPreviewHtml) return;

    const index = resourceScanner.getFullIndex();
    // 1. Try to find the slide in the slides index
    const slideId = currentPreviewSlideId;
    if (!slideId) return;

    const slideEntry = index.slides[slideId] || index.popups[slideId];
    if (slideEntry?.orientation) {
      if (slideEntry.orientation !== tabletOrientation) {
        console.log(
          `[NX] Auto-switching tablet orientation to ${slideEntry.orientation} for slide ${slideId}`,
        );
        setTabletOrientation(slideEntry.orientation);
      }
    } else {
      // Fallback: If path contains "Vertical", force portrait
      // Only check the last few segments of the path to avoid picking up parent folders
      const pathParts = selectedPreviewHtml.toLowerCase().split(/[\\/]/);
      const relevantSegments = pathParts.slice(-2).join("/"); // Just the file and its folder

      if (
        relevantSegments.includes("vertical") ||
        relevantSegments.includes("portrait")
      ) {
        if (tabletOrientation !== "portrait") {
          setTabletOrientation("portrait");
        }
      } else {
        // Explicitly switch back to landscape for anything else if no entry found
        if (tabletOrientation !== "landscape") {
          setTabletOrientation("landscape");
        }
      }
    }
  }, [selectedPreviewHtml, currentPreviewSlideId, tabletOrientation]);
  // ----------------------------------------------------

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
  const shouldShowFrameWelcome = !projectPath;
  useEffect(() => {
    const setActive = (active: boolean) => setIsToolboxDragging(active);
    const onToolboxDragState = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; type?: string }>)
        .detail;
      const isActive = Boolean(detail?.active);
      const nextType = String(detail?.type || "").trim();
      setActive(isActive);
      if (isActive && nextType) {
        toolboxDragTypeRef.current = nextType;
      } else if (!isActive) {
        toolboxDragTypeRef.current = "";
      }
    };
    const onWindowDrop = () => {
      setActive(false);
      toolboxDragTypeRef.current = "";
    };
    const onWindowDragEnd = () => {
      setActive(false);
      toolboxDragTypeRef.current = "";
    };
    const onWindowDragOver = (event: DragEvent) => {
      if (hasToolboxDragType(event.dataTransfer)) {
        setActive(true);
      }
    };
    window.addEventListener(
      "nocodex-toolbox-drag-state",
      onToolboxDragState as EventListener,
    );
    window.addEventListener("drop", onWindowDrop);
    window.addEventListener("dragend", onWindowDragEnd);
    window.addEventListener("dragover", onWindowDragOver);
    return () => {
      window.removeEventListener(
        "nocodex-toolbox-drag-state",
        onToolboxDragState as EventListener,
      );
      window.removeEventListener("drop", onWindowDrop);
      window.removeEventListener("dragend", onWindowDragEnd);
      window.removeEventListener("dragover", onWindowDragOver);
    };
  }, []);
  useEffect(() => {
    selectedPreviewHtmlRef.current = selectedPreviewHtml;
    setPreviewSelectedPath(null);
    setPreviewSelectedElement(null);
    setPreviewSelectedComputedStyles(null);
  }, [selectedPreviewHtml]);
  const handlePreviewStageDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (
        !selectedPreviewHtml ||
        (!hasToolboxDragType(event.dataTransfer) && !toolboxDragTypeRef.current)
      ) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [selectedPreviewHtml],
  );

  const resolveVirtualPathFromMountRelative = useCallback(
    (mountRelativePath: string): string | null => {
      if (!previewMountBasePath || !mountRelativePath) return null;
      const normalizedTarget = normalizeProjectRelative(
        decodeURIComponent(mountRelativePath).replace(/^\/+|\/+$/g, ""),
      ).toLowerCase();
      if (!normalizedTarget) return null;

      for (const virtualPath in filePathIndexRef.current) {
        const absolutePath = filePathIndexRef.current[virtualPath];
        const relative = toMountRelativePath(
          previewMountBasePath,
          absolutePath,
        );
        if (!relative) continue;
        if (
          relative.toLowerCase() === normalizedTarget ||
          relative.toLowerCase() === `${normalizedTarget}/index.html`
        ) {
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
    (
      nextMode: "edit" | "preview",
      options?: { skipUnsavedPrompt?: boolean },
    ) => {
      const currentPath = selectedPreviewHtmlRef.current;
      const shouldPromptUnsaved =
        !options?.skipUnsavedPrompt &&
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        nextMode === "preview" &&
        Boolean(currentPath) &&
        hasUnsavedChangesForFile(currentPath);
      if (shouldPromptUnsaved && currentPath) {
        setPendingPageSwitch({
          mode: "preview_mode",
          fromPath: currentPath,
          nextPath: currentPath,
          source: "navigate",
          nextPreviewMode: "preview",
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
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
    [hasUnsavedChangesForFile, postPreviewModeToFrame],
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
      if (projectPath) {
        setPreviewMode("edit");
        setInteractionMode("preview");
        return;
      }
      setInteractionMode(nextMode);
    },
    [
      drawElementTag,
      postPreviewModeToFrame,
      projectPath,
      setPreviewModeWithSync,
    ],
  );
  const sidebarInteractionMode = useMemo<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >(() => {
    if (interactionMode === "preview") {
      return previewMode === "edit" ? sidebarToolMode : "preview";
    }
    return interactionMode;
  }, [interactionMode, previewMode, sidebarToolMode]);
  const resolvedConfigVirtualPath = useMemo(
    () => resolveConfigPathFromFiles(files, "config.json") || CONFIG_JSON_PATH,
    [files],
  );
  const resolvedPortfolioConfigVirtualPath = useMemo(
    () =>
      resolveConfigPathFromFiles(files, "portfolioconfig.json") ||
      PORTFOLIO_CONFIG_PATH,
    [files],
  );
  const configPathForModal = configModalConfigPath || resolvedConfigVirtualPath;
  const portfolioPathForModal =
    configModalPortfolioPath || resolvedPortfolioConfigVirtualPath;
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
      if (Array.isArray(path) && path.length > 0) {
        const byPath = readElementByPath(frameDocument.body, path);
        if (byPath) return byPath;
      }
      const byMarker = frameDocument.querySelector(".__nx-preview-selected");
      if (byMarker) return byMarker;
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
      setPreviewFrameLoadNonce((prev) => prev + 1);

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

      const lockPath = explorerSelectionLockRef.current;
      const lockActive =
        Boolean(lockPath) &&
        Date.now() <= explorerSelectionLockUntilRef.current;
      if (lockPath && !lockActive) {
        explorerSelectionLockRef.current = null;
        explorerSelectionLockUntilRef.current = 0;
      }
      if (lockPath && lockActive) {
        const resolvedNorm =
          normalizeProjectRelative(resolvedVirtualPath).toLowerCase();
        const lockNorm = normalizeProjectRelative(lockPath).toLowerCase();
        if (resolvedNorm !== lockNorm) {
          return;
        }
        explorerSelectionLockRef.current = null;
        explorerSelectionLockUntilRef.current = 0;
      }

      const resolvedFile = filesRef.current[resolvedVirtualPath];
      if (!resolvedFile || resolvedFile.type !== "html") return;

      // THE FIX: Block rogue automated script redirects after manual click
      const lockAge = Date.now() - ((window as any).__explorerNavTime || 0);
      if (lockAge < 2500 && resolvedVirtualPath !== activeFileRef.current) {
        return;
      }

      if (resolvedVirtualPath === activeFileRef.current) return;
      if (!shouldProcessPreviewPageSignal(resolvedVirtualPath)) return;

      console.log("[Preview] Current page:", resolvedVirtualPath);

      syncPreviewActiveFile(resolvedVirtualPath, "load", {
        skipUnsavedPrompt: true,
      });

      if (pendingPopupOpenRef.current) {
        const pending = pendingPopupOpenRef.current;
        window.setTimeout(() => {
          if (!pendingPopupOpenRef.current) return;
          const opened = openPopupInPreview(pending.selector, pending.popupId);
          if (opened) {
            pendingPopupOpenRef.current = null;
          }
        }, 180);
      }
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
      openPopupInPreview,
    ],
  );
  useEffect(() => {
    const frame = previewFrameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc || !win) return;

    const handleContextMenu = (event: MouseEvent) => {
      if (interactionModeRef.current !== "preview") return;
      const selection = win.getSelection?.();
      if (!selection || selection.isCollapsed) {
        hideQuickTextEdit();
        return;
      }
      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range) {
        hideQuickTextEdit();
        return;
      }
      quickTextRangeRef.current = range.cloneRange();
      event.preventDefault();
      event.stopPropagation();
      positionQuickTextEditAtRange(range);
    };

    const handleSelectionChange = () => {
      const selection = win.getSelection?.();
      if (!selection || selection.rangeCount === 0) {
        hideQuickTextEdit();
        return;
      }
      if (selection.isCollapsed) {
        hideQuickTextEdit();
        return;
      }
      try {
        const range = selection.getRangeAt(0);
        quickTextRangeRef.current = range.cloneRange();
        positionQuickTextEditAtRange(range);
      } catch {}
    };

    doc.addEventListener("contextmenu", handleContextMenu);
    doc.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      doc.removeEventListener("contextmenu", handleContextMenu);
      doc.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [previewFrameLoadNonce, hideQuickTextEdit, positionQuickTextEditAtRange]);
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
        skipAutoSave?: boolean;
        elementPath?: number[];
        pushToHistory?: boolean;
      },
    ) => {
      const shouldRefreshPreviewDoc = options?.refreshPreviewDoc ?? false;
      const shouldSaveNow = options?.saveNow ?? false;
      const shouldSkipAutoSave = options?.skipAutoSave ?? false;
      const shouldPushToHistory = options?.pushToHistory ?? true;
      const previousSerialized =
        typeof filesRef.current[updatedPath]?.content === "string"
          ? (filesRef.current[updatedPath]?.content as string)
          : typeof textFileCacheRef.current[updatedPath] === "string"
            ? textFileCacheRef.current[updatedPath]
            : "";

      // CRITICAL SAFETY GUARD: Prevent accidental wiping of files
      if (!serialized || serialized.trim().length === 0) {
        console.error(
          `[CRITICAL] Safety Guard: Blocked attempt to write empty content to ${updatedPath}`,
        );
        return;
      }

      if (
        previousSerialized &&
        previousSerialized.length > 500 &&
        serialized.length < 100
      ) {
        console.error(
          `[CRITICAL] Safety Guard: Blocked suspicious downsizing of ${updatedPath} (from ${previousSerialized.length} to ${serialized.length} bytes)`,
        );
        return;
      }

      // --- FIX: Scrub the bridge attribute and transient editor classes before saving ---
      serialized = serialized
        .replace(/\s*data-nx-mounted-preview-bridge=(["']?)1\1/gi, "")
        .replace(/\s*__nx-preview-selected/g, "")
        .replace(/\s*__nx-preview-dirty/g, "")
        .replace(/\s*__nx-preview-editing/g, "")
        .replace(/\s+class=(["'])\s*\1/g, ""); // Cleans up empty class attributes left behind

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
      if (shouldRefreshPreviewDoc && currentEntry) {
        if (!isMountedPreview) {
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
        } else if (!shouldSaveNow) {
          setPreviewRefreshNonce((prev) => prev + 1);
        }
      }

      if (shouldSaveNow) {
        await flushPendingPreviewSaves();
        if (shouldRefreshPreviewDoc && isMountedPreview) {
          setPreviewRefreshNonce((prev) => prev + 1);
        }
        return;
      }
      if (!shouldSkipAutoSave) {
        schedulePreviewAutoSave();
      }
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
  const applyPreviewInlineEditDraft = useCallback(
    async (filePath: string, elementPath: number[], nextInnerHtml: string) => {
      if (
        !filePath ||
        !Array.isArray(elementPath) ||
        elementPath.length === 0
      ) {
        return;
      }
      const sourceHtml =
        typeof filesRef.current[filePath]?.content === "string"
          ? (filesRef.current[filePath]?.content as string)
          : typeof textFileCacheRef.current[filePath] === "string"
            ? textFileCacheRef.current[filePath]
            : "";
      if (!sourceHtml) return;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, elementPath);
      if (!target) return;
      target.innerHTML = nextInnerHtml;
      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(filePath, serialized, {
        refreshPreviewDoc: false,
        pushToHistory: false,
      });
    },
    [persistPreviewHtmlContent],
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
      const liveElement = getLivePreviewSelectedElement(normalizedPath);
      const snapshotElement =
        liveElement instanceof HTMLElement
          ? liveElement
          : target instanceof HTMLElement
            ? target
            : null;
      const snapshotNode: Element = snapshotElement || target;
      const snapshotInlineStyle =
        snapshotElement instanceof HTMLElement
          ? snapshotElement.getAttribute("style") || ""
          : snapshotNode.getAttribute("style") || "";
      const snapshotInlineStyles = parseInlineStyleText(snapshotInlineStyle);
      const snapshotComputedStyles =
        extractComputedStylesFromElement(snapshotElement || snapshotNode) ||
        null;
      const snapshotText = normalizeEditorMultilineText(
        extractTextWithBreaks(snapshotNode),
      );
      const snapshotHtml =
        snapshotElement instanceof HTMLElement
          ? snapshotElement.innerHTML || ""
          : target.innerHTML || nextInnerHtml;
      const snapshotAttributes =
        extractCustomAttributesFromElement(snapshotElement || snapshotNode) ||
        undefined;
      const snapshotSrc =
        snapshotElement instanceof HTMLElement
          ? snapshotElement.getAttribute("src") || undefined
          : snapshotNode.getAttribute("src") || undefined;
      const snapshotHref =
        snapshotElement instanceof HTMLElement
          ? snapshotElement.getAttribute("href") || undefined
          : snapshotNode.getAttribute("href") || undefined;
      const snapshotClassName =
        snapshotElement && typeof snapshotElement.className === "string"
          ? snapshotElement.className
          : typeof snapshotNode.className === "string"
            ? snapshotNode.className
            : undefined;
      const snapshotTag = String(snapshotNode.tagName || "div").toLowerCase();
      const inlineAnimation =
        typeof snapshotInlineStyles.animation === "string"
          ? snapshotInlineStyles.animation.trim()
          : "";
      const computedAnimationCandidate =
        snapshotComputedStyles &&
        typeof snapshotComputedStyles.animation === "string"
          ? snapshotComputedStyles.animation.trim()
          : "";
      const resolvedAnimation =
        inlineAnimation ||
        (computedAnimationCandidate &&
        !/^none(?:\s|$)/i.test(computedAnimationCandidate)
          ? computedAnimationCandidate
          : "");
      setPreviewSelectedPath(normalizedPath);
      setPreviewSelectedComputedStyles(snapshotComputedStyles);
      setPreviewSelectedElement({
        id:
          snapshotElement?.id ||
          snapshotNode.getAttribute("id") ||
          `preview-${Date.now()}`,
        type: snapshotTag,
        name: snapshotTag.toUpperCase(),
        content: snapshotText,
        html: snapshotHtml,
        ...(snapshotSrc ? { src: snapshotSrc } : {}),
        ...(snapshotHref ? { href: snapshotHref } : {}),
        ...(snapshotClassName ? { className: snapshotClassName } : {}),
        ...(snapshotAttributes ? { attributes: snapshotAttributes } : {}),
        ...(resolvedAnimation ? { animation: resolvedAnimation } : {}),
        styles: snapshotInlineStyles,
        children: [],
      });
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      selectedPreviewHtml,
    ],
  );
  const syncPreviewSelectionSnapshotFromLiveElement = useCallback(
    (elementPath: number[]) => {
      const liveElement = getLivePreviewSelectedElement(elementPath);
      if (!(liveElement instanceof HTMLElement)) return false;

      const inlineStyles = parseInlineStyleText(
        liveElement.getAttribute("style") || "",
      );
      const computedStyles =
        extractComputedStylesFromElement(liveElement) || null;
      const matchedCssRules = collectMatchedCssRulesFromElement(liveElement);
      const liveAttributes =
        extractCustomAttributesFromElement(liveElement) || undefined;
      const liveSrc = liveElement.getAttribute("src") || "";
      const liveHref = liveElement.getAttribute("href") || "";
      const liveTag = String(liveElement.tagName || "div").toLowerCase();
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

      setPreviewSelectedComputedStyles(computedStyles);
      setPreviewSelectedMatchedCssRules(matchedCssRules);
      setPreviewSelectedElement((prev) => ({
        id: liveElement.id || prev?.id || `preview-${Date.now()}`,
        type: liveTag,
        name: liveTag.toUpperCase(),
        content: normalizeEditorMultilineText(
          extractTextWithBreaks(liveElement),
        ),
        html: liveElement.innerHTML || prev?.html || "",
        ...(liveSrc ? { src: liveSrc } : {}),
        ...(liveHref ? { href: liveHref } : {}),
        ...(liveElement.className ? { className: liveElement.className } : {}),
        ...(liveAttributes ? { attributes: liveAttributes } : {}),
        ...(resolvedAnimation ? { animation: resolvedAnimation } : {}),
        styles: inlineStyles,
        children: [],
      }));

      return true;
    },
    [getLivePreviewSelectedElement],
  );
  useEffect(() => {
    const ensureCdpBridge = async () => {
      const nlPort = String((window as any).NL_PORT || "").trim();
      if (!nlPort) return;

      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 600);
        try {
          const response = await fetch("http://127.0.0.1:38991/health", {
            signal: controller.signal,
          });
          if (response.ok) return;
        } finally {
          window.clearTimeout(timeoutId);
        }
      } catch {
        // Bridge is not running yet.
      }

      const appRoot = normalizePath(String((window as any).NL_PATH || ""));
      if (!appRoot) return;

      const candidatePaths = [
        `${appRoot}/native/cdp_bridge.exe`,
        `${appRoot}/native/cdp_bridge/target/release/cdp_bridge.exe`,
        `${appRoot}/native/cdp_bridge/target/debug/cdp_bridge.exe`,
      ];

      for (const candidatePath of candidatePaths) {
        try {
          await (Neutralino as any).filesystem.getStats(candidatePath);
          await (Neutralino as any).os.spawnProcess(
            `"${candidatePath}" --cdp-port 9222 --listen-port 38991`,
            appRoot,
          );
          return;
        } catch {
          // Try the next candidate path.
        }
      }
    };

    void ensureCdpBridge();
  }, []);
  useEffect(() => {
    if (
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0 ||
      !previewSelectedElement
    ) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch("http://127.0.0.1:38991/inspect-selected", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cdp_port: 9222,
            iframe_title: "project-preview",
            selected_selector: ".__nx-preview-selected",
            target_url_contains: window.location.origin,
          }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload =
          (await response.json()) as CdpInspectSelectedResponse | null;
        if (!payload?.ok) return;

        const cdpComputedStyles = toReactComputedStylesFromCdp(
          payload.computedStyles,
        );
        const cdpMatchedCssRules = derivePreviewMatchedCssRulesFromCdp(
          payload.matchedStyles,
          previewSelectedMatchedCssRules,
          previewSelectedElement.styles,
        );

        if (cdpComputedStyles) {
          setPreviewSelectedComputedStyles(cdpComputedStyles);
        }
        if (cdpMatchedCssRules.length > 0) {
          setPreviewSelectedMatchedCssRules(cdpMatchedCssRules);
        }
      } catch {
        if (controller.signal.aborted) return;
      }
    }, 120);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    previewRefreshNonce,
    previewSelectedElement,
    previewSelectedMatchedCssRules,
    previewSelectedPath,
  ]);
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

      const liveTarget = getLivePreviewSelectedElement(elementPath);
      const normalizedStyles = Object.entries(styles).map(([key, rawValue]) => {
        const cssKey = toCssPropertyName(key);
        const valueRaw =
          rawValue === undefined || rawValue === null ? "" : String(rawValue);
        const value =
          cssKey === "font-family"
            ? normalizeFontFamilyCssValue(valueRaw)
            : valueRaw;
        return { key, cssKey, value };
      });
      const previewStylePatch: Record<string, string> = {};
      for (const { key, cssKey, value } of normalizedStyles) {
        previewStylePatch[key] = value;
        if (!(liveTarget instanceof HTMLElement)) continue;
        if (!value) {
          liveTarget.style.removeProperty(cssKey);
          continue;
        }
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
      if (
        liveTarget instanceof HTMLElement &&
        !liveTarget.getAttribute("style")?.trim()
      ) {
        liveTarget.removeAttribute("style");
      }
      postPreviewPatchToFrame({
        type: "PREVIEW_APPLY_STYLE",
        path: elementPath,
        styles: previewStylePatch,
      });

      const pathMatchesSelection =
        Array.isArray(previewSelectedPath) &&
        previewSelectedPath.length === elementPath.length &&
        previewSelectedPath.every(
          (segment, idx) => segment === elementPath[idx],
        );
      const shouldSyncSelected =
        options?.syncSelectedElement ?? pathMatchesSelection;
      if (shouldSyncSelected && liveTarget instanceof HTMLElement) {
        syncPreviewSelectionSnapshotFromLiveElement(elementPath);
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
      if (!(target instanceof HTMLElement)) return;
      for (const { cssKey, value } of normalizedStyles) {
        if (!value) {
          target.style.removeProperty(cssKey);
          continue;
        }
        target.style.setProperty(
          cssKey,
          value,
          cssKey === "font-family" ? "important" : "",
        );
      }
      if (!target.getAttribute("style")?.trim()) {
        target.removeAttribute("style");
      }
      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
        elementPath,
      });
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      postPreviewPatchToFrame,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
  );
  const queuePreviewStyleUpdate = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const targetPath = [...previewSelectedPath];
      const currentPending = previewStyleDraftPendingRef.current;
      const samePendingTarget =
        currentPending &&
        currentPending.filePath === selectedPreviewHtml &&
        currentPending.elementPath.length === targetPath.length &&
        currentPending.elementPath.every(
          (segment, index) => segment === targetPath[index],
        );

      if (
        currentPending &&
        !samePendingTarget &&
        currentPending.elementPath.length > 0
      ) {
        void applyPreviewStyleUpdateAtPath(
          currentPending.elementPath,
          currentPending.styles,
          { syncSelectedElement: false },
        );
      }

      previewStyleDraftPendingRef.current = {
        filePath: selectedPreviewHtml,
        elementPath: targetPath,
        styles: {
          ...(samePendingTarget ? currentPending?.styles || {} : {}),
          ...styles,
        },
      };

      if (!dirtyFilesRef.current.includes(selectedPreviewHtml)) {
        dirtyFilesRef.current = [...dirtyFilesRef.current, selectedPreviewHtml];
        setDirtyFiles((prev) =>
          prev.includes(selectedPreviewHtml)
            ? prev
            : [...prev, selectedPreviewHtml],
        );
      }
      markPreviewPathDirty(selectedPreviewHtml, targetPath);

      if (previewStyleDraftTimerRef.current !== null) {
        window.clearTimeout(previewStyleDraftTimerRef.current);
      }
      previewStyleDraftTimerRef.current = window.setTimeout(() => {
        previewStyleDraftTimerRef.current = null;
        const pending = previewStyleDraftPendingRef.current;
        previewStyleDraftPendingRef.current = null;
        if (!pending || pending.elementPath.length === 0) return;
        void applyPreviewStyleUpdateAtPath(
          pending.elementPath,
          pending.styles,
          { syncSelectedElement: true },
        );
      }, 120);
    },
    [
      applyPreviewStyleUpdateAtPath,
      markPreviewPathDirty,
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
    async (data: {
      content?: string;
      html?: string;
      src?: string;
      liveSrc?: string;
      href?: string;
    }) => {
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
      let didChangeContent = false;
      let didChangeSrc = false;
      let didChangeHref = false;
      let nextResolvedContent: string | null = null;
      let nextResolvedHtml: string | null = null;

      if (typeof data.html === "string") {
        const nextHtml = data.html;
        const currentHtml =
          target instanceof HTMLElement
            ? target.innerHTML
            : liveTarget instanceof HTMLElement
              ? liveTarget.innerHTML
              : "";
        if (currentHtml !== nextHtml) {
          if (target instanceof HTMLElement) {
            target.innerHTML = nextHtml;
          }
          if (liveTarget instanceof HTMLElement) {
            liveTarget.innerHTML = nextHtml;
          }
          didChangeContent = true;
        }
        if (didChangeContent) {
          const baselineElement =
            (target instanceof HTMLElement && target) ||
            (liveTarget instanceof HTMLElement && liveTarget) ||
            null;
          nextResolvedHtml =
            baselineElement instanceof HTMLElement
              ? baselineElement.innerHTML
              : nextHtml;
          nextResolvedContent = baselineElement
            ? normalizeEditorMultilineText(
                extractTextWithBreaks(baselineElement),
              )
            : normalizeEditorMultilineText(
                extractTextFromHtmlFragment(nextHtml),
              );
        }
      } else if (typeof data.content === "string") {
        const normalizedText = data.content.replace(/\r\n?/g, "\n");
        const baselineElement = target || liveTarget;
        const currentText = extractTextWithBreaks(baselineElement);
        const nextComparable = normalizeEditorMultilineText(normalizedText);
        const currentComparable = normalizeEditorMultilineText(currentText);
        if (nextComparable !== currentComparable) {
          if (target) {
            applyMultilineTextToElement(target, normalizedText);
          }
          if (liveTarget) {
            applyMultilineTextToElement(liveTarget, normalizedText);
          }
          didChangeContent = true;
        }
        if (didChangeContent) {
          const updatedElement = target || liveTarget;
          nextResolvedContent = normalizeEditorMultilineText(
            extractTextWithBreaks(updatedElement),
          );
          nextResolvedHtml =
            updatedElement instanceof HTMLElement
              ? updatedElement.innerHTML
              : null;
        }
      }
      if (
        typeof data.src === "string" &&
        (target instanceof HTMLElement || liveTarget instanceof HTMLElement)
      ) {
        const sourceValue = data.src.trim();
        const liveResolvedSource =
          (typeof data.liveSrc === "string" && data.liveSrc.trim()) ||
          resolvePreviewAssetUrl(sourceValue) ||
          sourceValue;
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
            const previousSrc = target.getAttribute("src") || "";
            if (previousSrc !== sourceValue) {
              target.setAttribute("src", sourceValue);
              didChangeSrc = true;
            }
          }
          if (liveTarget instanceof HTMLElement) {
            const previousSrc = liveTarget.getAttribute("src") || "";
            if (previousSrc !== liveResolvedSource) {
              liveTarget.setAttribute("src", liveResolvedSource);
              didChangeSrc = true;
            }
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
              const previous =
                target.style.getPropertyValue("background-image");
              if (previous !== nextBackground) {
                target.style.setProperty("background-image", nextBackground);
                didChangeSrc = true;
              }
            }
            if (liveTarget instanceof HTMLElement) {
              const liveBackground =
                sourceValue.length === 0
                  ? ""
                  : /^url\(/i.test(sourceValue)
                    ? sourceValue.replace(
                        /url\((['"]?)(.*?)\1\)/i,
                        (_match, quote, rawUrl) => {
                          const resolved =
                            resolvePreviewAssetUrl(rawUrl) || rawUrl;
                          const nextQuote = quote || '"';
                          return `url(${nextQuote}${resolved}${nextQuote})`;
                        },
                      )
                    : `url("${liveResolvedSource}")`;
              const previous =
                liveTarget.style.getPropertyValue("background-image");
              if (previous !== liveBackground) {
                liveTarget.style.setProperty(
                  "background-image",
                  liveBackground,
                );
                didChangeSrc = true;
              }
            }
          } else {
            if (target instanceof HTMLElement) {
              const previous =
                target.style.getPropertyValue("background-image");
              if (previous) {
                target.style.removeProperty("background-image");
                didChangeSrc = true;
              }
            }
            if (liveTarget instanceof HTMLElement) {
              const previous =
                liveTarget.style.getPropertyValue("background-image");
              if (previous) {
                liveTarget.style.removeProperty("background-image");
                didChangeSrc = true;
              }
            }
          }
        }
      }
      if (typeof data.href === "string") {
        if (target instanceof HTMLElement) {
          const previousHref = target.getAttribute("href") || "";
          if (previousHref !== data.href) {
            target.setAttribute("href", data.href);
            didChangeHref = true;
          }
        }
        if (liveTarget instanceof HTMLElement) {
          const previousHref = liveTarget.getAttribute("href") || "";
          if (previousHref !== data.href) {
            liveTarget.setAttribute("href", data.href);
            didChangeHref = true;
          }
        }
      }

      if (target && (didChangeContent || didChangeSrc || didChangeHref)) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
      }

      if (didChangeContent || didChangeSrc || didChangeHref) {
        setPreviewSelectedElement((prev) =>
          prev
            ? {
                ...prev,
                ...(didChangeContent
                  ? {
                      content:
                        nextResolvedContent ??
                        (typeof data.content === "string"
                          ? data.content.replace(/\r\n?/g, "\n")
                          : prev.content),
                      ...(nextResolvedHtml !== null
                        ? { html: nextResolvedHtml }
                        : {}),
                    }
                  : {}),
                ...(didChangeSrc && typeof data.src === "string"
                  ? { src: data.src }
                  : {}),
                ...(didChangeHref && typeof data.href === "string"
                  ? { href: data.href }
                  : {}),
              }
            : prev,
        );
      }
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      resolvePreviewAssetUrl,
      selectedPreviewHtml,
    ],
  );
  const handleReplacePreviewAsset = useCallback(async () => {
    if (
      !projectPath ||
      !selectedPreviewHtml ||
      !previewSelectedElement ||
      !previewSelectedPath ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return false;
    }

    const selections = await (Neutralino as any).os.showOpenDialog(
      "Select replacement asset",
      {
        multiSelections: false,
        filters: [
          {
            name: "Assets",
            extensions: [
              "png",
              "jpg",
              "jpeg",
              "webp",
              "gif",
              "svg",
              "mp4",
              "webm",
              "mov",
            ],
          },
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
          },
          { name: "Video", extensions: ["mp4", "webm", "mov"] },
        ],
      },
    );
    const sourceAbsolutePath = Array.isArray(selections)
      ? selections[0]
      : selections;
    if (!sourceAbsolutePath) {
      lastAutoAssetReplaceKeyRef.current = null;
      return false;
    }

    const htmlAbsolutePath = filePathIndexRef.current[selectedPreviewHtml];
    const htmlDirAbsolute = htmlAbsolutePath
      ? getParentPath(normalizePath(htmlAbsolutePath))
      : null;
    const htmlDirRelative = getParentPath(selectedPreviewHtml) || "";
    if (!htmlDirAbsolute) return false;

    const sourceName =
      normalizePath(String(sourceAbsolutePath)).split("/").pop() || "asset";
    const dotIndex = sourceName.lastIndexOf(".");
    const rawBaseName =
      dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName;
    const extension = dotIndex > 0 ? sourceName.slice(dotIndex) : "";
    const safeBaseName =
      rawBaseName
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "") || "asset";
    const uniqueFileName = `${safeBaseName}-${Date.now()}${extension}`;
    const targetAbsolutePath = `${htmlDirAbsolute}/${uniqueFileName}`;
    const targetRelativePath = htmlDirRelative
      ? `${htmlDirRelative}/${uniqueFileName}`
      : uniqueFileName;

    await ensureDirectoryForFile(targetAbsolutePath);
    try {
      await (Neutralino as any).filesystem.copy(
        normalizePath(String(sourceAbsolutePath)),
        targetAbsolutePath,
      );
    } catch {
      const binary = await (Neutralino as any).filesystem.readBinaryFile(
        normalizePath(String(sourceAbsolutePath)),
      );
      await (Neutralino as any).filesystem.writeBinaryFile(
        targetAbsolutePath,
        binary,
      );
    }

    filePathIndexRef.current[targetRelativePath] = targetAbsolutePath;
    setFiles((prev) => ({
      ...prev,
      [targetRelativePath]: {
        path: targetRelativePath,
        name: uniqueFileName,
        type: /\.(mp4|webm|mov)$/i.test(extension) ? "unknown" : "image",
        content: "",
      },
    }));

    try {
      await loadFileContent(targetRelativePath, { persistToState: true });
    } catch {
      // Ignore preview cache warmup failures; the HTML patch below is the source of truth.
    }

    const nextLiveSrc =
      typeof binaryAssetUrlCacheRef.current[targetRelativePath] === "string" &&
      binaryAssetUrlCacheRef.current[targetRelativePath].length > 0
        ? binaryAssetUrlCacheRef.current[targetRelativePath]
        : resolvePreviewAssetUrl(uniqueFileName) || uniqueFileName;

    await applyPreviewContentUpdate({
      src: uniqueFileName,
      liveSrc: nextLiveSrc,
    });
    return true;
  }, [
    applyPreviewContentUpdate,
    ensureDirectoryForFile,
    loadFileContent,
    previewSelectedElement,
    previewSelectedPath,
    projectPath,
    selectedPreviewHtml,
  ]);
  const sanitizeQuickEditDocument = useCallback((doc: Document) => {
    const editables = doc.querySelectorAll<HTMLElement>("[contenteditable]");
    editables.forEach((el) => el.removeAttribute("contenteditable"));
    if (
      doc.documentElement?.getAttribute("data-nx-mounted-preview-bridge") ===
      "1"
    ) {
      doc.documentElement.removeAttribute("data-nx-mounted-preview-bridge");
    }
    const previewClasses = doc.querySelectorAll<HTMLElement>(
      ".__nx-preview-editing, .__nx-preview-selected, .__nx-preview-dirty",
    );
    previewClasses.forEach((el) => {
      el.classList.remove("__nx-preview-editing");
      el.classList.remove("__nx-preview-selected");
      el.classList.remove("__nx-preview-dirty");
    });
    const overlays = doc.querySelectorAll<HTMLElement>(
      "[data-preview-hover-outline], [data-preview-hover-badge], [data-preview-draw-draft]",
    );
    overlays.forEach((el) => el.remove());
  }, []);
  useEffect(() => {
    if (previewSelectionMode !== "image") {
      lastAutoAssetReplaceKeyRef.current = null;
      return;
    }
    if (
      interactionMode !== "preview" ||
      !previewSelectedElement ||
      !previewSelectedPath ||
      !Array.isArray(previewSelectedPath)
    ) {
      return;
    }
    const assetSource = extractAssetSourceFromElement(previewSelectedElement);
    if (!assetSource) return;
    const selectionKey = previewSelectedPath.join(".");
    if (lastAutoAssetReplaceKeyRef.current === selectionKey) return;
    lastAutoAssetReplaceKeyRef.current = selectionKey;
    void handleReplacePreviewAsset();
  }, [
    handleReplacePreviewAsset,
    interactionMode,
    previewSelectedElement,
    previewSelectedPath,
    previewSelectionMode,
  ]);
  const applyQuickTextWrapTag = useCallback(
    async (tagName: "sup" | "sub") => {
      const frame = previewFrameRef.current;
      const win = frame?.contentWindow;
      const doc = frame?.contentDocument;
      if (!win || !doc) return;
      if (!selectedPreviewHtml) return;
      const selection = win.getSelection?.();
      const activeRange =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const range =
        activeRange && !activeRange.collapsed
          ? activeRange
          : quickTextRangeRef.current;
      if (!range || range.collapsed) return;

      const workingRange = range.cloneRange();
      const ancestor =
        workingRange.commonAncestorContainer instanceof Element
          ? workingRange.commonAncestorContainer
          : workingRange.commonAncestorContainer?.parentElement;
      const existing = ancestor?.closest?.(tagName) || null;
      let updatedNode: Element | null = null;

      if (existing && existing.parentElement) {
        const parent = existing.parentElement;
        while (existing.firstChild) {
          parent.insertBefore(existing.firstChild, existing);
        }
        parent.removeChild(existing);
        updatedNode = parent;
      } else {
        const wrapper = doc.createElement(tagName);
        try {
          workingRange.surroundContents(wrapper);
        } catch {
          const frag = workingRange.extractContents();
          wrapper.appendChild(frag);
          workingRange.insertNode(wrapper);
        }
        updatedNode = wrapper;
      }

      const liveTarget =
        previewSelectedPath && Array.isArray(previewSelectedPath)
          ? getLivePreviewSelectedElement(previewSelectedPath)
          : null;
      if (liveTarget instanceof HTMLElement) {
        await applyPreviewContentUpdate({ html: liveTarget.innerHTML });
      } else if (doc.documentElement) {
        sanitizeQuickEditDocument(doc);
        const serialized = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
        });
      }

      if (selection) {
        selection.removeAllRanges();
        const nextRange = doc.createRange();
        if (updatedNode) {
          nextRange.selectNodeContents(updatedNode);
        } else {
          nextRange.selectNodeContents(doc.body);
        }
        selection.addRange(nextRange);
        quickTextRangeRef.current = nextRange.cloneRange();
      }
    },
    [
      applyPreviewContentUpdate,
      getLivePreviewSelectedElement,
      persistPreviewHtmlContent,
      previewSelectedPath,
      sanitizeQuickEditDocument,
      selectedPreviewHtml,
    ],
  );
  const applyQuickTextStyle = useCallback(
    async (styles: Record<string, string>) => {
      const frame = previewFrameRef.current;
      const win = frame?.contentWindow;
      const doc = frame?.contentDocument;
      if (!win || !doc) return;
      if (!selectedPreviewHtml) return;
      const selection = win.getSelection?.();
      const activeRange =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const range =
        activeRange && !activeRange.collapsed
          ? activeRange
          : quickTextRangeRef.current;
      if (!range || range.collapsed) return;
      if (selection && range) {
        selection.removeAllRanges();
        selection.addRange(range);
      }

      const toCssKey = (value: string) =>
        value.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const span = doc.createElement("span");
      for (const [key, value] of Object.entries(styles)) {
        if (!value) continue;
        span.style.setProperty(toCssKey(key), value);
      }
      const workingRange = range.cloneRange();
      try {
        workingRange.surroundContents(span);
      } catch {
        const frag = workingRange.extractContents();
        span.appendChild(frag);
        workingRange.insertNode(span);
      }

      const liveTarget =
        previewSelectedPath && Array.isArray(previewSelectedPath)
          ? getLivePreviewSelectedElement(previewSelectedPath)
          : null;
      if (liveTarget instanceof HTMLElement) {
        await applyPreviewContentUpdate({ html: liveTarget.innerHTML });
      } else if (doc.documentElement) {
        sanitizeQuickEditDocument(doc);
        const serialized = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
        });
      }
      if (selection) {
        selection.removeAllRanges();
        const nextRange = doc.createRange();
        nextRange.selectNodeContents(span);
        selection.addRange(nextRange);
        quickTextRangeRef.current = nextRange.cloneRange();
      }
    },
    [
      applyPreviewContentUpdate,
      getLivePreviewSelectedElement,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewTagUpdate = useCallback(
    async (nextTag: string) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const safeTag = String(nextTag || "").toLowerCase();
      if (!safeTag) return;

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

      const replaceTag = (node: Element, tagName: string) => {
        if (!node || !node.ownerDocument) return null;
        const doc = node.ownerDocument;
        const next = doc.createElement(tagName);
        for (const attr of Array.from(node.attributes)) {
          next.setAttribute(attr.name, attr.value);
        }
        while (node.firstChild) {
          next.appendChild(node.firstChild);
        }
        node.replaceWith(next);
        return next;
      };

      let didChange = false;
      if (target instanceof HTMLElement) {
        const currentTag = target.tagName.toLowerCase();
        if (currentTag !== safeTag) {
          replaceTag(target, safeTag);
          didChange = true;
        }
      }
      if (liveTarget instanceof HTMLElement) {
        const currentTag = liveTarget.tagName.toLowerCase();
        if (currentTag !== safeTag) {
          replaceTag(liveTarget, safeTag);
        }
      }

      if (didChange) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
        setPreviewSelectedElement((prev) =>
          prev
            ? {
                ...prev,
                type: safeTag,
                name: safeTag.toUpperCase(),
              }
            : prev,
        );
      }
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
  const handlePreviewDuplicateSelected = useCallback(async () => {
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
    if (!(target instanceof HTMLElement) || !target.parentElement) return;

    const duplicate = target.cloneNode(true) as HTMLElement;
    if (duplicate.id) {
      duplicate.id = `${duplicate.id}-copy-${Date.now()}`;
    }
    target.parentElement.insertBefore(duplicate, target.nextSibling);
    const newPath = [...previewSelectedPath];
    newPath[newPath.length - 1] = newPath[newPath.length - 1] + 1;

    const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
    if (liveTarget instanceof HTMLElement && liveTarget.parentElement) {
      const liveDuplicate = liveTarget.cloneNode(true) as HTMLElement;
      if (liveDuplicate.id) {
        liveDuplicate.id = `${liveDuplicate.id}-copy-${Date.now()}`;
      }
      liveTarget.parentElement.insertBefore(
        liveDuplicate,
        liveTarget.nextSibling,
      );
    }

    const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
    await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
      refreshPreviewDoc: false,
      saveNow: false,
      skipAutoSave: true,
      elementPath: newPath,
    });
    if (selectedPreviewSrc && parsed.body) {
      postPreviewPatchToFrame({
        type: "PREVIEW_APPLY_HTML",
        html: parsed.body.innerHTML,
      });
    }
    selectPreviewElementAtPath(newPath);
    setIsCodePanelOpen(false);
    setIsRightPanelOpen(true);
    setSidebarToolMode("edit");
    setPreviewMode("edit");
    setInteractionMode("preview");
  }, [
    getLivePreviewSelectedElement,
    loadFileContent,
    persistPreviewHtmlContent,
    postPreviewPatchToFrame,
    previewSelectedPath,
    selectPreviewElementAtPath,
    selectedPreviewHtml,
    selectedPreviewSrc,
  ]);
  const handlePreviewNudgeZIndex = useCallback(
    (delta: number) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      const styleValue =
        previewSelectedElement?.styles?.zIndex ??
        previewSelectedComputedStyles?.zIndex ??
        (liveTarget instanceof HTMLElement
          ? liveTarget.style.zIndex ||
            liveTarget.ownerDocument.defaultView
              ?.getComputedStyle(liveTarget)
              .getPropertyValue("z-index")
          : "");
      const current = parseNumericCssValue(styleValue) ?? 0;
      const next = Math.max(0, Math.round(current + delta));
      void applyPreviewStyleUpdateAtPath(
        previewSelectedPath,
        { zIndex: String(next) },
        { syncSelectedElement: true },
      );
    },
    [
      applyPreviewStyleUpdateAtPath,
      getLivePreviewSelectedElement,
      previewSelectedComputedStyles?.zIndex,
      previewSelectedElement?.styles?.zIndex,
      previewSelectedPath,
    ],
  );
  const handlePreviewResizeNudge = useCallback(
    (axis: "width" | "height", delta: number) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      const liveRect =
        liveTarget instanceof HTMLElement
          ? liveTarget.getBoundingClientRect()
          : null;
      const fallbackBase = axis === "width" ? 120 : 48;
      const styleValue =
        axis === "width"
          ? (previewSelectedElement?.styles?.width ??
            previewSelectedComputedStyles?.width)
          : (previewSelectedElement?.styles?.height ??
            previewSelectedComputedStyles?.height);
      const parsedStyle = parseNumericCssValue(styleValue);
      const liveValue =
        axis === "width"
          ? (liveRect?.width ?? null)
          : (liveRect?.height ?? null);
      const base = parsedStyle ?? liveValue ?? fallbackBase;
      const next = Math.max(16, Math.round(base + delta));
      const stylePatch: Partial<React.CSSProperties> =
        axis === "width" ? { width: `${next}px` } : { height: `${next}px` };
      void applyPreviewStyleUpdateAtPath(previewSelectedPath, stylePatch, {
        syncSelectedElement: true,
      });
    },
    [
      applyPreviewStyleUpdateAtPath,
      getLivePreviewSelectedElement,
      previewSelectedComputedStyles?.height,
      previewSelectedComputedStyles?.width,
      previewSelectedElement?.styles?.height,
      previewSelectedElement?.styles?.width,
      previewSelectedPath,
    ],
  );
  const updatePreviewSelectionBox = useCallback(() => {
    if (
      interactionMode !== "preview" ||
      previewMode !== "edit" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    const stage = previewStageRef.current;
    const frame = previewFrameRef.current;
    const frameDocument =
      frame?.contentDocument ?? frame?.contentWindow?.document ?? null;
    if (!stage || !frame || !frameDocument?.body) {
      setPreviewSelectionBox(null);
      return;
    }
    const target = readElementByPath(frameDocument.body, previewSelectedPath);
    if (!(target instanceof HTMLElement)) {
      setPreviewSelectionBox(null);
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const left = targetRect.left - stageRect.left;
    const top = targetRect.top - stageRect.top;
    const width = targetRect.width;
    const height = targetRect.height;
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    setPreviewSelectionBox({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
    });
  }, [interactionMode, previewMode, previewSelectedPath]);
  const handlePreviewResizeHandleMouseDown = useCallback(
    (
      direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
      event: React.MouseEvent<HTMLButtonElement>,
    ) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }
      const frame = previewFrameRef.current;
      const frameDocument =
        frame?.contentDocument ?? frame?.contentWindow?.document ?? null;
      if (!frame || !frameDocument?.body) return;
      const target = readElementByPath(frameDocument.body, previewSelectedPath);
      if (!(target instanceof HTMLElement)) return;

      event.preventDefault();
      event.stopPropagation();

      const frameRect = frame.getBoundingClientRect();
      const frameClientWidth = Math.max(1, frame.clientWidth || 0);
      const frameClientHeight = Math.max(1, frame.clientHeight || 0);
      const scaleX = frameRect.width / frameClientWidth;
      const scaleY = frameRect.height / frameClientHeight;
      const targetRect = target.getBoundingClientRect();
      const startWidth = Math.max(16, Math.round(targetRect.width));
      const startHeight = Math.max(16, Math.round(targetRect.height));
      const computedStyle =
        target.ownerDocument.defaultView?.getComputedStyle(target);
      const startLeft =
        parseNumericCssValue(target.style.left) ??
        parseNumericCssValue(computedStyle?.left) ??
        0;
      const startTop =
        parseNumericCssValue(target.style.top) ??
        parseNumericCssValue(computedStyle?.top) ??
        0;
      const positionMode = String(computedStyle?.position || "")
        .trim()
        .toLowerCase();
      const canMoveLeft =
        positionMode === "absolute" ||
        positionMode === "fixed" ||
        positionMode === "relative" ||
        positionMode === "sticky";
      const canMoveTop = canMoveLeft;

      previewResizeDragRef.current = {
        path: [...previewSelectedPath],
        target,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startLeft,
        startTop,
        startWidth,
        startHeight,
        scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
        scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1,
        canMoveLeft,
        canMoveTop,
      };
      setIsPreviewResizing(true);

      const onMove = (moveEvent: MouseEvent) => {
        const drag = previewResizeDragRef.current;
        if (!drag) return;
        const deltaX = (moveEvent.clientX - drag.startX) / drag.scaleX;
        const deltaY = (moveEvent.clientY - drag.startY) / drag.scaleY;
        const affectsEast = drag.direction.includes("e");
        const affectsWest = drag.direction.includes("w");
        const affectsSouth = drag.direction.includes("s");
        const affectsNorth = drag.direction.includes("n");
        const widthDelta = affectsWest ? -deltaX : affectsEast ? deltaX : 0;
        const heightDelta = affectsNorth ? -deltaY : affectsSouth ? deltaY : 0;
        const width = Math.max(16, Math.round(drag.startWidth + widthDelta));
        const height = Math.max(16, Math.round(drag.startHeight + heightDelta));
        const consumedLeftDelta = affectsWest ? drag.startWidth - width : 0;
        const consumedTopDelta = affectsNorth ? drag.startHeight - height : 0;
        const nextLeft = Math.round(drag.startLeft + consumedLeftDelta);
        const nextTop = Math.round(drag.startTop + consumedTopDelta);
        drag.target.style.setProperty("width", `${width}px`);
        drag.target.style.setProperty("height", `${height}px`);
        if (affectsWest && drag.canMoveLeft) {
          drag.target.style.setProperty("left", `${nextLeft}px`);
        }
        if (affectsNorth && drag.canMoveTop) {
          drag.target.style.setProperty("top", `${nextTop}px`);
        }
        setPreviewSelectedElement((prev) =>
          prev
            ? {
                ...prev,
                styles: {
                  ...prev.styles,
                  width: `${width}px`,
                  height: `${height}px`,
                  ...(affectsWest && drag.canMoveLeft
                    ? { left: `${nextLeft}px` }
                    : {}),
                  ...(affectsNorth && drag.canMoveTop
                    ? { top: `${nextTop}px` }
                    : {}),
                },
              }
            : prev,
        );
        updatePreviewSelectionBox();
      };
      const onUp = () => {
        const drag = previewResizeDragRef.current;
        previewResizeDragRef.current = null;
        setIsPreviewResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (!drag) return;
        const stylePatch: Partial<React.CSSProperties> = {
          width: drag.target.style.getPropertyValue("width"),
          height: drag.target.style.getPropertyValue("height"),
        };
        if (drag.direction.includes("w") && drag.canMoveLeft) {
          stylePatch.left = drag.target.style.getPropertyValue("left");
        }
        if (drag.direction.includes("n") && drag.canMoveTop) {
          stylePatch.top = drag.target.style.getPropertyValue("top");
        }
        void applyPreviewLocalCssPatchAtPath(drag.path, stylePatch, {
          syncSelectedElement: true,
        });
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [previewSelectedPath, updatePreviewSelectionBox],
  );
  useEffect(() => {
    if (
      interactionMode !== "preview" ||
      previewMode !== "edit" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      setPreviewSelectionBox(null);
      return;
    }
    let rafId = 0;
    const tick = () => {
      updatePreviewSelectionBox();
      rafId = window.requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    interactionMode,
    previewMode,
    previewRefreshNonce,
    previewSelectedPath,
    updatePreviewSelectionBox,
  ]);
  const applyPreviewAnimationUpdate = useCallback(
    async (animation: string) => {
      if (!selectedPreviewHtml || !Array.isArray(previewSelectedPath)) return;
      const nextAnimation =
        typeof animation === "string" ? animation.trim() : "";
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
      if (!(target instanceof HTMLElement)) return;

      const htmlDirVirtual = selectedPreviewHtml.includes("/")
        ? selectedPreviewHtml.slice(0, selectedPreviewHtml.lastIndexOf("/"))
        : "";
      const cssLocalVirtualPath = normalizeProjectRelative(
        htmlDirVirtual ? `${htmlDirVirtual}/css/local.css` : "css/local.css",
      );
      const jsLocalVirtualPath = normalizeProjectRelative(
        htmlDirVirtual ? `${htmlDirVirtual}/js/local.js` : "js/local.js",
      );
      const ensureHeadElement = (doc: Document): HTMLHeadElement => {
        if (doc.head) return doc.head;
        const head = doc.createElement("head");
        if (doc.documentElement) {
          doc.documentElement.insertBefore(head, doc.body || null);
        }
        return head;
      };
      const ensureAssetLinkInHead = (
        doc: Document,
        htmlPath: string,
        assetVirtualPath: string,
        tag: "link" | "script",
      ) => {
        const hasAssetRef = Array.from(
          doc.querySelectorAll<HTMLElement>(
            tag === "link" ? 'link[rel="stylesheet"][href]' : "script[src]",
          ),
        ).some((node) => {
          const refValue =
            tag === "link"
              ? (node.getAttribute("href") ?? "")
              : (node.getAttribute("src") ?? "");
          const resolved = resolveProjectRelativePath(htmlPath, refValue);
          return (
            normalizeProjectRelative(resolved || "") ===
            normalizeProjectRelative(assetVirtualPath)
          );
        });
        if (hasAssetRef) return;
        const head = ensureHeadElement(doc);
        const refPath = relativePathBetweenVirtualFiles(
          htmlPath,
          assetVirtualPath,
        );
        if (!refPath) return;
        if (tag === "link") {
          const link = doc.createElement("link");
          link.setAttribute("rel", "stylesheet");
          link.setAttribute("href", refPath);
          head.appendChild(link);
        } else {
          const script = doc.createElement("script");
          script.setAttribute("src", refPath);
          head.appendChild(script);
        }
      };
      const replaceMarkerBlock = (
        source: string,
        markerStart: string,
        markerEnd: string,
        blockContent: string,
      ): string => {
        const safeSource = source || "";
        const start = safeSource.indexOf(markerStart);
        const endStart = start >= 0 ? safeSource.indexOf(markerEnd, start) : -1;
        const prefix =
          start >= 0 ? safeSource.slice(0, start) : safeSource.trimEnd();
        const suffix =
          start >= 0 && endStart >= 0
            ? safeSource.slice(endStart + markerEnd.length).trimStart()
            : "";
        if (!blockContent) {
          return [prefix.trimEnd(), suffix].filter(Boolean).join("\n\n");
        }
        const block = `${markerStart}\n${blockContent}\n${markerEnd}`;
        return [prefix.trimEnd(), block, suffix].filter(Boolean).join("\n\n");
      };

      ensureAssetLinkInHead(
        parsed,
        selectedPreviewHtml,
        cssLocalVirtualPath,
        "link",
      );
      ensureAssetLinkInHead(
        parsed,
        selectedPreviewHtml,
        jsLocalVirtualPath,
        "script",
      );

      const absoluteHtmlPath = filePathIndexRef.current[selectedPreviewHtml];
      const absoluteHtmlDir = absoluteHtmlPath
        ? getParentPath(absoluteHtmlPath)
        : null;
      const assetDefs = [
        {
          path: cssLocalVirtualPath,
          relativePath: "css/local.css",
          defaultContent: "",
        },
        {
          path: jsLocalVirtualPath,
          relativePath: "js/local.js",
          defaultContent: "// local page interactions\n",
        },
      ] as const;

      const upsertedAssets: Record<string, ProjectFile> = {};
      for (const asset of assetDefs) {
        const absoluteAssetPath = absoluteHtmlDir
          ? normalizePath(joinPath(absoluteHtmlDir, asset.relativePath))
          : null;
        if (absoluteAssetPath) {
          const absoluteParent = getParentPath(absoluteAssetPath);
          if (absoluteParent) {
            await ensureDirectoryTree(absoluteParent);
          }
          filePathIndexRef.current[asset.path] = absoluteAssetPath;
        }
        let content =
          typeof filesRef.current[asset.path]?.content === "string"
            ? (filesRef.current[asset.path].content as string)
            : asset.defaultContent;
        if (!content && absoluteAssetPath) {
          try {
            content = await (Neutralino as any).filesystem.readFile(
              absoluteAssetPath,
            );
          } catch {
            content = asset.defaultContent;
          }
        }
        if (absoluteAssetPath) {
          await (Neutralino as any).filesystem.writeFile(
            absoluteAssetPath,
            content,
          );
        }
        upsertedAssets[asset.path] = {
          path: asset.path,
          name: asset.path.split("/").slice(-1)[0],
          type: asset.path.endsWith(".js") ? "js" : "css",
          content,
        } as ProjectFile;
      }

      const animationClassBase =
        target.id ||
        previewSelectedElement?.id ||
        previewSelectedPath.join("-");
      const animationClassName = `nx-local-anim-${String(animationClassBase)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")}`;
      const classTokens = new Set(
        String(target.getAttribute("class") || "")
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean),
      );
      if (nextAnimation) {
        classTokens.add(animationClassName);
      } else {
        classTokens.delete(animationClassName);
      }
      if (classTokens.size > 0) {
        target.setAttribute("class", Array.from(classTokens).join(" "));
      } else {
        target.removeAttribute("class");
      }
      target.style.removeProperty("animation");
      if (!target.getAttribute("style")?.trim()) {
        target.removeAttribute("style");
      }

      const cssMarkerStart = `/* nocodex-local-animation:${animationClassName}:start */`;
      const cssMarkerEnd = `/* nocodex-local-animation:${animationClassName}:end */`;
      const cssRule = nextAnimation
        ? `.${animationClassName} {\n  animation: ${nextAnimation};\n}`
        : "";
      const currentCss =
        typeof upsertedAssets[cssLocalVirtualPath]?.content === "string"
          ? (upsertedAssets[cssLocalVirtualPath].content as string)
          : "";
      const nextCss = replaceMarkerBlock(
        currentCss,
        cssMarkerStart,
        cssMarkerEnd,
        cssRule,
      );
      upsertedAssets[cssLocalVirtualPath] = {
        ...upsertedAssets[cssLocalVirtualPath],
        content: nextCss,
      } as ProjectFile;
      const absoluteCssPath = filePathIndexRef.current[cssLocalVirtualPath];
      if (absoluteCssPath) {
        await (Neutralino as any).filesystem.writeFile(
          absoluteCssPath,
          nextCss,
        );
      }

      setFiles((prev) => ({
        ...prev,
        ...upsertedAssets,
      }));

      const serialized = parsed.documentElement.outerHTML;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: true,
      });
      setPreviewSelectedElement((prev) =>
        prev
          ? {
              ...prev,
              animation: nextAnimation,
              styles: {
                ...prev.styles,
                ...Object.fromEntries(
                  Object.entries(prev.styles || {}).filter(
                    ([key]) => key !== "animation",
                  ),
                ),
              },
              className: nextAnimation
                ? Array.from(
                    new Set(
                      `${prev.className || ""} ${animationClassName}`
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean),
                    ),
                  ).join(" ")
                : String(prev.className || "")
                    .split(/\s+/)
                    .filter((token) => token && token !== animationClassName)
                    .join(" "),
            }
          : prev,
      );
    },
    [
      ensureDirectoryTree,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedElement?.id,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewLocalCssPatchAtPath = useCallback(
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
      ) {
        return;
      }
      console.log("[NoCodeX CSS] nx-local-style fallback patch", {
        selectedPreviewHtml,
        elementPath,
        styles,
      });

      const htmlDirVirtual = selectedPreviewHtml.includes("/")
        ? selectedPreviewHtml.slice(0, selectedPreviewHtml.lastIndexOf("/"))
        : "";
      const cssLocalVirtualPath = normalizeProjectRelative(
        htmlDirVirtual ? `${htmlDirVirtual}/css/local.css` : "css/local.css",
      );
      const ensureHeadElement = (doc: Document): HTMLHeadElement => {
        if (doc.head) return doc.head;
        const head = doc.createElement("head");
        if (doc.documentElement) {
          doc.documentElement.insertBefore(head, doc.body || null);
        }
        return head;
      };
      const ensureCssLinkInHead = (doc: Document, htmlPath: string) => {
        const hasAssetRef = Array.from(
          doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
        ).some((node) => {
          const resolved = resolveProjectRelativePath(
            htmlPath,
            node.getAttribute("href") ?? "",
          );
          return (
            normalizeProjectRelative(resolved || "") ===
            normalizeProjectRelative(cssLocalVirtualPath)
          );
        });
        if (hasAssetRef) return;
        const head = ensureHeadElement(doc);
        const refPath = relativePathBetweenVirtualFiles(
          htmlPath,
          cssLocalVirtualPath,
        );
        if (!refPath) return;
        const link = doc.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("href", refPath);
        head.appendChild(link);
      };
      const replaceMarkerBlock = (
        source: string,
        markerStart: string,
        markerEnd: string,
        blockContent: string,
      ): string => {
        const safeSource = source || "";
        const start = safeSource.indexOf(markerStart);
        const endStart = start >= 0 ? safeSource.indexOf(markerEnd, start) : -1;
        const prefix =
          start >= 0
            ? safeSource.slice(0, start).trimEnd()
            : safeSource.trimEnd();
        const suffix =
          start >= 0 && endStart >= 0
            ? safeSource.slice(endStart + markerEnd.length).trimStart()
            : "";
        const block = blockContent
          ? `${markerStart}\n${blockContent}\n${markerEnd}`
          : "";
        return [prefix, block, suffix].filter(Boolean).join("\n\n");
      };
      const parseRuleBlock = (source: string): Record<string, string> => {
        const match = source.match(/\{([\s\S]*)\}/);
        if (!match) return {};
        return match[1]
          .split(";")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .reduce<Record<string, string>>((acc, entry) => {
            const colonIndex = entry.indexOf(":");
            if (colonIndex <= 0) return acc;
            const key = entry.slice(0, colonIndex).trim();
            const value = entry.slice(colonIndex + 1).trim();
            if (key) acc[key] = value;
            return acc;
          }, {});
      };
      const absoluteHtmlPath = filePathIndexRef.current[selectedPreviewHtml];
      const absoluteHtmlDir = absoluteHtmlPath
        ? getParentPath(absoluteHtmlPath)
        : null;
      const absoluteCssPath = absoluteHtmlDir
        ? normalizePath(joinPath(absoluteHtmlDir, "css/local.css"))
        : null;
      if (absoluteCssPath) {
        const absoluteParent = getParentPath(absoluteCssPath);
        if (absoluteParent) {
          await ensureDirectoryTree(absoluteParent);
        }
        filePathIndexRef.current[cssLocalVirtualPath] = absoluteCssPath;
      }

      let cssContent =
        typeof filesRef.current[cssLocalVirtualPath]?.content === "string"
          ? (filesRef.current[cssLocalVirtualPath].content as string)
          : "";
      if (!cssContent && absoluteCssPath) {
        try {
          cssContent = await (Neutralino as any).filesystem.readFile(
            absoluteCssPath,
          );
        } catch {
          cssContent = "";
        }
      }

      ensureCssLinkInHead(parsed, selectedPreviewHtml);
      const classBase =
        (target instanceof HTMLElement && target.id) ||
        (liveTarget instanceof HTMLElement && liveTarget.id) ||
        previewSelectedElement?.id ||
        elementPath.join("-");
      const className = `nx-local-style-${String(classBase)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")}`;
      const markerStart = `/* nocodex-local-style:${className}:start */`;
      const markerEnd = `/* nocodex-local-style:${className}:end */`;
      const existingStart = cssContent.indexOf(markerStart);
      const existingEnd =
        existingStart >= 0 ? cssContent.indexOf(markerEnd, existingStart) : -1;
      const existingBlock =
        existingStart >= 0 && existingEnd >= 0
          ? cssContent.slice(existingStart + markerStart.length, existingEnd)
          : "";
      const mergedRules = parseRuleBlock(existingBlock);
      for (const [key, rawValue] of Object.entries(styles)) {
        const cssKey = toCssPropertyName(key);
        const valueRaw =
          rawValue === undefined || rawValue === null ? "" : String(rawValue);
        const value =
          cssKey === "font-family"
            ? normalizeFontFamilyCssValue(valueRaw)
            : valueRaw;
        if (value) {
          mergedRules[cssKey] = value;
        } else {
          delete mergedRules[cssKey];
        }
        if (target instanceof HTMLElement) {
          target.style.removeProperty(cssKey);
        }
        if (liveTarget instanceof HTMLElement) {
          liveTarget.style.removeProperty(cssKey);
        }
      }
      const classTokens = new Set(
        String(
          (target instanceof HTMLElement ? target.getAttribute("class") : "") ||
            (liveTarget instanceof HTMLElement
              ? liveTarget.getAttribute("class")
              : "") ||
            "",
        )
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean),
      );
      classTokens.add(className);
      const nextClassName = Array.from(classTokens).join(" ");
      if (target instanceof HTMLElement) {
        target.setAttribute("class", nextClassName);
        if (!target.getAttribute("style")?.trim())
          target.removeAttribute("style");
      }
      if (liveTarget instanceof HTMLElement) {
        liveTarget.setAttribute("class", nextClassName);
        if (!liveTarget.getAttribute("style")?.trim()) {
          liveTarget.removeAttribute("style");
        }
      }
      const cssRuleEntries = Object.entries(mergedRules);
      const cssRuleBlock =
        cssRuleEntries.length > 0
          ? `.${className} {\n  ${cssRuleEntries
              .map(([key, value]) => `${key}: ${value}`)
              .join(";\n  ")};\n}`
          : "";
      const nextCssContent = replaceMarkerBlock(
        cssContent,
        markerStart,
        markerEnd,
        cssRuleBlock,
      );
      textFileCacheRef.current[cssLocalVirtualPath] = nextCssContent;
      const cssFile: ProjectFile = filesRef.current[cssLocalVirtualPath]
        ? {
            ...filesRef.current[cssLocalVirtualPath],
            content: nextCssContent,
            type: "css",
          }
        : {
            path: cssLocalVirtualPath,
            name: "local.css",
            type: "css",
            content: nextCssContent,
          };
      filesRef.current = {
        ...filesRef.current,
        [cssLocalVirtualPath]: cssFile,
      };
      setFiles((prev) => ({
        ...prev,
        [cssLocalVirtualPath]: cssFile,
      }));
      if (absoluteCssPath) {
        await (Neutralino as any).filesystem.writeFile(
          absoluteCssPath,
          nextCssContent,
        );
        delete pendingPreviewWritesRef.current[cssLocalVirtualPath];
      } else {
        pendingPreviewWritesRef.current[cssLocalVirtualPath] = nextCssContent;
      }
      if (liveTarget instanceof HTMLElement) {
        const liveDoc = liveTarget.ownerDocument;
        const liveHead = ensureHeadElement(liveDoc);
        let runtimeStyle = liveHead.querySelector<HTMLStyleElement>(
          `style[data-nx-local-style="${className}"]`,
        );
        if (!runtimeStyle) {
          runtimeStyle = liveDoc.createElement("style");
          runtimeStyle.setAttribute("data-nx-local-style", className);
          liveHead.appendChild(runtimeStyle);
        }
        runtimeStyle.textContent = cssRuleBlock;
      }

      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
        elementPath,
      });

      const pathMatchesSelection =
        Array.isArray(previewSelectedPath) &&
        previewSelectedPath.length === elementPath.length &&
        previewSelectedPath.every(
          (segment, idx) => segment === elementPath[idx],
        );
      const shouldSyncSelected =
        options?.syncSelectedElement ?? pathMatchesSelection;
      if (!shouldSyncSelected) return;
      if (syncPreviewSelectionSnapshotFromLiveElement(elementPath)) return;
      setPreviewSelectedElement((prev) =>
        prev
          ? {
              ...prev,
              className: nextClassName,
              styles: parseInlineStyleText(target?.getAttribute("style") || ""),
            }
          : prev,
      );
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedElement?.id,
      previewSelectedPath,
      selectedPreviewHtml,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
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
      let effectiveParentPath = normalizedParentPath;
      let parsedParent =
        effectiveParentPath.length > 0
          ? readElementByPath(parsed.body, effectiveParentPath)
          : parsed.body;
      while (
        parsedParent instanceof HTMLElement &&
        parsedParent !== parsed.body &&
        VOID_HTML_TAGS.has(String(parsedParent.tagName || "").toLowerCase()) &&
        effectiveParentPath.length > 0
      ) {
        effectiveParentPath = effectiveParentPath.slice(0, -1);
        parsedParent =
          effectiveParentPath.length > 0
            ? readElementByPath(parsed.body, effectiveParentPath)
            : parsed.body;
      }
      if (
        !(parsedParent instanceof HTMLElement) &&
        !(parsedParent instanceof HTMLBodyElement)
      ) {
        return;
      }

      const drawTag = normalizePreviewDrawTag(tag);
      const normalizedStyles = {
        ...Object.fromEntries(
          Object.entries(rawStyles || {}).filter(([key]) => Boolean(key)),
        ),
        // Ensure drawn elements appear on top of existing content
        zIndex:
          (rawStyles?.zIndex ?? rawStyles?.["z-index"]) ? undefined : "100",
      } as Record<string, string>;

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
      const newPath = [...effectiveParentPath, newIndex];

      // Send PREVIEW_INJECT_ELEMENT into the iframe via postMessage.
      // This is the correct architecture — the iframe inserts the element itself,
      // just like how PREVIEW_APPLY_STYLE works. Direct contentDocument mutation
      // can fail in sandboxed/mounted-preview contexts and causes index mismatches.
      postPreviewPatchToFrame({
        type: "PREVIEW_INJECT_ELEMENT",
        parentPath: effectiveParentPath,
        tag: drawTag,
        styles: normalizedStyles,
        index: newIndex,
      });

      // Also update parsedParent positioning in the serialized HTML
      if (effectiveParentPath.length > 0) {
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
      setIsCodePanelOpen(false);
      setIsRightPanelOpen(true);
    },
    [
      loadFileContent,
      persistPreviewHtmlContent,
      postPreviewPatchToFrame,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewDropCreate = useCallback(
    async (rawType: string, clientX: number, clientY: number) => {
      const dropType = String(rawType || "").trim();
      if (!dropType || !selectedPreviewHtml) return;
      const isMountedPreviewDrop = Boolean(selectedPreviewSrc);

      const idFor = createPresetIdFactory(dropType);
      const nextElement =
        buildPresetElementV2(dropType, idFor) ??
        buildStandardElement(dropType, idFor("element"));

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
      const parsedNode = materializeVirtualElement(parsed, nextElement);
      if (!(parsedNode instanceof HTMLElement)) return;
      const requiresAddToolAssets = ADD_TOOL_COMPONENT_PRESETS.has(dropType);
      const htmlDirVirtual = selectedPreviewHtml.includes("/")
        ? selectedPreviewHtml.slice(0, selectedPreviewHtml.lastIndexOf("/"))
        : "";
      const cssLocalVirtualPath = normalizeProjectRelative(
        htmlDirVirtual ? `${htmlDirVirtual}/css/local.css` : "css/local.css",
      );
      const jsLocalVirtualPath = normalizeProjectRelative(
        htmlDirVirtual ? `${htmlDirVirtual}/js/local.js` : "js/local.js",
      );
      const ensureHeadElement = (doc: Document): HTMLHeadElement => {
        if (doc.head) return doc.head;
        const head = doc.createElement("head");
        if (doc.documentElement) {
          doc.documentElement.insertBefore(head, doc.body || null);
        } else {
          const html = doc.createElement("html");
          html.appendChild(head);
          if (doc.body) {
            html.appendChild(doc.body);
          }
          doc.appendChild(html);
        }
        return head;
      };
      const ensureAssetLinkInHead = (
        doc: Document,
        htmlPath: string,
        assetVirtualPath: string,
        tag: "link" | "script",
      ) => {
        const hasAssetRef = Array.from(
          doc.querySelectorAll<HTMLElement>(
            tag === "link" ? 'link[rel="stylesheet"][href]' : "script[src]",
          ),
        ).some((node) => {
          const refValue =
            tag === "link"
              ? (node.getAttribute("href") ?? "")
              : (node.getAttribute("src") ?? "");
          const resolved = resolveProjectRelativePath(htmlPath, refValue);
          return (
            normalizeProjectRelative(resolved || "") ===
            normalizeProjectRelative(assetVirtualPath)
          );
        });
        if (hasAssetRef) return;
        const head = ensureHeadElement(doc);
        const refPath = relativePathBetweenVirtualFiles(
          htmlPath,
          assetVirtualPath,
        );
        if (!refPath) return;
        if (tag === "link") {
          const link = doc.createElement("link");
          link.setAttribute("rel", "stylesheet");
          link.setAttribute("href", refPath);
          head.appendChild(link);
        } else {
          const script = doc.createElement("script");
          script.setAttribute("src", refPath);
          head.appendChild(script);
        }
      };
      const mergeMarkerBlock = (
        source: string,
        markerStart: string,
        markerEnd: string,
        blockContent: string,
      ): string => {
        const safeSource = source || "";
        const block = blockContent
          ? `${markerStart}\n${blockContent}\n${markerEnd}`
          : "";
        if (
          safeSource.includes(markerStart) &&
          safeSource.includes(markerEnd)
        ) {
          const start = safeSource.indexOf(markerStart);
          const endStart = safeSource.indexOf(markerEnd, start);
          const end = endStart >= 0 ? endStart + markerEnd.length : start;
          const prefix = safeSource.slice(0, start).trimEnd();
          const suffix = safeSource.slice(end).trimStart();
          return [prefix, block, suffix].filter(Boolean).join("\n\n");
        }
        if (!block) return safeSource;
        const needsGap = safeSource.length > 0 && !safeSource.endsWith("\n");
        return `${safeSource}${needsGap ? "\n\n" : ""}${block}\n`;
      };
      const absoluteHtmlPath = filePathIndexRef.current[selectedPreviewHtml];
      const absoluteHtmlDir = absoluteHtmlPath
        ? getParentPath(absoluteHtmlPath)
        : null;
      const upsertLocalAsset = async (
        assetVirtualPath: string,
        relativePath: string,
        nextContentBuilder: (current: string) => string,
        defaultContent = "",
      ): Promise<string> => {
        const absoluteAssetPath = absoluteHtmlDir
          ? normalizePath(joinPath(absoluteHtmlDir, relativePath))
          : null;
        if (absoluteAssetPath) {
          const absoluteParent = getParentPath(absoluteAssetPath);
          if (absoluteParent) {
            await ensureDirectoryTree(absoluteParent);
          }
          filePathIndexRef.current[assetVirtualPath] = absoluteAssetPath;
        }
        let existingContent =
          typeof filesRef.current[assetVirtualPath]?.content === "string"
            ? (filesRef.current[assetVirtualPath].content as string)
            : "";
        if (!existingContent && absoluteAssetPath) {
          try {
            existingContent = await (Neutralino as any).filesystem.readFile(
              absoluteAssetPath,
            );
          } catch {
            existingContent = defaultContent;
          }
        }
        if (!existingContent) existingContent = defaultContent;
        const nextContent = nextContentBuilder(existingContent);
        textFileCacheRef.current[assetVirtualPath] = nextContent;
        const name = assetVirtualPath.includes("/")
          ? assetVirtualPath.slice(assetVirtualPath.lastIndexOf("/") + 1)
          : assetVirtualPath;
        const nextFile: ProjectFile = filesRef.current[assetVirtualPath]
          ? {
              ...filesRef.current[assetVirtualPath],
              content: nextContent,
              type: inferFileType(name),
            }
          : {
              path: assetVirtualPath,
              name,
              type: inferFileType(name),
              content: nextContent,
            };
        filesRef.current = {
          ...filesRef.current,
          [assetVirtualPath]: nextFile,
        };
        setFiles((prev) => ({
          ...prev,
          [assetVirtualPath]: nextFile,
        }));
        if (absoluteAssetPath) {
          await (Neutralino as any).filesystem.writeFile(
            absoluteAssetPath,
            nextContent,
          );
          delete pendingPreviewWritesRef.current[assetVirtualPath];
        } else {
          pendingPreviewWritesRef.current[assetVirtualPath] = nextContent;
        }
        return nextContent;
      };

      ensureAssetLinkInHead(
        parsed,
        selectedPreviewHtml,
        cssLocalVirtualPath,
        "link",
      );
      ensureAssetLinkInHead(
        parsed,
        selectedPreviewHtml,
        jsLocalVirtualPath,
        "script",
      );

      if (requiresAddToolAssets) {
        const removeLegacySharedAssetRefs = (
          doc: Document,
          htmlPath: string,
        ) => {
          const legacyPaths = new Set([
            "shared/css/nx-add-tool-components.css",
            "shared/js/nx-add-tool-components.js",
            "__nx_add_tool.css",
            "__nx_add_tool.js",
          ]);
          const nodes = Array.from(
            doc.querySelectorAll<HTMLElement>(
              'link[rel="stylesheet"][href],script[src]',
            ),
          );
          for (const node of nodes) {
            const refValue =
              node.tagName.toLowerCase() === "link"
                ? (node.getAttribute("href") ?? "")
                : (node.getAttribute("src") ?? "");
            const resolved = normalizeProjectRelative(
              resolveProjectRelativePath(htmlPath, refValue) || "",
            );
            if (legacyPaths.has(resolved)) {
              node.parentElement?.removeChild(node);
            }
          }
          Array.from(
            doc.querySelectorAll<HTMLElement>(
              'style[data-nx-add-tool="css"],script[data-nx-add-tool="js"]',
            ),
          ).forEach((node) => node.parentElement?.removeChild(node));
        };
        removeLegacySharedAssetRefs(parsed, selectedPreviewHtml);
        const assetDefs = [
          {
            path: cssLocalVirtualPath,
            relativePath: "css/local.css",
            markerStart: ADD_TOOL_CSS_MARKER_START,
            markerEnd: ADD_TOOL_CSS_MARKER_END,
            block: ADD_TOOL_COMPONENTS_CSS_CONTENT,
          },
          {
            path: jsLocalVirtualPath,
            relativePath: "js/local.js",
            markerStart: ADD_TOOL_JS_MARKER_START,
            markerEnd: ADD_TOOL_JS_MARKER_END,
            block: ADD_TOOL_COMPONENTS_JS_CONTENT,
          },
        ] as const;
        for (const asset of assetDefs) {
          try {
            await upsertLocalAsset(
              asset.path,
              asset.relativePath,
              (existingContent) =>
                mergeMarkerBlock(
                  existingContent,
                  asset.markerStart,
                  asset.markerEnd,
                  asset.block,
                ),
            );
          } catch (error) {
            console.warn("Failed writing slide local asset file:", error);
          }
        }
      }

      const pickDropHost = (doc: Document): HTMLElement => {
        const candidates = [
          ".maincontainer",
          ".mainContainer",
          "#maincontainer",
          "#mainContainer",
          "#contentFrame",
          ".contentFrame",
          ".mainContent",
          "#container",
        ];
        for (const selector of candidates) {
          const found = doc.querySelector(selector);
          if (found instanceof HTMLElement) return found;
        }
        return doc.body;
      };
      const computePathFromBody = (element: Element | null): number[] => {
        if (!element) return [];
        const path: number[] = [];
        let cursor: Element | null = element;
        while (cursor && cursor.parentElement) {
          const parentEl: HTMLElement = cursor.parentElement;
          const index = Array.from(parentEl.children).indexOf(cursor);
          if (index < 0) break;
          path.unshift(index);
          if (parentEl === element.ownerDocument.body) break;
          cursor = parentEl;
        }
        return path;
      };
      const ensurePositionableHost = (host: HTMLElement) => {
        const computed = host.ownerDocument.defaultView?.getComputedStyle(host);
        if (!computed) return;
        if (!computed.position || computed.position === "static") {
          host.style.setProperty("position", "relative");
        }
      };

      const liveDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      const liveWindow = liveDocument?.defaultView ?? null;
      const frameRect = previewFrameRef.current?.getBoundingClientRect();
      const parsedDropHost = pickDropHost(parsed);
      const liveDropHost = liveDocument ? pickDropHost(liveDocument) : null;
      ensurePositionableHost(parsedDropHost);
      if (liveDropHost) {
        ensurePositionableHost(liveDropHost);
      }
      const getDocumentOffset = (
        element: HTMLElement,
      ): { left: number; top: number } => {
        let left = 0;
        let top = 0;
        let cursor: HTMLElement | null = element;
        while (cursor) {
          left += cursor.offsetLeft || 0;
          top += cursor.offsetTop || 0;
          cursor = cursor.offsetParent as HTMLElement | null;
        }
        return { left, top };
      };

      let nextLeft = 0;
      let nextTop = 0;
      let normalizedDropX: number | null = null;
      let normalizedDropY: number | null = null;
      if (frameRect && liveDropHost) {
        const liveViewportWidth = Math.max(
          1,
          previewFrameRef.current?.clientWidth ||
            liveDocument?.documentElement?.clientWidth ||
            0,
        );
        const liveViewportHeight = Math.max(
          1,
          previewFrameRef.current?.clientHeight ||
            liveDocument?.documentElement?.clientHeight ||
            0,
        );
        const scaleX =
          liveViewportWidth > 0 ? frameRect.width / liveViewportWidth : 1;
        const scaleY =
          liveViewportHeight > 0 ? frameRect.height / liveViewportHeight : 1;
        normalizedDropX =
          frameRect.width > 0
            ? Math.max(
                0,
                Math.min(1, (clientX - frameRect.left) / frameRect.width),
              )
            : null;
        normalizedDropY =
          frameRect.height > 0
            ? Math.max(
                0,
                Math.min(1, (clientY - frameRect.top) / frameRect.height),
              )
            : null;
        const innerClientX = (clientX - frameRect.left) / (scaleX || 1);
        const innerClientY = (clientY - frameRect.top) / (scaleY || 1);
        const innerDocX = innerClientX + (liveWindow?.scrollX || 0);
        const innerDocY = innerClientY + (liveWindow?.scrollY || 0);
        const hostOffset = getDocumentOffset(liveDropHost);
        nextLeft = Math.max(0, Math.round(innerDocX - hostOffset.left));
        nextTop = Math.max(0, Math.round(innerDocY - hostOffset.top));
      }
      const hostWidth = Math.max(
        0,
        liveDropHost?.scrollWidth ||
          liveDropHost?.clientWidth ||
          parsedDropHost.clientWidth ||
          0,
      );
      const hostHeight = Math.max(
        0,
        liveDropHost?.scrollHeight ||
          liveDropHost?.clientHeight ||
          parsedDropHost.clientHeight ||
          0,
      );
      if (hostWidth > 0) {
        if (
          normalizedDropX !== null &&
          nextLeft === 0 &&
          normalizedDropX > 0.04
        ) {
          nextLeft = Math.round(normalizedDropX * hostWidth);
        }
        nextLeft = Math.max(0, Math.min(nextLeft, Math.max(0, hostWidth - 24)));
      }
      if (hostHeight > 0) {
        if (
          normalizedDropY !== null &&
          nextTop === 0 &&
          normalizedDropY > 0.04
        ) {
          nextTop = Math.round(normalizedDropY * hostHeight);
        }
        nextTop = Math.max(0, Math.min(nextTop, Math.max(0, hostHeight - 24)));
      }
      const instanceClassName = `nx-local-drop-${String(
        nextElement.id || `drop-${Date.now()}`,
      )
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")}`;
      const styleRules: string[] = [
        "position: absolute",
        `left: ${nextLeft}px`,
        `top: ${nextTop}px`,
      ];
      for (const [key, value] of Object.entries(nextElement.styles || {})) {
        if (value === undefined || value === null || value === "") continue;
        styleRules.push(`${toCssPropertyName(key)}: ${String(value)}`);
      }
      if (requiresAddToolAssets) {
        styleRules.push("max-width: 100%");
        styleRules.push("box-sizing: border-box");
      }
      const dropMarkerStart = `/* nocodex-local-drop:${instanceClassName}:start */`;
      const dropMarkerEnd = `/* nocodex-local-drop:${instanceClassName}:end */`;
      const dropCssBlock = `.${instanceClassName} {\n  ${styleRules.join(";\n  ")};\n}`;
      try {
        await upsertLocalAsset(
          cssLocalVirtualPath,
          "css/local.css",
          (existingContent) =>
            mergeMarkerBlock(
              existingContent,
              dropMarkerStart,
              dropMarkerEnd,
              dropCssBlock,
            ),
        );
        await upsertLocalAsset(
          jsLocalVirtualPath,
          "js/local.js",
          (existingContent) =>
            existingContent || "// local page interactions\n",
          "// local page interactions\n",
        );
      } catch (error) {
        console.warn("Failed wiring local drop assets:", error);
      }
      const currentClassTokens = new Set(
        String(parsedNode.getAttribute("class") || "")
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean),
      );
      currentClassTokens.add(instanceClassName);
      parsedNode.setAttribute(
        "class",
        Array.from(currentClassTokens).join(" "),
      );
      parsedNode.removeAttribute("style");
      parsedDropHost.appendChild(parsedNode);
      const newPath = computePathFromBody(parsedNode);
      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;

      let appliedLive = false;
      if (liveDocument?.body) {
        const liveHead = liveDocument.head || liveDocument.documentElement;
        if (liveHead) {
          let runtimeStyle = liveHead.querySelector<HTMLStyleElement>(
            `style[data-nx-local-drop="${instanceClassName}"]`,
          );
          if (!runtimeStyle) {
            runtimeStyle = liveDocument.createElement("style");
            runtimeStyle.setAttribute("data-nx-local-drop", instanceClassName);
            liveHead.appendChild(runtimeStyle);
          }
          runtimeStyle.textContent = dropCssBlock;
        }
        const liveNode = materializeVirtualElement(liveDocument, nextElement);
        if (liveNode instanceof HTMLElement) {
          const liveDropHost = pickDropHost(liveDocument);
          ensurePositionableHost(liveDropHost);
          liveNode.classList.add(instanceClassName);
          liveNode.style.setProperty("position", "absolute");
          liveNode.style.setProperty("left", `${nextLeft}px`);
          liveNode.style.setProperty("top", `${nextTop}px`);
          if (requiresAddToolAssets) {
            liveNode.style.setProperty("max-width", "100%");
            liveNode.style.setProperty("box-sizing", "border-box");
          }
          liveDropHost.appendChild(liveNode);
          appliedLive = true;
        }
      }

      const needsAssetReload = requiresAddToolAssets && isMountedPreviewDrop;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc:
          needsAssetReload || (!appliedLive && !isMountedPreviewDrop),
        saveNow: isMountedPreviewDrop,
        skipAutoSave: !isMountedPreviewDrop,
        elementPath: newPath,
      });
      if (isMountedPreviewDrop && parsed.body && !needsAssetReload) {
        postPreviewPatchToFrame({
          type: "PREVIEW_APPLY_HTML",
          html: parsed.body.innerHTML,
        });
      }

      setPreviewSelectedPath(newPath);
      setPreviewSelectedElement({
        ...nextElement,
        className: instanceClassName,
        styles: {
          ...nextElement.styles,
        },
      });
      setPreviewSelectedComputedStyles(null);
      setPreviewSelectedMatchedCssRules([]);
      setSelectedId(null);
      setIsCodePanelOpen(false);
      setIsRightPanelOpen(true);
      requestPropertiesPanelTab("content");
      setSidebarToolMode("edit");
      setPreviewMode("edit");
      setInteractionMode("preview");
    },
    [
      loadFileContent,
      postPreviewPatchToFrame,
      persistPreviewHtmlContent,
      requestPropertiesPanelTab,
      selectedPreviewHtml,
      selectedPreviewSrc,
    ],
  );
  useEffect(() => {
    applyPreviewDropCreateRef.current = applyPreviewDropCreate;
  }, [applyPreviewDropCreate]);
  const handlePreviewStageDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!selectedPreviewHtml) return;
      const payload = (
        getToolboxDragPayload(event.dataTransfer).trim() ||
        toolboxDragTypeRef.current
      ).trim();
      if (!payload) return;
      event.preventDefault();
      setIsToolboxDragging(false);
      toolboxDragTypeRef.current = "";
      void applyPreviewDropCreate(payload, event.clientX, event.clientY);
    },
    [applyPreviewDropCreate, selectedPreviewHtml],
  );
  const handleImmediatePreviewStyle = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      const liveTarget = frameDocument?.body
        ? readElementByPath(frameDocument.body, previewSelectedPath)
        : null;
      const previewStylePatch: Record<string, string> = {};

      Object.entries(styles).forEach(([key, rawValue]) => {
        const cssKey = toCssPropertyName(key);
        const valueRaw =
          rawValue === undefined || rawValue === null ? "" : String(rawValue);
        const value =
          cssKey === "font-family"
            ? normalizeFontFamilyCssValue(valueRaw)
            : valueRaw;

        previewStylePatch[key] = value;
        if (!(liveTarget instanceof HTMLElement)) return;
        if (!value) {
          liveTarget.style.removeProperty(cssKey);
          return;
        }
        liveTarget.style.setProperty(
          cssKey,
          value,
          cssKey === "font-family" ? "important" : "",
        );
      });

      if (
        liveTarget instanceof HTMLElement &&
        !liveTarget.getAttribute("style")?.trim()
      ) {
        liveTarget.removeAttribute("style");
      }

      postPreviewPatchToFrame({
        type: "PREVIEW_APPLY_STYLE",
        path: previewSelectedPath,
        styles: previewStylePatch,
      });
      syncPreviewSelectionSnapshotFromLiveElement(previewSelectedPath);
    },
    [
      postPreviewPatchToFrame,
      previewSelectedPath,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
  );
  const resolvePreviewMatchedRuleSourcePath = useCallback((source: string) => {
    if (selectedPreviewHtml) {
      const selectedHtmlSource =
        typeof filesRef.current[selectedPreviewHtml]?.content === "string"
          ? (filesRef.current[selectedPreviewHtml]?.content as string)
          : typeof textFileCacheRef.current[selectedPreviewHtml] === "string"
            ? textFileCacheRef.current[selectedPreviewHtml]
            : "";
      if (selectedHtmlSource) {
        try {
          const parsed = new DOMParser().parseFromString(
            selectedHtmlSource,
            "text/html",
          );
          const linkedCssCandidates = Array.from(
            parsed.querySelectorAll<HTMLLinkElement>(
              'link[rel="stylesheet"][href]',
            ),
          )
            .map((node) =>
              resolveProjectRelativePath(
                selectedPreviewHtml,
                node.getAttribute("href") || "",
              ),
            )
            .filter((candidate): candidate is string => Boolean(candidate))
            .filter((candidate) => filesRef.current[candidate]?.type === "css")
            .filter((candidate) => cssRuleSourcesMatch(candidate, source));
          if (linkedCssCandidates.length === 1) {
            return linkedCssCandidates[0];
          }
        } catch {
          // Ignore malformed HTML and continue to broader lookup.
        }
      }
    }

    const normalizedSource = normalizeProjectRelative(String(source || ""));
    const exactMatch =
      findFilePathCaseInsensitive(filesRef.current, normalizedSource) ||
      (filesRef.current[normalizedSource]?.type === "css"
        ? normalizedSource
        : null);
    if (exactMatch && filesRef.current[exactMatch]?.type === "css") {
      return exactMatch;
    }

    const normalizedSuffix = normalizedSource.toLowerCase();
    const basename = getCssSourceBasename(source).toLowerCase();
    const candidates = Object.keys(filesRef.current).filter((path) => {
      if (filesRef.current[path]?.type !== "css") return false;
      const normalizedPath = normalizeProjectRelative(path).toLowerCase();
      if (normalizedSuffix && normalizedPath.endsWith(normalizedSuffix)) {
        return true;
      }
      return getCssSourceBasename(path).toLowerCase() === basename;
    });

    return candidates.length === 1 ? candidates[0] : null;
  }, [selectedPreviewHtml]);
  const resolveInspectorAssetPreviewUrl = useCallback(
    (raw: string, source?: string) => {
      const cleaned = extractAssetUrlFromCssValue(raw);
      if (!cleaned) return "";
      if (/^(https?:|data:|blob:)/i.test(cleaned)) return cleaned;

      const basePath =
        source && source.length > 0
          ? resolvePreviewMatchedRuleSourcePath(source) || selectedPreviewHtml
          : selectedPreviewHtml;
      const resolvedVirtual = basePath
        ? resolveProjectRelativePath(basePath, cleaned) || cleaned
        : cleaned;
      const normalizedResolved = normalizeProjectRelative(resolvedVirtual);
      const absolutePath =
        filePathIndexRef.current[resolvedVirtual] ||
        filePathIndexRef.current[normalizedResolved] ||
        (projectPath
          ? normalizePath(joinPath(projectPath, normalizedResolved))
          : null);
      if (!absolutePath) return cleaned;

      const relativePath = previewMountBasePath
        ? toMountRelativePath(previewMountBasePath, absolutePath)
        : null;
      if (!relativePath) return toFileUrl(absolutePath);

      const nlPort = String((window as any).NL_PORT || "").trim();
      const previewServerOrigin = nlPort ? `http://127.0.0.1:${nlPort}` : "";
      const mountPath = encodeURI(`${PREVIEW_MOUNT_PATH}/${relativePath}`);
      return previewServerOrigin
        ? `${previewServerOrigin}${mountPath}`
        : mountPath;
    },
    [
      previewMountBasePath,
      projectPath,
      resolvePreviewMatchedRuleSourcePath,
      selectedPreviewHtml,
    ],
  );
  const applyPreviewMatchedRuleToLiveStylesheet = useCallback(
    (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
      elementPath?: number[],
    ) => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument) return false;
      const liveElement =
        Array.isArray(elementPath) && elementPath.length > 0
          ? getLivePreviewSelectedElement(elementPath)
          : null;

      let remainingOccurrence = Math.max(0, rule.occurrenceIndex || 0);
      const normalizedRuleSelector = normalizeSelectorSignature(rule.selector);
      const resolvedRuleSource = resolvePreviewMatchedRuleSourcePath(rule.source);
      const originalCssProperty = rule.originalProperty
        ? toCssPropertyName(rule.originalProperty)
        : "";
      const nextCssKeys = new Set(
        Object.keys(styles).map((key) =>
          toCssPropertyName(key).toLowerCase(),
        ),
      );

      const applyToRule = (styleRule: CSSStyleRule) => {
        if (
          originalCssProperty &&
          !nextCssKeys.has(originalCssProperty.toLowerCase())
        ) {
          styleRule.style.removeProperty(originalCssProperty);
        }
        Object.entries(styles).forEach(([key, rawValue]) => {
          const cssKey = toCssPropertyName(key);
          const valueRaw =
            rawValue === undefined || rawValue === null ? "" : String(rawValue);
          const value =
            cssKey === "font-family"
              ? normalizeFontFamilyCssValue(valueRaw)
              : valueRaw;
          if (!value) {
            styleRule.style.removeProperty(cssKey);
            return;
          }
          const priority = styleRule.style.getPropertyPriority(cssKey);
          styleRule.style.setProperty(cssKey, value, priority || "");
        });
      };

      if (liveElement instanceof Element) {
        let remainingLiveOccurrence = Math.max(0, rule.occurrenceIndex || 0);
        const liveMatchedRule = collectLiveMatchedCssRuleRefsFromElement(
          liveElement,
        ).find((candidate) => {
          if (
            normalizeSelectorSignature(candidate.selector) !==
            normalizedRuleSelector
          ) {
            return false;
          }
          const matchesSource =
            cssRuleSourcesMatch(candidate.source, rule.source) ||
            cssRuleSourcesMatch(candidate.source, resolvedRuleSource || "");
          if (!matchesSource) return false;
          if (remainingLiveOccurrence > 0) {
            remainingLiveOccurrence -= 1;
            return false;
          }
          return true;
        });
        if (liveMatchedRule) {
          console.log("[NoCodeX CSS] live-rule-ref patch", {
            selector: rule.selector,
            source: rule.source,
            resolvedSource: resolvedRuleSource,
            occurrence: rule.occurrenceIndex || 0,
            styles,
          });
          applyToRule(liveMatchedRule.styleRule);
          syncPreviewSelectionSnapshotFromLiveElement(elementPath || []);
          return true;
        }
      }

      const visitRules = (rules: CSSRuleList | undefined): boolean => {
        if (!rules) return false;
        for (const cssRule of Array.from(rules)) {
          if (cssRule instanceof CSSStyleRule) {
            if (
              normalizeSelectorSignature(String(cssRule.selectorText || "")) !==
              normalizedRuleSelector
            ) {
              continue;
            }
            if (remainingOccurrence > 0) {
              remainingOccurrence -= 1;
              continue;
            }
            applyToRule(cssRule);
            return true;
          }
          if (
            cssRule instanceof CSSMediaRule ||
            cssRule instanceof CSSSupportsRule ||
            cssRule instanceof CSSLayerBlockRule
          ) {
            if (visitRules(cssRule.cssRules)) return true;
          }
        }
        return false;
      };

      const selectorOnlyMatches: CSSStyleRule[] = [];
      const collectSelectorMatches = (rules: CSSRuleList | undefined) => {
        if (!rules) return;
        for (const cssRule of Array.from(rules)) {
          if (cssRule instanceof CSSStyleRule) {
            const candidateSelector = normalizeSelectorSignature(
              String(cssRule.selectorText || ""),
            );
            if (candidateSelector !== normalizedRuleSelector) {
              continue;
            }
            if (liveElement instanceof Element) {
              try {
                if (!liveElement.matches(String(cssRule.selectorText || "").trim())) {
                  continue;
                }
              } catch {
                continue;
              }
            }
            selectorOnlyMatches.push(cssRule);
            continue;
          }
          if (
            cssRule instanceof CSSMediaRule ||
            cssRule instanceof CSSSupportsRule ||
            cssRule instanceof CSSLayerBlockRule
          ) {
            collectSelectorMatches(cssRule.cssRules);
          }
        }
      };

      for (const sheet of Array.from(frameDocument.styleSheets)) {
        try {
          const styleSheet = sheet as CSSStyleSheet;
          const styleSheetCandidates = new Set<string>();
          const styleSheetSource = getStyleSheetSourceLabel(styleSheet);
          if (styleSheetSource) {
            styleSheetCandidates.add(styleSheetSource);
            styleSheetCandidates.add(normalizeProjectRelative(styleSheetSource));
          }
          const styleSheetHref = String(styleSheet.href || "");
          if (styleSheetHref) {
            styleSheetCandidates.add(styleSheetHref);
            styleSheetCandidates.add(normalizeProjectRelative(styleSheetHref));
            try {
              const hrefUrl = new URL(styleSheetHref, window.location.href);
              const mountRelative = extractMountRelativePath(hrefUrl.pathname);
              if (mountRelative) {
                styleSheetCandidates.add(mountRelative);
                const virtualPath =
                  resolveVirtualPathFromMountRelative(mountRelative);
                if (virtualPath) {
                  styleSheetCandidates.add(virtualPath);
                  styleSheetCandidates.add(normalizeProjectRelative(virtualPath));
                }
              }
            } catch {
              // Ignore malformed stylesheet URLs.
            }
          }
          const matchesSource = Array.from(styleSheetCandidates).some(
            (candidate) =>
              cssRuleSourcesMatch(candidate, rule.source) ||
              cssRuleSourcesMatch(candidate, resolvedRuleSource || ""),
          );
          if (!matchesSource) {
            collectSelectorMatches(styleSheet.cssRules);
            continue;
          }
          if (visitRules(styleSheet.cssRules)) {
            console.log("[NoCodeX CSS] stylesheet-rules patch", {
              selector: rule.selector,
              source: rule.source,
              resolvedSource: resolvedRuleSource,
              styleSheetSource,
              occurrence: rule.occurrenceIndex || 0,
              styles,
            });
            if (elementPath && elementPath.length > 0) {
              syncPreviewSelectionSnapshotFromLiveElement(elementPath);
            }
            return true;
          }
          collectSelectorMatches(styleSheet.cssRules);
        } catch {
          // Ignore inaccessible stylesheets.
        }
      }

      if (selectorOnlyMatches.length > 0) {
        const fallbackRule =
          selectorOnlyMatches[
            Math.min(remainingOccurrence, selectorOnlyMatches.length - 1)
          ];
        if (fallbackRule) {
          console.log("[NoCodeX CSS] selector-only fallback patch", {
            selector: rule.selector,
            source: rule.source,
            resolvedSource: resolvedRuleSource,
            occurrence: rule.occurrenceIndex || 0,
            styles,
          });
          applyToRule(fallbackRule);
          if (elementPath && elementPath.length > 0) {
            syncPreviewSelectionSnapshotFromLiveElement(elementPath);
          }
          return true;
        }
      }

      return false;
    },
    [
      getLivePreviewSelectedElement,
      extractMountRelativePath,
      resolveVirtualPathFromMountRelative,
      resolvePreviewMatchedRuleSourcePath,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
  );
  const applyPreviewMatchedRuleOptimisticState = useCallback(
    (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
      elementPath?: number[],
    ) => {
      const targetPath =
        Array.isArray(elementPath) && elementPath.length > 0
          ? elementPath
          : previewSelectedPath;
      const liveElement =
        Array.isArray(targetPath) && targetPath.length > 0
          ? getLivePreviewSelectedElement(targetPath)
          : null;

      setPreviewSelectedMatchedCssRules((current) => {
        let remainingOccurrence = Math.max(0, rule.occurrenceIndex || 0);
        let didPatchRule = false;
        const nextRules = current.map((currentRule) => {
          if (
            !cssRuleSourcesMatch(currentRule.source, rule.source) ||
            normalizeSelectorSignature(currentRule.selector) !==
              normalizeSelectorSignature(rule.selector)
          ) {
            return currentRule;
          }
          if (remainingOccurrence > 0) {
            remainingOccurrence -= 1;
            return currentRule;
          }
          didPatchRule = true;
          return {
            ...currentRule,
            declarations: applyPatchToDeclarationEntries(
              currentRule.declarations,
              rule,
              styles,
            ),
          };
        });

        if (!didPatchRule) return current;
        if (!(liveElement instanceof Element)) {
          return nextRules;
        }
        return annotateMatchedCssRuleActivity(liveElement, nextRules);
      });
    },
    [getLivePreviewSelectedElement, previewSelectedPath],
  );
  const updatePreviewLiveStylesheetContent = useCallback(
    (
      sourcePath: string,
      cssContent: string,
      elementPath?: number[],
    ) => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument || !sourcePath) return false;

      const normalizedSourcePath = normalizeProjectRelative(sourcePath);
      const nextCssText = rewriteInlineAssetRefs(
        cssContent,
        normalizedSourcePath,
        filesRef.current,
      );
      let didUpdate = false;
      const styleNodes = Array.from(
        frameDocument.querySelectorAll<HTMLStyleElement>("style[data-source]"),
      );
      styleNodes.forEach((styleNode) => {
        const nodeSource = normalizeProjectRelative(
          styleNode.getAttribute("data-source") || "",
        );
        if (!cssRuleSourcesMatch(nodeSource, normalizedSourcePath)) return;
        styleNode.textContent = nextCssText;
        console.log("[NoCodeX CSS] data-source style override", {
          sourcePath: normalizedSourcePath,
          nodeSource,
        });
        didUpdate = true;
      });

      if (!didUpdate) {
        const stylesheetLinks = Array.from(
          frameDocument.querySelectorAll<HTMLLinkElement>(
            'link[rel="stylesheet"][href]',
          ),
        );
        stylesheetLinks.forEach((linkNode) => {
          const hrefValue = String(linkNode.getAttribute("href") || "").trim();
          if (!hrefValue) return;
          const resolvedHref =
            selectedPreviewHtmlRef.current &&
            !/^(https?:|data:|blob:)/i.test(hrefValue)
              ? resolveProjectRelativePath(
                  selectedPreviewHtmlRef.current,
                  hrefValue,
                ) || hrefValue
              : hrefValue;
          const normalizedHref = normalizeProjectRelative(resolvedHref);
          if (!cssRuleSourcesMatch(normalizedHref, normalizedSourcePath)) return;

          const overrideSelector = `style[data-nx-live-source="${normalizedSourcePath.replace(/"/g, '\\"')}"]`;
          let overrideNode = frameDocument.querySelector<HTMLStyleElement>(
            overrideSelector,
          );
          if (!overrideNode) {
            overrideNode = frameDocument.createElement("style");
            overrideNode.setAttribute("data-nx-live-source", normalizedSourcePath);
            linkNode.insertAdjacentElement("afterend", overrideNode);
          }
          overrideNode.textContent = nextCssText;
          console.log("[NoCodeX CSS] link stylesheet override", {
            sourcePath: normalizedSourcePath,
            hrefValue,
            resolvedHref: normalizedHref,
          });
          didUpdate = true;
        });
      }

      if (didUpdate && Array.isArray(elementPath) && elementPath.length > 0) {
        window.setTimeout(() => {
          syncPreviewSelectionSnapshotFromLiveElement(elementPath);
        }, 0);
      }
      return didUpdate;
    },
    [syncPreviewSelectionSnapshotFromLiveElement],
  );
  const buildPreviewMatchedRulePatchedSource = useCallback(
    (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
    ) => {
      const sourcePath = resolvePreviewMatchedRuleSourcePath(rule.source);
      if (!sourcePath) return null;
      const sourceText =
        typeof textFileCacheRef.current[sourcePath] === "string"
          ? textFileCacheRef.current[sourcePath]
          : typeof filesRef.current[sourcePath]?.content === "string"
            ? (filesRef.current[sourcePath]?.content as string)
            : "";
      if (!sourceText) return null;

      const ruleRange = findCssRuleRange(
        sourceText,
        rule.selector,
        Math.max(0, rule.occurrenceIndex || 0),
      );
      if (!ruleRange) return null;

      const declarationHost = document.createElement("div");
      declarationHost.style.cssText = ruleRange.body;
      const existingDeclarations: PreviewMatchedCssDeclaration[] = [];
      Array.from(declarationHost.style).forEach((property) => {
        const value = declarationHost.style.getPropertyValue(property);
        if (!property || !value) return;
        existingDeclarations.push({
          property,
          value,
          important:
            declarationHost.style.getPropertyPriority(property) === "important",
        });
      });

      const nextDeclarations = applyPatchToDeclarationEntries(
        existingDeclarations,
        rule,
        styles,
      );
      const nextRuleBlock =
        nextDeclarations.length > 0
          ? `${ruleRange.indent}${ruleRange.selectorText} {\n${nextDeclarations
              .map(
                (entry) =>
                  `${ruleRange.indent}  ${entry.property}: ${entry.value}${entry.important ? " !important" : ""};`,
              )
              .join("\n")}\n${ruleRange.indent}}`
          : `${ruleRange.indent}${ruleRange.selectorText} {\n${ruleRange.indent}}`;
      const nextSourceText =
        sourceText.slice(0, ruleRange.start) +
        nextRuleBlock +
        sourceText.slice(ruleRange.end);
      return { sourcePath, nextSourceText };
    },
    [resolvePreviewMatchedRuleSourcePath],
  );
  const persistPreviewMatchedRuleToSourceFile = useCallback(
    async (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
    ) => {
      const patchedSource = buildPreviewMatchedRulePatchedSource(rule, styles);
      if (!patchedSource) return false;
      const { sourcePath, nextSourceText } = patchedSource;
      console.log("[NoCodeX CSS] persisted matched rule to source", {
        selector: rule.selector,
        source: rule.source,
        sourcePath,
        occurrence: rule.occurrenceIndex || 0,
        styles,
      });

      textFileCacheRef.current[sourcePath] = nextSourceText;
      const existingFile = filesRef.current[sourcePath];
      const nextFile: ProjectFile = existingFile
        ? {
            ...existingFile,
            content: nextSourceText,
            type: "css",
          }
        : {
            path: sourcePath,
            name: getCssSourceBasename(sourcePath) || "styles.css",
            type: "css",
            content: nextSourceText,
          };
      filesRef.current = {
        ...filesRef.current,
        [sourcePath]: nextFile,
      };
      setFiles((prev) => ({
        ...prev,
        [sourcePath]: nextFile,
      }));
      pendingPreviewWritesRef.current[sourcePath] = nextSourceText;
      if (!dirtyFilesRef.current.includes(sourcePath)) {
        dirtyFilesRef.current = [...dirtyFilesRef.current, sourcePath];
      }
      setDirtyFiles((prev) =>
        prev.includes(sourcePath) ? prev : [...prev, sourcePath],
      );
      invalidatePreviewDocsForDependency(sourcePath);
      schedulePreviewAutoSave();
      return true;
    },
    [
      buildPreviewMatchedRulePatchedSource,
      invalidatePreviewDocsForDependency,
      schedulePreviewAutoSave,
    ],
  );
  const removePreviewLocalStyleClassesAtPath = useCallback(
    async (elementPath: number[]) => {
      if (
        !selectedPreviewHtml ||
        !Array.isArray(elementPath) ||
        elementPath.length === 0
      ) {
        return false;
      }

      const loadedHtml = await loadFileContent(selectedPreviewHtml, {
        persistToState: false,
      });
      const sourceHtml =
        typeof loadedHtml === "string" && loadedHtml.length > 0
          ? loadedHtml
          : typeof filesRef.current[selectedPreviewHtml]?.content === "string"
            ? (filesRef.current[selectedPreviewHtml]?.content as string)
            : typeof textFileCacheRef.current[selectedPreviewHtml] === "string"
              ? textFileCacheRef.current[selectedPreviewHtml]
              : "";
      if (!sourceHtml) return false;

      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const target = readElementByPath(parsed.body, elementPath);
      const liveTarget = getLivePreviewSelectedElement(elementPath);
      const classSource =
        (target instanceof HTMLElement ? target.getAttribute("class") : "") ||
        (liveTarget instanceof HTMLElement
          ? liveTarget.getAttribute("class")
          : "") ||
        "";
      const removableTokens = String(classSource)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.startsWith("nx-local-style-"));
      if (removableTokens.length === 0) return false;

      const pruneTokens = (value: string | null) => {
        const nextTokens = String(value || "")
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(
            (token) => token && !token.startsWith("nx-local-style-"),
          );
        return nextTokens.join(" ");
      };

      if (target instanceof HTMLElement) {
        const nextClassName = pruneTokens(target.getAttribute("class"));
        if (nextClassName) {
          target.setAttribute("class", nextClassName);
        } else {
          target.removeAttribute("class");
        }
      }

      if (liveTarget instanceof HTMLElement) {
        const nextClassName = pruneTokens(liveTarget.getAttribute("class"));
        if (nextClassName) {
          liveTarget.setAttribute("class", nextClassName);
        } else {
          liveTarget.removeAttribute("class");
        }
        const liveHead =
          liveTarget.ownerDocument.head ||
          liveTarget.ownerDocument.documentElement;
        removableTokens.forEach((token) => {
          liveHead
            ?.querySelector(`style[data-nx-local-style="${token}"]`)
            ?.remove();
        });
      }

      const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
      await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
        refreshPreviewDoc: false,
        elementPath,
      });
      syncPreviewSelectionSnapshotFromLiveElement(elementPath);
      return true;
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      selectedPreviewHtml,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
  );
  const queuePreviewLocalCssPatch = useCallback(
    (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
    ) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const nextPath = [...previewSelectedPath];
      applyPreviewMatchedRuleOptimisticState(rule, styles, nextPath);
      console.log("[NoCodeX CSS] queue matched rule patch", {
        selector: rule.selector,
        source: rule.source,
        occurrence: rule.occurrenceIndex || 0,
        isActive: rule.isActive,
        path: nextPath,
        styles,
      });
      const shouldLivePreview = rule.isActive !== false;
      const appliedLiveRule = shouldLivePreview
        ? applyPreviewMatchedRuleToLiveStylesheet(rule, styles, nextPath)
        : false;
      const patchedSource =
        shouldLivePreview && !appliedLiveRule
          ? buildPreviewMatchedRulePatchedSource(rule, styles)
          : null;
      const updatedLiveStylesheet =
        shouldLivePreview && !appliedLiveRule && patchedSource
          ? updatePreviewLiveStylesheetContent(
              patchedSource.sourcePath,
              patchedSource.nextSourceText,
              nextPath,
            )
          : false;
      if (shouldLivePreview && !appliedLiveRule && !updatedLiveStylesheet) {
        console.log("[NoCodeX CSS] inline selected-element fallback", {
          selector: rule.selector,
          source: rule.source,
          occurrence: rule.occurrenceIndex || 0,
          path: nextPath,
          styles,
        });
        handleImmediatePreviewStyle(styles);
      }
      const currentPending = previewLocalCssDraftPendingRef.current;
      const sameTarget =
        currentPending &&
        currentPending.rule.selector === rule.selector &&
        currentPending.rule.source === rule.source &&
        (currentPending.rule.occurrenceIndex || 0) ===
          (rule.occurrenceIndex || 0) &&
        currentPending.elementPath.length === nextPath.length &&
        currentPending.elementPath.every(
          (segment, index) => segment === nextPath[index],
        );

      if (
        currentPending &&
        !sameTarget &&
        currentPending.elementPath.length > 0
      ) {
        void (async () => {
          const persisted = await persistPreviewMatchedRuleToSourceFile(
            currentPending.rule,
            currentPending.styles,
          );
          if (persisted) {
            console.log("[NoCodeX CSS] flushed previous pending rule to source", {
              selector: currentPending.rule.selector,
              source: currentPending.rule.source,
              occurrence: currentPending.rule.occurrenceIndex || 0,
            });
            await removePreviewLocalStyleClassesAtPath(
              currentPending.elementPath,
            );
            return;
          }
          console.log("[NoCodeX CSS] previous pending rule fell back to nx-local-style", {
            selector: currentPending.rule.selector,
            source: currentPending.rule.source,
            occurrence: currentPending.rule.occurrenceIndex || 0,
          });
          await applyPreviewLocalCssPatchAtPath(
            currentPending.elementPath,
            currentPending.styles,
            {
              syncSelectedElement: false,
            },
          );
        })();
      }

      previewLocalCssDraftPendingRef.current = {
        elementPath: nextPath,
        rule,
        styles: {
          ...(sameTarget ? currentPending?.styles || {} : {}),
          ...styles,
        },
      };

      if (previewLocalCssDraftTimerRef.current !== null) {
        window.clearTimeout(previewLocalCssDraftTimerRef.current);
      }
      previewLocalCssDraftTimerRef.current = window.setTimeout(() => {
        previewLocalCssDraftTimerRef.current = null;
        const pending = previewLocalCssDraftPendingRef.current;
        previewLocalCssDraftPendingRef.current = null;
        if (!pending || pending.elementPath.length === 0) return;
        void (async () => {
          const persisted = await persistPreviewMatchedRuleToSourceFile(
            pending.rule,
            pending.styles,
          );
          if (persisted) {
            console.log("[NoCodeX CSS] timer flush persisted rule", {
              selector: pending.rule.selector,
              source: pending.rule.source,
              occurrence: pending.rule.occurrenceIndex || 0,
            });
            await removePreviewLocalStyleClassesAtPath(pending.elementPath);
            syncPreviewSelectionSnapshotFromLiveElement(pending.elementPath);
            return;
          }
          console.log("[NoCodeX CSS] timer flush fell back to nx-local-style", {
            selector: pending.rule.selector,
            source: pending.rule.source,
            occurrence: pending.rule.occurrenceIndex || 0,
          });
          await applyPreviewLocalCssPatchAtPath(
            pending.elementPath,
            pending.styles,
            {
              syncSelectedElement: true,
            },
          );
        })();
      }, 120);
    },
    [
      applyPreviewLocalCssPatchAtPath,
      applyPreviewMatchedRuleOptimisticState,
      buildPreviewMatchedRulePatchedSource,
      applyPreviewMatchedRuleToLiveStylesheet,
      handleImmediatePreviewStyle,
      persistPreviewMatchedRuleToSourceFile,
      previewSelectedPath,
      removePreviewLocalStyleClassesAtPath,
      syncPreviewSelectionSnapshotFromLiveElement,
      updatePreviewLiveStylesheetContent,
    ],
  );
  const handlePreviewStyleUpdateStable = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      queuePreviewStyleUpdate(styles);
    },
    [queuePreviewStyleUpdate],
  );
  const handlePreviewContentUpdateStable = useCallback(
    (data: {
      content?: string;
      html?: string;
      src?: string;
      href?: string;
    }) => {
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
            dir?: string;
            key?: string;
            code?: string;
            ctrlKey?: boolean;
            metaKey?: boolean;
            shiftKey?: boolean;
            altKey?: boolean;
            editable?: boolean;
            computedStyles?: Record<string, string>;
            matchedCssRules?: Array<{
              selector?: string;
              source?: string;
              declarations?: Array<{
                property?: string;
                value?: string;
                important?: boolean;
              }>;
            }>;
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
      if (payload.type === "PREVIEW_HOTKEY") {
        const key = String(payload.key || "").toLowerCase();
        const code = String(payload.code || "");
        if (!key && !code) return;
        const hasModifier = Boolean(payload.ctrlKey || payload.metaKey);
        const editableTarget = Boolean(payload.editable);
        const altKey = Boolean(payload.altKey);
        const shiftKey = Boolean(payload.shiftKey);

        if (hasModifier && editableTarget) {
          if (key === "s") {
            void saveCodeDraftsRef.current?.();
            void flushPendingPreviewSaves();
            return;
          }
          if (key === "t") {
            requestPreviewRefreshWithUnsavedGuard();
            return;
          }
          if (key === "p") {
            requestSwitchToPreviewMode();
            return;
          }
          if (key === "f") {
            setIsLeftPanelOpen(true);
            setIsRightPanelOpen(true);
            setIsCodePanelOpen(false);
            return;
          }
          if (key === "e") {
            setSidebarToolMode("edit");
            setInteractionMode("preview");
            setPreviewMode("edit");
            return;
          }
          if (key === "k") {
            setIsCommandPaletteOpen((prev) => !prev);
            return;
          }
          if (code === "Backquote") {
            setShowTerminal((prev) => !prev);
          }
          return;
        }
        if (
          key === "escape" &&
          isPageSwitchPromptOpen &&
          !isPageSwitchPromptBusy
        ) {
          closePendingPageSwitchPrompt();
          return;
        }
        if (key === "escape" && isZenMode) {
          toggleZenMode();
          return;
        }

        if (!hasModifier && !altKey && !editableTarget) {
          if (key === "w") {
            setIsLeftPanelOpen((prev) => !prev);
            return;
          }
          if (key === "e") {
            setIsRightPanelOpen((prev) => {
              const next = !prev;
              if (next) setIsCodePanelOpen(false);
              return next;
            });
            return;
          }
        }
        if (!hasModifier) return;

        if (key === "k") {
          setIsCommandPaletteOpen((prev) => !prev);
          return;
        }
        if (key === "f") {
          setIsLeftPanelOpen(true);
          setIsRightPanelOpen(true);
          setIsCodePanelOpen(false);
          return;
        }
        if (key === "p") {
          requestSwitchToPreviewMode();
          return;
        }
        if (key === "e") {
          setSidebarToolMode("edit");
          setInteractionMode("preview");
          setPreviewMode("edit");
          return;
        }
        if (key === "`" || code === "Backquote") {
          setShowTerminal((prev) => !prev);
          return;
        }
        if (key === "j") {
          toggleZenMode();
          return;
        }
        if (key === "s") {
          void saveCodeDraftsRef.current?.();
          void flushPendingPreviewSaves();
          return;
        }
        if (key === "t") {
          requestPreviewRefreshWithUnsavedGuard();
          return;
        }
        if (key === "z" && !shiftKey) {
          runUndo();
          return;
        }
        if (key === "u" || key === "y" || (key === "z" && shiftKey)) {
          runRedo();
        }
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
        if (target === activeFileRef.current) return;

        syncPreviewActiveFile(target, "navigate");
        return;
      }

      if (payload.type === "PREVIEW_SWIPE_DIR") {
        const currentPath =
          selectedPreviewHtmlRef.current || activeFileRef.current;
        if (!currentPath) return;
        const dir = payload.dir === "prev" ? "prev" : "next";
        const nextPath = resolveAdjacentSlidePath(currentPath, dir);
        if (!nextPath || nextPath === currentPath) return;
        (window as any).__explorerNavTime = Date.now();
        explorerSelectionLockRef.current = nextPath;
        explorerSelectionLockUntilRef.current =
          Date.now() + EXPLORER_LOCK_TTL_MS;
        syncPreviewActiveFile(nextPath, "explorer", {
          skipUnsavedPrompt: true,
        });
        return;
      }

      if (payload.type === "PREVIEW_PATH_CHANGED") {
        console.log("[DEBUG] Frame reported PATH_CHANGED:", payload.path);
        if (typeof payload.path !== "string" || !payload.path) return;
        const mountRelativePath = extractMountRelativePath(payload.path);
        if (!mountRelativePath) return;
        const resolvedVirtualPath =
          resolveVirtualPathFromMountRelative(mountRelativePath);
        if (!resolvedVirtualPath) return;

        const lockPath = explorerSelectionLockRef.current;
        const lockActive =
          Boolean(lockPath) &&
          Date.now() <= explorerSelectionLockUntilRef.current;
        if (lockPath && !lockActive) {
          explorerSelectionLockRef.current = null;
          explorerSelectionLockUntilRef.current = 0;
        }
        if (lockPath && lockActive) {
          const resolvedNorm =
            normalizeProjectRelative(resolvedVirtualPath).toLowerCase();
          const lockNorm = normalizeProjectRelative(lockPath).toLowerCase();
          if (resolvedNorm !== lockNorm) {
            // Frame changed to wrong page — redirect back.
            // Clear lock first to prevent infinite redirect.
            return;
          }
          // Path matches lock — clear so future changes propagate freely.
          explorerSelectionLockRef.current = null;
          explorerSelectionLockUntilRef.current = 0;
        }
        // THE FIX: Block rogue automated path changes during manual navigation transition
        const lockAge = Date.now() - ((window as any).__explorerNavTime || 0);
        if (lockAge < 2500 && resolvedVirtualPath !== activeFileRef.current) {
          return;
        }
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
      if (payload.type === "PREVIEW_INLINE_EDIT_DRAFT") {
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath) return;
        const draftHtml = typeof payload.html === "string" ? payload.html : "";
        const draftFile = selectedPreviewHtmlRef.current;
        if (draftFile) {
          setDirtyFiles((prev) =>
            prev.includes(draftFile) ? prev : [...prev, draftFile],
          );
          inlineEditDraftPendingRef.current = {
            filePath: draftFile,
            elementPath: nextPath,
            html: draftHtml,
          };
          if (inlineEditDraftTimerRef.current !== null) {
            window.clearTimeout(inlineEditDraftTimerRef.current);
          }
          inlineEditDraftTimerRef.current = window.setTimeout(() => {
            inlineEditDraftTimerRef.current = null;
            const pending = inlineEditDraftPendingRef.current;
            inlineEditDraftPendingRef.current = null;
            if (!pending) return;
            void applyPreviewInlineEditDraft(
              pending.filePath,
              pending.elementPath,
              pending.html,
            );
          }, 180);
        }
        const liveElement = getLivePreviewSelectedElement(nextPath);
        const draftText = normalizeEditorMultilineText(
          liveElement
            ? extractTextWithBreaks(liveElement)
            : extractTextFromHtmlFragment(draftHtml),
        );
        setPreviewSelectedPath(nextPath);
        if (!(liveElement instanceof HTMLElement)) {
          setPreviewSelectedElement((prev) =>
            prev
              ? {
                  ...prev,
                  content: draftText,
                  html: draftHtml,
                }
              : prev,
          );
          return;
        }
        const computedStyles =
          extractComputedStylesFromElement(liveElement) || null;
        const inlineStyles = parseInlineStyleText(
          liveElement.getAttribute("style") || "",
        );
        const liveAttributes =
          extractCustomAttributesFromElement(liveElement) || undefined;
        const liveSrc = liveElement.getAttribute("src") || "";
        const liveHref = liveElement.getAttribute("href") || "";
        const liveTag = String(liveElement.tagName || "div").toLowerCase();
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
        setPreviewSelectedComputedStyles(computedStyles);
        setPreviewSelectedElement((prev) => ({
          id: liveElement.id || prev?.id || `preview-${Date.now()}`,
          type: liveTag,
          name: liveTag.toUpperCase(),
          content: draftText,
          html: draftHtml || liveElement.innerHTML || prev?.html || "",
          ...(liveSrc ? { src: liveSrc } : {}),
          ...(liveHref ? { href: liveHref } : {}),
          ...(liveElement.className
            ? { className: liveElement.className }
            : {}),
          ...(liveAttributes ? { attributes: liveAttributes } : {}),
          ...(resolvedAnimation ? { animation: resolvedAnimation } : {}),
          styles: inlineStyles,
          children: [],
        }));
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
        void applyPreviewLocalCssPatchAtPath(nextPath, stylePatch, {
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
        console.log("DEBUG: Iframe reported selection:", payload);

        // 1. Correctly sanitize and validate the path from the iframe
        const nextPath = normalizePreviewPath(payload.path);
        if (!nextPath || nextPath.length === 0) {
          console.warn("DEBUG: Selection ignored - invalid or empty path");
          return;
        }

        // 2. Prepare data parsing
        const tag = (payload.tag || "div").toLowerCase();
        const id = payload.id ? String(payload.id) : `preview-${Date.now()}`;
        const inlineStyles = parseInlineStyleText(
          typeof payload.inlineStyle === "string" ? payload.inlineStyle : "",
        );

        const payloadComputedStyles =
          payload.computedStyles && typeof payload.computedStyles === "object"
            ? (payload.computedStyles as React.CSSProperties)
            : null;

        const payloadMatchedCssRules = Array.isArray(payload.matchedCssRules)
          ? (payload.matchedCssRules
              .map((rule) => {
                if (!rule || typeof rule !== "object") return null;
                const selector =
                  typeof rule.selector === "string" ? rule.selector : "";
                const source =
                  typeof rule.source === "string" ? rule.source : "stylesheet";
                const declarations = Array.isArray(rule.declarations)
                  ? (rule.declarations
                      .map((declaration) => {
                        if (!declaration || typeof declaration !== "object")
                          return null;
                        return typeof declaration.property === "string" &&
                          typeof declaration.value === "string"
                          ? {
                              property: declaration.property,
                              value: declaration.value,
                              important: Boolean(declaration.important),
                              active:
                                declaration.active === undefined
                                  ? undefined
                                  : Boolean(declaration.active),
                            }
                          : null;
                      })
                      .filter(Boolean) as PreviewMatchedCssDeclaration[])
                  : [];
                if (!selector || declarations.length === 0) return null;
                return { selector, source, declarations };
              })
              .filter(Boolean) as PreviewMatchedCssRule[])
          : [];
        const liveElement = getLivePreviewSelectedElement(nextPath);
        const computedStyles =
          payloadComputedStyles ||
          extractComputedStylesFromElement(liveElement);
        const liveMatchedCssRules = liveElement
          ? collectMatchedCssRulesFromElement(liveElement)
          : [];
        const matchedCssRules =
          liveMatchedCssRules.length > 0
            ? liveMatchedCssRules
            : payloadMatchedCssRules;

        const payloadText =
          typeof payload.text === "string" ? payload.text.trim() : "";
        const payloadHtml =
          typeof payload.html === "string" ? payload.html : "";
        const liveText = liveElement ? extractTextWithBreaks(liveElement) : "";
        const liveHtml =
          liveElement instanceof HTMLElement ? liveElement.innerHTML || "" : "";

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

        let savedHtmlText = "";
        let savedHtmlMarkup = "";
        let savedHtmlAttributes: Record<string, string> = {};

        if (
          ((!payloadText && !liveText) || (!payloadHtml && !liveHtml)) &&
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
                savedHtmlMarkup = savedEl.innerHTML || "";
                savedHtmlAttributes =
                  extractCustomAttributesFromElement(savedEl) || {};
              }
            }
          } catch (err) {
            console.error("DEBUG: Failed to parse saved HTML", err);
          }
        }

        const editableText = normalizeEditorMultilineText(
          payloadText || liveText || savedHtmlText,
        );
        const editableHtml = payloadHtml || liveHtml || savedHtmlMarkup;
        const payloadSrc =
          typeof payload.src === "string" && payload.src.trim().length > 0
            ? payload.src.trim()
            : "";
        const payloadHref =
          typeof payload.href === "string" && payload.href.trim().length > 0
            ? payload.href.trim()
            : "";
        const liveSrc =
          liveElement instanceof HTMLElement
            ? liveElement.getAttribute("src") || ""
            : "";
        const liveHref =
          liveElement instanceof HTMLElement
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

        // 3. Construct the VirtualElement with the PATH included
        const nextElement: VirtualElement = {
          id,
          type: tag as any,
          name: tag.toUpperCase(),
          content: editableText,
          html: editableHtml,
          src: resolvedSrc,
          href: resolvedHref,
          className:
            typeof payload.className === "string" &&
            payload.className.length > 0
              ? payload.className
              : undefined,
          attributes: resolvedAttributes,
          styles: inlineStyles,
          animation: resolvedAnimation || undefined,
          children: [],
          path: nextPath, // <--- CRITICAL: This allows handleImmediatePreviewStyle to work
        };

        console.log(
          "DEBUG: Setting active inspector element with path:",
          nextPath,
        );

        // 4. Update all relevant states
        setPreviewSelectedPath(nextPath);
        setPreviewSelectedElement(nextElement);
        setPreviewSelectedComputedStyles(computedStyles);
        setPreviewSelectedMatchedCssRules(matchedCssRules);

        // These ensure the right panel actually opens and focuses the element
        setSelectedId(null);
        setIsCodePanelOpen(false);
        setIsRightPanelOpen(true);
      }
    };

    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
  }, [
    applyPreviewDrawCreate,
    applyPreviewLocalCssPatchAtPath,
    applyPreviewStyleUpdateAtPath,
    appendPreviewConsole,
    closePendingPageSwitchPrompt,
    getLivePreviewSelectedElement,
    flushPendingPreviewSaves,
    isActivePreviewMessageSource,
    isMountedPreview,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    isZenMode,
    extractMountRelativePath,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    resolveAdjacentSlidePath,
    previewSyncedFile,
    resolveVirtualPathFromMountRelative,
    runRedo,
    runUndo,
    selectedPreviewHtml,
    shouldProcessPreviewPageSignal,
    syncPreviewActiveFile,
    toggleZenMode,
    applyPreviewInlineEditDraft,
    applyPreviewInlineEdit,
    EXPLORER_LOCK_TTL_MS,
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
  const activeCodeFilePath = useMemo(() => {
    const candidate =
      activeFile &&
      files[activeFile] &&
      isCodeEditableFile(activeFile, files[activeFile].type)
        ? activeFile
        : selectedPreviewHtml &&
            files[selectedPreviewHtml] &&
            isCodeEditableFile(
              selectedPreviewHtml,
              files[selectedPreviewHtml].type,
            )
          ? selectedPreviewHtml
          : null;
    if (candidate) return candidate;
    const firstText = Object.keys(files).find((path) =>
      isCodeEditableFile(path, files[path].type),
    );
    return firstText ?? null;
  }, [activeFile, files, selectedPreviewHtml]);
  const activeCodeFileType: ProjectFile["type"] | null = activeCodeFilePath
    ? (files[activeCodeFilePath]?.type ?? null)
    : null;
  const activeCodeContent = useMemo(() => {
    if (!activeCodeFilePath) return "";
    if (typeof codeDraftByPath[activeCodeFilePath] === "string") {
      return codeDraftByPath[activeCodeFilePath];
    }
    const raw = files[activeCodeFilePath]?.content;
    return typeof raw === "string" ? raw : "";
  }, [activeCodeFilePath, codeDraftByPath, files]);
  const activeCodeIsDirty = activeCodeFilePath
    ? Boolean(codeDirtyPathSet[activeCodeFilePath])
    : false;
  const activeDetachedEditorFilePath = useMemo(() => {
    if (activeFile && files[activeFile]) return activeFile;
    if (selectedPreviewHtml && files[selectedPreviewHtml])
      return selectedPreviewHtml;
    return Object.keys(files).sort((a, b) => a.localeCompare(b))[0] ?? null;
  }, [activeFile, files, selectedPreviewHtml]);
  const activeDetachedEditorFileType: ProjectFile["type"] | null =
    activeDetachedEditorFilePath
      ? (files[activeDetachedEditorFilePath]?.type ?? null)
      : null;
  const activeDetachedEditorContent = useMemo(() => {
    if (!activeDetachedEditorFilePath) return "";
    if (
      typeof codeDraftByPath[activeDetachedEditorFilePath] === "string" &&
      files[activeDetachedEditorFilePath] &&
      isCodeEditableFile(
        activeDetachedEditorFilePath,
        files[activeDetachedEditorFilePath].type,
      )
    ) {
      return codeDraftByPath[activeDetachedEditorFilePath];
    }
    const raw = files[activeDetachedEditorFilePath]?.content;
    return typeof raw === "string" ? raw : "";
  }, [activeDetachedEditorFilePath, codeDraftByPath, files]);
  const activeDetachedEditorIsDirty = activeDetachedEditorFilePath
    ? Boolean(codeDirtyPathSet[activeDetachedEditorFilePath])
    : false;
  const detachedEditorIsTextEditable = Boolean(
    activeDetachedEditorFilePath &&
    activeDetachedEditorFileType &&
    isCodeEditableFile(
      activeDetachedEditorFilePath,
      activeDetachedEditorFileType,
    ),
  );
  const detachedEditorFiles = useMemo(
    () => Object.keys(files).sort((a, b) => a.localeCompare(b)),
    [files],
  );
  const handleDetachedEditorSelectFile = useCallback(
    (path: string) => {
      if (!path || !files[path]) return;
      setActiveFileStable(path);
      if (files[path]?.type === "html") {
        setPreviewSyncedFile((prev) => (prev === path ? prev : path));
        setPreviewNavigationFile((prev) => (prev === path ? prev : path));
      }
      if (isSvgPath(path)) {
        const absolutePath = filePathIndexRef.current[path];
        if (!absolutePath) return;
        void (async () => {
          try {
            const raw = await (Neutralino as any).filesystem.readFile(
              absolutePath,
            );
            textFileCacheRef.current[path] = raw;
            setFiles((prev) => {
              const existing = prev[path];
              if (!existing) return prev;
              return {
                ...prev,
                [path]: {
                  ...existing,
                  content: raw,
                },
              };
            });
          } catch (error) {
            console.warn(`Failed reading SVG source ${path}:`, error);
          }
        })();
        return;
      }
      void loadFileContent(path, { persistToState: true });
    },
    [files, loadFileContent, setActiveFileStable],
  );
  const saveCodeDraftAtPath = useCallback(
    async (path: string) => {
      const draft = codeDraftByPathRef.current[path];
      if (typeof draft !== "string") return;
      const file = filesRef.current[path];
      if (!file || !isCodeEditableFile(path, file.type)) return;
      try {
        if (file.type === "html") {
          await persistPreviewHtmlContent(path, draft, {
            refreshPreviewDoc: path === selectedPreviewHtmlRef.current,
            saveNow: true,
            pushToHistory: true,
          });
          if (path === selectedPreviewHtmlRef.current) {
            setPreviewNavigationFile((prev) => (prev === path ? prev : path));
            setPreviewRefreshNonce((prev) => prev + 1);
          }
        } else {
          const absolutePath = filePathIndexRef.current[path];
          if (!absolutePath) return;
          await (Neutralino as any).filesystem.writeFile(absolutePath, draft);
          textFileCacheRef.current[path] = draft;
          setFiles((prev) => {
            const existing = prev[path];
            if (!existing) return prev;
            return {
              ...prev,
              [path]: {
                ...existing,
                content: draft,
              },
            };
          });
          const currentPreview = selectedPreviewHtmlRef.current;
          if (currentPreview) {
            setPreviewNavigationFile((prev) =>
              prev === currentPreview ? prev : currentPreview,
            );
          }
          setPreviewRefreshNonce((prev) => prev + 1);
        }
        delete codeDraftByPathRef.current[path];
        delete codeDirtyPathSetRef.current[path];
        dirtyFilesRef.current = dirtyFilesRef.current.filter(
          (entry) => entry !== path,
        );
        setCodeDraftByPath((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setCodeDirtyPathSet((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
      } catch (error) {
        console.warn(`Failed saving code file ${path}:`, error);
      }
    },
    [persistPreviewHtmlContent],
  );
  const saveAllCodeDrafts = useCallback(async () => {
    const dirtyPaths = Object.keys(codeDirtyPathSetRef.current);
    for (const path of dirtyPaths) {
      await saveCodeDraftAtPath(path);
    }
  }, [saveCodeDraftAtPath]);
  useEffect(() => {
    saveCodeDraftsRef.current = saveAllCodeDrafts;
    return () => {
      if (saveCodeDraftsRef.current === saveAllCodeDrafts) {
        saveCodeDraftsRef.current = null;
      }
    };
  }, [saveAllCodeDrafts]);
  const handleCodeDraftChange = useCallback(
    (nextValue: string | undefined) => {
      if (!activeCodeFilePath) return;
      const value = nextValue ?? "";
      codeDraftByPathRef.current = {
        ...codeDraftByPathRef.current,
        [activeCodeFilePath]: value,
      };
      codeDirtyPathSetRef.current = {
        ...codeDirtyPathSetRef.current,
        [activeCodeFilePath]: true,
      };
      if (!dirtyFilesRef.current.includes(activeCodeFilePath)) {
        dirtyFilesRef.current = [...dirtyFilesRef.current, activeCodeFilePath];
      }
      setCodeDraftByPath((prev) => ({
        ...prev,
        [activeCodeFilePath]: value,
      }));
      setCodeDirtyPathSet((prev) => ({
        ...prev,
        [activeCodeFilePath]: true,
      }));
      setDirtyFiles((prev) =>
        prev.includes(activeCodeFilePath)
          ? prev
          : [...prev, activeCodeFilePath],
      );
    },
    [activeCodeFilePath],
  );
  const handleDetachedEditorChange = useCallback(
    (nextValue: string) => {
      if (!activeDetachedEditorFilePath || !activeDetachedEditorFileType)
        return;
      if (
        !isCodeEditableFile(
          activeDetachedEditorFilePath,
          activeDetachedEditorFileType,
        )
      ) {
        return;
      }
      codeDraftByPathRef.current = {
        ...codeDraftByPathRef.current,
        [activeDetachedEditorFilePath]: nextValue,
      };
      codeDirtyPathSetRef.current = {
        ...codeDirtyPathSetRef.current,
        [activeDetachedEditorFilePath]: true,
      };
      if (!dirtyFilesRef.current.includes(activeDetachedEditorFilePath)) {
        dirtyFilesRef.current = [
          ...dirtyFilesRef.current,
          activeDetachedEditorFilePath,
        ];
      }
      setCodeDraftByPath((prev) => ({
        ...prev,
        [activeDetachedEditorFilePath]: nextValue,
      }));
      setCodeDirtyPathSet((prev) => ({
        ...prev,
        [activeDetachedEditorFilePath]: true,
      }));
      setDirtyFiles((prev) =>
        prev.includes(activeDetachedEditorFilePath)
          ? prev
          : [...prev, activeDetachedEditorFilePath],
      );
    },
    [activeDetachedEditorFilePath, activeDetachedEditorFileType],
  );
  useEffect(() => {
    if (!isCodePanelOpen) return;
    if (!activeCodeFilePath) return;
    void loadFileContent(activeCodeFilePath, { persistToState: true });
  }, [activeCodeFilePath, isCodePanelOpen, loadFileContent]);

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
  const [currentDevicePixelRatio, setCurrentDevicePixelRatio] = useState(() =>
    typeof window !== "undefined" && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1,
  );
  const useCompactBottomPanel = true;
  const CONSOLE_PANEL_WIDTH = 420;
  const shouldPushTabletFrame =
    deviceMode === "tablet" &&
    frameZoom === 75 &&
    currentDevicePixelRatio !== 1;
  const tabletPanelPushX = useMemo(() => {
    if (isPdfAnnotationPanelOpen && deviceMode === "tablet") {
      return 0;
    }
    if (!shouldPushTabletFrame) return 0;

    const rightActive =
      rightPanelMode === "inspector" ||
      isRightPanelOpen ||
      isPdfAnnotationPanelOpen ||
      isScreenshotGalleryOpen;
    if (isLeftPanelOpen === rightActive) return 0;

    // Calculate push amount based on panel widths
    const pushAmount = Math.round(leftPanelWidth * 0.42);
    return isLeftPanelOpen ? pushAmount : -pushAmount;
  }, [
    isLeftPanelOpen,
    rightPanelMode,
    isRightPanelOpen,
    isPdfAnnotationPanelOpen,
    isScreenshotGalleryOpen,
    leftPanelWidth,
    shouldPushTabletFrame,
    deviceMode,
  ]);
  const baseOverflowX = bothPanelsOpen ? "scroll" : "auto";
  const hasPdfAnnotationsLoaded = pdfAnnotationRecords.length > 0;
  const isRightInspectorMode = rightPanelMode === "inspector";
  const isRightInspectorAttached = isRightInspectorMode && isRightPanelOpen;
  const showEmbeddedPdfAnnotations =
    isPdfAnnotationPanelOpen &&
    (hasPdfAnnotationsLoaded ||
      isPdfAnnotationLoading ||
      Boolean(pdfAnnotationError) ||
      pdfAnnotationProcessingLogs.length > 0);
  const showStyleInspectorSection = isStyleInspectorSectionOpen;
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
            (isCodePanelOpen ? 0.12 : 0) +
            (showTerminal ? 0.14 : 0),
        )
      : 0;
  const codePanelStageOffset =
    isCodePanelOpen && deviceMode !== "mobile"
      ? (() => {
          const viewportWidth =
            typeof window !== "undefined" ? window.innerWidth : 1440;
          if (!isFloatingPanels) return CODE_PANEL_WIDTH;
          const floatingPanelWidth = Math.min(
            42 * 16,
            Math.max(320, viewportWidth - 96),
          );
          const floatingRightInset = 40; // `right-10`
          return floatingPanelWidth + floatingRightInset;
        })()
      : 0;
  const consolePanelStageOffset = 0;
  const stageViewportWidth = Math.max(
    320,
    (typeof window !== "undefined" ? window.innerWidth : 1440) -
      codePanelStageOffset -
      consolePanelStageOffset,
  );
  const estimatedFrameWidthPx =
    deviceMode === "mobile"
      ? 375 * frameScale
      : deviceMode === "tablet"
        ? tabletMetrics.frameWidth * frameScale
        : desktopResolution === "resizable"
          ? stageViewportWidth * 0.8 * frameScale
          : 921.6 * frameScale;
  const halfSpareSpace = (stageViewportWidth - estimatedFrameWidthPx) / 2;
  const maxShiftMagnitude =
    Math.max(0, Math.floor(halfSpareSpace - 16)) +
    (isPdfAnnotationPanelOpen && deviceMode !== "tablet" ? 400 : 0);
  const intendedCodeShiftX = 0;
  const clampedCodeShiftX = Math.max(
    -maxShiftMagnitude,
    Math.min(maxShiftMagnitude, intendedCodeShiftX),
  );
  const clampedTabletShiftX = Math.max(
    -maxShiftMagnitude,
    Math.min(maxShiftMagnitude, tabletPanelPushX + clampedCodeShiftX),
  );
  const toolbarAnchorLeft = Math.max(
    16,
    Math.round(
      (typeof window !== "undefined" ? window.innerWidth : 1440) / 2 -
        estimatedFrameWidthPx / 2 +
        20,
    ),
  );
  const applyPreviewIdentityUpdate = useCallback(
    async (identity: { id: string; className: string }) => {
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

      const nextId = identity.id.trim();
      const nextClassName = identity.className.trim();

      if (target) {
        if (nextId) target.setAttribute("id", nextId);
        else target.removeAttribute("id");
        if (nextClassName) target.setAttribute("class", nextClassName);
        else target.removeAttribute("class");
      }
      if (liveTarget) {
        if (nextId) liveTarget.setAttribute("id", nextId);
        else liveTarget.removeAttribute("id");
        if (nextClassName) liveTarget.setAttribute("class", nextClassName);
        else liveTarget.removeAttribute("class");
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
              id: nextId || prev.id,
              className: nextClassName || undefined,
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
  const handlePreviewIdentityUpdateStable = useCallback(
    (identity: { id: string; className: string }) => {
      void applyPreviewIdentityUpdate(identity);
    },
    [applyPreviewIdentityUpdate],
  );
  const handlePreviewMatchedRulePropertyAdd = useCallback(
    (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
    ) => {
      if (!previewSelectedPath || !Array.isArray(previewSelectedPath)) return;
      queuePreviewLocalCssPatch(rule, styles);
    },
    [previewSelectedPath, queuePreviewLocalCssPatch],
  );
  const showDeviceFrameToolbar = true;

  useEffect(() => {
    const syncDevicePixelRatio = () => {
      const next =
        typeof window !== "undefined" && window.devicePixelRatio
          ? window.devicePixelRatio
          : 1;
      setCurrentDevicePixelRatio((prev) =>
        Math.abs(prev - next) > 0.01 ? next : prev,
      );
    };

    syncDevicePixelRatio();
    const media =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
        : null;

    window.addEventListener("resize", syncDevicePixelRatio);
    media?.addEventListener?.("change", syncDevicePixelRatio);

    return () => {
      window.removeEventListener("resize", syncDevicePixelRatio);
      media?.removeEventListener?.("change", syncDevicePixelRatio);
    };
  }, [currentDevicePixelRatio]);

  useEffect(() => {
    const previousDpr = lastPanelDprRef.current;
    lastPanelDprRef.current = currentDevicePixelRatio;
    if (
      previousDpr === null ||
      Math.abs(previousDpr - currentDevicePixelRatio) < 0.01
    ) {
      return;
    }
    setRightPanelFloatingPosition(
      getDefaultRightPanelPosition(rightPanelWidth),
    );
  }, [currentDevicePixelRatio, getDefaultRightPanelPosition, rightPanelWidth]);

  useEffect(() => {
    const clampRightPanelPosition = () => {
      const viewportWidth =
        typeof window !== "undefined" ? window.innerWidth : 1440;
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 900;
      setRightPanelFloatingPosition((prev) => ({
        left: Math.max(
          8,
          Math.min(prev.left, Math.max(8, viewportWidth - rightPanelWidth - 8)),
        ),
        top: Math.max(
          56,
          Math.min(prev.top, Math.max(56, viewportHeight - 140)),
        ),
      }));
    };

    window.addEventListener("resize", clampRightPanelPosition);
    return () => window.removeEventListener("resize", clampRightPanelPosition);
  }, [rightPanelWidth]);

  useEffect(() => {
    if (!isCompactConsoleOpening) return;
    const timer = window.setTimeout(() => {
      setIsCompactConsoleOpening(false);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [isCompactConsoleOpening]);

  useEffect(() => {
    const targetZoom: 75 | 100 = currentDevicePixelRatio >= 1.5 ? 75 : 100;
    const previousAuto = lastAutoDprZoomRef.current;
    if (previousAuto === targetZoom) return;
    lastAutoDprZoomRef.current = targetZoom;
    if (deviceMode !== "tablet") return;
    setFrameZoom(targetZoom);
  }, [currentDevicePixelRatio, deviceMode]);

  useEffect(() => {
    if (bottomPanelTab !== "console") {
      setBottomPanelTab("console");
    }
  }, [bottomPanelTab]);

  const renderDetachedConsoleWindow = useCallback(() => {
    const detachedWindow = detachedConsoleWindowRef.current;
    if (!detachedWindow || detachedWindow.closed) {
      detachedConsoleWindowRef.current = null;
      return;
    }

    const rows =
      previewConsoleEntries.length === 0
        ? `<div class="empty">No project logs yet</div>`
        : previewConsoleEntries
            .map((entry) => {
              const levelClass =
                entry.level === "error"
                  ? "error"
                  : entry.level === "warn"
                    ? "warn"
                    : "info";
              return `<div class="row ${levelClass}">
  <div class="meta">${escapeConsoleHtml(entry.level.toUpperCase())} • ${escapeConsoleHtml(entry.source || "preview")}</div>
  <div class="message">${escapeConsoleHtml(entry.message)}</div>
</div>`;
            })
            .join("");

    detachedWindow.document.open();
    detachedWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>NoCodeX Console</title>
  <style>
    :root { color-scheme: ${theme === "dark" ? "dark" : "light"}; }
    body {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: ${theme === "dark" ? "#020617" : "#f8fafc"};
      color: ${theme === "dark" ? "#e2e8f0" : "#0f172a"};
    }
    .shell { display: flex; flex-direction: column; height: 100vh; }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border-bottom: 1px solid ${theme === "dark" ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.2)"};
      background: ${theme === "dark" ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)"};
      position: sticky; top: 0;
    }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; }
    .badge {
      font-size: 11px; padding: 4px 8px; border-radius: 999px;
      border: 1px solid ${theme === "dark" ? "rgba(148,163,184,0.3)" : "rgba(148,163,184,0.25)"};
      background: ${theme === "dark" ? "rgba(30,41,59,0.7)" : "rgba(241,245,249,0.95)"};
    }
    .body { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .row {
      border-radius: 12px; padding: 10px 12px;
      border: 1px solid ${theme === "dark" ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.18)"};
      background: ${theme === "dark" ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.95)"};
      white-space: pre-wrap; word-break: break-word;
    }
    .row.warn { border-color: rgba(245,158,11,0.35); }
    .row.error { border-color: rgba(239,68,68,0.35); }
    .meta { font-size: 10px; opacity: 0.7; margin-bottom: 6px; }
    .message { font-size: 12px; line-height: 1.45; }
    .empty {
      flex: 1; display: flex; align-items: center; justify-content: center;
      border: 1px dashed ${theme === "dark" ? "rgba(148,163,184,0.3)" : "rgba(148,163,184,0.25)"};
      border-radius: 16px; min-height: 160px; font-size: 12px; opacity: 0.75;
    }
    button {
      border: 1px solid ${theme === "dark" ? "rgba(148,163,184,0.3)" : "rgba(148,163,184,0.25)"};
      background: transparent; color: inherit; border-radius: 10px; padding: 8px 10px; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <div class="badges">
        <span class="badge">Logs ${previewConsoleEntries.length}</span>
        <span class="badge">Warn ${previewConsoleWarnCount}</span>
        <span class="badge">Error ${previewConsoleErrorCount}</span>
      </div>
      <button onclick="window.close()">Close</button>
    </div>
    <div class="body">${rows}</div>
  </div>
</body>
</html>`);
    detachedWindow.document.close();
  }, [
    previewConsoleEntries,
    previewConsoleWarnCount,
    previewConsoleErrorCount,
    theme,
  ]);

  const handleDetachConsoleWindow = useCallback(() => {
    const existingWindow = detachedConsoleWindowRef.current;
    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus();
      return;
    }
    const nextWindow = window.open(
      "",
      "nocodex-console-window",
      "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes",
    );
    if (!nextWindow) return;
    detachedConsoleWindowRef.current = nextWindow;
    window.setTimeout(() => {
      renderDetachedConsoleWindow();
    }, 0);
    setShowTerminal(false);
  }, [renderDetachedConsoleWindow]);

  useEffect(() => {
    renderDetachedConsoleWindow();
  }, [renderDetachedConsoleWindow]);

  useEffect(() => {
    return () => {
      if (
        detachedConsoleWindowRef.current &&
        !detachedConsoleWindowRef.current.closed
      ) {
        detachedConsoleWindowRef.current.close();
      }
    };
  }, []);
  useEffect(() => {
    if (interactionMode !== "preview" || !quickTextEdit.open) return;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 900;
    const margin = 16;
    const panelWidth = rightPanelWidth;
    const panelHeight = 420;
    const nextLeft = Math.max(
      margin,
      Math.min(quickTextEdit.x, viewportWidth - panelWidth - margin),
    );
    const nextTop = Math.max(
      margin,
      Math.min(quickTextEdit.y, viewportHeight - panelHeight - margin),
    );
    setRightPanelFloatingPosition({ left: nextLeft, top: nextTop });
    if (!isRightPanelOpen) {
      setIsRightPanelOpen(true);
    }
  }, [
    interactionMode,
    quickTextEdit.open,
    quickTextEdit.x,
    quickTextEdit.y,
    rightPanelWidth,
    isRightPanelOpen,
  ]);
  const pendingSwitchFromLabel =
    pendingPageSwitch?.fromPath &&
    normalizePath(pendingPageSwitch.fromPath).split("/").filter(Boolean)
      .length > 0
      ? normalizePath(pendingPageSwitch.fromPath)
          .split("/")
          .filter(Boolean)
          .slice(-1)[0]
      : pendingPageSwitch?.fromPath || "current page";
  const pendingSwitchNextLabel =
    pendingPageSwitch?.nextPath &&
    normalizePath(pendingPageSwitch.nextPath).split("/").filter(Boolean)
      .length > 0
      ? normalizePath(pendingPageSwitch.nextPath)
          .split("/")
          .filter(Boolean)
          .slice(-1)[0]
      : pendingPageSwitch?.nextPath || "next page";
  const isPendingRefresh = pendingPageSwitch?.mode === "refresh";
  const isPendingPreviewMode = pendingPageSwitch?.mode === "preview_mode";
  const renderPdfAnnotationCard = useCallback(
    (annotation: PdfAnnotationUiRecord) => {
      const isCurrentSlideMatch =
        annotation.mappedSlideId === currentPreviewSlideId;
      const isFocused =
        focusedPdfAnnotation?.annotationId === annotation.annotationId;
      const mainThreadEntry =
        annotation.threadEntries.find((entry) => entry.role === "comment") ||
        annotation.threadEntries[0] ||
        null;
      const replyEntries = annotation.threadEntries.filter(
        (entry) => entry !== mainThreadEntry,
      );
      const mappedLabel = resolveMappedLabelShort(annotation);
      const effectiveType =
        pdfAnnotationTypeOverrides[annotation.annotationId] ||
        (ANNOTATION_INTENT_OPTIONS.includes(annotation.annotationType)
          ? annotation.annotationType
          : "notFound");
      const typeOptions = ANNOTATION_INTENT_OPTIONS;
      const hasResolvableTarget = Boolean(
        annotation.foundSelector ||
        annotation.mappedFilePath ||
        annotation.status === "Mapped" ||
        annotation.popupInvocation?.triggerSelector ||
        annotation.popupInvocation?.containerSelector ||
        (annotation.subtype === "Popup" && annotation.mappedFilePath) ||
        (annotation.subtype === "Popup" &&
          annotation.pdfContextText &&
          annotation.pdfContextText.length > 5),
      );
      return (
        <div
          key={annotation.annotationId}
          className="rounded-[22px] border px-4 py-4"
          style={{
            borderColor: isFocused
              ? "rgba(34,211,238,0.55)"
              : theme === "dark"
                ? "rgba(148,163,184,0.18)"
                : "rgba(15,23,42,0.08)",
            background: isCurrentSlideMatch
              ? theme === "dark"
                ? "rgba(8,145,178,0.16)"
                : "rgba(14,165,233,0.1)"
              : theme === "dark"
                ? "rgba(15,23,42,0.54)"
                : "rgba(255,255,255,0.8)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                Page {annotation.annoPdfPage}
              </div>
              <div
                className="mt-1 text-[11px] uppercase tracking-[0.18em]"
                style={{ color: "var(--text-muted)" }}
              >
                {mappedLabel ? mappedLabel : "Unmapped"}
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              <select
                title={`Annotation intent for page ${annotation.annoPdfPage}`}
                aria-label={`Annotation intent for page ${annotation.annoPdfPage}`}
                className="rounded-full border bg-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(34,211,238,0.4)"
                      : "rgba(14,165,233,0.35)",
                  color: "var(--text-main)",
                }}
                value={effectiveType}
                onChange={(event) =>
                  dispatch(
                    setTypeOverrides({
                      ...pdfAnnotationTypeOverrides,
                      [annotation.annotationId]: event.target.value,
                    }),
                  )
                }
              >
                {typeOptions.map((option) => (
                  <option
                    key={`anno-type-${annotation.annotationId}-${option}`}
                    value={option}
                  >
                    {option}
                  </option>
                ))}
              </select>
              <div
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  background:
                    theme === "dark"
                      ? "rgba(148,163,184,0.18)"
                      : "rgba(15,23,42,0.1)",
                  color: "var(--text-main)",
                }}
              >
                {annotation.annotationLocationType}
              </div>
            </div>
          </div>
          <div className="mt-3 text-[13px] leading-6 break-words">
            {mainThreadEntry ? (
              <div className="space-y-3">
                <div>
                  <div className="font-medium leading-6">
                    {mainThreadEntry.text}
                  </div>
                  <div
                    className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {mainThreadEntry.author}
                  </div>
                </div>
                {replyEntries.length > 0 ? (
                  <div
                    className="rounded-2xl border px-3 py-3 space-y-3"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(148,163,184,0.14)"
                          : "rgba(15,23,42,0.08)",
                      background:
                        theme === "dark"
                          ? "rgba(2,6,23,0.24)"
                          : "rgba(248,250,252,0.9)",
                    }}
                  >
                    <div
                      className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Discussion
                    </div>
                    {replyEntries.map((entry, index) => (
                      <div
                        key={`${annotation.annotationId}-reply-${index}`}
                        className="pl-3 border-l space-y-1"
                        style={{
                          borderColor:
                            theme === "dark"
                              ? "rgba(34,211,238,0.24)"
                              : "rgba(14,165,233,0.18)",
                        }}
                      >
                        <div className="leading-6">{entry.text}</div>
                        <div
                          className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {entry.author}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              annotation.annotationText
            )}
          </div>
          <div
            className="mt-3 flex items-center gap-2 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: hasResolvableTarget
                  ? "rgba(34,197,94,0.9)"
                  : "rgba(248,113,113,0.9)",
              }}
            />
            {hasResolvableTarget
              ? "Target mapped in preview"
              : "Target not mapped to preview"}
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            {annotation.annotationText && hasResolvableTarget && (
              <button
                type="button"
                className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors flex items-center gap-1.5"
                style={{
                  borderColor: "rgba(16,185,129,0.34)",
                  background: "rgba(16,185,129,0.1)",
                  color: theme === "dark" ? "#6ee7b7" : "#065f46",
                }}
                onClick={async () => {
                  try {
                    const aiRoot =
                      interactionMode === "preview" ? previewLayersRoot : root;
                    if (!aiRoot) return;

                    const pipeline = new AIPipeline();
                    const response = await pipeline.process(
                      annotation.annotationText,
                      aiRoot,
                      files,
                      {
                        allowPopupActions: true,
                        annotationContext: annotation,
                      },
                    );

                    if (response.intent !== "UNKNOWN" && response.updatedRoot) {
                      if (interactionMode === "preview") {
                        const currentPath = selectedPreviewHtmlRef.current;
                        if (currentPath) {
                          const tempDoc =
                            document.implementation.createHTMLDocument();
                          const node = materializeVirtualElement(
                            tempDoc,
                            response.updatedRoot,
                          );
                          const serialized =
                            (node as HTMLElement).innerHTML || "";
                          // @ts-ignore
                          await persistPreviewHtmlContent(
                            currentPath,
                            serialized,
                            { refreshPreviewDoc: true, saveNow: true },
                          );
                        }
                      } else {
                        setRoot(response.updatedRoot);
                      }

                      console.log(
                        "AI Action Applied from Annotation:",
                        response.message,
                      );
                    }
                  } catch (err) {
                    console.error("AI Action failed:", err);
                  }
                }}
              >
                <Sparkles size={12} />
                Apply AI Action
              </button>
            )}
            {annotation.popupInvocation?.popupId && (
              <div
                className="px-2 py-1 rounded text-[10px] font-mono opacity-60 hover:opacity-100 transition-opacity cursor-help"
                title={`Resolved Popup ID: ${annotation.popupInvocation.popupId}`}
                style={{ background: "rgba(0,0,0,0.1)" }}
              >
                PID: {annotation.popupInvocation.popupId.slice(0, 8)}...
              </div>
            )}
            {annotation.mappedFilePath ? (
              <button
                type="button"
                className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(34,211,238,0.34)"
                      : "rgba(14,165,233,0.28)",
                  color: theme === "dark" ? "#67e8f9" : "#0f766e",
                }}
                onClick={() => handleJumpToPdfAnnotation(annotation)}
              >
                Open In Slide
              </button>
            ) : null}
          </div>
        </div>
      );
    },
    [
      currentPreviewSlideId,
      focusedPdfAnnotation?.annotationId,
      handleJumpToPdfAnnotation,
      pdfAnnotationTypeOverrides,
      resolveMappedLabelShort,
      theme,
    ],
  );

  return (
    <div
      ref={appRootRef}
      className={`h-screen w-screen flex flex-col font-sans relative overflow-hidden ${theme === "light" ? "light-mode" : ""}`}
      style={{
        backgroundColor: "var(--bg-app)",
        color: "var(--text-main)",
        ["--left-panel-width" as any]: `${leftPanelWidth}px`,
        ["--right-panel-width" as any]: `${rightPanelWidth}px`,
        ...(theme !== "light"
          ? {
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 0 rgba(255,255,255,0.12), inset 1px 0 0 0 rgba(255,255,255,0.06), inset -1px 0 0 0 rgba(255,255,255,0.06), inset 0 -1px 0 0 rgba(255,255,255,0.04)",
            }
          : {}),
      }}
    >
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onAction={handleCommandAction}
      />
      {isPageSwitchPromptOpen && pendingPageSwitch && (
        <div
          className="fixed inset-0 z-[1400] flex items-center justify-center px-4"
          style={{
            background:
              theme === "dark" ? "rgba(2,6,23,0.58)" : "rgba(15,23,42,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl p-5"
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
              borderColor:
                theme === "dark"
                  ? "rgba(148,163,184,0.32)"
                  : "rgba(15,23,42,0.12)",
              color: "var(--text-main)",
            }}
          >
            <div
              className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Unsaved Changes
            </div>
            <h3 className="text-base font-semibold leading-tight">
              {isPendingRefresh
                ? "Save changes before refresh?"
                : isPendingPreviewMode
                  ? "Save changes before switching mode?"
                  : "Save changes before switching page?"}
            </h3>
            <p
              className="text-xs mt-2 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              You have unsaved edits in{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--text-main)" }}
              >
                {pendingSwitchFromLabel}
              </span>
              .
              {isPendingRefresh ? (
                <> Refresh can overwrite your in-memory edits.</>
              ) : isPendingPreviewMode ? (
                <>
                  {" "}
                  Switching to Preview mode can overwrite your in-memory edits.
                </>
              ) : (
                <>
                  {" "}
                  Switching to{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-main)" }}
                  >
                    {pendingSwitchNextLabel}
                  </span>{" "}
                  can overwrite your in-memory edits.
                </>
              )}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-black/5"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={closePendingPageSwitchPrompt}
                disabled={isPageSwitchPromptBusy}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-rose-500/10"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(251,113,133,0.45)"
                      : "rgba(225,29,72,0.35)",
                  color: theme === "dark" ? "#fecdd3" : "#be123c",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={() => {
                  void resolvePendingPageSwitchWithDiscard();
                }}
                disabled={isPageSwitchPromptBusy}
              >
                {isPendingRefresh ? "Discard & Refresh" : "Discard & Switch"}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-cyan-500/15"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(34,211,238,0.45)"
                      : "rgba(8,145,178,0.35)",
                  color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={() => {
                  void resolvePendingPageSwitchWithSave();
                }}
                disabled={isPageSwitchPromptBusy}
              >
                {isPageSwitchPromptBusy
                  ? "Working..."
                  : isPendingRefresh
                    ? "Save & Refresh"
                    : "Save & Switch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Floating Toolbar --- */}
      {false && (
        <div
          className={`absolute top-3 z-[1000] transition-all animate-slideDown ${isZenMode ? "opacity-65" : ""}`}
          style={{ left: `${toolbarAnchorLeft}px` }}
        >
          <div
            className="px-3 py-1 flex items-center gap-2 min-w-0 rounded-[16px] border"
            style={{
              background:
                theme === "dark"
                  ? "rgba(12,18,30,0.96)"
                  : "rgba(248,250,252,0.96)",
              borderColor:
                theme === "dark"
                  ? "rgba(199,208,220,0.42)"
                  : "rgba(15,23,42,0.14)",
              boxShadow:
                theme === "dark"
                  ? "0 10px 24px rgba(2,6,23,0.34)"
                  : "0 10px 24px rgba(15,23,42,0.10)",
              backdropFilter: "blur(14px)",
            }}
          >
            {null}
            <button
              className={`glass-icon-btn navbar-icon-btn ${deviceMode === "tablet" ? "active" : ""}`}
              onClick={() => {
                setDeviceMode("tablet");
                setTabletOrientation((prev) =>
                  prev === "landscape" ? "portrait" : "landscape",
                );
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setDeviceMode("tablet");
                setDeviceCtxMenu({
                  type: "tablet",
                  x: e.clientX,
                  y: e.clientY,
                });
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
              className="glass-icon-btn navbar-icon-btn"
              onClick={handlePreviewRefresh}
              title="Refresh iPad content (Ctrl+T)"
            >
              <RotateCw size={16} />
            </button>
            <div className="h-4 w-px bg-gray-500/20"></div>
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
                        ? "text-slate-500"
                        : "text-gray-300"
                  }`}
                  title={`Set frame zoom to ${zoom}%`}
                >
                  {zoom}%
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-gray-500/20"></div>
            <button
              className="glass-icon-btn navbar-icon-btn"
              onClick={toggleThemeWithTransition}
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="h-4 w-px bg-gray-500/20"></div>
            <button
              className="glass-icon-btn navbar-icon-btn"
              onClick={runUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              className="glass-icon-btn navbar-icon-btn"
              onClick={runRedo}
              title="Redo (Ctrl+U)"
            >
              <Redo2 size={16} />
            </button>
            <div className="h-4 w-px bg-gray-500/20"></div>
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: dirtyFiles.length > 0 ? "#f59e0b" : "#22c55e",
              }}
              aria-hidden="true"
            />
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
                        ? "text-slate-500"
                        : "text-gray-300"
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
                        ? "text-slate-500"
                        : "text-gray-300"
                  }`}
                  title="LIVE Preview mode: navigate and interact"
                >
                  Preview
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
          tabletOrientation={tabletOrientation}
          setTabletModel={setTabletModel}
          onClose={() => setDeviceCtxMenu(null)}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <div
          className={`absolute z-40 no-scrollbar ${isResizingLeftPanel ? "" : "transition-all duration-700"} ${isFloatingPanels ? (isPanelsSwapped ? "right-0 top-20" : "left-0 top-20") : isPanelsSwapped ? "right-0 top-0 bottom-0" : "left-0 top-0 bottom-0"} ${isZenMode || isCodePanelOpen ? "opacity-0 pointer-events-none" : ""}`}
          style={{
            transform: isLeftPanelOpen
              ? "translateX(0) scale(1)"
              : isPanelsSwapped
                ? "translateX(8px) scale(0.985)"
                : "translateX(-8px) scale(0.985)",
            width: isLeftPanelOpen
              ? "var(--left-panel-width)"
              : `${LEFT_PANEL_COLLAPSED_WIDTH}px`,
            minHeight: isFloatingPanels ? "30vh" : undefined,
            maxHeight: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            height: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            borderRadius: isFloatingPanels
              ? isPanelsSwapped
                ? "1rem 0 0 1rem"
                : "0 1rem 1rem 0"
              : undefined,
            border: isFloatingPanels
              ? theme === "light"
                ? "1px solid rgba(15, 23, 42, 0.18)"
                : "1px solid rgba(255, 255, 255, 0.25)"
              : undefined,
            background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
            overflowY: "hidden",
            overflowX: "hidden",
            transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            transformOrigin: isPanelsSwapped ? "right center" : "left center",
          }}
        >
          <div
            className={`h-full min-h-full relative flex flex-col overflow-hidden ${
              isFloatingPanels
                ? isPanelsSwapped
                  ? "rounded-l-2xl overflow-hidden"
                  : "rounded-r-2xl overflow-hidden"
                : ""
            }`}
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,250,252,0.74) 100%)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div className="min-h-0 flex-1">
              <Sidebar
                files={files}
                projectPath={projectPath}
                activeFile={previewSyncedFile ?? activeFile}
                onSelectFile={handleSelectFile}
                onAddFontToPresentationCss={
                  handleSidebarAddFontToPresentationCss
                }
                onCreateFile={handleCreateFileAtPath}
                onCreateFolder={handleCreateFolderAtPath}
                onRenamePath={handleRenamePath}
                onDeletePath={handleDeletePath}
                onDuplicateFile={handleDuplicateFile}
                onRefreshFiles={refreshProjectFiles}
                onOpenProjectFolder={handleOpenFolder}
                onOpenCodePanel={openCodePanel}
                selectedFolderCloneSource={selectedFolderCloneSource}
                onChooseFolderCloneSource={handleChooseFolderCloneSource}
                onAddElement={handleSidebarAddElement}
                root={interactionMode === "preview" ? previewLayersRoot : root}
                selectedId={
                  interactionMode === "preview"
                    ? previewLayerSelectedId
                    : selectedId
                }
                onSelectElement={handleSidebarSelectElement}
                interactionMode={sidebarInteractionMode}
                setInteractionMode={handleSidebarInteractionModeChange}
                drawElementTag={drawElementTag}
                setDrawElementTag={setDrawElementTag}
                theme={theme}
                showConfigButton={isEdaProject(files)}
                onOpenConfig={handleOpenConfigModal}
                onLoadImage={handleSidebarLoadImage}
                isPanelOpen={isLeftPanelOpen}
                onTogglePanelOpen={setIsLeftPanelOpen}
                showMasterTools={SHOW_MASTER_TOOLS}
                showCollapseControl
              />
            </div>
            <div
              className={`pointer-events-none absolute inset-0 ${isFloatingPanels ? "rounded-r-2xl" : ""}`}
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
              onClick={handleLeftPanelStretchToggle}
              className={`absolute top-0 ${isPanelsSwapped ? "left-0" : "right-0"} h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors`}
              title="Resize panel. Click to stretch or shrink"
            />
          )}
        </div>

        {/* --- Main Canvas Area ("The Stage") --- */}
        {/* Non-mobile: 1 panel = push, both panels = overlay with scrollable content. Mobile: always overlay. */}
        <div
          className={`flex-1 flex flex-col relative ${isResizingLeftPanel || isResizingRightPanel ? "" : "transition-all duration-500"}`}
          style={{
            marginLeft:
              !isFloatingPanels &&
              deviceMode !== "mobile" &&
              ((isPanelsSwapped && !isLeftPanelOpen && isRightPanelOpen) ||
                (!isPanelsSwapped && isLeftPanelOpen && !isRightPanelOpen))
                ? isPanelsSwapped
                  ? "var(--right-panel-width)"
                  : "var(--left-panel-width)"
                : 0,
            marginRight: codePanelStageOffset
              ? `${codePanelStageOffset}px`
              : consolePanelStageOffset
                ? `${consolePanelStageOffset}px`
                : !isFloatingPanels &&
                    deviceMode !== "mobile" &&
                    isRightInspectorAttached
                  ? "var(--right-panel-width)"
                  : !isFloatingPanels &&
                      deviceMode !== "mobile" &&
                      ((isPanelsSwapped &&
                        isLeftPanelOpen &&
                        !isRightPanelOpen) ||
                        (!isPanelsSwapped &&
                          !isLeftPanelOpen &&
                          isRightPanelOpen))
                    ? isPanelsSwapped
                      ? "var(--left-panel-width)"
                      : "var(--right-panel-width)"
                    : 0,
            // When both panels open, no margins - content will scroll
          }}
        >
          {/* Background & Scroller */}
          <div
            ref={scrollerRef}
            className="flex-1 relative no-scrollbar transition-all duration-300 pb-10"
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
                paddingBottom: `${BASE_STAGE_PADDING}px`,
                minWidth: bothPanelsOpen
                  ? `calc(100% + var(--left-panel-width) + ${rightOverlayInset}px)`
                  : floatingHorizontalInset > 0
                    ? `calc(100% + ${floatingHorizontalInset}px)`
                    : "100%",
              }}
            >
              {/* Safe Spacing for Toolbar */}
              <div className="w-full shrink-0 h-4 pointer-events-none"></div>
              {/* --- Device Frame Container --- */}
              {/* --- Device Frame Wrapper (Layout Isolation) --- */}
              <div
                className="relative shrink-0 flex items-center justify-center transition-all duration-700 mx-auto mt-0"
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
                      ? `translateX(${clampedTabletShiftX}px) scale(${frameScale})`
                      : `translateX(${clampedCodeShiftX}px) scale(${frameScale})`,
                  transformOrigin: "top center",
                }}
              >
                {showDeviceFrameToolbar && (
                  <>
                    <div
                      className={`absolute left-5 bottom-full z-0 transition-all animate-slideDown ${isZenMode ? "opacity-65" : ""}`}
                      style={{ marginBottom: "-10px" }}
                    >
                      <div
                        className="px-3 pt-1 pb-3 flex items-center gap-2 min-w-0 rounded-t-[16px] rounded-b-none border"
                        style={{
                          background:
                            theme === "dark"
                              ? "rgba(12,18,30,0.96)"
                              : "rgba(248,250,252,0.96)",
                          borderColor:
                            theme === "dark"
                              ? "rgba(199,208,220,0.42)"
                              : "rgba(15,23,42,0.14)",
                          boxShadow:
                            theme === "dark"
                              ? "0 10px 24px rgba(2,6,23,0.34)"
                              : "0 10px 24px rgba(15,23,42,0.10)",
                          backdropFilter: "blur(14px)",
                          borderBottomWidth: 0,
                        }}
                      >
                        {null}
                        <button
                          className={`glass-icon-btn navbar-icon-btn ${deviceMode === "tablet" ? "active" : ""}`}
                          onClick={() => {
                            setDeviceMode("tablet");
                            setTabletOrientation((prev) =>
                              prev === "landscape" ? "portrait" : "landscape",
                            );
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setDeviceMode("tablet");
                            setDeviceCtxMenu({
                              type: "tablet",
                              x: e.clientX,
                              y: e.clientY,
                            });
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
                          className="glass-icon-btn navbar-icon-btn"
                          onClick={handlePreviewRefresh}
                          title="Refresh iPad content (Ctrl+T)"
                        >
                          <RotateCw size={16} />
                        </button>
                        {currentDevicePixelRatio >= 1.5 && (
                          <>
                            <div className="h-4 w-px bg-gray-500/20"></div>
                            <div className="flex items-center gap-0.5 rounded-full px-0.5 py-0.5 border border-gray-500/20">
                              {[50, 75, 100].map((zoom) => (
                                <button
                                  key={zoom}
                                  onClick={() =>
                                    setFrameZoom(zoom as 50 | 75 | 100)
                                  }
                                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all ${
                                    frameZoom === zoom
                                      ? theme === "light"
                                        ? "bg-cyan-500/20 text-cyan-700 border border-cyan-500/35"
                                        : "bg-indigo-500/25 text-indigo-300"
                                      : theme === "light"
                                        ? "text-slate-500"
                                        : "text-gray-300"
                                  }`}
                                  title={`Set frame zoom to ${zoom}%`}
                                >
                                  {zoom}%
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        <div className="h-4 w-px bg-gray-500/20"></div>
                        <button
                          className="glass-icon-btn navbar-icon-btn"
                          onClick={toggleThemeWithTransition}
                          title="Toggle Theme"
                        >
                          {theme === "dark" ? (
                            <Sun size={16} />
                          ) : (
                            <Moon size={16} />
                          )}
                        </button>
                        <div className="h-4 w-px bg-gray-500/20"></div>
                        <button
                          className="glass-icon-btn navbar-icon-btn"
                          onClick={runUndo}
                          title="Undo (Ctrl+Z)"
                        >
                          <Undo2 size={16} />
                        </button>
                        <button
                          className="glass-icon-btn navbar-icon-btn"
                          onClick={runRedo}
                          title="Redo (Ctrl+U)"
                        >
                          <Redo2 size={16} />
                        </button>
                        <div className="h-4 w-px bg-gray-500/20"></div>
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              dirtyFiles.length > 0 ? "#f59e0b" : "#22c55e",
                          }}
                          aria-hidden="true"
                        />
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
                                    ? "text-slate-500"
                                    : "text-gray-300"
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
                                    ? "text-slate-500"
                                    : "text-gray-300"
                              }`}
                              title="LIVE Preview mode: navigate and interact"
                            >
                              Preview
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {deviceMode === "tablet" && (
                      <div
                        className={`absolute right-5 bottom-full z-0 transition-all animate-slideDown ${isZenMode ? "opacity-65" : ""}`}
                        style={{
                          marginBottom: "-20px",
                          transform: "translateY(3px)",
                        }}
                      >
                        <div
                          className="px-0.5 pt-1 pb-3 flex items-end gap-3"
                          style={{
                            background: "transparent",
                            border: "none",
                            boxShadow: "none",
                            backdropFilter: "none",
                          }}
                        >
                          <div
                            className="shrink-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                            style={{
                              maxWidth:
                                sidebarInteractionMode === "inspect"
                                  ? "18rem"
                                  : "0rem",
                              opacity:
                                sidebarInteractionMode === "inspect" ? 1 : 0,
                              transform:
                                sidebarInteractionMode === "inspect"
                                  ? "translateY(0) scale(1)"
                                  : "translateY(16px) scale(0.96)",
                              transformOrigin: "bottom right",
                            }}
                          >
                            <div
                              className="rounded-t-[10px] rounded-b-none border px-2 pt-1 pb-3"
                              style={{
                                borderColor:
                                  theme === "dark"
                                    ? "rgba(199,208,220,0.42)"
                                    : "rgba(15,23,42,0.14)",
                                background:
                                  theme === "dark"
                                    ? "rgba(12,18,30,0.96)"
                                    : "rgba(248,250,252,0.96)",
                                boxShadow:
                                  theme === "dark"
                                    ? "0 10px 24px rgba(2,6,23,0.34)"
                                    : "0 10px 24px rgba(15,23,42,0.10)",
                                backdropFilter: "blur(14px)",
                                borderBottomWidth: 0,
                              }}
                            >
                              <div
                                className="flex items-center gap-1 rounded-full border px-1.5 py-[2px]"
                                style={{
                                  borderColor:
                                    theme === "dark"
                                      ? "rgba(148,163,184,0.28)"
                                      : "rgba(15,23,42,0.12)",
                                  background:
                                    theme === "dark"
                                      ? "rgba(15,23,42,0.55)"
                                      : "rgba(255,255,255,0.82)",
                                }}
                              >
                                {[
                                  { value: "default", label: "Default" },
                                  { value: "text", label: "Text" },
                                  { value: "image", label: "Assets" },
                                ].map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className="rounded-full px-2 py-[3px] text-[8px] font-semibold uppercase tracking-[0.12em] transition-all"
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
                                          : "transparent",
                                      border:
                                        previewSelectionMode === option.value
                                          ? "1px solid rgba(34,211,238,0.42)"
                                          : "1px solid transparent",
                                    }}
                                    onClick={() =>
                                      setPreviewSelectionMode(
                                        option.value as PreviewSelectionMode,
                                      )
                                    }
                                    title={option.label}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div
                            className="rounded-t-[10px] rounded-b-none border px-2 pt-1 pb-3"
                            style={{
                              borderColor:
                                theme === "dark"
                                  ? "rgba(199,208,220,0.42)"
                                  : "rgba(15,23,42,0.14)",
                              background:
                                theme === "dark"
                                  ? "rgba(12,18,30,0.96)"
                                  : "rgba(248,250,252,0.96)",
                              boxShadow:
                                theme === "dark"
                                  ? "0 10px 24px rgba(2,6,23,0.34)"
                                  : "0 10px 24px rgba(15,23,42,0.10)",
                              backdropFilter: "blur(14px)",
                              borderBottomWidth: 0,
                            }}
                          >
                            <div
                              className="flex items-center gap-1 rounded-[10px] px-1 py-1 border"
                              style={{
                                borderColor:
                                  theme === "dark"
                                    ? "rgba(148,163,184,0.28)"
                                    : "rgba(15,23,42,0.12)",
                                background:
                                  theme === "dark"
                                    ? "rgba(15,23,42,0.55)"
                                    : "rgba(255,255,255,0.82)",
                              }}
                            >
                              <button
                                type="button"
                                className="glass-icon-btn navbar-icon-btn rounded-md"
                                onClick={() =>
                                  handleSidebarInteractionModeChange("inspect")
                                }
                                title="Select Element"
                                style={{
                                  borderRadius: "8px",
                                  color:
                                    sidebarInteractionMode === "inspect"
                                      ? theme === "dark"
                                        ? "#67e8f9"
                                        : "#0891b2"
                                      : undefined,
                                  background:
                                    sidebarInteractionMode === "inspect"
                                      ? theme === "dark"
                                        ? "rgba(34,211,238,0.18)"
                                        : "rgba(6,182,212,0.14)"
                                      : undefined,
                                }}
                              >
                                <MousePointer2 size={16} />
                              </button>
                              <button
                                type="button"
                                className="glass-icon-btn navbar-icon-btn rounded-md"
                                onClick={() =>
                                  handleSidebarInteractionModeChange("move")
                                }
                                title="Move Element"
                                style={{
                                  borderRadius: "8px",
                                  color:
                                    sidebarInteractionMode === "move"
                                      ? theme === "dark"
                                        ? "#fbbf24"
                                        : "#b45309"
                                      : undefined,
                                  background:
                                    sidebarInteractionMode === "move"
                                      ? theme === "dark"
                                        ? "rgba(245,158,11,0.2)"
                                        : "rgba(245,158,11,0.14)"
                                      : undefined,
                                }}
                              >
                                <Move size={16} />
                              </button>
                            </div>
                          </div>
                          {SHOW_SCREENSHOT_FEATURES && (
                            <button
                              className={`glass-icon-btn navbar-icon-btn rounded-md ${
                                screenshotCaptureBusy ? "opacity-60" : ""
                              }`}
                              onClick={() => openScreenshotGallery(true)}
                              disabled={screenshotCaptureBusy || !projectPath}
                              title={
                                projectPath
                                  ? "Capture iPad screenshot"
                                  : "Open a presentation first"
                              }
                              style={{ borderRadius: "8px" }}
                            >
                              <Camera size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
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
                      <div
                        ref={previewStageRef}
                        className="w-full h-full relative"
                        onDragOver={handlePreviewStageDragOver}
                        onDrop={handlePreviewStageDrop}
                      >
                        {shouldShowFrameWelcome && (
                          <div className="absolute inset-0 flex items-center justify-center p-12">
                            <div
                              className="w-full max-w-6xl rounded-[42px] border px-24 py-24 text-center shadow-[0_42px_140px_rgba(15,23,42,0.16)]"
                              style={{
                                background:
                                  "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.92) 100%)",
                                borderColor: "rgba(15,23,42,0.12)",
                                color: "#0f172a",
                                backdropFilter: "blur(16px)",
                              }}
                            >
                              <div
                                className="text-[44px] font-semibold uppercase tracking-[0.34em]"
                                style={{ color: "#64748b" }}
                              >
                                Welcome To NoCode X
                              </div>
                              <p
                                className="mt-8 text-[30px] leading-[1.45] max-w-4xl mx-auto"
                                style={{ color: "#64748b" }}
                              >
                                Open a previous presentation or choose a new
                                project folder directly from the frame.
                              </p>
                              <div className="mt-12 flex items-center justify-center gap-4">
                                <button
                                  type="button"
                                  className="rounded-[22px] px-10 py-5 text-[22px] font-semibold transition-colors"
                                  style={{
                                    background: "rgba(14,165,233,0.14)",
                                    border: "1px solid rgba(14,165,233,0.25)",
                                    color: "#0f172a",
                                  }}
                                  onClick={() => {
                                    void handleOpenFolder();
                                  }}
                                >
                                  Select Presentation
                                </button>
                              </div>
                              {recentProjects.length > 0 && (
                                <div className="mt-12 text-left">
                                  <div
                                    className="text-[18px] font-semibold uppercase tracking-[0.24em] text-center"
                                    style={{ color: "#64748b" }}
                                  >
                                    Recent Presentations
                                  </div>
                                  <div className="mt-6 grid grid-cols-1 gap-4">
                                    {recentProjects.map((recentPath) => {
                                      const recentName = recentPath
                                        .replace(/\\/g, "/")
                                        .split("/")
                                        .filter(Boolean)
                                        .slice(-1)[0];
                                      return (
                                        <button
                                          key={recentPath}
                                          type="button"
                                          className="w-full rounded-[22px] border px-6 py-5 text-left transition-colors"
                                          style={{
                                            borderColor: "rgba(15,23,42,0.12)",
                                            background: "rgba(255,255,255,0.68)",
                                            color: "#0f172a",
                                          }}
                                          onClick={() => {
                                            void handleOpenFolder(recentPath);
                                          }}
                                          title={recentPath}
                                        >
                                          <div className="text-[24px] font-semibold">
                                            {recentName}
                                          </div>
                                          <div
                                            className="mt-2 truncate text-[15px]"
                                            style={{
                                              color: "#64748b",
                                            }}
                                          >
                                            {recentPath}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {projectPath ? (
                                <div
                                  className="mt-8 text-[18px]"
                                  style={{ color: "#64748b" }}
                                >
                                  Current project:{" "}
                                  {
                                    projectPath
                                      .replace(/\\/g, "/")
                                      .split("/")
                                      .filter(Boolean)
                                      .slice(-1)[0]
                                  }
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                        {hasPreviewContent && (
                          <iframe
                            key={
                              selectedPreviewSrc
                                ? `preview-src:${selectedPreviewSrc}:${previewRefreshNonce}`
                                : `preview-doc:${selectedPreviewHtml || "none"}:${previewRefreshNonce}`
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
                            onDragOver={handlePreviewStageDragOver}
                            onDrop={handlePreviewStageDrop}
                            className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-150 ${
                              interactionMode === "preview"
                                ? isToolboxDragging
                                  ? "opacity-100 pointer-events-none"
                                  : "opacity-100 pointer-events-auto"
                                : "opacity-0 pointer-events-none"
                            }`}
                          />
                        )}
                        {interactionMode === "preview" &&
                          isPdfAnnotationPanelOpen &&
                          filteredAnnotationsForCurrentSlide.map(
                            (annotation) => {
                              const isFocused =
                                focusedAnnotationForCurrentSlide?.annotationId ===
                                annotation.annotationId;
                              const isPopup = isPopupAnnotation(annotation);
                              return (
                                <div
                                  key={annotation.annotationId}
                                  className={`absolute pointer-events-none rounded-[18px] border-2 ${
                                    isFocused ? "z-30" : "z-20"
                                  }`}
                                  style={{
                                    left: `${annotation.positionPct.left}%`,
                                    top: `${annotation.positionPct.top}%`,
                                    width: `${Math.max(2, annotation.positionPct.width)}%`,
                                    height: `${Math.max(2, annotation.positionPct.height)}%`,
                                    borderColor: isFocused
                                      ? "rgba(239,68,68,0.98)"
                                      : isPopup
                                        ? "rgba(34,211,238,0.85)"
                                        : "rgba(34,197,94,0.9)",
                                    boxShadow: isFocused
                                      ? "0 0 0 5px rgba(239,68,68,0.35), 0 0 28px rgba(239,68,68,0.45), inset 0 0 0 1px rgba(255,255,255,0.82)"
                                      : isPopup
                                        ? "0 0 0 3px rgba(34,211,238,0.18), 0 0 22px rgba(34,211,238,0.32), inset 0 0 0 1px rgba(255,255,255,0.65)"
                                        : "0 0 0 3px rgba(34,197,94,0.2), 0 0 22px rgba(34,197,94,0.34), inset 0 0 0 1px rgba(255,255,255,0.65)",
                                    background: isFocused
                                      ? "rgba(239,68,68,0.08)"
                                      : isPopup
                                        ? "rgba(34,211,238,0.06)"
                                        : "rgba(34,197,94,0.06)",
                                    animation: isFocused
                                      ? "pulse 1.1s ease-in-out 2"
                                      : "none",
                                  }}
                                />
                              );
                            },
                          )}
                        {!shouldShowFrameWelcome && (
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
                              vibeUpdateKey={lastVibeUpdateRef.current}
                              onVibeError={(msg) => setVibeErrorContext(msg)}
                            />
                          </div>
                        )}
                        {false}
                        {interactionMode === "preview" &&
                          previewMode === "edit" &&
                          Array.isArray(previewSelectedPath) &&
                          previewSelectedPath.length > 0 &&
                          previewSelectionBox && (
                            <div
                              className="absolute z-30 pointer-events-none"
                              style={{
                                left: `${previewSelectionBox.left}px`,
                                top: `${previewSelectionBox.top}px`,
                                width: `${previewSelectionBox.width}px`,
                                height: `${previewSelectionBox.height}px`,
                                border: "2px solid rgba(34,211,238,0.95)",
                                boxShadow:
                                  "0 0 0 1px rgba(6,182,212,0.85), 0 0 0 6px rgba(34,211,238,0.12)",
                                borderRadius: "4px",
                              }}
                            >
                              {[
                                [
                                  "n",
                                  "Resize from top",
                                  "ns-resize",
                                  "absolute left-3 right-3 top-[-6px] h-4",
                                  "999px",
                                ],
                                [
                                  "s",
                                  "Resize from bottom",
                                  "ns-resize",
                                  "absolute left-3 right-3 bottom-[-6px] h-4",
                                  "999px",
                                ],
                                [
                                  "e",
                                  "Resize from right",
                                  "ew-resize",
                                  "absolute top-3 bottom-3 right-[-6px] w-4",
                                  "999px",
                                ],
                                [
                                  "w",
                                  "Resize from left",
                                  "ew-resize",
                                  "absolute top-3 bottom-3 left-[-6px] w-4",
                                  "999px",
                                ],
                                [
                                  "nw",
                                  "Resize from top left",
                                  "nwse-resize",
                                  "absolute left-[-7px] top-[-7px] w-5 h-5",
                                  "6px",
                                ],
                                [
                                  "ne",
                                  "Resize from top right",
                                  "nesw-resize",
                                  "absolute right-[-7px] top-[-7px] w-5 h-5",
                                  "6px",
                                ],
                                [
                                  "sw",
                                  "Resize from bottom left",
                                  "nesw-resize",
                                  "absolute left-[-7px] bottom-[-7px] w-5 h-5",
                                  "6px",
                                ],
                                [
                                  "se",
                                  "Resize from bottom right",
                                  "nwse-resize",
                                  "absolute right-[-7px] bottom-[-7px] w-5 h-5",
                                  "6px",
                                ],
                              ].map(
                                ([key, title, cursor, className, radius]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    className={`pointer-events-auto absolute ${className}`}
                                    style={{ cursor }}
                                    title={title}
                                    onMouseDown={(event) =>
                                      handlePreviewResizeHandleMouseDown(
                                        key as
                                          | "n"
                                          | "s"
                                          | "e"
                                          | "w"
                                          | "ne"
                                          | "nw"
                                          | "se"
                                          | "sw",
                                        event,
                                      )
                                    }
                                  >
                                    <span
                                      className="absolute inset-0"
                                      style={{
                                        borderRadius: radius,
                                        background: "rgba(34, 211, 238, 0.82)",
                                        border:
                                          "1px solid rgba(255,255,255,0.95)",
                                        boxShadow:
                                          "0 0 0 1px rgba(8,145,178,0.42), 0 4px 12px rgba(34,211,238,0.35)",
                                      }}
                                    />
                                  </button>
                                ),
                              )}
                              {false && (
                                <button
                                  type="button"
                                  className="pointer-events-auto absolute right-1 bottom-1 w-7 h-7 rounded-md border-2 border-white/90 bg-amber-500 shadow-[0_0_0_2px_rgba(2,6,23,0.7),0_8px_20px_rgba(245,158,11,0.45)] text-slate-950 font-black text-xs leading-none flex items-center justify-center"
                                  style={{
                                    cursor: isPreviewResizing
                                      ? "nwse-resize"
                                      : "nwse-resize",
                                  }}
                                  title="Resize from bottom right"
                                  onMouseDown={(event) =>
                                    handlePreviewResizeHandleMouseDown(
                                      "se",
                                      event,
                                    )
                                  }
                                >
                                  <>{"↘"}</>
                                </button>
                              )}
                            </div>
                          )}
                        {false &&
                          interactionMode === "preview" &&
                          previewMode === "edit" &&
                          Array.isArray(previewSelectedPath) &&
                          (previewSelectedPath?.length ?? 0) > 0 &&
                          previewSelectedElement && (
                            <div
                              className="absolute right-4 top-4 z-40 rounded-2xl border shadow-2xl backdrop-blur-md p-3 flex flex-col gap-2 min-w-[230px]"
                              style={{
                                borderColor:
                                  theme === "dark"
                                    ? "rgba(148,163,184,0.35)"
                                    : "rgba(15,23,42,0.18)",
                                background:
                                  theme === "dark"
                                    ? "rgba(2,6,23,0.86)"
                                    : "rgba(255,255,255,0.96)",
                                color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <div className="text-xs font-bold tracking-wide opacity-90">
                                Quick Controls
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-cyan-500/35 hover:bg-cyan-500/20 flex items-center gap-1"
                                  title="Duplicate"
                                  onClick={() => {
                                    void handlePreviewDuplicateSelected();
                                  }}
                                >
                                  <Copy size={12} />
                                  Dup
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-slate-500/35 hover:bg-slate-500/20"
                                  title="Send backward"
                                  onClick={() => handlePreviewNudgeZIndex(-1)}
                                >
                                  <MoveDown size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-slate-500/35 hover:bg-slate-500/20"
                                  title="Bring forward"
                                  onClick={() => handlePreviewNudgeZIndex(1)}
                                >
                                  <MoveUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-red-500/40 hover:bg-red-500/20 flex items-center gap-1"
                                  title="Delete"
                                  onClick={handlePreviewDeleteStable}
                                >
                                  <Trash2 size={12} />
                                  Del
                                </button>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-emerald-500/35 hover:bg-emerald-500/20 flex items-center gap-1"
                                  title="Narrower"
                                  onClick={() =>
                                    handlePreviewResizeNudge("width", -12)
                                  }
                                >
                                  <Shrink size={12} />
                                  W-
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-emerald-500/35 hover:bg-emerald-500/20 flex items-center gap-1"
                                  title="Wider"
                                  onClick={() =>
                                    handlePreviewResizeNudge("width", 12)
                                  }
                                >
                                  <Expand size={12} />
                                  W+
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-violet-500/35 hover:bg-violet-500/20"
                                  title="Shorter"
                                  onClick={() =>
                                    handlePreviewResizeNudge("height", -12)
                                  }
                                >
                                  H-
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-violet-500/35 hover:bg-violet-500/20"
                                  title="Taller"
                                  onClick={() =>
                                    handlePreviewResizeNudge("height", 12)
                                  }
                                >
                                  H+
                                </button>
                              </div>
                              <div className="text-[11px] opacity-80">
                                {`${Math.round(
                                  parseNumericCssValue(
                                    previewSelectedElement?.styles?.width ??
                                      previewSelectedComputedStyles?.width ??
                                      0,
                                  ) || 0,
                                )} x ${Math.round(
                                  parseNumericCssValue(
                                    previewSelectedElement?.styles?.height ??
                                      previewSelectedComputedStyles?.height ??
                                      0,
                                  ) || 0,
                                )} px`}
                              </div>
                            </div>
                          )}
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

        {isRightInspectorMode && (
          <div
            className={`absolute z-40 no-scrollbar ${isResizingRightPanel ? "" : "transition-all duration-700"} right-0 top-0 bottom-0 ${isZenMode || isCodePanelOpen || !isRightPanelOpen ? "pointer-events-none" : ""}`}
            style={{
              width: "var(--right-panel-width)",
              overflow: "hidden",
              transform: isRightPanelOpen
                ? "translateX(0) scale(1)"
                : "translateX(calc(100% + 0.75rem)) scale(0.985)",
              opacity: isRightPanelOpen ? 1 : 0,
              transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
              transformOrigin: "right center",
            }}
          >
            <div
              className="h-full min-h-full relative flex flex-col overflow-hidden"
              style={{
                background:
                  theme === "dark"
                    ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                    : "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(248,250,252,0.76) 100%)",
                backdropFilter: "blur(14px)",
                borderTopLeftRadius: "28px",
                borderBottomLeftRadius: "28px",
              }}
            >
              <div
                className="shrink-0 border-b px-3 py-2"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(148,163,184,0.22)"
                      : "rgba(15,23,42,0.08)",
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.42)"
                      : "rgba(255,255,255,0.78)",
                }}
              >
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 min-w-[44px] rounded-xl border px-2 flex items-center justify-center transition-colors text-[11px] font-semibold tracking-[0.14em]"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(148,163,184,0.28)"
                          : "rgba(15,23,42,0.12)",
                      color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                      background: showStyleInspectorSection
                        ? theme === "dark"
                          ? "rgba(99,102,241,0.2)"
                          : "rgba(99,102,241,0.14)"
                        : "transparent",
                    }}
                    onClick={() =>
                      setIsStyleInspectorSectionOpen((current) => !current)
                    }
                    title={
                      showStyleInspectorSection
                        ? "Hide styles section"
                        : "Show styles section"
                    }
                  >
                    CSS
                  </button>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-xl border flex items-center justify-center transition-colors"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(148,163,184,0.28)"
                          : "rgba(15,23,42,0.12)",
                      color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                      background: showEmbeddedPdfAnnotations
                        ? theme === "dark"
                          ? "rgba(34,211,238,0.18)"
                          : "rgba(14,165,233,0.14)"
                        : "transparent",
                    }}
                    onClick={() => {
                      if (hasPdfAnnotationsLoaded) {
                        dispatch(setIsOpen(!isPdfAnnotationPanelOpen));
                        return;
                      }
                      handleOpenPdfAnnotationsPicker();
                    }}
                    disabled={!projectPath || isPdfAnnotationLoading}
                    title={
                      projectPath
                        ? hasPdfAnnotationsLoaded
                          ? isPdfAnnotationPanelOpen
                            ? "Hide PDF annotations"
                            : "Show PDF annotations"
                          : "Load annotated PDF"
                        : "Open a presentation first"
                    }
                  >
                    {isPdfAnnotationLoading ? (
                      <RotateCw size={15} className="animate-spin" />
                    ) : (
                      <FileText size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-xl border flex items-center justify-center transition-colors"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(148,163,184,0.28)"
                          : "rgba(15,23,42,0.12)",
                      color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                    }}
                    onClick={handleRefreshPdfAnnotationMapping}
                    disabled={!projectPath || isPdfAnnotationLoading}
                    title="Upload annotated PDF"
                  >
                    <Upload size={15} />
                  </button>
                </div>
              </div>

              {showEmbeddedPdfAnnotations ? (
                <>
                  <div
                    className="min-h-0 overflow-hidden"
                    style={{
                      flex: showStyleInspectorSection ? "0 0 48%" : "1 1 auto",
                      background:
                        theme === "dark"
                          ? "rgba(2,6,23,0.18)"
                          : "rgba(248,250,252,0.62)",
                    }}
                  >
                    <PdfAnnotationsOverlay
                      currentPreviewSlideId={currentPreviewSlideId ?? null}
                      theme={theme as "light" | "dark"}
                      onJumpToAnnotation={handleJumpToPdfAnnotation}
                      embedded
                    />
                  </div>
                  {showStyleInspectorSection ? (
                    <div
                      className="shrink-0 h-[8px]"
                      style={{
                        background:
                          theme === "dark"
                            ? "linear-gradient(90deg, rgba(34,211,238,0.1) 0%, rgba(56,189,248,0.42) 22%, rgba(14,165,233,0.2) 50%, rgba(34,211,238,0.42) 78%, rgba(34,211,238,0.1) 100%)"
                            : "linear-gradient(90deg, rgba(125,211,252,0.18) 0%, rgba(14,165,233,0.55) 22%, rgba(6,182,212,0.22) 50%, rgba(14,165,233,0.55) 78%, rgba(125,211,252,0.18) 100%)",
                        boxShadow:
                          theme === "dark"
                            ? "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(255,255,255,0.03)"
                            : "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(14,165,233,0.08)",
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              {showStyleInspectorSection ? (
                <div
                  className="min-h-0 flex-1 overflow-hidden px-2 pt-2 pb-2"
                  style={{
                    borderTop: showEmbeddedPdfAnnotations
                      ? "none"
                      : theme === "dark"
                        ? "1px solid rgba(148,163,184,0.12)"
                        : "1px solid rgba(15,23,42,0.05)",
                    background:
                      theme === "dark"
                        ? "rgba(2,6,23,0.3)"
                        : "rgba(255,255,255,0.72)",
                  }}
                >
                  <div
                    className="h-full overflow-hidden rounded-[20px]"
                    style={{
                      background:
                        theme === "dark"
                          ? "rgba(15,23,42,0.3)"
                          : "rgba(255,255,255,0.8)",
                    }}
                  >
                    <StyleInspectorPanel
                      element={inspectorElement}
                      availableFonts={availableFonts}
                      onImmediateChange={handleImmediatePreviewStyle} // <--- ADD THIS
                      onUpdateContent={
                        previewSelectedElement
                          ? handlePreviewContentUpdateStable
                          : handleUpdateContent
                      }
                      onToggleTextTag={
                        previewSelectedElement
                          ? (tag) => {
                              void applyPreviewTagUpdate(
                                previewSelectedElement.type === tag
                                  ? "span"
                                  : tag,
                              );
                            }
                          : undefined
                      }
                      onWrapTextTag={
                        previewSelectedElement
                          ? (tag) => {
                              void applyQuickTextWrapTag(tag);
                            }
                          : undefined
                      }
                      selectionMode={
                        previewSelectedElement ? previewSelectionMode : "default"
                      }
                      resolveAssetPreviewUrl={resolveInspectorAssetPreviewUrl}
                      onUpdateStyle={
                        previewSelectedElement
                          ? handlePreviewStyleUpdateStable
                          : handleUpdateStyle
                      }
                      onUpdateIdentity={
                        previewSelectedElement
                          ? handlePreviewIdentityUpdateStable
                          : handleUpdateIdentity
                      }
                      onReplaceAsset={
                        previewSelectedElement
                          ? () => {
                              void handleReplacePreviewAsset();
                            }
                          : undefined
                      }
                      onAddMatchedRuleProperty={
                        previewSelectedElement
                          ? handlePreviewMatchedRulePropertyAdd
                          : undefined
                      }
                      matchedCssRules={
                        previewSelectedElement ? previewSelectedMatchedCssRules : []
                      }
                      computedStyles={
                        previewSelectedElement ? previewSelectedComputedStyles : null
                      }
                    />
                  </div>
                </div>
              ) : !showEmbeddedPdfAnnotations ? (
                <div
                  className="min-h-0 flex-1 flex items-center justify-center px-6 text-center"
                  style={{
                    color: theme === "dark" ? "#94a3b8" : "#64748b",
                  }}
                >
                  <div className="text-[12px] tracking-[0.16em] uppercase">
                    Enable CSS or PDF to inspect this slide
                  </div>
                </div>
              ) : null}

              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow:
                    theme === "dark"
                      ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                      : "inset 0 0 0 1px rgba(255,255,255,0.45)",
                }}
              />
              {isRightInspectorAttached ? (
                <button
                  type="button"
                  onClick={() => setIsRightPanelOpen(false)}
                  className="absolute top-3 left-3 z-20 h-8 px-2 rounded-full border flex items-center justify-center gap-1.5 transition-all duration-300 text-[10px] font-semibold uppercase tracking-[0.14em] hover:-translate-y-0.5"
                  style={{
                    borderColor:
                      theme === "dark"
                        ? "rgba(148,163,184,0.28)"
                        : "rgba(15,23,42,0.12)",
                    color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                    background:
                      theme === "dark"
                        ? "rgba(15,23,42,0.88)"
                        : "rgba(255,255,255,0.92)",
                    boxShadow:
                      theme === "dark"
                        ? "0 8px 18px rgba(2,6,23,0.24)"
                        : "0 8px 18px rgba(15,23,42,0.08)",
                  }}
                  title="Collapse right panel"
                >
                  <PanelRightClose size={14} />
                  <span>Hide</span>
                </button>
              ) : null}
            </div>
            <div
              onMouseDown={handleRightPanelResizeStart}
              className="absolute top-0 left-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors"
              title="Resize panel"
            />
          </div>
        )}

        {/* Right Sidebar */}
        {rightPanelMode === "gallery" && (
          <div
            className={`absolute z-40 no-scrollbar ${isResizingRightPanel || isDraggingRightPanel ? "" : "transition-all duration-500"} ${isFloatingPanels ? "" : isPanelsSwapped ? "left-0 top-0 bottom-0" : "right-0 top-0 bottom-0"} ${isZenMode || isCodePanelOpen ? "opacity-0 pointer-events-none" : ""} ${isRightPanelOpen ? (isPanelsSwapped ? "animate-panelInLeft" : "animate-panelInRight") : ""}`}
            style={{
              transform: isRightPanelOpen
                ? "translateX(0)"
                : isFloatingPanels
                  ? "translateX(calc(100% + 2.5rem))"
                  : isPanelsSwapped
                    ? "translateX(-100%)"
                    : "translateX(100%)",
              width: "var(--right-panel-width)",
              left: isFloatingPanels
                ? `${rightPanelFloatingPosition.left}px`
                : undefined,
              top: isFloatingPanels
                ? `${rightPanelFloatingPosition.top}px`
                : undefined,
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
              className={`h-full min-h-full relative flex flex-col overflow-hidden ${isFloatingPanels ? "rounded-2xl overflow-hidden" : ""}`}
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
                onMouseDown={handleRightPanelDragStart}
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
                    {rightPanelMode === "gallery" ? "Gallery" : "Inspector"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {rightPanelMode === "gallery" ? (
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors"
                      style={{
                        background:
                          theme === "dark"
                            ? "rgba(248,113,113,0.12)"
                            : "rgba(248,113,113,0.18)",
                        borderColor:
                          theme === "dark"
                            ? "rgba(248,113,113,0.4)"
                            : "rgba(248,113,113,0.35)",
                        color: theme === "dark" ? "#fecdd3" : "#be123c",
                      }}
                      onClick={closeScreenshotGallery}
                      title="Close gallery"
                    >
                      Close
                    </button>
                  ) : !isFloatingPanels ? (
                    <button
                      type="button"
                      className="h-6 w-6 flex items-center justify-center rounded-md border transition-colors"
                      style={{
                        background:
                          theme === "dark"
                            ? "rgba(15,23,42,0.7)"
                            : "rgba(255,255,255,0.7)",
                        borderColor:
                          theme === "dark"
                            ? "rgba(148,163,184,0.32)"
                            : "rgba(0,0,0,0.1)",
                        color: theme === "dark" ? "#94a3b8" : "#64748b",
                      }}
                      onClick={() => {
                        setIsRightPanelOpen(false);
                        setRightPanelMode("inspector");
                      }}
                      title="Collapse right panel"
                    >
                      <PanelRightClose size={12} />
                    </button>
                  ) : null}
                </div>
              </div>
              {rightPanelMode === "gallery" && SHOW_SCREENSHOT_FEATURES ? (
                <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
                  <div
                    className="shrink-0 px-3 py-2 border-b"
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
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                        style={{
                          color: theme === "dark" ? "#94a3b8" : "#64748b",
                        }}
                      >
                        Screenshots
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                          style={{
                            borderColor:
                              theme === "dark"
                                ? "rgba(148,163,184,0.38)"
                                : "rgba(15,23,42,0.18)",
                            color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                          }}
                          onClick={() => void loadGalleryItems()}
                          title="Refresh gallery"
                        >
                          Refresh
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                          style={{
                            borderColor:
                              theme === "dark"
                                ? "rgba(34,211,238,0.45)"
                                : "rgba(8,145,178,0.3)",
                            color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                            opacity: screenshotCaptureBusy ? 0.6 : 1,
                          }}
                          onClick={() => void handleScreenshotCapture()}
                          disabled={screenshotCaptureBusy}
                          title="Capture screenshot"
                        >
                          {screenshotCaptureBusy ? "Capturing..." : "Capture"}
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                          style={{
                            borderColor:
                              theme === "dark"
                                ? "rgba(148,163,184,0.38)"
                                : "rgba(15,23,42,0.18)",
                            color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                          }}
                          onClick={() => void handleRevealScreenshotsFolder()}
                          title="Reveal screenshots folder"
                        >
                          Reveal
                        </button>
                      </div>
                    </div>
                    <div
                      className="mt-2 text-[10px] uppercase tracking-[0.12em]"
                      style={{
                        color: theme === "dark" ? "#94a3b8" : "#64748b",
                      }}
                    >
                      {screenshotItems.length} items
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-3 space-y-3">
                    {screenshotItems.length === 0 ? (
                      <div
                        className="rounded-xl border px-4 py-6 text-center text-xs"
                        style={{
                          borderColor:
                            theme === "dark"
                              ? "rgba(148,163,184,0.3)"
                              : "rgba(15,23,42,0.12)",
                          color: theme === "dark" ? "#94a3b8" : "#64748b",
                        }}
                      >
                        No screenshots yet. Capture one from the iPad button.
                      </div>
                    ) : (
                      screenshotItems.map((item) => {
                        const imageUrl = screenshotPreviewUrls[item.id] || "";
                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border overflow-hidden"
                            style={{
                              borderColor:
                                theme === "dark"
                                  ? "rgba(148,163,184,0.3)"
                                  : "rgba(15,23,42,0.12)",
                              background:
                                theme === "dark"
                                  ? "rgba(15,23,42,0.65)"
                                  : "rgba(255,255,255,0.7)",
                            }}
                          >
                            {imageUrl && (
                              <img
                                src={imageUrl}
                                alt={item.imageFileName}
                                className="w-full h-40 object-cover"
                              />
                            )}
                            <div className="p-3 space-y-2">
                              <div className="text-xs font-semibold">
                                {item.slideId || "Unknown slide"}
                                {item.popupId ? ` • ${item.popupId}` : ""}
                              </div>
                              <div className="text-[10px] opacity-70">
                                {new Date(item.createdAt).toLocaleString()}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                                  style={{
                                    borderColor:
                                      theme === "dark"
                                        ? "rgba(34,211,238,0.45)"
                                        : "rgba(8,145,178,0.3)",
                                    color:
                                      theme === "dark" ? "#a5f3fc" : "#0e7490",
                                  }}
                                  onClick={() =>
                                    void handleOpenScreenshotItem(item)
                                  }
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                                  style={{
                                    borderColor:
                                      theme === "dark"
                                        ? "rgba(148,163,184,0.38)"
                                        : "rgba(15,23,42,0.18)",
                                    color:
                                      theme === "dark" ? "#e2e8f0" : "#0f172a",
                                  }}
                                  onClick={() =>
                                    void handleRevealScreenshotsFolder()
                                  }
                                >
                                  Reveal
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors"
                                  style={{
                                    borderColor:
                                      theme === "dark"
                                        ? "rgba(248,113,113,0.45)"
                                        : "rgba(248,113,113,0.35)",
                                    color:
                                      theme === "dark" ? "#fecdd3" : "#be123c",
                                  }}
                                  onClick={() =>
                                    void handleDeleteScreenshotItem(item)
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div
                    className="shrink-0 px-3 py-3 border-t"
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
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold border transition-colors"
                      style={{
                        borderColor:
                          theme === "dark"
                            ? "rgba(14,165,233,0.45)"
                            : "rgba(8,145,178,0.3)",
                        color: theme === "dark" ? "#bae6fd" : "#0e7490",
                        opacity: isPdfExporting ? 0.6 : 1,
                      }}
                      onClick={() => void handleExportEditablePdf()}
                      disabled={isPdfExporting || !projectPath}
                    >
                      <FileDown size={14} />
                      {isPdfExporting
                        ? "Exporting Editable PDF..."
                        : "Export Editable PDF"}
                    </button>
                    {pdfExportLogs.length > 0 && (
                      <div className="mt-3 max-h-32 overflow-auto text-[10px] space-y-1">
                        {pdfExportLogs.map((log, index) => (
                          <div key={`${index}-${log}`} className="opacity-80">
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {interactionMode === "inspect" && selectedId ? (
                      <StyleInspectorPanel
                        element={inspectorElement}
                        availableFonts={availableFonts}
                        onImmediateChange={handleImmediatePreviewStyle}
                        onUpdateContent={
                          previewSelectedElement
                            ? handlePreviewContentUpdateStable
                            : handleUpdateContent
                        }
                        onToggleTextTag={
                          previewSelectedElement
                            ? (tag) => {
                                void applyPreviewTagUpdate(
                                  previewSelectedElement.type === tag
                                    ? "span"
                                    : tag,
                                );
                              }
                            : undefined
                        }
                        onWrapTextTag={
                          previewSelectedElement
                            ? (tag) => {
                                void applyQuickTextWrapTag(tag);
                              }
                            : undefined
                        }
                        selectionMode={
                          previewSelectedElement
                            ? previewSelectionMode
                            : "default"
                        }
                        resolveAssetPreviewUrl={resolveInspectorAssetPreviewUrl}
                        onUpdateStyle={
                          previewSelectedElement
                            ? handlePreviewStyleUpdateStable
                            : handleUpdateStyle
                        }
                        onUpdateIdentity={
                          previewSelectedElement
                            ? handlePreviewIdentityUpdateStable
                            : handleUpdateIdentity
                        }
                        onReplaceAsset={undefined}
                        onAddMatchedRuleProperty={
                          previewSelectedElement
                            ? handlePreviewMatchedRulePropertyAdd
                            : undefined
                        }
                        matchedCssRules={
                          previewSelectedElement
                            ? previewSelectedMatchedCssRules
                            : []
                        }
                        computedStyles={
                          previewSelectedElement
                            ? previewSelectedComputedStyles
                            : null
                        }
                      />
                    ) : (
                      <PropertiesPanel
                        element={
                          interactionMode === "preview" &&
                          previewSelectedElement
                            ? previewSelectedElement
                            : selectedElement
                        }
                        requestedTab={propertiesPanelRequestedTab}
                        requestedTabNonce={propertiesPanelRequestedTabNonce}
                        onUpdateStyle={
                          interactionMode === "preview" &&
                          previewSelectedElement
                            ? handlePreviewStyleUpdateStable
                            : handleUpdateStyle
                        }
                        onUpdateContent={
                          interactionMode === "preview" &&
                          previewSelectedElement
                            ? handlePreviewContentUpdateStable
                            : handleUpdateContent
                        }
                        onUpdateAttributes={
                          interactionMode === "preview" &&
                          previewSelectedElement
                            ? handlePreviewAttributesUpdateStable
                            : handleUpdateAttributes
                        }
                        onUpdateAnimation={
                          interactionMode === "preview" &&
                          previewSelectedElement
                            ? handlePreviewAnimationUpdateStable
                            : handleUpdateAnimation
                        }
                        onDelete={
                          interactionMode === "preview" &&
                          previewSelectedElement
                            ? handlePreviewDeleteStable
                            : handleDeleteElement
                        }
                        onAddElement={
                          interactionMode === "preview" &&
                          previewSelectedElement
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
              )}
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
            {isRightPanelOpen && (
              <div
                onMouseDown={handleRightPanelResizeStart}
                className={`absolute top-0 ${isPanelsSwapped ? "right-0" : "left-0"} h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors`}
                title="Resize panel"
              />
            )}
          </div>
        )}
      </div>

      {/* Code Panel */}
      <div
        className={`absolute z-50 no-scrollbar transition-all duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) ${isFloatingPanels ? "right-10 top-24 bottom-3" : "right-0 top-0 bottom-0"} ${isZenMode ? "opacity-0 pointer-events-none" : ""} ${isCodePanelOpen ? "animate-panelInRight" : ""}`}
        style={{
          transform: isCodePanelOpen
            ? "translateX(0)"
            : isFloatingPanels
              ? "translateX(calc(100% + 2.5rem))"
              : "translateX(100%)",
          width: isFloatingPanels
            ? "min(42rem, calc(100vw - 6rem))"
            : `${CODE_PANEL_WIDTH}px`,
          borderRadius: isFloatingPanels ? "1rem" : undefined,
          border: isFloatingPanels
            ? theme === "light"
              ? "1px solid rgba(15, 23, 42, 0.18)"
              : "1px solid rgba(255, 255, 255, 0.24)"
            : undefined,
          background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
          overflow: "hidden",
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
                : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.82) 100%)",
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
                  ? "linear-gradient(90deg, rgba(139,92,246,0.2), rgba(99,102,241,0.16), rgba(15,23,42,0.0))"
                  : "linear-gradient(90deg,rgba(139,92,246,0.12),rgba(99,102,241,0.1),transparent)",
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: theme === "dark" ? "#c4b5fd" : "#7c3aed",
                  boxShadow:
                    theme === "dark"
                      ? "0 0 10px rgba(196,181,253,0.85)"
                      : "0 0 10px rgba(124,58,237,0.55)",
                }}
              />
              <span
                className="text-[11px] uppercase tracking-[0.2em] font-semibold"
                style={{ color: theme === "dark" ? "#e9d5ff" : "#5b21b6" }}
              >
                Code Studio
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-violet-500/15"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={() => {
                  if (!activeCodeFilePath) return;
                  void saveCodeDraftAtPath(activeCodeFilePath);
                }}
              >
                Save File
              </button>
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-violet-500/15"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={() => {
                  void saveCodeDraftsRef.current?.();
                }}
              >
                Save All
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded-md border flex items-center justify-center transition-colors hover:bg-violet-500/15"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                }}
                onClick={closeCodePanel}
                title="Close code panel"
              >
                <PanelRightClose size={14} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ColorCodeEditor
              value={activeCodeContent}
              onChange={handleCodeDraftChange}
              language={
                activeCodeFilePath?.endsWith(".ts")
                  ? "ts"
                  : activeCodeFilePath?.endsWith(".tsx")
                    ? "tsx"
                    : activeCodeFilePath?.endsWith(".jsx")
                      ? "jsx"
                      : activeCodeFilePath?.endsWith(".js")
                        ? "js"
                        : activeCodeFilePath?.endsWith(".css")
                          ? "css"
                          : activeCodeFilePath?.endsWith(".html")
                            ? "html"
                            : activeCodeFilePath?.endsWith(".json")
                              ? "json"
                              : activeCodeFilePath?.endsWith(".svg")
                                ? "svg"
                                : "text"
              }
              theme={theme}
              minHeight="100%"
              readOnly={!activeCodeFilePath}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              boxShadow:
                theme === "dark"
                  ? "inset 0 0 0 1px rgba(196,181,253,0.2)"
                  : "inset 0 0 0 1px rgba(139,92,246,0.2)",
            }}
          />
        </div>
      </div>

      {!isRightPanelOpen &&
      isRightInspectorMode &&
      !isZenMode &&
      !isCodePanelOpen ? (
        <div
          className="fixed z-[95] transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            right: "1rem",
            top: "1rem",
            opacity: 1,
            transform: "translateY(0)",
          }}
        >
          <button
            type="button"
            className="h-12 px-3 rounded-2xl border backdrop-blur-xl flex items-center justify-center gap-2 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.18)]"
            style={{
              background:
                theme === "light"
                  ? "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)"
                  : "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(15,23,42,0.9) 100%)",
              border: "1px solid var(--border-color)",
              boxShadow: "0 8px 20px rgba(15,23,42,0.14)",
              color: "var(--text-muted)",
            }}
            onClick={() => {
              setRightPanelMode("inspector");
              setIsRightPanelOpen(true);
              setIsCodePanelOpen(false);
            }}
            title="Show right inspector"
          >
            <PanelRight
              size={16}
              style={{
                color: theme === "dark" ? "#67e8f9" : "#0891b2",
                transform: "scaleX(-1)",
              }}
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: theme === "dark" ? "#a5f3fc" : "#0e7490" }}
            >
              Show
            </span>
          </button>
        </div>
      ) : null}

      {/* Console Panel — Chrome-like side panel */}
      <div
        ref={bottomPanelRef}
        className={`fixed z-[100] transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-visible ${isZenMode || isCodePanelOpen ? "translate-y-6 opacity-0 pointer-events-none" : ""}`}
        style={{
          left: "1rem",
          bottom: "1rem",
        }}
      >
        <button
          type="button"
          className={`relative z-10 h-14 w-14 rounded-full backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden flex items-center justify-center ${isCompactConsoleOpening ? "animate-compactConsoleOpen" : ""} ${theme === "dark" ? "hover:bg-white/5" : "hover:bg-black/5"}`}
          style={{
            background:
              theme === "light"
                ? "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)"
                : "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(15,23,42,0.9) 100%)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 8px 20px rgba(15,23,42,0.2)",
            color: "var(--text-muted)",
          }}
          onClick={() => {
            setIsCompactConsoleOpening(true);
            handleDetachConsoleWindow();
          }}
          title="Open console in a separate window"
        >
          <PanelRight
            size={18}
            className="shrink-0"
            style={{ color: theme === "dark" ? "#67e8f9" : "#0891b2" }}
          />
          {previewConsoleErrorCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] leading-[18px] justify-center">
              {previewConsoleErrorCount}
            </span>
          )}
        </button>
      </div>

      <ConfigEditorModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        initialTab={configModalInitialTab}
        slidesOnlyMode={isConfigModalSlidesOnly}
        configContent={(files[configPathForModal]?.content as string) || null}
        portfolioContent={
          (files[portfolioPathForModal]?.content as string) || null
        }
        onSave={handleSaveConfig}
        theme={theme}
        aiBackend={aiBackend}
        onAiBackendChange={(val) => {
          setAiBackend(val);
          localStorage.setItem(AI_BACKEND_STORAGE_KEY, val);
        }}
        colabUrl={colabUrl}
        onColabUrlChange={(val) => {
          setColabUrl(val);
          localStorage.setItem(COLAB_URL_STORAGE_KEY, val);
        }}
        autoSaveEnabled={autoSaveEnabled}
        onAutoSaveChange={(val) => {
          setAutoSaveEnabled(val);
          localStorage.setItem(PREVIEW_AUTOSAVE_STORAGE_KEY, val ? "1" : "0");
        }}
        panelSide={panelSide}
        onPanelSideChange={(val) => {
          setPanelSide(val);
          localStorage.setItem(PANEL_SIDE_STORAGE_KEY, val);
        }}
        showAiOptions={SHOW_AI_FEATURES}
        hasProjectConfig={Boolean(projectPath)}
        selectedSlideCloneSource={selectedFolderCloneSource}
        onSelectSlideCloneSource={setSelectedFolderCloneSource}
        files={files}
      />

      <DetachedCodeEditorWindow
        isOpen={isDetachedEditorOpen}
        onClose={closeCodePanel}
        theme={theme}
        files={files}
        activeFilePath={activeDetachedEditorFilePath}
        content={activeDetachedEditorContent}
        isDirty={activeDetachedEditorIsDirty}
        onSelectFile={handleDetachedEditorSelectFile}
        onChange={handleDetachedEditorChange}
        onSave={() => {
          if (!activeDetachedEditorFilePath || !detachedEditorIsTextEditable)
            return;
          void saveCodeDraftAtPath(activeDetachedEditorFilePath);
        }}
        onReload={() => {
          if (!activeDetachedEditorFilePath || !detachedEditorIsTextEditable)
            return;
          if (isSvgPath(activeDetachedEditorFilePath)) {
            handleDetachedEditorSelectFile(activeDetachedEditorFilePath);
            return;
          }
          void loadFileContent(activeDetachedEditorFilePath, {
            persistToState: true,
          });
          setCodeDraftByPath((prev) => {
            const next = { ...prev };
            delete next[activeDetachedEditorFilePath];
            return next;
          });
          setCodeDirtyPathSet((prev) => {
            const next = { ...prev };
            delete next[activeDetachedEditorFilePath];
            return next;
          });
        }}
        isTextEditable={detachedEditorIsTextEditable}
      />

      {SHOW_AI_FEATURES ? (
        <button
          type="button"
          className={`fixed z-[2147483647] right-6 bottom-24 flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border shadow-lg transition-all ${
            isVibeAssistantOpen
              ? theme === "dark"
                ? "bg-cyan-500/25 text-cyan-200 border-cyan-400/40"
                : "bg-cyan-500/20 text-cyan-700 border-cyan-500/30"
              : theme === "dark"
                ? "bg-slate-900/80 text-slate-200 border-slate-600/40 hover:bg-slate-900"
                : "bg-white/95 text-slate-700 border-slate-300/70 hover:bg-white"
          }`}
          style={{ pointerEvents: "auto" }}
          onClick={() => setIsVibeAssistantOpen((prev) => !prev)}
          title="AI Assistant"
        >
          <Sparkles size={14} />
          AI Assistant
        </button>
      ) : null}

      {SHOW_AI_FEATURES ? (
        <VibeAssistant
          isOpen={isVibeAssistantOpen}
          onClose={() => setIsVibeAssistantOpen(false)}
          currentRoot={interactionMode === "preview" ? previewLayersRoot : root}
          selectedElement={previewSelectedElement}
          fileMap={files}
          onVibeUpdate={async (response) => {
            if (response.updatedRoot) {
              lastVibeUpdateRef.current = Date.now();
              setVibeErrorContext(undefined);
              if (interactionMode === "preview") {
                const currentPath = selectedPreviewHtmlRef.current;
                if (currentPath) {
                  const tempDoc = document.implementation.createHTMLDocument();
                  const node = materializeVirtualElement(
                    tempDoc,
                    response.updatedRoot,
                  );
                  const serialized = (node as HTMLElement).innerHTML || "";
                  // @ts-ignore
                  await persistPreviewHtmlContent(currentPath, serialized, {
                    refreshPreviewDoc: true,
                    saveNow: true,
                  });
                }
              } else {
                setRoot(response.updatedRoot);
              }
            }
          }}
          lastErrorContext={vibeErrorContext}
          aiBackend={aiBackend}
          colabUrl={colabUrl}
        />
      ) : null}

      {(isPdfExporting || pdfExportLogs.length > 0) && (
        <div
          className="fixed right-6 bottom-6 z-[1200] w-[320px] rounded-2xl border shadow-2xl p-3 text-xs"
          style={{
            background:
              theme === "dark"
                ? "rgba(15,23,42,0.92)"
                : "rgba(255,255,255,0.95)",
            borderColor:
              theme === "dark"
                ? "rgba(148,163,184,0.35)"
                : "rgba(15,23,42,0.15)",
            color: theme === "dark" ? "#e2e8f0" : "#0f172a",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.2em] font-semibold opacity-70">
              PDF Export
            </div>
            {pdfExportLogs.length > 0 && (
              <button
                type="button"
                className="text-[10px] font-semibold opacity-70 hover:opacity-100"
                onClick={clearPdfExportLogs}
              >
                Close
              </button>
            )}
          </div>
          <div className="mt-2 space-y-1 max-h-32 overflow-auto">
            {pdfExportLogs.length === 0 ? (
              <div className="opacity-70">Exporting...</div>
            ) : (
              pdfExportLogs.slice(-6).map((log, index) => (
                <div key={`${index}-${log}`} className="opacity-80">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AppRoot: React.FC = () => (
  <Provider store={store}>
    <App />
  </Provider>
);

export default AppRoot;
