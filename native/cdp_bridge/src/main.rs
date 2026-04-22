mod ai;
mod cdp;
mod ipc;
mod logging;

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashSet;
use std::env;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::ai::AiRuntime;
use crate::cdp::inspect_selected_element;
use crate::ipc::{
    parse_incoming_request, parse_wire_message, AiResponse, CancelResponse, ExtensionBootstrap,
    IncomingRequest, ModelState, ModelStatusSnapshot, NativeMethodCall, SidecarEmitter,
    SidecarHealthResponse, SidecarMethod, DEFAULT_CDP_PORT,
};
use crate::logging::log_line;

const AI_FEATURE_ENABLED: bool = false;

#[derive(Clone)]
struct AppState {
    ai: AiRuntime,
    cancelled_requests: Arc<Mutex<HashSet<String>>>,
    default_cdp_port: u16,
    emitter: SidecarEmitter,
    extension_id: String,
}

impl AppState {
    async fn current_health(&self) -> SidecarHealthResponse {
        SidecarHealthResponse {
            ai: self.current_ai_status().await,
            cdp_port: self.default_cdp_port,
            extension_id: self.extension_id.clone(),
            ok: true,
        }
    }

    async fn current_ai_status(&self) -> ModelStatusSnapshot {
        let mut status = self.ai.current_status().await;
        if !AI_FEATURE_ENABLED {
            status.state = ModelState::EngineUnavailable;
            status.progress = None;
            status.message = "AI feature is currently disabled.".to_string();
        }
        status
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    log_line("sidecar startup");
    let extension_id = "js.neutralino.nocodex.sidecar".to_string();
    let cdp_port = parse_arg_u16("--cdp-port", DEFAULT_CDP_PORT);
    log_line(format!("parsed cdp port: {cdp_port}"));
    let bootstrap = ExtensionBootstrap::from_stdin()?;
    log_line(format!(
        "bootstrap parsed: port={}, extension_id={extension_id}",
        bootstrap.nl_port
    ));
    let websocket_url = bootstrap.websocket_url(&extension_id);
    log_line(format!("connecting websocket: {websocket_url}"));

    let (socket, _) = connect_async(&websocket_url)
        .await
        .with_context(|| format!("failed to connect extension websocket at {websocket_url}"))?;
    log_line("websocket connected");
    let (mut write, mut read) = socket.split();
    let (outbound_tx, mut outbound_rx) = mpsc::unbounded_channel::<NativeMethodCall>();
    let emitter = SidecarEmitter::new(bootstrap.nl_token.clone(), outbound_tx);

    let state = AppState {
        ai: AiRuntime::new(),
        cancelled_requests: Arc::new(Mutex::new(HashSet::new())),
        default_cdp_port: cdp_port,
        emitter: emitter.clone(),
        extension_id,
    };

    let writer_task = tokio::spawn(async move {
        while let Some(call) = outbound_rx.recv().await {
            let payload =
                serde_json::to_string(&call).context("failed to serialize outbound event")?;
            write
                .send(Message::Text(payload))
                .await
                .context("failed to send outbound event over Neutralino websocket")?;
        }
        Ok::<(), anyhow::Error>(())
    });

    if AI_FEATURE_ENABLED {
        log_line("starting background warmup");
        let warmup_state = state.clone();
        tokio::spawn(async move {
            if let Err(error) = warmup_state.ai.warmup(&warmup_state.emitter).await {
                log_line(format!("background warmup failed: {error:#}"));
            } else {
                log_line("warmup finished");
            }
        });
    } else {
        log_line("AI feature disabled; skipping warmup");
    }

    while let Some(message) = read.next().await {
        let message = message.context("failed to read message from Neutralino websocket")?;
        match message {
            Message::Text(text) => {
                let wire = parse_wire_message(&text)?;
                let Some(request) = parse_incoming_request(&wire)? else {
                    continue;
                };
                let state = state.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_request(request, state.clone()).await {
                        log_line(format!("request handler error: {error:#}"));
                        eprintln!("{error:#}");
                    }
                });
            }
            Message::Binary(binary) => {
                let text = String::from_utf8(binary.to_vec())
                    .context("failed to decode binary websocket payload as UTF-8")?;
                let wire = parse_wire_message(&text)?;
                let Some(request) = parse_incoming_request(&wire)? else {
                    continue;
                };
                let state = state.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_request(request, state.clone()).await {
                        log_line(format!("request handler error: {error:#}"));
                        eprintln!("{error:#}");
                    }
                });
            }
            Message::Close(_) => {
                log_line("websocket closed");
                break;
            }
            _ => {}
        }
    }

    log_line("sidecar shutting down");
    writer_task.abort();
    Ok(())
}

