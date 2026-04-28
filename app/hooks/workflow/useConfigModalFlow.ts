import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Neutralino from "@neutralinojs/lib";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FileMap } from "../../../types";
import {
  CONFIG_JSON_PATH,
  PORTFOLIO_CONFIG_PATH,
  PRESENTATION_JS_PATH,
  PRESENTATION_CSS_PATH_CONST,
  getConfigPathCandidates,
  resolveConfigPathFromFiles,
  scoreConfigContent,
} from "../../helpers/appHelpers";

type ConfigModalTab = "references" | "slides" | "configRaw";

type UseConfigModalFlowOptions = {
  dirtyFilesRef: MutableRefObject<string[]>;
  filePathIndexRef: MutableRefObject<Record<string, string>>;
  files: FileMap;
  filesRef: MutableRefObject<FileMap>;
  loadFileContent: (
    path: string,
    options?: { persistToState?: boolean },
  ) => Promise<string | Blob | null | undefined>;
  projectPath: string | null;
  requestPreviewRefreshWithUnsavedGuard: () => void;
  setDirtyFiles: Dispatch<SetStateAction<string[]>>;
  setFiles: Dispatch<SetStateAction<FileMap>>;
};

type UseConfigModalFlowResult = {
  configModalInitialTab: ConfigModalTab;
  configPathForModal: string;
  handleChooseFolderCloneSource: () => void;
  handleOpenConfigModal: () => void;
  handleSaveConfig: (
    newConfig: string,
    newPortfolio: string,
    newPresentationJs: string,
    newPresentationCss: string,
  ) => Promise<void>;
  isConfigModalOpen: boolean;
  isConfigModalSlidesOnly: boolean;
  portfolioPathForModal: string;
  selectedFolderCloneSource: string | null;
  setIsConfigModalOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedFolderCloneSource: Dispatch<SetStateAction<string | null>>;
};

