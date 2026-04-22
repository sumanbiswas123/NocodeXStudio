import { useCallback } from "react";
import type React from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { FileMap, ProjectFile, VirtualElement } from "../../../types";
import {
  findFilePathCaseInsensitive,
  getParentPath,
  joinPath,
  normalizePath,
  normalizeProjectRelative,
  parseInlineStyleText,
  readElementByPath,
  relativePathBetweenVirtualFiles,
  resolveProjectRelativePath,
  rewriteInlineAssetRefs,
  toCssPropertyName,
} from "../../helpers/appHelpers";
import {
  annotateMatchedCssRuleActivity,
  applyPatchToDeclarationEntries,
  collectLiveMatchedCssRuleRefsFromElement,
  cssRuleSourcesMatch,
  findCssRuleRange,
  getCssSourceBasename,
  getStyleSheetSourceLabel,
  normalizePresentationCssValue,
  normalizeSelectorSignature,
  type PreviewMatchedCssDeclaration,
  type PreviewMatchedCssRule,
  type PreviewMatchedRuleMutation,
} from "../../helpers/previewCssHelpers";

type PersistPreviewHtmlContentFn = (
  path: string,
  html: string,
  options?: Record<string, unknown>,
) => Promise<void>;

type UsePreviewCssMutationOptions = {
  dirtyFilesRef: MutableRefObject<string[]>;
  ensureDirectoryTreeStable: (path: string) => Promise<void> | void;
  extractMountRelativePath: (locationPath: string) => string | null;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  filesRef: MutableRefObject<FileMap>;
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  invalidatePreviewDocsForDependency: (dependencyPath: string) => void;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  pendingPreviewWritesRef: MutableRefObject<Record<string, string>>;
  persistPreviewHtmlContent: PersistPreviewHtmlContentFn;
  postPreviewPatchToFrame: (payload: Record<string, unknown>) => void;
  previewFrameRef: MutableRefObject<HTMLIFrameElement | null>;
  previewLocalCssDraftPendingRef: MutableRefObject<{
    elementPath: number[];
    rule: PreviewMatchedRuleMutation;
    styles: Partial<React.CSSProperties>;
  } | null>;
  previewLocalCssDraftTimerRef: MutableRefObject<number | null>;
  previewMatchedRuleEditAtRef: MutableRefObject<number>;
  previewMatchedRuleEditRef: MutableRefObject<{
    at: number;
    selector: string;
    source: string;
    sourcePath?: string;
    occurrenceIndex: number;
  } | null>;
  previewSelectedElement: VirtualElement | null;
  previewSelectedPath: number[] | null;
  resolveVirtualPathFromMountRelative: (
    mountRelativePath: string,
  ) => string | null;
  schedulePreviewAutoSave: () => void;
  pushPreviewHistory: (
    filePath: string,
    nextHtml: string,
    previousHtml?: string,
  ) => void;
  selectedPreviewHtml: string | null;
  selectedPreviewHtmlRef: MutableRefObject<string | null>;
  setDirtyFiles: Dispatch<SetStateAction<string[]>>;
  setFiles: Dispatch<SetStateAction<FileMap>>;
  setPreviewSelectedElement: Dispatch<SetStateAction<VirtualElement | null>>;
  setPreviewSelectedMatchedCssRules: Dispatch<
    SetStateAction<PreviewMatchedCssRule[]>
  >;
  syncPreviewSelectionSnapshotFromLiveElement: (
    elementPath: number[],
  ) => boolean;
  textFileCacheRef: MutableRefObject<Record<string, string>>;
};

