export type ConfigPayload = Record<string, any>;

type ExtractedObjectLiteral = {
  literal: string;
  start: number;
  end: number;
};

const extractBalancedObjectAt = (
  source: string,
  startIndex: number,
): ExtractedObjectLiteral | null => {
  if (startIndex < 0 || source[startIndex] !== "{") return null;
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          literal: source.slice(startIndex, index + 1),
          start: startIndex,
          end: index + 1,
        };
      }
    }
  }
  return null;
};

export const extractConfigObjectLiteral = (
  content: string,
): ExtractedObjectLiteral | null => {
  const patterns = [
    /\bvar\s+mtConfig\s*=/i,
    /\blet\s+mtConfig\s*=/i,
    /\bconst\s+mtConfig\s*=/i,
    /\bmtConfig\s*=/i,
    /\bwindow\.mtConfig\s*=/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (!match || match.index < 0) continue;
    const braceStart = content.indexOf("{", match.index + match[0].length);
    const balanced = extractBalancedObjectAt(content, braceStart);
    if (balanced) return balanced;
  }
  return null;
};

const stripComments = (source: string): string =>
  source
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .trim();

export const parseConfigPayload = (content: string): ConfigPayload | null => {
  if (!content) return null;
  const block = extractConfigObjectLiteral(content);
  if (block) {
    try {
      const parsed = new Function(`return (${block.literal});`)();
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Fall through to JSON parsing.
    }
  }
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    // Fall through to cleaned JSON parsing.
  }
  try {
    const parsed = JSON.parse(stripComments(content).replace(/;\s*$/, ""));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const replaceConfigPayload = (
  content: string,
  payload: ConfigPayload,
): string => {
  const block = extractConfigObjectLiteral(content);
  if (block) {
    return (
      content.slice(0, block.start) +
      JSON.stringify(payload, null, 4) +
      content.slice(block.end)
    );
  }
  try {
    JSON.parse(content);
    return JSON.stringify(payload, null, 2);
  } catch {
    return content;
  }
};
