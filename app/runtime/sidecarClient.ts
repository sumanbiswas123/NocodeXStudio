import * as Neutralino from "@neutralinojs/lib";
import type { CdpInspectSelectedResponse } from "../helpers/previewCssHelpers";

const SIDECAR_EXTENSION_ID = "js.neutralino.nocodex.sidecar";
const SIDECAR_RESULT_EVENT = "sidecar:result";
const SIDECAR_ERROR_EVENT = "sidecar:error";
const SIDECAR_PROGRESS_EVENT = "sidecar:progress";
const SIDECAR_MODEL_STATUS_EVENT = "sidecar:model_status";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
const CONNECT_POLL_INTERVAL_MS = 250;

type PendingRequest = {
  method: SidecarMethod;
  reject: (reason?: unknown) => void;
  resolve: (value: unknown) => void;
  timeoutMs: number;
  timeoutId: number;
};

type SidecarResultEnvelope = {
  method?: SidecarMethod;
  payload?: unknown;
  requestId?: string;
};

type SidecarErrorEnvelope = {
  error?: string;
  method?: SidecarMethod;
  requestId?: string;
};

export type SidecarMethod =
  | "sidecar.health"
  | "model.status"
  | "cdp.inspect_selected"
  | "agent.run"
  | "agent.cancel";

export type SidecarModelState =
  | "starting"
  | "model_missing"
  | "downloading"
  | "ready"
  | "engine_unavailable"
  | "error";

export type SidecarModelStatus = {
  downloadUrl?: string;
  expectedSizeLabel?: string;
  message?: string;
  modelId: string;
  modelPath: string;
  progress?: number | null;
  quant: string;
  state: SidecarModelState;
};

export type SidecarHealthResponse = {
  ai: SidecarModelStatus;
  cdpPort: number;
  extensionId: string;
  ok: boolean;
};

export type SidecarProgressEvent = {
  detail?: string;
  method?: SidecarMethod;
  progress?: number | null;
  requestId?: string;
  stage?: string;
  text?: string;
  textDelta?: string;
};

export type AgentRunOptions = {
  maxTokens?: number;
  stream?: boolean;
  temperature?: number;
  topP?: number;
};

export type AssistantMode = "default" | "edit" | "qa";

export type AgentRunRequest = {
  activeFile?: string | null;
  assistantMode?: AssistantMode;
  captureCdp?: boolean;
  cdpContext?: Record<string, unknown> | null;
  currentSlide: {
    css?: string | null;
    html?: string | null;
    js?: string | null;
  };
  iframeTitle?: string | null;
  options?: AgentRunOptions;
  selectedElement?: Record<string, unknown> | null;
  selectedSelector?: string | null;
  targetUrlContains?: string | null;
  userRequest: string;
};

export type AgentMode = "explain" | "modify" | "both";

export type AgentChange = {
  after: string;
  before: string;
  type: "css" | "html" | "js" | "text";
};

export type AgentAction = {
  action: "modify" | "add" | "delete";
  changes: AgentChange[];
  target: string;
};

export type AgentRunResponse = {
  actions: AgentAction[];
  explanation: string;
  mode: AgentMode;
  updated_code: {
    css: string;
    html: string;
    js: string;
  };
};

export type AgentRunHandle = {
  cancel: () => Promise<void>;
  requestId: string;
  result: Promise<AgentRunResponse>;
};

const pendingRequests = new Map<string, PendingRequest>();
const modelStatusSubscribers = new Set<(status: SidecarModelStatus) => void>();
const progressSubscribers = new Set<(progress: SidecarProgressEvent) => void>();

let listenersReady = false;
let listenersReadyPromise: Promise<void> | null = null;

const readEventDetail = <T>(event: CustomEvent): T => {
  const detail = (event as CustomEvent<T>).detail;
  return (detail ?? {}) as T;
};

const createRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sidecar-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const clearPendingRequest = (requestId: string) => {
  const pending = pendingRequests.get(requestId);
  if (!pending) return;
  window.clearTimeout(pending.timeoutId);
  pendingRequests.delete(requestId);
};

const handleResultEvent = (event: CustomEvent) => {
  const detail = readEventDetail<SidecarResultEnvelope>(event);
  const requestId = String(detail.requestId || "").trim();
  if (!requestId) return;
  const pending = pendingRequests.get(requestId);
  if (!pending) return;
  clearPendingRequest(requestId);
  pending.resolve(detail.payload);
};

const handleErrorEvent = (event: CustomEvent) => {
  const detail = readEventDetail<SidecarErrorEnvelope>(event);
  const requestId = String(detail.requestId || "").trim();
  const message = String(detail.error || "Sidecar request failed.");
  if (!requestId) return;
  const pending = pendingRequests.get(requestId);
  if (!pending) return;
  clearPendingRequest(requestId);
  pending.reject(new Error(message));
};

