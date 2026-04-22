use anyhow::{anyhow, bail, Context, Result};
use futures_util::StreamExt;
use libloading::Library;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::ffi::{c_char, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::ptr::{self, NonNull};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;
use zip::ZipArchive;

use crate::ipc::{
    AgentRunOptions, AgentRunRequest, AiMode, AiResponse, AssistantMode, CurrentSlide,
    ModelState, ModelStatusSnapshot, SidecarEmitter, SidecarMethod,
    UpdatedCode,
};
use crate::logging::log_line;

const DEFAULT_CONTEXT_WINDOW: usize = 16_384;
const DEFAULT_PROMPT_TOKEN_BUDGET: usize = 10_000;
const DEFAULT_RESPONSE_TOKEN_BUDGET: usize = 1_536;
const DEFAULT_SMALLTALK_RESPONSE_TOKENS: u32 = 96;
const DEFAULT_EXPLAIN_RESPONSE_TOKENS: u32 = 256;
const DEFAULT_MODIFY_RESPONSE_TOKENS: u32 = 1_024;
const DEFAULT_REPEAT_PENALTY: f32 = 1.05;
const DEFAULT_REPEAT_WINDOW: i32 = 96;
const DEFAULT_TOP_K: i32 = 40;
const DEFAULT_N_BATCH: u32 = 512;
const DEFAULT_N_UBATCH: u32 = 128;
const DEFAULT_BATCH_CAPACITY: usize = 128;
const LLAMA_DEFAULT_SEED: u32 = 0xFFFF_FFFF;
const GEMMA_START_OF_TURN: &str = "<start_of_turn>";
const GEMMA_END_OF_TURN: &str = "<end_of_turn>";
const GEMMA_MODEL_ROLE: &str = "model";
const GEMMA_USER_ROLE: &str = "user";
const MODEL_DOWNLOAD_URL: &str =
    "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf?download=1";
const MODEL_FILE_NAME: &str = "google_gemma-4-E2B-it-Q4_K_M.gguf";
const MODEL_ID: &str = "google/gemma-4-E2B-it";
const MODEL_QUANT: &str = "Q4_K_M";
const MODEL_SIZE_LABEL: &str = "3.46 GB";
const MODEL_EXPECTED_SHA256: &str =
    "5efe645db4e1909c7a1f4a9608df18e6c14383f5e86777fc49f769f9ba7d5fdf";
const LLAMA_RUNTIME_RELEASE_TAG: &str = "b8683";
const LLAMA_RUNTIME_DOWNLOAD_URL: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b8683/llama-b8683-bin-win-cpu-x64.zip";
const LLAMA_RUNTIME_ARCHIVE_NAME: &str = "llama-b8683-bin-win-cpu-x64.zip";
const LLAMA_RUNTIME_DIR_NAME: &str = "llama-b8683-bin-win-cpu-x64";
const JSON_GRAMMAR: &str = r#"
root ::= ws object ws
value ::= object | array | string | number | "true" | "false" | "null"
object ::= "{" ws (string ws ":" ws value (ws "," ws string ws ":" ws value)*)? "}"
array ::= "[" ws (value (ws "," ws value)*)? "]"
string ::= "\"" chars "\""
chars ::= ([^"\\] | "\\" escape)*
escape ::= ["\\/bfnrt] | "u" hex hex hex hex
hex ::= [0-9a-fA-F]
number ::= "-"? integer fraction? exponent?
integer ::= "0" | [1-9] [0-9]*
fraction ::= "." [0-9]+
exponent ::= [eE] [+-]? [0-9]+
ws ::= [ \t\n\r]*
"#;

const REQUIRED_RUNTIME_FILES: &[&str] = &[
    "ggml-base.dll",
    "ggml.dll",
    "libomp140.x86_64.dll",
    "llama.dll",
];

type LlamaToken = i32;
type LlamaPos = i32;
type LlamaSeqId = i32;
type LlamaMemory = *mut c_void;

static BACKEND_INIT: OnceLock<()> = OnceLock::new();

#[derive(Clone)]
pub struct AiRuntime {
    inner: Arc<AiRuntimeInner>,
}

struct AiRuntimeInner {
    config: ModelConfig,
    engine: Mutex<Option<EmbeddedEngine>>,
    status: RwLock<ModelStatusSnapshot>,
    warmup_guard: tokio::sync::Mutex<()>,
}

#[derive(Clone)]
struct ModelConfig {
    download_url: String,
    expected_size_label: String,
    file_name: String,
    model_id: String,
    model_root: PathBuf,
    quant: String,
    runtime_archive_name: String,
    runtime_download_url: String,
    runtime_root: PathBuf,
    runtime_tag: String,
}

impl ModelConfig {
    fn default() -> Self {
        let app_data_root = dirs::data_local_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("nocode-x-studio");
        let model_root = app_data_root.join("models");
        let runtime_root = app_data_root.join("runtime").join(LLAMA_RUNTIME_DIR_NAME);

        Self {
            download_url: MODEL_DOWNLOAD_URL.to_string(),
            expected_size_label: MODEL_SIZE_LABEL.to_string(),
            file_name: MODEL_FILE_NAME.to_string(),
            model_id: MODEL_ID.to_string(),
            model_root,
            quant: MODEL_QUANT.to_string(),
            runtime_archive_name: LLAMA_RUNTIME_ARCHIVE_NAME.to_string(),
            runtime_download_url: LLAMA_RUNTIME_DOWNLOAD_URL.to_string(),
            runtime_root,
            runtime_tag: LLAMA_RUNTIME_RELEASE_TAG.to_string(),
        }
    }

    fn manifest_path(&self) -> PathBuf {
        self.model_root.join("gemma-4-E2B-it-Q4_K_M.manifest.json")
    }

    fn model_path(&self) -> PathBuf {
        self.model_root.join(&self.file_name)
    }

    fn runtime_archive_path(&self) -> PathBuf {
        self.runtime_root
            .parent()
            .unwrap_or(&self.runtime_root)
            .join(&self.runtime_archive_name)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModelManifest {
    chat_template: Option<String>,
    download_url: String,
    downloaded_bytes: u64,
    file_name: String,
    model_id: String,
    quant: String,
    runtime_release_tag: String,
    runtime_root: String,
    sha256: String,
}

#[derive(Debug, Clone)]
struct InferenceParams {
    max_tokens: usize,
    repeat_penalty: f32,
    repeat_window: i32,
    temperature: f32,
    top_k: i32,
    top_p: f32,
}

impl InferenceParams {
    fn from_options(options: &AgentRunOptions) -> Self {
        Self {
            max_tokens: options
                .max_tokens
                .unwrap_or(DEFAULT_RESPONSE_TOKEN_BUDGET as u32)
                .clamp(64, DEFAULT_RESPONSE_TOKEN_BUDGET as u32 * 2)
                as usize,
            repeat_penalty: DEFAULT_REPEAT_PENALTY,
            repeat_window: DEFAULT_REPEAT_WINDOW,
            temperature: options.temperature.unwrap_or(0.2).clamp(0.0, 1.2),
            top_k: DEFAULT_TOP_K,
            top_p: options.top_p.unwrap_or(0.9).clamp(0.05, 1.0),
        }
    }
}

impl AiRuntime {
    pub fn new() -> Self {
        let config = ModelConfig::default();
        let status = ModelStatusSnapshot {
            download_url: config.download_url.clone(),
            expected_size_label: config.expected_size_label.clone(),
            message: "Initializing embedded Gemma runtime.".to_string(),
            model_id: config.model_id.clone(),
            model_path: config.model_path().display().to_string(),
            progress: None,
            quant: config.quant.clone(),
            state: ModelState::Starting,
        };

        Self {
            inner: Arc::new(AiRuntimeInner {
                config,
                engine: Mutex::new(None),
                status: RwLock::new(status),
                warmup_guard: tokio::sync::Mutex::new(()),
            }),
        }
    }

    pub async fn current_status(&self) -> ModelStatusSnapshot {
        self.inner.status.read().await.clone()
    }

    pub async fn warmup(&self, emitter: &SidecarEmitter) -> Result<()> {
        let _guard = self.inner.warmup_guard.lock().await;

        if !engine_enabled() {
            let status = self.status_snapshot(
                ModelState::EngineUnavailable,
                "Embedded Gemma is currently only supported by this sidecar on Windows.",
                None,
            );
            self.set_status(status.clone()).await;
            emitter.broadcast_model_status(&status)?;
            return Ok(());
        }

        let runtime_ready = runtime_assets_ready(&self.inner.config.runtime_root).await?;

        if !fs::try_exists(self.inner.config.model_path()).await? {
            let status = self.status_snapshot(
                ModelState::ModelMissing,
                if runtime_ready {
                    "Model file is not installed yet. The first AI request will download google_gemma-4-E2B-it-Q4_K_M.gguf."
                } else {
                    "Embedded runtime and model are not installed yet. The first AI request will download the llama.cpp runtime and google_gemma-4-E2B-it-Q4_K_M.gguf."
                },
                None,
            );
            self.set_status(status.clone()).await;
            emitter.broadcast_model_status(&status)?;
            return Ok(());
        }

        if !runtime_ready {
            let status = self.status_snapshot(
                ModelState::ModelMissing,
                "Model file is present, but the embedded llama.cpp runtime is not installed yet. The first AI request will finish setup.",
                None,
            );
            self.set_status(status.clone()).await;
            emitter.broadcast_model_status(&status)?;
            return Ok(());
        }

        let loading = self.status_snapshot(
            ModelState::Starting,
            "Gemma model file detected. Loading embedded model into memory.",
            Some(0.4),
        );
        self.set_status(loading.clone()).await;
        emitter.broadcast_model_status(&loading)?;

        match self.load_engine_if_needed(emitter, "warmup").await {
            Ok(()) => {
                let ready = self.status_snapshot(
                    ModelState::Ready,
                    "Embedded Gemma is loaded and ready for requests.",
                    Some(1.0),
                );
                self.set_status(ready.clone()).await;
                emitter.broadcast_model_status(&ready)?;
            }
            Err(error) => {
                let status = self.status_snapshot(
                    ModelState::Error,
                    &format!("Failed to load embedded Gemma: {error}"),
                    None,
                );
                self.set_status(status.clone()).await;
                emitter.broadcast_model_status(&status)?;
            }
        }

        Ok(())
    }

    pub async fn run_agent(
        &self,
        request: &AgentRunRequest,
        emitter: &SidecarEmitter,
    ) -> Result<AiResponse> {
        emitter.broadcast_progress(
            &request.request_id,
            SidecarMethod::AgentRun,
            "classify",
            "Classifying request mode.",
            Some(0.1),
        )?;

        let assistant_mode = request.assistant_mode.clone().unwrap_or_default();
        let expected_mode = effective_mode(&request.user_request, assistant_mode.clone());
        let merged_options =
            merged_options(request.options.as_ref(), expected_mode.clone(), &request.user_request);

        if matches!(assistant_mode, AssistantMode::Qa) {
            emitter.broadcast_progress(
                &request.request_id,
                SidecarMethod::AgentRun,
                "model",
                "Checking embedded Gemma availability.",
                Some(0.22),
            )?;

            self.ensure_engine_ready(emitter, &request.request_id).await?;

            emitter.broadcast_progress(
                &request.request_id,
                SidecarMethod::AgentRun,
                "prompt",
                "Packing lightweight Q&A context.",
                Some(0.38),
            )?;

            let prompt = build_plain_text_retry_prompt(request, assistant_mode.clone());

            emitter.broadcast_progress(
                &request.request_id,
                SidecarMethod::AgentRun,
                "infer",
                "Running embedded Gemma inference inside the Rust sidecar.",
                Some(0.58),
            )?;

            let raw = self
                .run_ai_streaming(
                    prompt,
                    plain_text_retry_options(&merged_options),
                    emitter.clone(),
                    request.request_id.clone(),
                )
                .await?;

            let response = plain_text_explain_response(&raw, &request.current_slide)?;

            emitter.broadcast_progress(
                &request.request_id,
                SidecarMethod::AgentRun,
                "done",
                "AI result validated.",
                Some(1.0),
            )?;

            return Ok(response);
        }

        emitter.broadcast_progress(
            &request.request_id,
            SidecarMethod::AgentRun,
            "model",
            "Checking embedded Gemma availability.",
            Some(0.22),
        )?;

        self.ensure_engine_ready(emitter, &request.request_id).await?;

        emitter.broadcast_progress(
            &request.request_id,
            SidecarMethod::AgentRun,
            "prompt",
            "Packing structured slide and CDP context.",
            Some(0.38),
        )?;

        let prompt = build_prompt(
            request,
            assistant_mode.clone(),
            expected_mode.clone(),
            &merged_options,
        );
        let estimated_prompt_tokens = estimate_prompt_tokens(&prompt);

        emitter.broadcast_progress(
            &request.request_id,
            SidecarMethod::AgentRun,
            "infer",
            &format!(
                "Evaluating prompt context (~{} tokens) and generating a structured response.",
                estimated_prompt_tokens
            ),
            Some(0.58),
        )?;

        let raw = self.run_ai(prompt, merged_options.clone()).await?;

        emitter.broadcast_progress(
            &request.request_id,
            SidecarMethod::AgentRun,
            "parse",
            "Validating structured JSON output.",
            Some(0.88),
        )?;

        let response = match parse_and_validate_ai_response(&raw, &request.current_slide, expected_mode.clone()) {
            Ok(response) => response,
            Err(parse_error) if matches!(expected_mode, AiMode::Explain) => {
                emitter.broadcast_progress(
                    &request.request_id,
                    SidecarMethod::AgentRun,
                    "retry",
                    "Retrying with a lightweight plain-text answer prompt.",
                    Some(0.93),
                )?;
                let retry_prompt = build_plain_text_retry_prompt(request, assistant_mode);
                let retry_raw = self
                    .run_ai(retry_prompt, plain_text_retry_options(&merged_options))
                    .await
                    .context("AI JSON output was unusable and plain-text recovery failed")?;

                parse_and_validate_ai_response(&retry_raw, &request.current_slide, AiMode::Explain)
                    .or_else(|_| plain_text_explain_response(&retry_raw, &request.current_slide))
                    .with_context(|| {
                        format!(
                            "AI response could not be recovered after retry. Initial parse error: {parse_error}"
                        )
                    })?
            }
            Err(error) => return Err(error),
        };

        emitter.broadcast_progress(
            &request.request_id,
            SidecarMethod::AgentRun,
            "done",
            "AI result validated.",
            Some(1.0),
        )?;

        Ok(response)
    }

    pub async fn run_ai(&self, prompt: String, options: AgentRunOptions) -> Result<String> {
        if !engine_enabled() {
            bail!("Embedded Gemma is unavailable on this platform.");
        }

        let params = InferenceParams::from_options(&options);
        let prompt_for_worker = prompt.clone();
        let engine = self.inner.clone();

        tokio::task::spawn_blocking(move || -> Result<String> {
            let mut guard = engine
                .engine
                .lock()
                .map_err(|_| anyhow!("embedded Gemma engine mutex is poisoned"))?;
            let engine = guard
                .as_mut()
                .context("embedded Gemma model has not been loaded yet")?;
            engine.generate(&prompt_for_worker, &params, None)
        })
        .await
        .context("embedded Gemma worker thread panicked")?
    }

    pub async fn run_ai_streaming(
        &self,
        prompt: String,
        options: AgentRunOptions,
        emitter: SidecarEmitter,
        request_id: String,
    ) -> Result<String> {
        if !engine_enabled() {
            bail!("Embedded Gemma is unavailable on this platform.");
        }

        let params = InferenceParams::from_options(&options);
        let prompt_for_worker = prompt.clone();
        let engine = self.inner.clone();

        tokio::task::spawn_blocking(move || -> Result<String> {
            let mut guard = engine
                .engine
                .lock()
                .map_err(|_| anyhow!("embedded Gemma engine mutex is poisoned"))?;
            let engine = guard
                .as_mut()
                .context("embedded Gemma model has not been loaded yet")?;
            let mut emit = |text_delta: &str, full_text: &str| -> Result<()> {
                emitter.broadcast_text_stream(
                    &request_id,
                    SidecarMethod::AgentRun,
                    full_text,
                    text_delta,
                )
            };
            engine.generate(&prompt_for_worker, &params, Some(&mut emit))
        })
        .await
        .context("embedded Gemma worker thread panicked")?
    }

    async fn ensure_engine_ready(&self, emitter: &SidecarEmitter, request_id: &str) -> Result<()> {
        let _guard = self.inner.warmup_guard.lock().await;

        if !engine_enabled() {
            bail!("Embedded Gemma is unavailable on this platform.");
        }

        self.ensure_runtime_assets(emitter, request_id).await?;

        if !fs::try_exists(self.inner.config.model_path()).await? {
            let downloading = self.status_snapshot(
                ModelState::Downloading,
                "Downloading gemma-4-E2B-it-Q4_K_M.gguf for first-run setup.",
                Some(0.0),
            );
            self.set_status(downloading.clone()).await;
            emitter.broadcast_model_status(&downloading)?;

            let hash = match self.download_model(emitter, request_id).await {
                Ok(hash) => hash,
                Err(error) => {
                    let status = self.status_snapshot(
                        ModelState::Error,
                        &format!(
                            "Model setup failed. The temporary download was cleared if it was invalid. {}",
                            error
                        ),
                        None,
                    );
                    self.set_status(status.clone()).await;
                    emitter.broadcast_model_status(&status)?;
                    return Err(error);
                }
            };
            let ready = self.status_snapshot(
                ModelState::Starting,
                &format!("Model download complete. Loading GGUF into memory. SHA-256: {hash}"),
                Some(0.55),
            );
            self.set_status(ready.clone()).await;
            emitter.broadcast_model_status(&ready)?;
        }

        self.load_engine_if_needed(emitter, request_id).await?;

        let ready = self.status_snapshot(
            ModelState::Ready,
            "Embedded Gemma is loaded and ready for requests.",
            Some(1.0),
        );
        self.set_status(ready.clone()).await;
        emitter.broadcast_model_status(&ready)?;
        Ok(())
    }

    async fn ensure_runtime_assets(&self, emitter: &SidecarEmitter, request_id: &str) -> Result<()> {
        if runtime_assets_ready(&self.inner.config.runtime_root).await? {
            return Ok(());
        }

        let downloading = self.status_snapshot(
            ModelState::Downloading,
            "Downloading official llama.cpp Windows runtime libraries for the single sidecar process.",
            Some(0.0),
        );
        self.set_status(downloading.clone()).await;
        emitter.broadcast_model_status(&downloading)?;

        self.download_runtime_libraries(emitter, request_id).await?;
        Ok(())
    }

    async fn load_engine_if_needed(&self, emitter: &SidecarEmitter, request_id: &str) -> Result<()> {
        if self
            .inner
            .engine
            .lock()
            .map_err(|_| anyhow!("embedded Gemma engine mutex is poisoned"))?
            .is_some()
        {
            return Ok(());
        }

        let loading = self.status_snapshot(
            ModelState::Starting,
            "Loading Gemma GGUF into embedded llama.cpp runtime.",
            Some(0.72),
        );
        self.set_status(loading.clone()).await;
        emitter.broadcast_model_status(&loading)?;
        emitter.broadcast_progress(
            request_id,
            SidecarMethod::AgentRun,
            "model-load",
            "Loading Gemma GGUF into memory.",
            Some(0.72),
        )?;

        let config = self.inner.config.clone();
        let loaded = tokio::task::spawn_blocking(move || EmbeddedEngine::load(&config))
            .await
            .context("embedded Gemma loader thread panicked")??;

        let chat_template = loaded.chat_template.clone();
        {
            let mut guard = self
                .inner
                .engine
                .lock()
                .map_err(|_| anyhow!("embedded Gemma engine mutex is poisoned"))?;
            if guard.is_none() {
                *guard = Some(loaded);
            }
        }

        persist_model_manifest(
            &self.inner.config,
            chat_template,
            None,
            file_size(&self.inner.config.model_path()).await?,
        )
        .await?;

        Ok(())
    }

    async fn download_model(&self, emitter: &SidecarEmitter, request_id: &str) -> Result<String> {
        fs::create_dir_all(&self.inner.config.model_root)
            .await
            .with_context(|| {
                format!(
                    "failed to create model directory {}",
                    self.inner.config.model_root.display()
                )
            })?;

        let temp_path = self.inner.config.model_path().with_extension("download");
        let client = reqwest::Client::new();

        let head_metadata = client
            .head(&self.inner.config.download_url)
            .send()
            .await
            .ok()
            .filter(|response| response.status().is_success());
        let total_size_hint = head_metadata.as_ref().and_then(|response| response.content_length());

        let (downloaded_bytes, actual_hash) = download_file_with_progress(
            &client,
            &self.inner.config.download_url,
            &temp_path,
            request_id,
            "model-download",
            "Downloading Gemma GGUF.",
            emitter,
            total_size_hint,
        )
        .await
        .map_err(|error| {
            format_download_cleanup_error(
                &temp_path,
                "Model download failed before completion.",
                error,
            )
        })?;

        let normalized_expected = MODEL_EXPECTED_SHA256.to_lowercase();
        if normalized_expected != actual_hash {
            remove_temp_file_if_present(&temp_path)
                .await
                .with_context(|| {
                    format!(
                        "downloaded model hash mismatch and failed to remove invalid temporary file {}",
                        temp_path.display()
                    )
                })?;
            bail!(
                "Downloaded model failed integrity verification and was deleted. Please retry the download. Expected SHA-256 {normalized_expected}, got {actual_hash}."
            );
        }

        if fs::try_exists(self.inner.config.model_path()).await? {
            fs::remove_file(self.inner.config.model_path())
                .await
                .with_context(|| {
                    format!(
                        "failed to remove stale model file {}",
                        self.inner.config.model_path().display()
                    )
                })?;
        }

        fs::rename(&temp_path, self.inner.config.model_path())
            .await
            .with_context(|| {
                format!(
                    "failed to move downloaded model into place at {}",
                    self.inner.config.model_path().display()
                )
            })?;

        persist_model_manifest(
            &self.inner.config,
            None,
            Some(actual_hash.clone()),
            downloaded_bytes,
        )
        .await?;

        Ok(actual_hash)
    }

    async fn download_runtime_libraries(
        &self,
        emitter: &SidecarEmitter,
        request_id: &str,
    ) -> Result<()> {
        let runtime_parent = self
            .inner
            .config
            .runtime_root
            .parent()
            .context("runtime root is missing a parent directory")?;
        fs::create_dir_all(runtime_parent).await.with_context(|| {
            format!(
                "failed to create runtime directory {}",
                runtime_parent.display()
            )
        })?;

        let archive_path = self.inner.config.runtime_archive_path();
        let client = reqwest::Client::new();
        let total_size_hint = client
            .head(&self.inner.config.runtime_download_url)
            .send()
            .await
            .ok()
            .filter(|response| response.status().is_success())
            .and_then(|response| response.content_length());
        download_file_with_progress(
            &client,
            &self.inner.config.runtime_download_url,
            &archive_path,
            request_id,
            "runtime-download",
            "Downloading embedded llama.cpp runtime libraries.",
            emitter,
            total_size_hint,
        )
        .await?;

        let runtime_root = self.inner.config.runtime_root.clone();
        let archive_for_extract = archive_path.clone();
        tokio::task::spawn_blocking(move || extract_runtime_archive(&archive_for_extract, &runtime_root))
            .await
            .context("runtime archive extraction thread panicked")??;

        if fs::try_exists(&archive_path).await? {
            fs::remove_file(&archive_path)
                .await
                .with_context(|| format!("failed to remove {}", archive_path.display()))?;
        }

        Ok(())
    }

    async fn set_status(&self, status: ModelStatusSnapshot) {
        *self.inner.status.write().await = status;
    }

    fn status_snapshot(
        &self,
        state: ModelState,
        message: &str,
        progress: Option<f32>,
    ) -> ModelStatusSnapshot {
        ModelStatusSnapshot {
            download_url: self.inner.config.download_url.clone(),
            expected_size_label: self.inner.config.expected_size_label.clone(),
            message: message.to_string(),
            model_id: self.inner.config.model_id.clone(),
            model_path: self.inner.config.model_path().display().to_string(),
            progress,
            quant: self.inner.config.quant.clone(),
            state,
        }
    }
}

fn merged_options(
    options: Option<&AgentRunOptions>,
    expected_mode: AiMode,
    user_request: &str,
) -> AgentRunOptions {
    let mut merged = options.cloned().unwrap_or_default();
    let normalized = user_request.trim().to_lowercase();
    let is_smalltalk = is_smalltalk_request(&normalized);
    if merged.max_tokens.is_none() {
        merged.max_tokens = Some(match expected_mode {
            AiMode::Explain if is_smalltalk => DEFAULT_SMALLTALK_RESPONSE_TOKENS,
            AiMode::Explain => DEFAULT_EXPLAIN_RESPONSE_TOKENS,
            AiMode::Modify | AiMode::Both => DEFAULT_MODIFY_RESPONSE_TOKENS,
        });
    }
    if merged.temperature.is_none() {
        merged.temperature = Some(match expected_mode {
            AiMode::Explain if is_smalltalk => 0.0,
            AiMode::Explain => 0.15,
            AiMode::Modify | AiMode::Both => 0.1,
        });
    }
    if merged.top_p.is_none() {
        merged.top_p = Some(if is_smalltalk { 0.8 } else { 0.9 });
    }
    merged
}

fn engine_enabled() -> bool {
    cfg!(target_os = "windows")
}

async fn file_size(path: &Path) -> Result<u64> {
    Ok(fs::metadata(path)
        .await
        .with_context(|| format!("failed to stat {}", path.display()))?
        .len())
}

async fn runtime_assets_ready(runtime_root: &Path) -> Result<bool> {
    for file_name in REQUIRED_RUNTIME_FILES {
        if !fs::try_exists(runtime_root.join(file_name)).await? {
            return Ok(false);
        }
    }

    let mut entries = fs::read_dir(runtime_root).await.with_context(|| {
        format!(
            "failed to read runtime directory {}",
            runtime_root.display()
        )
    })?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("ggml-cpu-") && name.ends_with(".dll") {
            return Ok(true);
        }
    }

    Ok(false)
}

async fn download_file_with_progress(
    client: &reqwest::Client,
    url: &str,
    destination: &Path,
    request_id: &str,
    stage: &str,
    detail: &str,
    emitter: &SidecarEmitter,
    total_size_hint: Option<u64>,
) -> Result<(u64, String)> {
    let response = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("failed to start download from {url}"))?
        .error_for_status()
        .with_context(|| format!("download request failed for {url}"))?;
    let total_size = response.content_length().or(total_size_hint);
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(destination)
        .await
        .with_context(|| format!("failed to create {}", destination.display()))?;
    let mut downloaded: u64 = 0;
    let mut hasher = Sha256::new();
    let mut last_emit_at = Instant::now() - Duration::from_secs(1);
    let mut last_progress = -1.0f32;
    let mut last_downloaded_bytes = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("failed while reading download stream")?;
        file.write_all(&chunk)
            .await
            .with_context(|| format!("failed writing to {}", destination.display()))?;
        downloaded += chunk.len() as u64;
        hasher.update(&chunk);

        let progress = total_size.map(|size| (downloaded as f32 / size as f32).clamp(0.0, 1.0));
        let should_emit = progress
            .map(|value| value >= 1.0 || value - last_progress >= 0.002)
            .unwrap_or(downloaded.saturating_sub(last_downloaded_bytes) >= 4 * 1024 * 1024)
            || last_emit_at.elapsed() >= Duration::from_millis(400);

        if should_emit {
            let detail_text = format_download_detail(detail, downloaded, total_size);
            emitter.broadcast_progress(
                request_id,
                SidecarMethod::AgentRun,
                stage,
                &detail_text,
                progress,
            )?;
            last_emit_at = Instant::now();
            last_progress = progress.unwrap_or(last_progress);
            last_downloaded_bytes = downloaded;
        }
    }

    file.flush()
        .await
        .with_context(|| format!("failed flushing {}", destination.display()))?;

    let final_progress = total_size.map(|_| 1.0);
    let final_detail = format_download_detail(detail, downloaded, total_size);
    emitter.broadcast_progress(
        request_id,
        SidecarMethod::AgentRun,
        stage,
        &final_detail,
        final_progress,
    )?;

    Ok((downloaded, format!("{:x}", hasher.finalize())))
}

fn format_download_detail(label: &str, downloaded: u64, total_size: Option<u64>) -> String {
    match total_size {
        Some(total) if total > 0 => format!(
            "{label} {} / {}",
            format_bytes(downloaded),
            format_bytes(total)
        ),
        _ => format!("{label} {}", format_bytes(downloaded)),
    }
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit_index = 0usize;
    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", bytes, UNITS[unit_index])
    } else {
        format!("{value:.1} {}", UNITS[unit_index])
    }
}

fn format_download_cleanup_error(
    temp_path: &Path,
    prefix: &str,
    error: anyhow::Error,
) -> anyhow::Error {
    match std::fs::remove_file(temp_path) {
        Ok(()) => anyhow!("{prefix} The temporary file was deleted. {error}"),
        Err(remove_error) if remove_error.kind() == std::io::ErrorKind::NotFound => {
            anyhow!("{prefix} {error}")
        }
        Err(remove_error) => anyhow!(
            "{prefix} The temporary file could not be deleted automatically ({}): {}. Original error: {}",
            temp_path.display(),
            remove_error,
            error
        ),
    }
}

async fn remove_temp_file_if_present(path: &Path) -> Result<()> {
    if fs::try_exists(path).await? {
        fs::remove_file(path)
            .await
            .with_context(|| format!("failed to delete {}", path.display()))?;
    }
    Ok(())
}

fn extract_runtime_archive(archive_path: &Path, runtime_root: &Path) -> Result<()> {
    let archive_file = std::fs::File::open(archive_path)
        .with_context(|| format!("failed to open {}", archive_path.display()))?;
    let mut zip = ZipArchive::new(archive_file)
        .with_context(|| format!("failed to parse {}", archive_path.display()))?;

    let staging_root = runtime_root.with_extension("staging");
    if staging_root.exists() {
        std::fs::remove_dir_all(&staging_root).with_context(|| {
            format!(
                "failed to remove stale runtime staging {}",
                staging_root.display()
            )
        })?;
    }
    std::fs::create_dir_all(&staging_root)
        .with_context(|| format!("failed to create {}", staging_root.display()))?;

    for index in 0..zip.len() {
        let mut entry = zip.by_index(index)?;
        let entry_name = entry.name().replace('\\', "/");
        if !entry_name.to_ascii_lowercase().ends_with(".dll") {
            continue;
        }

        let file_name = Path::new(&entry_name)
            .file_name()
            .context("runtime archive entry is missing a file name")?;
        let destination = staging_root.join(file_name);
        let mut output = std::fs::File::create(&destination)
            .with_context(|| format!("failed to create {}", destination.display()))?;
        std::io::copy(&mut entry, &mut output)
            .with_context(|| format!("failed to extract {}", destination.display()))?;
    }

    if runtime_root.exists() {
        std::fs::remove_dir_all(runtime_root)
            .with_context(|| format!("failed to remove {}", runtime_root.display()))?;
    }
    std::fs::rename(&staging_root, runtime_root).with_context(|| {
        format!(
            "failed to move runtime staging directory into {}",
            runtime_root.display()
        )
    })?;

    let required = REQUIRED_RUNTIME_FILES
        .iter()
        .map(|name| runtime_root.join(name))
        .collect::<Vec<_>>();
    for required_file in required {
        if !required_file.exists() {
            bail!(
                "runtime archive extraction did not produce required file {}",
                required_file.display()
            );
        }
    }

    let has_cpu_backend = std::fs::read_dir(runtime_root)?.flatten().any(|entry| {
        entry.file_name().to_string_lossy().starts_with("ggml-cpu-")
            && entry.path().extension().and_then(|ext| ext.to_str()) == Some("dll")
    });
    if !has_cpu_backend {
        bail!("runtime archive extraction did not include any ggml CPU backend DLLs");
    }

    Ok(())
}

async fn persist_model_manifest(
    config: &ModelConfig,
    chat_template: Option<String>,
    sha256: Option<String>,
    downloaded_bytes: u64,
) -> Result<()> {
    fs::create_dir_all(&config.model_root)
        .await
        .with_context(|| format!("failed to create {}", config.model_root.display()))?;

    let existing = if fs::try_exists(config.manifest_path()).await? {
        let raw = fs::read_to_string(config.manifest_path())
            .await
            .with_context(|| format!("failed to read {}", config.manifest_path().display()))?;
        serde_json::from_str::<ModelManifest>(&raw).ok()
    } else {
        None
    };

    let manifest = ModelManifest {
        chat_template: chat_template.or_else(|| {
            existing
                .as_ref()
                .and_then(|item| item.chat_template.clone())
        }),
        download_url: config.download_url.clone(),
        downloaded_bytes: if downloaded_bytes == 0 {
            existing
                .as_ref()
                .map(|item| item.downloaded_bytes)
                .unwrap_or(0)
        } else {
            downloaded_bytes
        },
        file_name: config.file_name.clone(),
        model_id: config.model_id.clone(),
        quant: config.quant.clone(),
        runtime_release_tag: config.runtime_tag.clone(),
        runtime_root: config.runtime_root.display().to_string(),
        sha256: sha256
            .or_else(|| existing.as_ref().map(|item| item.sha256.clone()))
            .unwrap_or_default(),
    };

    let serialized = serde_json::to_string_pretty(&manifest)?;
    fs::write(config.manifest_path(), serialized)
        .await
        .with_context(|| format!("failed to write {}", config.manifest_path().display()))?;
    Ok(())
}

fn build_prompt(
    request: &AgentRunRequest,
    assistant_mode: AssistantMode,
    expected_mode: AiMode,
    options: &AgentRunOptions,
) -> String {
    let plan = build_prompt_context_plan(request, assistant_mode.clone(), expected_mode.clone());
    let mut prompt = String::from(
        "You are an embedded coding/editor agent running inside a desktop DevTools app.\n\
Return valid JSON only. Do not wrap in markdown fences.\n\
Use this exact schema:\n\
{\n\
  \"mode\": \"explain\" | \"modify\" | \"both\",\n\
  \"explanation\": \"...\",\n\
  \"actions\": [{\n\
    \"action\": \"modify\" | \"add\" | \"delete\",\n\
    \"target\": \"CSS selector, DOM target, or element description\",\n\
    \"changes\": [{\n\
      \"type\": \"css\" | \"html\" | \"js\" | \"text\",\n\
      \"before\": \"original code or value\",\n\
      \"after\": \"updated code or value\"\n\
    }]\n\
  }],\n\
  \"updated_code\": {\n\
    \"html\": \"full updated HTML if changed, otherwise original HTML\",\n\
    \"css\": \"full updated CSS if changed, otherwise original CSS\",\n\
    \"js\": \"full updated JS if changed, otherwise original JS\"\n\
  }\n\
}\n\
Prefer minimal grounded edits. Respect existing CSS cascade, exact selectors, and slide structure.\n",
    );

    prompt.push_str(&format!(
        "EXPECTED_MODE: {}\n",
        match expected_mode {
            AiMode::Both => "both",
            AiMode::Explain => "explain",
            AiMode::Modify => "modify",
        }
    ));
    prompt.push_str(&format!(
        "ASSISTANT_MODE: {}\n",
        match assistant_mode {
            AssistantMode::Default => "default",
            AssistantMode::Edit => "edit",
            AssistantMode::Qa => "qa",
        }
    ));

    let budget = prompt_char_budget(Some(options));
    append_section(&mut prompt, "USER_REQUEST", &request.user_request, budget);
    if plan.include_active_file {
        append_section(
            &mut prompt,
            "ACTIVE_FILE",
            request.active_file.as_deref().unwrap_or(""),
            budget / 8,
        );
    }

    if plan.include_selected_element {
        if let Some(selected_element) = &request.selected_element {
            append_section(
                &mut prompt,
                "SELECTED_ELEMENT",
                &compact_json(selected_element),
                budget / 4,
            );
        }
    }

    if plan.include_cdp_context {
        if let Some(cdp_context) = &request.cdp_context {
            append_section(
                &mut prompt,
                "CDP_CONTEXT",
                &compact_json(cdp_context),
                budget / 3,
            );
        }
    }

    if plan.include_capture_cdp && request.capture_cdp.unwrap_or(false) {
        prompt.push_str("CAPTURE_CDP:\ntrue\n");
    }
    if plan.include_iframe_title {
        append_section(
            &mut prompt,
            "IFRAME_TITLE",
            request.iframe_title.as_deref().unwrap_or(""),
            budget / 16,
        );
    }
    if plan.include_selected_selector {
        append_section(
            &mut prompt,
            "SELECTED_SELECTOR",
            request.selected_selector.as_deref().unwrap_or(""),
            budget / 16,
        );
    }
    if plan.include_target_url_contains {
        append_section(
            &mut prompt,
            "TARGET_URL_CONTAINS",
            request.target_url_contains.as_deref().unwrap_or(""),
            budget / 16,
        );
    }

    if plan.include_html || plan.include_css || plan.include_js {
        prompt.push_str("CURRENT_SLIDE:\n");
        if plan.include_html {
            let html_context = if plan.focus_html_excerpt {
                focused_html_context(&request.current_slide.html, &request.user_request, budget / 2)
            } else {
                request.current_slide.html.clone()
            };
            append_section(&mut prompt, "HTML", &html_context, budget / 2);
        }
        if plan.include_css {
            append_section(&mut prompt, "CSS", &request.current_slide.css, budget / 3);
        }
        if plan.include_js {
            append_section(&mut prompt, "JS", &request.current_slide.js, budget / 5);
        }
    } else {
        append_section(
            &mut prompt,
            "CURRENT_SLIDE",
            "Omitted because this request does not appear to require slide or editor grounding.",
            budget / 8,
        );
    }
    prompt
}

fn prompt_char_budget(options: Option<&AgentRunOptions>) -> usize {
    let max_tokens = options
        .and_then(|opts| opts.max_tokens)
        .unwrap_or(DEFAULT_RESPONSE_TOKEN_BUDGET as u32) as usize;
    let available_tokens = DEFAULT_CONTEXT_WINDOW.saturating_sub(max_tokens);
    let token_budget = available_tokens.min(DEFAULT_PROMPT_TOKEN_BUDGET);
    token_budget * 4
}

fn estimate_prompt_tokens(prompt: &str) -> usize {
    (prompt.chars().count() / 4).max(1)
}

fn append_section(prompt: &mut String, label: &str, content: &str, budget: usize) {
    let next = truncate_for_prompt(content, budget.max(256));
    prompt.push_str(label);
    prompt.push_str(":\n");
    prompt.push_str(&next);
    prompt.push('\n');
}

fn truncate_for_prompt(value: &str, budget: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= budget {
        return trimmed.to_string();
    }

    let head_budget = budget / 2;
    let tail_budget = budget.saturating_sub(head_budget + 32);
    let head = trimmed.chars().take(head_budget).collect::<String>();
    let tail = trimmed
        .chars()
        .rev()
        .take(tail_budget)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();

    format!("{head}\n/* ... truncated for prompt budget ... */\n{tail}")
}

fn compact_json(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string())
}

fn classify_expected_mode(user_request: &str) -> AiMode {
    let normalized = user_request.trim().to_lowercase();
    let asks_question = normalized.contains('?')
        || normalized.starts_with("why ")
        || normalized.starts_with("what ")
        || normalized.starts_with("how ")
        || normalized.starts_with("explain ");
    let asks_modify = [
        "make ", "fix ", "change ", "update ", "center ", "correct ", "set ", "remove ", "delete ",
        "add ",
    ]
    .iter()
    .any(|needle| normalized.contains(needle));

    match (asks_question, asks_modify) {
        (true, true) => AiMode::Both,
        (true, false) => AiMode::Explain,
        (false, true) => AiMode::Modify,
        (false, false) => AiMode::Explain,
    }
}

#[derive(Debug, Clone, Copy)]
struct PromptContextPlan {
    include_active_file: bool,
    include_capture_cdp: bool,
    include_cdp_context: bool,
    include_css: bool,
    focus_html_excerpt: bool,
    include_html: bool,
    include_iframe_title: bool,
    include_js: bool,
    include_selected_element: bool,
    include_selected_selector: bool,
    include_target_url_contains: bool,
}

impl PromptContextPlan {
    fn minimal() -> Self {
        Self {
            include_active_file: false,
            include_capture_cdp: false,
            include_cdp_context: false,
            include_css: false,
            focus_html_excerpt: false,
            include_html: false,
            include_iframe_title: false,
            include_js: false,
            include_selected_element: false,
            include_selected_selector: false,
            include_target_url_contains: false,
        }
    }

    fn full_edit(request: &AgentRunRequest) -> Self {
        Self {
            include_active_file: true,
            include_capture_cdp: request.capture_cdp.unwrap_or(false),
            include_cdp_context: request.cdp_context.is_some(),
            include_css: true,
            focus_html_excerpt: false,
            include_html: true,
            include_iframe_title: request.iframe_title.is_some(),
            include_js: !request.current_slide.js.trim().is_empty(),
            include_selected_element: request.selected_element.is_some(),
            include_selected_selector: request.selected_selector.is_some(),
            include_target_url_contains: request.target_url_contains.is_some(),
        }
    }
}

fn effective_mode(user_request: &str, assistant_mode: AssistantMode) -> AiMode {
    match assistant_mode {
        AssistantMode::Default => classify_expected_mode(user_request),
        AssistantMode::Edit => AiMode::Modify,
        AssistantMode::Qa => AiMode::Explain,
    }
}

fn build_prompt_context_plan(
    request: &AgentRunRequest,
    assistant_mode: AssistantMode,
    expected_mode: AiMode,
) -> PromptContextPlan {
    let normalized = request.user_request.trim().to_lowercase();
    let mentions_element = request_mentions_any(
        &normalized,
        &[
            "this",
            "that",
            "selected",
            "selected element",
            "element",
            "node",
            "button",
            "card",
        ],
    );
    let mentions_slide = request_mentions_any(
        &normalized,
        &[
            "slide",
            "current slide",
            "page",
            "screen",
            "layout",
            "dom",
            "html",
            "markup",
            "structure",
            "component",
            "current file",
        ],
    );
    let mentions_css = request_mentions_any(
        &normalized,
        &[
            "css",
            "style",
            "styles",
            "cascade",
            "selector",
            "rule",
            "rules",
            "center",
            "centered",
            "align",
            "aligned",
            "spacing",
            "overflow",
            "padding",
            "margin",
            "gap",
            "font",
            "color",
            "background",
            "flex",
            "grid",
            "width",
            "height",
        ],
    );
    let mentions_js = request_mentions_any(
        &normalized,
        &[
            "js",
            "javascript",
            "script",
            "function",
            "event",
            "handler",
            "onclick",
            "logic",
            "bug",
        ],
    );
    let text_edit_request = is_text_edit_request(&normalized, mentions_css, mentions_js);
    let grounded_request = matches!(expected_mode, AiMode::Modify | AiMode::Both)
        || mentions_element
        || mentions_slide
        || mentions_css
        || mentions_js;

    match assistant_mode {
        AssistantMode::Qa => PromptContextPlan::minimal(),
        AssistantMode::Edit => {
            if text_edit_request {
                PromptContextPlan {
                    include_active_file: true,
                    include_capture_cdp: false,
                    include_cdp_context: false,
                    include_css: false,
                    focus_html_excerpt: true,
                    include_html: true,
                    include_iframe_title: false,
                    include_js: false,
                    include_selected_element: request.selected_element.is_some(),
                    include_selected_selector: false,
                    include_target_url_contains: false,
                }
            } else {
                PromptContextPlan::full_edit(request)
            }
        }
        AssistantMode::Default => {
            if !grounded_request || normalized.is_empty() || is_smalltalk_request(&normalized) {
                return PromptContextPlan::minimal();
            }

            if text_edit_request {
                return PromptContextPlan {
                    include_active_file: true,
                    include_capture_cdp: false,
                    include_cdp_context: false,
                    include_css: false,
                    focus_html_excerpt: true,
                    include_html: true,
                    include_iframe_title: false,
                    include_js: false,
                    include_selected_element: request.selected_element.is_some(),
                    include_selected_selector: false,
                    include_target_url_contains: false,
                };
            }

            let include_selected = request.selected_element.is_some()
                && (mentions_element
                    || mentions_css
                    || matches!(expected_mode, AiMode::Modify | AiMode::Both));
            let include_cdp = request.cdp_context.is_some()
                && (mentions_element
                    || mentions_css
                    || matches!(expected_mode, AiMode::Modify | AiMode::Both));

            PromptContextPlan {
                include_active_file: true,
                include_capture_cdp: include_cdp && request.capture_cdp.unwrap_or(false),
                include_cdp_context: include_cdp,
                include_css: mentions_css || matches!(expected_mode, AiMode::Modify | AiMode::Both),
                focus_html_excerpt: false,
                include_html: mentions_slide
                    || mentions_element
                    || matches!(expected_mode, AiMode::Modify | AiMode::Both),
                include_iframe_title: include_cdp && request.iframe_title.is_some(),
                include_js: (mentions_js || matches!(expected_mode, AiMode::Both))
                    && !request.current_slide.js.trim().is_empty(),
                include_selected_element: include_selected,
                include_selected_selector: include_cdp && request.selected_selector.is_some(),
                include_target_url_contains: include_cdp && request.target_url_contains.is_some(),
            }
        }
    }
}

fn request_mentions_any(normalized_request: &str, needles: &[&str]) -> bool {
    needles
        .iter()
        .any(|needle| normalized_request.contains(needle))
}

fn is_text_edit_request(
    normalized_request: &str,
    mentions_css: bool,
    mentions_js: bool,
) -> bool {
    let has_edit_verb =
        request_mentions_any(normalized_request, &["change", "replace", "rename", "update", "set"]);
    let has_text_target = request_mentions_any(
        normalized_request,
        &[
            "text",
            "copy",
            "word",
            "words",
            "wording",
            "label",
            "title",
            "heading",
            "headline",
            "caption",
            "cta",
            "button text",
        ],
    );
    let looks_like_replacement =
        normalized_request.contains(" to ")
            || normalized_request.matches('"').count() >= 2
            || normalized_request.matches('\'').count() >= 2;

    has_edit_verb && (has_text_target || looks_like_replacement) && !mentions_css && !mentions_js
}

fn build_plain_text_retry_prompt(
    request: &AgentRunRequest,
    assistant_mode: AssistantMode,
) -> String {
    let plan = build_prompt_context_plan(request, assistant_mode, AiMode::Explain);
    let mut prompt = String::from(
        "You are an embedded AI assistant in a desktop DevTools app.\n\
Reply in plain text only.\n\
Do not return JSON.\n\
Do not use markdown fences.\n\
Keep the answer concise, helpful, and directly responsive to the user.\n",
    );
    let budget = prompt_char_budget(None) / 2;
    append_section(&mut prompt, "USER_REQUEST", &request.user_request, budget / 2);

    if plan.include_selected_element {
        if let Some(selected_element) = &request.selected_element {
            append_section(
                &mut prompt,
                "SELECTED_ELEMENT",
                &compact_json(selected_element),
                budget / 4,
            );
        }
    }

    if plan.include_cdp_context {
        if let Some(cdp_context) = &request.cdp_context {
            append_section(
                &mut prompt,
                "CDP_CONTEXT",
                &compact_json(cdp_context),
                budget / 3,
            );
        }
    }

    if plan.include_html {
        let html_context = if plan.focus_html_excerpt {
            focused_html_context(&request.current_slide.html, &request.user_request, budget / 3)
        } else {
            request.current_slide.html.clone()
        };
        append_section(&mut prompt, "HTML", &html_context, budget / 3);
    }
    if plan.include_css {
        append_section(&mut prompt, "CSS", &request.current_slide.css, budget / 4);
    }
    if plan.include_js {
        append_section(&mut prompt, "JS", &request.current_slide.js, budget / 6);
    }

    prompt
}

fn focused_html_context(html: &str, user_request: &str, budget: usize) -> String {
    if html.trim().is_empty() {
        return String::new();
    }

    let normalized_request = user_request.trim().to_lowercase();
    let search_terms = text_focus_terms(&normalized_request);
    for term in search_terms {
        if term.is_empty() {
            continue;
        }
        if let Some(index) = html.find(&term) {
            return build_html_excerpt(html, index, term.len(), budget);
        }
        let html_lower = html.to_lowercase();
        if let Some(index) = html_lower.find(&term) {
            return build_html_excerpt(html, index, term.len(), budget);
        }
    }

    truncate_for_prompt(html, budget)
}

fn text_focus_terms(normalized_request: &str) -> Vec<String> {
    let mut terms = extract_quoted_terms(normalized_request);

    if let Some(index) = normalized_request.find(" to ") {
        let before = normalized_request[..index].trim();
        let cleaned = [
            "change the text",
            "change text",
            "replace the text",
            "replace text",
            "update the text",
            "update text",
            "rename the text",
            "rename text",
            "change",
            "replace",
            "update",
            "rename",
            "set the text",
            "set text",
        ]
        .iter()
        .find_map(|prefix| before.strip_prefix(prefix))
        .unwrap_or(before)
        .trim()
        .trim_matches(|ch: char| ch == '"' || ch == '\'' || ch == ':' || ch == ',')
        .to_string();

        if !cleaned.is_empty() {
            terms.push(cleaned);
        }
    }

    terms.sort();
    terms.dedup();
    terms
}

fn extract_quoted_terms(input: &str) -> Vec<String> {
    let mut terms = Vec::new();
    for quote in ['"', '\''] {
        let mut start = None;
        for (index, ch) in input.char_indices() {
            if ch != quote {
                continue;
            }
            if let Some(start_index) = start.take() {
                let value = input[start_index..index].trim();
                if !value.is_empty() {
                    terms.push(value.to_string());
                }
            } else {
                start = Some(index + ch.len_utf8());
            }
        }
    }
    terms
}

fn build_html_excerpt(html: &str, match_index: usize, match_len: usize, budget: usize) -> String {
    let total_chars = html.chars().count();
    if total_chars == 0 {
        return String::new();
    }

    let match_start_char = html[..match_index].chars().count();
    let match_end_char = html[..match_index.saturating_add(match_len)].chars().count();
    let window_radius = (budget / 4).clamp(200, 1200);
    let start_char = match_start_char.saturating_sub(window_radius);
    let end_char = (match_end_char + window_radius).min(total_chars);
    let start_byte = byte_index_for_char_pos(html, start_char);
    let end_byte = byte_index_for_char_pos(html, end_char);
    let mut excerpt = String::new();
    if start_char > 0 {
        excerpt.push_str("<!-- ... focused excerpt ... -->\n");
    }
    excerpt.push_str(&html[start_byte..end_byte]);
    if end_char < total_chars {
        excerpt.push_str("\n<!-- ... excerpt truncated ... -->");
    }
    truncate_for_prompt(&excerpt, budget)
}

fn byte_index_for_char_pos(value: &str, char_pos: usize) -> usize {
    if char_pos == 0 {
        return 0;
    }
    value
        .char_indices()
        .nth(char_pos)
        .map(|(index, _)| index)
        .unwrap_or(value.len())
}

fn is_smalltalk_request(normalized: &str) -> bool {
    let compact = normalized.trim_matches(|ch: char| !ch.is_alphanumeric());
    matches!(
        compact,
        "hi" | "hello" | "hey" | "yo" | "hola" | "sup" | "help"
    ) || (compact.split_whitespace().count() <= 3
        && ["hi", "hello", "hey", "yo", "hola"]
            .iter()
            .any(|needle| compact.contains(needle)))
}

fn parse_and_validate_ai_response(
    raw: &str,
    current_slide: &CurrentSlide,
    expected_mode: AiMode,
) -> Result<AiResponse> {
    let mut parsed = match serde_json::from_str::<AiResponse>(raw) {
        Ok(parsed) => parsed,
        Err(_) => match repair_json_document(raw) {
            Ok(repaired) => serde_json::from_str::<AiResponse>(&repaired)
                .context("failed to parse AI JSON response after repair")?,
            Err(error) => {
                if matches!(expected_mode, AiMode::Explain) {
                    plain_text_explain_response(raw, current_slide)?
                } else {
                    return Err(error);
                }
            }
        }
    };

    parsed.explanation = parsed.explanation.trim().to_string();

    if parsed.updated_code.html.trim().is_empty() {
        parsed.updated_code.html = current_slide.html.clone();
    }
    if parsed.updated_code.css.trim().is_empty() {
        parsed.updated_code.css = current_slide.css.clone();
    }
    if parsed.updated_code.js.trim().is_empty() {
        parsed.updated_code.js = current_slide.js.clone();
    }

    parsed.mode = enforce_mode(&parsed, expected_mode)?;

    if matches!(parsed.mode, AiMode::Modify | AiMode::Both) && parsed.actions.is_empty() {
        bail!("AI response requested a modification but did not include any actions");
    }

    Ok(parsed)
}

fn enforce_mode(parsed: &AiResponse, expected_mode: AiMode) -> Result<AiMode> {
    match expected_mode {
        AiMode::Explain => Ok(AiMode::Explain),
        AiMode::Modify => {
            if parsed.actions.is_empty() {
                bail!("expected modify output but no actions were produced");
            }
            Ok(AiMode::Modify)
        }
        AiMode::Both => {
            if parsed.actions.is_empty() {
                bail!("expected explain+modify output but no actions were produced");
            }
            Ok(AiMode::Both)
        }
    }
}

fn repair_json_document(raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        bail!("AI response was empty");
    }

    let without_fences = trimmed
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if without_fences.starts_with('{') && without_fences.ends_with('}') {
        return Ok(without_fences.to_string());
    }

    extract_first_json_object(without_fences).context("could not repair AI JSON output")
}

