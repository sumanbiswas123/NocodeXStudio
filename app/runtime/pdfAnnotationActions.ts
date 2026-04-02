import * as Neutralino from "@neutralinojs/lib";
import {
  addProcessingLog,
  clearProcessingLogs,
  setClassifierMetrics,
  setError,
  setFileName,
  setFocusedAnnotation,
  setIsLoading,
  setIsOpen,
  setRecords,
  setSourcePath,
} from "../../src/store/annotationSlice";
import {
  buildMappedPdfAnnotations,
  evaluateAnnotationTypeClassifier,
  PdfAnnotationRecord,
  PdfAnnotationUiRecord,
} from "../helpers/pdfAnnotationHelpers";
import { FileMap } from "../../types";
import { normalizePath, toByteArray } from "../helpers/appHelpers";

export const appendPdfAnnotationLog = (
  dispatch: any,
  message: string,
  level: "info" | "warn" | "error" = "info",
) => {
  dispatch(
    addProcessingLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      message,
      level,
    }),
  );
};

type RunPdfAnnotationMappingArgs = {
  projectPath: string | null;
  isPdfAnnotationLoading: boolean;
  pdfPath: string;
  useCache: boolean;
  files: FileMap;
  absolutePathIndex: Record<string, string>;
  dispatch: any;
  readPdfAnnotationCache: () => any;
  writePdfAnnotationCache: (
    projectKey: string,
    pdfPath: string,
    fileName: string,
    records: PdfAnnotationUiRecord[],
  ) => void;
  shouldCancel?: () => boolean;
};

