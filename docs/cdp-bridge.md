# WebView2 CDP Sidecar

This repo now routes CDP inspection through a single Rust Neutralino extension sidecar.

## Why this exists

The preview Style Inspector needs Chromium/CDP truth for matched and computed styles, but we no longer want a separate localhost bridge process for that work.

The current architecture is:

1. Neutralino starts one Rust extension sidecar: `js.neutralino.nocodex.sidecar`
2. The frontend sends requests with `Neutralino.extensions.dispatch(...)`
3. Rust connects to WebView2's remote debugging endpoint
4. Rust returns CDP payloads back to the app through `app.broadcast(...)`

This keeps CDP and future embedded-AI work in one sidecar process.

## Current frontend-sidecar API

- `sidecar.health`
- `model.status`
- `cdp.inspect_selected`
- `agent.run`
- `agent.cancel`

Current preview inspector usage only depends on `cdp.inspect_selected`.

## Current CDP response shape

`cdp.inspect_selected` preserves the payload shape the preview helpers already expect:

```json
{
  "ok": true,
  "target": {
    "id": "...",
    "title": "Nocode X Studio",
    "type": "page",
    "url": "http://127.0.0.1:3000/"
  },
  "nodeId": 123,
  "matchedStyles": {},
  "computedStyles": {}
}
```

That compatibility is important because the existing inspector logic only wants CDP to project activity and computed-style truth onto the current matched rule set.

## Dev workflow

Prepare the Rust sidecar binary:

```powershell
npm run sidecar:build
```

Launch Neutralino with WebView2 CDP enabled:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-neutralino-with-cdp.ps1 9222
```

The startup script now builds/copies `native/cdp_bridge.exe` and lets Neutralino launch it as an extension. It no longer spawns a separate localhost HTTP bridge.

## Embedded Gemma runtime

The same Rust sidecar now owns both:

- CDP inspection
- embedded Gemma inference

The AI path does not start Ollama, Python, Node, or `llama-server`.

Instead, the sidecar:

1. downloads the official Windows CPU `llama.cpp` runtime DLL bundle on first use if it is not already present
2. downloads `gemma-4-E2B-it-Q4_K_M.gguf` on first AI use if the model is not already present
3. loads the GGUF into memory once
4. reuses that model/context for future requests inside the same sidecar process

Current storage locations are under the local app-data root used by the sidecar:

- runtime DLLs: `AppData\\Local\\nocode-x-studio\\runtime\\llama-b8683-bin-win-cpu-x64`
- Gemma GGUF: `AppData\\Local\\nocode-x-studio\\models\\gemma-4-E2B-it-Q4_K_M.gguf`

`model.status` now reflects:

- runtime download state
- model download state
- embedded load state
- ready/error state