fn plain_text_explain_response(raw: &str, current_slide: &CurrentSlide) -> Result<AiResponse> {
    let explanation = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .replace(GEMMA_END_OF_TURN, " ")
        .replace(GEMMA_START_OF_TURN, " ")
        .replace(GEMMA_MODEL_ROLE, " ")
        .replace(GEMMA_USER_ROLE, " ")
        .trim()
        .lines()
        .take(24)
        .collect::<Vec<_>>()
        .join("\n");
    let sanitized = explanation.trim();
    let has_meaningful_text = sanitized.chars().any(|ch| ch.is_alphanumeric());
    if !has_meaningful_text {
        bail!("plain text explain response was not meaningful");
    }

    Ok(AiResponse {
        mode: AiMode::Explain,
        explanation: sanitized.to_string(),
        actions: Vec::new(),
        updated_code: UpdatedCode {
            html: current_slide.html.clone(),
            css: current_slide.css.clone(),
            js: current_slide.js.clone(),
        },
    })
}

fn plain_text_retry_options(base: &AgentRunOptions) -> AgentRunOptions {
    AgentRunOptions {
        max_tokens: Some(base.max_tokens.unwrap_or(DEFAULT_EXPLAIN_RESPONSE_TOKENS).min(160)),
        stream: Some(false),
        temperature: Some(base.temperature.unwrap_or(0.15).clamp(0.0, 0.5)),
        top_p: Some(base.top_p.unwrap_or(0.9).clamp(0.2, 1.0)),
    }
}

