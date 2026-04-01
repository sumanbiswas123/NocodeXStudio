import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { VirtualElement } from "../types";
import {
  CSS_PROPERTY_NAMES,
  CSS_PROPERTY_VALUES,
  filterAndSortProperties,
} from "../utils/cssProperties";
import "../app/styles/components/style-inspector-panel.css";

interface StyleInspectorPanelProps {
  element: VirtualElement | null;
  onUpdateStyle: (styles: Partial<React.CSSProperties>) => void;
  availableFonts?: string[];
  onUpdateContent?: (data: { content?: string; html?: string }) => void;
  onImmediateChange?: (styles: Partial<React.CSSProperties>) => void;
  onUpdateIdentity?: (identity: { id: string; className: string }) => void;
  onReplaceAsset?: () => void;
  onWrapTextTag?: (tag: "sup" | "sub") => void;
  onToggleTextTag?: (tag: "sup" | "sub") => void;
  selectionMode?: "default" | "text" | "image" | "css";
  resolveAssetPreviewUrl?: (raw: string, source?: string) => string;
  computedStyles?: React.CSSProperties | null;
  onAddMatchedRuleProperty?: (
    rule: {
      selector: string;
      source: string;
      sourcePath?: string;
      occurrenceIndex?: number;
      originalProperty?: string;
      isActive?: boolean;
    },
    styles: Partial<React.CSSProperties>,
  ) => void;
  matchedCssRules?: Array<{
    selector: string;
    source: string;
    sourcePath?: string;
    declarations: Array<{
      property: string;
      value: string;
      important?: boolean;
      active?: boolean;
    }>;
  }>;
}

type StyleRow = { id: string; key: string; value: string };
type SuggestionField = { index: number; type: "key" | "value" } | null;
type MatchedDeclaration = {
  property: string;
  value: string;
  important?: boolean;
  active?: boolean;
};
type MatchedRule = NonNullable<
  StyleInspectorPanelProps["matchedCssRules"]
>[number];
type AnnotatedMatchedRule = MatchedRule & {
  occurrenceIndex: number;
};
type EditingMatchedDeclaration = {
  ruleKey: string;
  originalProperty: string;
  property: string;
  value: string;
  isActive?: boolean;
  focusField?: "key" | "value";
};
type MatchedDeclarationDraft = {
  originalProperty: string;
  property: string;
  value: string;
};
type HoveredAssetPreview = {
  src: string;
  key?: string;
};

const toCssName = (key: string) =>
  key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const toReactName = (key: string) =>
  key.trim().replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

const normalizeKey = (key: string) => toCssName(toReactName(key)).toLowerCase();

const isInternalPreviewHelperRule = (rule: {
  selector: string;
  source: string;
}) =>
  /__nx-preview-(selected|editing|dirty)/i.test(rule.selector) ||
  /__nx-preview-(selected|editing|dirty)/i.test(rule.source);

const isTemporaryMatchedRuleSource = (source: string) => {
  const normalized = String(source || "").trim().toLowerCase();
  return (
    normalized === "inline stylesheet" ||
    /^style-sheet-\d+-\d+$/.test(normalized)
  );
};

const buildMatchedRuleInstanceKey = (
  rule: { selector: string; source: string; occurrenceIndex: number },
) => `${rule.source}::${rule.selector}::${rule.occurrenceIndex}`;

const buildMatchedDeclarationDraftKey = (
  rule: { selector: string; source: string; occurrenceIndex: number },
  originalProperty: string,
) =>
  `${buildMatchedRuleInstanceKey(rule)}::${normalizeKey(originalProperty)}`;

const collapseRenderedDeclarations = (declarations: MatchedDeclaration[]) => {
  const kept = new Map<string, MatchedDeclaration>();
  declarations.forEach((declaration) => {
    const key = [
      normalizeKey(declaration.property),
      String(declaration.value || "").trim(),
      declaration.important ? "important" : "",
    ].join("::");
    const current = kept.get(key);
    if (!current) {
      kept.set(key, declaration);
      return;
    }
    if (current.active !== true && declaration.active === true) {
      kept.set(key, declaration);
    }
  });
  return Array.from(kept.values());
};

const CSS_NUMERIC_TOKEN_PATTERN = /-?(?:\d+\.?\d*|\.\d+)/g;

const countDecimalPlaces = (value: string) => {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("e")) {
    const [basePart, exponentPart] = normalized.split("e");
    const exponent = Number(exponentPart || "0");
    const baseDecimals = countDecimalPlaces(basePart);
    return exponent >= 0 ? Math.max(0, baseDecimals - exponent) : 0;
  }
  const decimalIndex = normalized.indexOf(".");
  return decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0;
};

const trimNumericString = (value: string) =>
  value.includes(".")
    ? value.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "")
    : value;

const adjustNumericValueAtCursor = (
  rawValue: string,
  cursorIndex: number | null,
  direction: 1 | -1,
  options?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
) => {
  const source = String(rawValue || "");
  const matches = Array.from(source.matchAll(CSS_NUMERIC_TOKEN_PATTERN));
  if (matches.length === 0) return null;

  const caret = Math.max(
    0,
    Math.min(source.length, cursorIndex ?? source.length),
  );
  const selected =
    matches.find((match) => {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      return caret >= start && caret <= end;
    }) ||
    [...matches]
      .reverse()
      .find((match) => (match.index ?? 0) <= caret) ||
    matches[0];

  const start = selected.index ?? 0;
  const end = start + selected[0].length;
  const currentNumericText = selected[0];
  const currentValue = Number(currentNumericText);
  if (!Number.isFinite(currentValue)) return null;

  const magnitude =
    options?.ctrlKey || options?.metaKey
      ? 100
      : options?.shiftKey
        ? 10
        : 1;
  const nextValue = currentValue + direction * magnitude;
  const decimals = countDecimalPlaces(currentNumericText);
  const nextNumericText =
    decimals > 0
      ? trimNumericString(nextValue.toFixed(decimals))
      : String(Math.round(nextValue));

  return {
    value: `${source.slice(0, start)}${nextNumericText}${source.slice(end)}`,
    selectionStart: start,
    selectionEnd: start + nextNumericText.length,
  };
};

const extractUrlFromBackground = (raw?: string) => {
  if (!raw || typeof raw !== "string") return "";
  const match = raw.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ? match[2] : "";
};

const normalizeCssValueInput = (value: string) =>
  String(value || "").replace(
    /(-?(?:\d+\.?\d*|\.\d+))px\b/gi,
    (_match, amount) => `${amount}rem`,
  );

const toColorInputValue = (value: string) => {
  if (typeof document === "undefined") return null;
  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = String(value || "");
  if (!probe.style.color) return null;
  document.body.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  probe.remove();
  const match = resolved.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!match) return null;
  const [r, g, b] = match.slice(1, 4).map((channel) =>
    Number(channel).toString(16).padStart(2, "0"),
  );
  return `#${r}${g}${b}`;
};

const filterRemSuggestions = (suggestions: string[]) =>
  Array.from(
    new Set(
      suggestions
        .map((value) => normalizeCssValueInput(value))
        .filter((value) => !/\b-?(?:\d+\.?\d*|\.\d+)px\b/i.test(value)),
    ),
  );

const buildSelectorLabel = (element: VirtualElement | null) => {
  if (!element) return "";
  const tag = String(element.type || element.name || "div").toLowerCase();
  const rawId = String(element.id || "").trim();
  const usableId = rawId && !/^preview-\d+/i.test(rawId) ? `#${rawId}` : "";
  const classTokens = String(element.className || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 3);
  const primaryLabel =
    usableId || (classTokens.length > 0 ? `.${classTokens[0]}` : "");
  const secondaryLabel =
    !usableId && classTokens.length > 1
      ? classTokens
          .slice(1)
          .map((token) => `.${token}`)
          .join("")
      : usableId && classTokens.length > 0
        ? classTokens.map((token) => `.${token}`).join("")
        : "";
  return [`<${tag}>`, primaryLabel, secondaryLabel].filter(Boolean).join(" ");
};

