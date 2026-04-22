import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";

export type CodeLanguage =
  | "html"
  | "css"
  | "js"
  | "json"
  | "svg"
  | "text"
  | "ts"
  | "tsx"
  | "jsx"
  | "md";

interface ColorCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  theme: "light" | "dark";
  minHeight?: string;
  className?: string;
  style?: React.CSSProperties;
  spellCheck?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onScroll?: (event: React.UIEvent<HTMLTextAreaElement>) => void;
  wrap?: "soft" | "off";
  tabSize?: number;
  lineHeight?: string;
  fontSize?: string;
  readOnly?: boolean;
  placeholder?: string;
}

// VS Code-inspired color palette
const MATERIAL_COLORS = {
  dark: {
    // Surface colors
    surface: "#1e1e1e",
    surfaceVariant: "#252526",
    outline: "#3c3c3c",
    surfaceContainer: "#2d2d30",
    surfaceContainerHighest: "#333333",

    // Text colors
    onSurface: "#d4d4d4",
    onSurfaceVariant: "#858585",
    onOutline: "#d4d4d4",
    primary: "#007acc",
    onPrimary: "#ffffff",

    // Syntax colors (VS Code-like)
    syntax: {
      keyword: "#569cd6",
      string: "#ce9178",
      number: "#b5cea8",
      comment: "#6a9955",
      function: "#dcdcaa",
      variable: "#9cdcfe",
      property: "#9cdcfe",
      tag: "#569cd6",
      operator: "#d4d4d4",
      punctuation: "#d4d4d4",
      boolean: "#569cd6",
      builtin: "#4ec9b0",
      className: "#4ec9b0",
      regex: "#d16969",
    },

    // UI colors
    cursor: "#aeafad",
    selection: "rgba(38,79,120,0.55)",
    scrollbar: "#424242",
    scrollbarHover: "#4f4f4f",
    lineNumber: "#7a7a7a",
    lineNumberActive: "#d4d4d4",
    currentLine: "#2a2d2e",
    bracketMatch: "#3a3d41",
    background: "#1e1e1e",
    gutterBackground: "#252526",
    indentGuide: "#2a2a2a",
  },

  light: {
    // Surface colors
    surface: "#ffffff",
    surfaceVariant: "#f5f5f7",
    outline: "#d1d1d6",
    surfaceContainer: "#f2f2f7",
    surfaceContainerHighest: "#ececec",

    // Text colors
    onSurface: "#1c1c1e",
    onSurfaceVariant: "#6e6e73",
    onOutline: "#1c1c1e",
    primary: "#007aff",
    onPrimary: "#ffffff",

    // Syntax colors (VS Code light-like)
    syntax: {
      keyword: "#0000ff",
      string: "#a31515",
      number: "#098658",
      comment: "#008000",
      function: "#795e26",
      variable: "#001080",
      property: "#001080",
      tag: "#800000",
      operator: "#000000",
      punctuation: "#000000",
      boolean: "#0000ff",
      builtin: "#267f99",
      className: "#267f99",
      regex: "#811f3f",
    },

    // UI colors
    cursor: "#007aff",
    selection: "rgba(0,122,255,0.22)",
    scrollbar: "#c7c7cc",
    scrollbarHover: "#a1a1a6",
    lineNumber: "#8e8e93",
    lineNumberActive: "#1c1c1e",
    currentLine: "#f5f5f7",
    bracketMatch: "#e5e5ea",
    background: "#ffffff",
    gutterBackground: "#f5f5f7",
    indentGuide: "#e5e5ea",
  }
};

