use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use tiny_http::{Header, Method, Response, Server, StatusCode};
use tungstenite::{connect, Message, WebSocket};

#[derive(Debug, Clone)]
struct AppConfig {
    cdp_port: u16,
    listen_port: u16,
}

#[derive(Debug, Deserialize)]
struct InspectSelectedRequest {
    cdp_port: Option<u16>,
    iframe_title: Option<String>,
    selected_selector: Option<String>,
    target_url_contains: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DebugTarget {
    id: String,
    title: String,
    #[serde(rename = "type")]
    target_type: String,
    url: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    web_socket_debugger_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct ErrorBody<'a> {
    ok: bool,
    error: &'a str,
}

struct CdpClient {
    socket: WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>,
    next_id: u64,
}

impl CdpClient {
    fn connect(ws_url: &str) -> Result<Self> {
        let (socket, _) = connect(ws_url).context("failed to connect to CDP websocket")?;
        Ok(Self { socket, next_id: 1 })
    }

    fn send_command(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id;
        self.next_id += 1;

        let payload = json!({
            "id": id,
            "method": method,
            "params": params,
        });
        self.socket
            .send(Message::Text(payload.to_string()))
            .with_context(|| format!("failed to send CDP command {method}"))?;

        loop {
            let message = self.socket.read().context("failed to read CDP response")?;
            match message {
                Message::Text(text) => {
                    let parsed: Value = serde_json::from_str(&text)
                        .context("failed to parse CDP websocket payload")?;
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
                        .context("failed to parse binary CDP websocket payload")?;
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
    }
}

fn parse_arg_u16(args: &[String], flag: &str, default: u16) -> u16 {
    args.windows(2)
        .find(|window| window[0] == flag)
        .and_then(|window| window[1].parse::<u16>().ok())
        .unwrap_or(default)
}

fn build_config() -> AppConfig {
    let args: Vec<String> = env::args().collect();
    AppConfig {
        cdp_port: parse_arg_u16(&args, "--cdp-port", 9222),
        listen_port: parse_arg_u16(&args, "--listen-port", 38991),
    }
}

fn escape_js_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\r', "\\r")
        .replace('\n', "\\n")
}

fn choose_target(cdp_port: u16, url_filter: Option<&str>) -> Result<DebugTarget> {
    let endpoint = format!("http://127.0.0.1:{cdp_port}/json/list");
    let response = ureq::get(&endpoint)
        .call()
        .with_context(|| format!("failed to reach CDP endpoint at {endpoint}"))?;
    let targets: Vec<DebugTarget> = response
        .into_json()
        .context("failed to decode CDP /json/list response")?;

    targets
        .into_iter()
        .filter(|target| target.target_type == "page")
        .find(|target| {
            target.web_socket_debugger_url.is_some()
                && url_filter
                    .map(|filter| target.url.contains(filter) || target.title.contains(filter))
                    .unwrap_or(true)
        })
        .ok_or_else(|| anyhow!("no matching CDP page target found on port {cdp_port}"))
}

fn inspect_selected_element(
    cdp_port: u16,
    iframe_title: &str,
    selected_selector: &str,
    target_url_contains: Option<&str>,
) -> Result<Value> {
    let target = choose_target(cdp_port, target_url_contains)?;
    let ws_url = target
        .web_socket_debugger_url
        .clone()
        .ok_or_else(|| anyhow!("selected target is missing a websocket debugger URL"))?;
    let mut cdp = CdpClient::connect(&ws_url)?;

    cdp.send_command("DOM.enable", json!({}))?;
    cdp.send_command("CSS.enable", json!({}))?;
    cdp.send_command("Runtime.enable", json!({}))?;

    let document = cdp.send_command("DOM.getDocument", json!({ "depth": 1, "pierce": true }))?;
    let root_node_id = document
        .get("root")
        .and_then(|root| root.get("nodeId"))
        .and_then(Value::as_i64)
        .ok_or_else(|| anyhow!("DOM.getDocument did not return a root nodeId"))?;

    let iframe_selector = format!("iframe[title=\"{}\"]", escape_js_string(iframe_title));
    let iframe_query = cdp.send_command(
        "DOM.querySelector",
        json!({
            "nodeId": root_node_id,
            "selector": iframe_selector,
        }),
    )?;
    let iframe_node_id = iframe_query.get("nodeId").and_then(Value::as_i64).unwrap_or(0);

    let node_id = if iframe_node_id > 0 {
        let described = cdp.send_command(
            "DOM.describeNode",
            json!({
                "nodeId": iframe_node_id,
                "depth": 1,
                "pierce": true,
            }),
        )?;
        let content_document_node_id = described
            .get("node")
            .and_then(|node| node.get("contentDocument"))
            .and_then(|content_document| content_document.get("nodeId"))
            .and_then(Value::as_i64)
            .ok_or_else(|| anyhow!("iframe contentDocument was not available through CDP"))?;

        let selected_query = cdp.send_command(
            "DOM.querySelector",
            json!({
                "nodeId": content_document_node_id,
                "selector": selected_selector,
            }),
        )?;
        selected_query
            .get("nodeId")
            .and_then(Value::as_i64)
            .ok_or_else(|| anyhow!("selected preview element was not found in iframe document"))?
    } else {
        let selected_query = cdp.send_command(
            "DOM.querySelector",
            json!({
                "nodeId": root_node_id,
                "selector": selected_selector,
            }),
        )?;
        selected_query
            .get("nodeId")
            .and_then(Value::as_i64)
            .ok_or_else(|| anyhow!("selected preview element was not found in page document"))?
    };

    let matched_styles = cdp.send_command("CSS.getMatchedStylesForNode", json!({ "nodeId": node_id }))?;
    let computed_styles = cdp.send_command("CSS.getComputedStyleForNode", json!({ "nodeId": node_id }))?;

    Ok(json!({
        "ok": true,
        "target": {
            "id": target.id,
            "title": target.title,
            "type": target.target_type,
            "url": target.url,
        },
        "nodeId": node_id,
        "matchedStyles": matched_styles,
        "computedStyles": computed_styles,
    }))
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..])
        .expect("static header bytes should be valid")
}

fn cors_headers() -> [Header; 3] {
    [
        Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..])
            .expect("static header bytes should be valid"),
        Header::from_bytes(
            &b"Access-Control-Allow-Methods"[..],
            &b"GET, POST, OPTIONS"[..],
        )
        .expect("static header bytes should be valid"),
        Header::from_bytes(
            &b"Access-Control-Allow-Headers"[..],
            &b"Content-Type"[..],
        )
        .expect("static header bytes should be valid"),
    ]
}

