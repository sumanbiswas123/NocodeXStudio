import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { VirtualElement } from "../types";
import {
  CSS_PROPERTY_NAMES,
  CSS_PROPERTY_VALUES,
  filterAndSortProperties,
} from "../utils/cssProperties";

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
      occurrenceIndex?: number;
      originalProperty?: string;
      isActive?: boolean;
    },
    styles: Partial<React.CSSProperties>,
  ) => void;
  matchedCssRules?: Array<{
    selector: string;
    source: string;
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

const buildMatchedRuleInstanceKey = (
  rule: { selector: string; source: string; occurrenceIndex: number },
) => `${rule.source}::${rule.selector}::${rule.occurrenceIndex}`;

const buildMatchedDeclarationDraftKey = (
  rule: { selector: string; source: string; occurrenceIndex: number },
  originalProperty: string,
) =>
  `${buildMatchedRuleInstanceKey(rule)}::${normalizeKey(originalProperty)}`;

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
      className="absolute top-full left-0 z-50 mt-1 max-h-44 overflow-y-auto no-scrollbar border"
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
          className="block w-full border-b px-2 py-1.5 text-left text-[12px] hover:bg-white/5"
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
  const styleRowIdRef = useRef(0);
  const stylesRef = useRef<StyleRow[]>([]);
  const styleDraftsRef = useRef<
    Record<string, { key: string; value: string; previousKey?: string }>
  >({});
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
    return () => {
      styleDraftsRef.current = {};
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
    if (
      !editingMatchedDeclaration ||
      editingMatchedDeclaration.ruleKey !== ruleKey
    ) {
      return;
    }
    if (!onAddMatchedRuleProperty) {
      setEditingMatchedDeclaration(null);
      return;
    }
    if (
      !editingMatchedDeclaration.property.trim() ||
      !editingMatchedDeclaration.value.trim()
    ) {
      const clearedDraftKey = buildMatchedDeclarationDraftKey(
        rule,
        editingMatchedDeclaration.originalProperty,
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
          occurrenceIndex,
          originalProperty: editingMatchedDeclaration.originalProperty,
          isActive: editingMatchedDeclaration.isActive,
        },
        {
          [toReactName(editingMatchedDeclaration.originalProperty)]: "",
        },
      );
      setEditingMatchedDeclaration(null);
      setActiveSuggestionField(null);
      return;
    }
    onAddMatchedRuleProperty(
      {
        selector: rule.selector,
        source: rule.source,
        occurrenceIndex,
        originalProperty: editingMatchedDeclaration.originalProperty,
        isActive: editingMatchedDeclaration.isActive,
      },
      {
        [toReactName(editingMatchedDeclaration.property.trim())]:
          editingMatchedDeclaration.value.trim(),
      },
    );
    setEditingMatchedDeclaration(null);
    setActiveSuggestionField(null);
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
      occurrenceIndex,
    };
    const draftKey = buildMatchedDeclarationDraftKey(
      draftRule,
      originalProperty,
    );
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
          return filteredDeclarations;
        })(),
      }))
      .filter((rule) => rule.declarations.length > 0);
  }, [annotatedMatchedRules, filterText, matchedDeclarationDrafts]);

  const orderedMatchedRules = useMemo(
    () =>
      [...filteredMatchedRules]
        .reverse()
        .sort((left, right) => {
          const leftInternal = isInternalPreviewHelperRule(left);
          const rightInternal = isInternalPreviewHelperRule(right);
          if (leftInternal === rightInternal) return 0;
          return leftInternal ? 1 : -1;
        }),
    [filteredMatchedRules],
  );

  const matchedDeclarationActivity = useMemo(() => {
    type Winner = {
      important: boolean;
      ruleIndex: number;
      declarationIndex: number;
      inline: boolean;
    };

    const resolved = new Map<string, boolean | undefined>();
    const winnerByProperty = new Map<string, Winner>();
    const toDeclarationKey = (
      rule: { selector: string; source: string; occurrenceIndex: number },
      declarationIndex: number,
    ) => `${buildMatchedRuleInstanceKey(rule)}::${declarationIndex}`;

    const applyWinner = (property: string, candidate: Winner) => {
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
    };

    filteredMatchedRules.forEach((rule, ruleIndex) => {
      rule.declarations.forEach((declaration, declarationIndex) => {
        const declarationKey = toDeclarationKey(rule, declarationIndex);
        if (declaration.active !== undefined) {
          resolved.set(declarationKey, declaration.active);
        }
        const property = normalizeKey(declaration.property);
        if (!property) return;
        applyWinner(property, {
          important: Boolean(declaration.important),
          ruleIndex,
          declarationIndex,
          inline: false,
        });
      });
    });

    styles.forEach((style, index) => {
      const property = normalizeKey(style.key);
      if (!property || !String(style.value || "").trim()) return;
      applyWinner(property, {
        important: /\s!important\s*$/i.test(String(style.value)),
        ruleIndex: Number.MAX_SAFE_INTEGER,
        declarationIndex: index,
        inline: true,
      });
    });

    filteredMatchedRules.forEach((rule, ruleIndex) => {
      rule.declarations.forEach((declaration, declarationIndex) => {
        const declarationKey = toDeclarationKey(rule, declarationIndex);
        if (resolved.has(declarationKey)) return;
        const property = normalizeKey(declaration.property);
        const winner = property ? winnerByProperty.get(property) : undefined;
        resolved.set(
          declarationKey,
          Boolean(winner) &&
            !winner?.inline &&
            winner.ruleIndex === ruleIndex &&
            winner.declarationIndex === declarationIndex,
        );
      });
    });

    return resolved;
  }, [filteredMatchedRules, styles]);

  const getDeclarationActiveState = (
    rule: { selector: string; source: string; occurrenceIndex: number },
    declarationIndex: number,
  ) =>
    matchedDeclarationActivity.get(
      `${buildMatchedRuleInstanceKey(rule)}::${declarationIndex}`,
    );

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
        className="h-full px-4 py-5"
        style={{ background: "var(--bg-glass)", color: "var(--text-muted)" }}
      >
        <div
          className="flex h-full flex-col items-center justify-center border px-6 text-center"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-glass-strong)",
          }}
        >
          <AlertCircle className="mb-3 opacity-60" size={22} />
          <p className="text-sm" style={{ color: "var(--text-main)" }}>
            Select an element
          </p>
          <p className="mt-1 text-xs leading-5">Its styles will show here.</p>
        </div>
      </div>
    );
  }

  return (
      <div
        className="flex h-full flex-col overflow-hidden"
      style={{
        background: "var(--bg-glass)",
        color: "var(--text-main)",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      }}
      onClick={() => setActiveSuggestionField(null)}
    >
      <div
        className="shrink-0 border-b px-3 py-2"
        style={{
          borderColor: "var(--border-color)",
          background: "var(--bg-glass-strong)",
        }}
      >
        <div
          className="truncate text-[12px]"
          style={{ color: "var(--text-main)" }}
        >
          {selectorLabel}
        </div>
        <div className="mt-2 relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Filter"
            className="w-full border py-1 pl-7 pr-2 text-[12px] outline-none"
            style={{
              borderColor: "var(--border-color)",
              background: "var(--input-bg)",
              color: "var(--text-main)",
            }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {onUpdateIdentity ? (
          <div
            className="border-b px-3 py-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex items-center gap-2 text-[12px]">
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
                  className="flex items-center gap-1"
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
            className="border-b px-3 py-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHtmlEditor((current) => !current)}
                className="rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-black/5"
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
                  className="rounded-md border px-2 py-1.5 text-[12px] transition-colors hover:bg-black/5"
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
                  className="rounded-md border px-2 py-1.5 text-[12px] transition-colors hover:bg-black/5"
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
              <div className="mt-2">
                <textarea
                  value={htmlDraft}
                  onChange={(event) => setHtmlDraft(event.target.value)}
                  className="min-h-[88px] w-full resize-y rounded-md border p-2 text-[12px] outline-none"
                  style={{
                    borderColor: "var(--border-color)",
                    color: "var(--text-main)",
                    background: "var(--input-bg)",
                  }}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateContent({ html: htmlDraft });
                      setShowHtmlEditor(false);
                    }}
                    className="rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-black/5"
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
            className="border-b px-3 py-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div
              className="mb-2 overflow-hidden rounded-md border"
              style={{
                borderColor: "color-mix(in srgb, var(--accent-primary) 20%, transparent)",
                background: "color-mix(in srgb, var(--accent-primary) 8%, transparent)",
              }}
            >
              <div
                className="flex items-center justify-center px-2 py-2"
                onMouseEnter={() => showAssetPreview(assetSource)}
                onMouseLeave={() => setHoveredAssetPreview(null)}
              >
                <img
                  src={assetPreviewSource || assetSource}
                  alt={getAssetLabel(assetSource) || "Selected asset"}
                  className="block max-h-[72px] w-auto max-w-full object-contain"
                />
              </div>
              <div
                className="border-t px-2 py-1 text-[11px] truncate"
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
              className="w-full rounded-md border px-2.5 py-2 text-left text-[12px] font-semibold transition-colors hover:bg-black/5"
              style={{
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
          className="border-b px-3 py-2"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="text-[12px]" style={{ color: "var(--text-main)" }}>
            element.style {"{"}
          </div>

          <div className="mt-1 space-y-1">
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
                  className="group flex items-center gap-2 pl-4 text-[12px] min-w-0"
                  style={{ opacity: isSuperseded ? 0.45 : 1 }}
                >
                  <div className="relative w-[84px] shrink-0">
                    <input
                      value={style.key}
                      onChange={(event) =>
                        handleStyleChange(index, "key", event.target.value)
                      }
                      onFocus={() => showKeySuggestions(index)}
                      onClick={(event) => event.stopPropagation()}
                      className="w-full border-0 bg-transparent p-0 outline-none"
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

                  <div className="relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    {isColorProperty(cssKey) && colorInputValue ? (
                      <div
                        className="relative h-3 w-3 border"
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
                          className="absolute inset-0 opacity-0"
                        />
                      </div>
                    ) : null}

                    <input
                      value={style.value}
                      onChange={(event) =>
                        handleStyleChange(index, "value", event.target.value)
                      }
                      onKeyDown={(event) =>
                        handleInlineStyleValueStep(event, index, style)
                      }
                      onFocus={() =>
                        showValueSuggestions(index, style.key, style.value)
                      }
                      onClick={(event) => event.stopPropagation()}
                      className="w-full min-w-0 truncate border-0 bg-transparent p-0 outline-none"
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
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    title={`Delete ${cssKey}`}
                  >
                    <Trash2 size={12} style={{ color: "var(--text-muted)" }} />
                  </button>
                </div>
              );
            })}

            {filteredStyles.length === 0 ? (
              <div
                className="pl-4 text-[12px]"
                style={{ color: "var(--text-muted)" }}
              >
                {filterText ? "No matching styles" : ""}
              </div>
            ) : null}

            <div className="flex items-center gap-2 pl-4 text-[12px]">
              <div className="relative w-[84px] shrink-0">
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
                  className="w-full border-0 bg-transparent p-0 outline-none"
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

              <div className="relative min-w-0 flex-1">
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
                  className="w-full min-w-0 border-0 bg-transparent p-0 outline-none"
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
            className="mt-1 text-[12px]"
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
              (_declaration, declarationIndex) =>
                getDeclarationActiveState(rule, declarationIndex) !== undefined,
            );
            const activeDeclarationCount = rule.declarations.filter(
              (_declaration, declarationIndex) =>
                getDeclarationActiveState(rule, declarationIndex),
            ).length;
            const isRuleInactive =
              hasResolvedActivity && activeDeclarationCount === 0;
            return (
              <div
                key={`${rule.selector}-${rule.source}-${ruleIndex}`}
                className="border-b px-3 py-2"
                style={{
                  borderColor: "var(--border-color)",
                  opacity: isRuleInactive ? 0.52 : 1,
                }}
              >
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <SelectorText selector={rule.selector} element={element} />
                  </div>
                  <span
                    className="shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {rule.source}
                  </span>
                </div>
                <div className="mt-1 space-y-1">
                  {rule.declarations.map((declaration, declarationIndex) =>
                    editingMatchedDeclaration?.ruleKey === ruleKey &&
                    editingMatchedDeclaration.originalProperty ===
                      declaration.property ? (
                      (() => {
                        const declarationActive = getDeclarationActiveState(
                          rule,
                          declarationIndex,
                        );
                        return (
                      <div
                        key={`${ruleKey}-${declaration.property}-${declarationIndex}`}
                        className="flex items-center gap-2 pl-4 text-[12px] min-w-0"
                        style={{
                          opacity:
                            declarationActive === false ? 0.48 : 1,
                        }}
                      >
                        <span
                          className="mt-[1px] h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background:
                              declarationActive === true
                                ? "#14b8a6"
                                : declarationActive === false
                                  ? "rgba(148, 163, 184, 0.55)"
                                  : "rgba(14, 165, 233, 0.55)",
                          }}
                        />
                        <div className="relative w-[84px] shrink-0">
                          <input
                            value={editingMatchedDeclaration.property}
                            onChange={(event) =>
                              setEditingMatchedDeclaration((current) =>
                                current
                                  ? { ...current, property: event.target.value }
                                  : current,
                              )
                            }
                            onFocus={() => {
                              setFilteredSuggestions(
                                filterAndSortProperties("", 20),
                              );
                              setActiveSuggestionField({
                                index: -(ruleIndex + 2000),
                                type: "key",
                              });
                            }}
                            className="w-full border-0 bg-transparent p-0 outline-none"
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
                        <div className="relative min-w-0 flex-1">
                          <input
                            value={editingMatchedDeclaration.value}
                            onChange={(event) =>
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
                              })
                            }
                            onFocus={() => {
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
                              commitMatchedDeclarationEdit(
                                rule,
                                ruleKey,
                                occurrenceIndex,
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
                                setEditingMatchedDeclaration(null);
                                setActiveSuggestionField(null);
                              }
                            }}
                            className="w-full min-w-0 border-0 bg-transparent p-0 outline-none"
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
                        const declarationActive = getDeclarationActiveState(
                          rule,
                          declarationIndex,
                        );
                        const declarationKey = `${ruleKey}::${declaration.property}`;
                        const declarationPreview =
                          hoveredAssetPreview?.key === declarationKey
                            ? hoveredAssetPreview.src
                            : "";
                        return (
                      <div
                        key={`${ruleKey}-${declaration.property}-${declarationIndex}`}
                        className="flex items-start gap-2 pl-4 text-[12px] min-w-0"
                        style={{
                          opacity:
                            declarationActive === false ? 0.48 : 1,
                        }}
                        title={`${declaration.property}: ${declaration.value}${declaration.important ? " !important" : ""}`}
                      >
                        <span
                          className="mt-[4px] h-2 w-2 shrink-0 rounded-full"
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
                          className="w-[84px] shrink-0 truncate"
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
                        <div className="min-w-0 flex flex-1 items-start gap-2">
                          <div className="relative min-w-0 flex-1">
                            <span
                              className="min-w-0 block truncate"
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
                                className="pointer-events-none absolute left-0 top-full z-20 mt-1 overflow-hidden rounded-md border p-2"
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
                                  className="block h-auto max-h-[84px] w-full rounded object-contain"
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

                  <div className="flex items-center gap-2 pl-4 text-[12px]">
                    <div className="relative w-[84px] shrink-0">
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
                        className="w-full border-0 bg-transparent p-0 outline-none"
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
                    <div className="relative min-w-0 flex-1">
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
                        className="w-full min-w-0 border-0 bg-transparent p-0 outline-none"
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
                  className="mt-1 text-[12px]"
                  style={{ color: "var(--text-main)" }}
                >
                  {"}"}
                </div>
              </div>
            );
          })(),
        )}

        <div
          className="border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            type="button"
            onClick={() => setShowComputed((current) => !current)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px]"
            style={{ color: "var(--text-main)" }}
          >
            <span>
              Computed{" "}
              {computedEntries.length ? `(${computedEntries.length})` : ""}
            </span>
            <ChevronDown
              size={12}
              className={`transition-transform ${showComputed ? "rotate-180" : ""}`}
            />
          </button>

          {showComputed ? (
            <div className="px-3 pb-2 text-[12px]">
              {computedEntries.length ? (
                computedEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-start gap-2 border-t py-1 pl-4 min-w-0"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    <span
                      className="w-[84px] shrink-0 break-words"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      {entry.key}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>:</span>
                    <span
                      className="min-w-0 flex-1 break-words whitespace-pre-wrap"
                      style={{ color: "var(--text-main)" }}
                    >
                      {entry.value};
                    </span>
                  </div>
                ))
              ) : (
                <div
                  className="pl-4 pt-1"
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
