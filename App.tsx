import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { flushSync } from "react-dom";
import { INITIAL_ROOT } from "./constants";
import {
  VirtualElement,
  FileMap,
  HistoryState,
} from "./types";
import * as Neutralino from "@neutralinojs/lib";
import { Provider } from "react-redux";
import { store } from "./src/store";
import {
  setIsOpen,
} from "./src/store/annotationSlice";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./src/store";
import AppOverlays from "./app/ui/AppOverlays";
import AppTopLevelLayers from "./app/ui/AppTopLevelLayers";
import LeftSidebarShell from "./app/ui/LeftSidebarShell";
import MainStageShell from "./app/ui/MainStageShell";
import RightInspectorShell from "./app/ui/RightInspectorShell";
import {
  persistPreviewHtmlContent as persistPreviewHtmlContentHelper,
} from "./app/helpers/previewSelectionHelpers";
import ScreenshotGalleryPanel from "./app/ui/ScreenshotGalleryPanel";
import { useCodeEditorState } from "./app/hooks/editor/useCodeEditorState";
import { usePreviewContentEditing } from "./app/hooks/preview/usePreviewContentEditing";
import { usePreviewElementActions } from "./app/hooks/preview/usePreviewElementActions";
import { usePreviewGeometry } from "./app/hooks/preview/usePreviewGeometry";
import { usePreviewCreation } from "./app/hooks/preview/usePreviewCreation";
import { usePreviewCssMutation } from "./app/hooks/preview/usePreviewCssMutation";
import { usePreviewDocumentLoader } from "./app/hooks/preview/usePreviewDocumentLoader";
import { usePreviewInspectorRuntime } from "./app/hooks/preview/usePreviewInspectorRuntime";
import { usePreviewFrameMessages } from "./app/hooks/preview/usePreviewFrameMessages";
import { usePreviewFrameBridgeState } from "./app/hooks/preview/usePreviewFrameBridgeState";
import { usePreviewConsole } from "./app/hooks/preview/usePreviewConsole";
import { useConfigModalFlow } from "./app/hooks/workflow/useConfigModalFlow";
import { usePreviewHistoryFlow } from "./app/hooks/preview/usePreviewHistoryFlow";
import { usePdfAnnotationWorkflow } from "./app/hooks/workflow/usePdfAnnotationWorkflow";
import { usePageSwitchFlow } from "./app/hooks/workflow/usePageSwitchFlow";
import { useProjectFileActions } from "./app/hooks/workflow/useProjectFileActions";
import { usePanelLayoutState } from "./app/hooks/layout/usePanelLayoutState";
import { useStageLayoutState } from "./app/hooks/layout/useStageLayoutState";
import { useScreenshotGallery } from "./app/hooks/workflow/useScreenshotGallery";
import { useAppShellControls } from "./app/hooks/shell/useAppShellControls";
import { useTopLevelLayersViewModel } from "./app/hooks/viewModels/useTopLevelLayersViewModel";
import { useLeftSidebarViewModel } from "./app/hooks/viewModels/useLeftSidebarViewModel";
import { useMainStageViewModel } from "./app/hooks/viewModels/useMainStageViewModel";
import { useRightInspectorViewModel } from "./app/hooks/viewModels/useRightInspectorViewModel";
import { useScreenshotGalleryViewModel } from "./app/hooks/viewModels/useScreenshotGalleryViewModel";
import { useAppOverlaysViewModel } from "./app/hooks/viewModels/useAppOverlaysViewModel";
import { useCanvasEditingHandlers } from "./app/hooks/canvas/useCanvasEditingHandlers";
import { usePreviewSelectionState } from "./app/hooks/preview/usePreviewSelectionState";
import {
  PreviewMatchedCssRule,
  PreviewMatchedRuleMutation,
} from "./app/helpers/previewCssHelpers";
import {
  normalizePath,
  THEME_STORAGE_KEY,
  PREVIEW_AUTOSAVE_STORAGE_KEY,
  PANEL_SIDE_STORAGE_KEY,
  SHOW_SCREENSHOT_FEATURES,
  MAX_CANVAS_HISTORY,
  MAX_PREVIEW_CONSOLE_ENTRIES,
  MAX_PREVIEW_DOC_CACHE_ENTRIES,
  MAX_PREVIEW_DOC_CACHE_CHARS,
  SHARED_FONT_VIRTUAL_DIR,
  PRESENTATION_CSS_VIRTUAL_PATH,
  FONT_CACHE_VERSION,
  DEFAULT_EDITOR_FONTS,
  FontCachePayload,
  MaybeViewTransitionDocument,
  dedupeFontFamilies,
  buildEditorFontOptions,
  parsePresentationCssFontFamilies,
  deriveFontFamilyFromFontFileName,
  fontFormatFromFileName,
  inferFileType,
  relativePathBetweenVirtualFiles,
  mimeFromType,
  toByteArray,
  normalizeProjectRelative,
  findFilePathCaseInsensitive,
  readElementByPath,
  toPreviewLayerId,
  PreviewHistoryEntry,
  PreviewSelectionMode,
} from "./app/helpers/appHelpers";

const RECENT_PROJECTS_STORAGE_KEY = "nocodex_recent_projects_v1";
const PDF_ANNOTATION_CACHE_KEY = "nocodex_pdf_annotation_cache_v1";

