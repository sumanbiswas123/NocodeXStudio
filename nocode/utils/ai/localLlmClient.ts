export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionOptions = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
};

export const LOCAL_LLM_HOST = "http://127.0.0.1:8080";

export async function checkLocalLlmHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_LLM_HOST}/v1/models`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string> {
  const response = await fetch(`${LOCAL_LLM_HOST}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "local",
      messages,
      temperature: options.temperature ?? 0.2,
      top_p: options.topP ?? 0.95,
      max_tokens: options.maxTokens ?? 512,
      stop: options.stop,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Local LLM request failed (${response.status}). ${errorText}`,
    );
  }

  const data = await response.json();
  const content =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    "";
  return String(content).trim();
}
