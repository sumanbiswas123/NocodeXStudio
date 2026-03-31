import html2canvas from "html2canvas";
import * as Neutralino from "@neutralinojs/lib";
import { normalizePath, toByteArray } from "./appHelpers";

export const SCREENSHOT_INDEX_FILE = "shared/screenshots/index.json";
export const SCREENSHOT_DIR = "shared/screenshots";
export const PDF_EXPORT_DIR = "shared/pdf_exports";

export type ScreenshotMetadata = {
  id: string;
  createdAt: string;
  projectPath: string;
  slidePath: string | null;
  slideId: string | null;
  popupId: string | null;
  popupSelector: string | null;
  deviceMode: "desktop" | "mobile" | "tablet";
  tabletModel: "ipad" | "ipad-pro";
  tabletOrientation: "landscape" | "portrait";
  frameZoom: number;
  viewportWidth: number;
  viewportHeight: number;
  previewMode: "edit" | "preview";
  interactionMode: "edit" | "preview" | "inspect" | "draw" | "move";
  imagePath: string;
  imageFileName: string;
};

export const captureScreenshot = async ({
  projectPath,
  doc,
  selectedPreviewHtml,
  deviceMode,
  tabletModel,
  tabletOrientation,
  frameZoom,
  previewMode,
  interactionMode,
  ensureDirectoryForFile,
  findVisiblePopupInDoc,
  resolvePreviewAssetUrl,
  dataUrlToBytes,
  loadScreenshotIndex,
  writeScreenshotIndex,
}: {
  projectPath: string;
  doc: Document;
  selectedPreviewHtml: string | null;
  deviceMode: ScreenshotMetadata["deviceMode"];
  tabletModel: ScreenshotMetadata["tabletModel"];
  tabletOrientation: ScreenshotMetadata["tabletOrientation"];
  frameZoom: number;
  previewMode: ScreenshotMetadata["previewMode"];
  interactionMode: ScreenshotMetadata["interactionMode"];
  ensureDirectoryForFile: (path: string) => Promise<void>;
  findVisiblePopupInDoc: (
    doc: Document,
  ) => { popupId: string | null; popupSelector: string | null } | null;
  resolvePreviewAssetUrl: (path: string | null | undefined) => string | null;
  dataUrlToBytes: (dataUrl: string) => Uint8Array;
  loadScreenshotIndex: () => Promise<ScreenshotMetadata[]>;
  writeScreenshotIndex: (items: ScreenshotMetadata[]) => Promise<void>;
}): Promise<ScreenshotMetadata[]> => {
  const popupInfo = findVisiblePopupInDoc(doc);
  const createdAt = new Date();
  const slidePath = selectedPreviewHtml || null;
  const slideId = slidePath
    ? normalizePath(slidePath).split("/").filter(Boolean).slice(-2)[0] || null
    : null;
  const timestamp = createdAt.getTime();
  const randTag = Math.random().toString(36).slice(2, 8);
  const baseName = `screenshot-${timestamp}-${randTag}`;
  const imageRelPath = `${SCREENSHOT_DIR}/${baseName}.png`;
  const jsonRelPath = `${SCREENSHOT_DIR}/${baseName}.json`;
  const absImagePath = `${normalizePath(projectPath)}/${imageRelPath}`;
  const absJsonPath = `${normalizePath(projectPath)}/${jsonRelPath}`;

  await ensureDirectoryForFile(absImagePath);
  const canvas = await html2canvas(doc.body, {
    backgroundColor: null,
    useCORS: true,
    scale: Math.max(1, window.devicePixelRatio || 1),
    onclone: (clonedDoc) => {
      const images = clonedDoc.querySelectorAll("img");
      images.forEach((img) => {
        const next = resolvePreviewAssetUrl(img.getAttribute("src"));
        if (next) img.setAttribute("src", next);
      });
      const sources = clonedDoc.querySelectorAll("source");
      sources.forEach((source) => {
        const next = resolvePreviewAssetUrl(source.getAttribute("src"));
        if (next) source.setAttribute("src", next);
      });
      const links = clonedDoc.querySelectorAll("link[rel='stylesheet']");
      links.forEach((link) => {
        const next = resolvePreviewAssetUrl(link.getAttribute("href"));
        if (next) link.setAttribute("href", next);
      });
    },
  });
  const dataUrl = canvas.toDataURL("image/png");
  const bytes = dataUrlToBytes(dataUrl);
  await (Neutralino as any).filesystem.writeBinaryFile(absImagePath, bytes);

  const metadata: ScreenshotMetadata = {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: createdAt.toISOString(),
    projectPath: normalizePath(projectPath),
    slidePath,
    slideId,
    popupId: popupInfo?.popupId || null,
    popupSelector: popupInfo?.popupSelector || null,
    deviceMode,
    tabletModel,
    tabletOrientation,
    frameZoom,
    viewportWidth: doc.body.scrollWidth,
    viewportHeight: doc.body.scrollHeight,
    previewMode,
    interactionMode,
    imagePath: imageRelPath,
    imageFileName: `${baseName}.png`,
  };

  await ensureDirectoryForFile(absJsonPath);
  await (Neutralino as any).filesystem.writeFile(
    absJsonPath,
    JSON.stringify(metadata, null, 2),
  );

  const existing = await loadScreenshotIndex();
  const nextIndex = [metadata, ...existing];
  await writeScreenshotIndex(nextIndex);
  return nextIndex;
};