fn extract_first_json_object(raw: &str) -> Option<String> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escape = false;
    let mut start = None;

    for (index, ch) in raw.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if ch == '\\' {
                escape = true;
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => {
                if start.is_none() {
                    start = Some(index);
                }
                depth += 1;
            }
            '}' => {
                if depth == 0 {
                    continue;
                }
                depth -= 1;
                if depth == 0 {
                    let start_index = start?;
                    return Some(raw[start_index..=index].to_string());
                }
            }
            _ => {}
        }
    }

    None
}

#[derive(Clone, Copy)]
#[repr(C)]
struct LlamaBatch {
    n_tokens: i32,
    token: *mut LlamaToken,
    embd: *mut f32,
    pos: *mut LlamaPos,
    n_seq_id: *mut i32,
    seq_id: *mut *mut LlamaSeqId,
    logits: *mut i8,
}

#[repr(C)]
struct LlamaModelParams {
    devices: *mut c_void,
    tensor_buft_overrides: *const c_void,
    n_gpu_layers: i32,
    split_mode: i32,
    main_gpu: i32,
    tensor_split: *const f32,
    progress_callback: Option<unsafe extern "C" fn(f32, *mut c_void) -> bool>,
    progress_callback_user_data: *mut c_void,
    kv_overrides: *const c_void,
    vocab_only: bool,
    use_mmap: bool,
    use_direct_io: bool,
    use_mlock: bool,
    check_tensors: bool,
    use_extra_bufts: bool,
    no_host: bool,
    no_alloc: bool,
}

