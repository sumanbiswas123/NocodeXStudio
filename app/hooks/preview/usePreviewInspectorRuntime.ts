import React, { useCallback, useEffect, useRef } from "react";
import * as Neutralino from "@neutralinojs/lib";
import { FileMap, ProjectFile, VirtualElement } from "../../../types";
import {
  CdpInspectSelectedResponse,
  PreviewMatchedCssRule,
  derivePreviewMatchedCssRulesFromCdp,
  extractAssetUrlFromCssValue,
  toReactComputedStylesFromCdp,
} from "../../helpers/previewCssHelpers";
import {
  PREVIEW_MOUNT_PATH,
  getParentPath,
  joinPath,
  normalizePath,
  normalizeProjectRelative,
  readElementByPath,
  relativePathBetweenVirtualFiles,
  resolveProjectRelativePath,
  toFileUrl,
  toMountRelativePath,
} from "../../helpers/appHelpers";

type UsePreviewInspectorRuntimeOptions = {
  applyPreviewStyleUpdateAtPath: (
    path: number[],
    patch: Partial<React.CSSProperties>,
    options?: { syncSelectedElement?: boolean },
  ) => Promise<void>;
  ensureDirectoryTreeStable: (path: string) => Promise<void>;
  filePathIndexRef: React.MutableRefObject<Record<string, string>>;
  filesRef: React.MutableRefObject<FileMap>;
  handleReplacePreviewAsset: () => Promise<boolean>;
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  persistPreviewHtmlContent: (
    updatedPath: string,
    serialized: string,
    options?: {
      refreshPreviewDoc?: boolean;
      saveNow?: boolean;
      skipAutoSave?: boolean;
    },
  ) => Promise<void>;
  previewMountBasePath: string | null;
  previewRefreshNonce: number;
  previewSelectedElement: VirtualElement | null;
  previewSelectedMatchedCssRules: PreviewMatchedCssRule[];
  previewSelectedPath: number[] | null;
  previewSelectionMode: string;
  projectPath: string | null;
  resolvePreviewMatchedRuleSourcePath: (source?: string | null) => string | null;
  selectedPreviewHtml: string | null;
  setFiles: React.Dispatch<React.SetStateAction<FileMap>>;
  setPreviewSelectedComputedStyles: React.Dispatch<
    React.SetStateAction<React.CSSProperties | null>
  >;
  setPreviewSelectedElement: React.Dispatch<
    React.SetStateAction<VirtualElement | null>
  >;
  setPreviewSelectedMatchedCssRules: React.Dispatch<
    React.SetStateAction<PreviewMatchedCssRule[]>
  >;
};

type UsePreviewInspectorRuntimeResult = {
  applyPreviewAnimationUpdate: (animation: string) => Promise<void>;
  resolveInspectorAssetPreviewUrl: (raw: string, source?: string) => string;
};

export const usePreviewInspectorRuntime = ({
  applyPreviewStyleUpdateAtPath,
  ensureDirectoryTreeStable,
  filePathIndexRef,
  filesRef,
  handleReplacePreviewAsset,
  interactionMode,
  loadFileContent,
  persistPreviewHtmlContent,
  previewMountBasePath,
  previewRefreshNonce,
  previewSelectedElement,
  previewSelectedMatchedCssRules,
  previewSelectedPath,
  previewSelectionMode,
  projectPath,
  resolvePreviewMatchedRuleSourcePath,
  selectedPreviewHtml,
  setFiles,
  setPreviewSelectedComputedStyles,
  setPreviewSelectedElement,
  setPreviewSelectedMatchedCssRules,
}: UsePreviewInspectorRuntimeOptions): UsePreviewInspectorRuntimeResult => {
  const lastAutoAssetReplaceKeyRef = useRef<string | null>(null);
  const latestPreviewSelectedElementRef = useRef<VirtualElement | null>(
    previewSelectedElement,
  );
  const latestPreviewSelectedMatchedCssRulesRef = useRef<PreviewMatchedCssRule[]>(
    previewSelectedMatchedCssRules,
  );
  const isTemporaryMatchedRuleSource = (source: string) => {
    const normalized = String(source || "").trim().toLowerCase();
    return (
      normalized === "inline stylesheet" ||
      /^style-sheet-\d+-\d+$/.test(normalized)
    );
  };

  useEffect(() => {
    latestPreviewSelectedElementRef.current = previewSelectedElement;
  }, [previewSelectedElement]);

  useEffect(() => {
    latestPreviewSelectedMatchedCssRulesRef.current =
      previewSelectedMatchedCssRules;
  }, [previewSelectedMatchedCssRules]);

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
    const latestPreviewSelectedElement = latestPreviewSelectedElementRef.current;
    if (
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0 ||
      !latestPreviewSelectedElement
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
          latestPreviewSelectedMatchedCssRulesRef.current,
          latestPreviewSelectedElement.styles,
        );

        if (cdpComputedStyles) {
          setPreviewSelectedComputedStyles(cdpComputedStyles);
        }
        if (cdpMatchedCssRules.length > 0) {
          setPreviewSelectedMatchedCssRules((current) => {
            const cdpHasStableSources = cdpMatchedCssRules.some(
              (rule) => !isTemporaryMatchedRuleSource(rule.source),
            );
            const currentHasStableSources = current.some(
              (rule) => !isTemporaryMatchedRuleSource(rule.source),
            );
            if (cdpHasStableSources || !currentHasStableSources) {
              return cdpMatchedCssRules;
            }
            return current;
          });
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
    previewSelectedPath,
    setPreviewSelectedComputedStyles,
    setPreviewSelectedMatchedCssRules,
  ]);

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
    const assetSource =
      typeof previewSelectedElement.src === "string" &&
      previewSelectedElement.src.trim()
        ? previewSelectedElement.src.trim()
        : "";
    const fallbackAssetSource =
      typeof previewSelectedElement.styles?.backgroundImage === "string"
        ? String(previewSelectedElement.styles.backgroundImage)
        : "";
    if (!assetSource && !fallbackAssetSource) return;
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

  const applyPreviewAnimationUpdate = useCallback(
    async (animation: string) => {
      if (!selectedPreviewHtml || !Array.isArray(previewSelectedPath)) return;
      const nextAnimation =
        typeof animation === "string" ? animation.trim() : "";
      await applyPreviewStyleUpdateAtPath(
        previewSelectedPath,
        { animation: nextAnimation },
        { syncSelectedElement: true },
      );
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
            await ensureDirectoryTreeStable(absoluteParent);
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
        target.id || previewSelectedElement?.id || previewSelectedPath.join("-");
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
        refreshPreviewDoc: false,
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
      applyPreviewStyleUpdateAtPath,
      ensureDirectoryTreeStable,
      filePathIndexRef,
      filesRef,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedElement?.id,
      previewSelectedPath,
      selectedPreviewHtml,
      setFiles,
      setPreviewSelectedElement,
    ],
  );

  const resolveInspectorAssetPreviewUrl = useCallback(
    (raw: string, source?: string) => {
      const cleaned =
        extractAssetUrlFromCssValue(raw) || String(raw || "").trim();
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
      filePathIndexRef,
      previewMountBasePath,
      projectPath,
      resolvePreviewMatchedRuleSourcePath,
      selectedPreviewHtml,
    ],
  );

  return {
    applyPreviewAnimationUpdate,
    resolveInspectorAssetPreviewUrl,
  };
};
