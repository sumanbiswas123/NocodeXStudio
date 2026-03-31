import type { PreviewConsoleEntry } from "./appHelpers";

export const escapeConsoleHtml = (value: string): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type RenderDetachedConsoleWindowOptions = {
  detachedWindow: Window;
  entries: PreviewConsoleEntry[];
  warnCount: number;
  errorCount: number;
  theme: "dark" | "light";
};

export const renderDetachedConsoleWindow = ({
  detachedWindow,
  entries,
  warnCount,
  errorCount,
  theme,
}: RenderDetachedConsoleWindowOptions) => {
  const rows =
    entries.length === 0
      ? `<div class="empty">No project logs yet</div>`
      : entries
          .map((entry) => {
            const levelClass =
              entry.level === "error"
                ? "error"
                : entry.level === "warn"
                  ? "warn"
                  : "info";
            return `<div class="row ${levelClass}">
  <div class="meta">${escapeConsoleHtml(entry.level.toUpperCase())} • ${escapeConsoleHtml(entry.source || "preview")}</div>
  <div class="message">${escapeConsoleHtml(entry.message)}</div>
</div>`;
          })
          .join("");

  detachedWindow.document.open();
  detachedWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>NoCodeX Console</title>
  <style>
    :root { color-scheme: ${theme === "dark" ? "dark" : "light"}; }
    body {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: ${theme === "dark" ? "#020617" : "#f8fafc"};
      color: ${theme === "dark" ? "#e2e8f0" : "#0f172a"};
    }
    .shell { display: flex; flex-direction: column; height: 100vh; }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border-bottom: 1px solid ${theme === "dark" ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.2)"};
      background: ${theme === "dark" ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)"};
      position: sticky; top: 0;
    }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; }
    .badge {
      font-size: 11px; padding: 4px 8px; border-radius: 999px;
      border: 1px solid ${theme === "dark" ? "rgba(148,163,184,0.3)" : "rgba(148,163,184,0.25)"};
      background: ${theme === "dark" ? "rgba(30,41,59,0.7)" : "rgba(241,245,249,0.95)"};
    }
    .body { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .row {
      border-radius: 12px; padding: 10px 12px;
      border: 1px solid ${theme === "dark" ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.18)"};
      background: ${theme === "dark" ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.95)"};
      white-space: pre-wrap; word-break: break-word;
    }
    .row.warn { border-color: rgba(245,158,11,0.35); }
    .row.error { border-color: rgba(239,68,68,0.35); }
    .meta { font-size: 10px; opacity: 0.7; margin-bottom: 6px; }
    .message { font-size: 12px; line-height: 1.45; }
    .empty {
      flex: 1; display: flex; align-items: center; justify-content: center;
      border: 1px dashed ${theme === "dark" ? "rgba(148,163,184,0.3)" : "rgba(148,163,184,0.25)"};
      border-radius: 16px; min-height: 160px; font-size: 12px; opacity: 0.75;
    }
    button {
      border: 1px solid ${theme === "dark" ? "rgba(148,163,184,0.3)" : "rgba(148,163,184,0.25)"};
      background: transparent; color: inherit; border-radius: 10px; padding: 8px 10px; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <div class="badges">
        <span class="badge">Logs ${entries.length}</span>
        <span class="badge">Warn ${warnCount}</span>
        <span class="badge">Error ${errorCount}</span>
      </div>
      <button onclick="window.close()">Close</button>
    </div>
    <div class="body">${rows}</div>
  </div>
</body>
</html>`);
  detachedWindow.document.close();
};