export const useConfigModalFlow = ({
  dirtyFilesRef,
  filePathIndexRef,
  files,
  filesRef,
  loadFileContent,
  projectPath,
  requestPreviewRefreshWithUnsavedGuard,
  setDirtyFiles,
  setFiles,
}: UseConfigModalFlowOptions): UseConfigModalFlowResult => {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalInitialTab, setConfigModalInitialTab] =
    useState<ConfigModalTab>("references");
  const [isConfigModalSlidesOnly, setIsConfigModalSlidesOnly] = useState(false);
  const [configModalConfigPath, setConfigModalConfigPath] = useState<string | null>(
    null,
  );
  const [configModalPortfolioPath, setConfigModalPortfolioPath] = useState<
    string | null
  >(null);
  const [selectedFolderCloneSource, setSelectedFolderCloneSource] = useState<
    string | null
  >(null);
  const configModalConfigPathRef = useRef<string | null>(null);
  const configModalPortfolioPathRef = useRef<string | null>(null);

  useEffect(() => {
    configModalConfigPathRef.current = configModalConfigPath;
  }, [configModalConfigPath]);

  useEffect(() => {
    configModalPortfolioPathRef.current = configModalPortfolioPath;
  }, [configModalPortfolioPath]);

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
      // Also load presentation.js and presentation.css for the new tabs
      const presentationJsPath = Object.keys(filesRef.current).find(
        (p) => /shared\/js\/presentation\.js$/i.test(p),
      ) || "shared/js/presentation.js";
      const presentationCssPath = Object.keys(filesRef.current).find(
        (p) => /shared\/css\/presentation\.css$/i.test(p),
      ) || "shared/css/presentation.css";

      await Promise.all([
        loadFileContent(presentationJsPath, { persistToState: true }),
        loadFileContent(presentationCssPath, { persistToState: true }),
      ]).catch(() => {
        // Files may not exist yet — that's OK
      });

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
  }, [filesRef, loadFileContent, projectPath]);

  const handleChooseFolderCloneSource = useCallback(() => {
    setConfigModalInitialTab("slides");
    setIsConfigModalSlidesOnly(true);
    setIsConfigModalOpen(true);
  }, []);

  const handleSaveConfig = useCallback(
    async (newConfig: string, newPortfolio: string, newPresentationJs: string, newPresentationCss: string) => {
      try {
        const configPath =
          configModalConfigPathRef.current ||
          resolveConfigPathFromFiles(filesRef.current, "config.json") ||
          CONFIG_JSON_PATH;
        const portfolioPath =
          configModalPortfolioPathRef.current ||
          resolveConfigPathFromFiles(filesRef.current, "portfolioconfig.json") ||
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

          if (!dirtyFilesRef.current.includes(configPath)) {
            dirtyFilesRef.current.push(configPath);
            setDirtyFiles((prev) => [...prev, configPath]);
          }

          if (filePathIndexRef.current[configPath]) {
            await (Neutralino as any).filesystem.writeFile(
              filePathIndexRef.current[configPath],
              newConfig,
            );
            dirtyFilesRef.current = dirtyFilesRef.current.filter(
              (entry) => entry !== configPath,
            );
            setDirtyFiles((prev) => prev.filter((entry) => entry !== configPath));
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

          if (!dirtyFilesRef.current.includes(portfolioPath)) {
            dirtyFilesRef.current.push(portfolioPath);
            setDirtyFiles((prev) => [...prev, portfolioPath]);
          }

          if (filePathIndexRef.current[portfolioPath]) {
            await (Neutralino as any).filesystem.writeFile(
              filePathIndexRef.current[portfolioPath],
              newPortfolio,
            );
            dirtyFilesRef.current = dirtyFilesRef.current.filter(
              (entry) => entry !== portfolioPath,
            );
            setDirtyFiles((prev) =>
              prev.filter((entry) => entry !== portfolioPath),
            );
          }
        }

        const persistFile = async (virtualPath: string, content: string) => {
          const absPath = filePathIndexRef.current[virtualPath];
          if (!absPath) return;
          if (!filesRef.current[virtualPath]) {
            filesRef.current = {
              ...filesRef.current,
              [virtualPath]: {
                path: virtualPath,
                name: virtualPath.split("/").pop() || virtualPath,
                type: (virtualPath.endsWith(".css") ? "css" : "js") as "css" | "js",
                content,
              },
            };
            setFiles(filesRef.current);
          } else {
            filesRef.current = {
              ...filesRef.current,
              [virtualPath]: {
                ...filesRef.current[virtualPath],
                content,
              },
            };
            setFiles(filesRef.current);
          }
          if (!dirtyFilesRef.current.includes(virtualPath)) {
            dirtyFilesRef.current.push(virtualPath);
            setDirtyFiles((prev) => [...prev, virtualPath]);
          }
          await (Neutralino as any).filesystem.writeFile(absPath, content);
          dirtyFilesRef.current = dirtyFilesRef.current.filter(
            (entry) => entry !== virtualPath,
          );
          setDirtyFiles((prev) => prev.filter((entry) => entry !== virtualPath));
        };

        if (newPresentationJs) {
          const jsPath = resolveConfigPathFromFiles(filesRef.current, "config.json")
            ? PRESENTATION_JS_PATH
            : PRESENTATION_JS_PATH;
          await persistFile(jsPath, newPresentationJs);
        }
        if (newPresentationCss) {
          await persistFile(PRESENTATION_CSS_PATH_CONST, newPresentationCss);
        }

        requestPreviewRefreshWithUnsavedGuard();
      } catch (err) {
        console.error("Failed to save config:", err);
        alert("Failed to save configuration files.");
      }
    },
    [
      dirtyFilesRef,
      filePathIndexRef,
      filesRef,
      requestPreviewRefreshWithUnsavedGuard,
      setDirtyFiles,
      setFiles,
    ],
  );

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

  return {
    configModalInitialTab,
    configPathForModal: configModalConfigPath || resolvedConfigVirtualPath,
    handleChooseFolderCloneSource,
    handleOpenConfigModal,
    handleSaveConfig,
    isConfigModalOpen,
    isConfigModalSlidesOnly,
    portfolioPathForModal:
      configModalPortfolioPath || resolvedPortfolioConfigVirtualPath,
    selectedFolderCloneSource,
    setIsConfigModalOpen,
    setSelectedFolderCloneSource,
  };
};
