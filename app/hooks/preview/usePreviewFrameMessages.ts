import { useEffect } from "react";
import type React from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PreviewConsoleLevel } from "../../helpers/appHelpers";
import {
  extractComputedStylesFromElement,
  extractCustomAttributesFromElement,
  extractTextFromHtmlFragment,
  extractTextWithBreaks,
  normalizeEditorMultilineText,
  normalizePreviewPath,
  normalizeProjectRelative,
  parseInlineStyleText,
  readElementByPath,
  resolvePreviewNavigationPath,
} from "../../helpers/appHelpers";
import type { FileMap, VirtualElement } from "../../../types";
import type {
  PreviewMatchedCssDeclaration,
  PreviewMatchedCssRule,
} from "../../helpers/previewCssHelpers";
import {
  collectMatchedCssRulesFromElement,
  normalizePresentationStylePatch,
} from "../../helpers/previewCssHelpers";

const isTemporaryMatchedRuleSource = (source: string) => {
  const normalized = String(source || "").trim().toLowerCase();
  return (
    normalized === "inline stylesheet" ||
    /^style-sheet-\d+-\d+$/.test(normalized)
  );
};

type PreviewMessagePayload = {
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
      active?: unknown;
    }>;
  }>;
  parentPath?: number[];
  styles?: Record<string, string | number>;
};

type UsePreviewFrameMessagesOptions = {
  EXPLORER_LOCK_TTL_MS: number;
  activeFileRef: MutableRefObject<string | null>;
  appendPreviewConsole: (
    level: PreviewConsoleLevel,
    message: string,
    source?: string,
  ) => void;
  applyPreviewDrawCreate: (
    parentPath: number[],
    tag: string,
    styles: Record<string, string>,
  ) => Promise<void>;
  applyPreviewInlineEdit: (
    elementPath: number[],
    nextInnerHtml: string,
  ) => Promise<void>;
  applyPreviewInlineEditDraft: (
    filePath: string,
    elementPath: number[],
    nextInnerHtml: string,
  ) => Promise<void>;
  applyPreviewLocalCssPatchAtPath: (
    elementPath: number[],
    styles: Partial<React.CSSProperties>,
    options?: { syncSelectedElement?: boolean },
  ) => Promise<void>;
  closePendingPageSwitchPrompt: () => void;
  explorerSelectionLockRef: MutableRefObject<string | null>;
  explorerSelectionLockUntilRef: MutableRefObject<number>;
  extractMountRelativePath: (locationPath: string) => string | null;
  filesRef: MutableRefObject<FileMap>;
  flushPendingPreviewSaves: () => Promise<void>;
  getLivePreviewSelectedElement: (path?: number[] | null) => Element | null;
  getStablePreviewElementId: (
    path: number[] | null | undefined,
    explicitId?: string | null,
    fallbackId?: string | null,
  ) => string;
  inlineEditDraftPendingRef: MutableRefObject<{
    filePath: string;
    elementPath: number[];
    html: string;
  } | null>;
  inlineEditDraftTimerRef: MutableRefObject<number | null>;
  isActivePreviewMessageSource: (source: MessageEventSource | null) => boolean;
  isMountedPreview: boolean;
  isPageSwitchPromptBusy: boolean;
  isPageSwitchPromptOpen: boolean;
  previewSelectedElement: VirtualElement | null;
  previewSelectedPath: number[] | null;
  previewSyncedFile: string | null;
  requestPreviewRefreshWithUnsavedGuard: () => void;
  requestSwitchToPreviewMode: () => void;
  resolveAdjacentSlidePath: (
    fromPath: string,
    dir: "next" | "prev",
  ) => string | null;
  resolveVirtualPathFromMountRelative: (
    mountRelativePath: string,
  ) => string | null;
  runRedo: () => void;
  runUndo: () => void;
  saveCodeDraftsRef: MutableRefObject<(() => Promise<void>) | null>;
  selectedPreviewHtml: string | null;
  selectedPreviewHtmlRef: MutableRefObject<string | null>;
  setDirtyFiles: Dispatch<SetStateAction<string[]>>;
  setInteractionMode: Dispatch<
    SetStateAction<"edit" | "preview" | "inspect" | "draw" | "move">
  >;
  setIsCodePanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsLeftPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsRightPanelOpen: Dispatch<SetStateAction<boolean>>;
  setPreviewMode: Dispatch<SetStateAction<"edit" | "preview">>;
  setPreviewSelectedComputedStyles: Dispatch<
    SetStateAction<React.CSSProperties | null>
  >;
  setPreviewSelectedElement: Dispatch<SetStateAction<VirtualElement | null>>;
  setPreviewSelectedMatchedCssRules: Dispatch<
    SetStateAction<PreviewMatchedCssRule[]>
  >;
  setPreviewSelectedPath: Dispatch<SetStateAction<number[] | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSidebarToolMode: Dispatch<
    SetStateAction<"edit" | "inspect" | "draw" | "move">
  >;
  shouldProcessPreviewPageSignal: (path: string) => boolean;
  syncPreviewActiveFile: (
    path: string,
    source: "load" | "navigate" | "path_changed" | "explorer",
    options?: { skipUnsavedPrompt?: boolean },
  ) => void;
};

