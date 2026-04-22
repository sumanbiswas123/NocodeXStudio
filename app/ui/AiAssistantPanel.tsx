import React from "react";
import { Bot, LoaderCircle, SendHorizonal, Sparkles, X } from "lucide-react";
import type {
  AgentRunResponse,
  AssistantMode,
  SidecarModelStatus,
  SidecarProgressEvent,
} from "../runtime/sidecarClient";
import type { AiAssistantMessage } from "../hooks/workflow/useAiAssistant";

type AiAssistantPanelProps = {
  assistantMode: AssistantMode;
  currentSlideLabel: string;
  hasProject: boolean;
  input: string;
  isOpen: boolean;
  isSubmitting: boolean;
  messages: AiAssistantMessage[];
  modelStatus: SidecarModelStatus | null;
  progress: SidecarProgressEvent | null;
  setAssistantMode: React.Dispatch<React.SetStateAction<AssistantMode>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stageResponse: (messageId: string, response: AgentRunResponse) => void;
  submitPrompt: () => Promise<void>;
  cancelPrompt: () => Promise<void>;
  theme: "light" | "dark";
};

const statusLabel = (status: SidecarModelStatus | null) => {
  if (!status) return "Checking model status";
  switch (status.state) {
    case "downloading":
      return "Downloading model";
    case "model_missing":
      return "Model not installed";
    case "starting":
      return "Loading embedded Gemma";
    case "ready":
      return "Gemma ready";
    case "engine_unavailable":
      return "Engine unavailable";
    case "error":
      return "AI error";
    default:
      return "AI status";
  }
};

const formatProgress = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `${Math.round(value * 100)}%`;
};

const MODE_OPTIONS: Array<{
  description: string;
  label: string;
  value: AssistantMode;
}> = [
  {
    value: "default",
    label: "Default",
    description: "Auto-detect intent and send only the context Gemma actually needs.",
  },
  {
    value: "edit",
    label: "Edit",
    description: "Editing-focused mode with grounded slide and selected-element context.",
  },
  {
    value: "qa",
    label: "Q&A",
    description: "Chat-style answers with lightweight context instead of edit-heavy grounding.",
  },
];

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  assistantMode,
  currentSlideLabel,
  hasProject,
  input,
  isOpen,
  isSubmitting,
  messages,
  modelStatus,
  progress,
  setAssistantMode,
  setInput,
  setIsOpen,
  stageResponse,
  submitPrompt,
  cancelPrompt,
  theme,
}) => {
  const isRequestRunning = Boolean(isSubmitting && progress);
  const activeProgress = isRequestRunning ? progress?.progress : modelStatus?.progress;
  const progressLabel = formatProgress(activeProgress);
  const statusText = isRequestRunning
    ? progress?.detail || "Running your request with the embedded model."
    : modelStatus?.message || "Preparing the embedded model runtime.";
  const badgeText = isRequestRunning ? "Processing request" : statusLabel(modelStatus);

  return (
    <>
      <div className={`assistant-launcher ${isOpen ? "assistant-launcher--hidden" : ""}`}>
        <button
          type="button"
          className="assistant-launcher-button"
          onClick={() => setIsOpen(true)}
          title="Open AI assistant"
        >
          <Sparkles size={18} />
          <span>AI</span>
        </button>
      </div>

      {isOpen ? (
        <div
          className="assistant-panel"
          style={{
            background:
              theme === "dark"
                ? "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(2,6,23,0.96) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.97) 100%)",
            borderColor:
              theme === "dark"
                ? "rgba(148,163,184,0.28)"
                : "rgba(15,23,42,0.12)",
            boxShadow:
              theme === "dark"
                ? "0 24px 70px rgba(2,6,23,0.55)"
                : "0 24px 70px rgba(15,23,42,0.18)",
          }}
        >
          <div className="assistant-panel-header">
            <div className="assistant-panel-titleWrap">
              <div className="assistant-panel-icon">
                <Bot size={16} />
              </div>
              <div>
                <div className="assistant-panel-title">AI Assistant</div>
                <div className="assistant-panel-subtitle">{currentSlideLabel}</div>
              </div>
            </div>
            <button
              type="button"
              className="assistant-panel-close"
              onClick={() => setIsOpen(false)}
              title="Close AI assistant"
            >
              <X size={16} />
            </button>
          </div>

          <div className="assistant-statusCard">
            <div className="assistant-statusRow">
              <span className="assistant-statusBadge">{badgeText}</span>
              {progressLabel ? <span className="assistant-statusPercent">{progressLabel}</span> : null}
            </div>
            <div className="assistant-statusText">{statusText}</div>
            {typeof activeProgress === "number" ? (
              <div className="assistant-progressTrack">
                <div
                  className="assistant-progressFill"
                  style={{ width: `${Math.max(2, Math.min(100, (activeProgress ?? 0) * 100))}%` }}
                />
              </div>
            ) : null}
          </div>

          <div className="assistant-modePicker" role="tablist" aria-label="Assistant mode">
            {MODE_OPTIONS.map((option) => {
              const isActive = assistantMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`assistant-modeButton ${isActive ? "assistant-modeButton--active" : ""}`}
                  onClick={() => setAssistantMode(option.value)}
                  title={option.description}
                >
                  <span className="assistant-modeButtonLabel">{option.label}</span>
                  <span className="assistant-modeButtonHint">{option.description}</span>
                </button>
              );
            })}
          </div>

          <div className="assistant-messages">
            {messages.length === 0 ? (
              <div className="assistant-emptyState">
                <div className="assistant-emptyTitle">Ask about the current slide</div>
                <div className="assistant-emptyText">
                  Try “Why is this not centered?”, “Fix the spacing”, or “Make this slide modern”.
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`assistant-message assistant-message--${message.role}`}
                >
                  <div className="assistant-messageRole">
                    {message.role === "user"
                      ? "You"
                      : message.role === "assistant"
                        ? "Gemma"
                        : "System"}
                  </div>
                  <div className="assistant-messageText">{message.text}</div>
                  {message.response ? (
                    <div className="assistant-messageMeta">
                      <span className="assistant-messageMode">{message.response.mode}</span>
                      {message.response.actions.length > 0 ? (
                        <span>{message.response.actions.length} action(s)</span>
                      ) : null}
                      {(message.response.mode === "modify" ||
                        message.response.mode === "both") && (
                        <button
                          type="button"
                          className="assistant-stageButton"
                          disabled={message.staged}
                          onClick={() => stageResponse(message.id, message.response!)}
                        >
                          {message.staged ? "Staged in editor" : "Stage changes"}
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="assistant-composer">
            <textarea
              className="assistant-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                hasProject
                  ? "Ask Gemma about the current slide or selected element..."
                  : "Open a project to use the AI assistant."
              }
              disabled={!hasProject || isSubmitting}
              rows={4}
            />
            <div className="assistant-composerActions">
              {isSubmitting ? (
                <button
                  type="button"
                  className="assistant-secondaryButton"
                  onClick={() => {
                    void cancelPrompt();
                  }}
                >
                  <LoaderCircle size={14} className="assistant-spin" />
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                className="assistant-primaryButton"
                disabled={!hasProject || !input.trim() || isSubmitting}
                onClick={() => {
                  void submitPrompt();
                }}
              >
                <SendHorizonal size={14} />
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default AiAssistantPanel;