#[repr(C)]
struct LlamaContextParams {
    n_ctx: u32,
    n_batch: u32,
    n_ubatch: u32,
    n_seq_max: u32,
    n_threads: i32,
    n_threads_batch: i32,
    rope_scaling_type: i32,
    pooling_type: i32,
    attention_type: i32,
    flash_attn_type: i32,
    rope_freq_base: f32,
    rope_freq_scale: f32,
    yarn_ext_factor: f32,
    yarn_attn_factor: f32,
    yarn_beta_fast: f32,
    yarn_beta_slow: f32,
    yarn_orig_ctx: u32,
    defrag_thold: f32,
    cb_eval: *mut c_void,
    cb_eval_user_data: *mut c_void,
    type_k: i32,
    type_v: i32,
    abort_callback: *mut c_void,
    abort_callback_data: *mut c_void,
    embeddings: bool,
    offload_kqv: bool,
    no_perf: bool,
    op_offload: bool,
    swa_full: bool,
    kv_unified: bool,
    samplers: *mut c_void,
    n_samplers: usize,
}

#[repr(C)]
struct LlamaSamplerChainParams {
    no_perf: bool,
}

#[repr(C)]
struct LlamaChatMessage {
    role: *const c_char,
    content: *const c_char,
}

#[repr(C)]
struct LlamaContextOpaque {
    _private: [u8; 0],
}

