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
  onImmediateChange?: (styles: Partial<React.CSSProperties>) => void;
  onUpdateIdentity?: (identity: { id: string; className: string }) => void;
  onReplaceAsset?: () => void;
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
};
type MatchedDeclarationDraft = {
  originalProperty: string;
  property: string;
  value: string;
};

const toCssName = (key: string) =>
  key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const toReactName = (key: string) =>
  key.trim().replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

const normalizeKey = (key: string) => toCssName(toReactName(key)).toLowerCase();

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

const isColorProperty = (key: string) =>
  /(color|fill|stroke)$/i.test(key) ||
  /background/i.test(key) ||
  /border-color/i.test(key);

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
        background: "#242822",
        borderColor: "#4d5447",
        boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
      }}
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="block w-full border-b px-2 py-1.5 text-left text-[12px] hover:bg-white/5"
          style={{ borderColor: "rgba(255,255,255,0.06)", color: "#d7dad4" }}
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
  onUpdateIdentity,
  onReplaceAsset,
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
        isActive: rule.declarations.some((declaration) => declaration.active),
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
    if (
      !editingMatchedDeclaration.property.trim() ||
      !editingMatchedDeclaration.value.trim() ||
      !onAddMatchedRuleProperty
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
      setEditingMatchedDeclaration(null);
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

  const selectorLabel = useMemo(() => buildSelectorLabel(element), [element]);
  const assetSource = useMemo(() => {
    if (!element) return "";
    if (typeof element.src === "string" && element.src.trim()) {
      return element.src.trim();
    }
    const backgroundImage =
      typeof element.styles?.backgroundImage === "string"
        ? String(element.styles.backgroundImage)
        : "";
    return extractUrlFromBackground(backgroundImage);
  }, [element]);

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
            const active = declaration.active ?? true;
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
    () => [...filteredMatchedRules].reverse(),
    [filteredMatchedRules],
  );

  // StyleInspectorPanel.tsx

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
    const options = CSS_PROPERTY_VALUES[toReactName(key)] || [];
    if (!options.length) {
      setActiveSuggestionField(null);
      return;
    }
    setFilteredSuggestions(
      value.trim()
        ? options.filter((option) =>
            option.toLowerCase().startsWith(value.toLowerCase()),
          )
        : options,
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
    const nextValue = field === "value" ? value : current.value;
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

    setNewPropValue(value);
    const options = CSS_PROPERTY_VALUES[toReactName(newPropName)] || [];
    const matches = value.trim()
      ? options.filter((option) =>
          option.toLowerCase().startsWith(value.toLowerCase()),
        )
      : options;
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
    handleStyleChange(index, "value", next.value);
    window.requestAnimationFrame(() => {
      event.currentTarget.setSelectionRange(
        next.selectionStart,
        next.selectionEnd,
      );
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
    const nextDraft = {
      ...editingMatchedDeclaration,
      value: next.value,
    };
    setEditingMatchedDeclaration(nextDraft);
    pushMatchedDeclarationDraft(rule, occurrenceIndex, nextDraft);
    window.requestAnimationFrame(() => {
      event.currentTarget.setSelectionRange(
        next.selectionStart,
        next.selectionEnd,
      );
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
    handleNewPropertyChange("value", next.value);
    window.requestAnimationFrame(() => {
      event.currentTarget.setSelectionRange(
        next.selectionStart,
        next.selectionEnd,
      );
    });
  };

  const addProperty = () => {
    if (!newPropName.trim() || !newPropValue.trim()) return;
    const key = newPropName.trim();
    const value = newPropValue.trim();
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
            background: "rgba(255,255,255,0.72)",
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
        background: "rgba(255,255,255,0.82)",
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
          background: "rgba(255,255,255,0.78)",
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
            style={{ color: "#8b9285" }}
          />
          <input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Filter"
            className="w-full border py-1 pl-7 pr-2 text-[12px] outline-none"
            style={{
              borderColor: "var(--border-color)",
              background: "rgba(255,255,255,0.9)",
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
                  style={{ color: "#0ea5e9" }}
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

        {assetSource && onReplaceAsset ? (
          <div
            className="border-b px-3 py-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <button
              type="button"
              onClick={onReplaceAsset}
              className="w-full rounded-md border px-2.5 py-2 text-left text-[12px] font-semibold transition-colors hover:bg-black/5"
              style={{
                borderColor: "rgba(14,165,233,0.24)",
                color: "#0e7490",
                background: "rgba(14,165,233,0.06)",
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
              return (
                <div
                  key={style.id}
                  className="group flex items-center gap-2 pl-4 text-[12px] min-w-0"
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
                      style={{ color: "#0ea5e9" }}
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
                    {isColorProperty(cssKey) ? (
                      <div
                        className="relative h-3 w-3 border"
                        style={{
                          borderColor: "var(--border-color)",
                          background: style.value,
                        }}
                      >
                        <input
                          type="color"
                          value={
                            /^#[0-9a-f]{6}$/i.test(style.value)
                              ? style.value
                              : "#000000"
                          }
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
                      style={{ color: "var(--text-main)" }}
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
                  style={{ color: "#0ea5e9" }}
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
                    const options =
                      CSS_PROPERTY_VALUES[toReactName(newPropName)] || [];
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
              (declaration) => declaration.active !== undefined,
            );
            const activeDeclarationCount = rule.declarations.filter(
              (declaration) => declaration.active,
            ).length;
            const isRuleInactive =
              hasResolvedActivity && activeDeclarationCount === 0;
            const ruleStatusLabel = hasResolvedActivity
              ? isRuleInactive
                ? "overridden"
                : "used"
              : "matched";
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
                    <span style={{ color: "var(--text-main)" }}>
                      {rule.selector} {"{"}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2 py-[1px] text-[10px] uppercase tracking-[0.12em]"
                      style={{
                        color:
                          ruleStatusLabel === "used"
                            ? "#0f766e"
                            : ruleStatusLabel === "overridden"
                              ? "#7c2d12"
                              : "var(--text-muted)",
                        background:
                          ruleStatusLabel === "used"
                            ? "rgba(20, 184, 166, 0.16)"
                            : ruleStatusLabel === "overridden"
                              ? "rgba(249, 115, 22, 0.14)"
                              : "rgba(148, 163, 184, 0.12)",
                      }}
                    >
                      {ruleStatusLabel}
                    </span>
                  </div>
                  <span
                    className="shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {rule.source}
                  </span>
                </div>
                <div className="mt-1 space-y-1">
                  {rule.declarations.map((declaration) =>
                    editingMatchedDeclaration?.ruleKey === ruleKey &&
                    editingMatchedDeclaration.originalProperty ===
                      declaration.property ? (
                      <div
                        key={`${rule.selector}-${declaration.property}`}
                        className="flex items-center gap-2 pl-4 text-[12px] min-w-0"
                        style={{
                          opacity: declaration.active ? 1 : 0.48,
                        }}
                      >
                        <span
                          className="mt-[1px] h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: declaration.active
                              ? "#14b8a6"
                              : "rgba(148, 163, 184, 0.55)",
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
                            style={{ color: "#0ea5e9" }}
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
                              const options =
                                CSS_PROPERTY_VALUES[
                                  toReactName(
                                    editingMatchedDeclaration.property,
                                  )
                                ] || [];
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
                            autoFocus
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
                    ) : (
                      <div
                        key={`${rule.selector}-${declaration.property}`}
                        className="flex items-start gap-2 pl-4 text-[12px] min-w-0"
                        style={{
                          opacity: declaration.active ? 1 : 0.48,
                        }}
                        onDoubleClick={() =>
                          setEditingMatchedDeclaration({
                            ruleKey,
                            originalProperty: declaration.property,
                            property: declaration.property,
                            value: declaration.value,
                            isActive: declaration.active,
                          })
                        }
                        title="Double click to edit"
                      >
                        <span
                          className="mt-[4px] h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: declaration.active
                              ? "#14b8a6"
                              : "rgba(148, 163, 184, 0.55)",
                          }}
                        />
                        <span
                          className="w-[84px] shrink-0 truncate"
                          style={{
                            color: "#0ea5e9",
                            textDecoration: declaration.active
                              ? "none"
                              : "line-through",
                          }}
                        >
                          {declaration.property}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>:</span>
                        <div className="min-w-0 flex flex-1 items-start gap-2">
                          <span
                            className="min-w-0 flex-1 truncate"
                            style={{
                              color: "var(--text-main)",
                              textDecoration: declaration.active
                                ? "none"
                                : "line-through",
                            }}
                          >
                            {declaration.value}
                            {declaration.important ? " !important" : ""};
                          </span>
                          <span
                            className="shrink-0 rounded-full px-2 py-[1px] text-[10px] uppercase tracking-[0.12em]"
                            style={{
                              color: declaration.active
                                ? "#0f766e"
                                : "#7c2d12",
                              background: declaration.active
                                ? "rgba(20, 184, 166, 0.16)"
                                : "rgba(249, 115, 22, 0.14)",
                            }}
                          >
                            {declaration.active ? "used" : "overridden"}
                          </span>
                        </div>
                      </div>
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
                        style={{ color: "#0ea5e9" }}
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
                          const options =
                            CSS_PROPERTY_VALUES[toReactName(draft.key)] || [];
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
                    style={{ borderColor: "rgba(15,23,42,0.08)" }}
                  >
                    <span
                      className="w-[84px] shrink-0 break-words"
                      style={{ color: "#0ea5e9" }}
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
