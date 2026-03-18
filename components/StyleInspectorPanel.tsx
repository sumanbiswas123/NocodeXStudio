import React, { useEffect, useMemo, useState } from "react";
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
  onUpdateIdentity?: (identity: { id: string; className: string }) => void;
  onReplaceAsset?: () => void;
  computedStyles?: React.CSSProperties | null;
  onAddMatchedRuleProperty?: (
    rule: { selector: string; source: string },
    styles: Partial<React.CSSProperties>,
  ) => void;
  matchedCssRules?: Array<{
    selector: string;
    source: string;
    declarations: Array<{
      property: string;
      value: string;
      important?: boolean;
    }>;
  }>;
}

type StyleRow = { key: string; value: string };
type SuggestionField = { index: number; type: "key" | "value" } | null;
type MatchedDeclaration = {
  property: string;
  value: string;
  important?: boolean;
};
type MatchedRule = NonNullable<StyleInspectorPanelProps["matchedCssRules"]>[number];
type EditingMatchedDeclaration = {
  ruleKey: string;
  originalProperty: string;
  property: string;
  value: string;
};

const toCssName = (key: string) =>
  key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const toReactName = (key: string) =>
  key.trim().replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

const normalizeKey = (key: string) => toCssName(toReactName(key)).toLowerCase();

const extractUrlFromBackground = (raw?: string) => {
  if (!raw || typeof raw !== "string") return "";
  const match = raw.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ? match[2] : "";
};

