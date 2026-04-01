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
  sourcePath?: string;
  declarations: PreviewMatchedCssDeclaration[];
};

export type PreviewMatchedRuleMutation = {
  selector: string;
  source: string;
  sourcePath?: string;
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

const isElementLike = (value: unknown): value is Element =>
  Boolean(
    value &&
      typeof value === "object" &&
      (value as { nodeType?: unknown }).nodeType === 1 &&
      typeof (value as { matches?: unknown }).matches === "function",
  );

const isStyleHostLike = (
  value: unknown,
): value is Element & { style: CSSStyleDeclaration } =>
  isElementLike(value) &&
  typeof (value as { style?: unknown }).style === "object" &&
  value !== null;

const isCssStyleRuleLike = (
  value: unknown,
): value is CSSStyleRule & {
  selectorText: string;
  style: CSSStyleDeclaration;
} =>
  Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === 1 &&
      typeof (value as { selectorText?: unknown }).selectorText === "string" &&
      typeof (value as { style?: unknown }).style === "object",
  );

const hasNestedCssRules = (
  value: unknown,
): value is CSSRule & { cssRules: CSSRuleList } =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { cssRules?: unknown }).cssRules === "object",
  );

const isPreviewCssDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  const explicit = (window as any).__NX_DEBUG_PREVIEW_CSS;
  if (explicit === false) return false;
  return true;
};

const collectDuplicateDeclarationDebug = (
  declarations: PreviewMatchedCssDeclaration[],
) => {
  const counts = new Map<string, { count: number; values: string[] }>();
  declarations.forEach((declaration) => {
    const property = normalizeMatchedCssProperty(declaration.property);
    if (!property) return;
    const current = counts.get(property) || { count: 0, values: [] };
    current.count += 1;
    current.values.push(String(declaration.value || "").trim());
    counts.set(property, current);
  });
  return Array.from(counts.entries())
    .filter(([, meta]) => meta.count > 1)
    .map(([property, meta]) => ({
      property,
      count: meta.count,
      values: meta.values,
    }));
};

const debugPreviewCss = (label: string, payload: Record<string, unknown>) => {
  if (!isPreviewCssDebugEnabled()) return;
  console.groupCollapsed(`[PreviewCSSDebug] ${label}`);
  Object.entries(payload).forEach(([key, value]) => {
    console.log(key, value);
  });
  console.groupEnd();
};

const readCssSourceBasename = (value: string) => {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .split("?")[0]
    .split("#")[0];
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
};

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
  const normalizedRules = dedupeExactMatchedCssRules(
    rules.map((rule) => ({
      ...rule,
      declarations: dedupeExactRuleDeclarations(rule.declarations),
    })),
  );
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

  if (isStyleHostLike(element)) {
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

type InternalCollectedMatchedCssRule = PreviewMatchedCssRule & {
  __fromLiveOverride?: boolean;
};

export const collectMatchedCssRulesFromElement = (
  element: Element | null,
): PreviewMatchedCssRule[] => {
  if (
    !element ||
    !isElementLike(element) ||
    typeof element.matches !== "function"
  ) {
    return [];
  }

  const getSourceMeta = (sheet: CSSStyleSheet) => {
    if (sheet.href) {
      const cleanHref = String(sheet.href).split("?")[0].split("#")[0];
      const parts = cleanHref.split("/");
      return {
        source: parts[parts.length - 1] || cleanHref || "stylesheet",
        sourcePath: normalizeProjectRelative(cleanHref),
      };
    }
    const ownerNode = sheet.ownerNode;
    if (isElementLike(ownerNode)) {
      const source =
        ownerNode.getAttribute("data-source") ||
        ownerNode.getAttribute("data-href") ||
        ownerNode.getAttribute("data-nx-live-source") ||
        "";
      if (source) {
        const cleanSource = String(source).split("?")[0].split("#")[0];
        const parts = cleanSource.replace(/\\/g, "/").split("/");
        return {
          source: parts[parts.length - 1] || cleanSource || "stylesheet",
          sourcePath: normalizeProjectRelative(cleanSource),
        };
      }
    }
    return {
      source: "inline stylesheet",
      sourcePath: undefined,
    };
  };

  const results: InternalCollectedMatchedCssRule[] = [];

  const visitRules = (
    rules: CSSRuleList | undefined,
    source: string,
    sourcePath?: string,
    fromLiveOverride?: boolean,
  ) => {
    if (!rules) return;
    Array.from(rules).forEach((rule) => {
      try {
        const candidateRule = rule as CSSRule & {
          selectorText?: string;
          style?: CSSStyleDeclaration;
          cssRules?: CSSRuleList;
        };
        if (isCssStyleRuleLike(candidateRule)) {
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
            results.push({
              selector,
              source,
              sourcePath,
              declarations,
              __fromLiveOverride: Boolean(fromLiveOverride),
            });
          }
          return;
        }

        if (hasNestedCssRules(candidateRule)) {
          visitRules(
            candidateRule.cssRules,
            source,
            sourcePath,
            fromLiveOverride,
          );
        }
      } catch {
        // Ignore inaccessible or unsupported rules.
      }
    });
  };

  const doc = element.ownerDocument;
  if (!doc) return [];

  const styleSheets = Array.from(doc.styleSheets).map(
    (sheet) => sheet as CSSStyleSheet,
  );

  styleSheets.forEach((sheet) => {
    try {
      if (hasLiveOverrideForStyleSheet(sheet, styleSheets)) return;
      const sourceMeta = getSourceMeta(sheet);
      visitRules(
        sheet.cssRules,
        sourceMeta.source,
        sourceMeta.sourcePath,
        isPreviewLiveOverrideStylesheet(sheet),
      );
    } catch {
      // Ignore inaccessible stylesheet rules.
    }
  });

  const canonicalResults = collapseLiveOverrideMatchedCssRules(results);

  return annotateMatchedCssRuleActivity(
    element,
    filterRedundantMatchedCssRules(canonicalResults),
  );
};

