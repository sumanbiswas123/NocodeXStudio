import * as Neutralino from "@neutralinojs/lib";
import {
  isExternalUrl,
  joinPath,
  normalizePath,
  normalizeProjectRelative,
  PREVIEW_MOUNT_PATH,
  resolveProjectRelativePath,
  toMountRelativePath,
} from "./appHelpers";

export const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const resolveProjectWorkspacePath = (
  projectPath: string | null,
  relativePath: string,
) => {
  if (!projectPath) return null;
  return `${normalizePath(projectPath)}/${relativePath}`;
};

export const resolvePreviewAssetUrl = ({
  rawUrl,
  projectPath,
  previewMountBasePath,
  selectedPreviewHtml,
  filePathIndex,
}: {
  rawUrl: string | null | undefined;
  projectPath: string | null;
  previewMountBasePath: string | null;
  selectedPreviewHtml: string;
  filePathIndex: Record<string, string>;
}) => {
  if (!rawUrl) return rawUrl || null;
  if (isExternalUrl(rawUrl)) return rawUrl;
  if (!projectPath || !previewMountBasePath) return rawUrl;
  const cleaned = rawUrl.split("#")[0].split("?")[0];
  const normalizedRelative = cleaned.startsWith("/")
    ? normalizeProjectRelative(cleaned.slice(1))
    : resolveProjectRelativePath(selectedPreviewHtml, cleaned) || cleaned;
  const absolutePath =
    filePathIndex[normalizedRelative] ||
    normalizePath(joinPath(projectPath, normalizedRelative));
  const relativePath = toMountRelativePath(previewMountBasePath, absolutePath);
  if (!relativePath) return rawUrl;
  const nlPort = String((window as any).NL_PORT || "").trim();
  const previewServerOrigin = nlPort ? `http://127.0.0.1:${nlPort}` : "";
  const mountPath = encodeURI(`${PREVIEW_MOUNT_PATH}/${relativePath}`);
  return previewServerOrigin ? `${previewServerOrigin}${mountPath}` : mountPath;
};

export const loadJsonIndexFile = async <T>(
  absolutePath: string | null,
): Promise<T[]> => {
  if (!absolutePath) return [];
  try {
    const raw = await (Neutralino as any).filesystem.readFile(absolutePath);
    const parsed = JSON.parse(String(raw || "[]"));
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
  } catch {
    // Ignore missing or malformed index.
  }
  return [];
};

export const writeJsonIndexFile = async <T>(
  absolutePath: string | null,
  items: T[],
  ensureDirectoryForFile: (absoluteFilePath: string) => Promise<void>,
) => {
  if (!absolutePath) return;
  await ensureDirectoryForFile(absolutePath);
  await (Neutralino as any).filesystem.writeFile(
    absolutePath,
    JSON.stringify(items, null, 2),
  );
};

export const findVisiblePopupInDoc = (doc: Document | null) => {
  if (!doc) return null;
  const selectors = [
    "[data-popup-id]",
    ".modal",
    ".dialog",
    "[role='dialog']",
    ".popup",
  ];
  const candidates = selectors
    .flatMap(
      (selector) => Array.from(doc.querySelectorAll(selector)) as HTMLElement[],
    )
    .filter(Boolean);
  for (const el of candidates) {
    const style = doc.defaultView?.getComputedStyle(el);
    if (!style) continue;
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (Number.parseFloat(style.opacity || "1") <= 0.05) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const popupId = el.getAttribute("data-popup-id") || el.id || null;
    const popupSelector = el.getAttribute("data-popup-id")
      ? `[data-popup-id="${el.getAttribute("data-popup-id")}"]`
      : el.id
        ? `#${el.id}`
        : null;
    return { popupId, popupSelector };
  }
  return null;
};
