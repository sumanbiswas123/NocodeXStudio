import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import Sidebar from "./components/Sidebar";
import StyleInspectorPanel from "./components/StyleInspectorPanel";
import { INITIAL_ROOT, INJECTED_STYLES } from "./constants";
import {
  VirtualElement,
  FileMap,
  HistoryState,
  ProjectFile,
} from "./types";
import * as Neutralino from "@neutralinojs/lib";
import {
  PanelRightClose,
  Tablet,
  RotateCw,
  Globe,
  Wifi,
  Sun,
  Moon,
  FileText,
  Upload,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  MoveUp,
  MoveDown,
  Shrink,
  Expand,
  Camera,
  MousePointer2,
  Move,
} from "lucide-react";
import EditorContent from "./app/EditorContent";
import { Provider } from "react-redux";
import { store } from "./src/store";
import PdfAnnotationsOverlay from "./src/components/PdfAnnotationsOverlay";
import {
  setRecords,
  setFileName,
  setSourcePath,
  setError,
  setIsOpen,
  setIsLoading,
  setFocusedAnnotation,
  setClassifierMetrics,
} from "./src/store/annotationSlice";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./src/store";
import {
  evaluateAnnotationTypeClassifier,
  PdfAnnotationUiRecord,
} from "./app/pdfAnnotationHelpers";
import {
  appendPdfAnnotationLog as appendPdfAnnotationLogHelper,
  runPdfAnnotationMapping as runPdfAnnotationMappingHelper,
  selectPdfAndRunMapping,
} from "./app/pdfAnnotationActions";
import {
  ensureDirectoryForFile,
  ensureDirectoryTree,
  indexProjectForOpen,
  patchMtVeevaCheck,
  refreshProjectFileIndex,
} from "./app/projectFilesystem";
import { resolvePreviewAssetUrl as resolvePreviewAssetUrlHelper } from "./app/mediaWorkspaceHelpers";
import { initializeProjectOpenRuntime } from "./app/projectOpenRuntime";
import AppOverlays from "./app/AppOverlays";
import {
  persistPreviewHtmlContent as persistPreviewHtmlContentHelper,
} from "./app/previewSelectionHelpers";
import ScreenshotGalleryPanel from "./app/ScreenshotGalleryPanel";
import { useCodeEditorState } from "./app/useCodeEditorState";
import { usePreviewContentEditing } from "./app/usePreviewContentEditing";
import { usePreviewElementActions } from "./app/usePreviewElementActions";
import { usePreviewGeometry } from "./app/usePreviewGeometry";
import { usePreviewCreation } from "./app/usePreviewCreation";
import { usePreviewCssMutation } from "./app/usePreviewCssMutation";
import { usePreviewDocumentLoader } from "./app/usePreviewDocumentLoader";
import { usePreviewInspectorRuntime } from "./app/usePreviewInspectorRuntime";
import { usePreviewFrameMessages } from "./app/usePreviewFrameMessages";
import { usePreviewFrameBridgeState } from "./app/usePreviewFrameBridgeState";
import { usePreviewConsole } from "./app/usePreviewConsole";
import { useScreenshotGallery } from "./app/useScreenshotGallery";
import {
  collectMatchedCssRulesFromElement,
  normalizePresentationCssValue,
  normalizePresentationStylePatch,
  PreviewMatchedCssDeclaration,
  PreviewMatchedCssRule,
  PreviewMatchedRuleMutation,
} from "./app/previewCssHelpers";
import {
  isEdaProject,
  findElementById,
  collectPathIdsToElement,
  updateElementInTree,
  deleteElementFromTree,
  normalizePath,
  PREVIEW_MOUNT_PATH,
  joinPath,
  getParentPath,
  THEME_STORAGE_KEY,
  PREVIEW_AUTOSAVE_STORAGE_KEY,
  PANEL_SIDE_STORAGE_KEY,
  SHOW_SCREENSHOT_FEATURES,
  SHOW_MASTER_TOOLS,
  MAX_CANVAS_HISTORY,
  MAX_PREVIEW_HISTORY,
  MAX_PREVIEW_CONSOLE_ENTRIES,
  MAX_PREVIEW_DOC_CACHE_ENTRIES,
  MAX_PREVIEW_DOC_CACHE_CHARS,
  SHARED_FONT_VIRTUAL_DIR,
  PRESENTATION_CSS_VIRTUAL_PATH,
  FONT_CACHE_VERSION,
  CONFIG_JSON_PATH,
  PORTFOLIO_CONFIG_PATH,
  ADD_TOOL_COMPONENT_PRESETS,
  ADD_TOOL_CSS_MARKER_START,
  ADD_TOOL_CSS_MARKER_END,
  ADD_TOOL_JS_MARKER_START,
  ADD_TOOL_JS_MARKER_END,
  VOID_HTML_TAGS,
  ADD_TOOL_COMPONENTS_CSS_CONTENT,
  ADD_TOOL_COMPONENTS_JS_CONTENT,
  resolveConfigPathFromFiles,
  getConfigPathCandidates,
  scoreConfigContent,
  DEFAULT_EDITOR_FONTS,
  normalizePreviewDrawTag,
  FontCachePayload,
  MaybeViewTransitionDocument,
  dedupeFontFamilies,
  buildEditorFontOptions,
  parsePresentationCssFontFamilies,
  deriveFontFamilyFromFontFileName,
  fontFormatFromFileName,
  inferFileType,
  relativePathBetweenVirtualFiles,
  isTextFileType,
  isSvgPath,
  isCodeEditableFile,
  toFileUrl,
  mimeFromType,
  toByteArray,
  normalizeProjectRelative,
  resolveProjectRelativePath,
  findFilePathCaseInsensitive,
  resolvePreviewNavigationPath,
  toMountRelativePath,
  rewriteInlineAssetRefs,
  createPreviewDocument,
  pickDefaultHtmlFile,
  toCssPropertyName,
  parseNumericCssValue,
  readElementByPath,
  normalizePreviewPath,
  toPreviewLayerId,
  fromPreviewLayerId,
  parseInlineStyleText,
  extractComputedStylesFromElement,
  extractCustomAttributesFromElement,
  normalizeEditorMultilineText,
  extractTextWithBreaks,
  extractTextFromHtmlFragment,
  PreviewHistoryEntry,
  addElementToTree,
  hasToolboxDragType,
  getToolboxDragPayload,
  createPresetIdFactory,
  buildPresetElementV2,
  buildStandardElement,
  materializeVirtualElement,
  buildPreviewLayerTreeFromElement,
  DeviceContextMenu,
  PreviewConsoleLevel,
  PreviewSelectionMode,
  PreviewSyncSource,
  PendingPageSwitch,
} from "./app/appHelpers";

const RECENT_PROJECTS_STORAGE_KEY = "nocodex_recent_projects_v1";
const PDF_ANNOTATION_CACHE_KEY = "nocodex_pdf_annotation_cache_v1";

