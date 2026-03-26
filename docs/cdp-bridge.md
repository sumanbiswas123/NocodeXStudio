# WebView2 CDP Bridge

This repo now includes a Windows-only Rust sidecar at `native/cdp_bridge`.

## Why this exists

The custom CSS inspector in the app cannot reliably reproduce Chrome DevTools cascade resolution using only page-side CSSOM logic. The stronger path is to ask the Chromium engine directly through the Chrome DevTools Protocol (CDP).

Because this app runs on Neutralino, the easiest in-repo bridge is:

1. Launch the app with WebView2 remote debugging enabled.
2. Run a bundled Rust sidecar that connects to that CDP endpoint.
3. Ask CDP for the selected preview element's matched/computed styles.

## Current bridge API

The Rust sidecar exposes a tiny local HTTP API:

- `GET /health`
- `POST /inspect-selected`

Example request:

```json
{
  "cdp_port": 9222,
  "iframe_title": "project-preview",
  "selected_selector": ".__nx-preview-selected"
}
```

Example response shape:

```json
{
  "ok": true,
  "target": {
    "id": "....",
    "title": "Nocode X Studio",
    "type": "page",
    "url": "http://127.0.0.1:3000/"
  },
  "nodeId": 123,
  "matchedStyles": {},
  "computedStyles": {}
}
```

## Dev workflow

Start Neutralino with CDP exposed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-neutralino-with-cdp.ps1 9222
```

Run the Rust bridge:

```powershell
cargo run --manifest-path native/cdp_bridge/Cargo.toml -- --cdp-port 9222 --listen-port 38991
```

## Important note

This bridge uses WebView2's remote debugging endpoint rather than direct `CoreWebView2` host calls. That keeps it compatible with the current Neutralino app structure, while still using Chromium/CDP as the source of truth.
