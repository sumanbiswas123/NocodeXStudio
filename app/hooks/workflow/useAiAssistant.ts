import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FileMap, ProjectFile, VirtualElement } from "../../../types";
import {
  ensureSidecarReady,
  getSidecarModelStatus,
  startAgentRun,
  subscribeToSidecarModelStatus,
  subscribeToSidecarProgress,
  type AgentRunResponse,
  type AssistantMode,
  type SidecarModelStatus,
  type SidecarProgressEvent,
} from "../../runtime/sidecarClient";
import { AI_ASSISTANT_ENABLED } from "../../runtime/featureFlags";

type UseAiAssistantOptions = {
  activeFile: string | null;
  files: FileMap;
  projectPath: string | null;
  selectedPreviewHtml: string | null;
  previewSelectedElement: VirtualElement | null;
  previewSelectedComputedStyles: React.CSSProperties | null;
  previewSelectedMatchedCssRules: unknown[];
  setCodeDraftByPath: Dispatch<SetStateAction<Record<string, string>>>;
  setCodeDirtyPathSet: Dispatch<SetStateAction<Record<string, true>>>;
  setIsCodePanelOpen: Dispatch<SetStateAction<boolean>>;
  setActiveFileStable: (path: string | null) => void;
};

export type AiAssistantMessage = {
  id: string;
  role: "assistant" | "system" | "user";
  text: string;
  isStreaming?: boolean;
  response?: AgentRunResponse;
  staged?: boolean;
};

type SlideTargets = {
  cssPath: string | null;
  htmlPath: string | null;
  jsPath: string | null;
};

