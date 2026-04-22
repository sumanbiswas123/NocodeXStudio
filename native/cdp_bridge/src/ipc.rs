use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Read;
use tokio::sync::mpsc::UnboundedSender;
use uuid::Uuid;

pub const SIDECAR_RESULT_EVENT: &str = "sidecar:result";
pub const SIDECAR_ERROR_EVENT: &str = "sidecar:error";
pub const SIDECAR_PROGRESS_EVENT: &str = "sidecar:progress";
pub const SIDECAR_MODEL_STATUS_EVENT: &str = "sidecar:model_status";
pub const DEFAULT_CDP_PORT: u16 = 9222;
pub const DEFAULT_IFRAME_TITLE: &str = "project-preview";
pub const DEFAULT_SELECTED_SELECTOR: &str = ".__nx-preview-selected";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarMethod {
    AgentCancel,
    AgentRun,
    CdpInspectSelected,
    ModelStatus,
    SidecarHealth,
}

impl SidecarMethod {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AgentCancel => "agent.cancel",
            Self::AgentRun => "agent.run",
            Self::CdpInspectSelected => "cdp.inspect_selected",
            Self::ModelStatus => "model.status",
            Self::SidecarHealth => "sidecar.health",
        }
    }

    pub fn from_event(value: &str) -> Option<Self> {
        match value {
            "agent.cancel" => Some(Self::AgentCancel),
            "agent.run" => Some(Self::AgentRun),
            "cdp.inspect_selected" => Some(Self::CdpInspectSelected),
            "model.status" => Some(Self::ModelStatus),
            "sidecar.health" => Some(Self::SidecarHealth),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExtensionBootstrap {
    #[serde(rename = "nlConnectToken")]
    pub nl_connect_token: String,
    #[serde(rename = "nlPort")]
    #[serde(deserialize_with = "deserialize_port")]
    pub nl_port: u16,
    #[serde(rename = "nlToken")]
    pub nl_token: String,
}

impl ExtensionBootstrap {
    pub fn from_stdin() -> Result<Self> {
        let raw = read_first_json_object(std::io::stdin())
            .context("failed to read Neutralino extension bootstrap from stdin")?;
        serde_json::from_str(&raw).context("failed to parse Neutralino extension bootstrap JSON")
    }

    pub fn websocket_url(&self, extension_id: &str) -> String {
        format!(
            "ws://127.0.0.1:{}?extensionId={}&connectToken={}",
            self.nl_port, extension_id, self.nl_connect_token
        )
    }
}

fn deserialize_port<'de, D>(deserializer: D) -> std::result::Result<u16, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum PortValue {
        Number(u16),
        String(String),
    }

    match PortValue::deserialize(deserializer)? {
        PortValue::Number(value) => Ok(value),
        PortValue::String(value) => value.parse::<u16>().map_err(serde::de::Error::custom),
    }
}

fn read_first_json_object(mut reader: impl Read) -> Result<String> {
    let mut buffer = Vec::new();
    let mut byte = [0u8; 1];
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escape = false;
    let mut started = false;

    loop {
        let read = reader.read(&mut byte)?;
        if read == 0 {
            break;
        }

        let ch = byte[0] as char;
        if !started {
            if ch.is_whitespace() {
                continue;
            }
            if ch != '{' {
                continue;
            }
            started = true;
            depth = 1;
            buffer.push(byte[0]);
            continue;
        }

        buffer.push(byte[0]);

        if in_string {
            if escape {
                escape = false;
                continue;
            }
            match ch {
                '\\' => escape = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    break;
                }
            }
            _ => {}
        }
    }

    if buffer.is_empty() {
        anyhow::bail!("stdin did not contain a bootstrap JSON object");
    }

    String::from_utf8(buffer).context("bootstrap stdin was not valid UTF-8")
}

