/**
 * Reads a streaming response and returns the full text.
 */
/**
 * Reads a streaming response from Ollama and returns the full concatenated 'response' value.
 * Only parses the final JSON after 'done': true.
 */
async function readStreamedResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  let result = "";
  const decoder = new TextDecoder();
  let fullResponse = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // Each chunk is a JSON object
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        const obj = JSON.parse(line);
        if (typeof obj.response === "string") {
          fullResponse += obj.response;
        }
        if (obj.done === true) {
          // End of stream
          break;
        }
      } catch (e) {
        // Ignore parse errors for partial lines
      }
    }
  }
  return fullResponse;
}
import { VirtualElement, FileMap } from "../types";

const LOCAL_OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5-coder:3b";
const DEFAULT_FETCH_TIMEOUT_MS = 60000;
const KOBOLD_MAX_LENGTH = 256;
const KOBOLD_INTENT_MAX_LENGTH = 140;
const SMALLTALK_MAX_WORDS = 6;
const QUESTION_PREFIXES =
  /^(what\s+(is|are|does|do|was|were)\s|how\s+(does|do|is|are|can|should)\s|why\s+(is|are|do|does|did|can|should)\s|when\s+(is|are|do|does|did|was|were)\s|who\s+(is|are|was|were)\s|where\s+(is|are|was|were)\s|can\s+you\s+explain|tell\s+me\s+(about|what|how|why)|explain\s+|do\s+you\s+know|define\s+|what'?s\s+the\s+)/i;

const getHost = (aiBackend: "local" | "colab", colabUrl?: string) => {
  if (aiBackend === "colab" && colabUrl) {
    return colabUrl.replace(/\/$/, "");
  }
  return LOCAL_OLLAMA_HOST;
};

const getUrl = (host: string, path: string) => {
  const url = `${host}${path}`;
  if (url.includes("ngrok-free.app") || url.includes("ngrok-free.dev")) {
    const separator = url.includes("?") ? "&" : "?";
    // Using a more standard value '1' or 'any' which is sometimes preferred by Ngrok for POST requests
    return `${url}${separator}ngrok-skip-browser-warning=1`;
  }
  return url;
};

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
) {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(
    () => ctrl.abort(new DOMException("Request timed out", "AbortError")),
    timeoutMs,
  );
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

type RemoteBackend = "ollama" | "kobold" | "unknown";

const isHtmlResponse = (response: Response) =>
  (response.headers.get("content-type") || "").includes("text/html");

async function detectRemoteBackend(host: string): Promise<RemoteBackend> {
  try {
    const res = await fetchWithTimeout(getUrl(host, "/api/tags"), {}, 8000);
    if (res.ok && !isHtmlResponse(res)) return "ollama";
  } catch {
    // Ignore and try kobold.
  }
  try {
    const res = await fetchWithTimeout(getUrl(host, "/api/v1/model"), {}, 8000);
    if (res.ok && !isHtmlResponse(res)) return "kobold";
  } catch {
    // Ignore.
  }
  return "unknown";
}

async function generateTextOllama(
  host: string,
  prompt: string,
  model: string,
  options: { temperature?: number; numCtx?: number; numPredict?: number } = {},
): Promise<string> {
  const response = await fetchWithTimeout(getUrl(host, "/api/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.2,
        num_ctx: options.numCtx,
        num_predict: options.numPredict,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}).`);
  }
  if (isHtmlResponse(response)) {
    throw new Error(
      "AI endpoint returned HTML instead of the Ollama API. Check your Colab URL.",
    );
  }
  return readStreamedResponse(response);
}

async function generateTextKobold(
  host: string,
  prompt: string,
  options: { temperature?: number; maxLength?: number; stop?: string[] } = {},
): Promise<string> {
  const response = await fetchWithTimeout(getUrl(host, "/api/v1/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      max_length: options.maxLength ?? KOBOLD_MAX_LENGTH,
      temperature: options.temperature ?? 0.2,
      top_p: 0.95,
      stop_sequence: options.stop ?? [],
      stream: false,
    }),
  });
  if (!response.ok) {
    throw new Error(`KoboldAI request failed (${response.status}).`);
  }
  if (isHtmlResponse(response)) {
    throw new Error(
      "AI endpoint returned HTML instead of the KoboldAI API. Check your Colab URL.",
    );
  }
  const data = await response.json().catch(() => null);
  const text = data?.results?.[0]?.text ?? "";
  return String(text || "").trim();
}

async function generateText(
  host: string,
  backend: RemoteBackend,
  prompt: string,
  model: string,
  options: {
    temperature?: number;
    numCtx?: number;
    numPredict?: number;
    maxLength?: number;
    stop?: string[];
  } = {},
): Promise<string> {
  if (backend === "kobold") {
    return generateTextKobold(host, prompt, {
      temperature: options.temperature,
      maxLength: options.maxLength,
      stop: options.stop,
    });
  }
  return generateTextOllama(host, prompt, model, {
    temperature: options.temperature,
    numCtx: options.numCtx,
    numPredict: options.numPredict,
  });
}

export interface VibeResponse {
  updatedRoot: VirtualElement;
  message?: string;
  error?: string;
  intent?: "CHAT" | "GLOBAL_REPLACE" | "UI_CHANGE";
  searchText?: string;
  replaceText?: string;
}

/**
 * Applies a list of changes to the virtual tree.
 * This is much faster than regenerating the entire tree in the LLM.
 */
function applyPatches(root: VirtualElement, patches: any[]): VirtualElement {
  let newRoot = { ...root };

  const updateNode = (node: VirtualElement, patch: any): VirtualElement => {
    const updated = { ...node };
    // Handle both flat structure (preferred) and nested props structure
    const data = patch.props || patch;

    if (data.styles) {
      updated.styles = { ...updated.styles, ...data.styles };
    }
    if (data.content !== undefined) updated.content = data.content;
    if (data.html !== undefined) updated.html = data.html;
    if (data.src !== undefined) updated.src = data.src;
    if (data.href !== undefined) updated.href = data.href;
    if (data.className !== undefined) updated.className = data.className;
    if (data.name !== undefined) updated.name = data.name;
    if (data.attributes) {
      updated.attributes = { ...updated.attributes, ...data.attributes };
    }

    return updated;
  };

  const traverseAndApply = (
    node: VirtualElement,
    id: string,
    patch: any,
  ): VirtualElement => {
    if (node.id === id) {
      return updateNode(node, patch);
    }
    if (node.children && node.children.length > 0) {
      const nextChildren = node.children.map((child) =>
        traverseAndApply(child, id, patch),
      );
      const changed = nextChildren.some(
        (child, i) => child !== node.children[i],
      );
      if (changed) return { ...node, children: nextChildren };
    }
    return node;
  };

  for (const patch of patches) {
    if (!patch.id) continue;
    newRoot = traverseAndApply(newRoot, patch.id, patch);
  }

  return newRoot;
}

/**
 * Aggressively minimizes the tree to fit in the LLM context window.
 */
function minifyTree(node: VirtualElement): any {
  const minified: any = {
    id: node.id,
    type: node.type,
  };
  if (node.content) minified.content = node.content;
  if (node.children && node.children.length > 0) {
    minified.children = node.children.map(minifyTree);
  }
  if (node.src) minified.src = node.src;
  return minified;
}

/**
 * Performs a global text replacement across the entire VirtualElement tree.
 * Designed to be safe by only touching visible text and strictly curated attributes.
 */
function globalTextReplace(
  node: VirtualElement,
  search: string,
  replace: string,
): VirtualElement {
  let newNode = { ...node };
  let changed = false;

  const replaceInText = (text: string) => {
    const regex = new RegExp(
      search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi",
    );
    return text.replace(regex, replace);
  };

  const replaceInHtmlSafe = (html: string) => {
    // Robust split by tags: <...> handling potential > inside quotes
    const parts = html.split(/(<(?:[^"'>]|"[^"]*"|'[^']*')+>)/g);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0 && parts[i]) {
        parts[i] = replaceInText(parts[i]);
      }
    }
    return parts.join("");
  };

  // 1. Visible Content (Plain text)
  if (
    node.content &&
    node.content.toLowerCase().includes(search.toLowerCase())
  ) {
    newNode.content = replaceInText(node.content);
    changed = true;
  }

  // 2. HTML content (Safe replacement outside of tags)
  if (node.html && node.html.toLowerCase().includes(search.toLowerCase())) {
    newNode.html = replaceInHtmlSafe(node.html);
    changed = true;
  }

  // 3. Text-related attributes (title, alt, placeholder, etc.)
  if (node.attributes) {
    const nextAttrs = { ...node.attributes };
    let attrChanged = false;
    const safeTextAttrs = [
      "title",
      "placeholder",
      "alt",
      "aria-label",
      "value",
    ];

    for (const key of safeTextAttrs) {
      const val = nextAttrs[key];
      if (
        typeof val === "string" &&
        val.toLowerCase().includes(search.toLowerCase())
      ) {
        nextAttrs[key] = replaceInText(val);
        attrChanged = true;
      }
    }
    if (attrChanged) {
      newNode.attributes = nextAttrs;
      changed = true;
    }
  }

  // We explicitly skip className, styles, src, and href to avoid breaking CSS rules and asset paths.

  if (node.children && node.children.length > 0) {
    const nextChildren = node.children.map((child) =>
      globalTextReplace(child, search, replace),
    );
    const anyChildChanged = nextChildren.some(
      (child, i) => child !== node.children[i],
    );
    if (anyChildChanged) {
      newNode.children = nextChildren;
      changed = true;
    }
  }

  return changed ? newNode : node;
}

// ── LOCAL CONVERSATIONAL GUARD ───────────────────────────────────────────────
// Catches obvious greetings/smalltalk BEFORE any AI call is made.
// This prevents the small local model from misclassifying them as UI changes.

// Keywords that strongly indicate the user wants a UI/code change
const UI_INTENT_KEYWORDS =
  /\b(make|change|update|set|add|remove|delete|replace|edit|modify|move|resize|translate|convert|color|colour|font|size|background|opacity|border|shadow|padding|margin|width|height|style|bold|italic|underline|align|center|left|right|animate|show|hide|display|position|rotate|scale|flip|blur|gradient|image|icon|button|text|heading|title|link|href|src|class|id|layout|column|row|flex|grid|dark|light|white|black|red|green|blue|yellow|pink|purple|orange|grey|gray)\b/i;

const CONVERSATIONAL_PATTERNS = [
  /^\s*(hi|hello|hey|hola|howdy|yo|sup|greetings|namaste|salut|ciao|bonjour)[!.,?\s]*$/i,
  /^\s*how\s+(are\s+you|r\s+u|r\s+you|are\s+u|do\s+you\s+do)[?!.,\s]*$/i,
  /^\s*(good\s+)?(morning|afternoon|evening|night|day)[!.,?\s]*$/i,
  /^\s*what('s|\s+is)\s+(up|new|your\s+name)[?!.,\s]*$/i,
  /^\s*(who|what)\s+are\s+you[?!.,\s]*$/i,
  /^\s*what\s+can\s+you\s+do[?!.,\s]*$/i,
  /^\s*(help|help\s+me)[?!.,\s]*$/i,
  /^\s*(thanks|thank\s+you|ty|thx|great|nice|cool|awesome|perfect|ok|okay)[!.,?\s]*$/i,
  /^\s*(bye|goodbye|see\s+you|cya|later)[!.,?\s]*$/i,
  /^\s*lol[!.,?\s]*$/i,
];

// Playful replies pool for unexpected casual messages
const PLAYFUL_REPLIES = [
  "Meow to you too! 🐱 I'm ready when you are. What would you like to change on the page?",
  "Ha! 😄 I like you. Now, what can I change on the page for you?",
  "That's fun! 😊 I'm your Vibe Assistant — just tell me what to change on the page!",
  "Haha, nice one! 🎉 What would you like me to update on the presentation?",
  "I speak human AND code! 🤖 What should I change on the page?",
];

const CONVERSATIONAL_REPLIES: Record<string, string> = {
  greeting:
    "Hey there! 👋 I'm your Vibe Assistant. Tell me what you'd like to change on this page!",
  howAreYou:
    "I'm doing great, thanks for asking! 😊 Ready to help you build something amazing. What do you want to change on the page?",
  morning:
    "Good morning! ☀️ Let's make something great today. What can I change on the page for you?",
  afternoon: "Good afternoon! 🌤️ Ready to code. What would you like to update?",
  evening: "Good evening! 🌙 What shall we build tonight?",
  night: "Burning the midnight oil? 🦉 I'm with you. What do you need?",
  whoAreYou:
    "I'm Vibe Assistant — an AI that modifies your eCLM presentation in real-time. Just describe a change and I'll apply it!",
  whatCanYouDo:
    "I can change text, styles, colors, translate content, replace words — anything on the page! Just describe what you want.",
  help: 'Sure! Just type something like:\n• "Make the header blue"\n• "Translate this to Hindi"\n• "Change all \'Close\' to \'Cerrar\'"\nI\'ll handle the rest!',
  thanks: "You're welcome! 🎉 Let me know if you need anything else.",
  bye: "Goodbye! 👋 Come back anytime you need a change.",
  generic: "I'm here! 😊 What would you like to change on the page?",
};

/** Returns a sanitized friendly chat message, stripping robotic model errors. */
function sanitizeChatResponse(
  raw: string | undefined,
  fallback: string,
): string {
  if (!raw || raw.trim().length === 0) return fallback;
  const lc = raw.toLowerCase();
  // If the model returned something robotic/error-like, use the friendly fallback
  if (
    lc.includes("invalid input") ||
    lc.includes("please provide a valid") ||
    lc.includes("i cannot") ||
    lc.includes("i'm unable") ||
    lc.includes("i am unable") ||
    lc.includes("not a valid") ||
    lc.includes("cannot process")
  ) {
    return fallback;
  }
  return raw.trim();
}

function getConversationalReply(command: string): string | null {
  const c = command.trim().toLowerCase();

  // Named-pattern checks (fastest path)
  if (
    /^(hi|hello|hey|hola|howdy|yo|sup|greetings|namaste|salut|ciao|bonjour)[!.,?\s]*$/.test(
      c,
    )
  )
    return CONVERSATIONAL_REPLIES.greeting;
  if (/how\s+(are\s+you|r\s+u|r\s+you|are\s+u|do\s+you\s+do)/.test(c))
    return CONVERSATIONAL_REPLIES.howAreYou;
  if (/good\s*morning/.test(c)) return CONVERSATIONAL_REPLIES.morning;
  if (/good\s*afternoon/.test(c)) return CONVERSATIONAL_REPLIES.afternoon;
  if (/good\s*(evening|night)/.test(c)) return CONVERSATIONAL_REPLIES.evening;
  if (
    /who\s+(are\s+you|r\s+u|r\s+you|are\s+u)|what\s+(are\s+you|r\s+u|r\s+you|are\s+u)|^wru[?!.,\s]*$|^who\s+u[?!.,\s]*$/.test(
      c,
    )
  )
    return CONVERSATIONAL_REPLIES.whoAreYou;
  if (/what\s+can\s+you\s+do|what\s+u\s+can\s+do|wyd[?!.,\s]*$/i.test(c))
    return CONVERSATIONAL_REPLIES.whatCanYouDo;
  if (/^help[?!.,\s]*$/.test(c)) return CONVERSATIONAL_REPLIES.help;
  if (
    /^(thanks|thank\s+you|ty|thx|great|nice|cool|awesome|perfect|ok|okay)[!.,?\s]*$/.test(
      c,
    )
  )
    return CONVERSATIONAL_REPLIES.thanks;
  if (/^(bye|goodbye|see\s+you|cya|later)[!.,?\s]*$/.test(c))
    return CONVERSATIONAL_REPLIES.bye;
  if (/^lol[!.,?\s]*$/.test(c))
    return "😄 Haha! Anyway, what would you like to change on the page?";

  // Static pattern list fallback
  for (const pat of CONVERSATIONAL_PATTERNS) {
    if (pat.test(command)) return CONVERSATIONAL_REPLIES.generic;
  }

  // ── GENERAL KNOWLEDGE QUESTIONS → local redirect (NEVER send to LLM) ─────
  // "what is X?", "how does Y work?", "explain Z", etc. — the small local LLM
  // is NOT a general knowledge assistant. Worse, if a targeted element is
  // selected, it will literally set the element's text to the question itself!
  // Catch these locally and reply with a helpful redirect.
  const QUESTION_PREFIXES =
    /^(what\s+(is|are|does|do|was|were)\s|how\s+(does|do|is|are|can|should)\s|why\s+(is|are|do|does|did|can|should)\s|when\s+(is|are|do|does|did|was|were)\s|who\s+(is|are|was|were)\s|where\s+(is|are|was|were)\s|can\s+you\s+explain|tell\s+me\s+(about|what|how|why)|explain\s+|do\s+you\s+know|define\s+|what'?s\s+the\s+)/i;

  if (
    QUESTION_PREFIXES.test(command.trim()) &&
    !UI_INTENT_KEYWORDS.test(command)
  ) {
    return 'I\'m a UI editor, not a general knowledge assistant 😊 For that, try a search engine!\n\nI can help you modify your presentation — try something like:\n• "Make the header blue"\n• "Translate this to Hindi"\n• "Change all \'Close\' to \'Cerrar\'"';
  }

  // ── LANGUAGE NAME EARLY PASS-THROUGH ────────────────────────────────────
  // If the message contains a target language name, it's almost certainly a
  // translation command — even with typos like "trans;ate this to hindi".
  // Return null so it passes through to the LLM pipeline.
  const LANGUAGE_NAMES =
    /\b(hindi|bengali|tamil|telugu|kannada|urdu|french|spanish|german|japanese|chinese|arabic|marathi|gujarati|punjabi|malayalam|english|vietnamese|thai|korean|italian|portuguese|russian|turkish|dutch|swedish|norwegian|danish|greek|hebrew|indonesian|malay|persian|swahili|ukrainian|czech|hungarian)\b/i;
  if (LANGUAGE_NAMES.test(command)) return null;

  // ── HEURISTIC: Short message with NO UI intent keywords ──────────────────
  // If the message is ≤10 words and contains none of the action/style keywords,
  // it's almost certainly casual chat — reply playfully, never touch the page.
  const wordCount = command.trim().split(/\s+/).length;
  if (wordCount <= 10 && !UI_INTENT_KEYWORDS.test(command)) {
    // Pick a playful reply deterministically based on message content (not random)
    const idx = command.trim().length % PLAYFUL_REPLIES.length;
    return PLAYFUL_REPLIES[idx];
  }

  return null;
}
// ─────────────────────────────────────────────────────────────────────────────

export async function submitVibeCommand(
  command: string,
  currentRoot: VirtualElement,
  fileMap: FileMap,
  settings: { aiBackend: "local" | "colab"; colabUrl: string },
  selectedElement?: VirtualElement | null,
  model: string = DEFAULT_MODEL,
): Promise<VibeResponse> {
  // ── LOCAL INTENT DETECTION FOR SIMPLE TEXT CHANGES ──
  // If the command matches a simple text change pattern and a targeted element is present, handle locally.
  const simpleTextChangePattern = /^\s*change\s+the\s+text\s+to\s+(.+)$/i;
  if (selectedElement && simpleTextChangePattern.test(command)) {
    const match = command.match(simpleTextChangePattern);
    const newText = match ? match[1].trim() : "";
    if (newText.length > 0) {
      const updatedRoot = applyPatches(currentRoot, [
        { id: selectedElement.id, content: newText },
      ]);
      return {
        updatedRoot,
        intent: "UI_CHANGE",
        message: `Changed text to '${newText}' for element ID '${selectedElement.id}'.`,
      };
    }
  }
  // Let the remote AI handle all conversational replies instead of local canned responses.
  // ─────────────────────────────────────────────────────────────────────────
  const host = getHost(settings.aiBackend, settings.colabUrl);
  if (settings.aiBackend === "colab" && !settings.colabUrl) {
    return {
      updatedRoot: currentRoot,
      error: "Colab URL is not set. Please add it in Settings > AI.",
    };
  }
  const remoteBackend =
    settings.aiBackend === "colab" ? await detectRemoteBackend(host) : "ollama";
  if (settings.aiBackend === "colab" && remoteBackend === "unknown") {
    return {
      updatedRoot: currentRoot,
      error:
        "Could not detect a supported AI backend at the Colab URL. Make sure it exposes an Ollama or KoboldAI API.",
    };
  }

  // Extract the most readable text from the selected element for the AI
  const getElementText = (el: VirtualElement): string => {
    if (el.content && el.content.trim()) return el.content.trim();
    if (el.html && el.html.trim()) {
      return el.html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return "";
  };
  const targetedElementText = selectedElement
    ? getElementText(selectedElement)
    : "";

  // ── FAST-PATH: Translation shortcut ──────────────────────────────────────
  // When user says "translate" + there is a specific targeted element with real text,
  // we skip the general pipeline entirely and make ONE focused translation call.
  const isTranslateCommand =
    // Standard spellings
    /translat|translate\s+this|convert\s+to/.test(command) ||
    // Fuzzy: "trans" followed by any non-alpha char then "ate" (catches trans;ate, trans-ate, etc.)
    /\btrans[^a-z]?ate\b/i.test(command) ||
    // Language preposition: "to" OR "in" + language name
    /\b(to|in)\s+(bengali|hindi|tamil|telugu|kannada|urdu|french|spanish|german|japanese|chinese|arabic|marathi|gujarati|punjabi|malayalam|vietnamese|thai|korean|italian|portuguese|russian|turkish|dutch|swedish|norwegian|danish|greek|hebrew|indonesian|malay|persian|swahili|ukrainian|czech|hungarian|english)\b/i.test(
      command,
    );

  if (
    isTranslateCommand &&
    targetedElementText &&
    targetedElementText.length > 0
  ) {
    // Extract target language from command
    const langMatch = command.match(
      /\b(bengali|hindi|tamil|telugu|kannada|urdu|french|spanish|german|japanese|chinese|arabic|marathi|gujarati|punjabi|malayalam|english)\b/i,
    );
    const targetLang = langMatch ? langMatch[1] : "the requested language";

    const translatePrompt = `Translate the following text to ${targetLang}.
Source text: "${targetedElementText}"
RULES:
- Return ONLY the translated text, nothing else.
- Do not include quotation marks, explanations, or the original text.
- If the text is a person's name, transliterate it phonetically.
Output:`;

    console.log(`[Ollama] Translation prompt size: ${translatePrompt.length} chars`);

    try {
      const backend =
        settings.aiBackend === "colab"
          ? await detectRemoteBackend(host)
          : "ollama";
      if (settings.aiBackend === "colab" && backend === "unknown") {
        throw new Error(
          "Could not detect a supported AI backend at the Colab URL.",
        );
      }
      const trText = await generateText(host, backend, translatePrompt, model, {
        temperature: 0.1,
        numCtx: 1024,
        maxLength: 256,
      });
      const translatedText = (trText || "")
        .trim()
        .replace(/^['"]+|['"]+$/g, "")
        .replace(/^Translation:\s*/i, "")
        .trim();
      if (translatedText && translatedText.length > 0) {
          const cleanTranslated =
            translatedText.length > targetedElementText.length * 3
              ? translatedText.split("\n")[0].trim()
              : translatedText;
          console.log(
            `Vibe Translation: "${targetedElementText}" → "${cleanTranslated}"`,
          );
          const updatedRoot = globalTextReplace(
            currentRoot,
            targetedElementText,
            cleanTranslated,
          );
          return {
            updatedRoot,
            intent: "GLOBAL_REPLACE",
            searchText: targetedElementText,
            replaceText: cleanTranslated,
            message: `Translated "${targetedElementText}" → "${cleanTranslated}" (${targetLang})`,
          };
      }
      throw new Error("Model returned empty translation.");
    } catch (e: any) {
      // Surface a helpful error message (not the raw abort reason)
      const msg =
        e?.message?.includes("abort") || e?.name === "AbortError"
          ? "Translation timed out — Colab may be slow. Try again in a moment."
          : e?.message || "Unknown error";
      throw new Error(`Translation failed: ${msg}`);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Create a context string for the targeted element if it exists
  const targetContext = selectedElement
    ? `\nTARGETED ELEMENT: The user has selected the element with ID "${selectedElement.id}" (${selectedElement.type}). Any changes they ask for like "make this red" or "change the text" strictly refer to THIS specific element.`
    : "";

  const trimmedCommand = command.trim();
  const wordCount = trimmedCommand.split(/\s+/).filter(Boolean).length;
  const isQuestionLike =
    /\?\s*$/.test(trimmedCommand) || QUESTION_PREFIXES.test(trimmedCommand);
  if ((isQuestionLike || (wordCount > 0 && wordCount <= SMALLTALK_MAX_WORDS)) && !UI_INTENT_KEYWORDS.test(command)) {
    const chatPrompt = `You are a friendly UI assistant. Reply briefly and helpfully to: "${command.trim()}"`;
    const chatText = await generateText(host, remoteBackend, chatPrompt, model, {
      temperature: 0.7,
      maxLength: 120,
    });
    return {
      updatedRoot: currentRoot,
      intent: "CHAT",
      message: sanitizeChatResponse(
        chatText,
        "I'm here! What would you like to change on the page?",
      ),
    };
  }

  // Step 1: Detect Intent (Is this a UI change or just chat?)
  // For non-simple cases, use full intent detection prompt
  const intentPrompt = `Analyze this user message: "${command}"${targetContext}
Determine if they want to:
1. "CHAT": The user is saying hello, asking a casual question, or chatting. NOT for any editing request.
2. "GLOBAL_REPLACE": Replace a SPECIFIC known word/phrase everywhere on the page (e.g. "change every 'apple' to 'orange'").
3. "UI_CHANGE": Any visual change, style change, OR content/text transformation (e.g. "make the header red", "translate this", "change font size").
RESPONSE MUST BE ONLY JSON:
{
  "intent": "CHAT" | "GLOBAL_REPLACE" | "UI_CHANGE",
  "searchText": "exact word/phrase from page (only for GLOBAL_REPLACE)",
  "replaceText": "replacement text (only for GLOBAL_REPLACE)",
  "chatResponse": "friendly reply if intent is CHAT"
}`;

  console.log(`[Ollama] Intent detection prompt size: ${intentPrompt.length} chars`);

  try {
    const intentText = await generateText(host, remoteBackend, intentPrompt, model, {
      temperature: 0.0,
      numPredict: 120,
      maxLength: KOBOLD_INTENT_MAX_LENGTH,
    });
    if (!intentText || intentText.trim().length === 0) {
      console.error("[AI] Intent detection: response is empty.");
      throw new Error("Intent detection returned empty response from AI.");
    }
    let intentResult: any = null;
    try {
      const parsed = JSON.parse(intentText);
      if (parsed?.response && typeof parsed.response === "string") {
        intentResult = JSON.parse(parsed.response);
      } else {
        intentResult = parsed;
      }
    } catch (e) {
      console.error("[AI] Intent detection JSON parse error:", e, intentText);
      throw new Error(
        "Intent detection returned malformed JSON. Raw response: " + intentText,
      );
    }

    // Case: Chat — sanitize the AI response so robotic errors never reach the user
    if (intentResult.intent === "CHAT") {
      return {
        updatedRoot: currentRoot,
        intent: "CHAT",
        message: sanitizeChatResponse(
          intentResult.chatResponse,
          "I'm here! 😊 What would you like to change on the page?",
        ),
      };
    }

    // Case: Global Replace (No tree context needed!)
    if (intentResult.intent === "GLOBAL_REPLACE" && intentResult.searchText) {
      const updatedRoot = globalTextReplace(
        currentRoot,
        intentResult.searchText,
        intentResult.replaceText || "",
      );
      return {
        updatedRoot,
        intent: "GLOBAL_REPLACE",
        searchText: intentResult.searchText,
        replaceText: intentResult.replaceText || "",
        message: `I've replaced all instances of "${intentResult.searchText}" with "${intentResult.replaceText}".`,
      };
    }

    // Case: UI Change (Perform targeted update)
    if (intentResult.intent === "UI_CHANGE" && selectedElement && intentResult.replaceText) {
      // Patch the targeted element's content directly
      const updatedRoot = applyPatches(currentRoot, [
        { id: selectedElement.id, content: intentResult.replaceText },
      ]);
      return {
        updatedRoot,
        intent: "UI_CHANGE",
        message: intentResult.chatResponse || `Changed text to '${intentResult.replaceText}' for element ID '${selectedElement.id}'.`,
      };
    }
    return {
      updatedRoot: currentRoot,
      error: "The request could not be applied to the current selection.",
    };
  } catch (error: any) {
    console.error("Vibe Error:", error);
    return { updatedRoot: currentRoot, error: error.message };
  }
}

export type OllamaStatus = {
  ok: boolean;
  error?: string;
  backend?: "ollama" | "kobold" | "unknown";
};

export async function checkOllamaStatus(settings: {
  aiBackend: "local" | "colab";
  colabUrl: string;
}): Promise<OllamaStatus> {
  if (settings.aiBackend === "colab" && !settings.colabUrl) {
    return { ok: false, error: "Colab URL not set", backend: "unknown" };
  }
  const host = getHost(settings.aiBackend, settings.colabUrl);
  try {
    const backend =
      settings.aiBackend === "colab" ? await detectRemoteBackend(host) : "ollama";
    if (backend === "unknown") {
      return {
        ok: false,
        backend: "unknown",
        error: "Endpoint not recognized (needs Ollama or KoboldAI API)",
      };
    }
    return { ok: true, backend };
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Timed out"
        : err?.message || "Network error";
    return { ok: false, error: msg, backend: "unknown" };
  }
}