const App: React.FC = () => {
  // --- Redux Dispatch Setup ---
  const dispatch = useDispatch();
  const {
    records: pdfAnnotationRecords,
    error: pdfAnnotationError,
    isOpen: isPdfAnnotationPanelOpen,
    isLoading: isPdfAnnotationLoading,
    focusedAnnotation: focusedPdfAnnotation,
    typeFilter: pdfAnnotationTypeFilter,
    processingLogs: pdfAnnotationProcessingLogs,
  } = useSelector((state: RootState) => state.annotations);

  // --- Neutralino Setup ---
  useEffect(() => {
    Neutralino.events.on("ready", () =>
      console.log("Neutralino functionality is ready."),
    );
  }, []);

  // --- State ---
  const [root, setRoot] = useState<VirtualElement>(INITIAL_ROOT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, setHistory] = useState<HistoryState>({
    past: [],
    present: INITIAL_ROOT,
    future: [],
  });
  const [files, setFiles] = useState<FileMap>({});
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed
            .filter((entry) => typeof entry === "string" && entry.trim())
            .slice(0, 5)
        : [];
    } catch {
      return [];
    }
  });
  const [previewMountBasePath, setPreviewMountBasePath] = useState<
    string | null
  >(null);
  const [isPreviewMountReady, setIsPreviewMountReady] = useState(false);
  const [activeFile, setActiveFileRaw] = useState<string | null>(null);
  const setActiveFile = useCallback(
    (path: string | null | ((prev: string | null) => string | null)) => {
      setActiveFileRaw((prev) => {
        const next = typeof path === "function" ? path(prev) : path;
        console.log("[DEBUG] activeFile changing from", prev, "to", next);
        return next;
      });
    },
    [],
  );
  const [previewSyncedFile, setPreviewSyncedFile] = useState<string | null>(
    null,
  );
  const [previewNavigationFile, setPreviewNavigationFile] = useState<
    string | null
  >(null);
  const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile" | "tablet">(
    "tablet",
  );
  const [interactionMode, setInteractionMode] = useState<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >("edit");
  const [sidebarToolMode, setSidebarToolMode] = useState<
    "edit" | "inspect" | "draw" | "move"
  >("edit");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("preview");
  const [previewSelectionMode, setPreviewSelectionMode] =
    useState<PreviewSelectionMode>("default");
  const [availableFonts, setAvailableFonts] =
    useState<string[]>(DEFAULT_EDITOR_FONTS);
  const [drawElementTag, setDrawElementTag] = useState<string>("div");
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
  const [isDetachedEditorOpen, setIsDetachedEditorOpen] = useState(false);
  const [isStyleInspectorSectionOpen, setIsStyleInspectorSectionOpen] =
    useState(true);
  const [codeDraftByPath, setCodeDraftByPath] = useState<
    Record<string, string>
  >({});
  const [codeDirtyPathSet, setCodeDirtyPathSet] = useState<
    Record<string, true>
  >({});
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      // Ignore storage errors and use default theme.
    }
    return "light";
  });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREVIEW_AUTOSAVE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [panelSide, setPanelSide] = useState<"default" | "swapped">(() => {
    try {
      return localStorage.getItem(PANEL_SIDE_STORAGE_KEY) === "swapped"
        ? "swapped"
        : "default";
    } catch {
      return "default";
    }
  });
  const isPanelsSwapped = panelSide === "swapped";
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const [dirtyPathKeysByFile, setDirtyPathKeysByFile] = useState<
    Record<string, string[]>
  >({});
  // PDF Annotation local states removed and managed by Redux.

  // Design Revamp States
  const [mobileFrameStyle, setMobileFrameStyle] = useState<
    "dynamic-island" | "punch-hole" | "notch"
  >("dynamic-island");
  const [desktopResolution, setDesktopResolution] = useState<
    "1080p" | "1.5k" | "2k" | "4k" | "resizable"
  >("1080p");
  const [tabletModel, setTabletModel] = useState<"ipad" | "ipad-pro">("ipad");
  const [tabletOrientation, setTabletOrientation] = useState<
    "portrait" | "landscape"
  >("landscape");
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
  const [previewFrameLoadNonce, setPreviewFrameLoadNonce] = useState(0);
  const [frameZoom, setFrameZoom] = useState<50 | 75 | 100>(100);
  const [deviceCtxMenu, setDeviceCtxMenu] = useState<{
    type: "mobile" | "desktop" | "tablet";
    x: number;
    y: number;
  } | null>(null);

  const [isToolboxDragging, setIsToolboxDragging] = useState(false);
  const toolboxDragTypeRef = useRef("");
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState("");
  const [previewSelectedPath, setPreviewSelectedPath] = useState<
    number[] | null
  >(null);
  const [previewSelectedElement, setPreviewSelectedElement] =
    useState<VirtualElement | null>(null);
  const [previewSelectedComputedStyles, setPreviewSelectedComputedStyles] =
    useState<React.CSSProperties | null>(null);
  const [previewSelectedMatchedCssRules, setPreviewSelectedMatchedCssRules] =
    useState<PreviewMatchedCssRule[]>([]);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const previewFocusedPdfElementRef = useRef<HTMLElement | null>(null);
  const [quickTextEdit, setQuickTextEdit] = useState<{
    open: boolean;
    x: number;
    y: number;
  }>({ open: false, x: 0, y: 0 });
  const quickTextEditRef = useRef<HTMLDivElement | null>(null);
  const quickTextRangeRef = useRef<Range | null>(null);
  const QUICK_TEXT_PANEL_WIDTH = 320;
  const QUICK_TEXT_PANEL_HEIGHT = 220;
  const showQuickTextEdit = useCallback((x: number, y: number) => {
    setQuickTextEdit({ open: true, x, y });
  }, []);
  const hideQuickTextEdit = useCallback(() => {
    setQuickTextEdit((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, []);
  const positionQuickTextEditAtRange = useCallback(
    (range: Range) => {
      const frame = previewFrameRef.current;
      if (!frame) return;
      const rect = range.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        hideQuickTextEdit();
        return;
      }
      const frameRect = frame.getBoundingClientRect();
      const spacing = 12;
      const rightX = frameRect.left + rect.right + spacing;
      const leftX =
        frameRect.left + rect.left - QUICK_TEXT_PANEL_WIDTH - spacing;
      let nextX = rightX;
      if (nextX + QUICK_TEXT_PANEL_WIDTH > frameRect.right - spacing) {
        nextX = leftX;
      }
      nextX = Math.max(
        frameRect.left + spacing,
        Math.min(nextX, frameRect.right - QUICK_TEXT_PANEL_WIDTH - spacing),
      );
      const nextY = Math.max(
        frameRect.top + spacing,
        Math.min(
          frameRect.top + rect.top,
          frameRect.bottom - QUICK_TEXT_PANEL_HEIGHT - spacing,
        ),
      );
      showQuickTextEdit(nextX, nextY);
    },
    [hideQuickTextEdit, showQuickTextEdit],
  );
  const filePathIndexRef = useRef<Record<string, string>>({});
  const presentationCssPathRef = useRef<string | null>(null);
  const fontCachePathRef = useRef<string | null>(null);
  const previewRootAliasPathRef = useRef<string | null>(null);
  const loadingFilesRef = useRef<Set<string>>(new Set());
  const loadingFilePromisesRef = useRef<
    Partial<Record<string, Promise<string | undefined>>>
  >({});
  const textFileCacheRef = useRef<Record<string, string>>({});
  const binaryAssetUrlCacheRef = useRef<Record<string, string>>({});
  const previewDependencyIndexRef = useRef<Record<string, string[]>>({});
  const filesRef = useRef<FileMap>({});
  const activeFileRef = useRef<string | null>(null);
  const selectedPreviewHtmlRef = useRef<string | null>(null);
  const interactionModeRef = useRef<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >("edit");
  const previewModeRef = useRef<"edit" | "preview">("preview");
  const lastPreviewSyncRef = useRef<{
    path: string;
    at: number;
    source: "load" | "navigate" | "path_changed" | "explorer";
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const appRootRef = useRef<HTMLDivElement>(null);
  const pendingPopupOpenRef = useRef<{
    selector: string | null;
    popupId: string | null;
  } | null>(null);
  const isRefreshingFilesRef = useRef(false);
  const saveCodeDraftsRef = useRef<(() => Promise<void>) | null>(null);
  const pendingPreviewWritesRef = useRef<Record<string, string>>({});
  const codeDraftByPathRef = useRef<Record<string, string>>({});
  const codeDirtyPathSetRef = useRef<Record<string, true>>({});
  const dirtyFilesRef = useRef<string[]>([]);
  const previewHistoryRef = useRef<Record<string, PreviewHistoryEntry>>({});
  const previewDocCacheRef = useRef<Record<string, string>>({});
  const previewDocCacheOrderRef = useRef<string[]>([]);
  const inlineEditDraftTimerRef = useRef<number | null>(null);
  const inlineEditDraftPendingRef = useRef<{
    filePath: string;
    elementPath: number[];
    html: string;
  } | null>(null);
  const previewStyleDraftPendingRef = useRef<{
    filePath: string;
    elementPath: number[];
    styles: Partial<React.CSSProperties>;
  } | null>(null);
  const previewLocalCssDraftPendingRef = useRef<{
    elementPath: number[];
    rule: PreviewMatchedRuleMutation;
    styles: Partial<React.CSSProperties>;
  } | null>(null);
  const applyPreviewDropCreateRef = useRef<
    ((type: string, clientX: number, clientY: number) => Promise<void>) | null
  >(null);
  const explorerSelectionLockRef = useRef<string | null>(null);
  const explorerSelectionLockUntilRef = useRef<number>(0);
  const themeTransitionInFlightRef = useRef(false);
  const lastPreviewPageSignalRef = useRef<{ path: string; at: number } | null>(
    null,
  );
  const previewStyleDraftTimerRef = useRef<number | null>(null);
  const previewLocalCssDraftTimerRef = useRef<number | null>(null);
  const BASE_STAGE_PADDING = 40;
  const EXPLORER_LOCK_TTL_MS = 6000;
  const {
    CODE_PANEL_WIDTH,
    LEFT_PANEL_COLLAPSED_WIDTH,
    bothPanelsOpen,
    floatingHorizontalInset,
    getDefaultRightPanelPosition,
    handleLeftPanelResizeStart,
    handleLeftPanelStretchToggle,
    handleRightPanelDragStart,
    handleRightPanelResizeStart,
    isDraggingRightPanel,
    isFloatingPanels,
    isLeftPanelOpen,
    isResizingLeftPanel,
    isResizingRightPanel,
    isRightPanelOpen,
    leftPanelWidth,
    rightOverlayInset,
    rightPanelFloatingPosition,
    rightPanelManualClosedRef,
    rightPanelMode,
    rightPanelRestorePendingRef,
    rightPanelWidth,
    setIsLeftPanelOpen,
    setIsRightPanelOpen,
    setRightPanelFloatingPosition,
    setRightPanelMode,
  } = usePanelLayoutState({
    appRootRef,
    deviceMode,
    interactionMode,
    quickTextEdit,
  });
  const {
    appendPreviewConsole,
    clearPreviewConsole,
    handleOpenDetachedConsole,
    isCompactConsoleOpening,
    previewConsoleErrorCount,
  } = usePreviewConsole({
    maxEntries: MAX_PREVIEW_CONSOLE_ENTRIES,
    theme,
  });

  const revokeBinaryAssetUrls = useCallback(() => {
    const cache = binaryAssetUrlCacheRef.current;
    for (const url of Object.values(cache)) {
      if (typeof url === "string" && url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revoke failures for stale object URLs.
        }
      }
    }
    binaryAssetUrlCacheRef.current = {};
  }, []);

  const invalidatePreviewDocCache = useCallback((path: string) => {
    if (!path) return;
    delete previewDocCacheRef.current[path];
    previewDocCacheOrderRef.current = previewDocCacheOrderRef.current.filter(
      (item) => item !== path,
    );
  }, []);

  const invalidatePreviewDocsForDependency = useCallback(
    (dependencyPath: string) => {
      const normalizedDependency = normalizeProjectRelative(
        dependencyPath || "",
      ).toLowerCase();
      if (!normalizedDependency) return;
      Object.entries(previewDependencyIndexRef.current).forEach(
        ([previewPath, dependencies]) => {
          if (
            dependencies.some(
              (dependency) =>
                normalizeProjectRelative(dependency || "").toLowerCase() ===
                normalizedDependency,
            )
          ) {
            invalidatePreviewDocCache(previewPath);
          }
        },
      );
    },
    [invalidatePreviewDocCache],
  );

  const cachePreviewDoc = useCallback((path: string, doc: string) => {
    if (!path) return;
    previewDocCacheRef.current[path] = doc;
    const nextOrder = previewDocCacheOrderRef.current.filter(
      (item) => item !== path,
    );
    nextOrder.push(path);

    let totalChars = nextOrder.reduce(
      (sum, key) => sum + (previewDocCacheRef.current[key]?.length || 0),
      0,
    );
    while (
      nextOrder.length > MAX_PREVIEW_DOC_CACHE_ENTRIES ||
      totalChars > MAX_PREVIEW_DOC_CACHE_CHARS
    ) {
      const evicted = nextOrder.shift();
      if (!evicted) break;
      totalChars -= previewDocCacheRef.current[evicted]?.length || 0;
      delete previewDocCacheRef.current[evicted];
    }

    previewDocCacheOrderRef.current = nextOrder;
  }, []);

  useEffect(() => {
    const next: FileMap = { ...files };
    for (const [path, content] of Object.entries(
      textFileCacheRef.current,
    ) as Array<[string, string]>) {
      const existing = next[path];
      if (
        existing &&
        (typeof existing.content !== "string" || existing.content.length === 0)
      ) {
        next[path] = { ...existing, content };
      }
    }
    for (const [path, content] of Object.entries(
      binaryAssetUrlCacheRef.current,
    ) as Array<[string, string]>) {
      const existing = next[path];
      if (
        existing &&
        (typeof existing.content !== "string" || existing.content.length === 0)
      ) {
        next[path] = { ...existing, content };
      }
    }
    filesRef.current = next;
  }, [files]);
  useEffect(() => {
    return () => {
      revokeBinaryAssetUrls();
      if (inlineEditDraftTimerRef.current !== null) {
        window.clearTimeout(inlineEditDraftTimerRef.current);
      }
    };
  }, [revokeBinaryAssetUrls]);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);
  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);
  useEffect(() => {
    previewModeRef.current = previewMode;
  }, [previewMode]);
  useEffect(() => {
    codeDraftByPathRef.current = codeDraftByPath;
  }, [codeDraftByPath]);
  useEffect(() => {
    codeDirtyPathSetRef.current = codeDirtyPathSet;
  }, [codeDirtyPathSet]);
  useEffect(() => {
    dirtyFilesRef.current = dirtyFiles;
  }, [dirtyFiles]);
  const setActiveFileStable = useCallback((nextPath: string | null) => {
    activeFileRef.current = nextPath;
    setActiveFile((prev) => (prev === nextPath ? prev : nextPath));
  }, []);

  const persistLoadedContentToState = useCallback(
    (path: string, content: string) => {
      setFiles((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        if (
          typeof existing.content === "string" &&
          existing.content.length > 0 &&
          existing.content === content
        ) {
          return prev;
        }
        return {
          ...prev,
          [path]: {
            ...existing,
            content,
          },
        };
      });
    },
    [],
  );

  const loadFileContent = useCallback(
    async (
      relativePath: string,
      options?: {
        persistToState?: boolean;
      },
    ) => {
      const persistToState = options?.persistToState ?? true;
      const target = filesRef.current[relativePath];
      if (!target) return;

      if (typeof target.content === "string" && target.content.length > 0) {
        if (target.type === "image" || target.type === "font") {
          binaryAssetUrlCacheRef.current[relativePath] = target.content;
          return target.content;
        }
        textFileCacheRef.current[relativePath] = target.content;
        if (persistToState) {
          persistLoadedContentToState(relativePath, target.content);
        }
        return target.content;
      }

      const cachedText = textFileCacheRef.current[relativePath];
      if (typeof cachedText === "string" && cachedText.length > 0) {
        if (persistToState) {
          persistLoadedContentToState(relativePath, cachedText);
        }
        return cachedText;
      }

      const cachedBinary = binaryAssetUrlCacheRef.current[relativePath];
      if (
        (target.type === "image" || target.type === "font") &&
        typeof cachedBinary === "string" &&
        cachedBinary.length > 0
      ) {
        return cachedBinary;
      }

      const existingPending = loadingFilePromisesRef.current[relativePath];
      if (existingPending) {
        if (
          !persistToState ||
          target.type === "image" ||
          target.type === "font"
        ) {
          return existingPending;
        }
        return existingPending.then((content) => {
          if (typeof content === "string" && content.length > 0) {
            persistLoadedContentToState(relativePath, content);
          }
          return content;
        });
      }

      const absolutePath = filePathIndexRef.current[relativePath];
      if (!absolutePath) return;

      const pending = (async (): Promise<string | undefined> => {
        loadingFilesRef.current.add(relativePath);
        try {
          let content = "";
          if (target.type === "image" || target.type === "font") {
            const binaryData = await (
              Neutralino as any
            ).filesystem.readBinaryFile(absolutePath);
            const bytes = toByteArray(binaryData);
            if (bytes.length === 0) return;
            const mime = mimeFromType(target.type, target.name);
            const sourceBuffer = bytes.buffer;
            const binaryBuffer: ArrayBuffer =
              sourceBuffer instanceof ArrayBuffer
                ? sourceBuffer.slice(
                    bytes.byteOffset,
                    bytes.byteOffset + bytes.byteLength,
                  )
                : (() => {
                    const copy = new Uint8Array(bytes.byteLength);
                    copy.set(bytes);
                    return copy.buffer;
                  })();
            const blob = new Blob([binaryBuffer], { type: mime });
            const previousUrl = binaryAssetUrlCacheRef.current[relativePath];
            if (previousUrl && previousUrl.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(previousUrl);
              } catch {
                // Ignore stale blob revocation errors.
              }
            }
            content = URL.createObjectURL(blob);
            binaryAssetUrlCacheRef.current[relativePath] = content;
          } else {
            const loaded = await (Neutralino as any).filesystem.readFile(
              absolutePath,
            );
            content =
              typeof loaded === "string" ? loaded : String(loaded || "");
            if (content.length > 0) {
              textFileCacheRef.current[relativePath] = content;
            }
          }

          const existingRefEntry = filesRef.current[relativePath];
          if (existingRefEntry) {
            filesRef.current = {
              ...filesRef.current,
              [relativePath]: {
                ...existingRefEntry,
                content,
              },
            };
          }

          if (persistToState && content.length > 0) {
            persistLoadedContentToState(relativePath, content);
          }

          return content;
        } catch (error) {
          console.warn(
            `Failed loading file content for ${relativePath}:`,
            error,
          );
        } finally {
          loadingFilesRef.current.delete(relativePath);
          delete loadingFilePromisesRef.current[relativePath];
        }
      })();

      loadingFilePromisesRef.current[relativePath] = pending;
      return pending;
    },
    [persistLoadedContentToState],
  );
  const persistProjectFontCache = useCallback(
    async (fontFamilies: string[]) => {
      const cacheVirtualPath = fontCachePathRef.current;
      if (!cacheVirtualPath) return;
      const cacheAbsolutePath = filePathIndexRef.current[cacheVirtualPath];
      if (!cacheAbsolutePath) return;
      const payload: FontCachePayload = {
        version: FONT_CACHE_VERSION,
        source: "presentation.css",
        generatedAt: new Date().toISOString(),
        fonts: dedupeFontFamilies(fontFamilies),
      };
      const serialized = JSON.stringify(payload, null, 2);
      try {
        await (Neutralino as any).filesystem.writeFile(
          cacheAbsolutePath,
          serialized,
        );
      } catch (error) {
        console.warn("Failed to write font cache file:", error);
        return;
      }
      setFiles((prev) => {
        const existing = prev[cacheVirtualPath];
        const name = cacheVirtualPath.includes("/")
          ? cacheVirtualPath.slice(cacheVirtualPath.lastIndexOf("/") + 1)
          : cacheVirtualPath;
        if (existing) {
          return {
            ...prev,
            [cacheVirtualPath]: {
              ...existing,
              content: serialized,
            },
          };
        }
        return {
          ...prev,
          [cacheVirtualPath]: {
            path: cacheVirtualPath,
            name,
            type: inferFileType(name),
            content: serialized,
          },
        };
      });
    },
    [],
  );
  const handleAddFontToPresentationCss = useCallback(
    async (rawFontPath: string) => {
      const fontPath = normalizeProjectRelative(rawFontPath);
      const file = filesRef.current[fontPath];
      if (!file || file.type !== "font") return;
      if (!fontPath.toLowerCase().startsWith(`${SHARED_FONT_VIRTUAL_DIR}/`)) {
        window.alert(
          `Font must be inside "${SHARED_FONT_VIRTUAL_DIR}" to register.`,
        );
        return;
      }

      const presentationPath =
        presentationCssPathRef.current ??
        findFilePathCaseInsensitive(
          filesRef.current,
          PRESENTATION_CSS_VIRTUAL_PATH,
        );
      if (!presentationPath) {
        window.alert(
          `presentation.css not found at "${PRESENTATION_CSS_VIRTUAL_PATH}".`,
        );
        return;
      }
      presentationCssPathRef.current = presentationPath;
      const presentationAbsolutePath =
        filePathIndexRef.current[presentationPath];
      if (!presentationAbsolutePath) {
        window.alert("Unable to resolve presentation.css absolute path.");
        return;
      }

      let currentCss = "";
      try {
        const rawCss = await (Neutralino as any).filesystem.readFile(
          presentationAbsolutePath,
        );
        currentCss = typeof rawCss === "string" ? rawCss : String(rawCss || "");
      } catch (error) {
        console.warn("Failed reading presentation.css:", error);
        window.alert("Unable to read presentation.css.");
        return;
      }

      const family = deriveFontFamilyFromFontFileName(file.name);
      const existingFamilies = parsePresentationCssFontFamilies(currentCss);
      const alreadyRegistered = existingFamilies.some(
        (name) => name.toLowerCase() === family.toLowerCase(),
      );
      if (alreadyRegistered) {
        setAvailableFonts(buildEditorFontOptions(existingFamilies));
        await persistProjectFontCache(existingFamilies);
        return;
      }

      const relativeFontPath = relativePathBetweenVirtualFiles(
        presentationPath,
        fontPath,
      );
      const fontFormat = fontFormatFromFileName(file.name);
      const fontFaceBlock =
        `@font-face {\n` +
        `  font-family: '${family}';\n` +
        `  src: url('${relativeFontPath}') format('${fontFormat}');\n` +
        `  font-weight: normal;\n` +
        `  font-style: normal;\n` +
        `  font-display: swap;\n` +
        `}`;
      const nextCss = `${currentCss.trimEnd()}\n\n${fontFaceBlock}\n`;

      try {
        await (Neutralino as any).filesystem.writeFile(
          presentationAbsolutePath,
          nextCss,
        );
      } catch (error) {
        console.warn("Failed writing presentation.css:", error);
        window.alert("Unable to update presentation.css.");
        return;
      }

      setFiles((prev) => {
        const existing = prev[presentationPath];
        if (!existing) return prev;
        return {
          ...prev,
          [presentationPath]: {
            ...existing,
            content: nextCss,
          },
        };
      });
      const nextProjectFamilies = parsePresentationCssFontFamilies(nextCss);
      setAvailableFonts(buildEditorFontOptions(nextProjectFamilies));
      await persistProjectFontCache(nextProjectFamilies);
    },
    [persistProjectFontCache],
  );
  const shouldProcessPreviewPageSignal = useCallback((path: string) => {
    if (!path) return false;

    // GUARD: Ignore common system/bridge files that cause sync loops
    const lower = path.toLowerCase();
    if (
      lower.includes("shared/index.html") ||
      lower.includes("__bridge.html") ||
      lower.includes("vibe-bridge.html")
    ) {
      return false;
    }

    const now = Date.now();
    const last = lastPreviewPageSignalRef.current;
    if (last && last.path === path && now - last.at < 700) {
      return false;
    }
    lastPreviewPageSignalRef.current = { path, at: now };
    return true;
  }, []);
  useEffect(() => {
    console.log("Both panels open?", bothPanelsOpen, {
      isLeftPanelOpen,
      isRightPanelOpen,
      deviceMode,
    });
  }, [bothPanelsOpen, isLeftPanelOpen, isRightPanelOpen, deviceMode]);
  useLayoutEffect(() => {
    if (
      (bothPanelsOpen || floatingHorizontalInset > 0) &&
      scrollerRef.current
    ) {
      const el = scrollerRef.current;
      const alignInitialScroll = () => {
        // Center default view; user can still scroll both sides manually.
        el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      };

      // Multiple attempts while transitions settle.
      alignInitialScroll();
      requestAnimationFrame(() => {
        alignInitialScroll();
        setTimeout(alignInitialScroll, 100);
        setTimeout(alignInitialScroll, 300);
        setTimeout(alignInitialScroll, 550);
        setTimeout(alignInitialScroll, 700);
      });
    }
  }, [
    bothPanelsOpen,
    floatingHorizontalInset,
    desktopResolution,
    deviceMode,
    isLeftPanelOpen,
    isRightPanelOpen,
  ]);
  useLayoutEffect(() => {
    if (!scrollerRef.current) return;
    const el = scrollerRef.current;
    const recenter = () => {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    };
    recenter();
    requestAnimationFrame(() => {
      recenter();
      setTimeout(recenter, 120);
      setTimeout(recenter, 260);
    });
  }, [frameZoom]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors.
    }
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem(
        PREVIEW_AUTOSAVE_STORAGE_KEY,
        autoSaveEnabled ? "1" : "0",
      );
    } catch {
      // Ignore storage errors.
    }
  }, [autoSaveEnabled]);
  useEffect(() => {
    try {
      localStorage.setItem(
        RECENT_PROJECTS_STORAGE_KEY,
        JSON.stringify(recentProjects.slice(0, 5)),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [recentProjects]);
  useEffect(
    () => () => {
      if (previewStyleDraftTimerRef.current !== null) {
        window.clearTimeout(previewStyleDraftTimerRef.current);
      }
      if (previewLocalCssDraftTimerRef.current !== null) {
        window.clearTimeout(previewLocalCssDraftTimerRef.current);
      }
    },
    [],
  );

  // --- History Management ---
  const pushHistory = useCallback((newState: VirtualElement) => {
    setHistory((curr) => ({
      past: [...curr.past.slice(-(MAX_CANVAS_HISTORY - 1)), curr.present],
      present: newState,
      future: [],
    }));
    setRoot(newState);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, -1);
      setRoot(previous);
      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);
      setRoot(next);
      return {
        past: [...curr.past.slice(-(MAX_CANVAS_HISTORY - 1)), curr.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);
  const {
    discardUnsavedChangesForFile,
    flushPendingPreviewSaves,
    markPreviewPathDirty,
    pushPreviewHistory,
    runRedo,
    runUndo,
    schedulePreviewAutoSave,
  } = usePreviewHistoryFlow({
    autoSaveEnabled,
    cachePreviewDoc,
    codeDirtyPathSet,
    codeDirtyPathSetRef,
    codeDraftByPath,
    codeDraftByPathRef,
    dirtyFilesRef,
    filePathIndexRef,
    filesRef,
    handleRedo,
    handleUndo,
    interactionModeRef,
    invalidatePreviewDocCache,
    pendingPreviewWritesRef,
    previewDependencyIndexRef,
    previewFrameRef,
    previewHistoryRef,
    selectedPreviewHtmlRef,
    setCodeDraftByPath,
    setCodeDirtyPathSet,
    setDirtyFiles,
    setDirtyPathKeysByFile,
    setFiles,
    setPreviewRefreshNonce,
    setSelectedPreviewDoc,
    textFileCacheRef,
  });
  const commitPreviewRefresh = useCallback(() => {
    setPreviewRefreshNonce((prev) => prev + 1);
  }, []);
  const {
    closePendingPageSwitchPrompt,
    handleSelectFile,
    hasUnsavedChangesForFile,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    pendingPageSwitch,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    resolvePendingPageSwitchWithDiscard,
    resolvePendingPageSwitchWithSave,
    setIsPageSwitchPromptOpen,
    setPendingPageSwitch,
    syncPreviewActiveFile,
  } = usePageSwitchFlow({
    EXPLORER_LOCK_TTL_MS,
    activeFileRef,
    codeDirtyPathSetRef,
    codeDraftByPathRef,
    commitPreviewRefresh,
    dirtyFilesRef,
    discardUnsavedChangesForFile,
    explorerSelectionLockRef,
    explorerSelectionLockUntilRef,
    filesRef,
    flushPendingPreviewSaves,
    interactionModeRef,
    lastPreviewSyncRef,
    pendingPreviewWritesRef,
    previewModeRef,
    previewSyncedFile,
    saveCodeDraftsRef,
    selectedPreviewHtmlRef,
    setActiveFileStable,
    setInteractionMode,
    setIsLeftPanelOpen,
    setPreviewMode,
    setPreviewNavigationFile,
    setPreviewRefreshNonce,
    setPreviewSyncedFile,
  });
  const {
    configModalInitialTab,
    configPathForModal,
    handleChooseFolderCloneSource,
    handleOpenConfigModal,
    handleSaveConfig,
    isConfigModalOpen,
    isConfigModalSlidesOnly,
    portfolioPathForModal,
    selectedFolderCloneSource,
    setIsConfigModalOpen,
    setSelectedFolderCloneSource,
  } = useConfigModalFlow({
    dirtyFilesRef,
    filePathIndexRef,
    files,
    filesRef,
    loadFileContent,
    projectPath,
    requestPreviewRefreshWithUnsavedGuard,
    setDirtyFiles,
    setFiles,
  });
  const handleSidebarLoadImage = useCallback(
    (path: string) => {
      void loadFileContent(path, { persistToState: true });
    },
    [loadFileContent],
  );
  useAppShellControls({
    closePendingPageSwitchPrompt,
    flushPendingPreviewSaves,
    interactionMode,
    interactionModeRef,
    isCodePanelOpen,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    isRightPanelOpen,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    runRedo,
    runUndo,
    saveCodeDraftsRef,
    selectedId,
    setInteractionMode,
    setIsCodePanelOpen,
    setIsLeftPanelOpen,
    setIsRightPanelOpen,
    setPreviewMode,
    setSidebarToolMode,
    toggleRightPanelManualClosedRef: rightPanelManualClosedRef,
    toggleRightPanelRestorePendingRef: rightPanelRestorePendingRef,
  });

  // --- Actions ---
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
      if (interactionModeRef.current === "inspect") {
        setInteractionMode("edit");
        setSidebarToolMode("edit");
      }
      if (deviceMode === "tablet" && interactionModeRef.current === "edit") {
        setIsCodePanelOpen(false);
        setIsRightPanelOpen(true);
      }
    },
    [deviceMode],
  );

  const {
    handleMoveElement,
    handleMoveElementByPosition,
    handleResize,
    handleSidebarAddElement,
    handleUpdateAnimation,
    handleUpdateContent,
    handleUpdateIdentity,
    handleUpdateStyle,
  } = useCanvasEditingHandlers({
    root,
    selectedId,
    pushHistory,
    setSelectedId,
    setIsRightPanelOpen,
    interactionModeRef,
    selectedPreviewHtmlRef,
    previewFrameRef,
    setSidebarToolMode,
    setInteractionMode,
    setPreviewMode,
    applyPreviewDropCreateRef,
  });
  const handleSidebarAddFontToPresentationCss = useCallback(
    (path: string) => {
      void handleAddFontToPresentationCss(path);
    },
    [handleAddFontToPresentationCss],
  );
  const handlePreviewRefresh = useCallback(() => {
    requestPreviewRefreshWithUnsavedGuard();
  }, [requestPreviewRefreshWithUnsavedGuard]);
  const openCodePanel = useCallback(() => {
    const currentPreview = selectedPreviewHtmlRef.current;
    if (currentPreview && filesRef.current[currentPreview]?.type === "html") {
      setActiveFileStable(currentPreview);
      setPreviewSyncedFile((prev) =>
        prev === currentPreview ? prev : currentPreview,
      );
      setPreviewNavigationFile((prev) =>
        prev === currentPreview ? prev : currentPreview,
      );
    }
    setIsDetachedEditorOpen(true);
  }, [setActiveFileStable]);
  const closeCodePanel = useCallback(() => {
    setIsDetachedEditorOpen(false);
    setIsCodePanelOpen(false);
  }, []);
  const toggleThemeWithTransition = useCallback(() => {
    if (themeTransitionInFlightRef.current) return;
    themeTransitionInFlightRef.current = true;
    const nextTheme = theme === "dark" ? "light" : "dark";
    const rootEl = document.documentElement;
    rootEl.classList.add("theme-transitioning");
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanupTransitionVars = () => {
      const rootStyle = document.documentElement.style;
      rootStyle.removeProperty("--theme-transition-x");
      rootStyle.removeProperty("--theme-transition-y");
      rootStyle.removeProperty("--theme-transition-radius");
      rootEl.classList.remove("theme-transitioning");
      themeTransitionInFlightRef.current = false;
    };
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--theme-transition-x", `${window.innerWidth}px`);
    rootStyle.setProperty("--theme-transition-y", "0px");
    rootStyle.setProperty(
      "--theme-transition-radius",
      `${Math.hypot(window.innerWidth, window.innerHeight)}px`,
    );

    if (prefersReducedMotion) {
      setTheme(nextTheme);
      cleanupTransitionVars();
      return;
    }

    const doc = document as MaybeViewTransitionDocument;
    if (typeof doc.startViewTransition !== "function") {
      setTheme(nextTheme);
      cleanupTransitionVars();
      return;
    }

    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
    });
    void transition.finished.finally(cleanupTransitionVars);
  }, [theme]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        quickTextEditRef.current &&
        target &&
        quickTextEditRef.current.contains(target)
      ) {
        return;
      }
      hideQuickTextEdit();
    };
    window.addEventListener("mousedown", handlePointer);
    return () => window.removeEventListener("mousedown", handlePointer);
  }, [hideQuickTextEdit]);
  const {
    ensureDirectoryForFileStable,
    ensureDirectoryTreeStable,
    handleCreateFileAtPath,
    handleCreateFolderAtPath,
    handleDeletePath,
    handleDuplicateFile,
    handleOpenFolder,
    handleRenamePath,
    openPopupInPreview,
    refreshProjectFiles,
    resolvePreviewAssetUrl,
  } = useProjectFileActions({
    activeFileRef,
    binaryAssetUrlCacheRef,
    clearPreviewConsole,
    filePathIndexRef,
    filesRef,
    fontCachePathRef,
    isRefreshingFilesRef,
    loadingFilePromisesRef,
    loadingFilesRef,
    pendingPreviewWritesRef,
    presentationCssPathRef,
    previewDependencyIndexRef,
    previewDocCacheOrderRef,
    previewDocCacheRef,
    previewFrameRef,
    previewHistoryRef,
    previewMountBasePath,
    previewRootAliasPathRef,
    projectPath,
    revokeBinaryAssetUrls,
    selectedFolderCloneSource,
    selectedPreviewHtmlRef,
    setActiveFileStable,
    setAvailableFonts,
    setCodeDraftByPath,
    setCodeDirtyPathSet,
    setDirtyFiles,
    setDirtyPathKeysByFile,
    setFiles,
    setInteractionMode,
    setIsConfigModalOpen,
    setIsLeftPanelOpen,
    setIsPreviewMountReady,
    setPreviewMode,
    setPreviewMountBasePath,
    setPreviewNavigationFile,
    setPreviewSyncedFile,
    setProjectPath,
    setRecentProjects,
    setSidebarToolMode,
    textFileCacheRef,
  });
  const {
    isScreenshotGalleryOpen,
    screenshotItems,
    screenshotPreviewUrls,
    screenshotCaptureBusy,
    pdfExportLogs,
    isPdfExporting,
    loadGalleryItems,
    openScreenshotGallery,
    closeScreenshotGallery,
    handleScreenshotCapture,
    handleOpenScreenshotItem,
    handleDeleteScreenshotItem,
    handleRevealScreenshotsFolder,
    handleExportEditablePdf,
    clearPdfExportLogs,
  } = useScreenshotGallery({
    projectPath,
    showScreenshotFeatures: SHOW_SCREENSHOT_FEATURES,
    previewFrameRef,
    selectedPreviewHtmlRef,
    filePathIndexRef,
    previewMountBasePath,
    deviceMode,
    tabletModel,
    tabletOrientation,
    frameZoom,
    previewMode,
    interactionMode,
    isLeftPanelOpen,
    setIsLeftPanelOpen,
    isRightPanelOpen,
    setIsRightPanelOpen,
    rightPanelMode,
    setRightPanelMode,
    ensureDirectoryTree: ensureDirectoryTreeStable,
    ensureDirectoryForFile: ensureDirectoryForFileStable,
    pendingPopupOpenRef,
    openPopupInPreview,
    setPreviewMode,
    setInteractionMode,
    setSelectedId,
    setPreviewSelectedPath,
    setPreviewSelectedElement,
    setPreviewSelectedComputedStyles,
    setPreviewNavigationFile,
  });
  const resolveAdjacentSlidePath = useCallback(
    (fromPath: string, dir: "next" | "prev"): string | null => {
      const normalizedFrom = normalizeProjectRelative(String(fromPath || ""));
      const fromMatch = normalizePath(normalizedFrom).match(
        /^(.*_)([0-9]{3,})\/index\.html$/i,
      );
      if (!fromMatch) return null;
      const familyPrefix = fromMatch[1].toLowerCase();
      const currentNorm = normalizedFrom.toLowerCase();
      const slides = Object.keys(filesRef.current)
        .filter((path) => filesRef.current[path]?.type === "html")
        .map((path) => {
          const match = normalizePath(path).match(
            /^(.*_)([0-9]{3,})\/index\.html$/i,
          );
          if (!match || match[1].toLowerCase() !== familyPrefix) {
            return null;
          }
          return {
            path,
            normalized: normalizeProjectRelative(path).toLowerCase(),
            num: Number.parseInt(match[2], 10),
          };
        })
        .filter(
          (entry): entry is { path: string; normalized: string; num: number } =>
            Boolean(entry),
        )
        .sort((a, b) =>
          a.num !== b.num ? a.num - b.num : a.path.localeCompare(b.path),
        );
      if (slides.length === 0) return null;
      const index = slides.findIndex((item) => item.normalized === currentNorm);
      if (index < 0) return null;
      const nextIndex = dir === "next" ? index + 1 : index - 1;
      if (nextIndex < 0 || nextIndex >= slides.length) return null;
      return slides[nextIndex].path;
    },
    [],
  );
  const getStablePreviewElementId = useCallback(
    (
      path: number[] | null | undefined,
      explicitId?: string | null,
      fallbackId?: string | null,
    ) => {
      const normalizedExplicitId = String(explicitId || "").trim();
      if (normalizedExplicitId) return normalizedExplicitId;
      const normalizedFallbackId = String(fallbackId || "").trim();
      if (normalizedFallbackId) return normalizedFallbackId;
      if (Array.isArray(path) && path.length > 0) {
        return `preview-${toPreviewLayerId(path)}`;
      }
      return "preview-detached";
    },
    [],
  );
  const {
    handleSidebarSelectElement,
    inspectorElement,
    previewLayerSelectedId,
    previewLayersRoot,
    selectPreviewElementAtPath,
    selectedElement,
    selectedPathIds,
    selectedPreviewHtml,
    selectedPreviewSrc,
  } = usePreviewSelectionState({
    activeFile,
    files,
    getStablePreviewElementId,
    handleSelect,
    interactionMode,
    isPreviewMountReady,
    previewFrameRef,
    previewMountBasePath,
    previewRefreshNonce,
    previewNavigationFile,
    previewSelectedPath,
    previewSelectedElement,
    previewSyncedFile,
    projectPath,
    root,
    selectedId,
    selectedPreviewDoc,
    selectedPreviewHtmlRef,
    selectedPreviewPathSetter: setPreviewSelectedPath,
    selectedPreviewElementSetter: setPreviewSelectedElement,
    selectedPreviewComputedStylesSetter: setPreviewSelectedComputedStyles,
    selectedPreviewMatchedCssRulesSetter: setPreviewSelectedMatchedCssRules,
    setIsCodePanelOpen,
    setIsRightPanelOpen,
    setSelectedId,
    textFileCacheRef,
    filePathIndexRef,
  });
  const {
    currentPreviewSlideId,
    filteredAnnotationsForCurrentSlide,
    focusedAnnotationForCurrentSlide,
    handleJumpToPdfAnnotation,
    handleOpenPdfAnnotationsPicker,
    handleRefreshPdfAnnotationMapping,
    hasPdfAnnotationsLoaded,
    isPopupAnnotation,
  } = usePdfAnnotationWorkflow({
    cacheKey: PDF_ANNOTATION_CACHE_KEY,
    dispatch,
    filePathIndexRef,
    files,
    focusedPdfAnnotation,
    isPdfAnnotationLoading,
    pdfAnnotationRecords,
    pdfAnnotationTypeFilter,
    previewFocusedPdfElementRef,
    previewFrameLoadNonce,
    previewFrameRef,
    previewRefreshNonce,
    projectPath,
    selectedPreviewHtml,
    selectedPreviewHtmlRef,
    setActiveFileStable,
    setInteractionMode,
    setPreviewMode,
    setPreviewNavigationFile,
    setPreviewSelectedComputedStyles,
    setPreviewSelectedElement,
    setPreviewSelectedPath,
    setPreviewSyncedFile,
    setSelectedId,
    setSidebarToolMode,
  });

  // --- NEW: Automatic Tablet Orientation Switching ---
  useEffect(() => {
    if (!selectedPreviewHtml) return;
    const pathParts = selectedPreviewHtml.toLowerCase().split(/[\\/]/);
    const relevantSegments = pathParts.slice(-2).join("/");
    const nextOrientation =
      relevantSegments.includes("vertical") ||
      relevantSegments.includes("portrait")
        ? "portrait"
        : "landscape";

    if (tabletOrientation !== nextOrientation) {
      setTabletOrientation(nextOrientation);
    }
  }, [selectedPreviewHtml, tabletOrientation]);
  // ----------------------------------------------------

  const isMountedPreview = Boolean(
    selectedPreviewSrc && interactionMode === "preview",
  );
  useEffect(() => {
    if (isMountedPreview) return;
    setPreviewNavigationFile((prev) =>
      prev === selectedPreviewHtml ? prev : selectedPreviewHtml,
    );
  }, [isMountedPreview, selectedPreviewHtml]);
  const shouldPrepareEditPreviewDoc = Boolean(
    selectedPreviewHtml && !isMountedPreview,
  );
  const hasPreviewContent = Boolean(
    projectPath && (selectedPreviewSrc || selectedPreviewDoc),
  );
  const shouldShowFrameWelcome = !projectPath;
  useEffect(() => {
    selectedPreviewHtmlRef.current = selectedPreviewHtml;
    setPreviewSelectedPath(null);
    setPreviewSelectedElement(null);
    setPreviewSelectedComputedStyles(null);
  }, [selectedPreviewHtml]);
  const {
    extractMountRelativePath,
    getLivePreviewSelectedElement,
    handlePreviewFrameLoad,
    handlePreviewStageDragOver,
    handleSidebarInteractionModeChange,
    isActivePreviewMessageSource,
    postPreviewPatchToFrame,
    resolveVirtualPathFromMountRelative,
    setPreviewModeWithSync,
    sidebarInteractionMode,
  } = usePreviewFrameBridgeState({
    activeFileRef,
    drawElementTag,
    explorerSelectionLockRef,
    explorerSelectionLockUntilRef,
    filePathIndexRef,
    filesRef,
    hasUnsavedChangesForFile,
    hideQuickTextEdit,
    interactionMode,
    interactionModeRef,
    isPreviewMountReady,
    openPopupInPreview,
    pendingPopupOpenRef,
    positionQuickTextEditAtRange,
    previewFrameLoadNonce,
    previewFrameRef,
    previewMode,
    previewModeRef,
    previewMountBasePath,
    previewRootAliasPathRef,
    previewSelectionMode,
    projectPath,
    quickTextRangeRef,
    selectedPreviewHtml,
    selectedPreviewSrc,
    setInteractionMode,
    setIsPageSwitchPromptOpen,
    setIsToolboxDragging,
    setPendingPageSwitch,
    setPreviewFrameLoadNonce,
    setPreviewMode,
    setSidebarToolMode,
    shouldProcessPreviewPageSignal,
    sidebarToolMode,
    syncPreviewActiveFile,
    toolboxDragTypeRef,
  });
  const persistPreviewHtmlContent = useCallback(
    async (
      updatedPath: string,
      serialized: string,
      options?: {
        refreshPreviewDoc?: boolean;
        saveNow?: boolean;
        skipAutoSave?: boolean;
        elementPath?: number[];
        pushToHistory?: boolean;
      },
    ) => {
      await persistPreviewHtmlContentHelper({
        updatedPath,
        serialized,
        options,
        filesRef,
        textFileCacheRef,
        pendingPreviewWritesRef,
        previewDependencyIndexRef,
        setFiles,
        setDirtyFiles,
        setSelectedPreviewDoc,
        setPreviewRefreshNonce,
        invalidatePreviewDocCache,
        markPreviewPathDirty,
        pushPreviewHistory,
        flushPendingPreviewSaves,
        schedulePreviewAutoSave,
        isMountedPreview,
      });
    },
    [
      flushPendingPreviewSaves,
      invalidatePreviewDocCache,
      isMountedPreview,
      markPreviewPathDirty,
      previewDependencyIndexRef,
      pushPreviewHistory,
      schedulePreviewAutoSave,
    ],
  );
  const {
    applyPreviewContentUpdate,
    applyPreviewInlineEdit,
    applyPreviewInlineEditDraft,
    applyPreviewStyleUpdateAtPath,
    queuePreviewStyleUpdate,
    syncPreviewSelectionSnapshotFromLiveElement,
  } = usePreviewContentEditing({
    dirtyFilesRef,
    filesRef,
    flushPendingPreviewSaves,
    getLivePreviewSelectedElement,
    getStablePreviewElementId,
    invalidatePreviewDocCache,
    isMountedPreview,
    loadFileContent,
    markPreviewPathDirty,
    pendingPreviewWritesRef,
    persistPreviewHtmlContent,
    postPreviewPatchToFrame,
    previewDependencyIndexRef,
    previewSelectedElement,
    previewSelectedPath,
    previewStyleDraftPendingRef,
    previewStyleDraftTimerRef,
    pushPreviewHistory,
    resolvePreviewAssetUrl,
    schedulePreviewAutoSave,
    selectedPreviewHtml,
    setDirtyFiles,
    setFiles,
    setPreviewRefreshNonce,
    setPreviewSelectedComputedStyles,
    setPreviewSelectedElement,
    setPreviewSelectedMatchedCssRules,
    setPreviewSelectedPath,
    setSelectedPreviewDoc,
    textFileCacheRef,
  });
  const {
    applyPreviewTagUpdate,
    applyQuickTextWrapTag,
    handleReplacePreviewAsset,
  } = usePreviewElementActions({
    applyPreviewContentUpdate,
    binaryAssetUrlCacheRef,
    filePathIndexRef,
    filesRef,
    getLivePreviewSelectedElement,
    loadFileContent,
    persistPreviewHtmlContent,
    postPreviewPatchToFrame,
    previewFrameRef,
    previewSelectedElement,
    previewSelectedPath,
    projectPath,
    quickTextRangeRef,
    resolvePreviewAssetUrl,
    selectedPreviewHtml,
    selectedPreviewSrc,
    selectPreviewElementAtPath,
    setFiles,
    setInteractionMode,
    setIsCodePanelOpen,
    setIsRightPanelOpen,
    setPreviewMode,
    setPreviewSelectedComputedStyles,
    setPreviewSelectedElement,
    setPreviewSelectedPath,
    setSelectedId,
    setSidebarToolMode,
  });
  const {
    applyPreviewLocalCssPatchAtPath,
    handleImmediatePreviewStyle,
    handlePreviewMatchedRulePropertyAdd,
    resolvePreviewMatchedRuleSourcePath,
  } = usePreviewCssMutation({
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
  });
  const {
    handlePreviewResizeHandleMouseDown, 
    previewSelectionBox,
  } = usePreviewGeometry({
    applyPreviewLocalCssPatchAtPath,
    applyPreviewStyleUpdateAtPath,
    getLivePreviewSelectedElement,
    interactionMode,
    previewFrameRef,
    previewMode,
    previewRefreshNonce,
    previewSelectedComputedStyles,
    previewSelectedElement,
    previewSelectedPath,
    previewStageRef,
    setPreviewSelectedElement,
  });
  const {
    applyPreviewDrawCreate,
    applyPreviewDropCreate,
    handlePreviewStageDrop,
  } = usePreviewCreation({
    ensureDirectoryTreeStable,
    filePathIndexRef,
    filesRef,
    getStablePreviewElementId,
    loadFileContent,
    pendingPreviewWritesRef,
    persistPreviewHtmlContent,
    postPreviewPatchToFrame,
    previewFrameRef,
    selectedPreviewHtml,
    selectedPreviewSrc,
    setFiles,
    setInteractionMode,
    setIsCodePanelOpen,
    setIsRightPanelOpen,
    setIsToolboxDragging,
    setPreviewMode,
    setPreviewSelectedComputedStyles,
    setPreviewSelectedElement,
    setPreviewSelectedMatchedCssRules,
    setPreviewSelectedPath,
    setSelectedId,
    setSidebarToolMode,
    textFileCacheRef,
    toolboxDragTypeRef,
  });
  const { applyPreviewAnimationUpdate, resolveInspectorAssetPreviewUrl } =
    usePreviewInspectorRuntime({
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
    });
  useEffect(() => {
    applyPreviewDropCreateRef.current = applyPreviewDropCreate;
  }, [applyPreviewDropCreate]);
  const handlePreviewStyleUpdateStable = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      queuePreviewStyleUpdate(styles);
    },
    [queuePreviewStyleUpdate],
  );
  const handlePreviewContentUpdateStable = useCallback(
    (data: {
      content?: string;
      html?: string;
      src?: string;
      href?: string;
    }) => {
      void applyPreviewContentUpdate(data);
    },
    [applyPreviewContentUpdate],
  );
  const handlePreviewAnimationUpdateStable = useCallback(
    (animation: string) => {
      void applyPreviewAnimationUpdate(animation);
    },
    [applyPreviewAnimationUpdate],
  );
  usePreviewFrameMessages({
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
  });
  usePreviewDocumentLoader({
    cachePreviewDoc,
    filePathIndexRef,
    filesRef,
    loadFileContent,
    previewDependencyIndexRef,
    previewDocCacheRef,
    previewHistoryRef,
    selectedPreviewHtml,
    setSelectedPreviewDoc,
    shouldPrepareEditPreviewDoc,
  });
  useEffect(() => {
    if (!activeFile) return;
    void loadFileContent(activeFile);
  }, [activeFile, loadFileContent]);
  useEffect(() => {
    if (!selectedPreviewHtml) return;
    const keys = dirtyPathKeysByFile[selectedPreviewHtml] || [];
    if (keys.length === 0) return;
    const timer = window.setTimeout(() => {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      for (const key of keys) {
        const path = key
          .split(".")
          .map((segment) => Number(segment))
          .filter((segment) => Number.isFinite(segment))
          .map((segment) => Math.max(0, Math.trunc(segment)));
        const element = readElementByPath(frameDocument.body, path);
        if (element instanceof HTMLElement) {
          element.classList.add("__nx-preview-dirty");
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dirtyPathKeysByFile, selectedPreviewDoc, selectedPreviewHtml]);
  const {
    activeCodeContent,
    activeCodeFilePath,
    activeDetachedEditorContent,
    activeDetachedEditorFilePath,
    activeDetachedEditorIsDirty,
    detachedEditorIsTextEditable,
    handleCodeDraftChange,
    handleDetachedEditorChange,
    handleDetachedEditorSelectFile,
    saveCodeDraftAtPath,
  } = useCodeEditorState({
    activeFile,
    codeDraftByPath,
    codeDraftByPathRef,
    codeDirtyPathSet,
    codeDirtyPathSetRef,
    dirtyFilesRef,
    files,
    filesRef,
    isCodePanelOpen,
    loadFileContent,
    filePathIndexRef,
    persistPreviewHtmlContent,
    selectedPreviewHtml,
    selectedPreviewHtmlRef,
    setActiveFileStable,
    setCodeDraftByPath,
    setCodeDirtyPathSet,
    setDirtyFiles,
    setFiles,
    setPreviewNavigationFile,
    setPreviewRefreshNonce,
    setPreviewSyncedFile,
    textFileCacheRef,
    saveCodeDraftsRef,
  });
  const {
    baseOverflowX,
    clampedCodeShiftX,
    clampedTabletShiftX,
    codePanelStageOffset,
    consolePanelStageOffset,
    currentDevicePixelRatio,
    darkTabletReflectionOpacity,
    isRightInspectorAttached,
    isRightInspectorMode,
    frameScale,
    shouldLockHorizontalScroll,
    shouldLockVerticalScroll,
    showDeviceFrameToolbar,
    showEmbeddedPdfAnnotations,
    showStyleInspectorSection,
    tabletMetrics,
    tabletViewportScale,
  } = useStageLayoutState({
    bothPanelsOpen,
    codePanelWidth: CODE_PANEL_WIDTH,
    deviceMode,
    desktopResolution,
    frameZoom,
    getDefaultRightPanelPosition,
    hasPdfAnnotationsLoaded,
    isCodePanelOpen,
    isFloatingPanels,
    isLeftPanelOpen,
    isPdfAnnotationLoading,
    isPdfAnnotationPanelOpen,
    isRightPanelOpen,
    isScreenshotGalleryOpen,
    isStyleInspectorSectionOpen,
    leftPanelWidth,
    pdfAnnotationError,
    pdfAnnotationProcessingLogsLength: pdfAnnotationProcessingLogs.length,
    rightPanelMode,
    rightPanelWidth,
    setFrameZoom,
    setRightPanelFloatingPosition,
    tabletModel,
    tabletOrientation,
    theme,
  });
  const applyPreviewIdentityUpdate = useCallback(
    async (identity: { id: string; className: string }) => {
      if (
        !selectedPreviewHtml ||
        !previewSelectedPath ||
        !Array.isArray(previewSelectedPath) ||
        previewSelectedPath.length === 0
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
      const target = readElementByPath(parsed.body, previewSelectedPath);
      const liveTarget = getLivePreviewSelectedElement(previewSelectedPath);
      if (!target && !liveTarget) return;

      const nextId = identity.id.trim();
      const nextClassName = identity.className.trim();

      if (target) {
        if (nextId) target.setAttribute("id", nextId);
        else target.removeAttribute("id");
        if (nextClassName) target.setAttribute("class", nextClassName);
        else target.removeAttribute("class");
      }
      if (liveTarget) {
        if (nextId) liveTarget.setAttribute("id", nextId);
        else liveTarget.removeAttribute("id");
        if (nextClassName) liveTarget.setAttribute("class", nextClassName);
        else liveTarget.removeAttribute("class");
      }

      if (target) {
        const serialized = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
        await persistPreviewHtmlContent(selectedPreviewHtml, serialized, {
          refreshPreviewDoc: false,
          elementPath: previewSelectedPath,
        });
      }

      setPreviewSelectedElement((prev) =>
        prev
          ? {
              ...prev,
              id: nextId || prev.id,
              className: nextClassName || undefined,
            }
          : prev,
      );
    },
    [
      getLivePreviewSelectedElement,
      loadFileContent,
      persistPreviewHtmlContent,
      previewSelectedPath,
      selectedPreviewHtml,
    ],
  );
  const handlePreviewIdentityUpdateStable = useCallback(
    (identity: { id: string; className: string }) => {
      void applyPreviewIdentityUpdate(identity);
    },
    [applyPreviewIdentityUpdate],
  );

  const topLevelLayersProps = useTopLevelLayersViewModel({
    theme,
    pendingPageSwitch,
    isPageSwitchPromptOpen,
    isPageSwitchPromptBusy,
    closePendingPageSwitchPrompt,
    resolvePendingPageSwitchWithDiscard,
    resolvePendingPageSwitchWithSave,
    deviceCtxMenu,
    mobileFrameStyle,
    setMobileFrameStyle,
    desktopResolution,
    setDesktopResolution,
    tabletModel,
    tabletOrientation,
    setTabletModel,
    setDeviceCtxMenu,
  });

  const leftSidebarProps = useLeftSidebarViewModel({
    theme,
    isCodePanelOpen,
    isFloatingPanels,
    isLeftPanelOpen,
    isPanelsSwapped,
    isResizingLeftPanel,
    leftPanelCollapsedWidth: LEFT_PANEL_COLLAPSED_WIDTH,
    files,
    activeFile,
    drawElementTag,
    interactionMode,
    previewMode,
    previewLayerSelectedId,
    previewSelectedElement,
    previewSyncedFile,
    projectPath,
    previewLayersRoot,
    root,
    selectedElement,
    selectedFolderCloneSource,
    selectedId,
    sidebarInteractionMode,
    handleCreateFileAtPath,
    handleCreateFolderAtPath,
    handleChooseFolderCloneSource,
    handleDeletePath,
    handleDuplicateFile,
    handleLeftPanelResizeStart,
    handleLeftPanelStretchToggle,
    handleOpenConfigModal,
    handleOpenFolder,
    handleRenamePath,
    handleSelectFile,
    handleSidebarAddElement,
    handleSidebarAddFontToPresentationCss,
    handleSidebarInteractionModeChange,
    handleSidebarLoadImage,
    handleSidebarSelectElement,
    handleUpdateAnimation,
    handleUpdateStyle,
    handlePreviewAnimationUpdateStable,
    handlePreviewStyleUpdateStable,
    openCodePanel,
    refreshProjectFiles,
    setDrawElementTag,
    setIsLeftPanelOpen,
  });

  const mainStageProps = useMainStageViewModel({
    isResizingLeftPanel,
    isResizingRightPanel,
    isFloatingPanels,
    deviceMode,
    isPanelsSwapped,
    isLeftPanelOpen,
    isRightPanelOpen,
    codePanelStageOffset,
    consolePanelStageOffset,
    isRightInspectorAttached,
    shouldLockHorizontalScroll,
    shouldLockVerticalScroll,
    baseOverflowX,
    baseStagePadding: BASE_STAGE_PADDING,
    bothPanelsOpen,
    rightOverlayInset,
    floatingHorizontalInset,
    tabletMetrics,
    desktopResolution,
    clampedTabletShiftX,
    clampedCodeShiftX,
    frameScale,
    currentDevicePixelRatio,
    dirtyFileCount: dirtyFiles.length,
    frameZoom,
    handlePreviewRefresh,
    handleSidebarInteractionModeChange,
    interactionMode,
    openScreenshotGallery,
    previewMode,
    previewSelectionMode,
    projectPath,
    runRedo,
    runUndo,
    screenshotCaptureBusy,
    setDeviceCtxMenu,
    setDeviceMode,
    setFrameZoom,
    setPreviewModeWithSync,
    setPreviewSelectionMode,
    setTabletOrientation,
    showScreenshotFeatures: SHOW_SCREENSHOT_FEATURES,
    showToolbar: showDeviceFrameToolbar,
    sidebarInteractionMode,
    tabletOrientation,
    theme,
    toggleThemeWithTransition,
    darkTabletReflectionOpacity,
    mobileFrameStyle,
    filteredAnnotationsForCurrentSlide,
    focusedAnnotationForCurrentSlide,
    handleMoveElement,
    handleMoveElementByPosition,
    handleOpenFolder,
    handlePreviewFrameLoad,
    handlePreviewResizeHandleMouseDown,
    handlePreviewStageDragOver,
    handlePreviewStageDrop,
    handleResize,
    handleSelect,
    hasPreviewContent,
    isPdfAnnotationPanelOpen,
    isPopupAnnotation,
    isToolboxDragging,
    previewFrameRef,
    previewRefreshNonce,
    previewSelectedPath,
    previewSelectionBox,
    previewStageRef,
    recentProjects,
    root,
    selectedId,
    selectedPathIds,
    selectedPreviewDoc,
    selectedPreviewHtml,
    selectedPreviewSrc,
    shouldShowFrameWelcome,
    tabletViewportScale,
    scrollerRef,
    clearStageSelection: () => {
      setSelectedId(null);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
    },
  });

  const rightInspectorProps = useRightInspectorViewModel({
    theme,
    isResizingRightPanel,
    isCodePanelOpen,
    isRightPanelOpen,
    isRightInspectorAttached,
    projectPath,
    showEmbeddedPdfAnnotations,
    hasPdfAnnotationsLoaded,
    isPdfAnnotationPanelOpen,
    isPdfAnnotationLoading,
    currentPreviewSlideId,
    showStyleInspectorSection,
    setIsStyleInspectorSectionOpen,
    inspectorElement,
    availableFonts,
    previewSelectedElement,
    previewSelectionMode,
    resolveInspectorAssetPreviewUrl,
    previewSelectedMatchedCssRules,
    previewSelectedComputedStyles,
    togglePdfAnnotations: () => dispatch(setIsOpen(!isPdfAnnotationPanelOpen)),
    handleOpenPdfAnnotationsPicker,
    handleRefreshPdfAnnotationMapping,
    handleJumpToPdfAnnotation,
    handleImmediatePreviewStyle,
    handlePreviewContentUpdateStable,
    handleUpdateContent,
    applyPreviewTagUpdate,
    applyQuickTextWrapTag,
    handlePreviewStyleUpdateStable,
    handleUpdateStyle,
    handlePreviewIdentityUpdateStable,
    handleUpdateIdentity,
    handleReplacePreviewAsset,
    handlePreviewMatchedRulePropertyAdd,
    setIsRightPanelOpen,
    handleRightPanelResizeStart,
  });

  const screenshotGalleryProps = useScreenshotGalleryViewModel({
    isFloatingPanels,
    isPanelsSwapped,
    isResizingRightPanel,
    isDraggingRightPanel,
    isCodePanelOpen,
    isRightPanelOpen,
    rightPanelFloatingPosition,
    theme,
    rightPanelMode,
    projectPath,
    screenshotCaptureBusy,
    screenshotItems,
    screenshotPreviewUrls,
    isPdfExporting,
    pdfExportLogs,
    handleRightPanelDragStart,
    closeScreenshotGallery,
    setIsRightPanelOpen,
    setRightPanelMode,
    loadGalleryItems,
    handleScreenshotCapture,
    handleRevealScreenshotsFolder,
    handleOpenScreenshotItem,
    handleDeleteScreenshotItem,
    handleExportEditablePdf,
  });

  const appOverlaysProps = useAppOverlaysViewModel({
    theme,
    isFloatingPanels,
    isCodePanelOpen,
    isRightPanelOpen,
    rightPanelMode,
    isCompactConsoleOpening,
    previewConsoleErrorCount,
    isConfigModalOpen,
    configModalInitialTab,
    isConfigModalSlidesOnly,
    autoSaveEnabled,
    panelSide,
    projectPath,
    selectedFolderCloneSource,
    files,
    configPathForModal,
    portfolioPathForModal,
    isDetachedEditorOpen,
    activeDetachedEditorFilePath,
    activeDetachedEditorContent,
    activeDetachedEditorIsDirty,
    detachedEditorIsTextEditable,
    activeCodeContent,
    activeCodeFilePath,
    isPdfExporting,
    pdfExportLogs,
    saveCodeDraftsRef,
    setIsCodePanelOpen,
    setIsRightPanelOpen,
    setRightPanelMode,
    handleOpenDetachedConsole,
    setIsConfigModalOpen,
    handleSaveConfig,
    setAutoSaveEnabled,
    setPanelSide,
    setSelectedFolderCloneSource,
    closeCodePanel,
    handleDetachedEditorSelectFile,
    handleDetachedEditorChange,
    saveCodeDraftAtPath,
    loadFileContent,
    setCodeDraftByPath,
    setCodeDirtyPathSet,
    clearPdfExportLogs,
    handleCodeDraftChange,
  });
  return (
    <div
      ref={appRootRef}
      className={`h-screen w-screen flex flex-col font-sans relative overflow-hidden ${theme === "light" ? "light-mode" : ""}`}
      style={{
        backgroundColor: "var(--bg-app)",
        color: "var(--text-main)",
        ["--left-panel-width" as any]: `${leftPanelWidth}px`,
        ["--right-panel-width" as any]: `${rightPanelWidth}px`,
        ...(theme !== "light"
          ? {
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 0 rgba(255,255,255,0.12), inset 1px 0 0 0 rgba(255,255,255,0.06), inset -1px 0 0 0 rgba(255,255,255,0.06), inset 0 -1px 0 0 rgba(255,255,255,0.04)",
        }
        : {}),
      }}
    >
      <AppTopLevelLayers {...topLevelLayersProps} />

      <div className="flex-1 flex overflow-hidden relative">

        <LeftSidebarShell {...leftSidebarProps} />

        <MainStageShell {...mainStageProps} />

        {isRightInspectorMode && (
          <RightInspectorShell {...rightInspectorProps} />
        )}

        {rightPanelMode === "gallery" && SHOW_SCREENSHOT_FEATURES && (
          <ScreenshotGalleryPanel {...screenshotGalleryProps} />
        )}
      </div>

      <AppOverlays {...appOverlaysProps} />
    </div>
  );
};

const AppRoot: React.FC = () => (
  <Provider store={store}>
    <App />
  </Provider>
);

export default AppRoot;