#[derive(Debug, Clone, Deserialize)]
pub struct WireMessage {
    pub event: Option<String>,
    #[serde(default)]
    pub data: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct NativeMethodCall {
    pub id: String,
    pub method: &'static str,
    #[serde(rename = "accessToken")]
    pub access_token: String,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelState {
    Downloading,
    EngineUnavailable,
    Error,
    ModelMissing,
    Ready,
    Starting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatusSnapshot {
    pub download_url: String,
    pub expected_size_label: String,
    pub message: String,
    pub model_id: String,
    pub model_path: String,
    pub progress: Option<f32>,
    pub quant: String,
    pub state: ModelState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarHealthResponse {
    pub ai: ModelStatusSnapshot,
    pub cdp_port: u16,
    pub extension_id: String,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelResponse {
    pub cancelled: bool,
    pub target_request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentRunOptions {
    pub max_tokens: Option<u32>,
    pub stream: Option<bool>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CurrentSlide {
    #[serde(default)]
    pub css: String,
    #[serde(default)]
    pub html: String,
    #[serde(default)]
    pub js: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiMode {
    Both,
    Explain,
    Modify,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AssistantMode {
    #[default]
    Default,
    Edit,
    Qa,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChange {
    pub after: String,
    pub before: String,
    #[serde(rename = "type")]
    pub change_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiAction {
    pub action: String,
    #[serde(default)]
    pub changes: Vec<AiChange>,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatedCode {
    pub css: String,
    pub html: String,
    pub js: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    #[serde(default)]
    pub actions: Vec<AiAction>,
    #[serde(default)]
    pub explanation: String,
    pub mode: AiMode,
    pub updated_code: UpdatedCode,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BasicRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentCancelRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(rename = "targetRequestId")]
    pub target_request_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CdpInspectSelectedRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(rename = "cdpPort", alias = "cdp_port")]
    pub cdp_port: Option<u16>,
    #[serde(rename = "iframeTitle", alias = "iframe_title")]
    pub iframe_title: Option<String>,
    #[serde(rename = "selectedSelector", alias = "selected_selector")]
    pub selected_selector: Option<String>,
    #[serde(rename = "targetUrlContains", alias = "target_url_contains")]
    pub target_url_contains: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentRunRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(rename = "activeFile", alias = "active_file")]
    pub active_file: Option<String>,
    #[serde(rename = "captureCdp", alias = "capture_cdp")]
    pub capture_cdp: Option<bool>,
    #[serde(rename = "cdpContext", alias = "cdp_context")]
    pub cdp_context: Option<Value>,
    #[serde(rename = "currentSlide", alias = "current_slide")]
    pub current_slide: CurrentSlide,
    #[serde(rename = "iframeTitle", alias = "iframe_title")]
    pub iframe_title: Option<String>,
    pub options: Option<AgentRunOptions>,
    #[serde(rename = "assistantMode", alias = "assistant_mode")]
    pub assistant_mode: Option<AssistantMode>,
    #[serde(rename = "selectedElement", alias = "selected_element")]
    pub selected_element: Option<Value>,
    #[serde(rename = "selectedSelector", alias = "selected_selector")]
    pub selected_selector: Option<String>,
    #[serde(rename = "targetUrlContains", alias = "target_url_contains")]
    pub target_url_contains: Option<String>,
    #[serde(rename = "userRequest", alias = "user_request")]
    pub user_request: String,
}

#[derive(Debug, Clone)]
pub enum IncomingRequest {
    AgentCancel(AgentCancelRequest),
    AgentRun(AgentRunRequest),
    CdpInspectSelected(CdpInspectSelectedRequest),
    ModelStatus(BasicRequest),
    SidecarHealth(BasicRequest),
}

#[derive(Clone)]
pub struct SidecarEmitter {
    access_token: String,
    outbound: UnboundedSender<NativeMethodCall>,
}

impl SidecarEmitter {
    pub fn new(access_token: String, outbound: UnboundedSender<NativeMethodCall>) -> Self {
        Self {
            access_token,
            outbound,
        }
    }

    pub fn broadcast_error(
        &self,
        request_id: &str,
        method: SidecarMethod,
        error: impl ToString,
    ) -> Result<()> {
        self.send_app_event(
            SIDECAR_ERROR_EVENT,
            json!({
                "error": error.to_string(),
                "method": method.as_str(),
                "requestId": request_id,
            }),
        )
    }

    pub fn broadcast_model_status(&self, payload: &ModelStatusSnapshot) -> Result<()> {
        self.send_app_event(SIDECAR_MODEL_STATUS_EVENT, serde_json::to_value(payload)?)
    }

    pub fn broadcast_progress(
        &self,
        request_id: &str,
        method: SidecarMethod,
        stage: &str,
        detail: &str,
        progress: Option<f32>,
    ) -> Result<()> {
        self.send_app_event(
            SIDECAR_PROGRESS_EVENT,
            json!({
                "detail": detail,
                "method": method.as_str(),
                "progress": progress,
                "requestId": request_id,
                "stage": stage,
            }),
        )
    }

    pub fn broadcast_text_stream(
        &self,
        request_id: &str,
        method: SidecarMethod,
        text: &str,
        text_delta: &str,
    ) -> Result<()> {
        self.send_app_event(
            SIDECAR_PROGRESS_EVENT,
            json!({
                "detail": "Streaming model output.",
                "method": method.as_str(),
                "progress": Value::Null,
                "requestId": request_id,
                "stage": "stream",
                "text": text,
                "textDelta": text_delta,
            }),
        )
    }

    pub fn broadcast_result<T: Serialize>(
        &self,
        request_id: &str,
        method: SidecarMethod,
        payload: &T,
    ) -> Result<()> {
        self.send_app_event(
            SIDECAR_RESULT_EVENT,
            json!({
                "method": method.as_str(),
                "payload": payload,
                "requestId": request_id,
            }),
        )
    }

    fn send_app_event(&self, event: &str, data: Value) -> Result<()> {
        self.outbound
            .send(NativeMethodCall {
                id: Uuid::new_v4().to_string(),
                method: "app.broadcast",
                access_token: self.access_token.clone(),
                data: json!({
                    "data": data,
                    "event": event,
                }),
            })
            .context("failed to queue outbound Neutralino app event")
    }
}

pub fn parse_wire_message(raw: &str) -> Result<WireMessage> {
    serde_json::from_str(raw).context("failed to parse websocket payload from Neutralino")
}

pub fn parse_incoming_request(wire: &WireMessage) -> Result<Option<IncomingRequest>> {
    let Some(event_name) = wire.event.as_deref() else {
        return Ok(None);
    };
    let Some(method) = SidecarMethod::from_event(event_name) else {
        return Ok(None);
    };

    let request = match method {
        SidecarMethod::AgentCancel => {
            IncomingRequest::AgentCancel(serde_json::from_value(wire.data.clone())?)
        }
        SidecarMethod::AgentRun => {
            IncomingRequest::AgentRun(serde_json::from_value(wire.data.clone())?)
        }
        SidecarMethod::CdpInspectSelected => {
            IncomingRequest::CdpInspectSelected(serde_json::from_value(wire.data.clone())?)
        }
        SidecarMethod::ModelStatus => {
            IncomingRequest::ModelStatus(serde_json::from_value(wire.data.clone())?)
        }
        SidecarMethod::SidecarHealth => {
            IncomingRequest::SidecarHealth(serde_json::from_value(wire.data.clone())?)
        }
    };

    Ok(Some(request))
}

#[cfg(test)]
mod tests {
    use super::ExtensionBootstrap;

    #[test]
    fn bootstrap_parses_numeric_port() {
        let parsed: ExtensionBootstrap = serde_json::from_str(
            r#"{"nlConnectToken":"abc","nlPort":61638,"nlToken":"def"}"#,
        )
        .expect("expected numeric port to parse");

        assert_eq!(parsed.nl_port, 61638);
    }

    #[test]
    fn bootstrap_parses_string_port() {
        let parsed: ExtensionBootstrap = serde_json::from_str(
            r#"{"nlConnectToken":"abc","nlPort":"61638","nlToken":"def"}"#,
        )
        .expect("expected string port to parse");

        assert_eq!(parsed.nl_port, 61638);
    }
}
