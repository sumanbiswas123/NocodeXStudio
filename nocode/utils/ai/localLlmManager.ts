import * as Neutralino from "@neutralinojs/lib";
import { checkLocalLlmHealth } from "./localLlmClient";

type LocalLlmInfo = {
  baseDir: string;
  serverDir: string;
  modelsDir: string;
  serverExe: string;
  modelPath: string;
};

const LLAMA_RELEASE_API =
  "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
const MODEL_URL =
  "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf";
const MODEL_FILE = "qwen2.5-1.5b-instruct-q4_0.gguf";

const SERVER_PORT = 8080;
const SERVER_ARGS = [
  "--port",
  String(SERVER_PORT),
  "--ctx-size",
  "4096",
];

let ensurePromise: Promise<LocalLlmInfo> | null = null;
let spawnedProcessId: number | null = null;

const joinFsPath = (...parts: string[]) =>
  parts
    .filter(Boolean)
    .join("\\")
    .replace(/\\{2,}/g, "\\");

async function ensureDir(path: string) {
  try {
    await Neutralino.filesystem.createDirectory(path);
  } catch {
    // Directory may already exist.
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Neutralino.filesystem.getStats(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, destination: string) {
  const command = [
    "powershell",
    "-NoProfile",
    "-Command",
    `"Invoke-WebRequest -Uri '${url}' -OutFile '${destination}'"`,
  ].join(" ");
  const result = await Neutralino.os.execCommand(command);
  if (result?.exitCode !== 0) {
    throw new Error(result?.stdErr || "Download failed.");
  }
}

async function downloadAndExtractLlamaServer(serverDir: string) {
  const release = await fetch(LLAMA_RELEASE_API).then((res) => res.json());
  const asset = (release?.assets || []).find((item: any) =>
    String(item?.name || "").toLowerCase().endsWith("bin-win-cpu-x64.zip"),
  );
  if (!asset?.browser_download_url) {
    throw new Error("Could not find llama.cpp Windows CPU release asset.");
  }
  const zipPath = joinFsPath(serverDir, "llama-win-cpu-x64.zip");

  await downloadFile(asset.browser_download_url, zipPath);

  const expandCommand = [
    "powershell",
    "-NoProfile",
    "-Command",
    `"Expand-Archive -Path '${zipPath}' -DestinationPath '${serverDir}' -Force"`,
  ].join(" ");
  const expandResult = await Neutralino.os.execCommand(expandCommand);
  if (expandResult?.exitCode !== 0) {
    throw new Error(expandResult?.stdErr || "Failed to extract llama.cpp.");
  }
  await Neutralino.filesystem.remove(zipPath);
}

async function ensureLlamaServerBinary(serverExe: string, serverDir: string) {
  if (await fileExists(serverExe)) return;
  await downloadAndExtractLlamaServer(serverDir);
}

async function ensureModelFile(modelPath: string) {
  if (await fileExists(modelPath)) return;
  await downloadFile(MODEL_URL, modelPath);
}

async function spawnServer(serverExe: string, modelPath: string) {
  if (await checkLocalLlmHealth()) return;
  throw new Error(
    "Local LLM server is not running. Please start llama-server.exe manually.",
  );
}

async function safeGetBaseDir(): Promise<string> {
  return "C:\\Users\\SumanBiswas\\Downloads\\nocode-x-studio";
  const fallback = async () => {
    const home = await Neutralino.os.getPath("home");
    return joinFsPath(home, ".nocode-x-studio");
  };
  try {
    const appData = await Neutralino.os.getPath("appData");
    if (appData) return joinFsPath(appData, "nocode-x-studio");
  } catch {
    // ignore
  }
  try {
    const userData = await Neutralino.os.getPath("userData");
    if (userData) return joinFsPath(userData, "nocode-x-studio");
  } catch {
    // ignore
  }
  try {
    const documents = await Neutralino.os.getPath("documents");
    if (documents) return joinFsPath(documents, "nocode-x-studio");
  } catch {
    // ignore
  }
  return fallback();
}

export async function ensureLocalLlmReady(): Promise<LocalLlmInfo> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const baseRoot = await safeGetBaseDir();
    const baseDir = joinFsPath(baseRoot, "local-llm");
    const serverDir = joinFsPath(baseDir, "llama");
    const modelsDir = joinFsPath(baseDir, "models");
    const serverExe = joinFsPath(serverDir, "llama-server.exe");
    const modelPath = joinFsPath(modelsDir, MODEL_FILE);

    await ensureDir(baseDir);
    await ensureDir(serverDir);
    await ensureDir(modelsDir);

    await ensureLlamaServerBinary(serverExe, serverDir);
    await ensureModelFile(modelPath);

    if (!(await checkLocalLlmHealth())) {
      throw new Error(
        "Local LLM server is not running. Start llama-server.exe manually, then try again.",
      );
    }

    return {
      baseDir,
      serverDir,
      modelsDir,
      serverExe,
      modelPath,
    };
  })();
  return ensurePromise;
}

export function getLocalLlmProcessId() {
  return spawnedProcessId;
}
