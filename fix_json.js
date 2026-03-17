const fs = require('fs');
const file = 'c:/Users/suman/Downloads/fox/utils/ollamaService.ts';
let content = fs.readFileSync(file, 'utf8');

const oldBlock = `    let intentData;
    if (!intentText || intentText.trim().length === 0) {
      console.error("[Ollama] Intent detection: streamed response is empty or undefined.");
      throw new Error("Intent detection returned empty response from Ollama.");
    }
    try {
      intentData = JSON.parse(intentText);
    } catch (e) {
      console.error("[Ollama] Intent detection JSON parse error:", e, intentText);
      throw new Error("Intent detection returned malformed JSON. Raw response: " + intentText);
    }
    if (!intentData.response || intentData.response === undefined) {
      console.error("[Ollama] Intent detection: response field is undefined.", intentData);
      throw new Error("Intent detection returned undefined response field.");
    }
    const intentResult = JSON.parse(intentData.response);`;

const newBlock = `    let intentData;
    if (!intentText || intentText.trim().length === 0) {
      throw new Error("Intent detection returned empty response from Ollama.");
    }
    
    let intentResult;
    try {
      intentData = JSON.parse(intentText);
      const rawText = intentData.response !== undefined ? intentData.response : intentText;
      const cleaned = rawText.trim().replace(/^\\s*\\x60\\x60\\x60json\\s*/i, "").replace(/\\s*\\x60\\x60\\x60\\s*$/i, "");
      intentResult = JSON.parse(cleaned);
    } catch (e) {
      console.warn("Fallback to CHAT intent");
      intentResult = { intent: "CHAT", chatResponse: intentData?.response || intentText };
    }`;

// Use regex to replace ignoring exact whitespace
const regex = /let intentData;[\s\S]*?const intentResult = JSON\.parse\(intentData\.response\);/m;
content = content.replace(regex, newBlock);

fs.writeFileSync(file, content, 'utf8');
console.log("File patched.");
