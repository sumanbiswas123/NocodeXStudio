import re

file_path = "c:/Users/suman/Downloads/fox/utils/ollamaService.ts"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

target = """    try {
      intentData = JSON.parse(intentText);
    } catch (e) {
      console.error("[Ollama] Intent detection JSON parse error:", e, intentText);
      throw new Error("Intent detection returned malformed JSON. Raw response: " + intentText);
    }
    if (!intentData.response || intentData.response === undefined) {
      console.error("[Ollama] Intent detection: response field is undefined.", intentData);
      throw new Error("Intent detection returned undefined response field.");
    }
    const intentResult = JSON.parse(intentData.response);"""

replacement = """    let intentResult;
    try {
      intentData = JSON.parse(intentText);
      // Our fine-tuned model frequently outputs raw JSON directly or without the nested "response" prop
      const rawText = intentData.response !== undefined ? intentData.response : intentText;
      
      const cleanedText = rawText.trim().replace(/^```json\\n?/i, "").replace(/\\n?```$/i, "");
      intentResult = JSON.parse(cleanedText);
    } catch (e) {
      console.warn("[Ollama] Model generated plain text instead of strict JSON, parsing failed:", e);
      // Fallback: If the model failed to generate valid JSON, assume it just wanted to chat.
      intentResult = {
          intent: "CHAT",
          chatResponse: intentData?.response ? intentData.response : intentText
      };
    }"""

# Normalize the newlines for both text and target to make replacement reliable
text_norm = text.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')

new_text = text_norm.replace(target_norm, replacement)

with open(file_path, "w", encoding="utf-8", newline='\n') as f:
    f.write(new_text)

print("Replacement successful!" if new_text != text_norm else "Replacement failed: target not found.")