#[repr(C)]
struct LlamaModelOpaque {
    _private: [u8; 0],
}

#[repr(C)]
struct LlamaSamplerOpaque {
    _private: [u8; 0],
}

#[repr(C)]
struct LlamaVocabOpaque {
    _private: [u8; 0],
}

struct LlamaApi {
    backend_init: unsafe extern "C" fn(),
    batch_free: unsafe extern "C" fn(LlamaBatch),
    batch_init: unsafe extern "C" fn(i32, i32, i32) -> LlamaBatch,
    chat_apply_template: unsafe extern "C" fn(
        *const c_char,
        *const LlamaChatMessage,
        usize,
        bool,
        *mut c_char,
        i32,
    ) -> i32,
    context_default_params: unsafe extern "C" fn() -> LlamaContextParams,
    decode: unsafe extern "C" fn(*mut LlamaContextOpaque, LlamaBatch) -> i32,
    free: unsafe extern "C" fn(*mut LlamaContextOpaque),
    get_memory: unsafe extern "C" fn(*const LlamaContextOpaque) -> LlamaMemory,
    init_from_model:
        unsafe extern "C" fn(*mut LlamaModelOpaque, LlamaContextParams) -> *mut LlamaContextOpaque,
    memory_clear: unsafe extern "C" fn(LlamaMemory, bool),
    model_chat_template:
        unsafe extern "C" fn(*const LlamaModelOpaque, *const c_char) -> *const c_char,
    model_default_params: unsafe extern "C" fn() -> LlamaModelParams,
    model_free: unsafe extern "C" fn(*mut LlamaModelOpaque),
    model_get_vocab: unsafe extern "C" fn(*const LlamaModelOpaque) -> *const LlamaVocabOpaque,
    model_load_from_file:
        unsafe extern "C" fn(*const c_char, LlamaModelParams) -> *mut LlamaModelOpaque,
    n_ctx: unsafe extern "C" fn(*const LlamaContextOpaque) -> u32,
    sampler_accept: unsafe extern "C" fn(*mut LlamaSamplerOpaque, LlamaToken),
    sampler_chain_add: unsafe extern "C" fn(*mut LlamaSamplerOpaque, *mut LlamaSamplerOpaque),
    sampler_chain_default_params: unsafe extern "C" fn() -> LlamaSamplerChainParams,
    sampler_chain_init: unsafe extern "C" fn(LlamaSamplerChainParams) -> *mut LlamaSamplerOpaque,
    sampler_free: unsafe extern "C" fn(*mut LlamaSamplerOpaque),
    sampler_init_dist: unsafe extern "C" fn(u32) -> *mut LlamaSamplerOpaque,
    sampler_init_grammar: unsafe extern "C" fn(
        *const LlamaVocabOpaque,
        *const c_char,
        *const c_char,
    ) -> *mut LlamaSamplerOpaque,
    sampler_init_greedy: unsafe extern "C" fn() -> *mut LlamaSamplerOpaque,
    sampler_init_penalties: unsafe extern "C" fn(i32, f32, f32, f32) -> *mut LlamaSamplerOpaque,
    sampler_init_temp: unsafe extern "C" fn(f32) -> *mut LlamaSamplerOpaque,
    sampler_init_top_k: unsafe extern "C" fn(i32) -> *mut LlamaSamplerOpaque,
    sampler_init_top_p: unsafe extern "C" fn(f32, usize) -> *mut LlamaSamplerOpaque,
    sampler_sample:
        unsafe extern "C" fn(*mut LlamaSamplerOpaque, *mut LlamaContextOpaque, i32) -> LlamaToken,
    tokenize: unsafe extern "C" fn(
        *const LlamaVocabOpaque,
        *const c_char,
        i32,
        *mut LlamaToken,
        i32,
        bool,
        bool,
    ) -> i32,
    token_to_piece: unsafe extern "C" fn(
        *const LlamaVocabOpaque,
        LlamaToken,
        *mut c_char,
        i32,
        i32,
        bool,
    ) -> i32,
    vocab_is_control: unsafe extern "C" fn(*const LlamaVocabOpaque, LlamaToken) -> bool,
    vocab_is_eog: unsafe extern "C" fn(*const LlamaVocabOpaque, LlamaToken) -> bool,
}