const buildSelectorLabel = (element: VirtualElement | null) => {
  if (!element) return "";
  const tag = String(element.type || element.name || "div").toLowerCase();
  const rawId = String(element.id || "").trim();
  const usableId =
    rawId && !/^preview-\d+/i.test(rawId) ? `#${rawId}` : "";
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

const getRuleSourcePriority = (source: string) => {
  const lower = source.toLowerCase();
  if (lower.includes("local.css")) return 0;
  if (lower.includes("custom-flow.css")) return 2;
  if (lower.includes("presentation.css")) return 3;
  if (lower.includes("core.css")) return 4;
  return 1;
};

const buildFontShorthandDeclaration = (
  declarations: MatchedDeclaration[]
): MatchedDeclaration | null => {
  const byProp = new Map(
    declarations.map((declaration) => [declaration.property, declaration])
  );
  if (byProp.has("font")) return null;

  const size = byProp.get("font-size")?.value?.trim();
  const family = byProp.get("font-family")?.value?.trim();
  if (!size || !family) return null;

  const style = byProp.get("font-style")?.value?.trim() || "normal";
  const variant = byProp.get("font-variant")?.value?.trim() || "normal";
  const weight = byProp.get("font-weight")?.value?.trim() || "normal";
  const stretch = byProp.get("font-stretch")?.value?.trim() || "normal";
  const lineHeight = byProp.get("line-height")?.value?.trim() || "normal";

  const prefixParts = [style, variant, weight, stretch].filter(
    (part) => part && part !== "normal"
  );
  const sizePart =
    lineHeight && lineHeight !== "normal" ? `${size}/${lineHeight}` : size;
  const value = [...prefixParts, sizePart, family].join(" ").trim();
  if (!value) return null;

  return {
    property: "font",
    value,
    important: declarations.some(
      (declaration) =>
        declaration.important &&
        (declaration.property.startsWith("font-") ||
          declaration.property === "line-height")
    ),
  };
};

const simplifyDeclarations = (declarations: MatchedDeclaration[]) => {
  const fontShorthand = buildFontShorthandDeclaration(declarations);
  const hiddenFontProps = new Set([
    "font-style",
    "font-variant",
    "font-weight",
    "font-stretch",
    "font-size",
    "line-height",
    "font-family",
    "font-variant-caps",
    "font-variant-ligatures",
    "font-variant-numeric",
    "font-variant-east-asian",
    "font-variant-alternates",
    "font-size-adjust",
    "font-language-override",
    "font-kerning",
    "font-optical-sizing",
    "font-feature-settings",
    "font-variation-settings",
    "font-variant-position",
    "font-variant-emoji",
  ]);

  const simplified = declarations.filter(
    (declaration) =>
      !(fontShorthand && hiddenFontProps.has(declaration.property))
  );

  return fontShorthand ? [...simplified, fontShorthand] : simplified;
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
}) => {
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
  const [editingMatchedDeclaration, setEditingMatchedDeclaration] =
    useState<EditingMatchedDeclaration | null>(null);

  useEffect(() => {
    if (!element) {
      setStyles([]);
      return;
    }
    setStyles(
      Object.entries(element.styles || {}).map(([key, value]) => ({
        key,
        value: String(value),
      }))
    );
    setNewPropName("");
    setNewPropValue("");
    setFilteredSuggestions([]);
    setActiveSuggestionField(null);
    setFilterText("");
    setShowSelectorTokenInput(false);
    setSelectorTokenDraft("");
    setRuleDrafts({});
    setEditingMatchedDeclaration(null);
  }, [element?.id, element?.styles]);

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

  const addRuleProperty = (rule: MatchedRule, ruleKey: string) => {
    const draft = ruleDrafts[ruleKey];
    if (!draft?.key?.trim() || !draft.value?.trim() || !onAddMatchedRuleProperty) {
      return;
    }
    onAddMatchedRuleProperty(
      { selector: rule.selector, source: rule.source },
      { [toReactName(draft.key.trim())]: draft.value.trim() },
    );
    setRuleDrafts((current) => ({
      ...current,
      [ruleKey]: { key: "", value: "" },
    }));
    setActiveSuggestionField(null);
  };

  const commitMatchedDeclarationEdit = (rule: MatchedRule, ruleKey: string) => {
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
      setEditingMatchedDeclaration(null);
      return;
    }
    onAddMatchedRuleProperty(
      { selector: rule.selector, source: rule.source },
      {
        [toReactName(editingMatchedDeclaration.property.trim())]:
          editingMatchedDeclaration.value.trim(),
      },
    );
    setEditingMatchedDeclaration(null);
    setActiveSuggestionField(null);
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
    if (!query) return styles;
    return styles.filter(
      (style) =>
        toCssName(style.key).toLowerCase().includes(query) ||
        style.value.toLowerCase().includes(query)
    );
  }, [filterText, styles]);

  const computedEntries = useMemo(() => {
    if (!computedStyles) return [];

    const explicitKeys = new Set(styles.map((style) => normalizeKey(style.key)));

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

  const filteredMatchedRules = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    return matchedCssRules
      .map((rule) => ({
        ...rule,
        declarations: simplifyDeclarations(
          query
            ? rule.declarations.filter(
                (declaration) =>
                  rule.selector.toLowerCase().includes(query) ||
                  rule.source.toLowerCase().includes(query) ||
                  declaration.property.toLowerCase().includes(query) ||
                  declaration.value.toLowerCase().includes(query)
              )
            : rule.declarations
        ),
      }))
      .filter((rule) => rule.declarations.length > 0);
  }, [filterText, matchedCssRules]);

  const orderedMatchedRules = useMemo(
    () =>
      [...filteredMatchedRules].sort((a, b) => {
        const priorityDiff =
          getRuleSourcePriority(a.source) - getRuleSourcePriority(b.source);
        if (priorityDiff !== 0) return priorityDiff;
        return a.source.localeCompare(b.source);
      }),
    [filteredMatchedRules]
  );

  const updateStyleAtIndex = (index: number, key: string, value: string) => {
    const nextStyles = [...styles];
    nextStyles[index] = { key, value };
    setStyles(nextStyles);
    onUpdateStyle({ [toReactName(key)]: value });
  };

  const deleteStyle = (index: number) => {
    const target = styles[index];
    setStyles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    if (target?.key) {
      onUpdateStyle({ [toReactName(target.key)]: "" } as Partial<React.CSSProperties>);
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
            option.toLowerCase().startsWith(value.toLowerCase())
          )
        : options
    );
    setActiveSuggestionField({ index, type: "value" });
  };

  const handleStyleChange = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const current = styles[index];
    const nextKey = field === "key" ? value : current.key;
    const nextValue = field === "value" ? value : current.value;

    updateStyleAtIndex(index, nextKey, nextValue);

    if (field === "key") {
      const matches = value.trim()
        ? CSS_PROPERTY_NAMES.filter((name) =>
            name.toLowerCase().includes(value.toLowerCase())
          ).slice(0, 15)
        : CSS_PROPERTY_NAMES.slice(0, 20);
      setFilteredSuggestions(matches);
      setActiveSuggestionField(matches.length ? { index, type: "key" } : null);
      return;
    }

    showValueSuggestions(index, nextKey, value);
  };

  const handleNewPropertyChange = (
    field: "key" | "value",
    value: string
  ) => {
    if (field === "key") {
      setNewPropName(value);
      const matches = filterAndSortProperties(value, 15);
      setFilteredSuggestions(matches);
      setActiveSuggestionField(matches.length ? { index: -1, type: "key" } : null);
      return;
    }

    setNewPropValue(value);
    const options = CSS_PROPERTY_VALUES[toReactName(newPropName)] || [];
    const matches = value.trim()
      ? options.filter((option) =>
          option.toLowerCase().startsWith(value.toLowerCase())
        )
      : options;
    setFilteredSuggestions(matches);
    setActiveSuggestionField(matches.length ? { index: -1, type: "value" } : null);
  };

  const addProperty = () => {
    if (!newPropName.trim() || !newPropValue.trim()) return;
    const key = newPropName.trim();
    const value = newPropValue.trim();
    onUpdateStyle({ [toReactName(key)]: value });
    setStyles((current) => [...current, { key, value }]);
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
          <p className="mt-1 text-xs leading-5">
            Its styles will show here.
          </p>
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
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
        <div className="truncate text-[12px]" style={{ color: "var(--text-main)" }}>
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
          <div className="border-b px-3 py-2" style={{ borderColor: "var(--border-color)" }}>
            <div className="flex items-center gap-2 text-[12px]">
              {showSelectorTokenInput ? (
                <input
                  value={selectorTokenDraft}
                  onChange={(event) => setSelectorTokenDraft(event.target.value)}
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
          <div className="border-b px-3 py-2" style={{ borderColor: "var(--border-color)" }}>
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

        <div className="border-b px-3 py-2" style={{ borderColor: "var(--border-color)" }}>
          <div className="text-[12px]" style={{ color: "var(--text-main)" }}>
            element.style {"{"}
          </div>

          <div className="mt-1 space-y-1">
            {filteredStyles.map((style) => {
              const index = styles.findIndex(
                (candidate) =>
                  candidate.key === style.key && candidate.value === style.value
              );
              const cssKey = toCssName(style.key);
              return (
              <div key={`${style.key}-${index}`} className="group flex items-center gap-2 pl-4 text-[12px] min-w-0">
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
                        style={{ borderColor: "var(--border-color)", background: style.value }}
                      >
                        <input
                          type="color"
                          value={
                            /^#[0-9a-f]{6}$/i.test(style.value)
                              ? style.value
                              : "#000000"
                          }
                          onChange={(event) =>
                            handleStyleChange(index, "value", event.target.value)
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
              <div className="pl-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
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
                    const options = CSS_PROPERTY_VALUES[toReactName(newPropName)] || [];
                    setFilteredSuggestions(options);
                    setActiveSuggestionField(
                      options.length ? { index: -1, type: "value" } : null
                    );
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
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
              <button
                type="button"
                onClick={addProperty}
                title="Add property"
              >
                <Plus size={12} style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
          </div>

          <div className="mt-1 text-[12px]" style={{ color: "var(--text-main)" }}>
            {"}"}
          </div>
        </div>

        {orderedMatchedRules.map((rule, ruleIndex) => (
          (() => {
            const ruleKey = `${rule.source}::${rule.selector}::${ruleIndex}`;
            const draft = ruleDrafts[ruleKey] || { key: "", value: "" };
            return (
          <div
            key={`${rule.selector}-${rule.source}-${ruleIndex}`}
            className="border-b px-3 py-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span style={{ color: "var(--text-main)" }}>{rule.selector} {"{"}</span>
              <span style={{ color: "var(--text-muted)" }}>{rule.source}</span>
            </div>
            <div className="mt-1 space-y-1">
              {rule.declarations.map((declaration) => (
                editingMatchedDeclaration?.ruleKey === ruleKey &&
                editingMatchedDeclaration.originalProperty === declaration.property ? (
                  <div
                    key={`${rule.selector}-${declaration.property}`}
                    className="flex items-center gap-2 pl-4 text-[12px] min-w-0"
                  >
                    <div className="relative w-[84px] shrink-0">
                      <input
                        value={editingMatchedDeclaration.property}
                        onChange={(event) =>
                          setEditingMatchedDeclaration((current) =>
                            current
                              ? { ...current, property: event.target.value }
                              : current
                          )
                        }
                        onFocus={() => {
                          setFilteredSuggestions(filterAndSortProperties("", 20));
                          setActiveSuggestionField({
                            index: -(ruleIndex + 2000),
                            type: "key",
                          });
                        }}
                        className="w-full border-0 bg-transparent p-0 outline-none"
                        style={{ color: "#0ea5e9" }}
                      />
                      {activeSuggestionField?.index === -(ruleIndex + 2000) &&
                      activeSuggestionField.type === "key" ? (
                        <SuggestionList
                          suggestions={filteredSuggestions}
                          width="220px"
                          onSelect={(value) => {
                            setEditingMatchedDeclaration((current) =>
                              current ? { ...current, property: value } : current
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
                          setEditingMatchedDeclaration((current) =>
                            current
                              ? { ...current, value: event.target.value }
                              : current
                          )
                        }
                        onFocus={() => {
                          const options =
                            CSS_PROPERTY_VALUES[
                              toReactName(editingMatchedDeclaration.property)
                            ] || [];
                          setFilteredSuggestions(options);
                          setActiveSuggestionField(
                            options.length
                              ? { index: -(ruleIndex + 2000), type: "value" }
                              : null,
                          );
                        }}
                        onBlur={() => commitMatchedDeclarationEdit(rule, ruleKey)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitMatchedDeclarationEdit(rule, ruleKey);
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
                      {activeSuggestionField?.index === -(ruleIndex + 2000) &&
                      activeSuggestionField.type === "value" ? (
                        <SuggestionList
                          suggestions={filteredSuggestions}
                          onSelect={(value) => {
                            setEditingMatchedDeclaration((current) =>
                              current ? { ...current, value } : current
                            );
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
                    onDoubleClick={() =>
                      setEditingMatchedDeclaration({
                        ruleKey,
                        originalProperty: declaration.property,
                        property: declaration.property,
                        value: declaration.value,
                      })
                    }
                    title="Double click to edit"
                  >
                    <span
                      className="w-[84px] shrink-0 truncate"
                      style={{ color: "#0ea5e9" }}
                    >
                      {declaration.property}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>:</span>
                    <span
                      className="min-w-0 flex-1 truncate"
                      style={{ color: "var(--text-main)" }}
                    >
                      {declaration.value}
                      {declaration.important ? " !important" : ""};
                    </span>
                  </div>
                )
              ))}

              <div className="flex items-center gap-2 pl-4 text-[12px]">
                <div className="relative w-[84px] shrink-0">
                  <input
                    value={draft.key}
                    onChange={(event) =>
                      setRuleDraftValue(ruleKey, "key", event.target.value)
                    }
                    onFocus={() => {
                      setFilteredSuggestions(filterAndSortProperties("", 20));
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
                      setRuleDraftValue(ruleKey, "value", event.target.value)
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
                      if (event.key === "Enter") addRuleProperty(rule, ruleKey);
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
                  onClick={() => addRuleProperty(rule, ruleKey)}
                  title={`Add property using ${rule.source}`}
                >
                  <Plus size={12} style={{ color: "var(--text-muted)" }} />
                </button>
              </div>
            </div>
            <div className="mt-1 text-[12px]" style={{ color: "var(--text-main)" }}>
              {"}"}
            </div>
          </div>
            );
          })()
        ))}

        <div className="border-b" style={{ borderColor: "var(--border-color)" }}>
          <button
            type="button"
            onClick={() => setShowComputed((current) => !current)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px]"
            style={{ color: "var(--text-main)" }}
          >
            <span>Computed {computedEntries.length ? `(${computedEntries.length})` : ""}</span>
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
                <div className="pl-4 pt-1" style={{ color: "var(--text-muted)" }}>
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