export const usePreviewFrameMessages = ({
  EXPLORER_LOCK_TTL_MS,
  activeFileRef,
  appendPreviewConsole,
  applyPreviewDrawCreate,
  applyPreviewInlineEdit,
  applyPreviewInlineEditDraft,
  applyPreviewLocalCssPatchAtPath,
  closePendingPageSwitchPrompt,
  explorerSelectionLockRef,
  explorerSelectionLockUntilRef,
  extractMountRelativePath,
  filesRef,
  flushPendingPreviewSaves,
  getLivePreviewSelectedElement,
  getStablePreviewElementId,
  inlineEditDraftPendingRef,
  inlineEditDraftTimerRef,
  isActivePreviewMessageSource,
  isMountedPreview,
  isPageSwitchPromptBusy,
  isPageSwitchPromptOpen,
  previewSelectedElement,
  previewSelectedPath,
  previewSyncedFile,
  requestPreviewRefreshWithUnsavedGuard,
  requestSwitchToPreviewMode,
  resolveAdjacentSlidePath,
  resolveVirtualPathFromMountRelative,
  runRedo,
  runUndo,
  saveCodeDraftsRef,
  selectedPreviewHtml,
  selectedPreviewHtmlRef,
  setDirtyFiles,
  setInteractionMode,
  setIsCodePanelOpen,
  setIsLeftPanelOpen,
  setIsRightPanelOpen,
  setPreviewMode,
  setPreviewSelectedComputedStyles,
  setPreviewSelectedElement,
  setPreviewSelectedMatchedCssRules,
  setPreviewSelectedPath,
  setSelectedId,
  setSidebarToolMode,
  shouldProcessPreviewPageSignal,
  syncPreviewActiveFile,
}: UsePreviewFrameMessagesOptions) => {
  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent) => {
      if (!isActivePreviewMessageSource(event.source)) return;
      let payload = event.data as PreviewMessagePayload | undefined;
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
        if (key === "j") return;
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
        ) {
          return;
        }

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
            return;
          }
          explorerSelectionLockRef.current = null;
          explorerSelectionLockUntilRef.current = 0;
        }
        const lockAge = Date.now() - ((window as any).__explorerNavTime || 0);
        if (lockAge < 2500 && resolvedVirtualPath !== activeFileRef.current) {
          return;
        }
        const resolvedFile = filesRef.current[resolvedVirtualPath];
        if (!resolvedFile || resolvedFile.type !== "html") return;
        if (resolvedVirtualPath === activeFileRef.current) return;
        if (!shouldProcessPreviewPageSignal(resolvedVirtualPath)) return;
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
          id: getStablePreviewElementId(nextPath, liveElement.id, prev?.id),
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
        const stylePatch = normalizePresentationStylePatch(
          Object.entries(payload.styles)
            .map(([key, value]) => [key, value == null ? "" : String(value)])
            .reduce<Record<string, string>>((acc, [key, value]) => {
              acc[key] = value;
              return acc;
            }, {}),
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
        const stylePatch = normalizePresentationStylePatch(
          Object.entries(payload.styles || {})
            .map(([key, value]) => [key, value == null ? "" : String(value)])
            .reduce<Record<string, string>>((acc, [key, value]) => {
              acc[key] = value;
              return acc;
            }, {}),
        ) as Record<string, string>;
        void applyPreviewDrawCreate(nextParentPath, payload.tag, stylePatch);
        return;
      }

      if (payload.type !== "PREVIEW_SELECT") return;

      const nextPath = normalizePreviewPath(payload.path);
      if (!nextPath || nextPath.length === 0) return;

      const tag = (payload.tag || "div").toLowerCase();
      const sameSelectedPath =
        Array.isArray(previewSelectedPath) &&
        previewSelectedPath.length === nextPath.length &&
        previewSelectedPath.every(
          (segment, index) => segment === nextPath[index],
        );
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
              const sourcePath =
                typeof (rule as { sourcePath?: unknown }).sourcePath === "string"
                  ? String((rule as { sourcePath?: unknown }).sourcePath)
                  : undefined;
              const declarations = Array.isArray(rule.declarations)
                ? (rule.declarations
                    .map((declaration) => {
                      if (!declaration || typeof declaration !== "object") {
                        return null;
                      }
                      return typeof declaration.property === "string" &&
                        typeof declaration.value === "string"
                        ? {
                            property: declaration.property,
                            value: declaration.value,
                            important: Boolean(declaration.important),
                            active:
                              !("active" in declaration) ||
                              declaration.active === undefined
                                ? undefined
                                : Boolean(declaration.active),
                          }
                        : null;
                    })
                    .filter(Boolean) as PreviewMatchedCssDeclaration[])
                : [];
              if (!selector || declarations.length === 0) return null;
              return { selector, source, sourcePath, declarations };
            })
            .filter(Boolean) as PreviewMatchedCssRule[])
        : [];
      const liveElement = getLivePreviewSelectedElement(nextPath);
      const id = getStablePreviewElementId(
        nextPath,
        payload.id ? String(payload.id) : liveElement?.id || "",
        sameSelectedPath ? previewSelectedElement?.id : "",
      );
      const computedStyles =
        payloadComputedStyles || extractComputedStylesFromElement(liveElement);
      const liveMatchedCssRules = liveElement
        ? collectMatchedCssRulesFromElement(liveElement)
        : [];
      const liveHasStableSources = liveMatchedCssRules.some(
        (rule) => !isTemporaryMatchedRuleSource(rule.source),
      );
      const payloadHasStableSources = payloadMatchedCssRules.some(
        (rule) => !isTemporaryMatchedRuleSource(rule.source),
      );
      const matchedCssRules =
        liveMatchedCssRules.length === 0
          ? payloadMatchedCssRules
          : payloadMatchedCssRules.length === 0
            ? liveMatchedCssRules
            : liveHasStableSources || !payloadHasStableSources
              ? liveMatchedCssRules
              : payloadMatchedCssRules;

      const payloadText =
        typeof payload.text === "string" ? payload.text.trim() : "";
      const payloadHtml = typeof payload.html === "string" ? payload.html : "";
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
      const liveAttributes = extractCustomAttributesFromElement(liveElement) || {};

      let savedHtmlText = "";
      let savedHtmlMarkup = "";
      let savedHtmlAttributes: Record<string, string> = {};

      if (
        ((!payloadText && !liveText) || (!payloadHtml && !liveHtml)) &&
        selectedPreviewHtml &&
        nextPath.length > 0
      ) {
        try {
          const savedHtmlContent = filesRef.current[selectedPreviewHtml]?.content;
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
        } catch {}
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
        Object.keys(mergedAttributes).length > 0 ? mergedAttributes : undefined;

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

      const nextElement: VirtualElement = {
        id,
        type: tag as any,
        name: tag.toUpperCase(),
        content: editableText,
        html: editableHtml,
        src: resolvedSrc,
        href: resolvedHref,
        className:
          typeof payload.className === "string" && payload.className.length > 0
            ? payload.className
            : undefined,
        attributes: resolvedAttributes,
        styles: inlineStyles,
        animation: resolvedAnimation || undefined,
        children: [],
        path: nextPath,
      };

      setPreviewSelectedPath(nextPath);
      setPreviewSelectedElement(nextElement);
      setPreviewSelectedComputedStyles(computedStyles);
      setPreviewSelectedMatchedCssRules(matchedCssRules);
      setSelectedId(null);
      setIsCodePanelOpen(false);
      setIsRightPanelOpen(true);
    };

    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
  }, [
    EXPLORER_LOCK_TTL_MS,
    activeFileRef,
    appendPreviewConsole,
    applyPreviewDrawCreate,
    applyPreviewInlineEdit,
    applyPreviewInlineEditDraft,
    applyPreviewLocalCssPatchAtPath,
    closePendingPageSwitchPrompt,
    explorerSelectionLockRef,
    explorerSelectionLockUntilRef,
    extractMountRelativePath,
    filesRef,
    flushPendingPreviewSaves,
    getLivePreviewSelectedElement,
    getStablePreviewElementId,
    inlineEditDraftPendingRef,
    inlineEditDraftTimerRef,
    isActivePreviewMessageSource,
    isMountedPreview,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    previewSelectedElement?.id,
    previewSelectedPath,
    previewSyncedFile,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    resolveAdjacentSlidePath,
    resolveVirtualPathFromMountRelative,
    runRedo,
    runUndo,
    saveCodeDraftsRef,
    selectedPreviewHtml,
    selectedPreviewHtmlRef,
    setDirtyFiles,
    setInteractionMode,
    setIsCodePanelOpen,
    setIsLeftPanelOpen,
    setIsRightPanelOpen,
    setPreviewMode,
    setPreviewSelectedComputedStyles,
    setPreviewSelectedElement,
    setPreviewSelectedMatchedCssRules,
    setPreviewSelectedPath,
    setSelectedId,
    setSidebarToolMode,
    shouldProcessPreviewPageSignal,
    syncPreviewActiveFile,
  ]);
};