export const getCssSourceBasename = (value: string) => {
  return readCssSourceBasename(value);
};

export const normalizeSelectorSignature = (value: string) =>
  String(value || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ")
    .trim();

const isTemporaryDerivedSource = (source: string) => {
  const normalized = String(source || "").trim().toLowerCase();
  return (
    normalized === "inline stylesheet" ||
    /^style-sheet-\d+-\d+$/.test(normalized)
  );
};

const buildDeclarationMatchKey = (
  declarations: PreviewMatchedCssDeclaration[],
) =>
  declarations
    .map((declaration) => normalizeMatchedCssProperty(declaration.property))
    .filter(Boolean)
    .sort()
    .join("|");

const selectorListsOverlap = (left: string, right: string) => {
  const leftSelectors = new Set(
    splitSelectorList(left).map((part) => normalizeSelectorSignature(part)),
  );
  const rightSelectors = splitSelectorList(right).map((part) =>
    normalizeSelectorSignature(part),
  );
  return rightSelectors.some((part) => leftSelectors.has(part));
};

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
      const exactFallbackIndex = fallbackRules.findIndex(
        (fallbackRule, fallbackIndex) =>
          unusedFallbackIndexes.has(fallbackIndex) &&
          normalizeSelectorSignature(fallbackRule.selector) ===
            normalizeSelectorSignature(selectorText),
      );
      const normalizedDerivedSource = getCssSourceBasename(source) || source;
      let matchingFallbackIndex = exactFallbackIndex;
      if (matchingFallbackIndex < 0 && isTemporaryDerivedSource(normalizedDerivedSource)) {
        const declarationKey = buildDeclarationMatchKey(declarations);
        matchingFallbackIndex = fallbackRules.findIndex(
          (fallbackRule, fallbackIndex) =>
            unusedFallbackIndexes.has(fallbackIndex) &&
            !isTemporaryDerivedSource(fallbackRule.source) &&
            selectorListsOverlap(fallbackRule.selector, selectorText) &&
            buildDeclarationMatchKey(fallbackRule.declarations) === declarationKey,
        );
      }
      if (matchingFallbackIndex < 0 && isTemporaryDerivedSource(normalizedDerivedSource)) {
        matchingFallbackIndex = fallbackRules.findIndex(
          (fallbackRule, fallbackIndex) =>
            unusedFallbackIndexes.has(fallbackIndex) &&
            !isTemporaryDerivedSource(fallbackRule.source) &&
            selectorListsOverlap(fallbackRule.selector, selectorText),
        );
      }
      if (matchingFallbackIndex >= 0) {
        source = fallbackRules[matchingFallbackIndex].source;
        unusedFallbackIndexes.delete(matchingFallbackIndex);
      } else {
        source = normalizedDerivedSource;
      }
      const sourcePath =
        matchingFallbackIndex >= 0
          ? fallbackRules[matchingFallbackIndex].sourcePath
          : undefined;

      return {
        selector: selectorText,
        source,
        sourcePath,
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
    sourcePath: rule.sourcePath,
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
  if (isElementLike(ownerNode)) {
    const source =
      ownerNode.getAttribute("data-source") ||
      ownerNode.getAttribute("data-href") ||
      ownerNode.getAttribute("data-nx-live-source") ||
      "";
    if (source) {
      const cleanSource = String(source).split("?")[0].split("#")[0];
      const parts = cleanSource.replace(/\\/g, "/").split("/");
      return parts[parts.length - 1] || cleanSource || "stylesheet";
    }
  }
  return "inline stylesheet";
};

const isPreviewLiveOverrideStylesheet = (sheet: CSSStyleSheet) => {
  const ownerNode = sheet.ownerNode;
  return (
    isElementLike(ownerNode) &&
    ownerNode.hasAttribute("data-nx-live-source")
  );
};

const styleSheetSourceCandidatesMatch = (left: string, right: string) => {
  const normalizedLeft = normalizeProjectRelative(String(left || "")).toLowerCase();
  const normalizedRight = normalizeProjectRelative(String(right || "")).toLowerCase();
  if (normalizedLeft && normalizedRight && normalizedLeft === normalizedRight) {
    return true;
  }
  const baseLeft = readCssSourceBasename(left).toLowerCase();
  const baseRight = readCssSourceBasename(right).toLowerCase();
  return Boolean(baseLeft && baseRight && baseLeft === baseRight);
};

const collectStyleSheetSourceCandidates = (sheet: CSSStyleSheet): string[] => {
  const candidates = new Set<string>();
  const pushCandidate = (raw: string | null | undefined) => {
    const text = String(raw || "").trim();
    if (!text) return;
    candidates.add(text);
    const clean = text.split("?")[0].split("#")[0];
    if (clean) {
      candidates.add(clean);
      candidates.add(normalizeProjectRelative(clean));
      const base = readCssSourceBasename(clean);
      if (base) candidates.add(base);
    }
    try {
      const parsed = new URL(text, window.location.href);
      const pathname = String(parsed.pathname || "").trim();
      if (!pathname) return;
      candidates.add(pathname);
      const normalizedPath = normalizeProjectRelative(pathname);
      if (normalizedPath) candidates.add(normalizedPath);
      const base = readCssSourceBasename(pathname);
      if (base) candidates.add(base);
    } catch {
      // Ignore values that are not URL-like.
    }
  };

  pushCandidate(sheet.href || "");
  const ownerNode = sheet.ownerNode;
  if (isElementLike(ownerNode)) {
    pushCandidate(ownerNode.getAttribute("data-source"));
    pushCandidate(ownerNode.getAttribute("data-href"));
    pushCandidate(ownerNode.getAttribute("data-nx-live-source"));
  }
  pushCandidate(getStyleSheetSourceLabel(sheet));

  return Array.from(candidates).filter(Boolean);
};

const hasLiveOverrideForStyleSheet = (
  target: CSSStyleSheet,
  allSheets: CSSStyleSheet[],
) => {
  if (isPreviewLiveOverrideStylesheet(target)) return false;
  const targetCandidates = collectStyleSheetSourceCandidates(target);
  if (targetCandidates.length === 0) return false;
  return allSheets.some((sheet) => {
    if (!isPreviewLiveOverrideStylesheet(sheet)) return false;
    const overrideCandidates = collectStyleSheetSourceCandidates(sheet);
    return overrideCandidates.some((overrideCandidate) =>
      targetCandidates.some((targetCandidate) =>
        styleSheetSourceCandidatesMatch(targetCandidate, overrideCandidate),
      ),
    );
  });
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

const buildMatchedRulePropertySignature = (
  declarations: PreviewMatchedCssDeclaration[],
) =>
  declarations
    .map((declaration) => normalizeMatchedCssProperty(declaration.property))
    .filter(Boolean)
    .sort()
    .join("|");

const buildExactMatchedRuleKey = (rule: PreviewMatchedCssRule) =>
  [
    normalizeProjectRelative(String(rule.sourcePath || rule.source || "")),
    normalizeSelectorSignature(rule.selector),
    buildMatchedRuleDeclarationSignature(rule.declarations),
  ].join("::");

export const dedupeExactMatchedCssRules = (
  rules: PreviewMatchedCssRule[],
): PreviewMatchedCssRule[] => {
  const seen = new Set<string>();
  const result: PreviewMatchedCssRule[] = [];
  rules.forEach((rule) => {
    const key = buildExactMatchedRuleKey(rule);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(rule);
  });
  return result;
};

export const canonicalizeEquivalentMatchedCssRules = (
  rules: PreviewMatchedCssRule[],
): PreviewMatchedCssRule[] => {
  const grouped = new Map<string, PreviewMatchedCssRule[]>();
  const orderedKeys: string[] = [];

  rules.forEach((rule) => {
    const key = [
      normalizeProjectRelative(String(rule.sourcePath || rule.source || "")),
      normalizeSelectorSignature(rule.selector),
      buildMatchedRulePropertySignature(rule.declarations),
    ].join("::");
    if (!grouped.has(key)) {
      grouped.set(key, []);
      orderedKeys.push(key);
    }
    grouped.get(key)?.push(rule);
  });

  return orderedKeys.map((key) => {
    const bucket = grouped.get(key) || [];
    if (bucket.length <= 1) return bucket[0];
    return bucket.reduce((best, candidate) => {
      const bestActiveCount = best.declarations.filter(
        (declaration) => declaration.active === true,
      ).length;
      const candidateActiveCount = candidate.declarations.filter(
        (declaration) => declaration.active === true,
      ).length;
      if (candidateActiveCount > bestActiveCount) return candidate;
      if (candidateActiveCount < bestActiveCount) return best;
      return candidate;
    });
  });
};

const collapseLiveOverrideMatchedCssRules = (
  rules: InternalCollectedMatchedCssRule[],
): PreviewMatchedCssRule[] => {
  const grouped = new Map<string, InternalCollectedMatchedCssRule[]>();
  const orderedKeys: string[] = [];

  rules.forEach((rule) => {
    const key = [
      normalizeProjectRelative(String(rule.sourcePath || rule.source || "")),
      normalizeSelectorSignature(rule.selector),
      buildMatchedRulePropertySignature(rule.declarations),
    ].join("::");
    if (!grouped.has(key)) {
      grouped.set(key, []);
      orderedKeys.push(key);
    }
    grouped.get(key)?.push(rule);
  });

  return orderedKeys.flatMap((key) => {
    const bucket = grouped.get(key) || [];
    if (bucket.length <= 1) {
      return bucket.map(({ __fromLiveOverride: _unused, ...rule }) => rule);
    }
    const liveOverrideRule = [...bucket]
      .reverse()
      .find((rule) => rule.__fromLiveOverride);
    if (!liveOverrideRule) {
      return bucket.map(({ __fromLiveOverride: _unused, ...rule }) => rule);
    }
    return [
      (({ __fromLiveOverride: _unused, ...rule }) => rule)(liveOverrideRule),
    ];
  });
};

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
    !isElementLike(element) ||
    typeof element.matches !== "function"
  ) {
    return [];
  }

  const results: LiveMatchedCssRuleRef[] = [];
  const visitRules = (
    rules: CSSRuleList | undefined,
    source: string,
    sourcePath?: string,
  ) => {
    if (!rules) return;
    Array.from(rules).forEach((rule) => {
      try {
        if (isCssStyleRuleLike(rule)) {
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
              sourcePath,
              declarations,
              styleRule: rule,
            });
          }
          return;
        }
        const nestedRule = rule as CSSRule & { cssRules?: CSSRuleList };
        if (hasNestedCssRules(nestedRule)) {
          visitRules(nestedRule.cssRules, source, sourcePath);
        }
      } catch {
        // Ignore inaccessible or unsupported rules.
      }
    });
  };

  const doc = element.ownerDocument;
  if (!doc) return [];

  const styleSheets = Array.from(doc.styleSheets).map(
    (sheet) => sheet as CSSStyleSheet,
  );

  styleSheets.forEach((sheet) => {
    try {
      if (hasLiveOverrideForStyleSheet(sheet, styleSheets)) return;
      const sourceLabel = getStyleSheetSourceLabel(sheet);
      let sourcePath: string | undefined;
      if (sheet.href) {
        sourcePath = normalizeProjectRelative(
          String(sheet.href).split("?")[0].split("#")[0],
        );
      } else {
        const ownerNode = sheet.ownerNode;
        if (isElementLike(ownerNode)) {
          const ownerSource =
            ownerNode.getAttribute("data-source") ||
            ownerNode.getAttribute("data-href") ||
            ownerNode.getAttribute("data-nx-live-source") ||
            "";
          if (ownerSource) {
            sourcePath = normalizeProjectRelative(ownerSource);
          }
        }
      }
      visitRules(sheet.cssRules, sourceLabel, sourcePath);
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
  const normalizedDeclarations = dedupeExactRuleDeclarations(declarations);
  const beforeDeclarations = normalizedDeclarations.map((declaration) => ({
    property: declaration.property,
    value: declaration.value,
    important: Boolean(declaration.important),
    active: declaration.active,
  }));
  const nextDeclarations = [...normalizedDeclarations];
  const normalizedNextKeys = new Set<string>();
  const desiredValuesByProperty = new Map<string, string>();
  const originalCssProperty = rule.originalProperty
    ? toCssPropertyName(rule.originalProperty)
    : "";

  Object.entries(styles).forEach(([key, rawValue]) => {
    const cssProperty = toCssPropertyName(key);
    const value = normalizePresentationCssValue(cssProperty, rawValue);
    normalizedNextKeys.add(cssProperty.toLowerCase());
    desiredValuesByProperty.set(cssProperty.toLowerCase(), value);
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

  const affectedProperties = new Set<string>(normalizedNextKeys);
  if (originalCssProperty) {
    affectedProperties.add(originalCssProperty.toLowerCase());
  }
  if (affectedProperties.size === 0) {
    return nextDeclarations;
  }

  const keepIndexByProperty = new Map<string, number>();
  affectedProperties.forEach((property) => {
    const matches = nextDeclarations
      .map((entry, index) => ({
        entry,
        index,
      }))
      .filter(
        ({ entry }) =>
          normalizeMatchedCssProperty(entry.property) === property,
      );
    if (matches.length === 0) return;

    const desiredValue = desiredValuesByProperty.get(property);
    const preferredMatch =
      desiredValue !== undefined
        ? [...matches]
            .reverse()
            .find(
              ({ entry }) => String(entry.value || "").trim() === desiredValue,
            ) || matches[matches.length - 1]
        : matches[matches.length - 1];
    keepIndexByProperty.set(property, preferredMatch.index);
  });

  const collapsedDeclarations = nextDeclarations.filter((entry, index) => {
    const property = normalizeMatchedCssProperty(entry.property);
    if (!affectedProperties.has(property)) return true;
    return keepIndexByProperty.get(property) === index;
  });

  debugPreviewCss("applyPatchToDeclarationEntries", {
    selector: rule.selector,
    source: rule.source,
    occurrenceIndex: rule.occurrenceIndex ?? 0,
    originalProperty: rule.originalProperty || "",
    styles,
    beforeDeclarations,
    afterDeclarations: collapsedDeclarations.map((declaration) => ({
      property: declaration.property,
      value: declaration.value,
      important: Boolean(declaration.important),
      active: declaration.active,
    })),
    duplicatePropertiesBefore: collectDuplicateDeclarationDebug(declarations),
    duplicatePropertiesAfterInitialNormalize:
      collectDuplicateDeclarationDebug(normalizedDeclarations),
    duplicatePropertiesAfter: collectDuplicateDeclarationDebug(collapsedDeclarations),
  });

  return collapsedDeclarations;
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
    
    const isMatch =
      headerText &&
      !headerText.startsWith("@") &&
      normalizeSelectorSignature(headerText) === normalizedSelector;

    if (isMatch) {
      if (currentOccurrence === occurrenceIndex) {
        const closeIndex = findMatchingCssBrace(source, index);
        if (closeIndex < 0) return null;
        const leadingWhitespace = rawHeader.match(/^\s*/)?.[0] || "";
        return {
          start: segmentStart,
          end: closeIndex + 1,
          selectorText: headerText, // Keep the original grouped selector!
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
