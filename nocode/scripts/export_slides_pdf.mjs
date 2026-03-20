import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { PDFDocument } from "pdf-lib";

const IGNORED_FOLDERS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

const resolveChromePath = async () => {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
};

const walkHtmlFiles = async (root) => {
  const out = [];
  const visit = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_FOLDERS.has(entry.name)) continue;
        await visit(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".html")) continue;
      out.push(path.join(dir, entry.name));
    }
  };
  await visit(root);
  return out;
};

const toFileUrl = (absolutePath) => {
  const normalized = absolutePath.replace(/\\/g, "/");
  return `file:///${encodeURI(normalized)}`;
};

const runChromePrint = (chromePath, url, outputPath) =>
  new Promise((resolve, reject) => {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-extensions",
      "--print-to-pdf-no-header",
      `--print-to-pdf=${outputPath}`,
      url,
    ];
    const proc = spawn(chromePath, args, { stdio: "pipe" });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Chrome exited with code ${code}`));
      }
    });
  });

const getSlideId = (relativePath) => {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return "unknown";
  if (parts[parts.length - 1].toLowerCase() === "index.html") {
    return parts[parts.length - 2] || "index";
  }
  return parts[parts.length - 1].replace(/\.html$/i, "");
};

const getPopupId = (relativePath) => {
  const normalized = relativePath.toLowerCase();
  if (normalized.includes("popup") || normalized.includes("modal")) {
    return getSlideId(relativePath);
  }
  return null;
};

const main = async () => {
  const [projectRoot, outputDir] = process.argv.slice(2);
  if (!projectRoot || !outputDir) {
    console.error("Usage: node export_slides_pdf.mjs <projectRoot> <outputDir>");
    process.exit(1);
  }

  const chromePath = await resolveChromePath();
  if (!chromePath) {
    console.error("Could not find Chrome/Edge. Set CHROME_PATH env var.");
    process.exit(1);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const htmlFiles = (await walkHtmlFiles(projectRoot)).filter(
    (filePath) => !filePath.toLowerCase().includes("\\shared\\"),
  );

  if (htmlFiles.length === 0) {
    console.error("No HTML slides found to export.");
    process.exit(1);
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "");
  const projectName = path.basename(projectRoot.replace(/[\\/]$/, ""));
  const outputPdfPath = path.join(outputDir, `${projectName}-${timestamp}.pdf`);
  const outputMetadataPath = path.join(
    outputDir,
    `${projectName}-${timestamp}.metadata.json`,
  );
  const tempDir = path.join(outputDir, `.nx_tmp_pdf_${timestamp}`);
  await fs.mkdir(tempDir, { recursive: true });

  const tempPdfs = [];
  for (const [index, filePath] of htmlFiles.entries()) {
    const tempPdf = path.join(tempDir, `slide-${index + 1}.pdf`);
    const url = toFileUrl(filePath);
    console.log(`Exporting ${url}`);
    await runChromePrint(chromePath, url, tempPdf);
    tempPdfs.push({ filePath, tempPdf });
  }

  const merged = await PDFDocument.create();
  const pageMappings = [];
  let pageNumber = 1;
  for (const entry of tempPdfs) {
    const pdfBytes = await fs.readFile(entry.tempPdf);
    const doc = await PDFDocument.load(pdfBytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    const relativePath = path.relative(projectRoot, entry.filePath);
    const slideId = getSlideId(relativePath);
    const popupId = getPopupId(relativePath);
    for (const page of pages) {
      merged.addPage(page);
      pageMappings.push({
        pageNumber,
        slidePath: relativePath.replace(/\\/g, "/"),
        slideId,
        popupId,
        exportedAt: new Date().toISOString(),
      });
      pageNumber += 1;
    }
  }

  const mergedBytes = await merged.save();
  await fs.writeFile(outputPdfPath, mergedBytes);
  await fs.writeFile(
    outputMetadataPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        pdfPath: outputPdfPath,
        pages: pageMappings,
      },
      null,
      2,
    ),
  );

  await fs.rm(tempDir, { recursive: true, force: true });
  console.log(`PDF export complete: ${outputPdfPath}`);
  console.log(`Metadata export complete: ${outputMetadataPath}`);
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