const ColorCodeEditor: React.FC<ColorCodeEditorProps> = ({
  value,
  onChange,
  language,
  theme,
  minHeight = "500px",
  className = "",
  style,
  spellCheck = false,
  onKeyDown,
  onScroll,
  wrap = "soft",
  tabSize = 2,
  lineHeight = "1.6",
  fontSize = "14px",
  readOnly = false,
  placeholder = "",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [matchingBracket, setMatchingBracket] = useState<{ line: number; column: number } | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);

  const isDark = theme === "dark";
  const colors = isDark ? MATERIAL_COLORS.dark : MATERIAL_COLORS.light;
  const editorShadow = isDark
    ? "0 1px 8px rgba(0,0,0,0.45)"
    : "0 1px 8px rgba(15,23,42,0.12)";

  // Calculate line height
  const lineHeightNum = useMemo(() => {
    const match = lineHeight.match(/(\d+(?:\.\d+)?)(px|em|rem|%)/);
    if (!match) return 22;
    const num = parseFloat(match[1]);
    const unit = match[2];
    if (unit === 'em' || unit === 'rem') return num * 16;
    if (unit === '%') return (num / 100) * 22;
    return num;
  }, [lineHeight]);

  // Advanced tokenizer with comprehensive language support
  const tokenize = useCallback((text: string, lang: CodeLanguage): Array<{ type: string; value: string; start: number; end: number }> => {
    const tokens: Array<{ type: string; value: string; start: number; end: number }> = [];
    let pos = 0;

    const keywords: Record<string, Set<string>> = {
      js: new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'true', 'false', 'null', 'undefined', 'this', 'new', 'class', 'extends', 'super', 'import', 'export', 'from', 'default', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield', 'instanceof', 'typeof', 'in', 'of', 'with', 'do', 'void', 'delete', 'as', 'get', 'set', 'static', 'private', 'public', 'protected', 'readonly', 'abstract', 'interface', 'implements', 'package', 'boolean', 'number', 'string', 'symbol', 'bigint', 'any', 'void', 'never', 'unknown', 'object', 'enum', 'module', 'namespace', 'require', 'module', 'exports', 'yield', 'await', 'async']),
      json: new Set(['true', 'false', 'null']),
      css: new Set(['px', 'em', 'rem', 'vh', 'vw', '%', 'rgb', 'rgba', 'hsl', 'hsla', 'calc', 'var', 'min', 'max', 'clamp', 'url', 'inherit', 'initial', 'unset', 'revert', 'important', 'auto', 'none', 'block', 'inline', 'flex', 'grid', 'hidden', 'visible', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'bold', 'bolder', 'lighter', 'normal', 'italic', 'oblique', 'uppercase', 'lowercase', 'capitalize', 'full-width', 'small-caps', 'break-word', 'ellipsis', 'clip', 'wrap', 'nowrap', 'left', 'right', 'center', 'justify', 'start', 'end', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'row', 'row-reverse', 'column', 'column-reverse', 'stretch', 'baseline', 'first', 'last', 'both']),
      html: new Set(['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'width', 'height', 'type', 'value', 'name', 'placeholder', 'required', 'disabled', 'readonly', 'selected', 'checked', 'multiple', 'maxlength', 'minlength', 'pattern', 'accept', 'action', 'method', 'enctype', 'target', 'rel', 'media', 'sizes', 'srcset', 'loading', 'async', 'defer', 'nomodule', 'data', 'aria', 'role', 'tabindex', 'contenteditable', 'spellcheck', 'autofocus', 'autocomplete', 'novalidate', 'form', 'formaction', 'formenctype', 'formmethod', 'formtarget', 'list', 'min', 'max', 'step']),
    };

    const builtins = new Set(['console', 'window', 'document', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Function', 'Promise', 'Set', 'Map', 'Error', 'TypeError', 'SyntaxError', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'encodeURI', 'fetch', 'localStorage', 'sessionStorage', 'alert', 'confirm', 'prompt', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'encodeURI', 'fetch', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy', 'Reflect', 'Symbol', 'Intl', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request', 'Response', 'EventSource', 'WebSocket', 'XMLHttpRequest']);

    const operators = new Set(['+', '-', '*', '/', '%', '=', '!', '<', '>', '&', '|', '^', '~', '?', ':', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '>>>', '&&', '||', '??', '==', '!=', '===', '!==', '<=', '>=', '=>', '**', '++', '--']);

    const advance = (n: number) => { pos += n; };

    while (pos < text.length) {
      const remaining = text.slice(pos);

      // Whitespace
      if (/^\s+/.test(remaining)) {
        const match = remaining.match(/^\s+/);
        const length = match![0].length;
        tokens.push({ type: 'whitespace', value: match![0], start: pos, end: pos + length });
        advance(length);
        continue;
      }

      // Single line comment
      if (/^\/\/.*/.test(remaining)) {
        const match = remaining.match(/^\/\/.*/);
        const length = match![0].length;
        tokens.push({ type: 'comment', value: match![0], start: pos, end: pos + length });
        advance(length);
        continue;
      }

      // Multi-line comment
      if (/^\/\*[\s\S]*?\*\//.test(remaining)) {
        const match = remaining.match(/^\/\*[\s\S]*?\*\//);
        const length = match![0].length;
        tokens.push({ type: 'comment', value: match![0], start: pos, end: pos + length });
        advance(length);
        continue;
      }

      // String literals
      if (/^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])*'|^`(?:\\.|[^`\\])*`/.test(remaining)) {
        const match = remaining.match(/^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])*'|^`(?:\\.|[^`\\])*`/);
        const length = match![0].length;
        tokens.push({ type: 'string', value: match![0], start: pos, end: pos + length });
        advance(length);
        continue;
      }

      // Template string expressions
      if (/^\$\{[^}]+\}/.test(remaining)) {
        const match = remaining.match(/^\$\{[^}]+\}/);
        const length = match![0].length;
        tokens.push({ type: 'string', value: match![0], start: pos, end: pos + length });
        advance(length);
        continue;
      }

      // Numbers
      if (/^\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/.test(remaining)) {
        const match = remaining.match(/^\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/);
        const length = match![0].length;
        tokens.push({ type: 'number', value: match![0], start: pos, end: pos + length });
        advance(length);
        continue;
      }

      // Regular expression (JS only)
      if (lang === 'js' || lang === 'jsx' || lang === 'ts' || lang === 'tsx') {
        if (/^\/(?![/*])(?:\\.|[^[\\/])*\/[gimsuy]*/.test(remaining)) {
          const match = remaining.match(/^\/(?![/*])(?:\\.|[^[\\/])*\/[gimsuy]*/);
          const length = match![0].length;
          tokens.push({ type: 'regex', value: match![0], start: pos, end: pos + length });
          advance(length);
          continue;
        }
      }

      // Punctuation (brackets, braces, etc.)
      if (/^[{}[\](),.;:!?]/.test(remaining)) {
        const match = remaining.match(/^[{}[\](),.;:!?]/);
        tokens.push({ type: 'punctuation', value: match![0], start: pos, end: pos + 1 });
        advance(1);
        continue;
      }

      // Operators
      const opMatch = remaining.match(/^(===|!==|==|!=|<=|>=|=>|&&|\|\||\|\?=|<<|>>|>>>|\+\+|--|\+|-|\*|\/|%|=|!|&|\||\^|~|\?|:)/);
      if (opMatch) {
        const length = opMatch[0].length;
        tokens.push({ type: 'operator', value: opMatch[0], start: pos, end: pos + length });
        advance(length);
        continue;
      }

      // Identifiers and keywords
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*/.test(remaining)) {
        const match = remaining.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
        const word = match![0];

        const langKey = (lang === 'jsx' || lang === 'tsx') ? 'js' : lang;
        const keywordSet = keywords[langKey] || new Set();

        let type = "variable";
        if (keywordSet.has(word)) type = "keyword";
        else if (builtins.has(word)) type = "builtin";
        else if (['true', 'false', 'null', 'undefined'].includes(word)) type = "boolean";
        else if (/^[A-Z]/.test(word) || word.includes('.') || word.includes('-') || word.startsWith('$')) type = "className";
        else if (word.startsWith('_')) type = "variable";
        tokens.push({ type, value: word, start: pos, end: pos + word.length });
        advance(word.length);
        continue;
      }

      // Default: treat as text
      tokens.push({ type: 'text', value: remaining[0], start: pos, end: pos + 1 });
      advance(1);
    }

    return tokens;
  }, []);

  // Process lines with tokenization
  const lineData = useMemo(() => {
    const lines = value.split('\n');
    const allTokens = tokenize(value, language);
    let tokenIdx = 0;
    let charPos = 0;

    return lines.map((lineStr, lineIdx) => {
      const lineTokens: Array<{ type: string; value: string }> = [];
      const lineEnd = charPos + lineStr.length + (lineIdx < lines.length - 1 ? 1 : 0);

      while (tokenIdx < allTokens.length && charPos < lineEnd) {
        const token = allTokens[tokenIdx];
        const tokenStart = token.start;
        const tokenEnd = token.end;

        if (tokenStart >= charPos && tokenStart < lineEnd) {
          const valueInLine = value.slice(tokenStart, Math.min(tokenEnd, lineEnd));
          if (valueInLine) {
            lineTokens.push({ type: token.type, value: valueInLine });
          }
        }

        charPos = tokenEnd;
        tokenIdx++;
      }

      // If we've processed beyond this line, continue to next
      if (charPos >= lineEnd && lineIdx < lines.length - 1) {
        charPos = lineEnd; // Account for newline
      }

      return {
        line: lineIdx + 1,
        content: lineStr,
        tokens: lineTokens,
      };
    });
  }, [value, language, tokenize]);

  const lineCount = lineData.length;

  // Bracket matching
  const findMatchingBracket = useCallback((text: string, pos: number): { line: number; column: number } | null => {
    const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const reverse: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

    const checkPos = (idx: number) => {
      const char = text[idx];
      if (brackets[char]) {
        let depth = 0;
        let i = idx + 1;
        while (i < text.length) {
          if (text[i] === char) depth++;
          if (text[i] === brackets[char]) {
            if (depth === 0) {
              const before = text.slice(0, i);
              const lines = before.split('\n');
              return { line: lines.length, column: lines[lines.length - 1].length + 1 };
            }
            depth--;
          }
          i++;
        }
      } else if (reverse[char]) {
        let depth = 0;
        let i = idx - 1;
        while (i >= 0) {
          if (text[i] === char) depth++;
          if (text[i] === reverse[char]) {
            if (depth === 0) {
              const before = text.slice(0, i + 1);
              const lines = before.split('\n');
              return { line: lines.length, column: i - before.lastIndexOf('\n') };
            }
            depth--;
          }
          i--;
        }
      }
      return null;
    };

    // Check cursor position and before cursor
    if (pos < text.length) {
      const result = checkPos(pos);
      if (result) return result;
    }
    if (pos > 0) {
      const result = checkPos(pos - 1);
      if (result) return result;
    }
    return null;
  }, []);

  // Handlers
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setScrollTop(target.scrollTop);
    setScrollLeft(target.scrollLeft);
    if (onScroll) onScroll(e);
  }, [onScroll]);

  const updateCursor = useCallback(() => {
    if (!textareaRef.current) return;
    const text = value.substring(0, textareaRef.current.selectionStart);
    const lines = text.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    setCursor({ line, column });

    const pos = textareaRef.current.selectionStart;
    const match = findMatchingBracket(value, pos);
    setMatchingBracket(match);
  }, [value, findMatchingBracket]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    updateCursor();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!readOnly && textareaRef.current) {
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const spaces = ' '.repeat(tabSize);
        const newValue = value.substring(0, start) + spaces + value.substring(end);
        onChange(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + tabSize;
            textareaRef.current.focus();
          }
        }, 0);
      }
    }

    if (e.key === 'Enter' && !readOnly) {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineContent = value.substring(lineStart, start);
        const indent = lineContent.match(/^\s*/)?.[0] || '';
        const newValue = value.substring(0, start) + '\n' + indent + value.substring(start);
        onChange(newValue);
        setTimeout(() => {
          if (textarea) {
            textarea.selectionStart = textarea.selectionEnd = start + 1 + indent.length;
            textarea.focus();
          }
        }, 0);
      }
    }

    if (onKeyDown) onKeyDown(e);
  };

  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setIsFocused(false);

  // Effects
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('keyup', updateCursor);
      textarea.addEventListener('click', updateCursor);
      textarea.addEventListener('select', updateCursor);
      textarea.addEventListener('focus', handleFocus);
      textarea.addEventListener('blur', handleBlur);
      return () => {
        textarea.removeEventListener('keyup', updateCursor);
        textarea.removeEventListener('click', updateCursor);
        textarea.removeEventListener('select', updateCursor);
        textarea.removeEventListener('focus', handleFocus);
        textarea.removeEventListener('blur', handleBlur);
      };
    }
  }, [updateCursor]);

  // Scroll cursor into view
  useEffect(() => {
    if (textareaRef.current && isFocused) {
      const lineTop = (cursor.line - 1) * lineHeightNum;
      const lineBottom = cursor.line * lineHeightNum;
      const textarea = textareaRef.current;

      if (lineTop < textarea.scrollTop) {
        textarea.scrollTop = lineTop;
      } else if (lineBottom > textarea.scrollTop + textarea.clientHeight) {
        textarea.scrollTop = lineBottom - textarea.clientHeight / 2;
      }
    }
  }, [cursor.line, lineHeightNum, isFocused]);

  // Render token with Material Design styling
  const renderToken = (token: { type: string; value: string }, lineNum: number, tokenIdx: number) => {
    const syntaxColors = colors.syntax;

    let color = colors.onSurface;
    let fontWeight: string | number = 'normal';
    let fontStyle: 'normal' | 'italic' = 'normal';
    let textDecoration: string | undefined;
    let backgroundColor: string | undefined;
    let borderRadius: string | undefined;

    switch (token.type) {
      case 'keyword':
        color = syntaxColors.keyword;
        fontWeight = 600;
        break;
      case 'string':
        color = syntaxColors.string;
        break;
      case 'number':
        color = syntaxColors.number;
        break;
      case 'comment':
        color = syntaxColors.comment;
        fontStyle = 'italic';
        break;
      case 'function':
        color = syntaxColors.function;
        fontWeight = 500;
        break;
      case 'builtin':
        color = syntaxColors.builtin;
        fontWeight = 500;
        break;
      case 'className':
        color = syntaxColors.className;
        fontWeight = 500;
        break;
      case 'variable':
        color = syntaxColors.variable;
        break;
      case 'property':
        color = syntaxColors.property;
        break;
      case 'tag':
        color = syntaxColors.tag;
        fontWeight = 600;
        break;
      case 'operator':
        color = syntaxColors.operator;
        break;
      case 'punctuation':
        color = syntaxColors.punctuation;
        break;
      case 'boolean':
      case 'null':
        color = syntaxColors.boolean;
        fontWeight = 600;
        break;
      case 'regex':
        color = syntaxColors.regex;
        break;
      case 'whitespace':
        color = 'transparent';
        break;
    }

    // Highlight matching brackets
    if (token.type === 'punctuation' && (token.value === '(' || token.value === ')' ||
        token.value === '[' || token.value === ']' ||
        token.value === '{' || token.value === '}')) {
      if (matchingBracket?.line === lineNum && matchingBracket?.column === tokenIdx + 1) {
        backgroundColor = colors.bracketMatch;
        borderRadius = '2px';
      }
    }

    return (
      <span
        key={tokenIdx}
        style={{
          color,
          fontWeight,
          fontStyle,
          textDecoration,
          backgroundColor,
          borderRadius,
          padding: backgroundColor ? '1px 2px' : undefined,
        }}
      >
        {token.value}
      </span>
    );
  };

  // Syntax color indicator for status bar
  const getSyntaxIndicator = () => {
    return (
      <div className="flex items-center gap-3">
        {[
          { type: 'keyword', color: colors.syntax.keyword },
          { type: 'string', color: colors.syntax.string },
          { type: 'function', color: colors.syntax.function },
          { type: 'comment', color: colors.syntax.comment },
        ].map(({ type, color }) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{
                backgroundColor: color,
                boxShadow: isDark ? `0 0 4px ${color}` : `0 0 4px ${color}80`,
              }}
            />
            <span style={{ fontSize: '11px', color: colors.onSurfaceVariant }}>{type}</span>
          </div>
        ))}
      </div>
    );
  };

  const handleLineClick = (lineNum: number) => {
    if (textareaRef.current) {
      const lines = value.split('\n');
      let charPos = 0;
      for (let i = 0; i < lineNum - 1; i++) {
        charPos += lines[i].length + 1; // +1 for newline
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(charPos, charPos);
    }
  };

  return (
    <div
      className={`material-design-code-editor ${className}`}
      style={{
        minHeight,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.outline}`,
        borderRadius: '18px',
        overflow: 'hidden',
        fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize,
        lineHeight,
        position: "relative",
        boxShadow: isFocused
          ? `0 0 0 2px ${colors.primary}55, ${editorShadow}`
          : editorShadow,
        ...style,
      }}
    >
      {/* App Bar - Material Design Style */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: colors.surfaceVariant,
          borderBottom: `1px solid ${colors.outline}`,
          minHeight: '56px',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Material icon placeholder */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${colors.primary}1f`,
              color: colors.primary,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
            </svg>
          </div>

          <div>
            <div
              className="text-sm font-medium"
              style={{ color: colors.onSurface, fontFamily: "'SF Pro Text', 'Segoe UI', system-ui, sans-serif" }}
            >
              {placeholder || `${language.toUpperCase()} Editor`}
            </div>
            <div
              className="text-xs"
              style={{ color: colors.onSurfaceVariant, marginTop: '2px' }}
            >
              {readOnly ? 'Read-only' : 'Editable'} • {lineCount} lines
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Chip for language */}
          <div
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${colors.primary}1a`,
              color: colors.primary,
              border: `1px solid ${colors.primary}40`,
              letterSpacing: "0.06em",
            }}
          >
            {language.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex" style={{ height: `calc(100% - 56px)` }}>
        {/* Line Numbers - Material Style */}
        <div
          className="flex-shrink-0 relative overflow-hidden"
          style={{
            width: '56px',
            backgroundColor: colors.surfaceContainerHighest,
            borderRight: `1px solid ${colors.outline}`,
            fontSize,
            lineHeight,
            backgroundImage: isDark
              ? "linear-gradient(180deg, rgba(15,23,42,0.4), rgba(2,6,23,0.8))"
              : "linear-gradient(180deg, rgba(226,232,240,0.6), rgba(241,245,249,0.9))",
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => i + 1).map((lineNum) => (
            <div
              key={lineNum}
              className="flex items-center justify-end pr-3 cursor-pointer transition-all select-none hover:bg-black/5 dark:hover:bg-white/5"
              style={{
                height: lineHeightNum,
                color: cursor.line === lineNum ? colors.primary : colors.onSurfaceVariant,
                fontFamily: 'inherit',
                fontSize,
                backgroundColor: cursor.line === lineNum ? colors.surfaceContainer : 'transparent',
                borderLeft: cursor.line === lineNum
                  ? `3px solid ${colors.primary}`
                  : '3px solid transparent',
              }}
              onClick={() => handleLineClick(lineNum)}
            >
              {lineNum}
            </div>
          ))}
        </div>

        {/* Code Editor Area */}
        <div
          className="relative flex-1 overflow-hidden"
          style={{ backgroundColor: colors.surface }}
        >
          {/* Highlighted content layer */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              padding: '12px 12px 12px 8px',
              color: 'transparent',
            }}
          >
            <div
              style={{
                minHeight: `${lineCount * lineHeightNum}px`,
                transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
              }}
            >
              {lineData.map((line, lineIdx) => (
                <div
                  key={lineIdx}
                  className="flex"
                  style={{
                    height: lineHeightNum,
                    lineHeight,
                  }}
                >
                  <div
                    className="flex-1"
                    style={{
                      color: colors.onSurface,
                      fontSize,
                      fontFamily: 'inherit',
                      whiteSpace: wrap === 'off' ? 'pre' : 'pre-wrap',
                      wordBreak: 'normal',
                    }}
                  >
                    {line.tokens.length > 0 ? (
                      line.tokens.map((token, tokenIdx) => renderToken(token, line.line, tokenIdx))
                    ) : (
                      <span style={{ opacity: 0.9 }}>{line.content || '\n'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Textarea overlay for input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onMouseUp={updateCursor}
            onClick={updateCursor}
            spellCheck={spellCheck}
            placeholder={placeholder}
            className="absolute inset-0 w-full h-full outline-none resize-none bg-transparent z-10"
            style={{
              color: 'transparent',
              caretColor: isFocused ? colors.primary : colors.onSurfaceVariant,
              backgroundColor: 'transparent',
              fontSize,
              lineHeight,
              tabSize,
              fontFamily: 'inherit',
              whiteSpace: wrap === 'off' ? 'pre' : 'pre-wrap',
              overflowWrap: wrap === 'off' ? 'normal' : 'break-word',
              padding: '12px 12px 12px 8px',
              margin: 0,
              border: 'none',
              outline: 'none',
              resize: 'none',
              cursor: 'text',
            }}
            readOnly={readOnly}
            wrap="off"
          />
        </div>

        {/* Right scrollbar styling will be handled by CSS */}
      </div>

      {/* Status Bar - Material Design */}
      <div
        className="flex items-center justify-between px-4 py-1.5 border-t"
        style={{
          backgroundColor: colors.surfaceVariant,
          borderColor: colors.outline,
          minHeight: '32px',
        }}
      >
        <div className="flex items-center gap-4">
          {getSyntaxIndicator()}
        </div>

        <div className="flex items-center gap-4 text-xs" style={{ color: colors.onSurfaceVariant }}>
          <span className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            {value ? `${value.length} chars` : 'Empty'}
          </span>
          <span>UTF-8</span>
          {isFocused && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded"
              style={{
                backgroundColor: `${colors.primary}15`,
                color: colors.primary,
                fontSize: '10px',
              }}
            >
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: colors.primary }}
              />
              Focused
            </span>
          )}
        </div>
      </div>

      {/* Custom Scrollbars */}
      <style>{`
        .material-design-code-editor ::-webkit-scrollbar {
          width: 14px;
          height: 14px;
        }
        .material-design-code-editor ::-webkit-scrollbar-track {
          background: ${colors.surfaceContainerHighest};
        }
        .material-design-code-editor ::-webkit-scrollbar-thumb {
          background: ${colors.scrollbar};
          border: 3px solid ${colors.surfaceContainerHighest};
          border-radius: 7px;
        }
        .material-design-code-editor ::-webkit-scrollbar-thumb:hover {
          background: ${colors.scrollbarHover};
        }
        .material-design-code-editor ::-webkit-scrollbar-corner {
          background: ${colors.surfaceContainerHighest};
        }

        /* Firefox scrollbar */
        .material-design-code-editor {
          scrollbar-width: thin;
          scrollbar-color: ${colors.scrollbar} ${colors.surfaceContainerHighest};
        }

        .material-design-code-editor textarea::selection {
          background-color: ${colors.selection};
        }

        .material-design-code-editor textarea:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
};

export default ColorCodeEditor;