const extractAssetSourceFromElement = (element: VirtualElement | null) => {
  if (!element) return "";
  if (typeof element.src === "string" && element.src.trim()) {
    return element.src.trim();
  }
  const backgroundImage =
    typeof element.styles?.backgroundImage === "string"
      ? String(element.styles.backgroundImage)
      : "";
  const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ? match[2] : "";
};


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
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalInitialTab, setConfigModalInitialTab] = useState<
    "references" | "slides" | "configRaw"
  >("references");
  const [isConfigModalSlidesOnly, setIsConfigModalSlidesOnly] = useState(false);
  const [configModalConfigPath, setConfigModalConfigPath] = useState<
    string | null
  >(null);
  const [configModalPortfolioPath, setConfigModalPortfolioPath] = useState<
    string | null
  >(null);
  const [selectedFolderCloneSource, setSelectedFolderCloneSource] = useState<
    string | null
  >(null);
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
  const [isZenMode, setIsZenMode] = useState(false);
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

  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<"inspector" | "gallery">(
    "inspector",
  );
  const [isToolboxDragging, setIsToolboxDragging] = useState(false);
  const toolboxDragTypeRef = useRef("");
  const [pendingPageSwitch, setPendingPageSwitch] =
    useState<PendingPageSwitch | null>(null);

  const readPdfAnnotationCache = useCallback(() => {
    try {
      const raw = localStorage.getItem(PDF_ANNOTATION_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        version: number;
        projects: Record<
          string,
          {
            lastPdfPath: string | null;
            entries: Record<
              string,
              {
                fileName: string;
                records: PdfAnnotationUiRecord[];
                storedAt: number;
              }
            >;
          }
        >;
      };
      if (!parsed || parsed.version !== 2) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const writePdfAnnotationCache = useCallback(
    (
      projectKey: string,
      pdfPath: string,
      fileName: string,
      records: PdfAnnotationUiRecord[],
    ) => {
      try {
        const existing = readPdfAnnotationCache() || {
          version: 1,
          projects: {},
        };
        const nextProjects = { ...existing.projects };
        const projectEntry = nextProjects[projectKey] || {
          lastPdfPath: null,
          entries: {},
        };
        projectEntry.lastPdfPath = pdfPath;
        projectEntry.entries = {
          ...projectEntry.entries,
          [pdfPath]: {
            fileName,
            records,
            storedAt: Date.now(),
          },
        };
        nextProjects[projectKey] = projectEntry;
        localStorage.setItem(
          PDF_ANNOTATION_CACHE_KEY,
          JSON.stringify({ version: 2, projects: nextProjects }),
        );
      } catch {
        // Ignore storage errors.
      }
    },
    [readPdfAnnotationCache],
  );
  const [isPageSwitchPromptOpen, setIsPageSwitchPromptOpen] = useState(false);
  const [isPageSwitchPromptBusy, setIsPageSwitchPromptBusy] = useState(false);
  // Keep both implementations available: switch to "docked" anytime.
  const panelLayoutMode: "docked" | "floating" = "floating";
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
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [rightPanelWidth, setRightPanelWidth] = useState(264);
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
  const [rightPanelFloatingPosition, setRightPanelFloatingPosition] = useState({
    left: 0,
    top: 96,
  });
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
  const configModalConfigPathRef = useRef<string | null>(null);
  const configModalPortfolioPathRef = useRef<string | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const selectedPreviewHtmlRef = useRef<string | null>(null);
  const interactionModeRef = useRef<
    "edit" | "preview" | "inspect" | "draw" | "move"
  >("edit");
  const previewModeRef = useRef<"edit" | "preview">("preview");
  const zenRestoreRef = useRef<{
    isLeftPanelOpen: boolean;
    isRightPanelOpen: boolean;
    isCodePanelOpen: boolean;
    interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  } | null>(null);
  const lastPreviewSyncRef = useRef<{
    path: string;
    at: number;
    source: "load" | "navigate" | "path_changed" | "explorer";
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const appRootRef = useRef<HTMLDivElement>(null);
  const leftPanelResizeStartXRef = useRef(0);
  const leftPanelResizeStartWidthRef = useRef(256);
  const leftPanelPendingWidthRef = useRef(256);
  const leftPanelResizeRafRef = useRef<number | null>(null);
  const rightPanelResizeStartXRef = useRef(0);
  const rightPanelResizeStartWidthRef = useRef(264);
  const rightPanelPendingWidthRef = useRef(264);
  const rightPanelResizeRafRef = useRef<number | null>(null);
  const rightPanelDragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    left: number;
    top: number;
  } | null>(null);
  const [isDraggingRightPanel, setIsDraggingRightPanel] = useState(false);
  const rightPanelManualClosedRef = useRef(false);
  const lastEditSelectionRef = useRef<string | null>(null);
  const rightPanelRestorePendingRef = useRef(false);
  const lastPanelDprRef = useRef<number | null>(null);
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
  const lastAutoDprZoomRef = useRef<50 | 75 | 100>(100);
  const previewHistoryRef = useRef<Record<string, PreviewHistoryEntry>>({});
  const previewDocCacheRef = useRef<Record<string, string>>({});
  const previewDocCacheOrderRef = useRef<string[]>([]);
  const autoSaveTimerRef = useRef<number | null>(null);
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
  const LEFT_PANEL_MIN_WIDTH = 220;
  const LEFT_PANEL_MAX_WIDTH = 520;
  const LEFT_PANEL_STRETCHED_WIDTH = 360;
  const LEFT_PANEL_COLLAPSED_WIDTH = 48;
  const RIGHT_PANEL_MIN_WIDTH = 264;
  const RIGHT_PANEL_MAX_WIDTH = 640;
  const CODE_PANEL_WIDTH = 620;

  const getDefaultRightPanelPosition = useCallback((width: number) => {
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 900;
    return {
      left: Math.max(8, viewportWidth - width - 40),
      top: Math.max(56, Math.min(96, viewportHeight - 160)),
    };
  }, []);

  useEffect(() => {
    setRightPanelFloatingPosition((prev) => {
      if (prev.left > 0) return prev;
      const next = getDefaultRightPanelPosition(rightPanelWidth);
      return {
        left: next.left,
        top: prev.top,
      };
    });
  }, [getDefaultRightPanelPosition, rightPanelWidth]);
  const {
    appendPreviewConsole,
    clearPreviewConsole,
    handleOpenDetachedConsole,
    isCompactConsoleOpening,
    previewConsoleEntries,
    previewConsoleErrorCount,
    previewConsoleWarnCount,
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

  // Desktop only: both panels open in overlay mode with horizontal scroll.
  const isFloatingPanels = panelLayoutMode === "floating";
  const bothPanelsOpen =
    !isFloatingPanels &&
    isLeftPanelOpen &&
    isRightPanelOpen &&
    deviceMode !== "mobile";
  const rightOverlayInset = bothPanelsOpen ? rightPanelWidth : 0;
  const floatingHorizontalInset =
    isFloatingPanels && deviceMode !== "mobile"
      ? (isLeftPanelOpen ? leftPanelWidth : 0) +
        (isRightPanelOpen ? rightPanelWidth : 0)
      : 0;
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
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
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
  useEffect(() => {
    configModalConfigPathRef.current = configModalConfigPath;
  }, [configModalConfigPath]);
  useEffect(() => {
    configModalPortfolioPathRef.current = configModalPortfolioPath;
  }, [configModalPortfolioPath]);

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
  const hasUnsavedChangesForFile = useCallback(
    (path: string | null): boolean => {
      if (!path) return false;
      if (typeof pendingPreviewWritesRef.current[path] === "string")
        return true;
      if (typeof codeDraftByPathRef.current[path] === "string") return true;
      if (codeDirtyPathSetRef.current[path]) return true;
      return dirtyFilesRef.current.includes(path);
    },
    [],
  );
  const commitPreviewActiveFileSync = useCallback(
    (nextPath: string, source: PreviewSyncSource) => {
      if (!nextPath) return;
      setPreviewSyncedFile((prev) => (prev === nextPath ? prev : nextPath));
      if (source === "navigate" || source === "explorer") {
        setPreviewNavigationFile((prev) =>
          prev === nextPath ? prev : nextPath,
        );
      }

      if (activeFileRef.current === nextPath) {
        if (
          interactionModeRef.current !== "preview" &&
          (source === "load" || source === "path_changed")
        ) {
          setInteractionMode("preview");
        }
        return;
      }

      const now = Date.now();
      const last = lastPreviewSyncRef.current;
      if (
        last &&
        last.path === nextPath &&
        last.source !== source &&
        now - last.at < 1200
      ) {
        return;
      }

      lastPreviewSyncRef.current = { path: nextPath, at: now, source };
      setActiveFileStable(nextPath);
      if (interactionModeRef.current !== "preview") {
        setInteractionMode("preview");
      }
    },
    [setActiveFileStable],
  );
  const syncPreviewActiveFile = useCallback(
    (
      nextPath: string,
      source: PreviewSyncSource,
      options?: { skipUnsavedPrompt?: boolean },
    ) => {
      if (!nextPath) return;
      const currentPath = selectedPreviewHtmlRef.current;
      const nextFile = filesRef.current[nextPath];
      const shouldPrompt =
        !options?.skipUnsavedPrompt &&
        source !== "load" &&
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        Boolean(currentPath) &&
        currentPath !== nextPath &&
        nextFile?.type === "html" &&
        hasUnsavedChangesForFile(currentPath);
      if (shouldPrompt && currentPath) {
        setPendingPageSwitch({
          mode: "switch",
          fromPath: currentPath,
          nextPath,
          source,
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      commitPreviewActiveFileSync(nextPath, source);
    },
    [commitPreviewActiveFileSync, hasUnsavedChangesForFile],
  );
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
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      if (previewStyleDraftTimerRef.current !== null) {
        window.clearTimeout(previewStyleDraftTimerRef.current);
      }
      if (previewLocalCssDraftTimerRef.current !== null) {
        window.clearTimeout(previewLocalCssDraftTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!appRootRef.current) return;
    appRootRef.current.style.setProperty(
      "--left-panel-width",
      `${leftPanelWidth}px`,
    );
    appRootRef.current.style.setProperty(
      "--right-panel-width",
      `${rightPanelWidth}px`,
    );
  }, [leftPanelWidth, rightPanelWidth]);

  useEffect(() => {
    if (!isResizingLeftPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - leftPanelResizeStartXRef.current;
      leftPanelPendingWidthRef.current = Math.min(
        LEFT_PANEL_MAX_WIDTH,
        Math.max(
          LEFT_PANEL_MIN_WIDTH,
          leftPanelResizeStartWidthRef.current + delta,
        ),
      );
      if (leftPanelResizeRafRef.current !== null) return;
      leftPanelResizeRafRef.current = requestAnimationFrame(() => {
        leftPanelResizeRafRef.current = null;
        if (appRootRef.current) {
          appRootRef.current.style.setProperty(
            "--left-panel-width",
            `${leftPanelPendingWidthRef.current}px`,
          );
        }
      });
    };

    const onMouseUp = () => {
      if (leftPanelResizeRafRef.current !== null) {
        cancelAnimationFrame(leftPanelResizeRafRef.current);
        leftPanelResizeRafRef.current = null;
      }
      setLeftPanelWidth(leftPanelPendingWidthRef.current);
      setIsResizingLeftPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingLeftPanel]);

  useEffect(() => {
    if (!isResizingRightPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = rightPanelResizeStartXRef.current - event.clientX;
      rightPanelPendingWidthRef.current = Math.min(
        RIGHT_PANEL_MAX_WIDTH,
        Math.max(
          RIGHT_PANEL_MIN_WIDTH,
          rightPanelResizeStartWidthRef.current + delta,
        ),
      );
      if (rightPanelResizeRafRef.current !== null) return;
      rightPanelResizeRafRef.current = requestAnimationFrame(() => {
        rightPanelResizeRafRef.current = null;
        if (appRootRef.current) {
          appRootRef.current.style.setProperty(
            "--right-panel-width",
            `${rightPanelPendingWidthRef.current}px`,
          );
        }
      });
    };

    const onMouseUp = () => {
      if (rightPanelResizeRafRef.current !== null) {
        cancelAnimationFrame(rightPanelResizeRafRef.current);
        rightPanelResizeRafRef.current = null;
      }
      setRightPanelWidth(rightPanelPendingWidthRef.current);
      setIsResizingRightPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingRightPanel]);

  useEffect(() => {
    if (!isDraggingRightPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const start = rightPanelDragStartRef.current;
      if (!start) return;
      const viewportWidth =
        typeof window !== "undefined" ? window.innerWidth : 1440;
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 900;
      const nextLeft = Math.max(
        8,
        Math.min(
          Math.max(8, viewportWidth - rightPanelWidth - 8),
          start.left + (event.clientX - start.pointerX),
        ),
      );
      const nextTop = Math.max(
        56,
        Math.min(
          Math.max(56, viewportHeight - 140),
          start.top + (event.clientY - start.pointerY),
        ),
      );
      setRightPanelFloatingPosition({ left: nextLeft, top: nextTop });
    };

    const onMouseUp = () => {
      rightPanelDragStartRef.current = null;
      setIsDraggingRightPanel(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDraggingRightPanel, rightPanelWidth]);

  const handleLeftPanelResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isLeftPanelOpen) return;
      event.preventDefault();
      leftPanelResizeStartXRef.current = event.clientX;
      leftPanelResizeStartWidthRef.current = leftPanelWidth;
      leftPanelPendingWidthRef.current = leftPanelWidth;
      setIsResizingLeftPanel(true);
    },
    [isLeftPanelOpen, leftPanelWidth],
  );
  const handleLeftPanelStretchToggle = useCallback(() => {
    setLeftPanelWidth((prev) =>
      prev >= LEFT_PANEL_STRETCHED_WIDTH ? 256 : LEFT_PANEL_STRETCHED_WIDTH,
    );
  }, []);

  const handleRightPanelResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isRightPanelOpen) return;
      event.preventDefault();
      rightPanelResizeStartXRef.current = event.clientX;
      rightPanelResizeStartWidthRef.current = rightPanelWidth;
      rightPanelPendingWidthRef.current = rightPanelWidth;
      setIsResizingRightPanel(true);
    },
    [isRightPanelOpen, rightPanelWidth],
  );

  const handleRightPanelDragStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isFloatingPanels || !isRightPanelOpen) return;
      if (
        (event.target as HTMLElement).closest("button, input, select, textarea")
      ) {
        return;
      }
      event.preventDefault();
      rightPanelDragStartRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: rightPanelFloatingPosition.left,
        top: rightPanelFloatingPosition.top,
      };
      setIsDraggingRightPanel(true);
    },
    [isFloatingPanels, isRightPanelOpen, rightPanelFloatingPosition],
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
  const pushPreviewHistory = useCallback(
    (filePath: string, nextHtml: string, previousHtml?: string) => {
      const current = previewHistoryRef.current[filePath];
      if (!current) {
        const baseline = typeof previousHtml === "string" ? previousHtml : "";
        previewHistoryRef.current[filePath] =
          baseline && baseline !== nextHtml
            ? {
                past: [baseline],
                present: nextHtml,
                future: [],
              }
            : {
                past: [],
                present: nextHtml,
                future: [],
              };
        return;
      }
      if (current.present === nextHtml) return;
      previewHistoryRef.current[filePath] = {
        past: [
          ...current.past.slice(-(MAX_PREVIEW_HISTORY - 1)),
          current.present,
        ],
        present: nextHtml,
        future: [],
      };
    },
    [],
  );

  const markPreviewPathDirty = useCallback(
    (filePath: string, elementPath: number[]) => {
      if (!elementPath || elementPath.length === 0) return;
      const key = elementPath.join(".");
      setDirtyPathKeysByFile((prev) => {
        const curr = prev[filePath] || [];
        if (curr.includes(key)) return prev;
        return { ...prev, [filePath]: [...curr, key] };
      });

      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!frameDocument?.body) return;
      const liveTarget = readElementByPath(frameDocument.body, elementPath);
      if (liveTarget instanceof HTMLElement) {
        liveTarget.classList.add("__nx-preview-dirty");
      }
    },
    [],
  );
  const flushPendingPreviewSaves = useCallback(async () => {
    const entries = Object.entries(pendingPreviewWritesRef.current);
    if (entries.length === 0) return;

    const savedPaths: string[] = [];
    for (const [filePath, content] of entries) {
      const absolutePath = filePathIndexRef.current[filePath];
      if (!absolutePath) continue;
      try {
        await (Neutralino as any).filesystem.writeFile(absolutePath, content);
        delete pendingPreviewWritesRef.current[filePath];
        savedPaths.push(filePath);
      } catch (error) {
        console.warn(`Failed to save ${filePath}:`, error);
      }
    }
    if (savedPaths.length === 0) return;

    dirtyFilesRef.current = dirtyFilesRef.current.filter(
      (path) => !savedPaths.includes(path),
    );
    setDirtyFiles((prev) => prev.filter((path) => !savedPaths.includes(path)));
    setDirtyPathKeysByFile((prev) => {
      const next = { ...prev };
      for (const path of savedPaths) {
        delete next[path];
      }
      return next;
    });

    const activePath = selectedPreviewHtmlRef.current;
    if (activePath && savedPaths.includes(activePath)) {
      const frameDocument =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (frameDocument) {
        Array.from(
          frameDocument.querySelectorAll<HTMLElement>(".__nx-preview-dirty"),
        ).forEach((el) => {
          if (el instanceof HTMLElement) {
            el.classList.remove("__nx-preview-dirty");
          }
        });
      }
    }
  }, []);
  const schedulePreviewAutoSave = useCallback(() => {
    if (!autoSaveEnabled) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void flushPendingPreviewSaves();
    }, 1200);
  }, [autoSaveEnabled, flushPendingPreviewSaves]);
  const discardUnsavedChangesForFile = useCallback(
    async (path: string) => {
      if (!path) return;
      const hadCodeDraft =
        typeof codeDraftByPath[path] === "string" ||
        Boolean(codeDirtyPathSet[path]);
      if (hadCodeDraft) {
        delete codeDraftByPathRef.current[path];
        delete codeDirtyPathSetRef.current[path];
        setCodeDraftByPath((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        setCodeDirtyPathSet((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
      const hadPreviewDraft =
        typeof pendingPreviewWritesRef.current[path] === "string";
      if (!hadPreviewDraft) {
        if (hadCodeDraft) {
          dirtyFilesRef.current = dirtyFilesRef.current.filter(
            (entry) => entry !== path,
          );
          setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
        }
        return;
      }

      const absolutePath = filePathIndexRef.current[path];
      if (!absolutePath) return;
      let diskContent = "";
      try {
        diskContent = await (Neutralino as any).filesystem.readFile(
          absolutePath,
        );
      } catch (error) {
        console.warn(`Failed discarding unsaved changes for ${path}:`, error);
        window.alert("Could not discard changes. Please try again.");
        return;
      }

      delete pendingPreviewWritesRef.current[path];
      textFileCacheRef.current[path] = diskContent;
      setFiles((prev) => {
        const existing = prev[path];
        if (!existing) return prev;
        return {
          ...prev,
          [path]: {
            ...existing,
            content: diskContent,
          },
        };
      });
      dirtyFilesRef.current = dirtyFilesRef.current.filter(
        (entry) => entry !== path,
      );
      setDirtyFiles((prev) => prev.filter((entry) => entry !== path));
      setDirtyPathKeysByFile((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      previewHistoryRef.current[path] = {
        past: [],
        present: diskContent,
        future: [],
      };
      invalidatePreviewDocCache(path);

      const currentEntry = filesRef.current[path];
      if (currentEntry) {
        const previewSnapshot: FileMap = {
          ...filesRef.current,
          [path]: {
            ...currentEntry,
            content: diskContent,
          },
        };
        const previewDoc = createPreviewDocument(
          previewSnapshot,
          path,
          previewDependencyIndexRef.current[path],
        );
        cachePreviewDoc(path, previewDoc);
        if (selectedPreviewHtmlRef.current === path) {
          setSelectedPreviewDoc(previewDoc);
          setPreviewRefreshNonce((prev) => prev + 1);
        }
      }
    },
    [
      cachePreviewDoc,
      codeDirtyPathSet,
      codeDraftByPath,
      invalidatePreviewDocCache,
    ],
  );
  const requestPreviewRefreshWithUnsavedGuard = useCallback(() => {
    const candidate =
      previewSyncedFile && filesRef.current[previewSyncedFile]?.type === "html"
        ? previewSyncedFile
        : selectedPreviewHtmlRef.current &&
            filesRef.current[selectedPreviewHtmlRef.current]?.type === "html"
          ? selectedPreviewHtmlRef.current
          : null;
    if (!candidate) {
      setPreviewRefreshNonce((prev) => prev + 1);
      return;
    }
    if (hasUnsavedChangesForFile(candidate)) {
      setPendingPageSwitch({
        mode: "refresh",
        fromPath: candidate,
        nextPath: candidate,
        source: "navigate",
      });
      setIsPageSwitchPromptOpen(true);
      return;
    }
    setPreviewNavigationFile((prev) => (prev === candidate ? prev : candidate));
    setPreviewRefreshNonce((prev) => prev + 1);
  }, [hasUnsavedChangesForFile, previewSyncedFile]);
  const handleOpenConfigModal = useCallback(() => {
    setConfigModalInitialTab("references");
    setIsConfigModalSlidesOnly(false);
    if (!projectPath) {
      setConfigModalConfigPath(null);
      setConfigModalPortfolioPath(null);
      setIsConfigModalOpen(true);
      return;
    }
    const pickBestPath = async (
      suffix: "config.json" | "portfolioconfig.json",
      kind: "config" | "portfolio",
    ): Promise<string> => {
      const candidates = getConfigPathCandidates(filesRef.current, suffix);
      const fallback =
        resolveConfigPathFromFiles(filesRef.current, suffix) ||
        (suffix === "config.json" ? CONFIG_JSON_PATH : PORTFOLIO_CONFIG_PATH);
      if (candidates.length === 0) return fallback;

      let bestPath = fallback;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const path of candidates) {
        const loaded = await loadFileContent(path, { persistToState: true });
        const score = scoreConfigContent(String(loaded || ""), kind);
        console.info("[ConfigModal] Candidate score", { kind, path, score });
        if (score > bestScore) {
          bestScore = score;
          bestPath = path;
        }
      }
      return bestPath;
    };

    void (async () => {
      const [configPath, portfolioPath] = await Promise.all([
        pickBestPath("config.json", "config"),
        pickBestPath("portfolioconfig.json", "portfolio"),
      ]);
      const refineConfigPath = async (initialPath: string | null) => {
        if (!initialPath) return initialPath;
        const initialContent = await loadFileContent(initialPath, {
          persistToState: true,
        });
        const initialScore = scoreConfigContent(
          String(initialContent || ""),
          "config",
        );
        if (initialScore >= 20) return initialPath;
        const pattern = /(^|\/)(?:mtconfig|config)\.(?:js|json)$/i;
        const candidates = Object.keys(filesRef.current).filter((path) =>
          pattern.test(path),
        );
        let bestPath = initialPath;
        let bestScore = initialScore;
        for (const candidate of candidates) {
          const loaded = await loadFileContent(candidate, {
            persistToState: false,
          });
          const score = scoreConfigContent(String(loaded || ""), "config");
          if (score > bestScore) {
            bestScore = score;
            bestPath = candidate;
          }
        }
        return bestPath;
      };
      const refinedConfigPath = await refineConfigPath(configPath);
      setConfigModalConfigPath(refinedConfigPath);
      setConfigModalPortfolioPath(portfolioPath);
      console.groupCollapsed("[ConfigModal] Open");
      console.info("[ConfigModal] Chosen config path:", refinedConfigPath);
      console.info("[ConfigModal] Chosen portfolio path:", portfolioPath);
      console.groupEnd();
      await Promise.all([
        refinedConfigPath
          ? loadFileContent(refinedConfigPath, { persistToState: true })
          : Promise.resolve(),
        loadFileContent(portfolioPath, { persistToState: true }),
      ]);
      for (const [path, entry] of Object.entries(filesRef.current)) {
        if (
          entry?.type === "image" &&
          /(^|\/)thumb\.(png|jpg|jpeg|webp|gif|svg)$/i.test(path)
        ) {
          void loadFileContent(path, { persistToState: true });
        }
      }
      setIsConfigModalOpen(true);
    })();
  }, [loadFileContent, projectPath]);
  const handleChooseFolderCloneSource = useCallback(() => {
    setConfigModalInitialTab("slides");
    setIsConfigModalSlidesOnly(true);
    setIsConfigModalOpen(true);
  }, []);
  const handleSidebarLoadImage = useCallback(
    (path: string) => {
      void loadFileContent(path, { persistToState: true });
    },
    [loadFileContent],
  );

  const handleSaveConfig = useCallback(
    async (newConfig: string, newPortfolio: string) => {
      try {
        const configPath =
          configModalConfigPathRef.current ||
          resolveConfigPathFromFiles(filesRef.current, "config.json") ||
          CONFIG_JSON_PATH;
        const portfolioPath =
          configModalPortfolioPathRef.current ||
          resolveConfigPathFromFiles(
            filesRef.current,
            "portfolioconfig.json",
          ) ||
          PORTFOLIO_CONFIG_PATH;

        if (filesRef.current[configPath]) {
          filesRef.current = {
            ...filesRef.current,
            [configPath]: {
              ...filesRef.current[configPath],
              content: newConfig,
            },
          };
          setFiles(filesRef.current);

          // mark dirty
          if (!dirtyFilesRef.current.includes(configPath)) {
            dirtyFilesRef.current.push(configPath);
            setDirtyFiles((prev) => [...prev, configPath]);
          }

          if (filePathIndexRef.current[configPath]) {
            await (Neutralino as any).filesystem.writeFile(
              filePathIndexRef.current[configPath],
              newConfig,
            );

            // mark clean
            dirtyFilesRef.current = dirtyFilesRef.current.filter(
              (entry) => entry !== configPath,
            );
            setDirtyFiles((prev) =>
              prev.filter((entry) => entry !== configPath),
            );
          }
        }

        if (filesRef.current[portfolioPath]) {
          filesRef.current = {
            ...filesRef.current,
            [portfolioPath]: {
              ...filesRef.current[portfolioPath],
              content: newPortfolio,
            },
          };
          setFiles(filesRef.current);

          // mark dirty
          if (!dirtyFilesRef.current.includes(portfolioPath)) {
            dirtyFilesRef.current.push(portfolioPath);
            setDirtyFiles((prev) => [...prev, portfolioPath]);
          }

          if (filePathIndexRef.current[portfolioPath]) {
            await (Neutralino as any).filesystem.writeFile(
              filePathIndexRef.current[portfolioPath],
              newPortfolio,
            );

            // mark clean
            dirtyFilesRef.current = dirtyFilesRef.current.filter(
              (entry) => entry !== portfolioPath,
            );
            setDirtyFiles((prev) =>
              prev.filter((entry) => entry !== portfolioPath),
            );
          }
        }

        requestPreviewRefreshWithUnsavedGuard();
      } catch (err) {
        console.error("Failed to save config:", err);
        alert("Failed to save configuration files.");
      }
    },
    [requestPreviewRefreshWithUnsavedGuard],
  );

  const requestSwitchToPreviewMode = useCallback(() => {
    if (interactionModeRef.current === "preview") {
      const currentPath = selectedPreviewHtmlRef.current;
      if (
        previewModeRef.current === "edit" &&
        currentPath &&
        hasUnsavedChangesForFile(currentPath)
      ) {
        setPendingPageSwitch({
          mode: "preview_mode",
          fromPath: currentPath,
          nextPath: currentPath,
          source: "navigate",
          nextPreviewMode: "preview",
        });
        setIsPageSwitchPromptOpen(true);
        return;
      }
      setPreviewMode("preview");
      return;
    }
    if (interactionModeRef.current !== "edit") {
      setInteractionMode("preview");
      setPreviewMode("preview");
      return;
    }
    const currentPath = selectedPreviewHtmlRef.current;
    if (currentPath && hasUnsavedChangesForFile(currentPath)) {
      setPendingPageSwitch({
        mode: "preview",
        fromPath: currentPath,
        nextPath: currentPath,
        source: "navigate",
      });
      setIsPageSwitchPromptOpen(true);
      return;
    }
    setInteractionMode("preview");
    setPreviewMode("preview");
  }, [hasUnsavedChangesForFile]);
  const resolvePendingPageSwitchWithSave = useCallback(async () => {
    if (!pendingPageSwitch) return;
    setIsPageSwitchPromptBusy(true);
    const pending = pendingPageSwitch;
    const waitForStateFlush = () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    try {
      await saveCodeDraftsRef.current?.();
      await flushPendingPreviewSaves();
      // React state cleanup for dirty flags may settle one tick later.
      await waitForStateFlush();
      let stillUnsaved = hasUnsavedChangesForFile(pending.fromPath);
      if (stillUnsaved) {
        await waitForStateFlush();
        stillUnsaved = hasUnsavedChangesForFile(pending.fromPath);
      }
      if (stillUnsaved) {
        window.alert("Some changes could not be saved. Please retry.");
        return;
      }
      setIsPageSwitchPromptOpen(false);
      setPendingPageSwitch(null);
      if (pending.mode === "refresh") {
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewRefreshNonce((prev) => prev + 1);
      } else if (pending.mode === "preview_mode") {
        setActiveFileStable(pending.fromPath);
        setPreviewSyncedFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewMode(pending.nextPreviewMode ?? "preview");
      } else if (pending.mode === "preview") {
        setInteractionMode("preview");
      } else {
        commitPreviewActiveFileSync(pending.nextPath, pending.source);
      }
    } finally {
      setIsPageSwitchPromptBusy(false);
    }
  }, [
    commitPreviewActiveFileSync,
    flushPendingPreviewSaves,
    hasUnsavedChangesForFile,
    pendingPageSwitch,
  ]);
  const resolvePendingPageSwitchWithDiscard = useCallback(async () => {
    if (!pendingPageSwitch) return;
    setIsPageSwitchPromptBusy(true);
    const pending = pendingPageSwitch;
    try {
      await discardUnsavedChangesForFile(pending.fromPath);
      setIsPageSwitchPromptOpen(false);
      setPendingPageSwitch(null);
      if (pending.mode === "refresh") {
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewRefreshNonce((prev) => prev + 1);
      } else if (pending.mode === "preview_mode") {
        setActiveFileStable(pending.fromPath);
        setPreviewSyncedFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewNavigationFile((prev) =>
          prev === pending.fromPath ? prev : pending.fromPath,
        );
        setPreviewMode(pending.nextPreviewMode ?? "preview");
      } else if (pending.mode === "preview") {
        setInteractionMode("preview");
      } else {
        commitPreviewActiveFileSync(pending.nextPath, pending.source);
      }
    } finally {
      setIsPageSwitchPromptBusy(false);
    }
  }, [
    commitPreviewActiveFileSync,
    discardUnsavedChangesForFile,
    pendingPageSwitch,
  ]);
  const closePendingPageSwitchPrompt = useCallback(() => {
    if (isPageSwitchPromptBusy) return;
    setIsPageSwitchPromptOpen(false);
    setPendingPageSwitch(null);
  }, [isPageSwitchPromptBusy]);

  const handlePreviewUndo = useCallback(async () => {
    const filePath = selectedPreviewHtmlRef.current;
    if (!filePath) return;
    const current = previewHistoryRef.current[filePath];
    if (!current || current.past.length === 0) return;
    const previous = current.past[current.past.length - 1];
    previewHistoryRef.current[filePath] = {
      past: current.past.slice(0, -1),
      present: previous,
      future: [current.present, ...current.future],
    };
    textFileCacheRef.current[filePath] = previous;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content: previous,
        },
      };
    });
    pendingPreviewWritesRef.current[filePath] = previous;
    setDirtyFiles((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );
    setDirtyPathKeysByFile((prev) => ({
      ...prev,
      [filePath]: [],
    }));
    const currentEntry = filesRef.current[filePath];
    if (currentEntry) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [filePath]: {
          ...currentEntry,
          content: previous,
        },
      };
      const previewDoc = createPreviewDocument(
        previewSnapshot,
        filePath,
        previewDependencyIndexRef.current[filePath],
      );
      cachePreviewDoc(filePath, previewDoc);
      setSelectedPreviewDoc(previewDoc);
    }
    await flushPendingPreviewSaves();
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [cachePreviewDoc, flushPendingPreviewSaves, schedulePreviewAutoSave]);

  const handlePreviewRedo = useCallback(async () => {
    const filePath = selectedPreviewHtmlRef.current;
    if (!filePath) return;
    const current = previewHistoryRef.current[filePath];
    if (!current || current.future.length === 0) return;
    const next = current.future[0];
    previewHistoryRef.current[filePath] = {
      past: [
        ...current.past.slice(-(MAX_PREVIEW_HISTORY - 1)),
        current.present,
      ],
      present: next,
      future: current.future.slice(1),
    };
    textFileCacheRef.current[filePath] = next;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing) return prev;
      return {
        ...prev,
        [filePath]: {
          ...existing,
          content: next,
        },
      };
    });
    pendingPreviewWritesRef.current[filePath] = next;
    setDirtyFiles((prev) =>
      prev.includes(filePath) ? prev : [...prev, filePath],
    );
    setDirtyPathKeysByFile((prev) => ({
      ...prev,
      [filePath]: [],
    }));
    const currentEntry = filesRef.current[filePath];
    if (currentEntry) {
      const previewSnapshot: FileMap = {
        ...filesRef.current,
        [filePath]: {
          ...currentEntry,
          content: next,
        },
      };
      const previewDoc = createPreviewDocument(
        previewSnapshot,
        filePath,
        previewDependencyIndexRef.current[filePath],
      );
      cachePreviewDoc(filePath, previewDoc);
      setSelectedPreviewDoc(previewDoc);
    }
    await flushPendingPreviewSaves();
    setPreviewRefreshNonce((prev) => prev + 1);
    schedulePreviewAutoSave();
  }, [cachePreviewDoc, flushPendingPreviewSaves, schedulePreviewAutoSave]);

  const runUndo = useCallback(() => {
    if (
      interactionModeRef.current === "preview" &&
      selectedPreviewHtmlRef.current
    ) {
      void handlePreviewUndo();
      return;
    }
    handleUndo();
  }, [handlePreviewUndo, handleUndo]);

  const runRedo = useCallback(() => {
    if (
      interactionModeRef.current === "preview" &&
      selectedPreviewHtmlRef.current
    ) {
      void handlePreviewRedo();
      return;
    }
    handleRedo();
  }, [handlePreviewRedo, handleRedo]);

  const toggleZenMode = useCallback(() => {
    setIsZenMode((prev) => {
      if (!prev) {
        zenRestoreRef.current = {
          isLeftPanelOpen,
          isRightPanelOpen,
          isCodePanelOpen,
          interactionMode,
        };
        setIsLeftPanelOpen(false);
        setIsRightPanelOpen(false);
        setIsCodePanelOpen(false);
        setInteractionMode("preview");
        return true;
      }

      const restore = zenRestoreRef.current;
      if (restore) {
        setIsLeftPanelOpen(restore.isLeftPanelOpen);
        setIsRightPanelOpen(restore.isRightPanelOpen);
        setIsCodePanelOpen(restore.isCodePanelOpen);
        setInteractionMode(restore.interactionMode);
      }
      zenRestoreRef.current = null;
      return false;
    });
  }, [
    interactionMode,
    isLeftPanelOpen,
    isRightPanelOpen,
    isCodePanelOpen,
  ]); // --- Keyboard Shortcuts ---
  useEffect(() => {
    if (isCodePanelOpen) {
      return;
    }

    if (interactionMode === "preview") {
      rightPanelManualClosedRef.current = false;
      setIsRightPanelOpen(false);
      return;
    }

    if (interactionMode !== "edit") {
      return;
    }

    if (rightPanelRestorePendingRef.current) {
      rightPanelRestorePendingRef.current = false;
      return;
    }

    if (selectedId !== lastEditSelectionRef.current) {
      lastEditSelectionRef.current = selectedId;
      rightPanelManualClosedRef.current = false;
    }

    if (!selectedId) {
      setIsRightPanelOpen(false);
      return;
    }

    if (!rightPanelManualClosedRef.current) {
      setIsRightPanelOpen(true);
    }
  }, [interactionMode, isCodePanelOpen, selectedId]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        target.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const hasModifier = e.ctrlKey || e.metaKey;
      const editableTarget = isEditableTarget(e.target);

      if (hasModifier && editableTarget) {
        if (key === "s") {
          e.preventDefault();
          void saveCodeDraftsRef.current?.();
          void flushPendingPreviewSaves();
          return;
        }
        if (key === "t") {
          e.preventDefault();
          requestPreviewRefreshWithUnsavedGuard();
          return;
        }
        if (key === "p") {
          e.preventDefault();
          requestSwitchToPreviewMode();
          return;
        }
        if (key === "f") {
          e.preventDefault();
          setIsLeftPanelOpen(true);
          setIsRightPanelOpen(true);
          setIsCodePanelOpen(false);
          return;
        }
        if (key === "b") {
          e.preventDefault();
          setIsLeftPanelOpen(true);
          return;
        }
        if (key === "i" && interactionModeRef.current === "edit") {
          e.preventDefault();
          rightPanelManualClosedRef.current = !isRightPanelOpen;
          setIsRightPanelOpen((prev) => {
            if (prev) return false;
            return Boolean(selectedId);
          });
          return;
        }
        if (key === "e") {
          e.preventDefault();
          setSidebarToolMode("edit");
          setInteractionMode("preview");
          setPreviewMode("edit");
          return;
        }
        // Let native editor undo/redo work inside inputs/contentEditable.
        return;
      }
      if (
        key === "escape" &&
        isPageSwitchPromptOpen &&
        !isPageSwitchPromptBusy
      ) {
        e.preventDefault();
        closePendingPageSwitchPrompt();
        return;
      }

      if (key === "escape" && isZenMode) {
        e.preventDefault();
        toggleZenMode();
        return;
      }

      if (!hasModifier && !e.altKey && !editableTarget) {
        if (key === "w") {
          e.preventDefault();
          if (!e.repeat) {
            setIsLeftPanelOpen(true);
          }
          return;
        }
        if (key === "e") {
          e.preventDefault();
          if (!e.repeat) {
            setIsRightPanelOpen((prev) => {
              const next = !prev;
              if (next) setIsCodePanelOpen(false);
              return next;
            });
          }
          return;
        }
      }

      if (!hasModifier) return;

      if (key === "f") {
        e.preventDefault();
        setIsLeftPanelOpen(true);
        setIsRightPanelOpen(true);
        setIsCodePanelOpen(false);
        return;
      }
      if (key === "b") {
        e.preventDefault();
        setIsLeftPanelOpen(true);
        return;
      }
      if (key === "i" && interactionModeRef.current === "edit") {
        e.preventDefault();
        rightPanelManualClosedRef.current = !isRightPanelOpen;
        setIsRightPanelOpen((prev) => {
          if (prev) return false;
          return Boolean(selectedId);
        });
        return;
      }
      if (key === "p") {
        e.preventDefault();
        requestSwitchToPreviewMode();
        return;
      }
      if (key === "e") {
        e.preventDefault();
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        setPreviewMode("edit");
        return;
      }
      if (key === "j") {
        e.preventDefault();
        toggleZenMode();
        return;
      }
      if (key === "s") {
        e.preventDefault();
        void saveCodeDraftsRef.current?.();
        void flushPendingPreviewSaves();
        return;
      }
      if (key === "t") {
        e.preventDefault();
        requestPreviewRefreshWithUnsavedGuard();
        return;
      }
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        runUndo();
        return;
      }
      if (key === "u" || key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        runRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closePendingPageSwitchPrompt,
    flushPendingPreviewSaves,
    isPageSwitchPromptBusy,
    isPageSwitchPromptOpen,
    isZenMode,
    previewSyncedFile,
    requestPreviewRefreshWithUnsavedGuard,
    requestSwitchToPreviewMode,
    runRedo,
    runUndo,
    selectedId,
    toggleZenMode,
    isRightPanelOpen,
  ]);

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

  const handleUpdateStyle = useCallback(
    (styles: Partial<React.CSSProperties>) => {
      if (!selectedId) return;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        styles: { ...el.styles, ...styles },
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateContent = useCallback(
    (data: {
      content?: string;
      html?: string;
      src?: string;
      href?: string;
    }) => {
      if (!selectedId) return;
      const normalizedData =
        typeof data.html === "string" && typeof data.content !== "string"
          ? {
              ...data,
              content: extractTextFromHtmlFragment(data.html),
            }
          : data;
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        ...normalizedData,
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateIdentity = useCallback(
    (identity: { id: string; className: string }) => {
      if (!selectedId) return;
      const nextId = identity.id.trim() || selectedId;
      const nextClassName = identity.className.trim();
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        id: nextId,
        className: nextClassName || undefined,
      }));
      pushHistory(newRoot);
      if (nextId !== selectedId) {
        setSelectedId(nextId);
      }
    },
    [root, selectedId, pushHistory],
  );

  const handleUpdateAnimation = useCallback(
    (animation: string) => {
      if (!selectedId) return;
      const nextAnimation =
        typeof animation === "string" ? animation.trim() : "";
      const newRoot = updateElementInTree(root, selectedId, (el) => ({
        ...el,
        animation: nextAnimation,
        styles: {
          ...el.styles,
          animation: nextAnimation,
        },
      }));
      pushHistory(newRoot);
    },
    [root, selectedId, pushHistory],
  );

  const handleMoveElement = useCallback(
    (draggedId: string, targetId: string) => {
      const draggedEl = findElementById(root, draggedId);
      if (!draggedEl) return;
      let newRoot = deleteElementFromTree(root, draggedId);
      newRoot = addElementToTree(newRoot, targetId, draggedEl, "inside");
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleMoveElementByPosition = useCallback(
    (id: string, styles: Partial<React.CSSProperties>) => {
      const target = findElementById(root, id);
      if (!target) return;
      let changed = false;
      for (const [key, value] of Object.entries(styles)) {
        if (
          String((target.styles as any)?.[key] ?? "") !== String(value ?? "")
        ) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      const newRoot = updateElementInTree(root, id, (el) => ({
        ...el,
        styles: { ...el.styles, ...styles },
      }));
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleResize = useCallback(
    (id: string, width: string, height: string) => {
      const newRoot = updateElementInTree(root, id, (el) => ({
        ...el,
        styles: { ...el.styles, width, height },
      }));
      pushHistory(newRoot);
    },
    [root, pushHistory],
  );

  const handleAddElement = useCallback(
    (type: string, position: "inside" | "before" | "after" = "inside") => {
      const idFor = createPresetIdFactory(type);
      const newElement =
        buildPresetElementV2(type, idFor) ??
        buildStandardElement(type, idFor("element"));
      const targetId = selectedId || root.id;
      const newRoot = addElementToTree(root, targetId, newElement, position);
      pushHistory(newRoot);
      setSelectedId(newElement.id);
      setIsRightPanelOpen(true);
    },
    [root, selectedId, pushHistory],
  );
  const handleSidebarAddElement = useCallback(
    (type: string) => {
      if (
        interactionModeRef.current === "preview" &&
        selectedPreviewHtmlRef.current
      ) {
        const frameRect = previewFrameRef.current?.getBoundingClientRect();
        const clientX = frameRect
          ? Math.round(frameRect.left + frameRect.width / 2)
          : Math.round(window.innerWidth / 2);
        const clientY = frameRect
          ? Math.round(frameRect.top + frameRect.height / 2)
          : Math.round(window.innerHeight / 2);
        setSidebarToolMode("edit");
        setInteractionMode("preview");
        setPreviewMode("edit");
        void applyPreviewDropCreateRef.current?.(type, clientX, clientY);
        return;
      }
      handleAddElement(type, "inside");
    },
    [handleAddElement],
  );
  const handleSidebarAddFontToPresentationCss = useCallback(
    (path: string) => {
      void handleAddFontToPresentationCss(path);
    },
    [handleAddFontToPresentationCss],
  );
  const handlePreviewRefresh = useCallback(() => {
    requestPreviewRefreshWithUnsavedGuard();
  }, [requestPreviewRefreshWithUnsavedGuard]);
  const appendPdfAnnotationLog = useCallback(
    (message: string, level: "info" | "warn" | "error" = "info") => {
      appendPdfAnnotationLogHelper(dispatch, message, level);
    },
    [dispatch],
  );
  const runPdfAnnotationMapping = useCallback(
    async (pdfPath: string, useCache: boolean) => {
      await runPdfAnnotationMappingHelper({
        projectPath,
        isPdfAnnotationLoading,
        pdfPath,
        useCache,
        files,
        absolutePathIndex: filePathIndexRef.current,
        dispatch,
        readPdfAnnotationCache,
        writePdfAnnotationCache,
      });
    },
    [
      files,
      isPdfAnnotationLoading,
      projectPath,
      readPdfAnnotationCache,
      writePdfAnnotationCache,
      dispatch,
      appendPdfAnnotationLog,
    ],
  );
  const handleOpenPdfAnnotationsPicker = useCallback(async () => {
    await selectPdfAndRunMapping({
      projectPath,
      isPdfAnnotationLoading,
      existingRecordsCount: pdfAnnotationRecords.length,
      useCache: true,
      dispatch,
      runMapping: runPdfAnnotationMapping,
    });
  }, [
    isPdfAnnotationLoading,
    pdfAnnotationRecords.length,
    projectPath,
    runPdfAnnotationMapping,
    dispatch,
  ]);
  const handleRefreshPdfAnnotationMapping = useCallback(async () => {
    await selectPdfAndRunMapping({
      projectPath,
      isPdfAnnotationLoading,
      existingRecordsCount: pdfAnnotationRecords.length,
      useCache: false,
      dispatch,
      runMapping: runPdfAnnotationMapping,
    });
  }, [isPdfAnnotationLoading, projectPath, runPdfAnnotationMapping]);
  const handleJumpToPdfAnnotation = useCallback(
    (annotation: PdfAnnotationUiRecord) => {
      if (!annotation.mappedFilePath) return;

      const currentSlide = selectedPreviewHtmlRef.current;
      const targetPath = normalizePath(annotation.mappedFilePath);
      const normalizedCurrent = currentSlide ? normalizePath(currentSlide) : "";

      const isTargetingCurrentSlide =
        normalizedCurrent && targetPath === normalizedCurrent;
      const hasInvocation = !!annotation.popupInvocation;

      const isSharedPopup =
        annotation.mappedFilePath.includes("/shared/") ||
        annotation.detectedPageType === "Child/Popup" ||
        hasInvocation;

      console.log(`[NX-DEBUG] Jump Triggered:
        Target: ${annotation.mappedFilePath}
        Current: ${currentSlide}
        Match: ${isTargetingCurrentSlide}
        Type: ${annotation.detectedPageType}
        Invocation: ${hasInvocation}
      `);

      // --- FIX: Logic for staying on context vs navigating ---
      const isTargetingSlideButNotCurrent =
        !isTargetingCurrentSlide &&
        !annotation.mappedFilePath.includes("/shared/");

      // If we are targeting the CURRENT slide OR it's a popup that belongs here, STAY.
      if (isTargetingCurrentSlide) {
        console.log(`[NX] Staying on current context. Same slide match.`);
        dispatch(setFocusedAnnotation({ ...annotation }));
        setPreviewMode("preview");
        setInteractionMode("preview");
        return;
      }

      // If it's a shared popup trigger BUT we are on some slide,
      // check if we should navigate to the target slide first.
      if (!isTargetingCurrentSlide && isTargetingSlideButNotCurrent) {
        console.log(
          `[NX] Navigating to target slide: ${annotation.mappedFilePath}`,
        );
        // Let it fall through to the navigation logic below
      } else if (currentSlide && isSharedPopup) {
        // This case handles truly "shared" resources that have no slide parent (legacy fallback)
        console.log(`[NX] Shared popup case - staying on context.`);
        dispatch(setFocusedAnnotation({ ...annotation }));
        setPreviewMode("preview");
        setInteractionMode("preview");
        return;
      }

      dispatch(setFocusedAnnotation({ ...annotation }));
      setSelectedId(null);
      setPreviewSelectedPath(null);
      setPreviewSelectedElement(null);
      setPreviewSelectedComputedStyles(null);
      setSidebarToolMode("edit");
      setPreviewMode("preview");
      setInteractionMode("preview");
      setActiveFileStable(annotation.mappedFilePath || "");
      setPreviewSyncedFile(annotation.mappedFilePath);
      setPreviewNavigationFile(annotation.mappedFilePath);
      dispatch(setIsOpen(true));
    },
    [setActiveFileStable, dispatch],
  );
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

  // --- Neutralino File System Integration ---
  const handleOpenFolder = async (preselectedFolder?: string | null) => {
    try {
      const selectedFolder =
        preselectedFolder ||
        (await (Neutralino as any).os.showFolderDialog(
          "Select project folder",
        ));
      if (!selectedFolder) return;

      setIsLeftPanelOpen(true);

      const rootPath = normalizePath(selectedFolder);
      let {
        files: fsFiles,
        absolutePathIndex,
        sharedDirectoryPath,
        nearestSharedParent,
      } = await indexProjectForOpen(rootPath);

      if (sharedDirectoryPath) {
        await patchMtVeevaCheck(sharedDirectoryPath);
      }

      const runtime = await initializeProjectOpenRuntime({
        fsFiles,
        absolutePathIndex,
        sharedDirectoryPath,
        nearestSharedParent,
        rootPath,
        previousPreviewRootAliasPath: previewRootAliasPathRef.current,
      });
      fsFiles = runtime.fsFiles;
      absolutePathIndex = runtime.absolutePathIndex;
      presentationCssPathRef.current = runtime.presentationCssVirtualPath;
      fontCachePathRef.current = runtime.fontCacheVirtualPath;
      previewRootAliasPathRef.current = runtime.previewRootAliasPath;
      setAvailableFonts(runtime.availableFonts);

      filePathIndexRef.current = absolutePathIndex;
      loadingFilesRef.current.clear();
      loadingFilePromisesRef.current = {};
      textFileCacheRef.current = {};
      revokeBinaryAssetUrls();
      clearPreviewConsole();
      pendingPreviewWritesRef.current = {};
      previewHistoryRef.current = {};
      previewDependencyIndexRef.current = {};
      previewDocCacheRef.current = {};
      previewDocCacheOrderRef.current = [];
      setDirtyFiles([]);
      setDirtyPathKeysByFile({});
      setFiles(fsFiles);
      setProjectPath(rootPath);
      setRecentProjects((prev) =>
        [
          rootPath,
          ...prev.filter((entry) => normalizePath(entry) !== rootPath),
        ].slice(0, 5),
      );
      setPreviewMountBasePath(runtime.mountBasePath);
      setIsPreviewMountReady(runtime.mountReady);

      const defaultHtmlFile = pickDefaultHtmlFile(fsFiles);
      const firstOpenableFile = Object.values(fsFiles).find((file) =>
        ["html", "css", "js", "unknown"].includes(file.type),
      );
      const initialFile = defaultHtmlFile ?? firstOpenableFile?.path ?? null;
      setActiveFileStable(initialFile);
      setPreviewSyncedFile(initialFile);
      setPreviewNavigationFile(initialFile);
      selectedPreviewHtmlRef.current =
        initialFile && fsFiles[initialFile]?.type === "html"
          ? initialFile
          : null;
      setSidebarToolMode("edit");
      setPreviewMode("preview");
      setInteractionMode("preview");
    } catch (error) {
      console.error("Failed to open folder:", error);
      alert("Could not open folder. Please try again.");
    }
  };
  useEffect(() => {
    if (!projectPath) {
      dispatch(setRecords([]));
      dispatch(setFileName(""));
      dispatch(setSourcePath(null));
      dispatch(setClassifierMetrics(null));
      dispatch(setError(null));
      dispatch(setIsOpen(false));
      dispatch(setIsLoading(false));
      dispatch(setFocusedAnnotation(null));
      return;
    }
    const cache = readPdfAnnotationCache();
    const normalizedProject = normalizePath(projectPath);
    const cachedProject = cache?.projects?.[normalizedProject];
    const cachedPath = cachedProject?.lastPdfPath || null;
    if (cachedPath && cachedProject?.entries?.[cachedPath]) {
      const cachedEntry = cachedProject.entries[cachedPath];
      const cachedRecords = cachedEntry.records || [];
      dispatch(setRecords(cachedRecords));
      const metrics = evaluateAnnotationTypeClassifier(cachedRecords).micro;
      dispatch(setClassifierMetrics(metrics as any));
      dispatch(setFileName(cachedEntry.fileName || ""));
      dispatch(setSourcePath(cachedPath));
      dispatch(setIsOpen(false));
    } else {
      dispatch(setRecords([]));
      dispatch(setFileName(""));
      dispatch(setSourcePath(null));
      dispatch(setClassifierMetrics(null));
    }
    dispatch(setError(null));
    dispatch(setIsLoading(false));
    dispatch(setFocusedAnnotation(null));
  }, [projectPath, readPdfAnnotationCache, dispatch]);
  useEffect(() => {
    if (!focusedPdfAnnotation) return;
    const timer = window.setTimeout(() => {
      dispatch(setFocusedAnnotation(null));
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [focusedPdfAnnotation]);
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
  const ensureDirectoryTreeStable = useCallback(ensureDirectoryTree, []);
  const ensureDirectoryForFileStable = useCallback(ensureDirectoryForFile, []);
  const resolvePreviewAssetUrl = useCallback(
    (rawUrl: string | null | undefined) => {
      return resolvePreviewAssetUrlHelper({
        rawUrl,
        projectPath,
        previewMountBasePath,
        selectedPreviewHtml: selectedPreviewHtmlRef.current || "",
        filePathIndex: filePathIndexRef.current,
      });
    },
    [projectPath, previewMountBasePath],
  );
  const openPopupInPreview = useCallback(
    (selector: string | null, popupId: string | null) => {
      const doc =
        previewFrameRef.current?.contentDocument ??
        previewFrameRef.current?.contentWindow?.document ??
        null;
      if (!doc) return false;
      let target: HTMLElement | null = null;
      if (selector) {
        target = doc.querySelector(selector) as HTMLElement | null;
      }
      if (!target && popupId) {
        target = doc.querySelector(
          `[data-popup-id="${popupId}"], #${popupId}`,
        ) as HTMLElement | null;
      }
      if (!target) return false;
      target.style.display = target.style.display || "block";
      target.style.visibility = "visible";
      target.style.opacity = target.style.opacity || "1";
      target.classList.add("open", "active", "show");
      target.classList.remove("hidden", "is-hidden", "closed");
      target.removeAttribute("hidden");
      target.setAttribute("aria-hidden", "false");
      target.style.pointerEvents = "auto";
      target.scrollIntoView({ block: "center", inline: "center" });
      return true;
    },
    [],
  );
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
  const refreshProjectFiles = useCallback(async () => {
    if (!projectPath) return;
    if (isRefreshingFilesRef.current) return;
    isRefreshingFilesRef.current = true;
    try {
      const { files: nextFiles, absolutePathIndex } =
        await refreshProjectFileIndex({
          projectPath,
          previousFileIndex: filePathIndexRef.current,
          existingFiles: filesRef.current,
          textFileCache: textFileCacheRef.current,
          binaryAssetUrlCache: binaryAssetUrlCacheRef.current,
        });

      filePathIndexRef.current = absolutePathIndex;
      setFiles(nextFiles);
      setCodeDraftByPath((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(
            ([path]) => nextFiles[path] && isTextFileType(nextFiles[path].type),
          ),
        ),
      );
      setCodeDirtyPathSet(
        (prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(
              ([path]) =>
                nextFiles[path] && isTextFileType(nextFiles[path].type),
            ),
          ) as Record<string, true>,
      );
      setDirtyFiles((prev) => prev.filter((path) => Boolean(nextFiles[path])));

      const existingActive = activeFileRef.current;
      const preferredPreview = selectedPreviewHtmlRef.current;
      if (!existingActive || !nextFiles[existingActive]) {
        const fallback =
          (preferredPreview && nextFiles[preferredPreview]
            ? preferredPreview
            : null) ??
          pickDefaultHtmlFile(nextFiles) ??
          Object.keys(nextFiles).find((path) =>
            isTextFileType(nextFiles[path].type),
          ) ??
          null;
        setActiveFileStable(fallback);
        setPreviewSyncedFile(fallback);
        setPreviewNavigationFile(fallback);
      }
    } catch (error) {
      console.warn("Failed to refresh file index:", error);
    } finally {
      isRefreshingFilesRef.current = false;
    }
  }, [projectPath, setActiveFileStable]);
  const handleCreateFileAtPath = useCallback(
    async (parentPath: string) => {
      if (!projectPath) return;
      const defaultName = "new-file.html";
      const nextName = window.prompt("New file name", defaultName);
      if (!nextName) return;
      const cleanedName = normalizeProjectRelative(nextName);
      if (!cleanedName) return;

      const baseVirtual = normalizeProjectRelative(parentPath || "");
      const nextVirtual = normalizeProjectRelative(
        baseVirtual ? `${baseVirtual}/${cleanedName}` : cleanedName,
      );
      if (!nextVirtual) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("A file with the same path already exists.");
        return;
      }

      const absolutePath = normalizePath(joinPath(projectPath, nextVirtual));
      const absoluteParent = getParentPath(absolutePath);
      if (absoluteParent) {
        await ensureDirectoryTreeStable(absoluteParent);
      }
      try {
        await (Neutralino as any).filesystem.writeFile(absolutePath, "");
      } catch (error) {
        console.warn("Failed to create file:", error);
        window.alert("Could not create file.");
        return;
      }
      await refreshProjectFiles();
      setActiveFileStable(nextVirtual);
      setPreviewSyncedFile((prev) =>
        prev === nextVirtual ? prev : nextVirtual,
      );
      setPreviewNavigationFile((prev) =>
        prev === nextVirtual ? prev : nextVirtual,
      );
      setIsLeftPanelOpen(true);
    },
    [
      ensureDirectoryTreeStable,
      projectPath,
      refreshProjectFiles,
      setActiveFileStable,
    ],
  );
  const handleCreateFolderAtPath = useCallback(
    async (parentPath: string) => {
      if (!projectPath) return;
      if (!selectedFolderCloneSource) {
        setIsConfigModalOpen(true);
        return;
      }
      const nextName = window.prompt("New folder name", "new-folder");
      if (!nextName) return;
      const cleanedName = normalizeProjectRelative(nextName);
      if (!cleanedName) return;
      const baseVirtual = normalizeProjectRelative(parentPath || "");
      const nextVirtual = normalizeProjectRelative(
        baseVirtual ? `${baseVirtual}/${cleanedName}` : cleanedName,
      );
      if (!nextVirtual) return;
      const absoluteSource = normalizePath(
        joinPath(projectPath, selectedFolderCloneSource),
      );
      const absolutePath = normalizePath(joinPath(projectPath, nextVirtual));
      try {
        await (Neutralino as any).filesystem.copy(
          absoluteSource,
          absolutePath,
          {
            recursive: true,
            overwrite: false,
            skip: false,
          },
        );
      } catch (error) {
        console.warn("Failed to clone directory:", error);
        window.alert("Could not clone folder.");
        return;
      }
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, selectedFolderCloneSource],
  );
  const handleRenamePath = useCallback(
    async (path: string) => {
      if (!projectPath) return;
      if (!path) return;
      const currentName = path.includes("/")
        ? path.slice(path.lastIndexOf("/") + 1)
        : path;
      const nextName = window.prompt("Rename to", currentName);
      if (!nextName) return;
      const normalizedName = normalizeProjectRelative(nextName);
      if (!normalizedName) return;
      const parentVirtual = getParentPath(path) || "";
      const nextVirtual = normalizeProjectRelative(
        parentVirtual ? `${parentVirtual}/${normalizedName}` : normalizedName,
      );
      if (!nextVirtual || nextVirtual === path) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("Another item with the same name already exists.");
        return;
      }
      const absoluteSource =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      const absoluteParent = getParentPath(absoluteSource);
      if (!absoluteParent) return;
      const absoluteDestination = normalizePath(
        joinPath(absoluteParent, normalizedName),
      );
      try {
        await (Neutralino as any).filesystem.move(
          absoluteSource,
          absoluteDestination,
        );
      } catch (error) {
        console.warn("Rename failed:", error);
        window.alert("Could not rename item.");
        return;
      }
      await refreshProjectFiles();
      if (activeFileRef.current === path) {
        setActiveFileStable(nextVirtual);
      }
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  const handleDeletePath = useCallback(
    async (path: string, kind: "file" | "folder") => {
      if (!projectPath || !path) return;
      const label = kind === "folder" ? "folder" : "file";
      const ok = window.confirm(`Delete ${label} "${path}"?`);
      if (!ok) return;
      const absoluteTarget =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      try {
        await (Neutralino as any).filesystem.remove(absoluteTarget);
      } catch (error) {
        console.warn("Delete failed:", error);
        window.alert("Could not delete item.");
        return;
      }
      if (
        activeFileRef.current &&
        (activeFileRef.current === path ||
          activeFileRef.current.startsWith(`${path}/`))
      ) {
        setActiveFileStable(null);
      }
      await refreshProjectFiles();
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  const handleDuplicateFile = useCallback(
    async (path: string) => {
      if (!projectPath || !path) return;
      const absoluteSource =
        filePathIndexRef.current[path] ||
        normalizePath(joinPath(projectPath, path));
      const currentName = path.includes("/")
        ? path.slice(path.lastIndexOf("/") + 1)
        : path;
      const dotIndex = currentName.lastIndexOf(".");
      const stem = dotIndex > 0 ? currentName.slice(0, dotIndex) : currentName;
      const ext = dotIndex > 0 ? currentName.slice(dotIndex) : "";
      const defaultName = `${stem}-copy${ext}`;
      const nextName = window.prompt("Duplicate as", defaultName);
      if (!nextName) return;
      const normalizedName = normalizeProjectRelative(nextName);
      if (!normalizedName) return;
      const parentVirtual = getParentPath(path) || "";
      const nextVirtual = normalizeProjectRelative(
        parentVirtual ? `${parentVirtual}/${normalizedName}` : normalizedName,
      );
      if (!nextVirtual) return;
      if (filesRef.current[nextVirtual]) {
        window.alert("A file with this name already exists.");
        return;
      }
      const absoluteParent = getParentPath(absoluteSource);
      if (!absoluteParent) return;
      const absoluteDestination = normalizePath(
        joinPath(absoluteParent, normalizedName),
      );
      try {
        await (Neutralino as any).filesystem.copy(
          absoluteSource,
          absoluteDestination,
          {
            recursive: false,
            overwrite: false,
            skip: false,
          },
        );
      } catch (error) {
        console.warn("Duplicate failed:", error);
        window.alert("Could not duplicate file.");
        return;
      }
      await refreshProjectFiles();
      setActiveFileStable(nextVirtual);
      setIsLeftPanelOpen(true);
    },
    [projectPath, refreshProjectFiles, setActiveFileStable],
  );
  useEffect(() => {
    if (!projectPath) return;
    const timer = window.setInterval(() => {
      if (document.hidden || !document.hasFocus()) return;
      void refreshProjectFiles();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [projectPath, refreshProjectFiles]);
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
  const resolveExplorerHtmlPath = useCallback(
    (rawPath: string): string | null => {
      const normalized = normalizeProjectRelative(String(rawPath || ""));
      if (!normalized) return null;

      const direct =
        findFilePathCaseInsensitive(filesRef.current, normalized) || normalized;
      const directFile = filesRef.current[direct];
      if (directFile?.type === "html") return direct;

      const baseFolder = direct.replace(/\/+$/, "");
      const directIndex = findFilePathCaseInsensitive(
        filesRef.current,
        `${baseFolder}/index.html`,
      );
      if (directIndex && filesRef.current[directIndex]?.type === "html") {
        return directIndex;
      }

      const htmlUnderFolder = Object.keys(filesRef.current)
        .filter((path) => {
          const normalizedPath = normalizeProjectRelative(path);
          if (!normalizedPath.startsWith(`${baseFolder}/`)) return false;
          return filesRef.current[path]?.type === "html";
        })
        .sort((a, b) => a.localeCompare(b));
      if (htmlUnderFolder.length === 0) return null;
      return htmlUnderFolder[0];
    },
    [],
  );
  const handleSelectFile = useCallback(
    (path: string) => {
      const resolvedPath = resolveExplorerHtmlPath(path) || path;
      console.log("[Preview] Current page:", resolvedPath);

      const currentPath = selectedPreviewHtmlRef.current;
      const targetIsHtml = filesRef.current[resolvedPath]?.type === "html";

      if (targetIsHtml) {
        // THE FIX: Tag the exact time of the user's manual click
        (window as any).__explorerNavTime = Date.now();
      }

      if (
        interactionModeRef.current === "preview" &&
        previewModeRef.current === "edit" &&
        targetIsHtml &&
        currentPath &&
        currentPath !== resolvedPath &&
        hasUnsavedChangesForFile(currentPath)
      ) {
        setPendingPageSwitch({
          mode: "switch",
          fromPath: currentPath,
          nextPath: resolvedPath,
          source: "explorer",
        });
        setIsPageSwitchPromptOpen(true);
        setIsLeftPanelOpen(true);
        return;
      }

      if (activeFileRef.current === resolvedPath) {
        setIsLeftPanelOpen(true);
        if (
          filesRef.current[resolvedPath]?.type === "html" &&
          interactionModeRef.current !== "preview"
        ) {
          setInteractionMode("preview");
        }
        return;
      }

      if (targetIsHtml) {
        explorerSelectionLockRef.current = resolvedPath;
        explorerSelectionLockUntilRef.current =
          Date.now() + EXPLORER_LOCK_TTL_MS;
      }
      syncPreviewActiveFile(resolvedPath, "explorer");
      setIsLeftPanelOpen(true);
    },
    [
      EXPLORER_LOCK_TTL_MS,
      hasUnsavedChangesForFile,
      resolveExplorerHtmlPath,
      syncPreviewActiveFile,
    ],
  );
  const selectedElement = selectedId ? findElementById(root, selectedId) : null;
  const selectedPathIds = useMemo(
    () => collectPathIdsToElement(root, selectedId),
    [root, selectedId],
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
  const previewLayerSelectedId = useMemo(() => {
    if (
      interactionMode !== "preview" ||
      !Array.isArray(previewSelectedPath) ||
      previewSelectedPath.length === 0
    ) {
      return null;
    }
    return toPreviewLayerId(previewSelectedPath);
  }, [interactionMode, previewSelectedPath]);
  const previewLayersRoot = useMemo<VirtualElement>(() => {
    if (interactionMode !== "preview") return root;
    const emptyPreviewRoot: VirtualElement = {
      id: "preview-live-root",
      type: "body",
      name: "Body",
      content: "",
      html: "",
      styles: {},
      children: [],
    };
    const liveDocument =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    const liveBody = liveDocument?.body ?? null;
    if (liveBody) {
      return {
        id: "preview-live-root",
        type: "body",
        name: "Body",
        content: "",
        html: liveBody.innerHTML || "",
        styles: {},
        children: Array.from(liveBody.children).map((child, index) =>
          buildPreviewLayerTreeFromElement(child, [index]),
        ),
      };
    }
    const activeHtmlPath = selectedPreviewHtmlRef.current;
    const activeHtmlFile =
      activeHtmlPath && files[activeHtmlPath] ? files[activeHtmlPath] : null;
    const activeHtmlContent =
      activeHtmlFile && typeof activeHtmlFile.content === "string"
        ? activeHtmlFile.content
        : "";
    const fallbackHtml =
      activeHtmlPath &&
      typeof textFileCacheRef.current[activeHtmlPath] === "string"
        ? textFileCacheRef.current[activeHtmlPath]
        : "";
    const sourceHtml =
      activeHtmlContent && activeHtmlContent.trim().length > 0
        ? activeHtmlContent
        : fallbackHtml && fallbackHtml.trim().length > 0
          ? fallbackHtml
          : selectedPreviewDoc;
    if (!sourceHtml || sourceHtml.trim().length === 0) return emptyPreviewRoot;
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(sourceHtml, "text/html");
      const body = parsed.body;
      return {
        id: "preview-live-root",
        type: "body",
        name: "Body",
        content: "",
        html: body?.innerHTML || "",
        styles: {},
        children: body
          ? Array.from(body.children).map((child, index) =>
              buildPreviewLayerTreeFromElement(child, [index]),
            )
          : [],
      };
    } catch {
      return emptyPreviewRoot;
    }
  }, [files, interactionMode, previewRefreshNonce, root, selectedPreviewDoc]);
  const selectPreviewElementAtPath = useCallback((path: number[]) => {
    if (
      interactionModeRef.current !== "preview" ||
      !Array.isArray(path) ||
      path.length === 0
    ) {
      return;
    }
    const frameDocument =
      previewFrameRef.current?.contentDocument ??
      previewFrameRef.current?.contentWindow?.document ??
      null;
    if (!frameDocument?.body) return;
    const target = readElementByPath(frameDocument.body, path);
    if (!target) return;
    Array.from(
      frameDocument.querySelectorAll<HTMLElement>(".__nx-preview-selected"),
    ).forEach((el) => el.classList.remove("__nx-preview-selected"));
    target.classList.add("__nx-preview-selected");
    const inlineStyles = parseInlineStyleText(
      target.getAttribute("style") || "",
    );
    const computedStyles = extractComputedStylesFromElement(target);
    const matchedCssRules = collectMatchedCssRulesFromElement(target);
    const nextElement: VirtualElement = {
      id: getStablePreviewElementId(path, target.getAttribute("id")),
      type: String(target.tagName || "div").toLowerCase(),
      name: String(target.tagName || "div").toUpperCase(),
      content: normalizeEditorMultilineText(extractTextWithBreaks(target)),
      html: target instanceof HTMLElement ? target.innerHTML || "" : "",
      ...(target.getAttribute("src")
        ? { src: target.getAttribute("src") || "" }
        : {}),
      ...(target.getAttribute("href")
        ? { href: target.getAttribute("href") || "" }
        : {}),
      ...(target.getAttribute("class")
        ? { className: target.getAttribute("class") || "" }
        : {}),
      ...(extractCustomAttributesFromElement(target)
        ? { attributes: extractCustomAttributesFromElement(target) || {} }
        : {}),
      styles: inlineStyles,
      children: [],
    };
    setPreviewSelectedPath(path);
    setPreviewSelectedElement(nextElement);
    setPreviewSelectedComputedStyles(computedStyles);
    setPreviewSelectedMatchedCssRules(matchedCssRules);
    setSelectedId(null);
    setIsCodePanelOpen(false);
    setIsRightPanelOpen(true);
  }, [getStablePreviewElementId]);
  const handleSidebarSelectElement = useCallback(
    (id: string) => {
      const previewPath = fromPreviewLayerId(id);
      if (previewPath) {
        selectPreviewElementAtPath(previewPath);
        return;
      }
      handleSelect(id);
    },
    [handleSelect, selectPreviewElementAtPath],
  );
  const inspectorElement = previewSelectedElement ?? selectedElement;
  const selectedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (previewSyncedFile && files[previewSyncedFile]?.type === "html") {
      return previewSyncedFile;
    }
    if (activeFile && files[activeFile]?.type === "html") return activeFile;
    return pickDefaultHtmlFile(files);
  }, [activeFile, files, previewSyncedFile, projectPath]);
  const currentPreviewSlideId = useMemo(() => {
    if (!selectedPreviewHtml) return null;
    const parts = normalizePath(selectedPreviewHtml).split("/").filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : null;
  }, [selectedPreviewHtml]);
  // Sync ref with reactive state for use in callbacks
  useEffect(() => {
    selectedPreviewHtmlRef.current = selectedPreviewHtml;
  }, [selectedPreviewHtml]);

  const annotationsForCurrentSlide = useMemo(() => {
    if (!selectedPreviewHtml) return [];
    const normalizedCurrent = normalizePath(selectedPreviewHtml);
    return pdfAnnotationRecords.filter((record) =>
      record.mappedFilePath
        ? normalizePath(record.mappedFilePath) === normalizedCurrent
        : false,
    );
  }, [pdfAnnotationRecords, selectedPreviewHtml]);
  const isPopupAnnotation = useCallback((annotation: PdfAnnotationUiRecord) => {
    if (annotation.annotationStatus) {
      return annotation.annotationStatus === "Popup";
    }
    if (annotation.detectedPageType === "Main") return false;
    if (
      annotation.subtype === "Popup" ||
      annotation.detectedSubtype === "Popup"
    ) {
      return true;
    }
    if (annotation.detectedPageType === "Child/Popup") return true;
    if (annotation.popupInvocation?.popupId) return true;
    if (annotation.mappedFilePath?.includes("/shared/")) return true;
    return false;
  }, []);
  const filteredAnnotationsForCurrentSlide = useMemo(() => {
    if (pdfAnnotationTypeFilter === "all") return annotationsForCurrentSlide;
    return annotationsForCurrentSlide.filter((annotation) => {
      const isPopup = isPopupAnnotation(annotation);
      return pdfAnnotationTypeFilter === "popup" ? isPopup : !isPopup;
    });
  }, [annotationsForCurrentSlide, pdfAnnotationTypeFilter, isPopupAnnotation]);
  const focusedAnnotationForCurrentSlide = useMemo(() => {
    if (!focusedPdfAnnotation || !selectedPreviewHtml) return null;
    return focusedPdfAnnotation.mappedFilePath === selectedPreviewHtml
      ? focusedPdfAnnotation
      : null;
  }, [focusedPdfAnnotation, selectedPreviewHtml]);
  useEffect(() => {
    const frame = previewFrameRef.current;
    const doc = frame?.contentDocument;

    const previous = previewFocusedPdfElementRef.current;
    if (previous) {
      previous.style.outline = "";
      previous.style.boxShadow = "";
      previous.style.transition = "";
      previous.removeAttribute("data-nx-pdf-focus");
      previewFocusedPdfElementRef.current = null;
    }

    if (!doc) return;

    const previousHighlights = [
      ...doc.querySelectorAll("[data-nx-pdf-anno]"),
    ] as HTMLElement[];
    for (const el of previousHighlights) {
      el.style.outline = "";
      el.style.boxShadow = "";
      el.style.transition = "";
      el.removeAttribute("data-nx-pdf-anno");
    }

    const normalizedCurrentPath = selectedPreviewHtml
      ? normalizePath(selectedPreviewHtml)
      : null;
    const annotationsForCurrentSlide = normalizedCurrentPath
      ? pdfAnnotationRecords.filter((record) =>
          record.mappedFilePath
            ? normalizePath(record.mappedFilePath) === normalizedCurrentPath
            : false,
        )
      : [];

    const resolveAnnotationTarget = (annotation: PdfAnnotationUiRecord) => {
      const selectors = [
        annotation.foundSelector,
        annotation.popupInvocation?.triggerSelector,
        annotation.popupInvocation?.containerSelector,
      ].filter((entry): entry is string => Boolean(entry));
      for (const selector of selectors) {
        const node = doc.querySelector(selector) as HTMLElement | null;
        if (node) return node;
      }
      return null;
    };

    const filteredAnnotations =
      pdfAnnotationTypeFilter === "all"
        ? annotationsForCurrentSlide
        : annotationsForCurrentSlide.filter((annotation) => {
            const isPopup = isPopupAnnotation(annotation);
            return pdfAnnotationTypeFilter === "popup" ? isPopup : !isPopup;
          });

    for (const annotation of filteredAnnotations) {
      const target = resolveAnnotationTarget(annotation);
      if (!target) continue;
      const isPopup = isPopupAnnotation(annotation);
      target.setAttribute("data-nx-pdf-anno", "true");
      target.style.transition = "outline 0.2s ease, box-shadow 0.2s ease";
      target.style.outline = isPopup
        ? "2px solid rgba(56,189,248,0.55)"
        : "2px solid rgba(34,197,94,0.65)";
      target.style.boxShadow = isPopup
        ? "0 0 0 4px rgba(56,189,248,0.16)"
        : "0 0 0 4px rgba(34,197,94,0.18)";
    }

    if (!focusedAnnotationForCurrentSlide) return;
    const focusedIsPopup = isPopupAnnotation(focusedAnnotationForCurrentSlide);
    if (
      pdfAnnotationTypeFilter !== "all" &&
      ((pdfAnnotationTypeFilter === "popup" && !focusedIsPopup) ||
        (pdfAnnotationTypeFilter === "slide" && focusedIsPopup))
    ) {
      return;
    }

    // --- NEW: Close all existing dialogs first to ensure clean transition ---
    try {
      // 1. Click all obvious close buttons
      const closeButtons = [
        ...doc.querySelectorAll(
          ".closeDialog, .close-dialog, .close, [data-dialog-close], .nx-close-overlay, .closePopup",
        ),
      ] as HTMLElement[];
      for (const btn of closeButtons) {
        try {
          btn.click();
        } catch {}
      }

      // 2. Force hide all common dialog containers
      const containers = [
        ...doc.querySelectorAll(
          ".popup, .dialog, .modal, [role='dialog'], [data-popup-id], .nx-popup-overlay",
        ),
      ] as HTMLElement[];
      for (const container of containers) {
        container.style.display = "none";
        container.style.visibility = "hidden";
        container.classList.remove("open", "active", "show", "is-visible");
        container.setAttribute("aria-hidden", "true");
      }

      // 3. Presentation Runtime Cleanup (GSK/Veeva specific)
      const frameWindow = frame?.contentWindow as any;
      if (frameWindow) {
        if (frameWindow.com?.gsk?.mt?.closeDialog) {
          try {
            frameWindow.com.gsk.mt.closeDialog();
          } catch {}
        }
        if (typeof frameWindow.$ === "function") {
          try {
            frameWindow
              .$(".popup, .dialog, .modal")
              .hide()
              .removeClass("open active show");
          } catch {}
        }
      }
    } catch (e) {
      console.warn("[NX] Failed to cleanup existing dialogs:", e);
    }
    // --------------------------------------------------------------------------

    const focusedTarget = resolveAnnotationTarget(
      focusedAnnotationForCurrentSlide,
    );
    if (focusedTarget) {
      focusedTarget.setAttribute("data-nx-pdf-focus", "true");
      focusedTarget.style.transition =
        "outline 0.2s ease, box-shadow 0.2s ease";
      focusedTarget.style.outline = "3px solid rgba(239,68,68,0.98)";
      focusedTarget.style.boxShadow = "0 0 0 6px rgba(239,68,68,0.35)";
      focusedTarget.scrollIntoView({ block: "center", inline: "center" });
      previewFocusedPdfElementRef.current = focusedTarget;
    }

    return;


  }, [
    focusedAnnotationForCurrentSlide,
    isPopupAnnotation,
    pdfAnnotationRecords,
    pdfAnnotationTypeFilter,
    previewRefreshNonce,
    previewFrameLoadNonce,
    selectedPreviewHtml,
  ]);

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

  const selectedMountedPreviewHtml = useMemo(() => {
    if (!projectPath) return null;
    if (
      previewNavigationFile &&
      files[previewNavigationFile]?.type === "html"
    ) {
      return previewNavigationFile;
    }
    return selectedPreviewHtml;
  }, [files, previewNavigationFile, projectPath, selectedPreviewHtml]);
  const selectedPreviewSrc = useMemo(() => {
    if (
      !selectedMountedPreviewHtml ||
      !isPreviewMountReady ||
      !previewMountBasePath
    ) {
      return null;
    }
    const absolutePath = filePathIndexRef.current[selectedMountedPreviewHtml];
    if (!absolutePath) return null;
    const relativePath = toMountRelativePath(
      previewMountBasePath,
      absolutePath,
    );
    if (!relativePath) return null;
    const nlPort = String((window as any).NL_PORT || "").trim();
    const previewServerOrigin = nlPort ? `http://127.0.0.1:${nlPort}` : "";
    const mountPath = encodeURI(`${PREVIEW_MOUNT_PATH}/${relativePath}`);
    const withRefresh = `${mountPath}${mountPath.includes("?") ? "&" : "?"}nx_refresh=${previewRefreshNonce}`;
    return previewServerOrigin
      ? `${previewServerOrigin}${withRefresh}`
      : withRefresh;
  }, [
    selectedMountedPreviewHtml,
    isPreviewMountReady,
    previewMountBasePath,
    previewRefreshNonce,
    projectPath,
  ]);
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
  const resolvedConfigVirtualPath = useMemo(
    () => resolveConfigPathFromFiles(files, "config.json") || CONFIG_JSON_PATH,
    [files],
  );
  const resolvedPortfolioConfigVirtualPath = useMemo(
    () =>
      resolveConfigPathFromFiles(files, "portfolioconfig.json") ||
      PORTFOLIO_CONFIG_PATH,
    [files],
  );
  const configPathForModal = configModalConfigPath || resolvedConfigVirtualPath;
  const portfolioPathForModal =
    configModalPortfolioPath || resolvedPortfolioConfigVirtualPath;
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
    applyPreviewDeleteSelected,
    applyPreviewTagUpdate,
    applyQuickTextWrapTag,
    handlePreviewDuplicateSelected,
    handleReplacePreviewAsset,
  } = usePreviewElementActions({
    applyPreviewContentUpdate,
    binaryAssetUrlCacheRef,
    extractAssetSourceFromElement,
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
    textFileCacheRef,
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
    handlePreviewNudgeZIndex,
    handlePreviewResizeHandleMouseDown,
    handlePreviewResizeNudge,
    isPreviewResizing,
    previewSelectionBox,
    updatePreviewSelectionBox,
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
  const handlePreviewDeleteStable = useCallback(() => {
    void applyPreviewDeleteSelected();
  }, [applyPreviewDeleteSelected]);
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
    isZenMode,
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
    toggleZenMode,
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

  const tabletMetrics = useMemo(() => {
    const base =
      tabletModel === "ipad-pro"
        ? {
            framePortraitWidth: 834,
            framePortraitHeight: 1112,
            contentPortraitWidth: 2048,
            contentPortraitHeight: 2732,
          }
        : {
            framePortraitWidth: 768,
            framePortraitHeight: 1024,
            contentPortraitWidth: 1536,
            contentPortraitHeight: 2048,
          };

    if (tabletOrientation === "landscape") {
      return {
        frameWidth: base.framePortraitHeight,
        frameHeight: base.framePortraitWidth,
        contentWidth: base.contentPortraitHeight,
        contentHeight: base.contentPortraitWidth,
      };
    }

    return {
      frameWidth: base.framePortraitWidth,
      frameHeight: base.framePortraitHeight,
      contentWidth: base.contentPortraitWidth,
      contentHeight: base.contentPortraitHeight,
    };
  }, [tabletModel, tabletOrientation]);
  const tabletViewportScale = useMemo(() => {
    const tabletBezelPx = 20; // 10px border on each side
    const usableWidth = Math.max(1, tabletMetrics.frameWidth - tabletBezelPx);
    const usableHeight = Math.max(1, tabletMetrics.frameHeight - tabletBezelPx);
    return Math.min(
      usableWidth / tabletMetrics.contentWidth,
      usableHeight / tabletMetrics.contentHeight,
    );
  }, [tabletMetrics]);
  const [currentDevicePixelRatio, setCurrentDevicePixelRatio] = useState(() =>
    typeof window !== "undefined" && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1,
  );
  const shouldPushTabletFrame =
    deviceMode === "tablet" &&
    frameZoom === 75 &&
    currentDevicePixelRatio !== 1;
  const tabletPanelPushX = useMemo(() => {
    if (isPdfAnnotationPanelOpen && deviceMode === "tablet") {
      return 0;
    }
    if (!shouldPushTabletFrame) return 0;

    const rightActive =
      rightPanelMode === "inspector" ||
      isRightPanelOpen ||
      isPdfAnnotationPanelOpen ||
      isScreenshotGalleryOpen;
    if (isLeftPanelOpen === rightActive) return 0;

    // Calculate push amount based on panel widths
    const pushAmount = Math.round(leftPanelWidth * 0.42);
    return isLeftPanelOpen ? pushAmount : -pushAmount;
  }, [
    isLeftPanelOpen,
    rightPanelMode,
    isRightPanelOpen,
    isPdfAnnotationPanelOpen,
    isScreenshotGalleryOpen,
    leftPanelWidth,
    shouldPushTabletFrame,
    deviceMode,
  ]);
  const baseOverflowX = bothPanelsOpen ? "scroll" : "auto";
  const hasPdfAnnotationsLoaded = pdfAnnotationRecords.length > 0;
  const isRightInspectorMode = rightPanelMode === "inspector";
  const isRightInspectorAttached = isRightInspectorMode && isRightPanelOpen;
  const showEmbeddedPdfAnnotations =
    isPdfAnnotationPanelOpen &&
    (hasPdfAnnotationsLoaded ||
      isPdfAnnotationLoading ||
      Boolean(pdfAnnotationError) ||
      pdfAnnotationProcessingLogs.length > 0);
  const showStyleInspectorSection = isStyleInspectorSectionOpen;
  const isTabletZoomMode = deviceMode === "tablet";
  const lockAllScrollAt50 = isTabletZoomMode && frameZoom === 50;
  const lockVerticalAt75Landscape =
    isTabletZoomMode && frameZoom === 75 && tabletOrientation === "landscape";
  const lockHorizontalAt75Portrait =
    isTabletZoomMode && frameZoom === 75 && tabletOrientation === "portrait";
  const shouldLockHorizontalScroll =
    lockAllScrollAt50 || lockHorizontalAt75Portrait;
  const shouldLockVerticalScroll =
    lockAllScrollAt50 || lockVerticalAt75Landscape;
  const frameScale = frameZoom / 100;
  const darkTabletReflectionOpacity =
    theme === "dark" && deviceMode === "tablet"
      ? Math.min(
          0.72,
          0.28 +
            (isLeftPanelOpen ? 0.12 : 0) +
            (isRightPanelOpen ? 0.12 : 0) +
            (isCodePanelOpen ? 0.12 : 0),
        )
      : 0;
  const codePanelStageOffset =
    isCodePanelOpen && deviceMode !== "mobile"
      ? (() => {
          const viewportWidth =
            typeof window !== "undefined" ? window.innerWidth : 1440;
          if (!isFloatingPanels) return CODE_PANEL_WIDTH;
          const floatingPanelWidth = Math.min(
            42 * 16,
            Math.max(320, viewportWidth - 96),
          );
          const floatingRightInset = 40; // `right-10`
          return floatingPanelWidth + floatingRightInset;
        })()
      : 0;
  const consolePanelStageOffset = 0;
  const stageViewportWidth = Math.max(
    320,
    (typeof window !== "undefined" ? window.innerWidth : 1440) -
      codePanelStageOffset -
      consolePanelStageOffset,
  );
  const estimatedFrameWidthPx =
    deviceMode === "mobile"
      ? 375 * frameScale
      : deviceMode === "tablet"
        ? tabletMetrics.frameWidth * frameScale
        : desktopResolution === "resizable"
          ? stageViewportWidth * 0.8 * frameScale
          : 921.6 * frameScale;
  const halfSpareSpace = (stageViewportWidth - estimatedFrameWidthPx) / 2;
  const maxShiftMagnitude =
    Math.max(0, Math.floor(halfSpareSpace - 16)) +
    (isPdfAnnotationPanelOpen && deviceMode !== "tablet" ? 400 : 0);
  const intendedCodeShiftX = 0;
  const clampedCodeShiftX = Math.max(
    -maxShiftMagnitude,
    Math.min(maxShiftMagnitude, intendedCodeShiftX),
  );
  const clampedTabletShiftX = Math.max(
    -maxShiftMagnitude,
    Math.min(maxShiftMagnitude, tabletPanelPushX + clampedCodeShiftX),
  );
  const toolbarAnchorLeft = Math.max(
    16,
    Math.round(
      (typeof window !== "undefined" ? window.innerWidth : 1440) / 2 -
        estimatedFrameWidthPx / 2 +
        20,
    ),
  );
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
  const showDeviceFrameToolbar = true;

  useEffect(() => {
    const syncDevicePixelRatio = () => {
      const next =
        typeof window !== "undefined" && window.devicePixelRatio
          ? window.devicePixelRatio
          : 1;
      setCurrentDevicePixelRatio((prev) =>
        Math.abs(prev - next) > 0.01 ? next : prev,
      );
    };

    syncDevicePixelRatio();
    const media =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
        : null;

    window.addEventListener("resize", syncDevicePixelRatio);
    media?.addEventListener?.("change", syncDevicePixelRatio);

    return () => {
      window.removeEventListener("resize", syncDevicePixelRatio);
      media?.removeEventListener?.("change", syncDevicePixelRatio);
    };
  }, [currentDevicePixelRatio]);

  useEffect(() => {
    const previousDpr = lastPanelDprRef.current;
    lastPanelDprRef.current = currentDevicePixelRatio;
    if (
      previousDpr === null ||
      Math.abs(previousDpr - currentDevicePixelRatio) < 0.01
    ) {
      return;
    }
    setRightPanelFloatingPosition(
      getDefaultRightPanelPosition(rightPanelWidth),
    );
  }, [currentDevicePixelRatio, getDefaultRightPanelPosition, rightPanelWidth]);

  useEffect(() => {
    const clampRightPanelPosition = () => {
      const viewportWidth =
        typeof window !== "undefined" ? window.innerWidth : 1440;
      const viewportHeight =
        typeof window !== "undefined" ? window.innerHeight : 900;
      setRightPanelFloatingPosition((prev) => ({
        left: Math.max(
          8,
          Math.min(prev.left, Math.max(8, viewportWidth - rightPanelWidth - 8)),
        ),
        top: Math.max(
          56,
          Math.min(prev.top, Math.max(56, viewportHeight - 140)),
        ),
      }));
    };

    window.addEventListener("resize", clampRightPanelPosition);
    return () => window.removeEventListener("resize", clampRightPanelPosition);
  }, [rightPanelWidth]);

  useEffect(() => {
    const targetZoom: 75 | 100 = currentDevicePixelRatio >= 1.5 ? 75 : 100;
    const previousAuto = lastAutoDprZoomRef.current;
    if (previousAuto === targetZoom) return;
    lastAutoDprZoomRef.current = targetZoom;
    if (deviceMode !== "tablet") return;
    setFrameZoom(targetZoom);
  }, [currentDevicePixelRatio, deviceMode]);

  useEffect(() => {
    if (interactionMode !== "preview" || !quickTextEdit.open) return;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 900;
    const margin = 16;
    const panelWidth = rightPanelWidth;
    const panelHeight = 420;
    const nextLeft = Math.max(
      margin,
      Math.min(quickTextEdit.x, viewportWidth - panelWidth - margin),
    );
    const nextTop = Math.max(
      margin,
      Math.min(quickTextEdit.y, viewportHeight - panelHeight - margin),
    );
    setRightPanelFloatingPosition({ left: nextLeft, top: nextTop });
    if (!isRightPanelOpen) {
      setIsRightPanelOpen(true);
    }
  }, [
    interactionMode,
    quickTextEdit.open,
    quickTextEdit.x,
    quickTextEdit.y,
    rightPanelWidth,
    isRightPanelOpen,
  ]);
  const pendingSwitchFromLabel =
    pendingPageSwitch?.fromPath &&
    normalizePath(pendingPageSwitch.fromPath).split("/").filter(Boolean)
      .length > 0
      ? normalizePath(pendingPageSwitch.fromPath)
          .split("/")
          .filter(Boolean)
          .slice(-1)[0]
      : pendingPageSwitch?.fromPath || "current page";
  const pendingSwitchNextLabel =
    pendingPageSwitch?.nextPath &&
    normalizePath(pendingPageSwitch.nextPath).split("/").filter(Boolean)
      .length > 0
      ? normalizePath(pendingPageSwitch.nextPath)
          .split("/")
          .filter(Boolean)
          .slice(-1)[0]
      : pendingPageSwitch?.nextPath || "next page";
  const isPendingRefresh = pendingPageSwitch?.mode === "refresh";
  const isPendingPreviewMode = pendingPageSwitch?.mode === "preview_mode";
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
      {isPageSwitchPromptOpen && pendingPageSwitch && (
        <div
          className="fixed inset-0 z-[1400] flex items-center justify-center px-4"
          style={{
            background:
              theme === "dark" ? "rgba(2,6,23,0.58)" : "rgba(15,23,42,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl p-5"
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
              borderColor:
                theme === "dark"
                  ? "rgba(148,163,184,0.32)"
                  : "rgba(15,23,42,0.12)",
              color: "var(--text-main)",
            }}
          >
            <div
              className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Unsaved Changes
            </div>
            <h3 className="text-base font-semibold leading-tight">
              {isPendingRefresh
                ? "Save changes before refresh?"
                : isPendingPreviewMode
                  ? "Save changes before switching mode?"
                  : "Save changes before switching page?"}
            </h3>
            <p
              className="text-xs mt-2 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              You have unsaved edits in{" "}
              <span
                className="font-semibold"
                style={{ color: "var(--text-main)" }}
              >
                {pendingSwitchFromLabel}
              </span>
              .
              {isPendingRefresh ? (
                <> Refresh can overwrite your in-memory edits.</>
              ) : isPendingPreviewMode ? (
                <>
                  {" "}
                  Switching to Preview mode can overwrite your in-memory edits.
                </>
              ) : (
                <>
                  {" "}
                  Switching to{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-main)" }}
                  >
                    {pendingSwitchNextLabel}
                  </span>{" "}
                  can overwrite your in-memory edits.
                </>
              )}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-black/5"
                style={{
                  borderColor: "var(--border-color)",
                  color: "var(--text-main)",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={closePendingPageSwitchPrompt}
                disabled={isPageSwitchPromptBusy}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-rose-500/10"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(251,113,133,0.45)"
                      : "rgba(225,29,72,0.35)",
                  color: theme === "dark" ? "#fecdd3" : "#be123c",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={() => {
                  void resolvePendingPageSwitchWithDiscard();
                }}
                disabled={isPageSwitchPromptBusy}
              >
                {isPendingRefresh ? "Discard & Refresh" : "Discard & Switch"}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-cyan-500/15"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(34,211,238,0.45)"
                      : "rgba(8,145,178,0.35)",
                  color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                  opacity: isPageSwitchPromptBusy ? 0.65 : 1,
                }}
                onClick={() => {
                  void resolvePendingPageSwitchWithSave();
                }}
                disabled={isPageSwitchPromptBusy}
              >
                {isPageSwitchPromptBusy
                  ? "Working..."
                  : isPendingRefresh
                    ? "Save & Refresh"
                    : "Save & Switch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Floating Toolbar --- */}
      {false && (
        <div
          className={`absolute top-3 z-[1000] transition-all animate-slideDown ${isZenMode ? "opacity-65" : ""}`}
          style={{ left: `${toolbarAnchorLeft}px` }}
        >
          <div
            className="px-3 py-1 flex items-center gap-2 min-w-0 rounded-[16px] border"
            style={{
              background:
                theme === "dark"
                  ? "rgba(12,18,30,0.96)"
                  : "rgba(248,250,252,0.96)",
              borderColor:
                theme === "dark"
                  ? "rgba(199,208,220,0.42)"
                  : "rgba(15,23,42,0.14)",
              boxShadow:
                theme === "dark"
                  ? "0 10px 24px rgba(2,6,23,0.34)"
                  : "0 10px 24px rgba(15,23,42,0.10)",
            backdropFilter: "none",
            }}
          >
            {null}
            <button
              className={`glass-icon-btn navbar-icon-btn ${deviceMode === "tablet" ? "active" : ""}`}
              onClick={() => {
                setDeviceMode("tablet");
                setTabletOrientation((prev) =>
                  prev === "landscape" ? "portrait" : "landscape",
                );
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setDeviceMode("tablet");
                setDeviceCtxMenu({
                  type: "tablet",
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              title={`iPad (${tabletOrientation === "landscape" ? "Landscape" : "Portrait"}) - click to rotate, right-click for model`}
            >
              <Tablet
                size={16}
                className="transition-transform duration-300 ease-out"
                style={{
                  transform: `rotate(${tabletOrientation === "landscape" ? 90 : 0}deg)`,
                }}
              />
            </button>
            <button
              className="glass-icon-btn navbar-icon-btn"
              onClick={handlePreviewRefresh}
              title="Refresh iPad content (Ctrl+T)"
            >
              <RotateCw size={16} />
            </button>
            <div className="h-4 w-px bg-gray-500/20"></div>
            <div className="flex items-center gap-1 rounded-full px-1 py-1 border border-gray-500/20">
              {[50, 75, 100].map((zoom) => (
                <button
                  key={zoom}
                  onClick={() => setFrameZoom(zoom as 50 | 75 | 100)}
                  className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                    frameZoom === zoom
                      ? theme === "light"
                        ? "bg-cyan-500/20 text-cyan-700 border border-cyan-500/35"
                        : "bg-indigo-500/25 text-indigo-300"
                      : theme === "light"
                        ? "text-slate-500"
                        : "text-gray-300"
                  }`}
                  title={`Set frame zoom to ${zoom}%`}
                >
                  {zoom}%
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-gray-500/20"></div>
            <button
              className="glass-icon-btn navbar-icon-btn"
              onClick={toggleThemeWithTransition}
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="h-4 w-px bg-gray-500/20"></div>
            <button
              className="glass-icon-btn navbar-icon-btn"
              onClick={runUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              className="glass-icon-btn navbar-icon-btn"
              onClick={runRedo}
              title="Redo (Ctrl+U)"
            >
              <Redo2 size={16} />
            </button>
            <div className="h-4 w-px bg-gray-500/20"></div>
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: dirtyFiles.length > 0 ? "#f59e0b" : "#22c55e",
              }}
              aria-hidden="true"
            />
            {interactionMode === "preview" && (
              <div className="flex items-center gap-1 rounded-full px-1 py-1 border border-gray-500/20">
                <button
                  onClick={() => setPreviewModeWithSync("edit")}
                  className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                    previewMode === "edit"
                      ? theme === "light"
                        ? "bg-amber-500/20 text-amber-700 border border-amber-500/35"
                        : "bg-amber-500/25 text-amber-200 border border-amber-500/35"
                      : theme === "light"
                        ? "text-slate-500"
                        : "text-gray-300"
                  }`}
                  title="LIVE Edit mode: select and edit elements"
                >
                  Edit
                </button>
                <button
                  onClick={() => setPreviewModeWithSync("preview")}
                  className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                    previewMode === "preview"
                      ? theme === "light"
                        ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/35"
                        : "bg-emerald-500/25 text-emerald-200 border border-emerald-500/35"
                      : theme === "light"
                        ? "text-slate-500"
                        : "text-gray-300"
                  }`}
                  title="LIVE Preview mode: navigate and interact"
                >
                  Preview
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Device Context Menu */}
      {deviceCtxMenu && (
        <DeviceContextMenu
          type={deviceCtxMenu.type}
          position={{ x: deviceCtxMenu.x, y: deviceCtxMenu.y }}
          mobileFrameStyle={mobileFrameStyle}
          setMobileFrameStyle={setMobileFrameStyle}
          desktopResolution={desktopResolution}
          setDesktopResolution={setDesktopResolution}
          tabletModel={tabletModel}
          tabletOrientation={tabletOrientation}
          setTabletModel={setTabletModel}
          onClose={() => setDeviceCtxMenu(null)}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <div
          className={`absolute z-40 no-scrollbar ${isResizingLeftPanel ? "" : "transition-all duration-700"} ${isFloatingPanels ? (isPanelsSwapped ? "right-0 top-20" : "left-0 top-20") : isPanelsSwapped ? "right-0 top-0 bottom-0" : "left-0 top-0 bottom-0"} ${isZenMode || isCodePanelOpen ? "opacity-0 pointer-events-none" : ""}`}
          style={{
            transform: isLeftPanelOpen
              ? "translateX(0) scale(1)"
              : isPanelsSwapped
                ? "translateX(8px) scale(0.985)"
                : "translateX(-8px) scale(0.985)",
            width: isLeftPanelOpen
              ? "var(--left-panel-width)"
              : `${LEFT_PANEL_COLLAPSED_WIDTH}px`,
            minHeight: isFloatingPanels ? "30vh" : undefined,
            maxHeight: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            height: isFloatingPanels
              ? "min(70vh, calc(100vh - 7.5rem))"
              : undefined,
            borderRadius: isFloatingPanels
              ? isPanelsSwapped
                ? "1rem 0 0 1rem"
                : "0 1rem 1rem 0"
              : undefined,
            border: isFloatingPanels
              ? theme === "light"
                ? "1px solid rgba(15, 23, 42, 0.18)"
                : "1px solid rgba(255, 255, 255, 0.25)"
              : undefined,
            background: theme === "dark" ? "rgba(10, 15, 30, 0.96)" : "#fff",
            overflowY: "hidden",
            overflowX: "hidden",
            transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            transformOrigin: isPanelsSwapped ? "right center" : "left center",
          }}
        >
          <div
            className={`h-full min-h-full relative flex flex-col overflow-hidden ${
              isFloatingPanels
                ? isPanelsSwapped
                  ? "rounded-l-2xl overflow-hidden"
                  : "rounded-r-2xl overflow-hidden"
                : ""
            }`}
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,250,252,0.74) 100%)",
              backdropFilter: "none",
            }}
          >
            <div className="min-h-0 flex-1">
              <Sidebar
                files={files}
                projectPath={projectPath}
                activeFile={previewSyncedFile ?? activeFile}
                onSelectFile={handleSelectFile}
                onAddFontToPresentationCss={
                  handleSidebarAddFontToPresentationCss
                }
                onCreateFile={handleCreateFileAtPath}
                onCreateFolder={handleCreateFolderAtPath}
                onRenamePath={handleRenamePath}
                onDeletePath={handleDeletePath}
                onDuplicateFile={handleDuplicateFile}
                onRefreshFiles={refreshProjectFiles}
                onOpenProjectFolder={handleOpenFolder}
                onOpenCodePanel={openCodePanel}
                selectedFolderCloneSource={selectedFolderCloneSource}
                onChooseFolderCloneSource={handleChooseFolderCloneSource}
                onAddElement={handleSidebarAddElement}
                root={interactionMode === "preview" ? previewLayersRoot : root}
                selectedId={
                  interactionMode === "preview"
                    ? previewLayerSelectedId
                    : selectedId
                }
                onSelectElement={handleSidebarSelectElement}
                interactionMode={sidebarInteractionMode}
                setInteractionMode={handleSidebarInteractionModeChange}
                drawElementTag={drawElementTag}
                setDrawElementTag={setDrawElementTag}
                theme={theme}
                showConfigButton={isEdaProject(files)}
                onOpenConfig={handleOpenConfigModal}
                onLoadImage={handleSidebarLoadImage}
                isPanelOpen={isLeftPanelOpen}
                onTogglePanelOpen={setIsLeftPanelOpen}
                showMasterTools={SHOW_MASTER_TOOLS}
                showCollapseControl
                animationElement={
                  interactionMode === "preview" && previewSelectedElement
                    ? previewSelectedElement
                    : selectedElement
                }
                isEditModeActive={
                  interactionMode === "edit" ||
                  (interactionMode === "preview" && previewMode === "edit")
                }
                onUpdateAnimation={
                  interactionMode === "preview" && previewSelectedElement
                    ? handlePreviewAnimationUpdateStable
                    : handleUpdateAnimation
                }
                onUpdateAnimationStyle={
                  interactionMode === "preview" && previewSelectedElement
                    ? handlePreviewStyleUpdateStable
                    : handleUpdateStyle
                }
              />
            </div>
            <div
              className={`pointer-events-none absolute inset-0 ${isFloatingPanels ? "rounded-r-2xl" : ""}`}
              style={{
                boxShadow:
                  theme === "dark"
                    ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                    : "inset 0 0 0 1px rgba(255,255,255,0.45)",
              }}
            />
          </div>
          {isLeftPanelOpen && (
            <div
              onMouseDown={handleLeftPanelResizeStart}
              onClick={handleLeftPanelStretchToggle}
              className={`absolute top-0 ${isPanelsSwapped ? "left-0" : "right-0"} h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors`}
              title="Resize panel. Click to stretch or shrink"
            />
          )}
        </div>

        {/* --- Main Canvas Area ("The Stage") --- */}
        {/* Non-mobile: 1 panel = push, both panels = overlay with scrollable content. Mobile: always overlay. */}
        <div
          className={`flex-1 flex flex-col relative ${isResizingLeftPanel || isResizingRightPanel ? "" : "transition-all duration-500"}`}
          style={{
            marginLeft:
              !isFloatingPanels &&
              deviceMode !== "mobile" &&
              ((isPanelsSwapped && !isLeftPanelOpen && isRightPanelOpen) ||
                (!isPanelsSwapped && isLeftPanelOpen && !isRightPanelOpen))
                ? isPanelsSwapped
                  ? "var(--right-panel-width)"
                  : "var(--left-panel-width)"
                : 0,
            marginRight: codePanelStageOffset
              ? `${codePanelStageOffset}px`
              : consolePanelStageOffset
                ? `${consolePanelStageOffset}px`
                : !isFloatingPanels &&
                    deviceMode !== "mobile" &&
                    isRightInspectorAttached
                  ? "var(--right-panel-width)"
                  : !isFloatingPanels &&
                      deviceMode !== "mobile" &&
                      ((isPanelsSwapped &&
                        isLeftPanelOpen &&
                        !isRightPanelOpen) ||
                        (!isPanelsSwapped &&
                          !isLeftPanelOpen &&
                          isRightPanelOpen))
                    ? isPanelsSwapped
                      ? "var(--left-panel-width)"
                      : "var(--right-panel-width)"
                    : 0,
            // When both panels open, no margins - content will scroll
          }}
        >
          {/* Background & Scroller */}
          <div
            ref={scrollerRef}
            className="flex-1 relative no-scrollbar transition-all duration-300 pb-10"
            style={{
              overflowX: shouldLockHorizontalScroll ? "hidden" : baseOverflowX,
              overflowY: shouldLockVerticalScroll ? "hidden" : "auto",
            }}
            onClick={() => {
              setSelectedId(null);
              setPreviewSelectedPath(null);
              setPreviewSelectedElement(null);
              setPreviewSelectedComputedStyles(null);
            }}
          >
            {/* Dynamic Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
              <div className="absolute inset-0 bg-[linear-gradient(var(--border-color)_1px,transparent_1px),linear-gradient(90deg,var(--border-color)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
              <div className="absolute top-[-18%] left-[18%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12)_0%,rgba(99,102,241,0.05)_38%,transparent_72%)] opacity-80"></div>
              <div className="absolute bottom-[-8%] right-[12%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.12)_0%,rgba(168,85,247,0.05)_36%,transparent_72%)] opacity-75"></div>
            </div>

            {/* Content wrapper — adds padding when both panels overlay so scroll reveals content behind panels */}
            <div
              className="min-h-full relative flex flex-col p-10 outline-none bg-grid-pattern"
              style={{
                perspective: "1000px",
                paddingLeft: `${BASE_STAGE_PADDING}px`,
                paddingRight: `${BASE_STAGE_PADDING}px`,
                width: "100%",
                paddingBottom: `${BASE_STAGE_PADDING}px`,
                minWidth: bothPanelsOpen
                  ? `calc(100% + var(--left-panel-width) + ${rightOverlayInset}px)`
                  : floatingHorizontalInset > 0
                    ? `calc(100% + ${floatingHorizontalInset}px)`
                    : "100%",
              }}
            >
              {/* Safe Spacing for Toolbar */}
              <div className="w-full shrink-0 h-4 pointer-events-none"></div>
              {/* --- Device Frame Container --- */}
              {/* --- Device Frame Wrapper (Layout Isolation) --- */}
              <div
                className="relative shrink-0 flex items-center justify-center transition-all duration-700 mx-auto mt-0"
                style={{
                  width:
                    deviceMode === "mobile"
                      ? "375px"
                      : deviceMode === "tablet"
                        ? `${tabletMetrics.frameWidth}px`
                        : desktopResolution === "resizable"
                          ? "80%"
                          : "921.6px",
                  height:
                    deviceMode === "mobile"
                      ? "812px"
                      : deviceMode === "tablet"
                        ? `${tabletMetrics.frameHeight}px`
                        : desktopResolution === "resizable"
                          ? "75vh"
                          : "518.4px",
                  transform:
                    deviceMode === "tablet"
                      ? `translateX(${clampedTabletShiftX}px) scale(${frameScale})`
                      : `translateX(${clampedCodeShiftX}px) scale(${frameScale})`,
                  transformOrigin: "top center",
                }}
              >
                {showDeviceFrameToolbar && (
                  <>
                    <div
                      className={`absolute left-5 bottom-full z-0 transition-all animate-slideDown ${isZenMode ? "opacity-65" : ""}`}
                      style={{ marginBottom: "-10px" }}
                    >
                      <div
                        className="px-3 pt-1 pb-3 flex items-center gap-2 min-w-0 rounded-t-[16px] rounded-b-none border"
                        style={{
                          background:
                            theme === "dark"
                              ? "rgba(12,18,30,0.96)"
                              : "rgba(248,250,252,0.96)",
                          borderColor:
                            theme === "dark"
                              ? "rgba(199,208,220,0.42)"
                              : "rgba(15,23,42,0.14)",
                          boxShadow:
                            theme === "dark"
                              ? "0 10px 24px rgba(2,6,23,0.34)"
                              : "0 10px 24px rgba(15,23,42,0.10)",
                          backdropFilter: "none",
                          borderBottomWidth: 0,
                        }}
                      >
                        {null}
                        <button
                          className={`glass-icon-btn navbar-icon-btn ${deviceMode === "tablet" ? "active" : ""}`}
                          onClick={() => {
                            setDeviceMode("tablet");
                            setTabletOrientation((prev) =>
                              prev === "landscape" ? "portrait" : "landscape",
                            );
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setDeviceMode("tablet");
                            setDeviceCtxMenu({
                              type: "tablet",
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          title={`iPad (${tabletOrientation === "landscape" ? "Landscape" : "Portrait"}) - click to rotate, right-click for model`}
                        >
                          <Tablet
                            size={16}
                            className="transition-transform duration-300 ease-out"
                            style={{
                              transform: `rotate(${tabletOrientation === "landscape" ? 90 : 0}deg)`,
                            }}
                          />
                        </button>
                        <button
                          className="glass-icon-btn navbar-icon-btn"
                          onClick={handlePreviewRefresh}
                          title="Refresh iPad content (Ctrl+T)"
                        >
                          <RotateCw size={16} />
                        </button>
                        {currentDevicePixelRatio >= 1.5 && (
                          <>
                            <div className="h-4 w-px bg-gray-500/20"></div>
                            <div className="flex items-center gap-0.5 rounded-full px-0.5 py-0.5 border border-gray-500/20">
                              {[50, 75, 100].map((zoom) => (
                                <button
                                  key={zoom}
                                  onClick={() =>
                                    setFrameZoom(zoom as 50 | 75 | 100)
                                  }
                                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all ${
                                    frameZoom === zoom
                                      ? theme === "light"
                                        ? "bg-cyan-500/20 text-cyan-700 border border-cyan-500/35"
                                        : "bg-indigo-500/25 text-indigo-300"
                                      : theme === "light"
                                        ? "text-slate-500"
                                        : "text-gray-300"
                                  }`}
                                  title={`Set frame zoom to ${zoom}%`}
                                >
                                  {zoom}%
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        <div className="h-4 w-px bg-gray-500/20"></div>
                        <button
                          className="glass-icon-btn navbar-icon-btn"
                          onClick={toggleThemeWithTransition}
                          title="Toggle Theme"
                        >
                          {theme === "dark" ? (
                            <Sun size={16} />
                          ) : (
                            <Moon size={16} />
                          )}
                        </button>
                        <div className="h-4 w-px bg-gray-500/20"></div>
                        <button
                          className="glass-icon-btn navbar-icon-btn"
                          onClick={runUndo}
                          title="Undo (Ctrl+Z)"
                        >
                          <Undo2 size={16} />
                        </button>
                        <button
                          className="glass-icon-btn navbar-icon-btn"
                          onClick={runRedo}
                          title="Redo (Ctrl+U)"
                        >
                          <Redo2 size={16} />
                        </button>
                        <div className="h-4 w-px bg-gray-500/20"></div>
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              dirtyFiles.length > 0 ? "#f59e0b" : "#22c55e",
                          }}
                          aria-hidden="true"
                        />
                        {interactionMode === "preview" && (
                          <div className="flex items-center gap-1 rounded-full px-1 py-1 border border-gray-500/20">
                            <button
                              onClick={() => setPreviewModeWithSync("edit")}
                              className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                                previewMode === "edit"
                                  ? theme === "light"
                                    ? "bg-amber-500/20 text-amber-700 border border-amber-500/35"
                                    : "bg-amber-500/25 text-amber-200 border border-amber-500/35"
                                  : theme === "light"
                                    ? "text-slate-500"
                                    : "text-gray-300"
                              }`}
                              title="LIVE Edit mode: select and edit elements"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setPreviewModeWithSync("preview")}
                              className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                                previewMode === "preview"
                                  ? theme === "light"
                                    ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/35"
                                    : "bg-emerald-500/25 text-emerald-200 border border-emerald-500/35"
                                  : theme === "light"
                                    ? "text-slate-500"
                                    : "text-gray-300"
                              }`}
                              title="LIVE Preview mode: navigate and interact"
                            >
                              Preview
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {deviceMode === "tablet" && (
                      <div
                        className={`absolute right-5 bottom-full z-0 transition-all animate-slideDown ${isZenMode ? "opacity-65" : ""}`}
                        style={{
                          marginBottom: "-20px",
                          transform: "translateY(3px)",
                        }}
                      >
                        <div
                          className="px-0.5 pt-1 pb-3 flex items-end gap-3"
                          style={{
                            background: "transparent",
                            border: "none",
                            boxShadow: "none",
                            backdropFilter: "none",
                          }}
                        >
                          <div
                            className="shrink-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                            style={{
                              maxWidth:
                                sidebarInteractionMode === "inspect"
                                  ? "18rem"
                                  : "0rem",
                              opacity:
                                sidebarInteractionMode === "inspect" ? 1 : 0,
                              transform:
                                sidebarInteractionMode === "inspect"
                                  ? "translateY(0) scale(1)"
                                  : "translateY(16px) scale(0.96)",
                              transformOrigin: "bottom right",
                            }}
                          >
                            <div
                              className="rounded-t-[10px] rounded-b-none border px-2 pt-1 pb-3"
                              style={{
                                borderColor:
                                  theme === "dark"
                                    ? "rgba(199,208,220,0.42)"
                                    : "rgba(15,23,42,0.14)",
                                background:
                                  theme === "dark"
                                    ? "rgba(12,18,30,0.96)"
                                    : "rgba(248,250,252,0.96)",
                                boxShadow:
                                  theme === "dark"
                                    ? "0 10px 24px rgba(2,6,23,0.34)"
                                    : "0 10px 24px rgba(15,23,42,0.10)",
                                backdropFilter: "none",
                                borderBottomWidth: 0,
                              }}
                            >
                              <div
                                className="flex items-center gap-1 rounded-full border px-1.5 py-[2px]"
                                style={{
                                  borderColor:
                                    theme === "dark"
                                      ? "rgba(148,163,184,0.28)"
                                      : "rgba(15,23,42,0.12)",
                                  background:
                                    theme === "dark"
                                      ? "rgba(15,23,42,0.55)"
                                      : "rgba(255,255,255,0.82)",
                                }}
                              >
                                {[
                                  { value: "default", label: "Default" },
                                  { value: "text", label: "Text" },
                                  { value: "image", label: "Assets" },
                                ].map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className="rounded-full px-2 py-[3px] text-[8px] font-semibold uppercase tracking-[0.12em] transition-all"
                                    style={{
                                      color:
                                        previewSelectionMode === option.value
                                          ? theme === "dark"
                                            ? "#ecfeff"
                                            : "#155e75"
                                          : theme === "dark"
                                            ? "#cbd5e1"
                                            : "#475569",
                                      background:
                                        previewSelectionMode === option.value
                                          ? theme === "dark"
                                            ? "rgba(34,211,238,0.2)"
                                            : "rgba(14,165,233,0.16)"
                                          : "transparent",
                                      border:
                                        previewSelectionMode === option.value
                                          ? "1px solid rgba(34,211,238,0.42)"
                                          : "1px solid transparent",
                                    }}
                                    onClick={() =>
                                      setPreviewSelectionMode(
                                        option.value as PreviewSelectionMode,
                                      )
                                    }
                                    title={option.label}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div
                            className="rounded-t-[10px] rounded-b-none border px-2 pt-1 pb-3"
                            style={{
                              borderColor:
                                theme === "dark"
                                  ? "rgba(199,208,220,0.42)"
                                  : "rgba(15,23,42,0.14)",
                              background:
                                theme === "dark"
                                  ? "rgba(12,18,30,0.96)"
                                  : "rgba(248,250,252,0.96)",
                              boxShadow:
                                theme === "dark"
                                  ? "0 10px 24px rgba(2,6,23,0.34)"
                                  : "0 10px 24px rgba(15,23,42,0.10)",
                              backdropFilter: "none",
                              borderBottomWidth: 0,
                            }}
                          >
                            <div
                              className="flex items-center gap-1 rounded-[10px] px-1 py-1 border"
                              style={{
                                borderColor:
                                  theme === "dark"
                                    ? "rgba(148,163,184,0.28)"
                                    : "rgba(15,23,42,0.12)",
                                background:
                                  theme === "dark"
                                    ? "rgba(15,23,42,0.55)"
                                    : "rgba(255,255,255,0.82)",
                              }}
                            >
                              <button
                                type="button"
                                className="glass-icon-btn navbar-icon-btn rounded-md"
                                onClick={() =>
                                  handleSidebarInteractionModeChange("inspect")
                                }
                                title="Select Element"
                                style={{
                                  borderRadius: "8px",
                                  color:
                                    sidebarInteractionMode === "inspect"
                                      ? theme === "dark"
                                        ? "#67e8f9"
                                        : "#0891b2"
                                      : undefined,
                                  background:
                                    sidebarInteractionMode === "inspect"
                                      ? theme === "dark"
                                        ? "rgba(34,211,238,0.18)"
                                        : "rgba(6,182,212,0.14)"
                                      : undefined,
                                }}
                              >
                                <MousePointer2 size={16} />
                              </button>
                              <button
                                type="button"
                                className="glass-icon-btn navbar-icon-btn rounded-md"
                                onClick={() =>
                                  handleSidebarInteractionModeChange("move")
                                }
                                title="Move Element"
                                style={{
                                  borderRadius: "8px",
                                  color:
                                    sidebarInteractionMode === "move"
                                      ? theme === "dark"
                                        ? "#fbbf24"
                                        : "#b45309"
                                      : undefined,
                                  background:
                                    sidebarInteractionMode === "move"
                                      ? theme === "dark"
                                        ? "rgba(245,158,11,0.2)"
                                        : "rgba(245,158,11,0.14)"
                                      : undefined,
                                }}
                              >
                                <Move size={16} />
                              </button>
                            </div>
                          </div>
                          {SHOW_SCREENSHOT_FEATURES && (
                            <button
                              className={`glass-icon-btn navbar-icon-btn rounded-md ${
                                screenshotCaptureBusy ? "opacity-60" : ""
                              }`}
                              onClick={() => openScreenshotGallery(true)}
                              disabled={screenshotCaptureBusy || !projectPath}
                              title={
                                projectPath
                                  ? "Capture iPad screenshot"
                                  : "Open a presentation first"
                              }
                              style={{ borderRadius: "8px" }}
                            >
                              <Camera size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {/* Actual Device Frame */}
                <div
                  className={`
                              relative z-10 shrink-0 transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                              ${
                                deviceMode === "desktop"
                                  ? "rounded-xl border-4"
                                  : deviceMode === "tablet"
                                    ? "w-full h-full rounded-[42px] border-[10px]"
                                    : "w-full h-full rounded-[50px] border-[12px]"
                              }
                          `}
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    borderColor:
                      deviceMode === "desktop"
                        ? "#1e293b"
                        : deviceMode === "tablet"
                          ? theme === "dark"
                            ? "#c7d0dc"
                            : "#0f172a"
                          : "#000000",
                    background:
                      deviceMode === "tablet" && theme === "dark"
                        ? [
                            "linear-gradient(145deg, #eef3fa 0%, #cfd8e5 16%, #9aa7b8 34%, #748396 50%, #9fadbe 68%, #dce4ee 84%, #f3f7fb 100%)",
                            "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.06) 24%, rgba(0,0,0,0.12) 100%)",
                            "radial-gradient(130% 70% at 50% -5%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.0) 62%)",
                          ].join(", ")
                        : "#000000",
                    boxShadow:
                      deviceMode === "tablet" && theme === "dark"
                        ? "0 28px 62px -16px rgba(0,0,0,0.62), 0 0 0 1px rgba(203,213,225,0.22), 0 0 28px rgba(148,163,184,0.2), inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -1px 0 rgba(255,255,255,0.22), inset 1px 0 0 rgba(255,255,255,0.2), inset -1px 0 0 rgba(0,0,0,0.26)"
                        : "0 20px 50px -10px rgba(0,0,0,0.5)",
                    // No transform on the frame itself - it stays fixed visual size
                  }}
                >
                  {deviceMode === "tablet" && theme === "dark" && (
                    <>
                      <div
                        className="pointer-events-none absolute inset-[2px] rounded-[34px]"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.13) 18%, rgba(255,255,255,0.03) 36%, rgba(0,0,0,0.06) 100%)",
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[1px] rounded-[36px]"
                        style={{
                          background: [
                            "linear-gradient(120deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.0) 28%, rgba(255,255,255,0.0) 72%, rgba(255,255,255,0.22) 100%)",
                            "repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 3px)",
                          ].join(", "),
                          opacity: 0.3,
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[0px] rounded-[36px]"
                        style={{
                          opacity: darkTabletReflectionOpacity,
                          mixBlendMode: "screen",
                          background: [
                            "radial-gradient(60% 26% at 50% -4%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.0) 78%)",
                            "radial-gradient(40% 34% at 6% 18%, rgba(147,197,253,0.42) 0%, rgba(147,197,253,0.0) 72%)",
                            "radial-gradient(40% 34% at 94% 18%, rgba(167,243,208,0.4) 0%, rgba(167,243,208,0.0) 72%)",
                          ].join(", "),
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[0px] rounded-[36px]"
                        style={{
                          opacity: Math.min(
                            0.56,
                            darkTabletReflectionOpacity * 0.9,
                          ),
                          background:
                            "linear-gradient(112deg, rgba(255,255,255,0.0) 18%, rgba(255,255,255,0.42) 31%, rgba(255,255,255,0.0) 46%, rgba(255,255,255,0.0) 60%, rgba(255,255,255,0.28) 71%, rgba(255,255,255,0.0) 85%)",
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-[3px] rounded-[33px]"
                        style={{
                          boxShadow:
                            "inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 0 26px rgba(255,255,255,0.08)",
                        }}
                      />
                    </>
                  )}
                  {/* Morphing Header (Window Bar <-> Notch) */}
                  <div
                    className={`
                            absolute top-0 left-1/2 -translate-x-1/2 z-20 ${deviceMode === "desktop" ? "bg-[#1e293b]" : deviceMode === "tablet" ? (theme === "dark" ? "bg-[#5f6f82]" : "bg-[#0f172a]") : "bg-black"}
                            transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)] flex items-center justify-center overflow-hidden
                            ${
                              deviceMode === "desktop"
                                ? "w-full h-9 rounded-t-lg rounded-b-none px-4"
                                : deviceMode === "tablet"
                                  ? "w-[120px] h-[9px] rounded-full top-[12px] px-0"
                                  : mobileFrameStyle === "dynamic-island"
                                    ? "w-[120px] h-[35px] rounded-full top-[11px] px-0"
                                    : mobileFrameStyle === "notch"
                                      ? "w-[160px] h-[30px] rounded-b-[20px] rounded-t-none px-0"
                                      : "w-[10px] h-[10px] rounded-full top-[12px] left-1/2 -translate-x-1/2"
                            }
                        `}
                  >
                    {/* Desktop Elements: Traffic Lights & URL */}
                    <div
                      className={`absolute left-4 flex gap-1.5 transition-opacity duration-500 ${deviceMode === "desktop" ? "opacity-100 delay-200" : "opacity-0"}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"></div>
                    </div>

                    <div
                      className={`transition-opacity duration-300 ${deviceMode === "desktop" ? "opacity-100 delay-200" : "opacity-0"}`}
                    >
                      <div className="bg-black/30 h-5 w-64 rounded-md flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono">
                        <Globe size={10} />
                        <span>nocode-x-preview.app</span>
                      </div>
                    </div>

                    {/* Mobile Elements: Notch Speaker/Cam */}
                    {mobileFrameStyle === "dynamic-island" && (
                      <div
                        className={`absolute top-2 w-12 h-1 bg-[#1a1a1a] rounded-full transition-opacity duration-300 ${deviceMode === "mobile" ? "opacity-100 delay-300" : "opacity-0"}`}
                      ></div>
                    )}
                  </div>

                  {/* Mobile Status Bar Indicators (Fade In) */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-[30px] z-30 pointer-events-none transition-opacity duration-500 ${deviceMode === "mobile" ? "opacity-100 delay-200" : "opacity-0"}`}
                  >
                    <div className="absolute top-4 left-7 text-[10px] text-white font-medium tracking-wide">
                      9:41
                    </div>
                    <div className="absolute top-4 right-7 flex gap-1.5 text-white">
                      <Wifi size={12} />
                      <div className="w-4 h-2.5 border border-white/30 rounded-[2px] relative">
                        <div className="absolute left-[1px] top-[1px] bottom-[1px] right-1 bg-white rounded-[1px]"></div>
                      </div>
                    </div>
                  </div>

                  {/* Screen Content Wrapper */}
                  <div
                    className={`w-full h-full bg-white overflow-hidden relative transition-all duration-700 ${deviceMode === "desktop" ? "rounded-lg pt-9" : deviceMode === "tablet" ? "rounded-[32px]" : "rounded-[38px]"}`}
                  >
                    {/* Inner Content Scaler - Handles High Res Scaling independent of Frame */}
                    <div
                      className="origin-top-left transition-transform duration-500"
                      style={{
                        width:
                          deviceMode === "mobile"
                            ? "100%"
                            : deviceMode === "tablet"
                              ? `${tabletMetrics.contentWidth}px`
                              : desktopResolution === "resizable"
                                ? "100%"
                                : desktopResolution === "4k"
                                  ? "3840px"
                                  : desktopResolution === "2k"
                                    ? "2560px"
                                    : desktopResolution === "1.5k"
                                      ? "1600px"
                                      : "1920px",
                        height:
                          deviceMode === "mobile"
                            ? "100%"
                            : deviceMode === "tablet"
                              ? `${tabletMetrics.contentHeight}px`
                              : desktopResolution === "resizable"
                                ? "100%"
                                : desktopResolution === "4k"
                                  ? "2160px"
                                  : desktopResolution === "2k"
                                    ? "1440px"
                                    : desktopResolution === "1.5k"
                                      ? "900px"
                                      : "1080px",
                        transform:
                          deviceMode === "tablet"
                            ? `translateX(-50%) scale(${tabletViewportScale})`
                            : `scale(${
                                deviceMode === "mobile"
                                  ? 1
                                  : desktopResolution === "resizable"
                                    ? 1
                                    : desktopResolution === "4k"
                                      ? 0.24
                                      : desktopResolution === "2k"
                                        ? 0.36
                                        : desktopResolution === "1.5k"
                                          ? 0.576
                                          : 0.48
                              })`,
                        transformOrigin:
                          deviceMode === "tablet" ? "top center" : "top left",
                        position:
                          deviceMode === "tablet" ? "absolute" : "relative",
                        left: deviceMode === "tablet" ? "50%" : undefined,
                        top: deviceMode === "tablet" ? 0 : undefined,
                      }}
                    >
                      <div
                        ref={previewStageRef}
                        className="w-full h-full relative"
                        onDragOver={handlePreviewStageDragOver}
                        onDrop={handlePreviewStageDrop}
                      >
                        {shouldShowFrameWelcome && (
                          <div className="absolute inset-0 flex items-center justify-center p-12">
                            <div
                              className="w-full max-w-6xl rounded-[42px] border px-24 py-24 text-center shadow-[0_42px_140px_rgba(15,23,42,0.16)]"
                              style={{
                                background:
                                  "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.92) 100%)",
                                borderColor: "rgba(15,23,42,0.12)",
                                color: "#0f172a",
                                backdropFilter: "none",
                              }}
                            >
                              <div
                                className="text-[44px] font-semibold uppercase tracking-[0.34em]"
                                style={{ color: "#64748b" }}
                              >
                                Welcome To NoCode X
                              </div>
                              <p
                                className="mt-8 text-[30px] leading-[1.45] max-w-4xl mx-auto"
                                style={{ color: "#64748b" }}
                              >
                                Open a previous presentation or choose a new
                                project folder directly from the frame.
                              </p>
                              <div className="mt-12 flex items-center justify-center gap-4">
                                <button
                                  type="button"
                                  className="rounded-[22px] px-10 py-5 text-[22px] font-semibold transition-colors"
                                  style={{
                                    background: "rgba(14,165,233,0.14)",
                                    border: "1px solid rgba(14,165,233,0.25)",
                                    color: "#0f172a",
                                  }}
                                  onClick={() => {
                                    void handleOpenFolder();
                                  }}
                                >
                                  Select Presentation
                                </button>
                              </div>
                              {recentProjects.length > 0 && (
                                <div className="mt-12 text-left">
                                  <div
                                    className="text-[18px] font-semibold uppercase tracking-[0.24em] text-center"
                                    style={{ color: "#64748b" }}
                                  >
                                    Recent Presentations
                                  </div>
                                  <div className="mt-6 grid grid-cols-1 gap-4">
                                    {recentProjects.map((recentPath) => {
                                      const recentName = recentPath
                                        .replace(/\\/g, "/")
                                        .split("/")
                                        .filter(Boolean)
                                        .slice(-1)[0];
                                      return (
                                        <button
                                          key={recentPath}
                                          type="button"
                                          className="w-full rounded-[22px] border px-6 py-5 text-left transition-colors"
                                          style={{
                                            borderColor: "rgba(15,23,42,0.12)",
                                            background: "rgba(255,255,255,0.68)",
                                            color: "#0f172a",
                                          }}
                                          onClick={() => {
                                            void handleOpenFolder(recentPath);
                                          }}
                                          title={recentPath}
                                        >
                                          <div className="text-[24px] font-semibold">
                                            {recentName}
                                          </div>
                                          <div
                                            className="mt-2 truncate text-[15px]"
                                            style={{
                                              color: "#64748b",
                                            }}
                                          >
                                            {recentPath}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {projectPath ? (
                                <div
                                  className="mt-8 text-[18px]"
                                  style={{ color: "#64748b" }}
                                >
                                  Current project:{" "}
                                  {
                                    projectPath
                                      .replace(/\\/g, "/")
                                      .split("/")
                                      .filter(Boolean)
                                      .slice(-1)[0]
                                  }
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                        {hasPreviewContent && (
                          <iframe
                            key={
                              selectedPreviewSrc
                                ? `preview-src:${selectedPreviewSrc}:${previewRefreshNonce}`
                                : `preview-doc:${selectedPreviewHtml || "none"}:${previewRefreshNonce}`
                            }
                            ref={previewFrameRef}
                            title="project-preview"
                            src={selectedPreviewSrc || undefined}
                            srcDoc={
                              selectedPreviewSrc
                                ? undefined
                                : selectedPreviewDoc
                            }
                            loading="eager"
                            onLoad={handlePreviewFrameLoad}
                            onDragOver={handlePreviewStageDragOver}
                            onDrop={handlePreviewStageDrop}
                            className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-150 ${
                              interactionMode === "preview"
                                ? isToolboxDragging
                                  ? "opacity-100 pointer-events-none"
                                  : "opacity-100 pointer-events-auto"
                                : "opacity-0 pointer-events-none"
                            }`}
                          />
                        )}
                        {interactionMode === "preview" &&
                          isPdfAnnotationPanelOpen &&
                          filteredAnnotationsForCurrentSlide.map(
                            (annotation) => {
                              const isFocused =
                                focusedAnnotationForCurrentSlide?.annotationId ===
                                annotation.annotationId;
                              const isPopup = isPopupAnnotation(annotation);
                              return (
                                <div
                                  key={annotation.annotationId}
                                  className={`absolute pointer-events-none rounded-[18px] border-2 ${
                                    isFocused ? "z-30" : "z-20"
                                  }`}
                                  style={{
                                    left: `${annotation.positionPct.left}%`,
                                    top: `${annotation.positionPct.top}%`,
                                    width: `${Math.max(2, annotation.positionPct.width)}%`,
                                    height: `${Math.max(2, annotation.positionPct.height)}%`,
                                    borderColor: isFocused
                                      ? "rgba(239,68,68,0.98)"
                                      : isPopup
                                        ? "rgba(34,211,238,0.85)"
                                        : "rgba(34,197,94,0.9)",
                                    boxShadow: isFocused
                                      ? "0 0 0 5px rgba(239,68,68,0.35), 0 0 28px rgba(239,68,68,0.45), inset 0 0 0 1px rgba(255,255,255,0.82)"
                                      : isPopup
                                        ? "0 0 0 3px rgba(34,211,238,0.18), 0 0 22px rgba(34,211,238,0.32), inset 0 0 0 1px rgba(255,255,255,0.65)"
                                        : "0 0 0 3px rgba(34,197,94,0.2), 0 0 22px rgba(34,197,94,0.34), inset 0 0 0 1px rgba(255,255,255,0.65)",
                                    background: isFocused
                                      ? "rgba(239,68,68,0.08)"
                                      : isPopup
                                        ? "rgba(34,211,238,0.06)"
                                        : "rgba(34,197,94,0.06)",
                                    animation: isFocused
                                      ? "pulse 1.1s ease-in-out 2"
                                      : "none",
                                  }}
                                />
                              );
                            },
                          )}
                        {!shouldShowFrameWelcome && (
                          <div
                            className={`w-full h-full transition-opacity duration-200 ${
                              interactionMode === "preview"
                                ? "opacity-0 pointer-events-none"
                                : "opacity-100 pointer-events-auto"
                            }`}
                          >
                            <EditorContent
                              root={root}
                              selectedId={selectedId}
                              selectedPathIds={selectedPathIds}
                              handleSelect={handleSelect}
                              handleMoveElement={handleMoveElement}
                              handleMoveElementByPosition={
                                handleMoveElementByPosition
                              }
                              handleResize={handleResize}
                              interactionMode={interactionMode}
                              INJECTED_STYLES={INJECTED_STYLES}
                            />
                          </div>
                        )}
                        {false}
                        {interactionMode === "preview" &&
                          previewMode === "edit" &&
                          Array.isArray(previewSelectedPath) &&
                          previewSelectedPath.length > 0 &&
                          previewSelectionBox && (
                            <div
                              className="absolute z-30 pointer-events-none"
                              style={{
                                left: `${previewSelectionBox.left}px`,
                                top: `${previewSelectionBox.top}px`,
                                width: `${previewSelectionBox.width}px`,
                                height: `${previewSelectionBox.height}px`,
                                border: "2px solid rgba(34,211,238,0.95)",
                                boxShadow:
                                  "0 0 0 1px rgba(6,182,212,0.85), 0 0 0 6px rgba(34,211,238,0.12)",
                                borderRadius: "4px",
                              }}
                            >
                              {[
                                [
                                  "n",
                                  "Resize from top",
                                  "ns-resize",
                                  "absolute left-3 right-3 top-[-6px] h-4",
                                  "999px",
                                ],
                                [
                                  "s",
                                  "Resize from bottom",
                                  "ns-resize",
                                  "absolute left-3 right-3 bottom-[-6px] h-4",
                                  "999px",
                                ],
                                [
                                  "e",
                                  "Resize from right",
                                  "ew-resize",
                                  "absolute top-3 bottom-3 right-[-6px] w-4",
                                  "999px",
                                ],
                                [
                                  "w",
                                  "Resize from left",
                                  "ew-resize",
                                  "absolute top-3 bottom-3 left-[-6px] w-4",
                                  "999px",
                                ],
                                [
                                  "nw",
                                  "Resize from top left",
                                  "nwse-resize",
                                  "absolute left-[-7px] top-[-7px] w-5 h-5",
                                  "6px",
                                ],
                                [
                                  "ne",
                                  "Resize from top right",
                                  "nesw-resize",
                                  "absolute right-[-7px] top-[-7px] w-5 h-5",
                                  "6px",
                                ],
                                [
                                  "sw",
                                  "Resize from bottom left",
                                  "nesw-resize",
                                  "absolute left-[-7px] bottom-[-7px] w-5 h-5",
                                  "6px",
                                ],
                                [
                                  "se",
                                  "Resize from bottom right",
                                  "nwse-resize",
                                  "absolute right-[-7px] bottom-[-7px] w-5 h-5",
                                  "6px",
                                ],
                              ].map(
                                ([key, title, cursor, className, radius]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    className={`pointer-events-auto absolute ${className}`}
                                    style={{ cursor }}
                                    title={title}
                                    onMouseDown={(event) =>
                                      handlePreviewResizeHandleMouseDown(
                                        key as
                                          | "n"
                                          | "s"
                                          | "e"
                                          | "w"
                                          | "ne"
                                          | "nw"
                                          | "se"
                                          | "sw",
                                        event,
                                      )
                                    }
                                  >
                                    <span
                                      className="absolute inset-0"
                                      style={{
                                        borderRadius: radius,
                                        background: "rgba(34, 211, 238, 0.82)",
                                        border:
                                          "1px solid rgba(255,255,255,0.95)",
                                        boxShadow:
                                          "0 0 0 1px rgba(8,145,178,0.42), 0 4px 12px rgba(34,211,238,0.35)",
                                      }}
                                    />
                                  </button>
                                ),
                              )}
                              {false && (
                                <button
                                  type="button"
                                  className="pointer-events-auto absolute right-1 bottom-1 w-7 h-7 rounded-md border-2 border-white/90 bg-amber-500 shadow-[0_0_0_2px_rgba(2,6,23,0.7),0_8px_20px_rgba(245,158,11,0.45)] text-slate-950 font-black text-xs leading-none flex items-center justify-center"
                                  style={{
                                    cursor: isPreviewResizing
                                      ? "nwse-resize"
                                      : "nwse-resize",
                                  }}
                                  title="Resize from bottom right"
                                  onMouseDown={(event) =>
                                    handlePreviewResizeHandleMouseDown(
                                      "se",
                                      event,
                                    )
                                  }
                                >
                                  <>{"↘"}</>
                                </button>
                              )}
                            </div>
                          )}
                        {false &&
                          interactionMode === "preview" &&
                          previewMode === "edit" &&
                          Array.isArray(previewSelectedPath) &&
                          (previewSelectedPath?.length ?? 0) > 0 &&
                          previewSelectedElement && (
                            <div
                              className="absolute right-4 top-4 z-40 rounded-2xl border shadow-2xl p-3 flex flex-col gap-2 min-w-[230px]"
                              style={{
                                borderColor:
                                  theme === "dark"
                                    ? "rgba(148,163,184,0.35)"
                                    : "rgba(15,23,42,0.18)",
                                background:
                                  theme === "dark"
                                    ? "rgba(2,6,23,0.86)"
                                    : "rgba(255,255,255,0.96)",
                                color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <div className="text-xs font-bold tracking-wide opacity-90">
                                Quick Controls
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-cyan-500/35 hover:bg-cyan-500/20 flex items-center gap-1"
                                  title="Duplicate"
                                  onClick={() => {
                                    void handlePreviewDuplicateSelected();
                                  }}
                                >
                                  <Copy size={12} />
                                  Dup
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-slate-500/35 hover:bg-slate-500/20"
                                  title="Send backward"
                                  onClick={() => handlePreviewNudgeZIndex(-1)}
                                >
                                  <MoveDown size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-slate-500/35 hover:bg-slate-500/20"
                                  title="Bring forward"
                                  onClick={() => handlePreviewNudgeZIndex(1)}
                                >
                                  <MoveUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-red-500/40 hover:bg-red-500/20 flex items-center gap-1"
                                  title="Delete"
                                  onClick={handlePreviewDeleteStable}
                                >
                                  <Trash2 size={12} />
                                  Del
                                </button>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-emerald-500/35 hover:bg-emerald-500/20 flex items-center gap-1"
                                  title="Narrower"
                                  onClick={() =>
                                    handlePreviewResizeNudge("width", -12)
                                  }
                                >
                                  <Shrink size={12} />
                                  W-
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-emerald-500/35 hover:bg-emerald-500/20 flex items-center gap-1"
                                  title="Wider"
                                  onClick={() =>
                                    handlePreviewResizeNudge("width", 12)
                                  }
                                >
                                  <Expand size={12} />
                                  W+
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-violet-500/35 hover:bg-violet-500/20"
                                  title="Shorter"
                                  onClick={() =>
                                    handlePreviewResizeNudge("height", -12)
                                  }
                                >
                                  H-
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 h-8 rounded-md text-xs border border-violet-500/35 hover:bg-violet-500/20"
                                  title="Taller"
                                  onClick={() =>
                                    handlePreviewResizeNudge("height", 12)
                                  }
                                >
                                  H+
                                </button>
                              </div>
                              <div className="text-[11px] opacity-80">
                                {`${Math.round(
                                  parseNumericCssValue(
                                    previewSelectedElement?.styles?.width ??
                                      previewSelectedComputedStyles?.width ??
                                      0,
                                  ) || 0,
                                )} x ${Math.round(
                                  parseNumericCssValue(
                                    previewSelectedElement?.styles?.height ??
                                      previewSelectedComputedStyles?.height ??
                                      0,
                                  ) || 0,
                                )} px`}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* iPhone Home Indicator */}
                  <div
                    className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[4px] bg-white/20 rounded-full z-30 pointer-events-none transition-opacity duration-500 ${deviceMode === "mobile" ? "opacity-100 delay-200" : "opacity-0"}`}
                  ></div>
                </div>
              </div>{" "}
              {/* End of Device Frame Visual Wrapper */}
            </div>
            {/* end content wrapper */}
          </div>
          {/* end scroller */}
        </div>
        {/* end stage */}

        {isRightInspectorMode && (
          <div
            className={`absolute z-40 no-scrollbar ${isResizingRightPanel ? "" : "transition-all duration-700"} right-0 top-0 bottom-0 ${isZenMode || isCodePanelOpen || !isRightPanelOpen ? "pointer-events-none" : ""}`}
            style={{
              width: "var(--right-panel-width)",
              overflow: "hidden",
              transform: isRightPanelOpen
                ? "translateX(0) scale(1)"
                : "translateX(calc(100% + 0.75rem)) scale(0.985)",
              opacity: isRightPanelOpen ? 1 : 0,
              transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
              transformOrigin: "right center",
            }}
          >
            <div
              className="h-full min-h-full relative flex flex-col overflow-hidden"
              style={{
                background:
                  theme === "dark"
                    ? "linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.95) 100%)"
                    : "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(248,250,252,0.76) 100%)",
                backdropFilter: "none",
                borderTopLeftRadius: "28px",
                borderBottomLeftRadius: "28px",
              }}
            >
              <div
                className="shrink-0 border-b px-3 py-2"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(148,163,184,0.22)"
                      : "rgba(15,23,42,0.08)",
                  background:
                    theme === "dark"
                      ? "rgba(15,23,42,0.42)"
                      : "rgba(255,255,255,0.78)",
                }}
              >
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 min-w-[44px] rounded-xl border px-2 flex items-center justify-center transition-colors text-[11px] font-semibold tracking-[0.14em]"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(148,163,184,0.28)"
                          : "rgba(15,23,42,0.12)",
                      color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                      background: showStyleInspectorSection
                        ? theme === "dark"
                          ? "rgba(99,102,241,0.2)"
                          : "rgba(99,102,241,0.14)"
                        : "transparent",
                    }}
                    onClick={() =>
                      setIsStyleInspectorSectionOpen((current) => !current)
                    }
                    title={
                      showStyleInspectorSection
                        ? "Hide styles section"
                        : "Show styles section"
                    }
                  >
                    CSS
                  </button>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-xl border flex items-center justify-center transition-colors"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(148,163,184,0.28)"
                          : "rgba(15,23,42,0.12)",
                      color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                      background: showEmbeddedPdfAnnotations
                        ? theme === "dark"
                          ? "rgba(34,211,238,0.18)"
                          : "rgba(14,165,233,0.14)"
                        : "transparent",
                    }}
                    onClick={() => {
                      if (hasPdfAnnotationsLoaded) {
                        dispatch(setIsOpen(!isPdfAnnotationPanelOpen));
                        return;
                      }
                      handleOpenPdfAnnotationsPicker();
                    }}
                    disabled={!projectPath || isPdfAnnotationLoading}
                    title={
                      projectPath
                        ? hasPdfAnnotationsLoaded
                          ? isPdfAnnotationPanelOpen
                            ? "Hide PDF annotations"
                            : "Show PDF annotations"
                          : "Load annotated PDF"
                        : "Open a presentation first"
                    }
                  >
                    {isPdfAnnotationLoading ? (
                      <RotateCw size={15} className="animate-spin" />
                    ) : (
                      <FileText size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-xl border flex items-center justify-center transition-colors"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(148,163,184,0.28)"
                          : "rgba(15,23,42,0.12)",
                      color: theme === "dark" ? "#e2e8f0" : "#0f172a",
                    }}
                    onClick={handleRefreshPdfAnnotationMapping}
                    disabled={!projectPath || isPdfAnnotationLoading}
                    title="Upload annotated PDF"
                  >
                    <Upload size={15} />
                  </button>
                </div>
              </div>

              {showEmbeddedPdfAnnotations ? (
                <>
                  <div
                    className="min-h-0 overflow-hidden"
                    style={{
                      flex: showStyleInspectorSection ? "0 0 48%" : "1 1 auto",
                      background:
                        theme === "dark"
                          ? "rgba(2,6,23,0.18)"
                          : "rgba(248,250,252,0.62)",
                    }}
                  >
                    <PdfAnnotationsOverlay
                      currentPreviewSlideId={currentPreviewSlideId ?? null}
                      theme={theme as "light" | "dark"}
                      onJumpToAnnotation={handleJumpToPdfAnnotation}
                      embedded
                    />
                  </div>
                  {showStyleInspectorSection ? (
                    <div
                      className="shrink-0 h-[8px]"
                      style={{
                        background:
                          theme === "dark"
                            ? "linear-gradient(90deg, rgba(34,211,238,0.1) 0%, rgba(56,189,248,0.42) 22%, rgba(14,165,233,0.2) 50%, rgba(34,211,238,0.42) 78%, rgba(34,211,238,0.1) 100%)"
                            : "linear-gradient(90deg, rgba(125,211,252,0.18) 0%, rgba(14,165,233,0.55) 22%, rgba(6,182,212,0.22) 50%, rgba(14,165,233,0.55) 78%, rgba(125,211,252,0.18) 100%)",
                        boxShadow:
                          theme === "dark"
                            ? "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(255,255,255,0.03)"
                            : "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(14,165,233,0.08)",
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              {showStyleInspectorSection ? (
                <div
                  className="min-h-0 flex-1 overflow-hidden px-2 pt-2 pb-2"
                  style={{
                    borderTop: showEmbeddedPdfAnnotations
                      ? "none"
                      : theme === "dark"
                        ? "1px solid rgba(148,163,184,0.12)"
                        : "1px solid rgba(15,23,42,0.05)",
                    background:
                      theme === "dark"
                        ? "rgba(2,6,23,0.3)"
                        : "rgba(255,255,255,0.72)",
                  }}
                >
                  <div
                    className="h-full overflow-hidden rounded-[20px]"
                    style={{
                      background:
                        theme === "dark"
                          ? "rgba(15,23,42,0.3)"
                          : "rgba(255,255,255,0.8)",
                    }}
                  >
                    <StyleInspectorPanel
                      element={inspectorElement}
                      availableFonts={availableFonts}
                      onImmediateChange={handleImmediatePreviewStyle} // <--- ADD THIS
                      onUpdateContent={
                        previewSelectedElement
                          ? handlePreviewContentUpdateStable
                          : handleUpdateContent
                      }
                      onToggleTextTag={
                        previewSelectedElement
                          ? (tag) => {
                              void applyPreviewTagUpdate(
                                previewSelectedElement.type === tag
                                  ? "span"
                                  : tag,
                              );
                            }
                          : undefined
                      }
                      onWrapTextTag={
                        previewSelectedElement
                          ? (tag) => {
                              void applyQuickTextWrapTag(tag);
                            }
                          : undefined
                      }
                      selectionMode={
                        previewSelectedElement ? previewSelectionMode : "default"
                      }
                      resolveAssetPreviewUrl={resolveInspectorAssetPreviewUrl}
                      onUpdateStyle={
                        previewSelectedElement
                          ? handlePreviewStyleUpdateStable
                          : handleUpdateStyle
                      }
                      onUpdateIdentity={
                        previewSelectedElement
                          ? handlePreviewIdentityUpdateStable
                          : handleUpdateIdentity
                      }
                      onReplaceAsset={
                        previewSelectedElement
                          ? () => {
                              void handleReplacePreviewAsset();
                            }
                          : undefined
                      }
                      onAddMatchedRuleProperty={
                        previewSelectedElement
                          ? handlePreviewMatchedRulePropertyAdd
                          : undefined
                      }
                      matchedCssRules={
                        previewSelectedElement ? previewSelectedMatchedCssRules : []
                      }
                      computedStyles={
                        previewSelectedElement ? previewSelectedComputedStyles : null
                      }
                    />
                  </div>
                </div>
              ) : !showEmbeddedPdfAnnotations ? (
                <div
                  className="min-h-0 flex-1 flex items-center justify-center px-6 text-center"
                  style={{
                    color: theme === "dark" ? "#94a3b8" : "#64748b",
                  }}
                >
                  <div className="text-[12px] tracking-[0.16em] uppercase">
                    Enable CSS or PDF to inspect this slide
                  </div>
                </div>
              ) : null}

              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow:
                    theme === "dark"
                      ? "inset 0 0 0 1px rgba(148,163,184,0.2)"
                      : "inset 0 0 0 1px rgba(255,255,255,0.45)",
                }}
              />
              {isRightInspectorAttached ? (
                <button
                  type="button"
                  onClick={() => setIsRightPanelOpen(false)}
                  className="absolute top-3 left-3 z-20 h-8 px-2 rounded-full border flex items-center justify-center gap-1.5 transition-all duration-300 text-[10px] font-semibold uppercase tracking-[0.14em] hover:-translate-y-0.5"
                  style={{
                    borderColor:
                      theme === "dark"
                        ? "rgba(148,163,184,0.28)"
                        : "rgba(15,23,42,0.12)",
                    color: theme === "dark" ? "#a5f3fc" : "#0e7490",
                    background:
                      theme === "dark"
                        ? "rgba(15,23,42,0.88)"
                        : "rgba(255,255,255,0.92)",
                    boxShadow:
                      theme === "dark"
                        ? "0 8px 18px rgba(2,6,23,0.24)"
                        : "0 8px 18px rgba(15,23,42,0.08)",
                  }}
                  title="Collapse right panel"
                >
                  <PanelRightClose size={14} />
                  <span>Hide</span>
                </button>
              ) : null}
            </div>
            <div
              onMouseDown={handleRightPanelResizeStart}
              className="absolute top-0 left-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors"
              title="Resize panel"
            />
          </div>
        )}

        {rightPanelMode === "gallery" && SHOW_SCREENSHOT_FEATURES && (
          <ScreenshotGalleryPanel
            isFloatingPanels={isFloatingPanels}
            isPanelsSwapped={isPanelsSwapped}
            isResizingRightPanel={isResizingRightPanel}
            isDraggingRightPanel={isDraggingRightPanel}
            isZenMode={isZenMode}
            isCodePanelOpen={isCodePanelOpen}
            isRightPanelOpen={isRightPanelOpen}
            rightPanelFloatingPosition={rightPanelFloatingPosition}
            theme={theme}
            rightPanelMode={rightPanelMode}
            screenshotCaptureBusy={screenshotCaptureBusy}
            screenshotItems={screenshotItems}
            screenshotPreviewUrls={screenshotPreviewUrls}
            isPdfExporting={isPdfExporting}
            pdfExportLogs={pdfExportLogs}
            projectPath={projectPath}
            onRightPanelDragStart={handleRightPanelDragStart}
            onCloseGallery={closeScreenshotGallery}
            onCollapsePanel={() => {
              setIsRightPanelOpen(false);
              setRightPanelMode("inspector");
            }}
            onRefreshGallery={() => void loadGalleryItems()}
            onCaptureScreenshot={() => void handleScreenshotCapture()}
            onRevealScreenshotsFolder={() => void handleRevealScreenshotsFolder()}
            onOpenScreenshotItem={(item) => void handleOpenScreenshotItem(item)}
            onDeleteScreenshotItem={(item) =>
              void handleDeleteScreenshotItem(item)
            }
            onExportEditablePdf={() => void handleExportEditablePdf()}
          />
        )}
      </div>

      <AppOverlays
        theme={theme}
        isFloatingPanels={isFloatingPanels}
        isZenMode={isZenMode}
        isCodePanelOpen={isCodePanelOpen}
        setIsCodePanelOpen={setIsCodePanelOpen}
        isRightPanelOpen={isRightPanelOpen}
        setIsRightPanelOpen={setIsRightPanelOpen}
        rightPanelMode={rightPanelMode}
        setRightPanelMode={setRightPanelMode}
        isCompactConsoleOpening={isCompactConsoleOpening}
        previewConsoleErrorCount={previewConsoleErrorCount}
        handleOpenDetachedConsole={handleOpenDetachedConsole}
        isConfigModalOpen={isConfigModalOpen}
        setIsConfigModalOpen={setIsConfigModalOpen}
        configModalInitialTab={configModalInitialTab}
        isConfigModalSlidesOnly={isConfigModalSlidesOnly}
        files={files}
        configPathForModal={configPathForModal}
        portfolioPathForModal={portfolioPathForModal}
        handleSaveConfig={handleSaveConfig}
        autoSaveEnabled={autoSaveEnabled}
        setAutoSaveEnabled={setAutoSaveEnabled}
        panelSide={panelSide}
        setPanelSide={setPanelSide}
        projectPath={projectPath}
        selectedFolderCloneSource={selectedFolderCloneSource}
        setSelectedFolderCloneSource={setSelectedFolderCloneSource}
        isDetachedEditorOpen={isDetachedEditorOpen}
        closeCodePanel={closeCodePanel}
        activeDetachedEditorFilePath={activeDetachedEditorFilePath}
        activeDetachedEditorContent={activeDetachedEditorContent}
        activeDetachedEditorIsDirty={activeDetachedEditorIsDirty}
        handleDetachedEditorSelectFile={handleDetachedEditorSelectFile}
        handleDetachedEditorChange={handleDetachedEditorChange}
        detachedEditorIsTextEditable={detachedEditorIsTextEditable}
        saveCodeDraftAtPath={saveCodeDraftAtPath}
        loadFileContent={loadFileContent}
        setCodeDraftByPath={setCodeDraftByPath}
        setCodeDirtyPathSet={setCodeDirtyPathSet}
        isPdfExporting={isPdfExporting}
        pdfExportLogs={pdfExportLogs}
        clearPdfExportLogs={clearPdfExportLogs}
        activeCodeContent={activeCodeContent}
        handleCodeDraftChange={handleCodeDraftChange}
        activeCodeFilePath={activeCodeFilePath}
        saveCodeDraftsRef={saveCodeDraftsRef}
      />


      {/* Console Panel — Chrome-like side panel */}

    </div>
  );
};

const AppRoot: React.FC = () => (
  <Provider store={store}>
    <App />
  </Provider>
);

export default AppRoot;

