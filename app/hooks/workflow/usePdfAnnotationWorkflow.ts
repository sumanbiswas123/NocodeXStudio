import { useCallback, useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import {
  setClassifierMetrics,
  setError,
  setFileName,
  setFocusedAnnotation,
  setIsLoading,
  setIsOpen,
  setRecords,
  setSourcePath,
} from "../../../src/store/annotationSlice";
import {
  evaluateAnnotationTypeClassifier,
  PdfAnnotationUiRecord,
} from "../../helpers/pdfAnnotationHelpers";
import {
  runPdfAnnotationMapping as runPdfAnnotationMappingHelper,
  selectPdfAndRunMapping,
} from "../../runtime/pdfAnnotationActions";
import { normalizePath } from "../../helpers/appHelpers";
import type { FileMap, VirtualElement } from "../../../types";

type InteractionMode = "edit" | "preview" | "inspect" | "draw" | "move";
type PreviewToolMode = "edit" | "inspect" | "draw" | "move";

type UsePdfAnnotationWorkflowOptions = {
  cacheKey: string;
  dispatch: any;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  files: FileMap;
  focusedPdfAnnotation: PdfAnnotationUiRecord | null;
  isPdfAnnotationLoading: boolean;
  pdfAnnotationRecords: PdfAnnotationUiRecord[];
  pdfAnnotationTypeFilter: string;
  previewFocusedPdfElementRef: MutableRefObject<HTMLElement | null>;
  previewFrameLoadNonce: number;
  previewFrameRef: MutableRefObject<HTMLIFrameElement | null>;
  previewRefreshNonce: number;
  projectPath: string | null;
  selectedPreviewHtml: string | null;
  selectedPreviewHtmlRef: MutableRefObject<string | null>;
  setActiveFileStable: (path: string | null) => void;
  setInteractionMode: React.Dispatch<React.SetStateAction<InteractionMode>>;
  setPreviewMode: React.Dispatch<React.SetStateAction<"edit" | "preview">>;
  setPreviewNavigationFile: React.Dispatch<React.SetStateAction<string | null>>;
  setPreviewSelectedComputedStyles: React.Dispatch<
    React.SetStateAction<React.CSSProperties | null>
  >;
  setPreviewSelectedElement: React.Dispatch<
    React.SetStateAction<VirtualElement | null>
  >;
  setPreviewSelectedPath: React.Dispatch<
    React.SetStateAction<number[] | null>
  >;
  setPreviewSyncedFile: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setSidebarToolMode: React.Dispatch<React.SetStateAction<PreviewToolMode>>;
};

type UsePdfAnnotationWorkflowResult = {
  currentPreviewSlideId: string | null;
  filteredAnnotationsForCurrentSlide: PdfAnnotationUiRecord[];
  focusedAnnotationForCurrentSlide: PdfAnnotationUiRecord | null;
  handleJumpToPdfAnnotation: (annotation: PdfAnnotationUiRecord) => void;
  handleOpenPdfAnnotationsPicker: () => Promise<void>;
  handleRefreshPdfAnnotationMapping: () => Promise<void>;
  hasPdfAnnotationsLoaded: boolean;
  isPopupAnnotation: (annotation: PdfAnnotationUiRecord) => boolean;
};

export const usePdfAnnotationWorkflow = ({
  cacheKey,
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
}: UsePdfAnnotationWorkflowOptions): UsePdfAnnotationWorkflowResult => {
  const readPdfAnnotationCache = useCallback(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
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
  }, [cacheKey]);

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
          cacheKey,
          JSON.stringify({ version: 2, projects: nextProjects }),
        );
      } catch {
        // Ignore storage errors.
      }
    },
    [cacheKey, readPdfAnnotationCache],
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
      dispatch,
      filePathIndexRef,
      files,
      isPdfAnnotationLoading,
      projectPath,
      readPdfAnnotationCache,
      writePdfAnnotationCache,
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
    dispatch,
    isPdfAnnotationLoading,
    pdfAnnotationRecords.length,
    projectPath,
    runPdfAnnotationMapping,
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
  }, [
    dispatch,
    isPdfAnnotationLoading,
    pdfAnnotationRecords.length,
    projectPath,
    runPdfAnnotationMapping,
  ]);

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

      const isTargetingSlideButNotCurrent =
        !isTargetingCurrentSlide &&
        !annotation.mappedFilePath.includes("/shared/");

      if (isTargetingCurrentSlide) {
        dispatch(setFocusedAnnotation({ ...annotation }));
        setPreviewMode("preview");
        setInteractionMode("preview");
        return;
      }

      if (!isTargetingCurrentSlide && isTargetingSlideButNotCurrent) {
        // fall through to navigation
      } else if (currentSlide && isSharedPopup) {
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
    [
      dispatch,
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
    ],
  );

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
  }, [dispatch, projectPath, readPdfAnnotationCache]);

  useEffect(() => {
    if (!focusedPdfAnnotation) return;
    const timer = window.setTimeout(() => {
      dispatch(setFocusedAnnotation(null));
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [dispatch, focusedPdfAnnotation]);

  const currentPreviewSlideId = useMemo(() => {
    if (!selectedPreviewHtml) return null;
    const parts = normalizePath(selectedPreviewHtml).split("/").filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : null;
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
  }, [
    annotationsForCurrentSlide,
    isPopupAnnotation,
    pdfAnnotationTypeFilter,
  ]);

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

    for (const annotation of filteredAnnotationsForCurrentSlide) {
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

    try {
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

      const frameWindow = frame?.contentWindow as any;
      if (frameWindow) {
        if (frameWindow.com?.gsk?.mt?.closeDialog) {
          try {
            frameWindow.com.gsk.mt.closeDialog();
          } catch {}
        }
        if (typeof frameWindow.$ === "function") {
          try {
            frameWindow.$(".popup, .dialog, .modal").hide().removeClass("open active show");
          } catch {}
        }
      }
    } catch (e) {
      console.warn("[NX] Failed to cleanup existing dialogs:", e);
    }

    const focusedTarget = resolveAnnotationTarget(focusedAnnotationForCurrentSlide);
    if (focusedTarget) {
      focusedTarget.setAttribute("data-nx-pdf-focus", "true");
      focusedTarget.style.transition = "outline 0.2s ease, box-shadow 0.2s ease";
      focusedTarget.style.outline = "3px solid rgba(239,68,68,0.98)";
      focusedTarget.style.boxShadow = "0 0 0 6px rgba(239,68,68,0.35)";
      focusedTarget.scrollIntoView({ block: "center", inline: "center" });
      previewFocusedPdfElementRef.current = focusedTarget;
    }
  }, [
    filteredAnnotationsForCurrentSlide,
    focusedAnnotationForCurrentSlide,
    isPopupAnnotation,
    pdfAnnotationTypeFilter,
    previewFocusedPdfElementRef,
    previewFrameLoadNonce,
    previewFrameRef,
    previewRefreshNonce,
    selectedPreviewHtml,
  ]);

  return {
    currentPreviewSlideId,
    filteredAnnotationsForCurrentSlide,
    focusedAnnotationForCurrentSlide,
    handleJumpToPdfAnnotation,
    handleOpenPdfAnnotationsPicker,
    handleRefreshPdfAnnotationMapping,
    hasPdfAnnotationsLoaded: pdfAnnotationRecords.length > 0,
    isPopupAnnotation,
  };
};