struct GgmlApi {
    backend_load_all: Option<unsafe extern "C" fn()>,
    backend_load_all_from_path: Option<unsafe extern "C" fn(*const c_char)>,
    backend_reg_count: unsafe extern "C" fn() -> usize,
}

struct LlamaRuntime {
    _ggml_library: Library,
    _ggml_api: GgmlApi,
    _library: Library,
    api: LlamaApi,
}

unsafe impl Send for LlamaRuntime {}

struct EmbeddedEngine {
    runtime: LlamaRuntime,
    model: NonNull<LlamaModelOpaque>,
    context: NonNull<LlamaContextOpaque>,
    vocab: *const LlamaVocabOpaque,
    chat_template: Option<String>,
    context_window: usize,
    batch_capacity: usize,
}

unsafe impl Send for EmbeddedEngine {}

impl Drop for EmbeddedEngine {
    fn drop(&mut self) {
        unsafe {
            (self.runtime.api.free)(self.context.as_ptr());
            (self.runtime.api.model_free)(self.model.as_ptr());
        }
    }
}

impl LlamaApi {
    unsafe fn load(library: &Library) -> Result<Self> {
        macro_rules! sym {
            ($name:literal, $ty:ty) => {
                *library
                    .get::<$ty>($name)
                    .with_context(|| format!("failed to resolve {}", stringify!($name)))?
            };
        }

        Ok(Self {
            backend_init: sym!(b"llama_backend_init\0", unsafe extern "C" fn()),
            batch_free: sym!(b"llama_batch_free\0", unsafe extern "C" fn(LlamaBatch)),
            batch_init: sym!(
                b"llama_batch_init\0",
                unsafe extern "C" fn(i32, i32, i32) -> LlamaBatch
            ),
            chat_apply_template: sym!(
                b"llama_chat_apply_template\0",
                unsafe extern "C" fn(
                    *const c_char,
                    *const LlamaChatMessage,
                    usize,
                    bool,
                    *mut c_char,
                    i32,
                ) -> i32
            ),
            context_default_params: sym!(
                b"llama_context_default_params\0",
                unsafe extern "C" fn() -> LlamaContextParams
            ),
            decode: sym!(
                b"llama_decode\0",
                unsafe extern "C" fn(*mut LlamaContextOpaque, LlamaBatch) -> i32
            ),
            free: sym!(
                b"llama_free\0",
                unsafe extern "C" fn(*mut LlamaContextOpaque)
            ),
            get_memory: sym!(
                b"llama_get_memory\0",
                unsafe extern "C" fn(*const LlamaContextOpaque) -> LlamaMemory
            ),
            init_from_model: sym!(
                b"llama_init_from_model\0",
                unsafe extern "C" fn(
                    *mut LlamaModelOpaque,
                    LlamaContextParams,
                ) -> *mut LlamaContextOpaque
            ),
            memory_clear: sym!(
                b"llama_memory_clear\0",
                unsafe extern "C" fn(LlamaMemory, bool)
            ),
            model_chat_template: sym!(
                b"llama_model_chat_template\0",
                unsafe extern "C" fn(*const LlamaModelOpaque, *const c_char) -> *const c_char
            ),
            model_default_params: sym!(
                b"llama_model_default_params\0",
                unsafe extern "C" fn() -> LlamaModelParams
            ),
            model_free: sym!(
                b"llama_model_free\0",
                unsafe extern "C" fn(*mut LlamaModelOpaque)
            ),
            model_get_vocab: sym!(
                b"llama_model_get_vocab\0",
                unsafe extern "C" fn(*const LlamaModelOpaque) -> *const LlamaVocabOpaque
            ),
            model_load_from_file: sym!(
                b"llama_model_load_from_file\0",
                unsafe extern "C" fn(*const c_char, LlamaModelParams) -> *mut LlamaModelOpaque
            ),
            n_ctx: sym!(
                b"llama_n_ctx\0",
                unsafe extern "C" fn(*const LlamaContextOpaque) -> u32
            ),
            sampler_accept: sym!(
                b"llama_sampler_accept\0",
                unsafe extern "C" fn(*mut LlamaSamplerOpaque, LlamaToken)
            ),
            sampler_chain_add: sym!(
                b"llama_sampler_chain_add\0",
                unsafe extern "C" fn(*mut LlamaSamplerOpaque, *mut LlamaSamplerOpaque)
            ),
            sampler_chain_default_params: sym!(
                b"llama_sampler_chain_default_params\0",
                unsafe extern "C" fn() -> LlamaSamplerChainParams
            ),
            sampler_chain_init: sym!(
                b"llama_sampler_chain_init\0",
                unsafe extern "C" fn(LlamaSamplerChainParams) -> *mut LlamaSamplerOpaque
            ),
            sampler_free: sym!(
                b"llama_sampler_free\0",
                unsafe extern "C" fn(*mut LlamaSamplerOpaque)
            ),
            sampler_init_dist: sym!(
                b"llama_sampler_init_dist\0",
                unsafe extern "C" fn(u32) -> *mut LlamaSamplerOpaque
            ),
            sampler_init_grammar: sym!(
                b"llama_sampler_init_grammar\0",
                unsafe extern "C" fn(
                    *const LlamaVocabOpaque,
                    *const c_char,
                    *const c_char,
                ) -> *mut LlamaSamplerOpaque
            ),
            sampler_init_greedy: sym!(
                b"llama_sampler_init_greedy\0",
                unsafe extern "C" fn() -> *mut LlamaSamplerOpaque
            ),
            sampler_init_penalties: sym!(
                b"llama_sampler_init_penalties\0",
                unsafe extern "C" fn(i32, f32, f32, f32) -> *mut LlamaSamplerOpaque
            ),
            sampler_init_temp: sym!(
                b"llama_sampler_init_temp\0",
                unsafe extern "C" fn(f32) -> *mut LlamaSamplerOpaque
            ),
            sampler_init_top_k: sym!(
                b"llama_sampler_init_top_k\0",
                unsafe extern "C" fn(i32) -> *mut LlamaSamplerOpaque
            ),
            sampler_init_top_p: sym!(
                b"llama_sampler_init_top_p\0",
                unsafe extern "C" fn(f32, usize) -> *mut LlamaSamplerOpaque
            ),
            sampler_sample: sym!(
                b"llama_sampler_sample\0",
                unsafe extern "C" fn(
                    *mut LlamaSamplerOpaque,
                    *mut LlamaContextOpaque,
                    i32,
                ) -> LlamaToken
            ),
            tokenize: sym!(
                b"llama_tokenize\0",
                unsafe extern "C" fn(
                    *const LlamaVocabOpaque,
                    *const c_char,
                    i32,
                    *mut LlamaToken,
                    i32,
                    bool,
                    bool,
                ) -> i32
            ),
            token_to_piece: sym!(
                b"llama_token_to_piece\0",
                unsafe extern "C" fn(
                    *const LlamaVocabOpaque,
                    LlamaToken,
                    *mut c_char,
                    i32,
                    i32,
                    bool,
                ) -> i32
            ),
            vocab_is_control: sym!(
                b"llama_vocab_is_control\0",
                unsafe extern "C" fn(*const LlamaVocabOpaque, LlamaToken) -> bool
            ),
            vocab_is_eog: sym!(
                b"llama_vocab_is_eog\0",
                unsafe extern "C" fn(*const LlamaVocabOpaque, LlamaToken) -> bool
            ),
        })
    }
}

impl GgmlApi {
    unsafe fn load(library: &Library) -> Result<Self> {
        macro_rules! required_sym {
            ($name:literal, $ty:ty) => {
                *library
                    .get::<$ty>($name)
                    .with_context(|| format!("failed to resolve {}", stringify!($name)))?
            };
        }

        macro_rules! optional_sym {
            ($name:literal, $ty:ty) => {
                library.get::<$ty>($name).ok().map(|symbol| *symbol)
            };
        }

        Ok(Self {
            backend_load_all: optional_sym!(b"ggml_backend_load_all\0", unsafe extern "C" fn()),
            backend_load_all_from_path: optional_sym!(
                b"ggml_backend_load_all_from_path\0",
                unsafe extern "C" fn(*const c_char)
            ),
            backend_reg_count: required_sym!(
                b"ggml_backend_reg_count\0",
                unsafe extern "C" fn() -> usize
            ),
        })
    }
}

impl EmbeddedEngine {
    fn load(config: &ModelConfig) -> Result<Self> {
        let runtime = LlamaRuntime::load(&config.runtime_root)?;
        let api = &runtime.api;

        BACKEND_INIT.get_or_init(|| unsafe {
            (api.backend_init)();
        });

        let model_path = path_to_cstring(&config.model_path())?;
        let mut model_params = unsafe { (api.model_default_params)() };
        model_params.n_gpu_layers = 0;
        model_params.use_mmap = true;
        model_params.use_direct_io = false;
        model_params.use_mlock = false;
        model_params.check_tensors = false;

        let model =
            NonNull::new(unsafe { (api.model_load_from_file)(model_path.as_ptr(), model_params) })
                .with_context(|| {
                    format!(
                        "failed to load Gemma GGUF model from {}",
                        config.model_path().display()
                    )
                })?;

        let mut context_params = unsafe { (api.context_default_params)() };
        let threads = recommended_threads();
        context_params.n_ctx = DEFAULT_CONTEXT_WINDOW as u32;
        context_params.n_batch = DEFAULT_N_BATCH;
        context_params.n_ubatch = DEFAULT_N_UBATCH;
        context_params.n_seq_max = 1;
        context_params.n_threads = threads;
        context_params.n_threads_batch = recommended_batch_threads(threads);
        context_params.no_perf = true;
        context_params.offload_kqv = false;
        context_params.embeddings = false;

        let context =
            NonNull::new(unsafe { (api.init_from_model)(model.as_ptr(), context_params) })
                .context("failed to create embedded llama.cpp context")?;
        let vocab = unsafe { (api.model_get_vocab)(model.as_ptr()) };
        if vocab.is_null() {
            unsafe {
                (api.free)(context.as_ptr());
                (api.model_free)(model.as_ptr());
            }
            bail!("loaded model is missing a vocabulary handle");
        }

        let chat_template = unsafe {
            let raw = (api.model_chat_template)(model.as_ptr(), ptr::null());
            if raw.is_null() {
                None
            } else {
                Some(CStr::from_ptr(raw).to_string_lossy().into_owned())
            }
        };

        let context_window = unsafe { (api.n_ctx)(context.as_ptr()) as usize };
        Ok(Self {
            runtime,
            model,
            context,
            vocab,
            chat_template,
            context_window: context_window.max(DEFAULT_CONTEXT_WINDOW),
            batch_capacity: DEFAULT_BATCH_CAPACITY,
        })
    }

