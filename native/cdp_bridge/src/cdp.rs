use anyhow::{anyhow, bail, Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use crate::ipc::{
    CdpInspectSelectedRequest, DEFAULT_CDP_PORT, DEFAULT_IFRAME_TITLE, DEFAULT_SELECTED_SELECTOR,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DebugTarget {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub target_type: String,
    pub url: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    pub web_socket_debugger_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DebugTargetSummary {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub target_type: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InspectSelectedResponse {
    pub ok: bool,
    #[serde(rename = "computedStyles")]
    pub computed_styles: Value,
    #[serde(rename = "matchedStyles")]
    pub matched_styles: Value,
    #[serde(rename = "nodeId")]
    pub node_id: i64,
    pub target: DebugTargetSummary,
}

struct CdpClient {
    socket: WebSocketStream<MaybeTlsStream<TcpStream>>,
    next_id: u64,
}

impl CdpClient {
    async fn connect(ws_url: &str) -> Result<Self> {
        let (socket, _) = connect_async(ws_url)
            .await
            .with_context(|| format!("failed to connect to CDP websocket at {ws_url}"))?;
        Ok(Self { socket, next_id: 1 })
    }

    async fn send_command(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id;
        self.next_id += 1;

        self.socket
            .send(Message::Text(
                json!({
                    "id": id,
                    "method": method,
                    "params": params,
                })
                .to_string(),
            ))
            .await
            .with_context(|| format!("failed to send CDP command {method}"))?;

        while let Some(message) = self.socket.next().await {
            let message = message.context("failed to read CDP websocket response")?;
            match message {
                Message::Text(text) => {
                    let parsed: Value =
                        serde_json::from_str(&text).context("failed to parse CDP text payload")?;
                    if parsed.get("id").and_then(Value::as_u64) != Some(id) {
                        continue;
                    }
                    if let Some(error) = parsed.get("error") {
                        bail!("CDP command {method} failed: {error}");
                    }
                    return Ok(parsed.get("result").cloned().unwrap_or(Value::Null));
                }
                Message::Binary(binary) => {
                    let parsed: Value = serde_json::from_slice(&binary)
                        .context("failed to parse binary CDP payload")?;
                    if parsed.get("id").and_then(Value::as_u64) != Some(id) {
                        continue;
                    }
                    if let Some(error) = parsed.get("error") {
                        bail!("CDP command {method} failed: {error}");
                    }
                    return Ok(parsed.get("result").cloned().unwrap_or(Value::Null));
                }
                Message::Close(frame) => {
                    bail!("CDP websocket closed unexpectedly: {frame:?}");
                }
                _ => {}
            }
        }

        bail!("CDP websocket ended before {method} returned");
    }
}

pub async fn inspect_selected_element(
    request: &CdpInspectSelectedRequest,
) -> Result<InspectSelectedResponse> {
    let cdp_port = request.cdp_port.unwrap_or(DEFAULT_CDP_PORT);
    let iframe_title = request
        .iframe_title
        .as_deref()
        .unwrap_or(DEFAULT_IFRAME_TITLE);
    let selected_selector = request
        .selected_selector
        .as_deref()
        .unwrap_or(DEFAULT_SELECTED_SELECTOR);

    let target = choose_target(cdp_port, request.target_url_contains.as_deref()).await?;
    let ws_url = target
        .web_socket_debugger_url
        .clone()
        .ok_or_else(|| anyhow!("selected target does not expose a websocket debugger URL"))?;

    let mut cdp = CdpClient::connect(&ws_url).await?;
    cdp.send_command("DOM.enable", json!({})).await?;
    cdp.send_command("CSS.enable", json!({})).await?;
    cdp.send_command("Runtime.enable", json!({})).await?;

    let document = cdp
        .send_command("DOM.getDocument", json!({ "depth": 1, "pierce": true }))
        .await?;
    let root_node_id = document
        .get("root")
        .and_then(|root| root.get("nodeId"))
        .and_then(Value::as_i64)
        .ok_or_else(|| anyhow!("DOM.getDocument did not return a root nodeId"))?;

    let iframe_selector = format!("iframe[title=\"{}\"]", escape_js_string(iframe_title));
    let iframe_query = cdp
        .send_command(
            "DOM.querySelector",
            json!({
                "nodeId": root_node_id,
                "selector": iframe_selector,
            }),
        )
        .await?;
    let iframe_node_id = iframe_query
        .get("nodeId")
        .and_then(Value::as_i64)
        .unwrap_or(0);

    let node_id = if iframe_node_id > 0 {
        let described = cdp
            .send_command(
                "DOM.describeNode",
                json!({
                    "depth": 1,
                    "nodeId": iframe_node_id,
                    "pierce": true,
                }),
            )
            .await?;
        let content_document_node_id = described
            .get("node")
            .and_then(|node| node.get("contentDocument"))
            .and_then(|content_document| content_document.get("nodeId"))
            .and_then(Value::as_i64)
            .ok_or_else(|| anyhow!("iframe contentDocument was not available through CDP"))?;

        let selected_query = cdp
            .send_command(
                "DOM.querySelector",
                json!({
                    "nodeId": content_document_node_id,
                    "selector": selected_selector,
                }),
            )
            .await?;
        selected_query
            .get("nodeId")
            .and_then(Value::as_i64)
            .ok_or_else(|| anyhow!("selected preview element was not found in iframe document"))?
    } else {
        let selected_query = cdp
            .send_command(
                "DOM.querySelector",
                json!({
                    "nodeId": root_node_id,
                    "selector": selected_selector,
                }),
            )
            .await?;
        selected_query
            .get("nodeId")
            .and_then(Value::as_i64)
            .ok_or_else(|| anyhow!("selected preview element was not found in the page document"))?
    };

    let matched_styles = cdp
        .send_command("CSS.getMatchedStylesForNode", json!({ "nodeId": node_id }))
        .await?;
    let computed_styles = cdp
        .send_command("CSS.getComputedStyleForNode", json!({ "nodeId": node_id }))
        .await?;

    Ok(InspectSelectedResponse {
        ok: true,
        computed_styles,
        matched_styles,
        node_id,
        target: DebugTargetSummary {
            id: target.id,
            title: target.title,
            target_type: target.target_type,
            url: target.url,
        },
    })
}

async fn choose_target(cdp_port: u16, url_filter: Option<&str>) -> Result<DebugTarget> {
    let endpoint = format!("http://127.0.0.1:{cdp_port}/json/list");
    let response = reqwest::get(&endpoint)
        .await
        .with_context(|| format!("failed to reach CDP endpoint at {endpoint}"))?;
    let targets = response
        .json::<Vec<DebugTarget>>()
        .await
        .context("failed to decode CDP /json/list response")?;
    select_matching_target(&targets, url_filter)
        .cloned()
        .ok_or_else(|| anyhow!("no matching CDP page target found on port {cdp_port}"))
}

fn select_matching_target<'a>(
    targets: &'a [DebugTarget],
    url_filter: Option<&str>,
) -> Option<&'a DebugTarget> {
    targets
        .iter()
        .filter(|target| target.target_type == "page")
        .find(|target| {
            target.web_socket_debugger_url.is_some()
                && url_filter
                    .map(|filter| target.url.contains(filter) || target.title.contains(filter))
                    .unwrap_or(true)
        })
}

fn escape_js_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\"', "\\\"")
        .replace('\r', "\\r")
        .replace('\n', "\\n")
}

#[cfg(test)]
mod tests {
    use super::{escape_js_string, select_matching_target, DebugTarget};

    #[test]
    fn escape_js_string_handles_quotes_and_newlines() {
        assert_eq!(
            escape_js_string("project\"preview\nline"),
            "project\\\"preview\\nline"
        );
    }

    #[test]
    fn select_matching_target_prefers_page_targets() {
        let targets = vec![
            DebugTarget {
                id: "1".into(),
                title: "background".into(),
                target_type: "service_worker".into(),
                url: "chrome-extension://ignored".into(),
                web_socket_debugger_url: Some("ws://ignored".into()),
            },
            DebugTarget {
                id: "2".into(),
                title: "Nocode X Studio".into(),
                target_type: "page".into(),
                url: "http://127.0.0.1:3000/".into(),
                web_socket_debugger_url: Some("ws://target".into()),
            },
        ];

        let selected = select_matching_target(&targets, Some("3000"))
            .expect("expected to select the page target");
        assert_eq!(selected.id, "2");
    }
}
