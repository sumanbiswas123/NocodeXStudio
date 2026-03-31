import type { CSSProperties } from "react";
import {
  normalizeFontFamilyCssValue,
  normalizeProjectRelative,
  toCssPropertyName,
} from "./appHelpers";

export type PreviewMatchedCssDeclaration = {
  property: string;
  value: string;
  important?: boolean;
  active?: boolean;
};

export type PreviewMatchedCssRule = {
  selector: string;
  source: string;
  declarations: PreviewMatchedCssDeclaration[];
};

export type PreviewMatchedRuleMutation = {
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

const toReactName = (key: string) =>
  key.trim().replace(/-([a-z])/g, (_match, char: string) =>
    char.toUpperCase(),
  );

export type CdpInspectSelectedResponse = {
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

  const elementMatches =
    (working.match(/(^|[\s>+~])([a-zA-Z][\w-]*|\*)/g) as string[] | null) ||
    [];
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

export const annotateMatchedCssRuleActivity = (
  element: Element,
  rules: PreviewMatchedCssRule[],
): PreviewMatchedCssRule[] => {
  const normalizedRules = rules.map((rule) => ({
    ...rule,
    declarations: dedupeExactRuleDeclarations(rule.declarations),
  }));
  type Winner = {
    important: boolean;
    specificity: CssSpecificity;
    ruleIndex: number;
    declarationIndex: number;
    inline: boolean;
  };

  const winnerByProperty = new Map<string, Winner>();

  normalizedRules.forEach((rule, ruleIndex) => {
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

  return normalizedRules.map((rule, ruleIndex) => ({
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

export const collectMatchedCssRulesFromElement = (
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

  return annotateMatchedCssRuleActivity(
    element,
    filterRedundantMatchedCssRules(results),
  );
};

export const getCssSourceBasename = (value: string) => {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .split("?")[0]
    .split("#")[0];
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
};

export const normalizeSelectorSignature = (value: string) =>
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

export const toReactComputedStylesFromCdp = (
  payload: CdpComputedStyleForNodeResult | undefined,
): CSSProperties | null => {
  const entries = Array.isArray(payload?.computedStyle)
    ? payload.computedStyle
    : [];
  if (entries.length === 0) return null;
  const out: Record<string, string> = {};
  entries.forEach((entry) => {
    if (!entry?.name || typeof entry.value !== "string") return;
    out[toReactName(entry.name)] = entry.value;
  });
  return out as CSSProperties;
};

export const derivePreviewMatchedCssRulesFromCdp = (
  payload: CdpMatchedStylesForNodeResult | undefined,
  fallbackRules: PreviewMatchedCssRule[],
  inlineStyles?: CSSProperties | null,
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

export const getStyleSheetSourceLabel = (sheet: CSSStyleSheet) => {
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

const isTemporaryMatchedRuleSource = (source: string) => {
  const normalized = String(source || "").trim().toLowerCase();
  return (
    normalized === "inline stylesheet" ||
    /^style-sheet-\d+-\d+$/.test(normalized)
  );
};

const buildMatchedRuleDeclarationSignature = (
  declarations: PreviewMatchedCssDeclaration[],
) =>
  declarations
    .map((declaration) => ({
      property: normalizeMatchedCssProperty(declaration.property),
      value: String(declaration.value || "").trim(),
      important: Boolean(declaration.important),
    }))
    .sort((left, right) => left.property.localeCompare(right.property))
    .map(
      (declaration) =>
        `${declaration.property}:${declaration.value}:${declaration.important ? "important" : ""}`,
    )
    .join("|");

export const filterRedundantMatchedCssRules = (
  rules: PreviewMatchedCssRule[],
): PreviewMatchedCssRule[] => {
  const canonicalKeys = new Set(
    rules
      .filter((rule) => !isTemporaryMatchedRuleSource(rule.source))
      .map(
        (rule) =>
          `${rule.selector}::${buildMatchedRuleDeclarationSignature(rule.declarations)}`,
      ),
  );

  return rules.filter((rule) => {
    if (!isTemporaryMatchedRuleSource(rule.source)) return true;
    const key = `${rule.selector}::${buildMatchedRuleDeclarationSignature(rule.declarations)}`;
    return !canonicalKeys.has(key);
  });
};

type LiveMatchedCssRuleRef = PreviewMatchedCssRule & {
  styleRule: CSSStyleRule;
};

export const collectLiveMatchedCssRuleRefsFromElement = (
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

export const cssRuleSourcesMatch = (left: string, right: string) => {
  const normalizedLeft = normalizeProjectRelative(String(left || "")).toLowerCase();
  const normalizedRight = normalizeProjectRelative(String(right || "")).toLowerCase();
  if (normalizedLeft && normalizedRight && normalizedLeft === normalizedRight) {
    return true;
  }
  const baseLeft = getCssSourceBasename(left).toLowerCase();
  const baseRight = getCssSourceBasename(right).toLowerCase();
  return Boolean(baseLeft && baseRight && baseLeft === baseRight);
};

export const extractAssetUrlFromCssValue = (raw: string) => {
  const text = String(raw || "").trim();
  if (!text) return "";
  const match = text.match(/url\((['"]?)(.*?)\1\)/i);
  if (!match?.[2]) return "";
  return match[2].trim();
};

export const normalizePresentationCssValue = (
  cssProperty: string,
  rawValue: unknown,
) => {
  const valueRaw =
    rawValue === undefined || rawValue === null ? "" : String(rawValue);
  const normalizedFontValue =
    cssProperty === "font-family"
      ? normalizeFontFamilyCssValue(valueRaw)
      : valueRaw;
  return normalizedFontValue.replace(
    /(-?(?:\d+\.?\d*|\.\d+))px\b/gi,
    (_match, amount) => `${amount}rem`,
  );
};

export const normalizePresentationStylePatch = (
  styles: Record<string, unknown>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(styles).map(([key, value]) => {
      const cssProperty = toCssPropertyName(key);
      return [key, normalizePresentationCssValue(cssProperty, value)];
    }),
  );

export const dedupeExactRuleDeclarations = (
  declarations: PreviewMatchedCssDeclaration[],
): PreviewMatchedCssDeclaration[] => {
  const seen = new Set<string>();
  return declarations.filter((declaration) => {
    const key = [
      normalizeMatchedCssProperty(declaration.property),
      String(declaration.value || "").trim(),
      declaration.important ? "important" : "",
    ].join("::");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const applyPatchToDeclarationEntries = (
  declarations: PreviewMatchedCssDeclaration[],
  rule: PreviewMatchedRuleMutation,
  styles: Partial<CSSProperties>,
): PreviewMatchedCssDeclaration[] => {
  const nextDeclarations = [...declarations];
  const normalizedNextKeys = new Set<string>();
  const originalCssProperty = rule.originalProperty
    ? toCssPropertyName(rule.originalProperty)
    : "";

  Object.entries(styles).forEach(([key, rawValue]) => {
    const cssProperty = toCssPropertyName(key);
    const value = normalizePresentationCssValue(cssProperty, rawValue);
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

export const findCssRuleRange = (
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