    fn generate(
        &mut self,
        prompt: &str,
        params: &InferenceParams,
        mut on_token: Option<&mut dyn FnMut(&str, &str) -> Result<()>>,
    ) -> Result<String> {
        log_line("agent.generate: reset context");
        self.reset_context();

        log_line("agent.generate: format prompt");
        let formatted_prompt = self.format_prompt(prompt)?;
        log_line("agent.generate: fit prompt to context");
        let fitted_prompt = self.fit_prompt_to_context(&formatted_prompt, params.max_tokens)?;
        log_line("agent.generate: tokenize prompt");
        let prompt_tokens = self.tokenize(&fitted_prompt, true, true)?;
        if prompt_tokens.is_empty() {
            bail!("prompt tokenization produced no tokens");
        }

        let max_generation = params
            .max_tokens
            .min(self.context_window.saturating_sub(prompt_tokens.len() + 8));
        if max_generation == 0 {
            bail!("prompt consumed the full context window");
        }

        log_line(format!(
            "agent.generate: decode prompt ({} tokens), max generation {}",
            prompt_tokens.len(),
            max_generation
        ));
        self.decode_prompt(&prompt_tokens)?;
        log_line("agent.generate: build sampler");
        let sampler = self.build_sampler(params)?;
        log_line("agent.generate: sampler ready");

        let mut output = String::new();
        let mut next_position = prompt_tokens.len() as i32;
        let mut batch = unsafe { (self.runtime.api.batch_init)(1, 0, 1) };

        for _ in 0..max_generation {
            log_line("agent.generate: sample token");
            let token = unsafe {
                (self.runtime.api.sampler_sample)(sampler.raw.as_ptr(), self.context.as_ptr(), -1)
            };

            if token == -1 {
                break;
            }
            if unsafe { (self.runtime.api.vocab_is_eog)(self.vocab, token) } {
                break;
            }
            if unsafe { (self.runtime.api.vocab_is_control)(self.vocab, token) } {
                unsafe {
                    (self.runtime.api.sampler_accept)(sampler.raw.as_ptr(), token);
                }
                continue;
            }

            unsafe {
                (self.runtime.api.sampler_accept)(sampler.raw.as_ptr(), token);
            }

            let piece = self.token_to_piece(token)?;
            output.push_str(&piece);
            if let Some(callback) = on_token.as_deref_mut() {
                callback(&piece, &output)?;
            }
            if json_output_looks_complete(&output) {
                log_line("agent.generate: output looks complete");
                break;
            }

            fill_batch(&mut batch, &[token], next_position, true)?;
            decode_checked(
                unsafe { (self.runtime.api.decode)(self.context.as_ptr(), batch) },
                "generated token",
            )?;
            next_position += 1;
        }

        unsafe {
            (self.runtime.api.batch_free)(batch);
        }

        log_line(format!(
            "agent.generate: complete with {} output chars",
            output.chars().count()
        ));
        Ok(output)
    }

    fn build_sampler(&self, params: &InferenceParams) -> Result<SamplerGuard<'_>> {
        let mut chain_params = unsafe { (self.runtime.api.sampler_chain_default_params)() };
        chain_params.no_perf = true;

        let raw = NonNull::new(unsafe { (self.runtime.api.sampler_chain_init)(chain_params) })
            .context("failed to create sampler chain")?;

        if grammar_sampler_enabled() {
            let grammar_sampler = if let Some(grammar) = self.build_grammar_sampler()? {
                grammar
            } else {
                return Err(anyhow!("failed to initialize JSON grammar sampler"));
            };
            unsafe {
                (self.runtime.api.sampler_chain_add)(raw.as_ptr(), grammar_sampler.as_ptr());
            }
        }

        let penalties = NonNull::new(unsafe {
            (self.runtime.api.sampler_init_penalties)(
                params.repeat_window,
                params.repeat_penalty,
                0.0,
                0.0,
            )
        })
        .context("failed to create repetition penalty sampler")?;
        unsafe {
            (self.runtime.api.sampler_chain_add)(raw.as_ptr(), penalties.as_ptr());
        }

        let top_k = NonNull::new(unsafe { (self.runtime.api.sampler_init_top_k)(params.top_k) })
            .context("failed to create top-k sampler")?;
        unsafe {
            (self.runtime.api.sampler_chain_add)(raw.as_ptr(), top_k.as_ptr());
        }

        let top_p = NonNull::new(unsafe { (self.runtime.api.sampler_init_top_p)(params.top_p, 1) })
            .context("failed to create top-p sampler")?;
        unsafe {
            (self.runtime.api.sampler_chain_add)(raw.as_ptr(), top_p.as_ptr());
        }

        if params.temperature <= 0.0 {
            let greedy = NonNull::new(unsafe { (self.runtime.api.sampler_init_greedy)() })
                .context("failed to create greedy sampler")?;
            unsafe {
                (self.runtime.api.sampler_chain_add)(raw.as_ptr(), greedy.as_ptr());
            }
        } else {
            let temp =
                NonNull::new(unsafe { (self.runtime.api.sampler_init_temp)(params.temperature) })
                    .context("failed to create temperature sampler")?;
            unsafe {
                (self.runtime.api.sampler_chain_add)(raw.as_ptr(), temp.as_ptr());
            }

            let dist =
                NonNull::new(unsafe { (self.runtime.api.sampler_init_dist)(LLAMA_DEFAULT_SEED) })
                    .context("failed to create distribution sampler")?;
            unsafe {
                (self.runtime.api.sampler_chain_add)(raw.as_ptr(), dist.as_ptr());
            }
        }

        Ok(SamplerGuard {
            api: &self.runtime.api,
            raw,
        })
    }

    fn build_grammar_sampler(&self) -> Result<Option<NonNull<LlamaSamplerOpaque>>> {
        let grammar = CString::new(JSON_GRAMMAR).context("JSON grammar contains interior NUL")?;
        let root = CString::new("root").context("grammar root contains interior NUL")?;
        Ok(NonNull::new(unsafe {
            (self.runtime.api.sampler_init_grammar)(self.vocab, grammar.as_ptr(), root.as_ptr())
        }))
    }

    fn decode_prompt(&mut self, tokens: &[LlamaToken]) -> Result<()> {
        let mut batch = unsafe { (self.runtime.api.batch_init)(self.batch_capacity as i32, 0, 1) };
        let mut offset = 0usize;

        while offset < tokens.len() {
            let end = (offset + self.batch_capacity).min(tokens.len());
            let chunk = &tokens[offset..end];
            fill_batch(&mut batch, chunk, offset as i32, end == tokens.len())?;
            decode_checked(
                unsafe { (self.runtime.api.decode)(self.context.as_ptr(), batch) },
                "prompt token batch",
            )?;
            offset = end;
        }

        unsafe {
            (self.runtime.api.batch_free)(batch);
        }
        Ok(())
    }

    fn fit_prompt_to_context(&self, prompt: &str, max_tokens: usize) -> Result<String> {
        let mut candidate = prompt.to_string();
        let max_prompt_tokens = self
            .context_window
            .saturating_sub(max_tokens.saturating_add(32))
            .max(1);

        for _ in 0..6 {
            let token_count = self.token_count(&candidate)?;
            if token_count <= max_prompt_tokens {
                return Ok(candidate);
            }

            let next_budget = (candidate.chars().count() * 3 / 4).max(2_048);
            candidate = truncate_for_prompt(&candidate, next_budget);
        }

        bail!("packed prompt still exceeds the context window after truncation")
    }

    fn format_prompt(&self, prompt: &str) -> Result<String> {
        if !chat_template_enabled() {
            return Ok(manual_gemma_chat_prompt(prompt));
        }

        let Some(template) = self.chat_template.as_ref() else {
            return Ok(manual_gemma_chat_prompt(prompt));
        };

        let template = CString::new(template.replace('\0', " "))
            .context("chat template contains interior NUL")?;
        let role = CString::new("user").context("role contains interior NUL")?;
        let content =
            CString::new(prompt.replace('\0', " ")).context("prompt contains interior NUL")?;
        let message = LlamaChatMessage {
            role: role.as_ptr(),
            content: content.as_ptr(),
        };

        let mut capacity = (prompt.len() * 4).max(4_096);
        loop {
            let mut buffer = vec![0u8; capacity];
            let written = unsafe {
                (self.runtime.api.chat_apply_template)(
                    template.as_ptr(),
                    &message,
                    1,
                    true,
                    buffer.as_mut_ptr() as *mut c_char,
                    capacity as i32,
                )
            };

            if written < 0 {
                return Ok(manual_gemma_chat_prompt(prompt));
            }

            let written = written as usize;
            if written < capacity {
                buffer.truncate(written);
                return Ok(String::from_utf8_lossy(&buffer).into_owned());
            }

            capacity = written + 16;
        }
    }

    fn reset_context(&mut self) {
        unsafe {
            let memory = (self.runtime.api.get_memory)(self.context.as_ptr());
            (self.runtime.api.memory_clear)(memory, true);
        }
    }

    fn token_count(&self, text: &str) -> Result<usize> {
        Ok(self.tokenize(text, true, true)?.len())
    }

    fn tokenize(
        &self,
        text: &str,
        add_special: bool,
        parse_special: bool,
    ) -> Result<Vec<LlamaToken>> {
        let text =
            CString::new(text.replace('\0', " ")).context("prompt text contains interior NUL")?;
        let required = unsafe {
            (self.runtime.api.tokenize)(
                self.vocab,
                text.as_ptr(),
                text.as_bytes().len() as i32,
                ptr::null_mut(),
                0,
                add_special,
                parse_special,
            )
        };
        if required == i32::MIN {
            bail!("prompt tokenization overflowed");
        }

        let mut capacity = required.unsigned_abs() as usize;
        if capacity == 0 {
            return Ok(Vec::new());
        }

        let mut tokens = vec![0; capacity];
        let written = unsafe {
            (self.runtime.api.tokenize)(
                self.vocab,
                text.as_ptr(),
                text.as_bytes().len() as i32,
                tokens.as_mut_ptr(),
                tokens.len() as i32,
                add_special,
                parse_special,
            )
        };
        if written == i32::MIN {
            bail!("prompt tokenization overflowed");
        }
        if written < 0 {
            capacity = written.unsigned_abs() as usize;
            tokens.resize(capacity, 0);
            let retry = unsafe {
                (self.runtime.api.tokenize)(
                    self.vocab,
                    text.as_ptr(),
                    text.as_bytes().len() as i32,
                    tokens.as_mut_ptr(),
                    tokens.len() as i32,
                    add_special,
                    parse_special,
                )
            };
            if retry < 0 {
                bail!("prompt tokenization failed even after resizing");
            }
            tokens.truncate(retry as usize);
        } else {
            tokens.truncate(written as usize);
        }
        Ok(tokens)
    }

    fn token_to_piece(&self, token: LlamaToken) -> Result<String> {
        let mut capacity = 64usize;
        loop {
            let mut buffer = vec![0u8; capacity];
            let written = unsafe {
                (self.runtime.api.token_to_piece)(
                    self.vocab,
                    token,
                    buffer.as_mut_ptr() as *mut c_char,
                    buffer.len() as i32,
                    0,
                    false,
                )
            };
            if written >= 0 {
                buffer.truncate(written as usize);
                return Ok(String::from_utf8_lossy(&buffer).into_owned());
            }
            capacity = written.unsigned_abs() as usize + 8;
            if capacity > 8 * 1024 {
                bail!("token piece exceeded the maximum supported size");
            }
        }
    }
}