async fn handle_request(request: IncomingRequest, state: AppState) -> Result<()> {
    match request {
        IncomingRequest::SidecarHealth(request) => {
            log_line(format!("handling {}", SidecarMethod::SidecarHealth.as_str()));
            let payload = state.current_health().await;
            state.emitter.broadcast_result(
                &request.request_id,
                SidecarMethod::SidecarHealth,
                &payload,
            )?;
        }
        IncomingRequest::ModelStatus(request) => {
            log_line(format!("handling {}", SidecarMethod::ModelStatus.as_str()));
            let payload: ModelStatusSnapshot = state.current_ai_status().await;
            state.emitter.broadcast_result(
                &request.request_id,
                SidecarMethod::ModelStatus,
                &payload,
            )?;
        }
        IncomingRequest::CdpInspectSelected(request) => {
            log_line(format!("handling {}", SidecarMethod::CdpInspectSelected.as_str()));
            match inspect_selected_element(&request).await {
                Ok(payload) => state.emitter.broadcast_result(
                    &request.request_id,
                    SidecarMethod::CdpInspectSelected,
                    &payload,
                )?,
                Err(error) => state.emitter.broadcast_error(
                    &request.request_id,
                    SidecarMethod::CdpInspectSelected,
                    error,
                )?,
            }
        }
        IncomingRequest::AgentCancel(request) => {
            log_line(format!("handling {}", SidecarMethod::AgentCancel.as_str()));
            state
                .cancelled_requests
                .lock()
                .await
                .insert(request.target_request_id.clone());
            let payload = CancelResponse {
                cancelled: true,
                target_request_id: request.target_request_id,
            };
            state.emitter.broadcast_result(
                &request.request_id,
                SidecarMethod::AgentCancel,
                &payload,
            )?;
        }
        IncomingRequest::AgentRun(request) => {
            log_line(format!("handling {}", SidecarMethod::AgentRun.as_str()));
            if !AI_FEATURE_ENABLED {
                state.emitter.broadcast_error(
                    &request.request_id,
                    SidecarMethod::AgentRun,
                    "AI feature is currently disabled.",
                )?;
                return Ok(());
            }
            if is_cancelled(&state, &request.request_id).await {
                state.emitter.broadcast_error(
                    &request.request_id,
                    SidecarMethod::AgentRun,
                    "AI request was cancelled before execution started.",
                )?;
                return Ok(());
            }

            let result: Result<AiResponse> = state.ai.run_agent(&request, &state.emitter).await;

            if is_cancelled(&state, &request.request_id).await {
                state.emitter.broadcast_error(
                    &request.request_id,
                    SidecarMethod::AgentRun,
                    "AI request was cancelled.",
                )?;
                clear_cancellation(&state, &request.request_id).await;
                return Ok(());
            }

            match result {
                Ok(payload) => {
                    state.emitter.broadcast_result(
                        &request.request_id,
                        SidecarMethod::AgentRun,
                        &payload,
                    )?;
                }
                Err(error) => {
                    state.emitter.broadcast_error(
                        &request.request_id,
                        SidecarMethod::AgentRun,
                        error,
                    )?;
                }
            }

            clear_cancellation(&state, &request.request_id).await;
        }
    }

    Ok(())
}

async fn clear_cancellation(state: &AppState, request_id: &str) {
    state.cancelled_requests.lock().await.remove(request_id);
}

async fn is_cancelled(state: &AppState, request_id: &str) -> bool {
    state.cancelled_requests.lock().await.contains(request_id)
}

fn parse_arg_u16(flag: &str, default: u16) -> u16 {
    let args: Vec<String> = env::args().collect();
    args.windows(2)
        .find(|window| window[0] == flag)
        .and_then(|window| window[1].parse::<u16>().ok())
        .unwrap_or(default)
}