const createMessageId = () =>
  `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getParentDir = (path: string | null) => {
  if (!path) return null;
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index < 0) return "";
  return normalized.slice(0, index);
};

const isTextContent = (content: string | Blob): content is string =>
  typeof content === "string";

const listSiblingFiles = (files: FileMap, directory: string | null, type: ProjectFile["type"]) =>
  Object.keys(files)
    .filter((path) => {
      if (files[path]?.type !== type) return false;
      return getParentDir(path) === (directory ?? null);
    })
    .sort((a, b) => a.localeCompare(b));

const pickCompanionFile = (
  files: FileMap,
  directory: string | null,
  type: ProjectFile["type"],
  preferredNames: string[],
  activeFile: string | null,
) => {
  if (activeFile && files[activeFile]?.type === type) return activeFile;
  const siblings = listSiblingFiles(files, directory, type);
  const preferred = preferredNames
    .map((name) => (directory ? `${directory}/${name}` : name))
    .find((path) => siblings.includes(path));
  return preferred ?? siblings[0] ?? null;
};

const deriveSlideTargets = (
  files: FileMap,
  activeFile: string | null,
  selectedPreviewHtml: string | null,
): SlideTargets => {
  const htmlPath =
    selectedPreviewHtml ??
    (activeFile && files[activeFile]?.type === "html" ? activeFile : null) ??
    Object.keys(files).find((path) => files[path]?.type === "html") ??
    null;
  const directory = getParentDir(htmlPath);

  return {
    htmlPath,
    cssPath: pickCompanionFile(
      files,
      directory,
      "css",
      ["local.css", "style.css", "styles.css", "index.css"],
      activeFile,
    ),
    jsPath: pickCompanionFile(
      files,
      directory,
      "js",
      ["local.js", "script.js", "index.js", "main.js", "app.js"],
      activeFile,
    ),
  };
};

const readFileText = (files: FileMap, path: string | null) => {
  if (!path) return "";
  const entry = files[path];
  if (!entry || !isTextContent(entry.content)) return "";
  return entry.content;
};

const buildAssistantText = (response: AgentRunResponse) => {
  const explanation = response.explanation?.trim();
  const shouldShowActionSummary =
    response.actions.length > 0 || response.mode === "modify" || response.mode === "both";
  const actionSummary = shouldShowActionSummary
    ? `Actions: ${response.actions.length}`
    : "";
  if (explanation && actionSummary) {
    return `${explanation}\n\n${actionSummary}`;
  }
  if (explanation) {
    return explanation;
  }
  if (actionSummary) {
    return actionSummary;
  }
  return actionSummary;
};

export const useAiAssistant = ({
  activeFile,
  files,
  projectPath,
  selectedPreviewHtml,
  previewSelectedElement,
  previewSelectedComputedStyles,
  previewSelectedMatchedCssRules,
  setCodeDraftByPath,
  setCodeDirtyPathSet,
  setIsCodePanelOpen,
  setActiveFileStable,
}: UseAiAssistantOptions) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiAssistantMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("default");
  const [modelStatus, setModelStatus] = useState<SidecarModelStatus | null>(null);
  const [progress, setProgress] = useState<SidecarProgressEvent | null>(null);
  const activeRunRef = useRef<ReturnType<typeof startAgentRun> | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);

  const slideTargets = useMemo(
    () => deriveSlideTargets(files, activeFile, selectedPreviewHtml),
    [activeFile, files, selectedPreviewHtml],
  );

  const selectedElementPayload = useMemo(() => {
    if (!previewSelectedElement) return null;
    return {
      ...previewSelectedElement,
      computedStyles: previewSelectedComputedStyles ?? {},
      matchedCssRules: previewSelectedMatchedCssRules,
    };
  }, [
    previewSelectedComputedStyles,
    previewSelectedElement,
    previewSelectedMatchedCssRules,
  ]);

  useEffect(() => {
    if (!AI_ASSISTANT_ENABLED) {
      setModelStatus({
        modelId: "embedded-ai",
        modelPath: "",
        quant: "",
        progress: null,
        state: "engine_unavailable",
        message: "AI assistant is currently turned off.",
      });
      return;
    }

    void ensureSidecarReady().catch((error) => {
      console.warn("[AI Assistant] sidecar health check failed", error);
    });
    void getSidecarModelStatus()
      .then(setModelStatus)
      .catch((error) => {
        console.warn("[AI Assistant] model status fetch failed", error);
      });

    const offModel = subscribeToSidecarModelStatus((nextStatus) => {
      setModelStatus(nextStatus);
      if (!activeRequestIdRef.current && nextStatus.state === "ready") {
        setProgress(null);
      }
    });
    const offProgress = subscribeToSidecarProgress((nextProgress) => {
      const activeRequestId = activeRequestIdRef.current;
      if (!activeRequestId) {
        return;
      }
      if (nextProgress.requestId && nextProgress.requestId !== activeRequestId) {
        return;
      }
      setProgress(nextProgress);
      if (nextProgress.stage === "stream") {
        const activeMessageId = activeAssistantMessageIdRef.current;
        if (!activeMessageId) {
          return;
        }
        setMessages((prev) =>
          prev.map((message) =>
            message.id === activeMessageId
              ? {
                  ...message,
                  text: nextProgress.text ?? message.text,
                  isStreaming: true,
                }
              : message,
          ),
        );
      }
    });

    return () => {
      offModel();
      offProgress();
    };
  }, []);

  const appendMessage = useCallback((message: AiAssistantMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!AI_ASSISTANT_ENABLED) return;
    const userRequest = input.trim();
    if (!userRequest || !projectPath) return;

    appendMessage({
      id: createMessageId(),
      role: "user",
      text: userRequest,
    });
    const assistantMessageId = createMessageId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: "assistant",
        text: "",
        isStreaming: true,
      },
    ]);
    setInput("");
    setIsOpen(true);
    setIsSubmitting(true);
    setProgress(null);

    const run = startAgentRun({
      activeFile,
      assistantMode,
      captureCdp: true,
      cdpContext: selectedElementPayload,
      currentSlide: {
        html: readFileText(files, slideTargets.htmlPath),
        css: readFileText(files, slideTargets.cssPath),
        js: readFileText(files, slideTargets.jsPath),
      },
      selectedElement: selectedElementPayload,
      selectedSelector: ".__nx-preview-selected",
      userRequest,
    });

    activeRunRef.current = run;
    activeRequestIdRef.current = run.requestId;
    activeAssistantMessageIdRef.current = assistantMessageId;

    try {
      const response = await run.result;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                isStreaming: false,
                response,
                text: buildAssistantText(response),
              }
            : message,
        ),
      );
    } catch (error) {
      setMessages((prev) =>
        prev.filter((message) => message.id !== assistantMessageId || message.text.trim().length > 0),
      );
      appendMessage({
        id: createMessageId(),
        role: "system",
        text:
          error instanceof Error
            ? error.message
            : "AI request failed unexpectedly.",
      });
    } finally {
      activeRunRef.current = null;
      activeRequestIdRef.current = null;
      activeAssistantMessageIdRef.current = null;
      setProgress(null);
      setIsSubmitting(false);
    }
  }, [
    activeFile,
    assistantMode,
    appendMessage,
    files,
    input,
    projectPath,
    selectedElementPayload,
    slideTargets.cssPath,
    slideTargets.htmlPath,
    slideTargets.jsPath,
  ]);

  const handleCancel = useCallback(async () => {
    if (!AI_ASSISTANT_ENABLED) return;
    const activeRun = activeRunRef.current;
    if (!activeRun) return;
    try {
      await activeRun.cancel();
      appendMessage({
        id: createMessageId(),
        role: "system",
        text: "AI request cancelled.",
      });
    } catch (error) {
      appendMessage({
        id: createMessageId(),
        role: "system",
        text:
          error instanceof Error
            ? error.message
            : "Failed to cancel AI request.",
      });
    } finally {
      activeRunRef.current = null;
      activeRequestIdRef.current = null;
      activeAssistantMessageIdRef.current = null;
      setProgress(null);
      setIsSubmitting(false);
    }
  }, [appendMessage]);

  const stageResponse = useCallback(
    (messageId: string, response: AgentRunResponse) => {
      const updates = [
        {
          path: slideTargets.htmlPath,
          value: response.updated_code.html?.trim(),
        },
        {
          path: slideTargets.cssPath,
          value: response.updated_code.css?.trim(),
        },
        {
          path: slideTargets.jsPath,
          value: response.updated_code.js?.trim(),
        },
      ].filter(
        (entry): entry is { path: string; value: string } =>
          Boolean(entry.path && typeof entry.value === "string" && entry.value.length > 0),
      );

      if (!updates.length) return;

      setCodeDraftByPath((prev) => {
        const next = { ...prev };
        for (const update of updates) {
          next[update.path] = update.value;
        }
        return next;
      });

      setCodeDirtyPathSet((prev) => {
        const next = { ...prev };
        for (const update of updates) {
          next[update.path] = true;
        }
        return next;
      });

      setIsCodePanelOpen(true);
      setActiveFileStable(slideTargets.htmlPath ?? updates[0]?.path ?? null);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, staged: true } : message,
        ),
      );
    },
    [
      setActiveFileStable,
      setCodeDraftByPath,
      setCodeDirtyPathSet,
      setIsCodePanelOpen,
      slideTargets.cssPath,
      slideTargets.htmlPath,
      slideTargets.jsPath,
    ],
  );

  return {
    currentSlideLabel: slideTargets.htmlPath ?? activeFile ?? "No active slide",
    hasProject: AI_ASSISTANT_ENABLED && Boolean(projectPath),
    assistantMode,
    input,
    isOpen,
    isSubmitting,
    messages,
    modelStatus,
    progress,
    setInput,
    setIsOpen,
    setAssistantMode,
    stageResponse,
    submitPrompt: handleSubmit,
    cancelPrompt: handleCancel,
  };
};
