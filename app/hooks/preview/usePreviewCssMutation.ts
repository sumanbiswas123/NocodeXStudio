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
  previewSelectedElement: VirtualElement | null;
  previewSelectedPath: number[] | null;
  resolveVirtualPathFromMountRelative: (
    mountRelativePath: string,
  ) => string | null;
  schedulePreviewAutoSave: () => void;
  selectedPreviewHtml: string | null;
  selectedPreviewHtmlRef: MutableRefObject<string | null>;
  setDirtyFiles: Dispatch<SetStateAction<string[]>>;
  setFiles: Dispatch<SetStateAction<FileMap>>;
  setPreviewSelectedElement: Dispatch<SetStateAction<VirtualElement | null>>;
  setPreviewSelectedMatchedCssRules: Dispatch<
    SetStateAction<PreviewMatchedCssRule[]>
  >;
  syncPreviewSelectionSnapshotFromLiveElement: (elementPath: number[]) => boolean;
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
  previewSelectedElement,
  previewSelectedPath,
  resolveVirtualPathFromMountRelative,
  schedulePreviewAutoSave,
  selectedPreviewHtml,
  selectedPreviewHtmlRef,
  setDirtyFiles,
  setFiles,
  setPreviewSelectedElement,
  setPreviewSelectedMatchedCssRules,
  syncPreviewSelectionSnapshotFromLiveElement,
  textFileCacheRef,
}: UsePreviewCssMutationOptions) => {
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
        const value = normalizePresentationCssValue(cssKey, rawValue);

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

  const resolvePreviewMatchedRuleSourcePath = useCallback(
    (source: string) => {
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
    },
    [filesRef, selectedPreviewHtml, textFileCacheRef],
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
          const value = normalizePresentationCssValue(cssKey, rawValue);
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
    [
      getLivePreviewSelectedElement,
      previewSelectedPath,
      setPreviewSelectedMatchedCssRules,
    ],
  );

  const updatePreviewLiveStylesheetContent = useCallback(
    (sourcePath: string, cssContent: string, elementPath?: number[]) => {
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
    [
      filesRef,
      previewFrameRef,
      selectedPreviewHtmlRef,
      syncPreviewSelectionSnapshotFromLiveElement,
    ],
  );

  const buildPreviewMatchedRulePatchedSource = useCallback(
    (rule: PreviewMatchedRuleMutation, styles: Partial<React.CSSProperties>) => {
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
    [filesRef, resolvePreviewMatchedRuleSourcePath, textFileCacheRef],
  );

  const persistPreviewMatchedRuleToSourceFile = useCallback(
    async (
      rule: PreviewMatchedRuleMutation,
      styles: Partial<React.CSSProperties>,
    ) => {
      const patchedSource = buildPreviewMatchedRulePatchedSource(rule, styles);
      if (!patchedSource) return false;
      const { sourcePath, nextSourceText } = patchedSource;

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
      filesRef,
      invalidatePreviewDocsForDependency,
      pendingPreviewWritesRef,
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
        const value = normalizePresentationCssValue(cssKey, rawValue);
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
        if (!target.getAttribute("style")?.trim()) target.removeAttribute("style");
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
      ensureDirectoryTreeStable,
      filePathIndexRef,
      filesRef,
      getLivePreviewSelectedElement,
      loadFileContent,
      pendingPreviewWritesRef,
      persistPreviewHtmlContent,
      previewSelectedElement?.id,
      previewSelectedPath,
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
    (rule: PreviewMatchedRuleMutation, styles: Partial<React.CSSProperties>) => {
      if (
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
      ) {
        return;
      }

      const nextPath = [...previewSelectedPath];
      applyPreviewMatchedRuleOptimisticState(rule, styles, nextPath);
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
          const persisted = await persistPreviewMatchedRuleToSourceFile(
            pending.rule,
            pending.styles,
          );
          if (persisted) {
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
      handleImmediatePreviewStyle,
      persistPreviewMatchedRuleToSourceFile,
      previewLocalCssDraftPendingRef,
      previewLocalCssDraftTimerRef,
      previewSelectedPath,
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
      queuePreviewLocalCssPatch(rule, styles);
    },
    [previewSelectedPath, queuePreviewLocalCssPatch],
  );

  return {
    applyPreviewLocalCssPatchAtPath,
    handleImmediatePreviewStyle,
    handlePreviewMatchedRulePropertyAdd,
    resolvePreviewMatchedRuleSourcePath,
  };
};