const handleModelStatusEvent = (event: CustomEvent) => {
  const detail = readEventDetail<SidecarModelStatus>(event);
  modelStatusSubscribers.forEach((listener) => {
    try {
      listener(detail);
    } catch (error) {
      console.error("[Sidecar] model status listener failed", error);
    }
  });
};

const handleProgressEvent = (event: CustomEvent) => {
  const detail = readEventDetail<SidecarProgressEvent>(event);
  const requestId = String(detail.requestId || "").trim();
  if (requestId) {
    const pending = pendingRequests.get(requestId);
    if (pending && pending.method === "agent.run") {
      window.clearTimeout(pending.timeoutId);
      pending.timeoutId = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        pending.reject(new Error(`Timed out waiting for ${pending.method}.`));
      }, pending.timeoutMs);
    }
  }
  progressSubscribers.forEach((listener) => {
    try {
      listener(detail);
    } catch (error) {
      console.error("[Sidecar] progress listener failed", error);
    }
  });
};

const ensureSidecarListeners = async () => {
  if (listenersReady) return;
  if (!listenersReadyPromise) {
    listenersReadyPromise = (async () => {
      await Neutralino.events.on(
        SIDECAR_RESULT_EVENT,
        handleResultEvent as EventListener,
      );
      await Neutralino.events.on(
        SIDECAR_ERROR_EVENT,
        handleErrorEvent as EventListener,
      );
      await Neutralino.events.on(
        SIDECAR_MODEL_STATUS_EVENT,
        handleModelStatusEvent as EventListener,
      );
      await Neutralino.events.on(
        SIDECAR_PROGRESS_EVENT,
        handleProgressEvent as EventListener,
      );
      listenersReady = true;
    })();
  }
  await listenersReadyPromise;
};

const waitForSidecarConnection = async (timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const stats = await Neutralino.extensions.getStats();
    if (
      stats.loaded?.includes(SIDECAR_EXTENSION_ID) &&
      stats.connected?.includes(SIDECAR_EXTENSION_ID)
    ) {
      return;
    }
    await new Promise((resolve) =>
      window.setTimeout(resolve, CONNECT_POLL_INTERVAL_MS),
    );
  }

  throw new Error(
    `Sidecar extension did not connect within ${Math.round(timeoutMs / 1000)}s.`,
  );
};

const dispatchSidecarRequest = async <T>(
  method: SidecarMethod,
  requestId: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> => {
  await ensureSidecarListeners();
  await waitForSidecarConnection();

  const resultPromise = new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Timed out waiting for ${method}.`));
    }, timeoutMs);

    pendingRequests.set(requestId, {
      method,
      reject,
      resolve: (value) => resolve(value as T),
      timeoutMs,
      timeoutId,
    });
  });

  try {
    await Neutralino.extensions.dispatch(SIDECAR_EXTENSION_ID, method, {
      requestId,
      ...payload,
    });
  } catch (error) {
    clearPendingRequest(requestId);
    throw error;
  }

  return resultPromise;
};

export const subscribeToSidecarModelStatus = (
  listener: (status: SidecarModelStatus) => void,
) => {
  modelStatusSubscribers.add(listener);
  return () => {
    modelStatusSubscribers.delete(listener);
  };
};

export const subscribeToSidecarProgress = (
  listener: (progress: SidecarProgressEvent) => void,
) => {
  progressSubscribers.add(listener);
  return () => {
    progressSubscribers.delete(listener);
  };
};

export const ensureSidecarReady = async () =>
  dispatchSidecarRequest<SidecarHealthResponse>(
    "sidecar.health",
    createRequestId(),
    {},
    DEFAULT_TIMEOUT_MS,
  );

export const getSidecarModelStatus = async () =>
  dispatchSidecarRequest<SidecarModelStatus>(
    "model.status",
    createRequestId(),
    {},
    DEFAULT_TIMEOUT_MS,
  );

export const inspectSelectedViaSidecar = async (
  payload: {
    cdp_port?: number;
    iframe_title?: string;
    selected_selector?: string;
    target_url_contains?: string;
  },
) =>
  dispatchSidecarRequest<CdpInspectSelectedResponse>(
    "cdp.inspect_selected",
    createRequestId(),
    payload,
    DEFAULT_TIMEOUT_MS,
  );

export const startAgentRun = (payload: AgentRunRequest): AgentRunHandle => {
  const requestId = createRequestId();
  return {
    requestId,
    result: dispatchSidecarRequest<AgentRunResponse>(
      "agent.run",
      requestId,
      payload as Record<string, unknown>,
      DEFAULT_AGENT_TIMEOUT_MS,
    ),
    cancel: async () => {
      await dispatchSidecarRequest<{ cancelled: boolean; targetRequestId: string }>(
        "agent.cancel",
        createRequestId(),
        { targetRequestId: requestId },
        DEFAULT_TIMEOUT_MS,
      );
    },
  };
};
