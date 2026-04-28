import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";

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

// Zed/Linear-inspired minimalist palette
const MODERN_COLORS = {
  dark: {
    bg: "#18181b", // Deep sleek background
    gutterBg: "#18181b", // Flush gutter
    gutterText: "#52525b", // Subtle line numbers
    gutterActive: "#e4e4e7", // Bright active line number
    text: "#e4e4e7", // Main code text
    selection: "rgba(56, 189, 248, 0.25)", // Crisp blue selection
    activeLineBg: "rgba(255, 255, 255, 0.03)",
    scrollbar: "#3f3f46",
    scrollbarHover: "#52525b",
  },
  light: {
    bg: "#ffffff",
    gutterBg: "#ffffff",
    gutterText: "#a1a1aa",
    gutterActive: "#18181b",
    text: "#18181b",
    selection: "rgba(14, 165, 233, 0.2)",
    activeLineBg: "rgba(0, 0, 0, 0.03)",
    scrollbar: "#d4d4d8",
    scrollbarHover: "#a1a1aa",
  },
};

const ColorCodeEditor: React.FC<ColorCodeEditorProps> = ({
  value,
  onChange,
  language,
  theme,
  minHeight = "100%",
  className = "",
  style,
  spellCheck = false,
  onKeyDown,
  onScroll,
  wrap = "off",
  tabSize = 2,
  lineHeight = "1.6",
  fontSize = "14px",
  readOnly = false,
  placeholder = "",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [isFocused, setIsFocused] = useState(false);

  const isDark = theme === "dark";
  const colors = isDark ? MODERN_COLORS.dark : MODERN_COLORS.light;

  // Strict Line Height Parsing (prevents drift)
  const lineHeightNum = useMemo(() => {
    const baseFontSize = parseInt(fontSize) || 14;
    const match = String(lineHeight).match(/^(\d+(?:\.\d+)?)(px|em|rem|%)?$/);

    if (!match) return Math.round(1.6 * baseFontSize);

    const num = parseFloat(match[1]);
    const unit = match[2];

    if (unit === "px") return num;
    if (unit === "em" || unit === "rem") return num * baseFontSize;
    if (unit === "%") return (num / 100) * baseFontSize;

    return num * baseFontSize;
  }, [lineHeight, fontSize]);

  const lineCount = useMemo(() => {
    return value.split("\n").length || 1;
  }, [value]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      setScrollTop(target.scrollTop);
      if (onScroll) onScroll(e);
    },
    [onScroll],
  );

  const updateCursor = useCallback(() => {
    if (!textareaRef.current) return;
    const text = value.substring(0, textareaRef.current.selectionStart);
    const lines = text.split("\n");
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    setCursor({ line, column });
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    updateCursor();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (!readOnly && textareaRef.current) {
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const spaces = " ".repeat(tabSize);
        const newValue =
          value.substring(0, start) + spaces + value.substring(end);
        onChange(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart =
              textareaRef.current.selectionEnd = start + tabSize;
          }
        }, 0);
      }
    }
    if (onKeyDown) onKeyDown(e);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener("keyup", updateCursor);
      textarea.addEventListener("click", updateCursor);
      textarea.addEventListener("select", updateCursor);
      return () => {
        textarea.removeEventListener("keyup", updateCursor);
        textarea.removeEventListener("click", updateCursor);
        textarea.removeEventListener("select", updateCursor);
      };
    }
  }, [updateCursor]);

  const handleLineClick = (lineNum: number) => {
    if (textareaRef.current) {
      const lines = value.split("\n");
      let charPos = 0;
      for (let i = 0; i < lineNum - 1; i++) {
        charPos += lines[i].length + 1;
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(charPos, charPos);
    }
  };

  return (
    <div
      className={`nx-raw-editor ${className}`}
      style={{
        minHeight,
        height: "100%",
        backgroundColor: colors.bg,
        overflow: "hidden",
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
        fontSize,
        lineHeight: `${lineHeightNum}px`,
        position: "relative",
        display: "flex",
        ...style,
      }}
    >
      {/* Sleek, flush gutter */}
      <div
        className="nx-editor-gutter"
        style={{
          flexShrink: 0,
          width: "48px",
          backgroundColor: colors.gutterBg,
          fontSize: "12px", // Slightly smaller numbers
          lineHeight: `${lineHeightNum}px`,
          userSelect: "none",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            transform: `translateY(${-scrollTop}px)`,
            paddingTop: "16px",
            paddingBottom: "16px",
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => i + 1).map((lineNum) => {
            const isActive = cursor.line === lineNum;
            return (
              <div
                key={lineNum}
                style={{
                  height: `${lineHeightNum}px`,
                  color: isActive ? colors.gutterActive : colors.gutterText,
                  textAlign: "right",
                  paddingRight: "16px",
                  cursor: "pointer",
                  fontWeight: isActive ? 500 : 400,
                  opacity: isActive ? 1 : 0.6,
                }}
                onClick={() => handleLineClick(lineNum)}
              >
                {lineNum}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edge-to-edge Textarea */}
      <div
        className="nx-editor-content relative flex-1"
        style={{ backgroundColor: colors.bg }}
      >
        {/* Subtle active line background highlight */}
        <div
          className="nx-active-line-bg pointer-events-none absolute w-full"
          style={{
            height: `${lineHeightNum}px`,
            backgroundColor: colors.activeLineBg,
            top: `${(cursor.line - 1) * lineHeightNum + 16 - scrollTop}px`, // 16px matches textarea paddingTop
            left: 0,
            zIndex: 1,
            display: isFocused ? "block" : "none",
          }}
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onMouseUp={updateCursor}
          onClick={updateCursor}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          spellCheck={spellCheck}
          placeholder={placeholder}
          className="nx-editor-textarea absolute inset-0 w-full h-full"
          style={{
            color: colors.text,
            backgroundColor: "transparent",
            fontSize,
            lineHeight: `${lineHeightNum}px`,
            tabSize,
            fontFamily: "inherit",
            whiteSpace: wrap === "off" ? "pre" : "pre-wrap",
            overflowWrap: wrap === "off" ? "normal" : "break-word",
            padding: "16px 16px 16px 4px", // Flush left padding, aligns tight with gutter
            margin: 0,
            border: "none",
            outline: "none",
            resize: "none",
            zIndex: 10,
          }}
          readOnly={readOnly}
          wrap="off"
        />
      </div>

      <style>{`
        .nx-raw-editor .nx-editor-textarea::-webkit-scrollbar { 
          width: 14px; 
          height: 14px; 
        }
        .nx-raw-editor .nx-editor-textarea::-webkit-scrollbar-track { 
          background: transparent; 
        }
        .nx-raw-editor .nx-editor-textarea::-webkit-scrollbar-thumb {
          background: ${colors.scrollbar};
          border: 4px solid ${colors.bg};
          border-radius: 8px;
        }
        .nx-raw-editor .nx-editor-textarea::-webkit-scrollbar-thumb:hover { 
          background: ${colors.scrollbarHover}; 
        }
        .nx-raw-editor .nx-editor-textarea::-webkit-scrollbar-corner { 
          background: transparent; 
        }
        .nx-raw-editor .nx-editor-textarea::selection { 
          background-color: ${colors.selection}; 
        }
      `}</style>
    </div>
  );
};

export default ColorCodeEditor;