export const runPdfAnnotationMapping = async ({
  projectPath,
  isPdfAnnotationLoading,
  pdfPath,
  useCache,
  files,
  absolutePathIndex,
  dispatch,
  readPdfAnnotationCache,
  writePdfAnnotationCache,
  shouldCancel,
}: RunPdfAnnotationMappingArgs) => {
  if (!projectPath || isPdfAnnotationLoading) return;
  const isCancelled = () => shouldCancel?.() === true;
  const throwIfCancelled = () => {
    if (!isCancelled()) return;
    const error = new Error("PDF annotation mapping stopped.");
    error.name = "PdfAnnotationMappingCancelled";
    throw error;
  };
  const normalizedPdfPath = normalizePath(pdfPath);
  const normalizedProject = normalizePath(projectPath);
  dispatch(clearProcessingLogs());
  appendPdfAnnotationLog(dispatch, "Starting PDF annotation mapping.");
  if (useCache) {
    appendPdfAnnotationLog(dispatch, "Checking local cache for previous results.");
    const cache = readPdfAnnotationCache();
    const cachedEntry =
      cache?.projects?.[normalizedProject]?.entries?.[normalizedPdfPath];
    if (cachedEntry) {
      const cachedRecords = cachedEntry.records || [];
      dispatch(setRecords(cachedRecords));
      const metrics = evaluateAnnotationTypeClassifier(cachedRecords).micro;
      dispatch(setClassifierMetrics(metrics as any));
      dispatch(setFileName(cachedEntry.fileName || ""));
      dispatch(setSourcePath(normalizedPdfPath));
      dispatch(setError(null));
      dispatch(setIsOpen(true));
      dispatch(setFocusedAnnotation(null));
      appendPdfAnnotationLog(
        dispatch,
        `Cache hit. Loaded ${cachedRecords.length} annotations.`,
      );
      return;
    }
    appendPdfAnnotationLog(dispatch, "Cache miss. Running full extraction.");
  }

  dispatch(setIsLoading(true));
  dispatch(setError(null));
  dispatch(setIsOpen(true));
  dispatch(setFocusedAnnotation(null));
  dispatch(setRecords([]));
  try {
    throwIfCancelled();
    appendPdfAnnotationLog(dispatch, "Reading PDF file into memory.");
    const binaryData = await (Neutralino as any).filesystem.readBinaryFile(
      normalizedPdfPath,
    );
    throwIfCancelled();
    const pdfData = toByteArray(binaryData);
    appendPdfAnnotationLog(dispatch, "Preparing PDF data for extraction.");
    let preExtractedAnnotations: PdfAnnotationRecord[] | null = null;
    try {
      throwIfCancelled();
      appendPdfAnnotationLog(dispatch, "Running background extractor script.");
      const appRoot = normalizePath(String((window as any).NL_PATH || ""));
      const workerScriptPath = appRoot
        ? `${appRoot}/scripts/pdf_annotation_worker.mjs`
        : "";
      const workerOutputPath = projectPath
        ? `${normalizePath(projectPath)}/.nx_tmp_pdf_annotations_${Date.now()}.json`
        : "";
      if (workerScriptPath && workerOutputPath) {
        let nodeExecutable = "node";
        if (appRoot) {
          const bundledNode = normalizePath(`${appRoot}/node/node.exe`);
          try {
            await (Neutralino as any).filesystem.getStats(bundledNode);
            nodeExecutable = `"${bundledNode}"`;
          } catch {
            nodeExecutable = "node";
          }
        }
        appendPdfAnnotationLog(
          dispatch,
          `PDF worker paths: node=${nodeExecutable}, script=${workerScriptPath}`,
        );
        const command = `${nodeExecutable} "${workerScriptPath}" "${normalizedPdfPath}" "${workerOutputPath}"`;
        const execResult = await (Neutralino as any).os.execCommand(command);
        throwIfCancelled();
        if ((execResult?.exitCode ?? 1) === 0) {
          appendPdfAnnotationLog(dispatch, "Parsing extractor output.");
          const workerRaw = await (Neutralino as any).filesystem.readFile(
            workerOutputPath,
          );
          throwIfCancelled();
          const parsed = JSON.parse(String(workerRaw || "{}"));
          if (Array.isArray(parsed?.annotations)) {
            preExtractedAnnotations = parsed.annotations;
            appendPdfAnnotationLog(
              dispatch,
              `Extractor produced ${preExtractedAnnotations.length} annotations.`,
            );
          }
        }
        try {
          await (Neutralino as any).filesystem.removeFile(workerOutputPath);
        } catch {}
      }
    } catch (workerError) {
      console.warn("Background PDF extraction failed:", workerError);
      appendPdfAnnotationLog(
        dispatch,
        "Background extractor failed. No annotations returned.",
        "warn",
      );
    }
    if (!preExtractedAnnotations || preExtractedAnnotations.length === 0) {
      appendPdfAnnotationLog(
        dispatch,
        "Background extractor returned no annotations. Falling back to in-app worker.",
        "warn",
      );
      preExtractedAnnotations = null;
    }
    throwIfCancelled();
    appendPdfAnnotationLog(dispatch, "Mapping annotations to project files.");
    const details = await buildMappedPdfAnnotations({
      pdfData,
      files,
      absolutePathIndex,
      preExtractedAnnotations,
      readBinaryFile: async (absolutePath: string) => {
        const nextBinary = await (Neutralino as any).filesystem.readBinaryFile(
          normalizePath(absolutePath),
        );
        const bytes = toByteArray(nextBinary);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
      },
    });
    throwIfCancelled();
    const fileName =
      normalizePath(normalizedPdfPath).split("/").filter(Boolean).slice(-1)[0] ||
      normalizedPdfPath;
    dispatch(setRecords(details));
    appendPdfAnnotationLog(dispatch, "Scoring annotation types.");
    const metrics = evaluateAnnotationTypeClassifier(details).micro;
    dispatch(setClassifierMetrics(metrics as any));
    dispatch(setFileName(fileName));
    dispatch(setSourcePath(normalizedPdfPath));
    appendPdfAnnotationLog(
      dispatch,
      `Mapping complete. ${details.length} annotations ready.`,
    );
    appendPdfAnnotationLog(dispatch, "Caching results locally.");
    writePdfAnnotationCache(
      normalizedProject,
      normalizedPdfPath,
      fileName,
      details,
    );
    appendPdfAnnotationLog(dispatch, "Results cached for faster reloads.");

    try {
      const debugOutputPath = `${normalizePath(projectPath)}/pdf_mapping_debug.json`;
      await (Neutralino as any).filesystem.writeFile(
        debugOutputPath,
        JSON.stringify(details, null, 2),
      );
    } catch (exportError) {
      console.warn("[NX-DEBUG] Failed to export mapping JSON:", exportError);
      appendPdfAnnotationLog(dispatch, "Debug export failed (non-blocking).", "warn");
    }
  } catch (error) {
    if ((error as Error | undefined)?.name === "PdfAnnotationMappingCancelled") {
      appendPdfAnnotationLog(dispatch, "PDF import stopped.", "warn");
      return;
    }
    console.error("Failed to analyze annotated PDF:", error);
    dispatch(setRecords([]));
    dispatch(setClassifierMetrics(null));
    dispatch(
      setError(
        error instanceof Error
          ? error.message
          : "Could not analyze this PDF inside the app.",
      ),
    );
    appendPdfAnnotationLog(
      dispatch,
      error instanceof Error
        ? `Error: ${error.message}`
        : "Error: Could not analyze this PDF inside the app.",
      "error",
    );
  } finally {
    dispatch(setIsLoading(false));
    if (!isCancelled()) {
      appendPdfAnnotationLog(dispatch, "Processing finished.");
    }
  }
};

export const selectPdfAndRunMapping = async ({
  projectPath,
  isPdfAnnotationLoading,
  existingRecordsCount,
  useCache,
  dispatch,
  runMapping,
}: {
  projectPath: string | null;
  isPdfAnnotationLoading: boolean;
  existingRecordsCount: number;
  useCache: boolean;
  dispatch: any;
  runMapping: (pdfPath: string, useCache: boolean) => Promise<void>;
}) => {
  if (!projectPath || isPdfAnnotationLoading) return;
  if (useCache && existingRecordsCount > 0) {
    dispatch(setIsOpen(true));
    return;
  }

  try {
    const selections = await (Neutralino as any).os.showOpenDialog(
      "Select annotated PDF",
      {
        multiSelections: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      },
    );
    const pdfPath = Array.isArray(selections) ? selections[0] : null;
    if (!pdfPath) return;
    await runMapping(pdfPath, useCache);
  } catch (error) {
    if (useCache) {
      console.error("Failed to analyze annotated PDF:", error);
      dispatch(setRecords([]));
      dispatch(
        setError(
          error instanceof Error
            ? error.message
            : "Could not analyze this PDF inside the app.",
        ),
      );
    } else {
      console.error("Failed to refresh annotated PDF:", error);
    }
  }
};