const splitSelectorGroup = (selectorText: string) => {
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

const normalizeSelectorSignature = (value: string) =>
  String(value || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim();

const selectorGroupsOverlap = (left: string, right: string) => {
  const leftParts = new Set(
    splitSelectorGroup(left)
      .map((part) => normalizeSelectorSignature(part))
      .filter(Boolean),
  );
  return splitSelectorGroup(right)
    .map((part) => normalizeSelectorSignature(part))
    .filter(Boolean)
    .some((part) => leftParts.has(part));
};

const isPreviewCssDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  const explicit = (window as any).__NX_DEBUG_PREVIEW_CSS;
  if (explicit === false) return false;
  return true;
};

const debugPreviewCss = (label: string, payload: Record<string, unknown>) => {
  if (!isPreviewCssDebugEnabled()) return;
  console.groupCollapsed(`[PreviewCSSDebug] ${label}`);
  Object.entries(payload).forEach(([key, value]) => {
    console.log(key, value);
  });
  console.groupEnd();
};

const selectorPartMatchesElement = (
  selectorPart: string,
  element: VirtualElement | null,
) => {
  if (!element) return false;

  const tag = String(element.type || element.name || "div").toLowerCase();
  const id = String(element.id || "").trim();
  const classes = new Set(
    String(element.className || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );

  const normalized = selectorPart.trim();
  if (!normalized) return false;

  const idMatches: string[] = normalized.match(/#([\w-]+)/g) || [];
  if (idMatches.length > 0) {
    return idMatches.some((token) => token.slice(1) === id);
  }

  const classMatches: string[] = normalized.match(/\.([\w-]+)/g) || [];
  if (classMatches.length > 0) {
    return classMatches.every((token) => classes.has(token.slice(1)));
  }

  const tagMatch = normalized.match(/^[a-zA-Z][\w-]*/);
  if (tagMatch) {
    return tagMatch[0].toLowerCase() === tag;
  }

  return false;
};

const SelectorText: React.FC<{
  selector: string;
  element: VirtualElement | null;
}> = ({ selector, element }) => {
  const parts = splitSelectorGroup(selector);
  const hasMatch = parts.some((part) => selectorPartMatchesElement(part, element));

  return (
    <span style={{ color: "var(--text-main)" }}>
      {parts.map((part, index) => {
        const isMatch =
          !hasMatch || selectorPartMatchesElement(part, element);
        return (
          <React.Fragment key={`${part}-${index}`}>
            <span style={{ opacity: isMatch ? 1 : 0.4 }}>{part}</span>
            {index < parts.length - 1 ? (
              <span style={{ opacity: 0.45 }}>, </span>
            ) : null}
          </React.Fragment>
        );
      })}{" "}
      {"{"}
    </span>
  );
};

const isColorProperty = (key: string) =>
  /(color|fill|stroke)$/i.test(key) ||
  /background/i.test(key) ||
  /border-color/i.test(key);

const isFontFamilyProperty = (key: string) =>
  normalizeKey(key) === "font-family";

const extractAssetUrl = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const urlMatch = raw.match(/url\((['"]?)(.*?)\1\)/i);
  if (urlMatch?.[2]) return urlMatch[2].trim();
  if (/^(https?:|data:|blob:|\/)/i.test(raw)) return raw;
  return "";
};

const getAssetLabel = (src: string) => {
  const cleaned = String(src || "").trim();
  if (!cleaned) return "";
  const withoutQuery = cleaned.split("?")[0].split("#")[0];
  const parts = withoutQuery.split("/");
  return parts[parts.length - 1] || cleaned;
};

const shouldPreviewDeclarationAsset = (
  property: string,
  value: string,
) => {
  const normalizedProperty = normalizeKey(property);
  if (
    normalizedProperty !== "background-image" &&
    normalizedProperty !== "background"
  ) {
    return false;
  }
  return Boolean(extractAssetUrl(value));
};

const SuggestionList: React.FC<{
  suggestions: string[];
  width?: string;
  onSelect: (value: string) => void;
}> = ({ suggestions, width = "100%", onSelect }) =>
  suggestions.length ? (
    <div
      className="style-inspector-suggestions"
      style={{
        width,
        background: "var(--bg-glass-strong)",
        borderColor: "var(--border-color)",
        boxShadow: "var(--glass-shadow)",
      }}
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="style-inspector-suggestion-button"
          style={{ borderColor: "var(--border-color)", color: "var(--text-main)" }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect(suggestion);
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  ) : null;

const StyleInspectorPanel: React.FC<StyleInspectorPanelProps> = ({
  element,
  onUpdateStyle,
  availableFonts = [],
  onUpdateContent,
  onUpdateIdentity,
  onReplaceAsset,
  onWrapTextTag,
  onToggleTextTag,
  selectionMode = "default",
  resolveAssetPreviewUrl,
  computedStyles,
  onAddMatchedRuleProperty,
  matchedCssRules = [],
  onImmediateChange,
}) => {
  const panelRootRef = useRef<HTMLDivElement | null>(null);
  const styleRowIdRef = useRef(0);
  const stylesRef = useRef<StyleRow[]>([]);
  const styleDraftsRef = useRef<
    Record<string, { key: string; value: string; previousKey?: string }>
  >({});
  const activeInlineFieldRef = useRef<{
    rowId: string;
    field: "key" | "value";
  } | null>(null);
  const inlineSelectionRef = useRef<{
    rowId: string;
    field: "key" | "value";
    start: number | null;
    end: number | null;
  } | null>(null);
  const editingMatchedDeclarationRef =
    useRef<EditingMatchedDeclaration | null>(null);
  const activeMatchedFieldRef = useRef<{
    ruleKey: string;
    originalProperty: string;
    field: "key" | "value";
  } | null>(null);
  const matchedSelectionRef = useRef<{
    ruleKey: string;
    originalProperty: string;
    field: "key" | "value";
    start: number | null;
    end: number | null;
  } | null>(null);
  const matchedBlurTimerRef = useRef<number | null>(null);
  const [styles, setStyles] = useState<StyleRow[]>([]);
  const [newPropName, setNewPropName] = useState("");
  const [newPropValue, setNewPropValue] = useState("");
  const [activeSuggestionField, setActiveSuggestionField] =
    useState<SuggestionField>(null);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [filterText, setFilterText] = useState("");
  const [showComputed, setShowComputed] = useState(false);
  const [showHtmlEditor, setShowHtmlEditor] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [showSelectorTokenInput, setShowSelectorTokenInput] = useState(false);
  const [selectorTokenDraft, setSelectorTokenDraft] = useState("");
  const [ruleDrafts, setRuleDrafts] = useState<
    Record<string, { key: string; value: string }>
  >({});
  const [matchedDeclarationDrafts, setMatchedDeclarationDrafts] = useState<
    Record<string, MatchedDeclarationDraft>
  >({});
  const [editingMatchedDeclaration, setEditingMatchedDeclaration] =
    useState<EditingMatchedDeclaration | null>(null);
  const fontFamilyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          availableFonts
            .map((font) => String(font || "").trim())
            .filter(Boolean),
        ),
      ),
    [availableFonts],
  );

  const getValueOptions = (key: string, currentValue = "") => {
    if (isFontFamilyProperty(key)) {
      const current = String(currentValue || "").trim();
      return current && !fontFamilyOptions.includes(current)
        ? [current, ...fontFamilyOptions]
        : fontFamilyOptions;
    }
    return CSS_PROPERTY_VALUES[toReactName(key)] || [];
  };
  const [hoveredAssetPreview, setHoveredAssetPreview] =
    useState<HoveredAssetPreview | null>(null);

  const showAssetPreview = (
    source: string,
    ruleSource?: string,
    key?: string,
  ) => {
    const rawSrc = extractAssetUrl(source);
    if (!rawSrc) return;
    const src = resolveAssetPreviewUrl
      ? resolveAssetPreviewUrl(rawSrc, ruleSource)
      : rawSrc;
    if (!src) return;
    setHoveredAssetPreview({
      src,
      key,
    });
  };

  const createStyleRows = (
    nextStyles: React.CSSProperties | Record<string, unknown> | undefined,
    previousRows: StyleRow[] = [],
  ): StyleRow[] => {
    const previousRowsByKey = new Map<string, StyleRow[]>();
    previousRows.forEach((row) => {
      const normalized = normalizeKey(row.key);
      const bucket = previousRowsByKey.get(normalized);
      if (bucket) {
        bucket.push(row);
        return;
      }
      previousRowsByKey.set(normalized, [row]);
    });

    return Object.entries(nextStyles || {}).map(([key, value]) => {
      const normalized = normalizeKey(key);
      const bucket = previousRowsByKey.get(normalized);
      const reused = bucket?.shift();
      return {
        id: reused?.id || `style-row-${styleRowIdRef.current++}`,
        key,
        value: String(value),
      };
    });
  };

  useEffect(() => {
    stylesRef.current = styles;
  }, [styles]);

  useEffect(() => {
    editingMatchedDeclarationRef.current = editingMatchedDeclaration;
  }, [editingMatchedDeclaration]);

  useEffect(() => {
    const activeInlineField = activeInlineFieldRef.current;
    if (!activeInlineField || !panelRootRef.current) return;
    const selector = `input[data-style-row-id="${activeInlineField.rowId}"][data-style-field="${activeInlineField.field}"]`;
    const target = panelRootRef.current.querySelector<HTMLInputElement>(selector);
    if (!target) return;
    if (document.activeElement !== target) {
      target.focus();
    }
    const selection = inlineSelectionRef.current;
    if (
      selection &&
      selection.rowId === activeInlineField.rowId &&
      selection.field === activeInlineField.field
    ) {
      try {
        target.setSelectionRange(selection.start, selection.end);
      } catch {
        // Ignore selection restore failures on recycled inputs.
      }
    }
  }, [styles]);

  useEffect(() => {
    return () => {
      styleDraftsRef.current = {};
      if (matchedBlurTimerRef.current !== null) {
        window.clearTimeout(matchedBlurTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!element) {
      styleDraftsRef.current = {};
      setStyles([]);
      return;
    }
    styleDraftsRef.current = {};
    setStyles(createStyleRows(element.styles || {}));
    setNewPropName("");
    setNewPropValue("");
    setFilteredSuggestions([]);
    setActiveSuggestionField(null);
    setFilterText("");
    setShowSelectorTokenInput(false);
    setSelectorTokenDraft("");
    setShowHtmlEditor(false);
    setHtmlDraft(
      typeof element?.html === "string"
        ? element.html
        : typeof element?.content === "string"
          ? element.content
          : "",
    );
    setRuleDrafts({});
    setMatchedDeclarationDrafts({});
    setEditingMatchedDeclaration(null);
  }, [element?.id]);

  useEffect(() => {
    if (!element) {
      setStyles([]);
      return;
    }
    setStyles((current) => {
      const nextBase = createStyleRows(element.styles || {}, current);
      const nextById = new Map(nextBase.map((row) => [row.id, row]));
      const merged = nextBase.map((row) => {
        const draft = styleDraftsRef.current[row.id];
        if (!draft) return row;
        const draftMatchesSource =
          row.key === draft.key && row.value === draft.value;
        if (draftMatchesSource) {
          delete styleDraftsRef.current[row.id];
          return row;
        }
        return {
          ...row,
          key: draft.key,
          value: draft.value,
        };
      });
      current.forEach((row) => {
        if (nextById.has(row.id)) return;
        const draft = styleDraftsRef.current[row.id];
        if (!draft) return;
        merged.push({
          ...row,
          key: draft.key,
          value: draft.value,
        });
      });
      const currentSignature = current
        .map((row) => `${row.id}:${normalizeKey(row.key)}:${row.value}`)
        .join("|");
      const nextSignature = merged
        .map((row) => `${row.id}:${normalizeKey(row.key)}:${row.value}`)
        .join("|");
      return currentSignature === nextSignature ? current : merged;
    });
  }, [element, element?.styles]);

  useEffect(() => {
    setHtmlDraft(
      typeof element?.html === "string"
        ? element.html
        : typeof element?.content === "string"
          ? element.content
          : "",
    );
  }, [element?.content, element?.html, element?.id]);

  const applySelectorTokenDraft = () => {
    if (!onUpdateIdentity) return;
    const raw = selectorTokenDraft.trim();
    if (!raw) {
      setShowSelectorTokenInput(false);
      return;
    }

    const currentId = String(element?.id || "").trim();
    const currentClasses = String(element?.className || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    if (raw.startsWith("#")) {
      const nextId = raw.slice(1).trim();
      if (!nextId) return;
      onUpdateIdentity({
        id: nextId,
        className: currentClasses.join(" "),
      });
    } else if (raw.startsWith(".")) {
      const nextClass = raw.slice(1).trim();
      if (!nextClass) return;
      const nextClasses = Array.from(new Set([...currentClasses, nextClass]));
      onUpdateIdentity({
        id: currentId,
        className: nextClasses.join(" "),
      });
    } else {
      return;
    }

    setSelectorTokenDraft("");
    setShowSelectorTokenInput(false);
  };

  const setRuleDraftValue = (
    ruleKey: string,
    field: "key" | "value",
    value: string,
  ) => {
    setRuleDrafts((current) => ({
      ...current,
      [ruleKey]: {
        key: field === "key" ? value : current[ruleKey]?.key || "",
        value: field === "value" ? value : current[ruleKey]?.value || "",
      },
    }));
  };

  const addRuleProperty = (
    rule: AnnotatedMatchedRule,
    ruleKey: string,
    occurrenceIndex: number,
  ) => {
    const draft = ruleDrafts[ruleKey];
    if (
      !draft?.key?.trim() ||
      !draft.value?.trim() ||
      !onAddMatchedRuleProperty
    ) {
      return;
    }
    onAddMatchedRuleProperty(
      {
        selector: rule.selector,
        source: rule.source,
        sourcePath: rule.sourcePath,
        occurrenceIndex,
      },
      { [toReactName(draft.key.trim())]: draft.value.trim() },
    );
    setRuleDrafts((current) => ({
      ...current,
      [ruleKey]: { key: "", value: "" },
    }));
    setActiveSuggestionField(null);
  };

  const commitMatchedDeclarationEdit = (
    rule: AnnotatedMatchedRule,
    ruleKey: string,
    occurrenceIndex: number,
  ) => {
    const currentEditing = editingMatchedDeclarationRef.current;
    if (!currentEditing || currentEditing.ruleKey !== ruleKey) {
      return;
    }
    if (!onAddMatchedRuleProperty) {
      setEditingMatchedDeclaration(null);
      activeMatchedFieldRef.current = null;
      return;
    }
    if (!currentEditing.property.trim() || !currentEditing.value.trim()) {
      const clearedDraftKey = buildMatchedDeclarationDraftKey(
        rule,
        currentEditing.originalProperty,
      );
      setMatchedDeclarationDrafts((current) => {
        if (!current[clearedDraftKey]) return current;
        const next = { ...current };
        delete next[clearedDraftKey];
        return next;
      });
      onAddMatchedRuleProperty(
        {
          selector: rule.selector,
          source: rule.source,
          sourcePath: rule.sourcePath,
          occurrenceIndex,
          originalProperty: currentEditing.originalProperty,
          isActive: currentEditing.isActive,
        },
        {
          [toReactName(currentEditing.originalProperty)]: "",
        },
      );
      setEditingMatchedDeclaration(null);
      setActiveSuggestionField(null);
      activeMatchedFieldRef.current = null;
      return;
    }
    onAddMatchedRuleProperty(
      {
        selector: rule.selector,
        source: rule.source,
        sourcePath: rule.sourcePath,
        occurrenceIndex,
        originalProperty: currentEditing.originalProperty,
        isActive: currentEditing.isActive,
      },
      {
        [toReactName(currentEditing.property.trim())]: currentEditing.value.trim(),
      },
    );
    setEditingMatchedDeclaration(null);
    setActiveSuggestionField(null);
    activeMatchedFieldRef.current = null;
  };

  const pushMatchedDeclarationDraft = (
    rule: AnnotatedMatchedRule,
    occurrenceIndex: number,
    draft: { property: string; value: string } | null,
  ) => {
    if (!draft || !onAddMatchedRuleProperty) return;
    const property = draft.property.trim();
    const value = draft.value.trim();
    if (!property || !value) return;
    const originalProperty =
      editingMatchedDeclaration?.originalProperty || property;
    const isActive = editingMatchedDeclaration?.isActive;
    const draftRule = {
      selector: rule.selector,
      source: rule.source,
      sourcePath: rule.sourcePath,
      occurrenceIndex,
    };
    const draftKey = buildMatchedDeclarationDraftKey(
      draftRule,
      originalProperty,
    );
    debugPreviewCss("pushMatchedDeclarationDraft", {
      selector: rule.selector,
      source: rule.source,
      occurrenceIndex,
      originalProperty,
      property,
      value,
      existingDeclarations: rule.declarations.map((declaration) => ({
        property: declaration.property,
        value: declaration.value,
        active: declaration.active,
      })),
    });
    setMatchedDeclarationDrafts((current) => ({
      ...current,
      [draftKey]: {
        originalProperty,
        property,
        value,
      },
    }));
    onAddMatchedRuleProperty(
      {
        selector: rule.selector,
        source: rule.source,
        sourcePath: rule.sourcePath,
        occurrenceIndex,
        originalProperty,
        isActive,
      },
      { [toReactName(property)]: value },
    );
  };

  type AssetInfo = {
    source: string;
    ruleSource?: string;
  };

  const selectorLabel = useMemo(() => buildSelectorLabel(element), [element]);
  const assetInfo = useMemo<AssetInfo>(() => {
    if (!element) return { source: "" };
    if (typeof element.src === "string" && element.src.trim()) {
      return {
        source: element.src.trim(),
        ruleSource: undefined,
      };
    }
    const backgroundImage =
      typeof element.styles?.backgroundImage === "string"
        ? String(element.styles.backgroundImage)
        : "";
    const inlineSource = extractUrlFromBackground(backgroundImage);
    if (inlineSource) {
      return {
        source: inlineSource,
        ruleSource: "element.style",
      };
    }
    const computedSource = extractUrlFromBackground(
      typeof computedStyles?.backgroundImage === "string"
        ? String(computedStyles.backgroundImage)
        : "",
    );
    if (computedSource) {
      const matchedRule = matchedCssRules.find((rule) =>
        rule.declarations.some(
          (declaration) =>
            declaration.active !== false &&
            normalizeKey(declaration.property) === "background-image" &&
            extractAssetUrl(declaration.value),
        ),
      );
      return {
        source: computedSource,
        ruleSource: matchedRule?.source,
      };
    }
    return {
      source: "",
      ruleSource: undefined,
    };
  }, [computedStyles, element, matchedCssRules]);
  const assetSource = assetInfo.source;
  const assetPreviewSource = useMemo(
    () =>
      assetSource
        ? resolveAssetPreviewUrl?.(assetSource, assetInfo.ruleSource) ||
          extractAssetUrl(assetSource)
        : "",
    [assetInfo.ruleSource, assetSource, resolveAssetPreviewUrl],
  );

  const filteredStyles = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    return styles
      .map((style, index) => ({ style, index }))
      .filter(
        ({ style }) =>
          !query ||
          toCssName(style.key).toLowerCase().includes(query) ||
          style.value.toLowerCase().includes(query),
      );
  }, [filterText, styles]);

  const inlineStyleLastIndexByKey = useMemo(() => {
    const lastIndex = new Map<string, number>();
    styles.forEach((style, index) => {
      lastIndex.set(normalizeKey(style.key), index);
    });
    return lastIndex;
  }, [styles]);

  const computedEntries = useMemo(() => {
    if (!computedStyles) return [];

    const explicitKeys = new Set(
      styles.map((style) => normalizeKey(style.key)),
    );

    return Object.entries(computedStyles)
      .filter(([key, value]) => {
        const normalizedValue = String(value).trim();
        return (
          !explicitKeys.has(normalizeKey(key)) &&
          value !== undefined &&
          value !== null &&
          normalizedValue !== "" &&
          normalizedValue !== "undefined" &&
          normalizedValue !== "null" &&
          normalizedValue !== "none" &&
          normalizedValue !== "normal" &&
          normalizedValue !== "auto" &&
          normalizedValue !== "0px" &&
          normalizedValue !== "rgba(0, 0, 0, 0)"
        );
      })
      .map(([key, value]) => ({
        key: toCssName(key),
        value: String(value),
      }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(0, 40);
  }, [computedStyles, styles]);

  const annotatedMatchedRules = useMemo(() => {
    const occurrenceCounter = new Map<string, number>();
    return matchedCssRules.map((rule) => {
      const counterKey = `${rule.source}::${rule.selector}`;
      const occurrenceIndex = occurrenceCounter.get(counterKey) || 0;
      occurrenceCounter.set(counterKey, occurrenceIndex + 1);
      return {
        ...rule,
        occurrenceIndex,
      };
    });
  }, [matchedCssRules]);

  useEffect(() => {
    setMatchedDeclarationDrafts((current) => {
      const nextEntries = Object.entries(current).filter(([draftKey, draft]) => {
        const ruleKeyEnd = draftKey.lastIndexOf("::");
        if (ruleKeyEnd < 0) return false;
        const ruleKey = draftKey.slice(0, ruleKeyEnd);
        const matchingRule = annotatedMatchedRules.find(
          (rule) => buildMatchedRuleInstanceKey(rule) === ruleKey,
        );
        if (!matchingRule) return true;
        return !matchingRule.declarations.some(
          (declaration) =>
            normalizeKey(declaration.property) ===
              normalizeKey(draft.property) && declaration.value === draft.value,
        );
      });
      if (nextEntries.length === Object.keys(current).length) return current;
      return Object.fromEntries(nextEntries);
    });
  }, [annotatedMatchedRules]);

  const filteredMatchedRules = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    return annotatedMatchedRules
      .map((rule) => ({
        ...rule,
        declarations: (() => {
          const nextDeclarations = rule.declarations.map((declaration) => {
            const draftKey = buildMatchedDeclarationDraftKey(
              rule,
              declaration.property,
            );
            const draft = matchedDeclarationDrafts[draftKey];
            const active = declaration.active;
            if (!draft) {
              return {
                ...declaration,
                active,
              };
            }
            return {
              ...declaration,
              property: draft.property,
              value: draft.value,
              active,
            };
          });
          Object.entries(matchedDeclarationDrafts).forEach(
            ([draftKey, draft]) => {
              const ruleKeyEnd = draftKey.lastIndexOf("::");
              if (ruleKeyEnd < 0) return;
              const draftRuleKey = draftKey.slice(0, ruleKeyEnd);
              if (draftRuleKey !== buildMatchedRuleInstanceKey(rule)) return;
            const alreadyExists = nextDeclarations.some(
              (declaration) =>
                normalizeKey(declaration.property) ===
                normalizeKey(draft.property),
            );
            if (!alreadyExists) {
              nextDeclarations.push({
                property: draft.property,
                value: draft.value,
                active: false,
              });
            }
            },
          );
          const filteredDeclarations = query
            ? nextDeclarations.filter(
                (declaration) =>
                  rule.selector.toLowerCase().includes(query) ||
                  rule.source.toLowerCase().includes(query) ||
                  declaration.property.toLowerCase().includes(query) ||
                  declaration.value.toLowerCase().includes(query),
              )
            : nextDeclarations;
          return collapseRenderedDeclarations(filteredDeclarations);
        })(),
      }))
      .filter((rule) => rule.declarations.length > 0);
  }, [annotatedMatchedRules, filterText, matchedDeclarationDrafts]);

  const orderedMatchedRules = useMemo(
    () => {
      const stableRules = filteredMatchedRules.filter(
        (rule) => !isTemporaryMatchedRuleSource(rule.source),
      );
      const hiddenTemporaryRules = filteredMatchedRules.filter(
        (rule) =>
          isTemporaryMatchedRuleSource(rule.source) &&
          stableRules.some((stableRule) =>
            selectorGroupsOverlap(stableRule.selector, rule.selector),
          ),
      );
      const visibleRules = filteredMatchedRules.filter((rule) => {
        if (!isTemporaryMatchedRuleSource(rule.source)) return true;
        return !hiddenTemporaryRules.includes(rule);
      });
      const promotedRules = visibleRules.map((rule) => {
        if (isTemporaryMatchedRuleSource(rule.source)) {
          return rule;
        }
        const nextDeclarations = rule.declarations.map((declaration) => {
          const shouldPromote = hiddenTemporaryRules.some((temporaryRule) => {
            if (!selectorGroupsOverlap(rule.selector, temporaryRule.selector)) {
              return false;
            }
            return temporaryRule.declarations.some(
              (temporaryDeclaration) =>
                temporaryDeclaration.active === true &&
                normalizeKey(temporaryDeclaration.property) ===
                  normalizeKey(declaration.property) &&
                String(temporaryDeclaration.value || "").trim() ===
                  String(declaration.value || "").trim(),
            );
          });
          return shouldPromote
            ? {
                ...declaration,
                active: true,
              }
            : declaration;
        });
        return {
          ...rule,
          declarations: nextDeclarations,
        };
      });
      return [...promotedRules]
        .reverse()
        .sort((left, right) => {
          const leftInternal = isInternalPreviewHelperRule(left);
          const rightInternal = isInternalPreviewHelperRule(right);
          if (leftInternal === rightInternal) return 0;
          return leftInternal ? 1 : -1;
        });
    },
    [filteredMatchedRules],
  );

  useEffect(() => {
    const duplicateRules = orderedMatchedRules
      .map((rule) => {
        const counts = new Map<string, Array<{ value: string; active?: boolean }>>();
        rule.declarations.forEach((declaration) => {
          const property = normalizeKey(declaration.property);
          const bucket = counts.get(property) || [];
          bucket.push({
            value: String(declaration.value || "").trim(),
            active: declaration.active,
          });
          counts.set(property, bucket);
        });
        const duplicates = Array.from(counts.entries())
          .filter(([, bucket]) => bucket.length > 1)
          .map(([property, bucket]) => ({
            property,
            entries: bucket,
          }));
        return duplicates.length > 0
          ? {
              selector: rule.selector,
              source: rule.source,
              duplicates,
            }
          : null;
      })
      .filter(Boolean);
    if (duplicateRules.length === 0) return;
    debugPreviewCss("StyleInspector duplicate declarations detected", {
      duplicateRules,
    });
  }, [orderedMatchedRules]);

  useEffect(() => {
    const activeMatchedField = activeMatchedFieldRef.current;
    if (!activeMatchedField || !panelRootRef.current || !editingMatchedDeclaration) {
      return;
    }
    const target = Array.from(
      panelRootRef.current.querySelectorAll<HTMLInputElement>(
        'input[data-matched-field]',
      ),
    ).find(
      (input) =>
        input.dataset.ruleKey === activeMatchedField.ruleKey &&
        input.dataset.originalProperty === activeMatchedField.originalProperty &&
        input.dataset.matchedField === activeMatchedField.field,
    );
    if (!target) return;
    if (document.activeElement !== target) {
      target.focus();
    }
    const selection = matchedSelectionRef.current;
    if (
      selection &&
      selection.ruleKey === activeMatchedField.ruleKey &&
      selection.originalProperty === activeMatchedField.originalProperty &&
      selection.field === activeMatchedField.field
    ) {
      try {
        target.setSelectionRange(selection.start, selection.end);
      } catch {
        // Ignore selection restore failures on recycled inputs.
      }
    }
  }, [editingMatchedDeclaration, orderedMatchedRules]);

  const getDeclarationActiveState = (declaration: MatchedDeclaration) =>
    declaration.active;

  const pushStylePatchForRow = (
    row: StyleRow,
    nextKeyRaw: string,
    nextValue: string,
    previousKeyOverride?: string,
  ) => {
    const nextKey = nextKeyRaw.trim();
    const previousKey =
      previousKeyOverride?.trim() ||
      styleDraftsRef.current[row.id]?.previousKey?.trim() ||
      row.key.trim();

    const patch: Partial<React.CSSProperties> = {};
    if (previousKey && normalizeKey(previousKey) !== normalizeKey(nextKey)) {
      patch[toReactName(previousKey)] = ""; 
    }
    if (nextKey) {
      patch[toReactName(nextKey)] = nextValue;
    }

    if (Object.keys(patch).length > 0) {
      if (onImmediateChange) {
        onImmediateChange(patch);
      }
      onUpdateStyle(patch);
    }
  };

  const updateStyleDraftAtIndex = (
    index: number,
    nextKey: string,
    nextValue: string,
    previousKeyOverride?: string,
  ) => {
    const row = stylesRef.current[index];
    if (!row) return;
    styleDraftsRef.current[row.id] = {
      key: nextKey,
      value: nextValue,
      previousKey:
        previousKeyOverride ??
        styleDraftsRef.current[row.id]?.previousKey ??
        row.key,
    };
  };

  const updateStyleAtIndex = (index: number, key: string, value: string) => {
    if (index < 0 || index >= styles.length) return;
    const nextStyles = [...styles];
    nextStyles[index] = { ...nextStyles[index], key, value };
    setStyles(nextStyles);
  };

  const handleInlineFieldFocus = (
    rowId: string,
    field: "key" | "value",
    event?: React.FocusEvent<HTMLInputElement>,
  ) => {
    activeInlineFieldRef.current = { rowId, field };
    inlineSelectionRef.current = {
      rowId,
      field,
      start: event?.currentTarget.selectionStart ?? null,
      end: event?.currentTarget.selectionEnd ?? null,
    };
  };

  const handleInlineFieldBlur = (
    rowId: string,
    field: "key" | "value",
  ) => {
    const activeInlineField = activeInlineFieldRef.current;
    if (
      activeInlineField &&
      activeInlineField.rowId === rowId &&
      activeInlineField.field === field
    ) {
      activeInlineFieldRef.current = null;
    }
  };

  const captureInlineSelection = (
    rowId: string,
    field: "key" | "value",
    event: React.SyntheticEvent<HTMLInputElement>,
  ) => {
    inlineSelectionRef.current = {
      rowId,
      field,
      start: event.currentTarget.selectionStart ?? null,
      end: event.currentTarget.selectionEnd ?? null,
    };
  };

  const handleMatchedFieldFocus = (
    ruleKey: string,
    originalProperty: string,
    field: "key" | "value",
    event?: React.FocusEvent<HTMLInputElement>,
  ) => {
    if (matchedBlurTimerRef.current !== null) {
      window.clearTimeout(matchedBlurTimerRef.current);
      matchedBlurTimerRef.current = null;
    }
    activeMatchedFieldRef.current = { ruleKey, originalProperty, field };
    matchedSelectionRef.current = {
      ruleKey,
      originalProperty,
      field,
      start: event?.currentTarget.selectionStart ?? null,
      end: event?.currentTarget.selectionEnd ?? null,
    };
  };

  const captureMatchedSelection = (
    ruleKey: string,
    originalProperty: string,
    field: "key" | "value",
    event: React.SyntheticEvent<HTMLInputElement>,
  ) => {
    matchedSelectionRef.current = {
      ruleKey,
      originalProperty,
      field,
      start: event.currentTarget.selectionStart ?? null,
      end: event.currentTarget.selectionEnd ?? null,
    };
  };

  const scheduleMatchedFieldBlurCommit = (
    rule: AnnotatedMatchedRule,
    ruleKey: string,
    occurrenceIndex: number,
    originalProperty: string,
    field: "key" | "value",
  ) => {
    if (matchedBlurTimerRef.current !== null) {
      window.clearTimeout(matchedBlurTimerRef.current);
    }
    matchedBlurTimerRef.current = window.setTimeout(() => {
      matchedBlurTimerRef.current = null;
      const root = panelRootRef.current;
      const activeElement = document.activeElement;
      if (root && activeElement instanceof HTMLElement && root.contains(activeElement)) {
        if (
          activeElement.dataset.ruleKey === ruleKey &&
          activeElement.dataset.originalProperty === originalProperty
        ) {
          return;
        }
      }
      const activeMatchedField = activeMatchedFieldRef.current;
      if (
        activeMatchedField &&
        activeMatchedField.ruleKey === ruleKey &&
        activeMatchedField.originalProperty === originalProperty &&
        activeMatchedField.field === field
      ) {
        activeMatchedFieldRef.current = null;
      }
      commitMatchedDeclarationEdit(rule, ruleKey, occurrenceIndex);
    }, 0);
  };

  const deleteStyle = (index: number) => {
    if (index < 0 || index >= styles.length) return;
    const target = styles[index];
    delete styleDraftsRef.current[target.id];
    setStyles((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
    if (target?.key) {
      onUpdateStyle({
        [toReactName(target.key)]: "",
      } as Partial<React.CSSProperties>);
    }
  };

  const showKeySuggestions = (index: number) => {
    setFilteredSuggestions(filterAndSortProperties("", 20));
    setActiveSuggestionField({ index, type: "key" });
  };

  const showValueSuggestions = (index: number, key: string, value: string) => {
    const options = getValueOptions(key, value);
    if (!options.length) {
      setActiveSuggestionField(null);
      return;
    }
    setFilteredSuggestions(
      isFontFamilyProperty(key)
        ? (value.trim()
            ? options.filter((option) =>
                option.toLowerCase().startsWith(value.toLowerCase()),
              )
            : options)
        : filterRemSuggestions(
            value.trim()
              ? options.filter((option) =>
                  option.toLowerCase().startsWith(value.toLowerCase()),
                )
              : options,
          ),
    );
    setActiveSuggestionField({ index, type: "value" });
  };

  const handleStyleChange = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const current = styles[index];
    if (!current) return;
    
    const nextKey = field === "key" ? value : current.key;
    const nextValue = normalizeCssValueInput(
      field === "value" ? value : current.value,
    );
    const previousKey = current.key;

    // Update internal UI state
    updateStyleAtIndex(index, nextKey, nextValue);
    updateStyleDraftAtIndex(index, nextKey, nextValue, previousKey);
    
    // THIS IS THE TRIGGER
    pushStylePatchForRow(current, nextKey, nextValue, previousKey);

    // Suggestions logic...
    if (field === "key") {
      const matches = value.trim()
        ? CSS_PROPERTY_NAMES.filter((name) =>
            name.toLowerCase().includes(value.toLowerCase())
          ).slice(0, 15)
        : CSS_PROPERTY_NAMES.slice(0, 20);
      setFilteredSuggestions(matches);
      setActiveSuggestionField(matches.length ? { index, type: "key" } : null);
    } else {
      showValueSuggestions(index, nextKey, value);
    }
  };

  const handleNewPropertyChange = (field: "key" | "value", value: string) => {
    if (field === "key") {
      setNewPropName(value);
      const matches = filterAndSortProperties(value, 15);
      setFilteredSuggestions(matches);
      setActiveSuggestionField(
        matches.length ? { index: -1, type: "key" } : null,
      );
      return;
    }

    setNewPropValue(normalizeCssValueInput(value));
    const options = getValueOptions(newPropName, value);
    const matches = isFontFamilyProperty(newPropName)
      ? (value.trim()
          ? options.filter((option) =>
              option.toLowerCase().startsWith(value.toLowerCase()),
            )
          : options)
      : filterRemSuggestions(
          value.trim()
            ? options.filter((option) =>
                option.toLowerCase().startsWith(value.toLowerCase()),
              )
            : options,
        );
    setFilteredSuggestions(matches);
    setActiveSuggestionField(
      matches.length ? { index: -1, type: "value" } : null,
    );
  };

  const handleInlineStyleValueStep = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    style: StyleRow,
  ) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const next = adjustNumericValueAtCursor(
      style.value,
      event.currentTarget.selectionStart,
      event.key === "ArrowUp" ? 1 : -1,
      {
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      },
    );
    if (!next) return;
    event.preventDefault();
    const input = event.currentTarget;
    handleStyleChange(index, "value", next.value);
    window.requestAnimationFrame(() => {
      if (!input || !input.isConnected) return;
      try {
        input.setSelectionRange(next.selectionStart, next.selectionEnd);
      } catch {
        // Ignore selection restore failures on recycled inputs.
      }
    });
  };

  const handleMatchedDeclarationValueStep = (
    event: React.KeyboardEvent<HTMLInputElement>,
    rule: AnnotatedMatchedRule,
    occurrenceIndex: number,
  ) => {
    if (
      !editingMatchedDeclaration ||
      (event.key !== "ArrowUp" && event.key !== "ArrowDown")
    ) {
      return false;
    }
    const next = adjustNumericValueAtCursor(
      editingMatchedDeclaration.value,
      event.currentTarget.selectionStart,
      event.key === "ArrowUp" ? 1 : -1,
      {
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      },
    );
    if (!next) return false;
    event.preventDefault();
    const input = event.currentTarget;
    const nextDraft = {
      ...editingMatchedDeclaration,
      value: next.value,
    };
    matchedSelectionRef.current = {
      ruleKey: editingMatchedDeclaration.ruleKey,
      originalProperty: editingMatchedDeclaration.originalProperty,
      field: "value",
      start: next.selectionStart,
      end: next.selectionEnd,
    };
    setEditingMatchedDeclaration(nextDraft);
    pushMatchedDeclarationDraft(rule, occurrenceIndex, nextDraft);
    window.requestAnimationFrame(() => {
      if (!input || !input.isConnected) return;
      try {
        input.setSelectionRange(next.selectionStart, next.selectionEnd);
      } catch {
        // Ignore selection restore failures on recycled inputs.
      }
    });
    return true;
  };

  const handleNewPropertyValueStep = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const next = adjustNumericValueAtCursor(
      newPropValue,
      event.currentTarget.selectionStart,
      event.key === "ArrowUp" ? 1 : -1,
      {
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      },
    );
    if (!next) return;
    event.preventDefault();
    const input = event.currentTarget;
    handleNewPropertyChange("value", next.value);
    window.requestAnimationFrame(() => {
      if (!input || !input.isConnected) return;
      try {
        input.setSelectionRange(next.selectionStart, next.selectionEnd);
      } catch {
        // Ignore selection restore failures on recycled inputs.
      }
    });
  };

  const addProperty = () => {
    if (!newPropName.trim() || !newPropValue.trim()) return;
    const key = newPropName.trim();
    const value = normalizeCssValueInput(newPropValue.trim());
    onUpdateStyle({ [toReactName(key)]: value });
    const nextRow = { id: `style-row-${styleRowIdRef.current++}`, key, value };
    styleDraftsRef.current[nextRow.id] = { key, value, previousKey: key };
    setStyles((current) => [...current, nextRow]);
    setNewPropName("");
    setNewPropValue("");
    setActiveSuggestionField(null);
  };

  if (!element) {
    return (
      <div
        className="style-inspector-empty"
        style={{ background: "var(--bg-glass)", color: "var(--text-muted)" }}
      >
        <div
          className="style-inspector-empty-card"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-glass-strong)",
          }}
        >
          <AlertCircle className="style-inspector-empty-icon" size={22} />
          <p className="style-inspector-empty-title" style={{ color: "var(--text-main)" }}>
            Select an element
          </p>
          <p className="style-inspector-empty-copy">Its styles will show here.</p>
        </div>
      </div>
    );
  }

  return (
      <div
        ref={panelRootRef}
        className="style-inspector-panel"
      style={{
        background: "var(--bg-glass)",
        color: "var(--text-main)",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      }}
      onClick={() => setActiveSuggestionField(null)}
    >
      <div
        className="style-inspector-header"
        style={{
          borderColor: "var(--border-color)",
          background: "var(--bg-glass-strong)",
        }}
      >
        <div
          className="style-inspector-selector"
          style={{ color: "var(--text-main)" }}
        >
          {selectorLabel}
        </div>
        <div className="style-inspector-filter-wrap">
          <Search
            size={12}
            className="style-inspector-filter-icon"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Filter"
            className="style-inspector-filter-input"
            style={{
              borderColor: "var(--border-color)",
              background: "var(--input-bg)",
              color: "var(--text-main)",
            }}
          />
        </div>
      </div>

      <div className="style-inspector-body">
        {onUpdateIdentity ? (
          <div
            className="style-inspector-section"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="style-inspector-text-tools" style={{ fontSize: 12 }}>
              {showSelectorTokenInput ? (
                <input
                  value={selectorTokenDraft}
                  onChange={(event) =>
                    setSelectorTokenDraft(event.target.value)
                  }
                  onBlur={applySelectorTokenDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applySelectorTokenDraft();
                    if (event.key === "Escape") {
                      setSelectorTokenDraft("");
                      setShowSelectorTokenInput(false);
                    }
                  }}
                  placeholder=".new-class or #new-id"
                  className="w-full min-w-0 border-0 bg-transparent p-0 outline-none"
                  style={{ color: "var(--accent-primary)" }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSelectorTokenInput(true)}
                  className="style-inspector-text-tools"
                  style={{ color: "var(--text-muted)" }}
                  title="Add .class or #id"
                >
                  <Plus size={12} />
                  <span>Add .class or #id</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

        {selectionMode === "text" && onUpdateContent ? (
          <div
            className="style-inspector-section"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="style-inspector-text-tools">
              <button
                type="button"
                onClick={() => setShowHtmlEditor((current) => !current)}
                className="style-inspector-tool-button"
                style={{
                  borderColor: "color-mix(in srgb, var(--accent-primary) 24%, transparent)",
                  color: "var(--accent-primary)",
                  background: "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
                }}
              >
                Edit HTML
              </button>
              {onWrapTextTag ? (
                <button
                  type="button"
                  onClick={() =>
                  onToggleTextTag
                      ? onToggleTextTag("sup")
                      : onWrapTextTag("sup")
                  }
                  className="style-inspector-tool-button"
                  style={{
                    borderColor:
                      element?.type === "sup"
                        ? "color-mix(in srgb, var(--accent-primary) 24%, transparent)"
                        : "var(--border-color)",
                    color:
                      element?.type === "sup"
                        ? "var(--accent-primary)"
                        : "var(--text-main)",
                    background:
                      element?.type === "sup"
                        ? "color-mix(in srgb, var(--accent-primary) 10%, transparent)"
                        : "transparent",
                  }}
                  title="Wrap selected text in <sup>"
                >
                  Sup
                </button>
              ) : null}
              {onWrapTextTag ? (
                <button
                  type="button"
                  onClick={() =>
                  onToggleTextTag
                      ? onToggleTextTag("sub")
                      : onWrapTextTag("sub")
                  }
                  className="style-inspector-tool-button"
                  style={{
                    borderColor:
                      element?.type === "sub"
                        ? "color-mix(in srgb, var(--accent-primary) 24%, transparent)"
                        : "var(--border-color)",
                    color:
                      element?.type === "sub"
                        ? "var(--accent-primary)"
                        : "var(--text-main)",
                    background:
                      element?.type === "sub"
                        ? "color-mix(in srgb, var(--accent-primary) 10%, transparent)"
                        : "transparent",
                  }}
                  title="Wrap selected text in <sub>"
                >
                  Sub
                </button>
              ) : null}
            </div>
            {showHtmlEditor ? (
              <div className="style-inspector-group">
                <textarea
                  value={htmlDraft}
                  onChange={(event) => setHtmlDraft(event.target.value)}
                  className="style-inspector-html-editor"
                  style={{
                    borderColor: "var(--border-color)",
                    color: "var(--text-main)",
                    background: "var(--input-bg)",
                  }}
                />
                <div className="style-inspector-html-actions">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateContent({ html: htmlDraft });
                      setShowHtmlEditor(false);
                    }}
                    className="style-inspector-html-apply"
                    style={{
                      borderColor: "color-mix(in srgb, var(--accent-primary) 24%, transparent)",
                      color: "var(--accent-primary)",
                      background: "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
                    }}
                  >
                    Apply HTML
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : assetSource && onReplaceAsset ? (
          <div
            className="style-inspector-section"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div
              className="style-inspector-asset-preview"
              style={{
                borderColor: "color-mix(in srgb, var(--accent-primary) 20%, transparent)",
                background: "color-mix(in srgb, var(--accent-primary) 8%, transparent)",
              }}
            >
              <div
                className="style-inspector-asset-preview-frame"
                onMouseEnter={() => showAssetPreview(assetSource)}
                onMouseLeave={() => setHoveredAssetPreview(null)}
              >
                <img
                  src={assetPreviewSource || assetSource}
                  alt={getAssetLabel(assetSource) || "Selected asset"}
                  className="style-inspector-asset-image"
                />
              </div>
              <div
                className="style-inspector-asset-label"
                style={{
                  borderColor: "color-mix(in srgb, var(--accent-primary) 16%, transparent)",
                  color: "var(--text-muted)",
                }}
                title={assetSource}
              >
                {getAssetLabel(assetSource) || assetSource}
              </div>
            </div>
            <button
              type="button"
              onClick={onReplaceAsset}
              className="style-inspector-asset-button"
              style={{
                width: "100%",
                textAlign: "left",
                borderColor: "color-mix(in srgb, var(--accent-primary) 24%, transparent)",
                color: "var(--accent-primary)",
                background: "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
              }}
              title={assetSource}
            >
              Replace Asset
            </button>
          </div>
        ) : null}

        <div
          className="style-inspector-section"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="style-inspector-inline-heading" style={{ color: "var(--text-main)" }}>
            element.style {"{"}
          </div>

          <div className="style-inspector-group">
            {filteredStyles.map(({ style, index }) => {
              const cssKey = toCssName(style.key);
              const isSuperseded =
                inlineStyleLastIndexByKey.get(normalizeKey(style.key)) !== index;
              const colorInputValue = isColorProperty(cssKey)
                ? toColorInputValue(style.value)
                : null;
              return (
                <div
                  key={style.id}
                  className="style-inspector-inline-row--interactive"
                  style={{ opacity: isSuperseded ? 0.45 : 1 }}
                >
                  <div className="style-inspector-key-column">
                    <input
                      data-style-row-id={style.id}
                      data-style-field="key"
                      value={style.key}
                      onChange={(event) => {
                        captureInlineSelection(style.id, "key", event);
                        handleStyleChange(index, "key", event.target.value);
                      }}
                      onFocus={(event) => {
                        handleInlineFieldFocus(style.id, "key", event);
                        showKeySuggestions(index);
                      }}
                      onBlur={() => handleInlineFieldBlur(style.id, "key")}
                      onSelect={(event) =>
                        captureInlineSelection(style.id, "key", event)
                      }
                      onClick={(event) => event.stopPropagation()}
                      className="style-inspector-key-input"
                      style={{
                        color: "var(--accent-primary)",
                        textDecoration: isSuperseded ? "line-through" : "none",
                      }}
                    />
                    {activeSuggestionField?.index === index &&
                    activeSuggestionField.type === "key" ? (
                      <SuggestionList
                        suggestions={filteredSuggestions}
                        width="220px"
                        onSelect={(value) => {
                          updateStyleAtIndex(index, value, style.value);
                          updateStyleDraftAtIndex(
                            index,
                            value,
                            style.value,
                            style.key,
                          );
                          pushStylePatchForRow(
                            style,
                            value,
                            style.value,
                            style.key,
                          );
                          setActiveSuggestionField(null);
                        }}
                      />
                    ) : null}
                  </div>

                  <span style={{ color: "var(--text-muted)" }}>:</span>

                  <div className="style-inspector-value-inline">
                    {isColorProperty(cssKey) && colorInputValue ? (
                      <div
                        className="style-inspector-color-chip"
                        style={{
                          borderColor: "var(--border-color)",
                          background: style.value,
                        }}
                      >
                        <input
                          type="color"
                          value={colorInputValue}
                          onChange={(event) =>
                            handleStyleChange(
                              index,
                              "value",
                              event.target.value,
                            )
                          }
                          className="style-inspector-color-input"
                        />
                      </div>
                    ) : null}

                    <input
                      data-style-row-id={style.id}
                      data-style-field="value"
                      value={style.value}
                      onChange={(event) => {
                        captureInlineSelection(style.id, "value", event);
                        handleStyleChange(index, "value", event.target.value);
                      }}
                      onKeyDown={(event) =>
                        handleInlineStyleValueStep(event, index, style)
                      }
                      onFocus={(event) => {
                        handleInlineFieldFocus(style.id, "value", event);
                        showValueSuggestions(index, style.key, style.value);
                      }}
                      onBlur={() => handleInlineFieldBlur(style.id, "value")}
                      onSelect={(event) =>
                        captureInlineSelection(style.id, "value", event)
                      }
                      onClick={(event) => event.stopPropagation()}
                      className="style-inspector-value-input"
                      style={{
                        color: "var(--text-main)",
                        textDecoration: isSuperseded ? "line-through" : "none",
                      }}
                    />
                    {activeSuggestionField?.index === index &&
                    activeSuggestionField.type === "value" ? (
                      <SuggestionList
                        suggestions={filteredSuggestions}
                        onSelect={(value) => {
                          updateStyleAtIndex(index, style.key, value);
                          updateStyleDraftAtIndex(
                            index,
                            style.key,
                            value,
                            style.key,
                          );
                          pushStylePatchForRow(
                            style,
                            style.key,
                            value,
                            style.key,
                          );
                          setActiveSuggestionField(null);
                        }}
                      />
                    ) : null}
                  </div>

                  <span style={{ color: "var(--text-muted)" }}>;</span>
                  <button
                    type="button"
                    onClick={() => deleteStyle(index)}
                    className="style-inspector-delete-button"
                    title={`Delete ${cssKey}`}
                  >
                    <Trash2 size={12} style={{ color: "var(--text-muted)" }} />
                  </button>
                </div>
              );
            })}

            {filteredStyles.length === 0 ? (
              <div
                className="style-inspector-inline-row"
                style={{ color: "var(--text-muted)" }}
              >
                {filterText ? "No matching styles" : ""}
              </div>
            ) : null}

            <div className="style-inspector-inline-row">
              <div className="style-inspector-key-column">
                <input
                  value={newPropName}
                  onChange={(event) =>
                    handleNewPropertyChange("key", event.target.value)
                  }
                  onFocus={() => {
                    setFilteredSuggestions(filterAndSortProperties("", 20));
                    setActiveSuggestionField({ index: -1, type: "key" });
                  }}
                  onClick={(event) => event.stopPropagation()}
                  placeholder="property"
                  className="style-inspector-ghost-input"
                  style={{ color: "var(--accent-primary)" }}
                />
                {activeSuggestionField?.index === -1 &&
                activeSuggestionField.type === "key" ? (
                  <SuggestionList
                    suggestions={filteredSuggestions}
                    width="220px"
                    onSelect={(value) => {
                      setNewPropName(value);
                      setActiveSuggestionField(null);
                    }}
                  />
                ) : null}
              </div>

              <span style={{ color: "var(--text-muted)" }}>:</span>

              <div className="style-inspector-value-wrap">
                <input
                  value={newPropValue}
                  onChange={(event) =>
                    handleNewPropertyChange("value", event.target.value)
                  }
                  onFocus={() => {
                    const options = getValueOptions(newPropName, newPropValue);
                    setFilteredSuggestions(options);
                    setActiveSuggestionField(
                      options.length ? { index: -1, type: "value" } : null,
                    );
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                      handleNewPropertyValueStep(event);
                      return;
                    }
                    if (event.key === "Enter") addProperty();
                  }}
                  placeholder="value"
                  className="style-inspector-ghost-input"
                  style={{ color: "var(--text-main)" }}
                />
                {activeSuggestionField?.index === -1 &&
                activeSuggestionField.type === "value" ? (
                  <SuggestionList
                    suggestions={filteredSuggestions}
                    onSelect={(value) => {
                      setNewPropValue(value);
                      setActiveSuggestionField(null);
                    }}
                  />
                ) : null}
              </div>

              <span style={{ color: "var(--text-muted)" }}>;</span>
              <button type="button" onClick={addProperty} title="Add property">
                <Plus size={12} style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
          </div>

          <div
            className="style-inspector-inline-heading"
            style={{ color: "var(--text-main)" }}
          >
            {"}"}
          </div>
        </div>

        {orderedMatchedRules.map((rule, ruleIndex) =>
          (() => {
            const ruleKey = buildMatchedRuleInstanceKey(rule);
            const draft = ruleDrafts[ruleKey] || { key: "", value: "" };
            const occurrenceIndex = rule.occurrenceIndex;
            const hasResolvedActivity = rule.declarations.some(
              (declaration) => getDeclarationActiveState(declaration) !== undefined,
            );
            const activeDeclarationCount = rule.declarations.filter(
              (declaration) => getDeclarationActiveState(declaration),
            ).length;
            const isRuleInactive =
              hasResolvedActivity && activeDeclarationCount === 0;
            return (
              <div
                key={`${rule.selector}-${rule.source}-${ruleIndex}`}
                className="style-inspector-rule-section"
                style={{
                  borderColor: "var(--border-color)",
                  opacity: isRuleInactive ? 0.52 : 1,
                }}
              >
                <div className="style-inspector-rule-header">
                  <div className="style-inspector-rule-selector">
                    <SelectorText selector={rule.selector} element={element} />
                  </div>
                  <span
                    className="style-inspector-rule-source"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {rule.source}
                  </span>
                </div>
                <div className="style-inspector-rule-group">
                  {rule.declarations.map((declaration, declarationIndex) =>
                    editingMatchedDeclaration?.ruleKey === ruleKey &&
                    editingMatchedDeclaration.originalProperty ===
                      declaration.property ? (
                      (() => {
                        const declarationActive =
                          getDeclarationActiveState(declaration);
                        return (
                      <div
                        key={`${ruleKey}-${declaration.property}-${declarationIndex}`}
                        className="style-inspector-rule-row"
                        style={{
                          opacity:
                            declarationActive === false ? 0.48 : 1,
                        }}
                      >
                        <span
                          className="style-inspector-rule-indicator style-inspector-rule-indicator--top"
                          style={{
                            background:
                              declarationActive === true
                                ? "#14b8a6"
                                : declarationActive === false
                                  ? "rgba(148, 163, 184, 0.55)"
                                  : "rgba(14, 165, 233, 0.55)",
                          }}
                        />
                        <div className="style-inspector-rule-input-wrap">
                          <input
                            data-rule-key={ruleKey}
                            data-original-property={
                              editingMatchedDeclaration.originalProperty
                            }
                            data-matched-field="key"
                            value={editingMatchedDeclaration.property}
                            onChange={(event) => {
                              captureMatchedSelection(
                                ruleKey,
                                editingMatchedDeclaration.originalProperty,
                                "key",
                                event,
                              );
                              setEditingMatchedDeclaration((current) =>
                                current
                                  ? { ...current, property: event.target.value }
                                  : current,
                              );
                            }}
                            onFocus={(event) => {
                              handleMatchedFieldFocus(
                                ruleKey,
                                editingMatchedDeclaration.originalProperty,
                                "key",
                                event,
                              );
                              setFilteredSuggestions(
                                filterAndSortProperties("", 20),
                              );
                              setActiveSuggestionField({
                                index: -(ruleIndex + 2000),
                                type: "key",
                              });
                            }}
                            onBlur={() =>
                              scheduleMatchedFieldBlurCommit(
                                rule,
                                ruleKey,
                                occurrenceIndex,
                                editingMatchedDeclaration.originalProperty,
                                "key",
                              )
                            }
                            onSelect={(event) =>
                              captureMatchedSelection(
                                ruleKey,
                                editingMatchedDeclaration.originalProperty,
                                "key",
                                event,
                              )
                            }
                            className="style-inspector-key-input"
                            style={{ color: "var(--accent-primary)" }}
                            autoFocus={
                              editingMatchedDeclaration.focusField === "key"
                            }
                          />
                          {activeSuggestionField?.index ===
                            -(ruleIndex + 2000) &&
                          activeSuggestionField.type === "key" ? (
                            <SuggestionList
                              suggestions={filteredSuggestions}
                              width="220px"
                              onSelect={(value) => {
                                setEditingMatchedDeclaration((current) =>
                                  current
                                    ? { ...current, property: value }
                                    : current,
                                );
                                setActiveSuggestionField(null);
                              }}
                            />
                          ) : null}
                        </div>
                        <span style={{ color: "var(--text-muted)" }}>:</span>
                        <div className="style-inspector-rule-value-input-wrap">
                          <input
                            data-rule-key={ruleKey}
                            data-original-property={
                              editingMatchedDeclaration.originalProperty
                            }
                            data-matched-field="value"
                            value={editingMatchedDeclaration.value}
                            onChange={(event) => {
                              captureMatchedSelection(
                                ruleKey,
                                editingMatchedDeclaration.originalProperty,
                                "value",
                                event,
                              );
                              setEditingMatchedDeclaration((current) => {
                                if (!current) return current;
                                const next = {
                                  ...current,
                                  value: event.target.value,
                                };
                                pushMatchedDeclarationDraft(
                                  rule,
                                  occurrenceIndex,
                                  next,
                                );
                                return next;
                              });
                            }}
                            onFocus={(event) => {
                              handleMatchedFieldFocus(
                                ruleKey,
                                editingMatchedDeclaration.originalProperty,
                                "value",
                                event,
                              );
                              const options = getValueOptions(
                                editingMatchedDeclaration.property,
                                editingMatchedDeclaration.value,
                              );
                              setFilteredSuggestions(options);
                              setActiveSuggestionField(
                                options.length
                                  ? {
                                      index: -(ruleIndex + 2000),
                                      type: "value",
                                    }
                                  : null,
                              );
                            }}
                            onBlur={() =>
                              scheduleMatchedFieldBlurCommit(
                                rule,
                                ruleKey,
                                occurrenceIndex,
                                editingMatchedDeclaration.originalProperty,
                                "value",
                              )
                            }
                            onSelect={(event) =>
                              captureMatchedSelection(
                                ruleKey,
                                editingMatchedDeclaration.originalProperty,
                                "value",
                                event,
                              )
                            }
                            onKeyDown={(event) => {
                              if (
                                handleMatchedDeclarationValueStep(
                                  event,
                                  rule,
                                  occurrenceIndex,
                                )
                              ) {
                                return;
                              }
                              if (event.key === "Enter") {
                                commitMatchedDeclarationEdit(
                                  rule,
                                  ruleKey,
                                  occurrenceIndex,
                                );
                              }
                              if (event.key === "Escape") {
                                if (matchedBlurTimerRef.current !== null) {
                                  window.clearTimeout(matchedBlurTimerRef.current);
                                  matchedBlurTimerRef.current = null;
                                }
                                activeMatchedFieldRef.current = null;
                                setEditingMatchedDeclaration(null);
                                setActiveSuggestionField(null);
                              }
                            }}
                            className="style-inspector-value-input"
                            style={{ color: "var(--text-main)" }}
                            autoFocus={
                              editingMatchedDeclaration.focusField !== "key"
                            }
                          />
                          {activeSuggestionField?.index ===
                            -(ruleIndex + 2000) &&
                          activeSuggestionField.type === "value" ? (
                            <SuggestionList
                              suggestions={filteredSuggestions}
                              onSelect={(value) => {
                                setEditingMatchedDeclaration((current) => {
                                  if (!current) return current;
                                  const next = { ...current, value };
                                  pushMatchedDeclarationDraft(
                                    rule,
                                    occurrenceIndex,
                                    next,
                                  );
                                  return next;
                                });
                                setActiveSuggestionField(null);
                              }}
                            />
                          ) : null}
                        </div>
                        <span style={{ color: "var(--text-muted)" }}>;</span>
                      </div>
                        );
                      })()
                    ) : (
                      (() => {
                        const declarationActive =
                          getDeclarationActiveState(declaration);
                        const declarationKey = `${ruleKey}::${declaration.property}`;
                        const declarationPreview =
                          hoveredAssetPreview?.key === declarationKey
                            ? hoveredAssetPreview.src
                            : "";
                        return (
                      <div
                        key={`${ruleKey}-${declaration.property}-${declarationIndex}`}
                        className="style-inspector-rule-row style-inspector-rule-row--display"
                        style={{
                          opacity:
                            declarationActive === false ? 0.48 : 1,
                        }}
                        title={`${declaration.property}: ${declaration.value}${declaration.important ? " !important" : ""}`}
                      >
                        <span
                          className="style-inspector-rule-indicator style-inspector-rule-indicator--value"
                          style={{
                            background:
                              declarationActive === true
                                ? "#14b8a6"
                                : declarationActive === false
                                  ? "rgba(148, 163, 184, 0.55)"
                                  : "rgba(14, 165, 233, 0.55)",
                          }}
                        />
                        <span
                          className="style-inspector-rule-key style-inspector-rule-key--truncate"
                          style={{
                            color: "var(--accent-primary)",
                            textDecoration:
                              declarationActive === false
                                ? "line-through"
                                : "none",
                          }}
                          title={declaration.property}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            setEditingMatchedDeclaration({
                              ruleKey,
                              originalProperty: declaration.property,
                              property: declaration.property,
                              value: declaration.value,
                              isActive: declarationActive,
                              focusField: "key",
                            });
                          }}
                        >
                          {declaration.property}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>:</span>
                        <div className="style-inspector-rule-value-block">
                          <div className="style-inspector-rule-value-wrap">
                            <span
                              className="style-inspector-rule-value-text"
                              style={{
                                color: "var(--text-main)",
                                textDecoration:
                                  declarationActive === false
                                    ? "line-through"
                                    : "none",
                              }}
                              onMouseEnter={() =>
                                shouldPreviewDeclarationAsset(
                                  declaration.property,
                                  declaration.value,
                                )
                                  ? showAssetPreview(
                                      declaration.value,
                                      rule.source,
                                      declarationKey,
                                    )
                                  : undefined
                              }
                              onMouseLeave={() => setHoveredAssetPreview(null)}
                              title={`${declaration.property}: ${declaration.value}${declaration.important ? " !important" : ""}`}
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                setEditingMatchedDeclaration({
                                  ruleKey,
                                  originalProperty: declaration.property,
                                  property: declaration.property,
                                  value: declaration.value,
                                  isActive: declarationActive,
                                  focusField: "value",
                                });
                              }}
                            >
                              {declaration.value}
                              {declaration.important ? " !important" : ""};
                            </span>
                            {declarationPreview ? (
                              <div
                                className="style-inspector-rule-preview-popover"
                                style={{
                                  width: 132,
                                  background: "var(--bg-glass-strong)",
                                  borderColor: "var(--border-color)",
                                  boxShadow: "var(--glass-shadow)",
                                }}
                              >
                                <img
                                  src={declarationPreview}
                                  alt={getAssetLabel(declarationPreview) || "CSS asset preview"}
                                  className="style-inspector-rule-preview-image"
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                        );
                      })()
                    ),
                  )}

                  <div className="style-inspector-rule-row">
                    <div className="style-inspector-rule-input-wrap">
                      <input
                        value={draft.key}
                        onChange={(event) =>
                          setRuleDraftValue(ruleKey, "key", event.target.value)
                        }
                        onFocus={() => {
                          setFilteredSuggestions(
                            filterAndSortProperties("", 20),
                          );
                          setActiveSuggestionField({
                            index: -(ruleIndex + 2),
                            type: "key",
                          });
                        }}
                        onClick={(event) => event.stopPropagation()}
                        placeholder="property"
                        className="style-inspector-key-input"
                        style={{ color: "var(--accent-primary)" }}
                      />
                      {activeSuggestionField?.index === -(ruleIndex + 2) &&
                      activeSuggestionField.type === "key" ? (
                        <SuggestionList
                          suggestions={filteredSuggestions}
                          width="220px"
                          onSelect={(value) => {
                            setRuleDraftValue(ruleKey, "key", value);
                            setActiveSuggestionField(null);
                          }}
                        />
                      ) : null}
                    </div>
                    <span style={{ color: "var(--text-muted)" }}>:</span>
                    <div className="style-inspector-rule-value-input-wrap">
                      <input
                        value={draft.value}
                        onChange={(event) =>
                          setRuleDraftValue(
                            ruleKey,
                            "value",
                            event.target.value,
                          )
                        }
                        onFocus={() => {
                          const options = getValueOptions(draft.key, draft.value);
                          setFilteredSuggestions(options);
                          setActiveSuggestionField(
                            options.length
                              ? { index: -(ruleIndex + 2), type: "value" }
                              : null,
                          );
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter")
                            addRuleProperty(rule, ruleKey, occurrenceIndex);
                        }}
                        placeholder="value"
                        className="style-inspector-value-input"
                        style={{ color: "var(--text-main)" }}
                      />
                      {activeSuggestionField?.index === -(ruleIndex + 2) &&
                      activeSuggestionField.type === "value" ? (
                        <SuggestionList
                          suggestions={filteredSuggestions}
                          onSelect={(value) => {
                            setRuleDraftValue(ruleKey, "value", value);
                            setActiveSuggestionField(null);
                          }}
                        />
                      ) : null}
                    </div>
                    <span style={{ color: "var(--text-muted)" }}>;</span>
                    <button
                      type="button"
                      onClick={() =>
                        addRuleProperty(rule, ruleKey, occurrenceIndex)
                      }
                      title={`Add property using ${rule.source}`}
                    >
                      <Plus size={12} style={{ color: "var(--text-muted)" }} />
                    </button>
                  </div>
                </div>
                <div
                  className="style-inspector-inline-heading"
                  style={{ color: "var(--text-main)" }}
                >
                  {"}"}
                </div>
              </div>
            );
          })(),
        )}

        <div
          className="style-inspector-computed-shell"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            type="button"
            onClick={() => setShowComputed((current) => !current)}
            className="style-inspector-computed-toggle"
            style={{ color: "var(--text-main)" }}
          >
            <span>
              Computed{" "}
              {computedEntries.length ? `(${computedEntries.length})` : ""}
            </span>
            <ChevronDown
              size={12}
              className={`style-inspector-computed-chevron ${showComputed ? "style-inspector-computed-chevron--open" : ""}`}
            />
          </button>

          {showComputed ? (
            <div className="style-inspector-computed-body">
              {computedEntries.length ? (
                computedEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="style-inspector-computed-row"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    <span
                      className="style-inspector-computed-key"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      {entry.key}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>:</span>
                    <span
                      className="style-inspector-computed-value"
                      style={{ color: "var(--text-main)" }}
                    >
                      {entry.value};
                    </span>
                  </div>
                ))
              ) : (
                <div
                  className="style-inspector-computed-empty"
                  style={{ color: "var(--text-muted)" }}
                >
                  No computed styles available
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default StyleInspectorPanel;