export const usePreviewCssMutation = ({
  dirtyFilesRef,
  ensureDirectoryTreeStable,
  extractMountRelativePath,
  filePathIndexRef,
  filesRef,
  getLivePreviewSelectedElement,
  invalidatePreviewDocsForDependency,
  loadFileContent,
  pendingPreviewWritesRef,
  persistPreviewHtmlContent,
  postPreviewPatchToFrame,
  previewFrameRef,
  previewLocalCssDraftPendingRef,
  previewLocalCssDraftTimerRef,
  previewMatchedRuleEditAtRef,
  previewMatchedRuleEditRef,
  previewSelectedElement,
  previewSelectedPath,
  resolveVirtualPathFromMountRelative,
  schedulePreviewAutoSave,
  pushPreviewHistory,
  selectedPreviewHtml,
  selectedPreviewHtmlRef,
  setDirtyFiles,
  setFiles,
  setPreviewSelectedElement,
  setPreviewSelectedMatchedCssRules,
  syncPreviewSelectionSnapshotFromLiveElement,
  textFileCacheRef,
}: UsePreviewCssMutationOptions) => {
  const debugMatchedRuleWrite = (
    sourceLabel: string,
    nextRules: PreviewMatchedCssRule[],
  ) => {
    if (typeof window === "undefined") return;
    if ((window as any).__NX_DEBUG_PREVIEW_CSS === false) return;
    console.log("[PreviewCSSDebug] matched-rule-write", {
      source: sourceLabel,
      ruleCount: nextRules.length,
      rules: nextRules.map((rule) => ({
        selector: rule.selector,
        source: rule.source,
        sourcePath: rule.sourcePath || "",
        activeCount: rule.declarations.filter(
          (declaration) => declaration.active === true,
        ).length,
        declarationCount: rule.declarations.length,
      })),
    });
  };
  const matchedRuleSourceIdentityMatches = (
    left: { source: string; sourcePath?: string },
    right: { source: string; sourcePath?: string },
  ) => {
    const leftPath = String(left.sourcePath || "").trim();
    const rightPath = String(right.sourcePath || "").trim();
    if (leftPath || rightPath) {
      return cssRuleSourcesMatch(leftPath || left.source, rightPath || right.source);
    }
    return cssRuleSourcesMatch(left.source, right.source);
  };

  const isPreviewCssDebugEnabled = () => {
    if (typeof window === "undefined") return false;
    const explicit = (window as any).__NX_DEBUG_PREVIEW_CSS;
    if (explicit === false) return false;
    return true;
  };

  const debugPreviewCssMutation = (
    label: string,
    payload: Record<string, unknown>,
  ) => {
    if (!isPreviewCssDebugEnabled()) return;
    console.log(`[PreviewCSSDebug] ${label}`, payload);
    console.groupCollapsed(`[PreviewCSSDebug] ${label}`);
    Object.entries(payload).forEach(([key, value]) => {
      console.log(key, value);
    });
    console.groupEnd();
  };

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
        const value = normalizePresentationCssValue(
          cssKey,
          rawValue,
          frameDocument,
        );

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
      previewFrameRef,
      previewSelectedPath,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
  );

  const clearPreviewInlineStylePropertiesAtPath = useCallback(
    (elementPath: number[], styles: Partial<React.CSSProperties>) => {
      if (!Array.isArray(elementPath) || elementPath.length === 0) return;
      const liveTarget = getLivePreviewSelectedElement(elementPath);
      if (!(liveTarget instanceof HTMLElement)) return;
      Object.keys(styles).forEach((key) => {
        const cssKey = toCssPropertyName(key);
        liveTarget.style.removeProperty(cssKey);
      });
      if (!liveTarget.getAttribute("style")?.trim()) {
        liveTarget.removeAttribute("style");
      }
      debugPreviewCssMutation("clearPreviewInlineStylePropertiesAtPath", {
        elementPath,
        clearedProperties: Object.keys(styles).map((key) =>
          toCssPropertyName(key),
        ),
        resultingInlineStyle: liveTarget.getAttribute("style") || "",
      });
    },
    [debugPreviewCssMutation, getLivePreviewSelectedElement],
  );

  const resolvePreviewMatchedRuleSourcePath = useCallback(
    (source?: string | null) => {
      const rawSource = String(source || "").trim();
      let directSourcePathCandidate = normalizeProjectRelative(rawSource);
      if (rawSource) {
        try {
          const parsedUrl = new URL(rawSource, window.location.href);
          const mountRelative = extractMountRelativePath(parsedUrl.pathname);
          if (mountRelative) {
            const virtualPath =
              resolveVirtualPathFromMountRelative(mountRelative) ||
              mountRelative;
            if (virtualPath) {
              directSourcePathCandidate = normalizeProjectRelative(virtualPath);
            }
          }
        } catch {
          // Ignore non-URL sources and continue with normalized input.
        }
      }
      const normalizedSource = normalizeProjectRelative(String(source || ""));
      const sourceBasename = getCssSourceBasename(source).toLowerCase();

      const directSourcePathMatch =
        findFilePathCaseInsensitive(filesRef.current, directSourcePathCandidate) ||
        (filesRef.current[directSourcePathCandidate]?.type === "css"
          ? directSourcePathCandidate
          : null);
      if (directSourcePathMatch) {
        return directSourcePathMatch;
      }

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
              .filter(
                (candidate) => filesRef.current[candidate]?.type === "css",
              )
              .filter((candidate) => cssRuleSourcesMatch(candidate, source));
            if (linkedCssCandidates.length === 1) {
              return linkedCssCandidates[0];
            }
          } catch {
            // Ignore malformed HTML and continue to broader lookup.
          }
        }

        if (sourceBasename === "local.css") {
          const activeDir = selectedPreviewHtml.includes("/")
            ? selectedPreviewHtml.slice(0, selectedPreviewHtml.lastIndexOf("/"))
            : "";
          const siblingLocalCss = normalizeProjectRelative(
            activeDir ? `${activeDir}/css/local.css` : "css/local.css",
          );
          const siblingLocalCssMatch =
            findFilePathCaseInsensitive(filesRef.current, siblingLocalCss) ||
            (filesRef.current[siblingLocalCss]?.type === "css"
              ? siblingLocalCss
              : null);
          if (siblingLocalCssMatch) {
            return siblingLocalCssMatch;
          }
        }
      }

      const exactMatch =
        findFilePathCaseInsensitive(filesRef.current, normalizedSource) ||
        (filesRef.current[normalizedSource]?.type === "css"
          ? normalizedSource
          : null);
      if (exactMatch && filesRef.current[exactMatch]?.type === "css") {
        return exactMatch;
      }

      const normalizedSuffix = normalizedSource.toLowerCase();
      const candidates = Object.keys(filesRef.current).filter((path) => {
        if (filesRef.current[path]?.type !== "css") return false;
        const normalizedPath = normalizeProjectRelative(path).toLowerCase();
        if (normalizedSuffix && normalizedPath.endsWith(normalizedSuffix)) {
          return true;
        }
        return getCssSourceBasename(path).toLowerCase() === sourceBasename;
      });

      // --- CRITICAL FIX: Smart Tie-Breaker ---
      if (candidates.length === 1) return candidates[0];

      if (candidates.length > 1 && selectedPreviewHtml) {
        // If there are multiple local.css files, find the one in the same folder as the HTML
        const activeDir = selectedPreviewHtml.includes("/")
          ? selectedPreviewHtml.slice(0, selectedPreviewHtml.lastIndexOf("/"))
          : "";

        const closestMatch = candidates.find((c) => {
          const cDir = c.includes("/") ? c.slice(0, c.lastIndexOf("/")) : "";
          return cDir === activeDir;
        });

        if (closestMatch) return closestMatch;

        return candidates[0]; // Better to guess the first one than to fail to inline styles
      }

      return null;
    },
    [filesRef, selectedPreviewHtml, textFileCacheRef],
  );

  const ensurePreviewMatchedRuleSourceLoaded = useCallback(
    async (rule: PreviewMatchedRuleMutation) => {
      const sourcePath = resolvePreviewMatchedRuleSourcePath(
        rule.sourcePath || rule.source,
      );
      if (!sourcePath) return null;

      const sourceText =
        typeof textFileCacheRef.current[sourcePath] === "string"
          ? textFileCacheRef.current[sourcePath]
          : typeof filesRef.current[sourcePath]?.content === "string"
            ? (filesRef.current[sourcePath]?.content as string)
            : "";
      if (sourceText) return sourcePath;

      try {
        const loaded = await loadFileContent(sourcePath, {
          persistToState: false,
        });
        if (typeof loaded === "string" && loaded.length > 0) {
          textFileCacheRef.current[sourcePath] = loaded;
          return sourcePath;
        }
      } catch {
        // Ignore helper load failures and fall through to direct filesystem access.
      }

      const absolutePath = filePathIndexRef.current[sourcePath];
      if (absolutePath) {
        try {
          const loaded = await (Neutralino as any).filesystem.readFile(
            absolutePath,
          );
          if (typeof loaded === "string" && loaded.length > 0) {
            textFileCacheRef.current[sourcePath] = loaded;
            return sourcePath;
          }
        } catch {
          // Ignore direct filesystem access failures.
        }
      }

      return null;
    },
    [
      filePathIndexRef,
      filesRef,
      loadFileContent,
      resolvePreviewMatchedRuleSourcePath,
      textFileCacheRef,
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
      const resolvedRuleSource = resolvePreviewMatchedRuleSourcePath(
        rule.sourcePath || rule.source,
      );
      const originalCssProperty = rule.originalProperty
        ? toCssPropertyName(rule.originalProperty)
        : "";
      const nextCssKeys = new Set(
        Object.keys(styles).map((key) => toCssPropertyName(key).toLowerCase()),
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
          const value = normalizePresentationCssValue(
            cssKey,
            rawValue,
            frameDocument,
          );
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
            matchedRuleSourceIdentityMatches(candidate, rule) ||
            matchedRuleSourceIdentityMatches(candidate, {
              source: resolvedRuleSource || "",
              sourcePath: resolvedRuleSource || "",
            });
          if (!matchesSource) return false;
          if (remainingLiveOccurrence > 0) {
            remainingLiveOccurrence -= 1;
            return false;
          }
          return true;
        });
        if (liveMatchedRule) {
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
                if (
                  !liveElement.matches(
                    String(cssRule.selectorText || "").trim(),
                  )
                ) {
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
          const ownerNode = styleSheet.ownerNode;
          if (
            ownerNode instanceof Element &&
            ownerNode.hasAttribute("data-nx-live-source")
          ) {
            continue;
          }
          const styleSheetCandidates = new Set<string>();
          const styleSheetSource = getStyleSheetSourceLabel(styleSheet);
          if (styleSheetSource) {
            styleSheetCandidates.add(styleSheetSource);
            styleSheetCandidates.add(
              normalizeProjectRelative(styleSheetSource),
            );
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
                  styleSheetCandidates.add(
                    normalizeProjectRelative(virtualPath),
                  );
                }
              }
            } catch {
              // Ignore malformed stylesheet URLs.
            }
          }
          const matchesSource = Array.from(styleSheetCandidates).some(
            (candidate) =>
              matchedRuleSourceIdentityMatches(
                { source: candidate, sourcePath: candidate },
                rule,
              ) ||
              matchedRuleSourceIdentityMatches(
                { source: candidate, sourcePath: candidate },
                {
                  source: resolvedRuleSource || "",
                  sourcePath: resolvedRuleSource || "",
                },
              ),
          );
          if (!matchesSource) {
            collectSelectorMatches(styleSheet.cssRules);
            continue;
          }
          if (visitRules(styleSheet.cssRules)) {
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
      extractMountRelativePath,
      getLivePreviewSelectedElement,
      previewFrameRef,
      resolvePreviewMatchedRuleSourcePath,
      resolveVirtualPathFromMountRelative,
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

      const previewDocument =
        getLivePreviewSelectedElement(elementPath)?.ownerDocument ||
        previewFrameRef.current?.contentDocument ||
        previewFrameRef.current?.contentWindow?.document ||
        null;
      setPreviewSelectedMatchedCssRules((current) => {
        const beforeRuleSnapshot = current.find(
          (currentRule) =>
            matchedRuleSourceIdentityMatches(currentRule, rule) &&
            normalizeSelectorSignature(currentRule.selector) ===
              normalizeSelectorSignature(rule.selector),
        );
        let remainingOccurrence = Math.max(0, rule.occurrenceIndex || 0);
        let didPatchRule = false;
        const nextRules = current.map((currentRule) => {
          if (
            !matchedRuleSourceIdentityMatches(currentRule, rule) ||
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

        const afterRuleSnapshot = nextRules.find(
          (currentRule) =>
            matchedRuleSourceIdentityMatches(currentRule, rule) &&
            normalizeSelectorSignature(currentRule.selector) ===
              normalizeSelectorSignature(rule.selector),
        );

        debugPreviewCssMutation("applyPreviewMatchedRuleOptimisticState", {
          selector: rule.selector,
          source: rule.source,
          occurrenceIndex: rule.occurrenceIndex ?? 0,
          originalProperty: rule.originalProperty || "",
          styles,
          beforeRuleDeclarations: beforeRuleSnapshot?.declarations || [],
          afterRuleDeclarations: afterRuleSnapshot?.declarations || [],
          didPatchRule,
        });

        if (!didPatchRule) return current;
        debugMatchedRuleWrite("OPTIMISTIC_EDIT:apply-next", nextRules);
        return nextRules;
      });
    },
    [
      debugPreviewCssMutation,
      getLivePreviewSelectedElement,
      previewSelectedPath,
      setPreviewSelectedMatchedCssRules,
    ],
  );

  const applyMoveDraftInspectorState = useCallback(
    (
      elementPath: number[],
      selector: string,
      styles: Partial<React.CSSProperties>,
      sourcePath: string,
    ) => {
      const pathMatchesSelection =
        Array.isArray(previewSelectedPath) &&
        previewSelectedPath.length === elementPath.length &&
        previewSelectedPath.every((segment, index) => segment === elementPath[index]);
      if (!pathMatchesSelection) return;
      const previewDocument =
        getLivePreviewSelectedElement(elementPath)?.ownerDocument ||
        previewFrameRef.current?.contentDocument ||
        previewFrameRef.current?.contentWindow?.document ||
        null;

      setPreviewSelectedMatchedCssRules((current) => {
        let didPatch = false;
        const nextRules = current.map((rule) => {
          if (
            normalizeSelectorSignature(rule.selector) !==
              normalizeSelectorSignature(selector) ||
            !cssRuleSourcesMatch(rule.sourcePath || rule.source, sourcePath)
          ) {
            return rule;
          }
          didPatch = true;
          return {
            ...rule,
            declarations: applyPatchToDeclarationEntries(
              rule.declarations,
              {
                selector,
                source: rule.source,
                sourcePath,
                occurrenceIndex: 0,
              },
              styles,
            ),
          };
        });

        if (didPatch) return nextRules;

        const declarations: PreviewMatchedCssDeclaration[] = Object.entries(styles)
          .map(([key, rawValue]) => {
            const property = toCssPropertyName(key);
            const value = normalizePresentationCssValue(
              property,
              rawValue,
              previewDocument,
            );
            if (!value) return null;
            return {
              property,
              value,
              active: true,
            } as PreviewMatchedCssDeclaration;
          })
          .filter((entry): entry is PreviewMatchedCssDeclaration => Boolean(entry));

        if (
          declarations.length > 0 &&
          !declarations.some(
            (declaration) => declaration.property.toLowerCase() === "position",
          )
        ) {
          declarations.unshift({
            property: "position",
            value: "absolute",
            active: true,
          });
        }

        if (declarations.length === 0) return current;

        return [
          ...current,
          {
            selector,
            source: "local.css",
            sourcePath,
            declarations,
          },
        ];
      });
    },
    [previewSelectedPath, setPreviewSelectedMatchedCssRules],
  );

  const updatePreviewLiveStylesheetContent = useCallback(
    (
      sourcePath: string,
      cssContent: string,
      elementPath?: number[],
      options?: {
        cacheBustAssets?: boolean;
      },
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
        options?.cacheBustAssets === false ? null : Date.now(),
      );
      const htmlDirVirtual = selectedPreviewHtmlRef.current?.includes("/")
        ? selectedPreviewHtmlRef.current.slice(
            0,
            selectedPreviewHtmlRef.current.lastIndexOf("/"),
          )
        : "";
      const localCssVirtualPath = normalizeProjectRelative(
        htmlDirVirtual ? `${htmlDirVirtual}/css/local.css` : "css/local.css",
      );
      let didUpdate = false;
      const styleNodes = Array.from(
        frameDocument.querySelectorAll<HTMLStyleElement>("style[data-source]"),
      );
      let updatedBaseInlineSheet = false;
      const matchingStyleNodes = () =>
        styleNodes.filter((styleNode) =>
          cssRuleSourcesMatch(
            normalizeProjectRelative(styleNode.getAttribute("data-source") || ""),
            normalizedSourcePath,
          ),
        );
      const getLiveOverrideNodesForSource = () =>
        Array.from(
          frameDocument.querySelectorAll<HTMLStyleElement>(
            "style[data-nx-live-source]",
          ),
        ).filter((styleNode) =>
          cssRuleSourcesMatch(
            normalizeProjectRelative(
              styleNode.getAttribute("data-nx-live-source") || "",
            ),
            normalizedSourcePath,
          ),
        );
      styleNodes.forEach((styleNode) => {
        const nodeSource = normalizeProjectRelative(
          styleNode.getAttribute("data-source") || "",
        );
        if (!cssRuleSourcesMatch(nodeSource, normalizedSourcePath)) return;
        styleNode.textContent = nextCssText;
        didUpdate = true;
        if (!styleNode.hasAttribute("data-nx-live-source")) {
          updatedBaseInlineSheet = true;
        }
      });

      const normalizeMatchingStyleNodes = () => {
        const matchingNodes = matchingStyleNodes();
        if (matchingNodes.length === 0) return;
        const canonicalBaseNode =
          matchingNodes.find(
            (styleNode) => !styleNode.hasAttribute("data-nx-live-source"),
          ) || matchingNodes[0];
        canonicalBaseNode.removeAttribute("data-nx-live-source");
        canonicalBaseNode.setAttribute("data-source", normalizedSourcePath);
        canonicalBaseNode.setAttribute("data-href", normalizedSourcePath);

        matchingNodes.forEach((styleNode) => {
          if (styleNode === canonicalBaseNode) return;
          if (styleNode.hasAttribute("data-nx-live-source")) {
            styleNode.remove();
          }
        });

        getLiveOverrideNodesForSource().forEach((overrideNode) => {
          if (overrideNode === canonicalBaseNode) return;
          overrideNode.remove();
        });
      };

      if (updatedBaseInlineSheet) {
        normalizeMatchingStyleNodes();
      }

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
          if (!cssRuleSourcesMatch(normalizedHref, normalizedSourcePath))
            return;

          const baseSelector = `style[data-source="${normalizedSourcePath.replace(/"/g, '\\"')}"]:not([data-nx-live-source])`;
          let baseNode =
            frameDocument.querySelector<HTMLStyleElement>(baseSelector);
          if (!baseNode) {
            baseNode = frameDocument.createElement("style");
            baseNode.setAttribute("data-source", normalizedSourcePath);
            baseNode.setAttribute("data-href", normalizedSourcePath);
            baseNode.setAttribute("data-nx-inline-from-link", "true");
            linkNode.insertAdjacentElement("afterend", baseNode);
          }
          baseNode.removeAttribute("data-nx-live-source");
          baseNode.setAttribute("data-source", normalizedSourcePath);
          baseNode.setAttribute("data-href", normalizedSourcePath);
          baseNode.setAttribute("data-nx-inline-from-link", "true");
          baseNode.textContent = nextCssText;
          linkNode.disabled = true;
          linkNode.setAttribute("data-nx-preview-link-disabled", "true");
          getLiveOverrideNodesForSource().forEach((overrideNode) => {
            if (overrideNode !== baseNode) {
              overrideNode.remove();
            }
          });
          didUpdate = true;
          updatedBaseInlineSheet = true;
        });
      }

      if (!didUpdate) {
        const fallbackHead =
          frameDocument.head || frameDocument.documentElement || null;
        if (fallbackHead) {
          const overrideSelector = `style[data-nx-live-source="${normalizedSourcePath.replace(/"/g, '\\"')}"]`;
          let overrideNode =
            frameDocument.querySelector<HTMLStyleElement>(overrideSelector);
          if (!overrideNode) {
            overrideNode = frameDocument.createElement("style");
            fallbackHead.appendChild(overrideNode);
          }
          overrideNode.setAttribute(
            "data-nx-live-source",
            normalizedSourcePath,
          );
          overrideNode.setAttribute("data-source", normalizedSourcePath);
          overrideNode.setAttribute("data-href", normalizedSourcePath);
          overrideNode.textContent = nextCssText;
          didUpdate = true;
        }
      }

      if (cssRuleSourcesMatch(normalizedSourcePath, localCssVirtualPath)) {
        const runtimeLocalCssNode =
          frameDocument.getElementById(
            "__nx-preview-runtime-local-css",
          ) as HTMLStyleElement | null;
        if (runtimeLocalCssNode instanceof HTMLStyleElement) {
          runtimeLocalCssNode.textContent = nextCssText;
        }
      }

      if (didUpdate && Array.isArray(elementPath) && elementPath.length > 0) {
        window.setTimeout(() => {
          syncPreviewSelectionSnapshotFromLiveElement(elementPath);
        }, 0);
      }
      debugPreviewCssMutation("updatePreviewLiveStylesheetContent", {
        sourcePath: normalizedSourcePath,
        didUpdate,
        elementPath: Array.isArray(elementPath) ? elementPath : [],
        matchingDataSourceStyles: matchingStyleNodes().length,
        remainingLiveOverrideStyles: getLiveOverrideNodesForSource().length,
      });
      return didUpdate;
    },
    [
      debugPreviewCssMutation,
      filesRef,
      previewFrameRef,
      selectedPreviewHtmlRef,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
  );

  const buildPreviewMatchedRulePatchedSource = useCallback(
    (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
    ) => {
      const sourcePath = resolvePreviewMatchedRuleSourcePath(
        rule.sourcePath || rule.source,
      );
      if (!sourcePath) {
        debugPreviewCssMutation("buildPreviewMatchedRulePatchedSource", {
          selector: rule.selector,
          source: rule.source,
          sourcePath: rule.sourcePath || "",
          occurrenceIndex: rule.occurrenceIndex ?? 0,
          styles,
          resolvedSourcePath: "",
          sourceTextFound: false,
          ruleRangeFound: false,
        });
        return null;
      }
      const sourceText =
        typeof textFileCacheRef.current[sourcePath] === "string"
          ? textFileCacheRef.current[sourcePath]
          : typeof filesRef.current[sourcePath]?.content === "string"
            ? (filesRef.current[sourcePath]?.content as string)
            : "";
      if (!sourceText) {
        debugPreviewCssMutation("buildPreviewMatchedRulePatchedSource", {
          selector: rule.selector,
          source: rule.source,
          sourcePath: rule.sourcePath || "",
          occurrenceIndex: rule.occurrenceIndex ?? 0,
          styles,
          resolvedSourcePath: sourcePath,
          sourceTextFound: false,
          ruleRangeFound: false,
        });
        return null;
      }

      const ruleRange = findCssRuleRange(
        sourceText,
        rule.selector,
        Math.max(0, rule.occurrenceIndex || 0),
      );
      if (!ruleRange) {
        if (cssRuleSourcesMatch(sourcePath, "local.css")) {
          const nextDeclarations = applyPatchToDeclarationEntries([], rule, styles);
          const nextRuleBlock =
            nextDeclarations.length > 0
              ? `${rule.selector} {\n  ${nextDeclarations
                  .map(
                    (entry) =>
                      `${entry.property}: ${entry.value}${entry.important ? " !important" : ""};`,
                  )
                  .join("\n  ")}\n}`
              : `${rule.selector} {\n}`;
          const trimmedSource = sourceText.trimEnd();
          const nextSourceText = trimmedSource
            ? `${trimmedSource}\n\n${nextRuleBlock}\n`
            : `${nextRuleBlock}\n`;
          debugPreviewCssMutation("buildPreviewMatchedRulePatchedSource", {
            selector: rule.selector,
            source: rule.source,
            sourcePath: rule.sourcePath || "",
            occurrenceIndex: rule.occurrenceIndex ?? 0,
            styles,
            resolvedSourcePath: sourcePath,
            sourceTextFound: true,
            ruleRangeFound: false,
            createdMissingRule: true,
          });
          return { sourcePath, nextSourceText };
        }
        debugPreviewCssMutation("buildPreviewMatchedRulePatchedSource", {
          selector: rule.selector,
          source: rule.source,
          sourcePath: rule.sourcePath || "",
          occurrenceIndex: rule.occurrenceIndex ?? 0,
          styles,
          resolvedSourcePath: sourcePath,
          sourceTextFound: true,
          ruleRangeFound: false,
          createdMissingRule: false,
        });
        return null;
      }

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
      if (typeof window !== "undefined" && (window as any).__NX_DEBUG_PREVIEW_CSS !== false) {
        console.log("[PreviewAssetDebug] buildPreviewMatchedRulePatchedSource:result", {
          selector: rule.selector,
          source: rule.source,
          sourcePath: rule.sourcePath || "",
          resolvedSourcePath: sourcePath,
          styles,
          ruleHeader: ruleRange.selectorText,
          nextRuleBlock,
        });
      }
      debugPreviewCssMutation("buildPreviewMatchedRulePatchedSource", {
        selector: rule.selector,
        source: rule.source,
        sourcePath: rule.sourcePath || "",
        occurrenceIndex: rule.occurrenceIndex ?? 0,
        styles,
        resolvedSourcePath: sourcePath,
        sourceTextFound: true,
        ruleRangeFound: true,
        ruleHeader: ruleRange.selectorText,
      });
      return { sourcePath, nextSourceText };
    },
    [
      debugPreviewCssMutation,
      filesRef,
      resolvePreviewMatchedRuleSourcePath,
      textFileCacheRef,
    ],
  );

  const persistPreviewMatchedRuleToSourceFile = useCallback(
    async (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
    ) => {
      let patchedSource = buildPreviewMatchedRulePatchedSource(rule, styles);
      if (!patchedSource) {
        await ensurePreviewMatchedRuleSourceLoaded(rule);
        patchedSource = buildPreviewMatchedRulePatchedSource(rule, styles);
      }
      if (!patchedSource) return false;
      const { sourcePath, nextSourceText } = patchedSource;
      const previousSourceText =
        typeof filesRef.current[sourcePath]?.content === "string"
          ? (filesRef.current[sourcePath]?.content as string)
          : typeof textFileCacheRef.current[sourcePath] === "string"
            ? textFileCacheRef.current[sourcePath]
            : "";
      if (previousSourceText !== nextSourceText) {
        pushPreviewHistory(sourcePath, nextSourceText, previousSourceText);
      }

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
      dirtyFilesRef,
      ensurePreviewMatchedRuleSourceLoaded,
      filesRef,
      invalidatePreviewDocsForDependency,
      pendingPreviewWritesRef,
      pushPreviewHistory,
      schedulePreviewAutoSave,
      setDirtyFiles,
      setFiles,
      textFileCacheRef,
    ],
  );

  const applyPreviewLocalCssPatchAtPath = useCallback(
    async (
      elementPath: number[],
      styles: Partial<React.CSSProperties>,
      options?: {
        syncSelectedElement?: boolean;
        commitMode?: "move" | "move-draft" | "fallback";
      },
    ) => {
      if (
        !selectedPreviewHtml ||
        !Array.isArray(elementPath) ||
        elementPath.length === 0
      ) {
        return;
      }
      const loaded =
        options?.commitMode === "move-draft"
          ? null
          : await loadFileContent(selectedPreviewHtml);
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
      const applyLiveStylePatch = (
        element: HTMLElement,
        stylePatch: Partial<React.CSSProperties>,
      ) => {
        const styleDocument = element.ownerDocument || null;
        const positionalKeys = new Set([
          "left",
          "top",
          "right",
          "bottom",
          "width",
          "height",
        ]);
        const hasPositionalPatch = Object.keys(stylePatch).some((key) =>
          positionalKeys.has(toCssPropertyName(key)),
        );
        Object.entries(stylePatch).forEach(([key, rawValue]) => {
          const cssKey = toCssPropertyName(key);
          const value = normalizePresentationCssValue(
            cssKey,
            rawValue,
            styleDocument,
          );
          if (!value) {
            element.style.removeProperty(cssKey);
            return;
          }
          element.style.setProperty(cssKey, value);
        });
        if (
          hasPositionalPatch &&
          !Object.prototype.hasOwnProperty.call(stylePatch, "position")
        ) {
          const computedPosition =
            element.ownerDocument?.defaultView?.getComputedStyle(element).position ||
            "";
          if (!computedPosition || computedPosition === "static") {
            element.style.setProperty("position", "absolute");
          }
        }
        if (!element.getAttribute("style")?.trim()) {
          element.removeAttribute("style");
        }
      };
      const collectStableClassTokens = (value: string | null | undefined) =>
        String(value || "")
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(
            (token) =>
              token &&
              !token.startsWith("__nx-") &&
              !token.startsWith("nx-local-style-"),
          );
      const buildDirectSelectorCssPatch = (
        cssSource: string,
      ): {
        nextCssContent: string;
        selector: string;
      } | null => {
        const idCandidates = [
          target instanceof HTMLElement ? target.id : "",
          liveTarget instanceof HTMLElement ? liveTarget.id : "",
          previewSelectedElement?.id || "",
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean);
        const classTokens = [
          ...(target instanceof HTMLElement
            ? collectStableClassTokens(target.getAttribute("class"))
            : []),
          ...(liveTarget instanceof HTMLElement
            ? collectStableClassTokens(liveTarget.getAttribute("class"))
            : []),
        ];
        const candidateSelectors = Array.from(
          new Set([
            ...idCandidates.map((id) => `#${id}`),
            ...classTokens.map((token) => `.${token}`),
          ]),
        );
        if (candidateSelectors.length === 0) return null;

        const chooseSelector = () => {
          for (const selector of candidateSelectors) {
            const exactRange = findCssRuleRange(cssSource, selector, 0);
            if (exactRange) return selector;
          }
          for (const selector of candidateSelectors) {
            if (cssSource.includes(selector)) return selector;
          }
          return candidateSelectors[0];
        };

        const selector = chooseSelector();
        const existingRange = findCssRuleRange(cssSource, selector, 0);
        const declarationHost = document.createElement("div");
        declarationHost.style.cssText = existingRange?.body || "";
        const existingDeclarations: PreviewMatchedCssDeclaration[] = [];
        Array.from(declarationHost.style).forEach((property) => {
          const value = declarationHost.style.getPropertyValue(property);
          if (!property || !value) return;
          existingDeclarations.push({
            property,
            value,
            important:
              declarationHost.style.getPropertyPriority(property) ===
              "important",
          });
        });
        const nextDeclarations = applyPatchToDeclarationEntries(
          existingDeclarations,
          {
            selector,
            source: "local.css",
            sourcePath: cssLocalVirtualPath,
            occurrenceIndex: 0,
          },
          styles,
        );
        if (
          nextDeclarations.length > 0 &&
          !nextDeclarations.some(
            (entry) => entry.property.toLowerCase() === "position",
          )
        ) {
          nextDeclarations.unshift({
            property: "position",
            value: "absolute",
          });
        }
        const nextRuleBlock =
          nextDeclarations.length > 0
            ? `${selector} {\n  ${nextDeclarations
                .map(
                  (entry) =>
                    `${entry.property}: ${entry.value}${entry.important ? " !important" : ""};`,
                )
                .join("\n  ")}\n}`
            : `${selector} {\n}`;

        if (existingRange) {
          return {
            selector,
            nextCssContent:
              cssSource.slice(0, existingRange.start) +
              nextRuleBlock +
              cssSource.slice(existingRange.end),
          };
        }

        const trimmed = cssSource.trimEnd();
        return {
          selector,
          nextCssContent: trimmed
            ? `${trimmed}\n\n${nextRuleBlock}\n`
            : `${nextRuleBlock}\n`,
        };
      };
      const persistResolvedCssPatch = async (
        nextCssContent: string,
        previousCssContent: string,
        elementPath: number[],
      ) => {
        if (previousCssContent !== nextCssContent) {
          pushPreviewHistory(
            cssLocalVirtualPath,
            nextCssContent,
            previousCssContent,
          );
        }
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
        pendingPreviewWritesRef.current[cssLocalVirtualPath] = nextCssContent;
        if (!dirtyFilesRef.current.includes(cssLocalVirtualPath)) {
          dirtyFilesRef.current = [...dirtyFilesRef.current, cssLocalVirtualPath];
        }
        setDirtyFiles((prev) =>
          prev.includes(cssLocalVirtualPath)
            ? prev
            : [...prev, cssLocalVirtualPath],
        );
        invalidatePreviewDocsForDependency(cssLocalVirtualPath);
        schedulePreviewAutoSave();
        updatePreviewLiveStylesheetContent(
          cssLocalVirtualPath,
          nextCssContent,
          elementPath,
          { cacheBustAssets: false },
        );
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
          await ensureDirectoryTreeStable(absoluteParent);
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
      if (options?.commitMode === "move-draft") {
        const movePatch = buildDirectSelectorCssPatch(cssContent);
        if (movePatch) {
          updatePreviewLiveStylesheetContent(
            cssLocalVirtualPath,
            movePatch.nextCssContent,
            elementPath,
            { cacheBustAssets: false },
          );
          applyMoveDraftInspectorState(
            elementPath,
            movePatch.selector,
            styles,
            cssLocalVirtualPath,
          );
          if (liveTarget instanceof HTMLElement) {
            applyLiveStylePatch(liveTarget, styles);
          }
          setPreviewSelectedElement((prev) =>
            prev
              ? {
                  ...prev,
                  className:
                    liveTarget instanceof HTMLElement
                      ? liveTarget.className || prev.className
                      : prev.className,
                  styles:
                    liveTarget instanceof HTMLElement
                      ? parseInlineStyleText(
                          liveTarget.getAttribute("style") || "",
                        )
                      : prev.styles,
                }
              : prev,
          );
          return;
        }
      }
      if (options?.commitMode === "move") {
        const movePatch = buildDirectSelectorCssPatch(cssContent);
        if (movePatch) {
          const nextCssContent = movePatch.nextCssContent;
          await persistResolvedCssPatch(nextCssContent, cssContent, elementPath);
          if (liveTarget instanceof HTMLElement) {
            applyLiveStylePatch(liveTarget, styles);
          }
          if (target instanceof HTMLElement) {
            Object.keys(styles).forEach((key) => {
              target.style.removeProperty(toCssPropertyName(key));
            });
            if (!target.getAttribute("style")?.trim()) {
              target.removeAttribute("style");
            }
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
          if (shouldSyncSelected) {
            syncPreviewSelectionSnapshotFromLiveElement(elementPath);
          }
          return;
        }
      }
      const directPatch = buildDirectSelectorCssPatch(cssContent);
      if (directPatch) {
        const nextCssContent = directPatch.nextCssContent;
        await persistResolvedCssPatch(nextCssContent, cssContent, elementPath);
        if (target instanceof HTMLElement) {
          Object.keys(styles).forEach((key) => {
            target.style.removeProperty(toCssPropertyName(key));
          });
          if (!target.getAttribute("style")?.trim()) {
            target.removeAttribute("style");
          }
        }
        if (liveTarget instanceof HTMLElement) {
          applyLiveStylePatch(liveTarget, styles);
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
        if (shouldSyncSelected) {
          syncPreviewSelectionSnapshotFromLiveElement(elementPath);
        }
        return;
      }
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
      const previewDocument =
        (target instanceof HTMLElement
          ? target.ownerDocument
          : liveTarget instanceof HTMLElement
            ? liveTarget.ownerDocument
            : previewFrameRef.current?.contentDocument ||
              previewFrameRef.current?.contentWindow?.document ||
              null) || null;
      for (const [key, rawValue] of Object.entries(styles)) {
        const cssKey = toCssPropertyName(key);
        const value = normalizePresentationCssValue(
          cssKey,
          rawValue,
          previewDocument,
        );
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
      if (cssContent !== nextCssContent) {
        pushPreviewHistory(cssLocalVirtualPath, nextCssContent, cssContent);
      }
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
      applyMoveDraftInspectorState,
      ensureDirectoryTreeStable,
      filePathIndexRef,
      filesRef,
      getLivePreviewSelectedElement,
      loadFileContent,
      pendingPreviewWritesRef,
      persistPreviewHtmlContent,
      previewSelectedElement?.id,
      previewSelectedPath,
      pushPreviewHistory,
      selectedPreviewHtml,
      setFiles,
      setPreviewSelectedElement,
      syncPreviewSelectionSnapshotFromLiveElement,
      textFileCacheRef,
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
          .filter((token) => token && !token.startsWith("nx-local-style-"));
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
      filesRef,
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      selectedPreviewHtml,
      syncPreviewSelectionSnapshotFromLiveElement,
      textFileCacheRef,
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
      previewMatchedRuleEditAtRef.current = Date.now();
      previewMatchedRuleEditRef.current = {
        at: previewMatchedRuleEditAtRef.current,
        selector: rule.selector,
        source: rule.source,
        sourcePath: rule.sourcePath,
        occurrenceIndex: Math.max(0, rule.occurrenceIndex || 0),
      };
      applyPreviewMatchedRuleOptimisticState(rule, styles, nextPath);
      const shouldLivePreview = true;
      const patchedSource =
        shouldLivePreview
          ? buildPreviewMatchedRulePatchedSource(rule, styles)
          : null;
      if (shouldLivePreview && !patchedSource) {
        void (async () => {
          const loadedSourcePath = await ensurePreviewMatchedRuleSourceLoaded(
            rule,
          );
          if (!loadedSourcePath) return;
          const retriedPatchedSource = buildPreviewMatchedRulePatchedSource(
            rule,
            styles,
          );
          if (!retriedPatchedSource) return;
          updatePreviewLiveStylesheetContent(
            retriedPatchedSource.sourcePath,
            retriedPatchedSource.nextSourceText,
            nextPath,
          );
        })();
      }
      const updatedLiveStylesheet =
        shouldLivePreview && patchedSource
          ? updatePreviewLiveStylesheetContent(
              patchedSource.sourcePath,
              patchedSource.nextSourceText,
              nextPath,
            )
          : false;
      const appliedLiveRule =
        shouldLivePreview && !patchedSource
          ? applyPreviewMatchedRuleToLiveStylesheet(rule, styles, nextPath)
          : false;
      debugPreviewCssMutation("queuePreviewLocalCssPatch", {
        selector: rule.selector,
        source: rule.source,
        sourcePath: rule.sourcePath || "",
        occurrenceIndex: rule.occurrenceIndex ?? 0,
        styles,
        shouldLivePreview,
        hasPatchedSource: Boolean(patchedSource),
        updatedLiveStylesheet,
        appliedLiveRule,
        inlinePreviewDisabledForMatchedRuleEdits: true,
      });
      if (typeof window !== "undefined" && (window as any).__NX_DEBUG_PREVIEW_CSS !== false) {
        console.log("[PreviewAssetDebug] queuePreviewLocalCssPatch:live-preview", {
          selector: rule.selector,
          source: rule.source,
          sourcePath: rule.sourcePath || "",
          styles,
          hasPatchedSource: Boolean(patchedSource),
          patchedSourcePath: patchedSource?.sourcePath || "",
          updatedLiveStylesheet,
          appliedLiveRule,
        });
      }
      const currentPending = previewLocalCssDraftPendingRef.current;
      const sameTarget =
        currentPending &&
        currentPending.rule.selector === rule.selector &&
        currentPending.rule.source === rule.source &&
        (currentPending.rule.sourcePath || "") === (rule.sourcePath || "") &&
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
          const pendingPatchedSource = buildPreviewMatchedRulePatchedSource(
            currentPending.rule,
            currentPending.styles,
          );
          const persisted = await persistPreviewMatchedRuleToSourceFile(
            currentPending.rule,
            currentPending.styles,
          );
          if (persisted) {
            if (pendingPatchedSource) {
              updatePreviewLiveStylesheetContent(
                pendingPatchedSource.sourcePath,
                pendingPatchedSource.nextSourceText,
                currentPending.elementPath,
              );
            }
            clearPreviewInlineStylePropertiesAtPath(
              currentPending.elementPath,
              currentPending.styles,
            );
            await removePreviewLocalStyleClassesAtPath(
              currentPending.elementPath,
            );
            return;
          }
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
          const pendingPatchedSource = buildPreviewMatchedRulePatchedSource(
            pending.rule,
            pending.styles,
          );
          const persisted = await persistPreviewMatchedRuleToSourceFile(
            pending.rule,
            pending.styles,
          );
          if (persisted) {
            if (pendingPatchedSource) {
              updatePreviewLiveStylesheetContent(
                pendingPatchedSource.sourcePath,
                pendingPatchedSource.nextSourceText,
                pending.elementPath,
              );
            }
            clearPreviewInlineStylePropertiesAtPath(
              pending.elementPath,
              pending.styles,
            );
            await removePreviewLocalStyleClassesAtPath(pending.elementPath);
            syncPreviewSelectionSnapshotFromLiveElement(pending.elementPath);
            return;
          }
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
      applyPreviewMatchedRuleToLiveStylesheet,
      buildPreviewMatchedRulePatchedSource,
      ensurePreviewMatchedRuleSourceLoaded,
      persistPreviewMatchedRuleToSourceFile,
      previewLocalCssDraftPendingRef,
      previewLocalCssDraftTimerRef,
      previewMatchedRuleEditAtRef,
      previewMatchedRuleEditRef,
      previewSelectedPath,
      clearPreviewInlineStylePropertiesAtPath,
      removePreviewLocalStyleClassesAtPath,
      syncPreviewSelectionSnapshotFromLiveElement,
      updatePreviewLiveStylesheetContent,
    ],
  );

  const handlePreviewMatchedRulePropertyAdd = useCallback(
    (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
    ) => {
      if (!previewSelectedPath || !Array.isArray(previewSelectedPath)) return;
      debugPreviewCssMutation("handlePreviewMatchedRulePropertyAdd", {
        selector: rule.selector,
        source: rule.source,
        occurrenceIndex: rule.occurrenceIndex ?? 0,
        originalProperty: rule.originalProperty || "",
        styles,
        previewSelectedPath,
      });
      queuePreviewLocalCssPatch(rule, styles);
    },
    [debugPreviewCssMutation, previewSelectedPath, queuePreviewLocalCssPatch],
  );

  return {
    applyPreviewLocalCssPatchAtPath,
    handleImmediatePreviewStyle,
    handlePreviewMatchedRulePropertyAdd,
    resolvePreviewMatchedRuleSourcePath,
  };
};