fn respond_json(request: tiny_http::Request, status: StatusCode, body: &Value) {
    let response = Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(json_header());
    let response = cors_headers()
        .into_iter()
        .fold(response, |response, header| response.with_header(header));
    let _ = request.respond(response);
}

fn respond_empty(request: tiny_http::Request, status: StatusCode) {
    let response = Response::empty(status);
    let response = cors_headers()
        .into_iter()
        .fold(response, |response, header| response.with_header(header));
    let _ = request.respond(response);
}

fn read_json_body<T: for<'de> Deserialize<'de>>(request: &mut tiny_http::Request) -> Result<T> {
    let mut body = String::new();
    request
        .as_reader()
        .read_to_string(&mut body)
        .context("failed to read request body")?;
    serde_json::from_str(&body).context("failed to parse JSON request body")
}

fn main() -> Result<()> {
    let config = build_config();
    let server = Server::http(("127.0.0.1", config.listen_port))
        .map_err(|error| anyhow!("failed to bind bridge on {}: {error}", config.listen_port))?;

    println!(
        "cdp_bridge listening on http://127.0.0.1:{} (CDP port {})",
        config.listen_port, config.cdp_port
    );

    for mut request in server.incoming_requests() {
        let path = request.url().to_owned();
        match (request.method(), path.as_str()) {
            (&Method::Options, _) => {
                respond_empty(request, StatusCode(204));
            }
            (&Method::Get, "/health") => {
                respond_json(
                    request,
                    StatusCode(200),
                    &json!({
                        "ok": true,
                        "listenPort": config.listen_port,
                        "cdpPort": config.cdp_port,
                    }),
                );
            }
            (&Method::Post, "/inspect-selected") => {
                let payload = match read_json_body::<InspectSelectedRequest>(&mut request) {
                    Ok(value) => value,
                    Err(error) => {
                        respond_json(
                            request,
                            StatusCode(400),
                            &json!({
                                "ok": false,
                                "error": error.to_string(),
                            }),
                        );
                        continue;
                    }
                };
                let iframe_title = payload
                    .iframe_title
                    .unwrap_or_else(|| "project-preview".to_string());
                let selected_selector = payload
                    .selected_selector
                    .unwrap_or_else(|| ".__nx-preview-selected".to_string());
                let cdp_port = payload.cdp_port.unwrap_or(config.cdp_port);

                match inspect_selected_element(
                    cdp_port,
                    &iframe_title,
                    &selected_selector,
                    payload.target_url_contains.as_deref(),
                ) {
                    Ok(body) => respond_json(request, StatusCode(200), &body),
                    Err(error) => respond_json(
                        request,
                        StatusCode(500),
                        &json!({
                            "ok": false,
                            "error": error.to_string(),
                        }),
                    ),
                }
            }
            _ => {
                let body = serde_json::to_value(ErrorBody {
                    ok: false,
                    error: "Not found",
                })
                .unwrap_or_else(|_| json!({ "ok": false, "error": "Not found" }));
                respond_json(request, StatusCode(404), &body);
            }
        }
    }

    Ok(())
}