fn chat_template_enabled() -> bool {
    std::env::var("NOCODEX_ENABLE_LLAMA_CHAT_TEMPLATE")
        .ok()
        .as_deref()
        .map(|value| matches!(value, "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn grammar_sampler_enabled() -> bool {
    std::env::var("NOCODEX_ENABLE_LLAMA_JSON_GRAMMAR")
        .ok()
        .as_deref()
        .map(|value| matches!(value, "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

impl LlamaRuntime {
    fn load(runtime_root: &Path) -> Result<Self> {
        configure_windows_dll_search_path(runtime_root)?;
        let ggml_library =
            unsafe { Library::new(runtime_root.join("ggml.dll")) }.with_context(|| {
                format!(
                    "failed to load {}",
                    runtime_root.join("ggml.dll").display()
                )
            })?;
        let ggml_api = unsafe { GgmlApi::load(&ggml_library) }?;
        ensure_ggml_backends_loaded(&ggml_api, runtime_root)?;

        let library =
            unsafe { Library::new(runtime_root.join("llama.dll")) }.with_context(|| {
                format!(
                    "failed to load {}",
                    runtime_root.join("llama.dll").display()
                )
            })?;
        let api = unsafe { LlamaApi::load(&library) }?;
        Ok(Self {
            _ggml_library: ggml_library,
            _ggml_api: ggml_api,
            _library: library,
            api,
        })
    }
}

struct SamplerGuard<'a> {
    api: &'a LlamaApi,
    raw: NonNull<LlamaSamplerOpaque>,
}

impl Drop for SamplerGuard<'_> {
    fn drop(&mut self) {
        unsafe {
            (self.api.sampler_free)(self.raw.as_ptr());
        }
    }
}

fn decode_checked(code: i32, label: &str) -> Result<()> {
    match code {
        0 => Ok(()),
        1 => bail!("llama_decode could not allocate a KV slot while decoding {label}"),
        2 => bail!("llama_decode was aborted while decoding {label}"),
        -1 => bail!("llama_decode received an invalid batch for {label}"),
        other => bail!("llama_decode failed for {label} with code {other}"),
    }
}

fn fill_batch(
    batch: &mut LlamaBatch,
    tokens: &[LlamaToken],
    start_pos: i32,
    emit_last_logits: bool,
) -> Result<()> {
    if tokens.is_empty() {
        bail!("cannot decode an empty token batch");
    }
    batch.n_tokens = tokens.len() as i32;

    for (index, token) in tokens.iter().enumerate() {
        unsafe {
            *batch.token.add(index) = *token;
            if !batch.pos.is_null() {
                *batch.pos.add(index) = start_pos + index as i32;
            }
            if !batch.n_seq_id.is_null() {
                *batch.n_seq_id.add(index) = 1;
            }
            if !batch.seq_id.is_null() {
                let seq_ids = *batch.seq_id.add(index);
                if !seq_ids.is_null() {
                    *seq_ids = 0;
                }
            }
            if !batch.logits.is_null() {
                *batch.logits.add(index) = if emit_last_logits && index == tokens.len() - 1 {
                    1
                } else {
                    0
                };
            }
        }
    }

    Ok(())
}

fn json_output_looks_complete(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.ends_with('}') && extract_first_json_object(trimmed).is_some()
}

fn recommended_threads() -> i32 {
    if let Ok(value) = std::env::var("NOCODEX_LLAMA_THREADS") {
        if let Ok(parsed) = value.parse::<i32>() {
            return parsed.clamp(1, 8);
        }
    }

    let logical = std::thread::available_parallelism()
        .map(|value| value.get() as i32)
        .unwrap_or(4);

    match logical {
        i32::MIN..=4 => 2,
        5..=8 => 3,
        _ => 4,
    }
}

fn recommended_batch_threads(threads: i32) -> i32 {
    threads.clamp(1, 2)
}

fn manual_gemma_chat_prompt(prompt: &str) -> String {
    let sanitized = prompt.replace('\0', " ");
    format!(
        "{GEMMA_START_OF_TURN}{GEMMA_USER_ROLE}\n{sanitized}{GEMMA_END_OF_TURN}\n{GEMMA_START_OF_TURN}{GEMMA_MODEL_ROLE}\n"
    )
}

fn path_to_cstring(path: &Path) -> Result<CString> {
    CString::new(path.to_string_lossy().replace('\0', " "))
        .with_context(|| format!("path contains an interior NUL: {}", path.display()))
}

fn ensure_ggml_backends_loaded(api: &GgmlApi, runtime_root: &Path) -> Result<()> {
    let already_loaded = unsafe { (api.backend_reg_count)() };
    if already_loaded > 0 {
        return Ok(());
    }

    if let Some(load_all_from_path) = api.backend_load_all_from_path {
        let runtime_root = path_to_cstring(runtime_root)?;
        unsafe {
            load_all_from_path(runtime_root.as_ptr());
        }
    } else if let Some(load_all) = api.backend_load_all {
        unsafe {
            load_all();
        }
    } else {
        bail!("ggml backend loader symbols are unavailable in ggml.dll");
    }

    let loaded = unsafe { (api.backend_reg_count)() };
    if loaded == 0 {
        bail!(
            "ggml backend registration did not load any backend DLLs from {}",
            runtime_root.display()
        );
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn configure_windows_dll_search_path(runtime_root: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::LibraryLoader::{
        AddDllDirectory, SetDefaultDllDirectories, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
        LOAD_LIBRARY_SEARCH_USER_DIRS,
    };

    static SEARCH_PATH_RESULT: OnceLock<Result<(), String>> = OnceLock::new();

    let search_path_result = SEARCH_PATH_RESULT.get_or_init(|| {
        let flags = LOAD_LIBRARY_SEARCH_DEFAULT_DIRS | LOAD_LIBRARY_SEARCH_USER_DIRS;
        let ok = unsafe { SetDefaultDllDirectories(flags) };
        if ok == 0 {
            Err("SetDefaultDllDirectories failed while preparing the llama runtime".to_string())
        } else {
            Ok(())
        }
    });
    if let Err(error) = search_path_result {
        bail!("{error}");
    }

    let wide = runtime_root
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let cookie = unsafe { AddDllDirectory(wide.as_ptr()) };
    if cookie == std::ptr::null_mut() {
        bail!(
            "AddDllDirectory failed for embedded llama runtime path {}",
            runtime_root.display()
        );
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn configure_windows_dll_search_path(_runtime_root: &Path) -> Result<()> {
    bail!("embedded Gemma runtime is only supported on Windows in this sidecar build")
}

#[cfg(test)]
mod tests {
    use super::{
        build_prompt, classify_expected_mode, is_smalltalk_request, json_output_looks_complete,
        manual_gemma_chat_prompt, merged_options, parse_and_validate_ai_response,
        plain_text_explain_response,
        repair_json_document,
    };
    use crate::ipc::{AgentRunOptions, AgentRunRequest, AiMode, AssistantMode, CurrentSlide};
    use serde_json::json;

    #[test]
    fn classify_expected_mode_handles_question_and_modify() {
        assert_eq!(
            classify_expected_mode("Why is this not centered?"),
            AiMode::Explain
        );
        assert_eq!(classify_expected_mode("Center this card"), AiMode::Modify);
        assert_eq!(
            classify_expected_mode("Why is this not aligned? Correct it"),
            AiMode::Both
        );
    }

    #[test]
    fn repair_json_document_extracts_fenced_payload() {
        let repaired = repair_json_document(
            "```json\n{\"mode\":\"explain\",\"explanation\":\"ok\",\"actions\":[],\"updated_code\":{\"html\":\"\",\"css\":\"\",\"js\":\"\"}}\n```",
        )
        .expect("expected fenced JSON to be repaired");
        assert!(repaired.starts_with('{'));
    }

    #[test]
    fn parse_response_fills_updated_code_defaults() {
        let slide = CurrentSlide {
            css: "body { color: red; }".into(),
            html: "<div>Hello</div>".into(),
            js: "console.log('hi')".into(),
        };
        let parsed = parse_and_validate_ai_response(
            "{\"mode\":\"explain\",\"explanation\":\"All good\",\"actions\":[],\"updated_code\":{\"html\":\"\",\"css\":\"\",\"js\":\"\"}}",
            &slide,
            AiMode::Explain,
        )
        .expect("expected valid explain response");

        assert_eq!(parsed.updated_code.html, slide.html);
        assert_eq!(parsed.updated_code.css, slide.css);
        assert_eq!(parsed.updated_code.js, slide.js);
    }

    #[test]
    fn build_prompt_packs_context_sections() {
        let request = AgentRunRequest {
            request_id: "req-1".into(),
            active_file: Some("slides/home.html".into()),
            assistant_mode: Some(AssistantMode::Default),
            capture_cdp: Some(true),
            cdp_context: Some(json!({ "selector": ".card", "computed": { "display": "block" } })),
            current_slide: CurrentSlide {
                css: ".card { display: block; }".into(),
                html: "<div class=\"card\"></div>".into(),
                js: "".into(),
            },
            iframe_title: Some("project-preview".into()),
            options: None,
            selected_element: Some(json!({ "selector": ".card" })),
            selected_selector: Some(".__nx-preview-selected".into()),
            target_url_contains: Some("localhost".into()),
            user_request: "Why is this not centered? Correct it".into(),
        };

        let options = AgentRunOptions {
            max_tokens: Some(1_024),
            stream: Some(false),
            temperature: Some(0.1),
            top_p: Some(0.9),
        };

        let prompt = build_prompt(&request, AssistantMode::Default, AiMode::Both, &options);
        assert!(prompt.contains("USER_REQUEST"));
        assert!(prompt.contains("SELECTED_ELEMENT"));
        assert!(prompt.contains("CDP_CONTEXT"));
        assert!(prompt.contains("HTML"));
        assert!(prompt.contains("CSS"));
    }

    #[test]
    fn json_output_completion_detector_is_grounded() {
        assert!(json_output_looks_complete("{\"mode\":\"explain\"}"));
        assert!(!json_output_looks_complete("{\"mode\":\"explain\""));
    }

    #[test]
    fn parse_response_falls_back_for_plain_text_explain() {
        let slide = CurrentSlide {
            css: "body { color: red; }".into(),
            html: "<div>Hello</div>".into(),
            js: "console.log('hi')".into(),
        };
        let parsed = parse_and_validate_ai_response("Hi there", &slide, AiMode::Explain)
            .expect("expected plain text explain response to be accepted");

        assert_eq!(parsed.mode, AiMode::Explain);
        assert_eq!(parsed.explanation, "Hi there");
        assert!(parsed.actions.is_empty());
        assert_eq!(parsed.updated_code.html, slide.html);
        assert_eq!(parsed.updated_code.css, slide.css);
        assert_eq!(parsed.updated_code.js, slide.js);
    }

    #[test]
    fn parse_response_rejects_punctuation_only_explain_output() {
        let slide = CurrentSlide {
            css: "body { color: red; }".into(),
            html: "<div>Hello</div>".into(),
            js: "console.log('hi')".into(),
        };
        assert!(parse_and_validate_ai_response("}", &slide, AiMode::Explain).is_err());
    }

    #[test]
    fn merged_options_uses_low_budget_for_smalltalk() {
        let options = merged_options(None, AiMode::Explain, "hi");
        assert_eq!(options.max_tokens, Some(96));
        assert_eq!(options.temperature, Some(0.0));
        assert_eq!(options.top_p, Some(0.8));
    }

    #[test]
    fn qa_mode_keeps_prompt_lightweight() {
        assert!(is_smalltalk_request("hi"));
        let request = AgentRunRequest {
            request_id: "req-qa".into(),
            active_file: Some("slides/home.html".into()),
            assistant_mode: Some(AssistantMode::Qa),
            capture_cdp: Some(true),
            cdp_context: Some(json!({ "selector": ".card" })),
            current_slide: CurrentSlide {
                css: ".card { display: block; }".into(),
                html: "<div class=\"card\"></div>".into(),
                js: "console.log('hi')".into(),
            },
            iframe_title: Some("project-preview".into()),
            options: None,
            selected_element: Some(json!({ "selector": ".card" })),
            selected_selector: Some(".__nx-preview-selected".into()),
            target_url_contains: Some("localhost".into()),
            user_request: "What is flexbox?".into(),
        };
        let prompt = build_prompt(&request, AssistantMode::Qa, AiMode::Explain, &AgentRunOptions::default());
        assert!(prompt.contains("CURRENT_SLIDE:\nOmitted"));
        assert!(!prompt.contains("CDP_CONTEXT"));
        assert!(!prompt.contains("HTML:\n<div class=\"card\"></div>"));
    }

    #[test]
    fn edit_mode_keeps_prompt_grounded() {
        let request = AgentRunRequest {
            request_id: "req-edit".into(),
            active_file: Some("slides/home.html".into()),
            assistant_mode: Some(AssistantMode::Edit),
            capture_cdp: Some(true),
            cdp_context: Some(json!({ "selector": ".card" })),
            current_slide: CurrentSlide {
                css: ".card { display: block; }".into(),
                html: "<div class=\"card\"></div>".into(),
                js: "console.log('hi')".into(),
            },
            iframe_title: Some("project-preview".into()),
            options: None,
            selected_element: Some(json!({ "selector": ".card" })),
            selected_selector: Some(".__nx-preview-selected".into()),
            target_url_contains: Some("localhost".into()),
            user_request: "Make this card centered".into(),
        };
        let prompt = build_prompt(&request, AssistantMode::Edit, AiMode::Modify, &AgentRunOptions::default());
        assert!(prompt.contains("CDP_CONTEXT"));
        assert!(prompt.contains("HTML:\n<div class=\"card\"></div>"));
        assert!(prompt.contains("CSS:\n.card { display: block; }"));
    }

    #[test]
    fn manual_gemma_chat_prompt_adds_generation_turn() {
        let prompt = manual_gemma_chat_prompt("Hello");
        assert!(prompt.starts_with("<start_of_turn>user\nHello"));
        assert!(prompt.contains("<end_of_turn>\n<start_of_turn>model\n"));
    }

    #[test]
    fn plain_text_explain_response_strips_turn_markers() {
        let slide = CurrentSlide {
            css: String::new(),
            html: "<div></div>".into(),
            js: String::new(),
        };
        let parsed = plain_text_explain_response("Hello!<end_of_turn>", &slide)
            .expect("expected plain text response to parse");
        assert_eq!(parsed.explanation, "Hello!");
    }
}