export const loadScreenshotGalleryItems = async ({
  projectPath,
  loadScreenshotIndex,
}: {
  projectPath: string | null;
  loadScreenshotIndex: () => Promise<ScreenshotMetadata[]>;
}): Promise<{
  items: ScreenshotMetadata[];
  previewUrls: Record<string, string>;
}> => {
  const items = await loadScreenshotIndex();
  if (!projectPath) {
    return { items, previewUrls: {} };
  }

  const nextUrls: Record<string, string> = {};
  await Promise.all(
    items.map(async (item) => {
      const absImage = `${normalizePath(projectPath)}/${item.imagePath}`;
      try {
        const binary = await (Neutralino as any).filesystem.readBinaryFile(
          absImage,
        );
        const bytes = toByteArray(binary);
        const arrayBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: "image/png" });
        nextUrls[item.id] = URL.createObjectURL(blob);
      } catch (error) {
        console.warn("Failed to read screenshot image:", error);
      }
    }),
  );

  return { items, previewUrls: nextUrls };
};

export const deleteScreenshotItem = async ({
  projectPath,
  item,
  screenshotItems,
  writeScreenshotIndex,
}: {
  projectPath: string;
  item: ScreenshotMetadata;
  screenshotItems: ScreenshotMetadata[];
  writeScreenshotIndex: (items: ScreenshotMetadata[]) => Promise<void>;
}): Promise<ScreenshotMetadata[]> => {
  const absImage = `${normalizePath(projectPath)}/${item.imagePath}`;
  const absJson = absImage.replace(/\.png$/i, ".json");
  try {
    await (Neutralino as any).filesystem.remove(absImage);
  } catch {}
  try {
    await (Neutralino as any).filesystem.remove(absJson);
  } catch {}

  const nextItems = screenshotItems.filter((entry) => entry.id !== item.id);
  await writeScreenshotIndex(nextItems);
  return nextItems;
};

export const revealScreenshotsFolder = async (
  folderPath: string | null,
): Promise<void> => {
  if (!folderPath) return;
  await (Neutralino as any).os.open({ url: folderPath });
};

export const exportEditablePdf = async ({
  projectPath,
  ensureDirectoryTree,
  resolvePdfExportDir,
}: {
  projectPath: string;
  ensureDirectoryTree: (path: string) => Promise<void>;
  resolvePdfExportDir: () => string | null;
}): Promise<string[]> => {
  const appRoot = normalizePath(String((window as any).NL_PATH || ""));
  const scriptPath = appRoot ? `${appRoot}/scripts/export_slides_pdf.mjs` : "";
  if (!scriptPath) return ["Export script not found."];
  const exportDir = resolvePdfExportDir();
  if (!exportDir) return ["Export directory is unavailable."];

  await ensureDirectoryTree(exportDir);
  const command = `node "${scriptPath}" "${normalizePath(projectPath)}" "${exportDir}"`;
  const execResult = await (Neutralino as any).os.execCommand(command);
  const output = String(execResult?.stdOut || "").trim();
  const errorOutput = String(execResult?.stdErr || "").trim();
  const nextLogs: string[] = [];
  if (output) nextLogs.push(...output.split(/\r?\n/));
  if (errorOutput) nextLogs.push(...errorOutput.split(/\r?\n/));
  if ((execResult?.exitCode ?? 1) !== 0) {
    nextLogs.push("Export failed. See logs above.");
  } else if (nextLogs.length === 0) {
    nextLogs.push("Export finished.");
  }
  return nextLogs;
};
