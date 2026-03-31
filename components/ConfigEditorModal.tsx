
import React, { useEffect, useMemo, useState } from "react";
import { FileMap } from "../types";
import { GripVertical, Plus, Save, Search, Settings2, ShieldAlert, Trash2, X } from "lucide-react";
import ColorCodeEditor from "./ColorCodeEditor";

interface ConfigEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabKey;
  slidesOnlyMode?: boolean;
  configContent: string | null;
  portfolioContent: string | null;
  onSave: (newConfigContent: string, newPortfolioContent: string) => void;
  theme: "light" | "dark";
  autoSaveEnabled: boolean;
  onAutoSaveChange: (val: boolean) => void;
  panelSide: "default" | "swapped";
  onPanelSideChange: (val: "default" | "swapped") => void;
  hasProjectConfig?: boolean;
  selectedSlideCloneSource?: string | null;
  onSelectSlideCloneSource?: (slideId: string) => void;
  files: FileMap;
}

interface MtConfigPayload {
  [key: string]: any;
  presentation?: string;
  pagesAll?: string[];
  maxZoom?: number;
  veevaSwipe?: string;
}

type TabKey =
  | "references"
  | "slides"
  | "configRaw"
  | "general";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "references", label: "References" },
  { key: "slides", label: "Slides" },
  { key: "configRaw", label: "Config.js" },
];

const REFERENCE_TEXT_LIST_KEYS = ["referencesAll", "footnotesAll", "abbreviationAll"] as const;
const REFERENCE_FLAG_KEYS = [
  "tabReferences",
  "allReferencesAlphabetical",
  "referencesTabFunctionality",
  "abbreviationSingle",
  "embedPopupReferences",
  "isReferenceOrderLabel",
] as const;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toLabel = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (m) => m.toUpperCase());

const extractBalancedObjectAt = (
  content: string,
  braceStart: number,
): { literal: string; start: number; end: number } | null => {
  if (braceStart < 0) return null;
  let depth = 0;
  let inStr: "'" | '"' | "`" | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;
  for (let i = braceStart; i < content.length; i += 1) {
    const ch = content[i];
    const next = i + 1 < content.length ? content[i + 1] : "";
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      escaped = false;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { literal: content.slice(braceStart, i + 1), start: braceStart, end: i + 1 };
    }
  }
  return null;
};

const extractObjectLiteral = (content: string): { literal: string; start: number; end: number } | null => {
  const assignmentPatterns = [
    /com\.gsk\.mtconfig\s*=\s*/i,
    /module\.exports\s*=\s*/i,
    /(?:var|let|const)\s+config\s*=\s*/i,
  ];
  for (const pattern of assignmentPatterns) {
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

const parseConfig = (content: string): MtConfigPayload | null => {
  if (!content) return null;
  const block = extractObjectLiteral(content);
  if (block) {
    try {
      const parsed = new Function(`return (${block.literal});`)();
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try JSON fallback below.
    }
  }
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? (parsed as MtConfigPayload) : null;
  } catch {
    // Tolerate JSON-like config with comments/trailing semicolon.
  }
  try {
    const cleaned = stripComments(content).replace(/;\s*$/, "");
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as MtConfigPayload) : null;
  } catch {
    return null;
  }
};

const replaceConfigObject = (content: string, payload: MtConfigPayload) => {
  const block = extractObjectLiteral(content);
  if (block) {
    return content.slice(0, block.start) + JSON.stringify(payload, null, 4) + content.slice(block.end);
  }
  try {
    JSON.parse(content);
    return JSON.stringify(payload, null, 2);
  } catch {
    return content;
  }
};

const parseArrayText = (raw: string) =>
  raw.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean).map((x) => {
    if (x === "true") return true;
    if (x === "false") return false;
    if (!Number.isNaN(Number(x)) && x !== "") return Number(x);
    return x;
  });

const ConfigEditorModal: React.FC<ConfigEditorModalProps> = ({
  isOpen,
  onClose,
  initialTab = "references",
  slidesOnlyMode = false,
  configContent,
  portfolioContent,
  onSave,
  theme,
  autoSaveEnabled,
  onAutoSaveChange,
  panelSide,
  onPanelSideChange,
  hasProjectConfig = true,
  selectedSlideCloneSource = null,
  onSelectSlideCloneSource,
  files,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [configDraft, setConfigDraft] = useState<MtConfigPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawConfig, setRawConfig] = useState("");
  const [rawPortfolio, setRawPortfolio] = useState("");
  const [rawConfigDirty, setRawConfigDirty] = useState(false);
  const [slideSearch, setSlideSearch] = useState("");
  const [referenceDrafts, setReferenceDrafts] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!isOpen) return;
    const src = configContent || "";
    setRawConfig(src);
    setRawPortfolio(portfolioContent || "");
    setRawConfigDirty(false);
    setSlideSearch("");
    const hasObjectLiteral = Boolean(extractObjectLiteral(src));
    let hasJsonObject = false;
    try {
      const parsed = JSON.parse(src);
      hasJsonObject = Boolean(parsed && typeof parsed === "object");
    } catch {
      hasJsonObject = false;
    }
    const parsed = parseConfig(src);
    console.groupCollapsed("[ConfigModal] Parse");
    console.info("[ConfigModal] Source length:", src.length);
    console.info("[ConfigModal] Has object literal assignment:", hasObjectLiteral);
    console.info("[ConfigModal] Looks like JSON object:", hasJsonObject);
    console.info("[ConfigModal] Parse success:", Boolean(parsed));
    if (!parsed) {
      console.warn(
        "[ConfigModal] Parse failed. First 240 chars:\n",
        src.slice(0, 240),
      );
    } else {
      console.info(
        "[ConfigModal] Parsed keys:",
        Object.keys(parsed).slice(0, 20),
      );
      console.info(
        "[ConfigModal] pagesAll length:",
        Array.isArray(parsed.pagesAll) ? parsed.pagesAll.length : 0,
      );
    }
    console.groupEnd();
    setConfigDraft(parsed);
    setParseError(parsed ? null : "Could not parse config.json. Use Config.js tab for raw edit.");
    if (parsed) {
      const nextDrafts: Record<string, string[]> = {};
      for (const key of REFERENCE_TEXT_LIST_KEYS) {
        const arr = Array.isArray(parsed[key])
          ? parsed[key].map((item: unknown) => String(item ?? ""))
          : [];
        nextDrafts[key] = [...arr, ""];
      }
      setReferenceDrafts(nextDrafts);
      // Determine default tab based on mode and parsing success
      if (slidesOnlyMode) {
        setActiveTab("slides");
      } else if (hasProjectConfig) {
        setActiveTab("references");
      } else {
        setActiveTab("general");
      }
    } else {
      setReferenceDrafts({});
      // If parsing failed, fallback to configRaw tab only when a project is loaded
      setActiveTab(hasProjectConfig ? "configRaw" : "general");
    }
  }, [isOpen, configContent, portfolioContent, hasProjectConfig]);

  const pagesAll = useMemo(() => {
    if (configDraft?.pagesAll && Array.isArray(configDraft.pagesAll)) {
      return configDraft.pagesAll.filter((x) => typeof x === "string");
    }
    return [] as string[];
  }, [configDraft]);

  const thumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const slideId of pagesAll) {
      const pattern = new RegExp(`(^|/)${escapeRegex(slideId)}/thumb\\.(png|jpg|jpeg|webp|gif|svg)$`, "i");
      const key = Object.keys(files).find((p) => pattern.test(p));
      const src = key ? files[key]?.content : "";
      if (typeof src === "string" && src) out[slideId] = src;
    }
    return out;
  }, [files, pagesAll]);

  const filteredSlides = useMemo(() => pagesAll.filter((s) => !slideSearch.trim() || s.toLowerCase().includes(slideSearch.toLowerCase())), [pagesAll, slideSearch]);

  if (!isOpen) return null;

  const setField = (key: string, value: any) => setConfigDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const getField = (key: string, fallback: any = "") => (configDraft && Object.prototype.hasOwnProperty.call(configDraft, key) ? configDraft[key] : fallback);

  const handleSave = () => {
    const nextConfig = rawConfigDirty ? rawConfig : configDraft && configContent ? replaceConfigObject(configContent, configDraft) : rawConfig;
    onSave(nextConfig, rawPortfolio);
    onClose();
  };

  const borderCol = theme === "dark" ? "rgba(148,163,184,0.2)" : "rgba(0,0,0,0.12)";
  const textMain = theme === "dark" ? "#f8fafc" : "#0f172a";
  const textMuted = theme === "dark" ? "#94a3b8" : "#64748b";
  const inputBg = theme === "dark" ? "rgba(30,41,59,0.78)" : "rgba(241,245,249,0.9)";

  const renderToggle = (key: string, label: string, note?: string) => {
    const isVeeva = key === "veevaSwipe";
    const checked = isVeeva ? String(getField(key, "0")) === "1" : Boolean(getField(key, false));
    return (
      <label key={key} className="rounded-xl border p-3 flex items-center justify-between gap-3" style={{ borderColor: borderCol, backgroundColor: inputBg }}>
        <div>
          <div className="text-sm font-semibold">{label}</div>
          {note ? <div className="text-[11px] mt-0.5" style={{ color: textMuted }}>{note}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => setField(key, isVeeva ? (checked ? "0" : "1") : !checked)}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${checked ? "bg-indigo-500" : "bg-slate-500/40"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-[2px]"}`} />
        </button>
      </label>
    );
  };

  const parseNumericList = (raw: string): number[] =>
    raw
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => Number(token))
      .filter((num) => Number.isFinite(num));

  const renderObjectArrayEditor = (key: string, value: Array<Record<string, unknown>>) => {
    return (
      <div key={key} className="rounded-xl border p-3" style={{ borderColor: borderCol, backgroundColor: inputBg }}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="text-xs font-semibold" style={{ color: textMuted }}>{toLabel(key)}</label>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(236,72,153,0.12)", color: "#db2777" }}>
            Object List
          </span>
        </div>
        <div className="space-y-2">
          {value.map((item, index) => (
            <div key={`${key}-${index}`} className="rounded-lg border p-2" style={{ borderColor: borderCol }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: textMuted }}>Item {index + 1}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = value.filter((_, idx) => idx !== index);
                    setField(key, next);
                  }}
                  className="h-7 w-7 rounded-md border flex items-center justify-center"
                  style={{ borderColor: borderCol, color: textMuted }}
                  title="Delete item"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <textarea
                value={JSON.stringify(item, null, 2)}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = [...value];
                  try {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                      next[index] = parsed as Record<string, unknown>;
                      setField(key, next);
                    }
                  } catch {
                    // Keep current value until JSON is valid.
                  }
                }}
                className="w-full min-h-[120px] px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{ backgroundColor: "transparent", borderColor: borderCol, color: textMain }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setField(key, [...value, {}])}
            className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1.5"
            style={{ borderColor: borderCol, color: textMuted }}
          >
            <Plus size={13} />
            Add Item
          </button>
        </div>
      </div>
    );
  };

  const renderCustomMenuEditor = (key: string, value: Array<Record<string, unknown>>) => {
    return (
      <div key={key} className="rounded-xl border p-3" style={{ borderColor: borderCol, backgroundColor: inputBg }}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="text-xs font-semibold" style={{ color: textMuted }}>Custom Menu</label>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#059669" }}>
            Section Builder
          </span>
        </div>
        <div className="space-y-3">
          {value.map((item, index) => {
            const title = typeof item.title === "string" ? item.title : "";
            const customFlow = typeof item.customFlow === "string" ? item.customFlow : "";
            const slides = Array.isArray(item.slides) ? item.slides : [];
            return (
              <div key={`customMenu-${index}`} className="rounded-lg border p-3" style={{ borderColor: borderCol }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-md border text-[11px] font-semibold flex items-center justify-center"
                      style={{ borderColor: borderCol, color: textMuted }}
                    >
                      {index + 1}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: textMuted }}>Section</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = value.filter((_, idx) => idx !== index);
                      setField(key, next);
                    }}
                    className="h-7 w-7 rounded-md border flex items-center justify-center"
                    style={{ borderColor: borderCol, color: textMuted }}
                    title="Delete section"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-2">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      const next = [...value];
                      next[index] = { ...next[index], title: e.target.value };
                      setField(key, next);
                    }}
                    placeholder="Section title"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: "transparent", borderColor: borderCol, color: textMain }}
                  />
                  <input
                    type="text"
                    value={customFlow}
                    onChange={(e) => {
                      const next = [...value];
                      next[index] = { ...next[index], customFlow: e.target.value };
                      setField(key, next);
                    }}
                    placeholder="Flow name (e.g., Main)"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: "transparent", borderColor: borderCol, color: textMain }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: textMuted }}>
                    Slides (comma separated numbers)
                  </label>
                  <input
                    type="text"
                    value={slides.join(", ")}
                    onChange={(e) => {
                      const next = [...value];
                      next[index] = { ...next[index], slides: parseNumericList(e.target.value) };
                      setField(key, next);
                    }}
                    placeholder="0, 1, 2, 3"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: "transparent", borderColor: borderCol, color: textMain }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() =>
              setField(key, [
                ...value,
                { title: `Section ${value.length + 1}`, slides: [], customFlow: "Main" },
              ])
            }
            className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1.5"
            style={{ borderColor: borderCol, color: textMuted }}
          >
            <Plus size={13} />
            Add Section
          </button>
        </div>
      </div>
    );
  };


  const updateReferenceList = (key: string, rows: string[]) => {
    const cleanRows = rows.map((row) => row.trim());
    const normalized = cleanRows.filter(Boolean);
    setReferenceDrafts((prev) => ({ ...prev, [key]: rows }));
    setField(key, normalized);
  };

  const renderTextListEditor = (key: string, title: string, placeholder: string) => {
    const rows = Array.isArray(referenceDrafts[key]) ? referenceDrafts[key] : [""];
    const itemCount = rows.filter((row) => row.trim().length > 0).length;
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: borderCol, backgroundColor: inputBg }}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-[11px]" style={{ color: textMuted }}>{itemCount} items</span>
        </div>
        <div className="mb-3">
          <button
            type="button"
            onClick={() => updateReferenceList(key, [...rows, ""])}
            className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1.5"
            style={{ borderColor: borderCol, color: textMuted }}
          >
            <Plus size={13} />
            Add Row
          </button>
        </div>
        <div className="space-y-2">
          {rows.map((value, index) => (
            <div key={`${key}-${index}`} className="flex items-center gap-2">
              <div
                className="w-8 h-8 shrink-0 rounded-md border flex items-center justify-center text-[11px] font-semibold"
                style={{ borderColor: borderCol, color: textMuted, backgroundColor: "rgba(100,116,139,0.08)" }}
              >
                {index + 1}
              </div>
              <input
                type="text"
                value={value}
                placeholder={index === rows.length - 1 ? placeholder : ""}
                onChange={(e) => {
                  const nextRows = [...rows];
                  nextRows[index] = e.target.value;
                  if (index === nextRows.length - 1 && e.target.value.trim().length > 0) {
                    nextRows.push("");
                  }
                  updateReferenceList(key, nextRows);
                }}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ backgroundColor: "transparent", borderColor: borderCol, color: textMain }}
              />
              <button
                type="button"
                onClick={() => {
                  if (rows.length === 1) return;
                  const nextRows = rows.filter((_, idx) => idx !== index);
                  updateReferenceList(key, nextRows.length ? nextRows : [""]);
                }}
                className="h-8 w-8 rounded-md border flex items-center justify-center"
                style={{ borderColor: borderCol, color: textMuted }}
                title="Remove row"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const referenceOrder = Array.isArray(getField("isReferenceOrder", []))
    ? (getField("isReferenceOrder", []) as unknown[]).map((v) => String(v ?? ""))
    : [];

  const reorderReferenceOrder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= referenceOrder.length || toIndex >= referenceOrder.length) return;
    const next = [...referenceOrder];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setField("isReferenceOrder", next);
  };

  const visibleTabs = TABS.filter((tab) => {
    if (slidesOnlyMode) return tab.key === "slides";
    if (!hasProjectConfig) return tab.key === "general";
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4 animate-fadeIn"
      style={{ backgroundColor: theme === "dark" ? "rgba(0,0,0,0.62)" : "rgba(15,23,42,0.45)", backdropFilter: "blur(5px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-6xl h-[88vh] flex flex-col rounded-2xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.4)] relative"
        style={{ backgroundColor: theme === "dark" ? "rgba(9,14,32,0.97)" : "rgba(255,255,255,0.98)", border: `1px solid ${borderCol}`, color: textMain }}
      >
        <div className="px-5 py-4 border-b shrink-0" style={{ borderColor: borderCol }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400"><Settings2 size={19} /></div>
              <div>
                <h2 className="font-semibold text-lg leading-tight">Application Settings</h2>
                <div className="text-xs" style={{ color: textMuted }}>
                  {hasProjectConfig
                    ? "Smart mode for common options, raw tabs for full power"
                    : "Global app settings are available even before a presentation is selected"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="p-2 rounded-md hover:bg-white/10 transition-colors" title="Close"><X size={18} /></button>
            </div>
          </div>
        </div>

        <div className="border-b shrink-0 overflow-x-auto" style={{ borderColor: borderCol }}>
          <div className="flex px-3 min-w-max">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-indigo-500 text-indigo-400" : "border-transparent"}`}
                style={{ color: activeTab === tab.key ? undefined : textMuted }}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 pb-28 custom-scrollbar">
          {null}
          {(activeTab === "references" || activeTab === "slides") && parseError ? (
            <div className="mb-4 rounded-xl border px-4 py-3" style={{ borderColor: "rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.08)" }}>
              <div className="flex items-center gap-2 text-amber-400 mb-1"><ShieldAlert size={15} /><span className="text-sm font-semibold">Config parsing warning</span></div>
              <p className="text-xs" style={{ color: textMuted }}>{parseError}</p>
            </div>
          ) : null}



          {activeTab === "references" && configDraft ? (
            <div className="space-y-5 animate-fadeIn">
              <div className="rounded-xl border p-4" style={{ borderColor: borderCol }}>
                <h3 className="text-sm font-semibold mb-3">References Behavior</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {REFERENCE_FLAG_KEYS.map((key) =>
                    Object.prototype.hasOwnProperty.call(configDraft, key)
                      ? renderToggle(key, toLabel(key))
                      : null,
                  )}
                </div>
                {Array.isArray(getField("isReferenceOrder", [])) ? (
                  <div className="mt-4">
                    <label className="block text-xs mb-2" style={{ color: textMuted }}>
                      Reference Tab Order (drag to reorder)
                    </label>
                    <div className="space-y-2">
                      {referenceOrder.map((item, index) => (
                        <div
                          key={`${item}-${index}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", String(index));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromIndex = Number(e.dataTransfer.getData("text/plain"));
                            reorderReferenceOrder(fromIndex, index);
                          }}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-lg border"
                          style={{ borderColor: borderCol, backgroundColor: inputBg }}
                        >
                          <GripVertical size={14} style={{ color: textMuted }} />
                          <div
                            className="w-6 h-6 rounded-md border text-[11px] font-semibold flex items-center justify-center"
                            style={{ borderColor: borderCol, color: textMuted }}
                          >
                            {index + 1}
                          </div>
                          <input
                            type="text"
                            value={item}
                            onChange={(e) => {
                              const next = [...referenceOrder];
                              next[index] = e.target.value;
                              setField(
                                "isReferenceOrder",
                                next.map((x) => x.trim()).filter(Boolean),
                              );
                            }}
                            className="w-full px-2 py-1.5 rounded-md border text-sm outline-none"
                            style={{ backgroundColor: "transparent", borderColor: borderCol, color: textMain }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-4">
                {renderTextListEditor("referencesAll", "References", "One reference per line")}
                {renderTextListEditor("footnotesAll", "Footnotes", "One footnote per line")}
                {renderTextListEditor("abbreviationAll", "Abbreviations", "One abbreviation per line")}
              </div>
            </div>
          ) : null}
          {activeTab === "slides" ? (
            <div className="space-y-4 animate-fadeIn">
              <div className="rounded-xl border px-4 py-3" style={{ borderColor: borderCol, backgroundColor: inputBg }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: textMuted }}>
                  Folder Clone Source
                </div>
                <div className="mt-1 text-sm">
                  {selectedSlideCloneSource || "No slide folder selected yet"}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
                  <input type="text" value={slideSearch} onChange={(e) => setSlideSearch(e.target.value)} placeholder="Search slide name..." className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: inputBg, borderColor: borderCol, color: textMain }} />
                </div>
                <span className="text-xs" style={{ color: textMuted }}>{filteredSlides.length}/{pagesAll.length} slides</span>
              </div>

              {filteredSlides.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredSlides.map((page, idx) => (
                    <div key={`${page}-${idx}`} className="rounded-xl border overflow-hidden" style={{ borderColor: borderCol, backgroundColor: inputBg }}>
                      <div className="aspect-[16/9] w-full border-b" style={{ borderColor: borderCol }}>
                        {thumbs[page] ? (
                          <img src={thumbs[page]} alt={`${page} thumbnail`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: textMuted }}>No thumbnail</div>
                        )}
                      </div>
                      <div className="px-3 py-2 text-sm flex items-start gap-2">
                        <span className="font-mono text-xs opacity-70 mt-0.5">{idx}</span>
                        <span className="leading-5 break-all">{page}</span>
                      </div>
                      {onSelectSlideCloneSource ? (
                        <div className="px-3 pb-3">
                          <button
                            type="button"
                            className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${selectedSlideCloneSource === page ? "bg-indigo-500 text-white border-indigo-500" : ""}`}
                            style={{
                              borderColor: selectedSlideCloneSource === page ? undefined : borderCol,
                              color: selectedSlideCloneSource === page ? undefined : textMain,
                            }}
                            onClick={() => onSelectSlideCloneSource(page)}
                          >
                            {selectedSlideCloneSource === page ? "Selected For Cloning" : "Use As Folder Template"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center border border-dashed rounded-xl" style={{ borderColor: borderCol, color: textMuted }}>No slides found in pagesAll.</div>
              )}
            </div>
          ) : null}


          {activeTab === "configRaw" ? (
            <div className="space-y-3 animate-fadeIn">
              <p className="text-xs" style={{ color: textMuted }}>Edit full config script (`shared/config.json` or `shared/js/config.json`).</p>
              <div
                className="w-full min-h-[64vh] rounded-md border overflow-hidden"
                style={{ borderColor: borderCol, backgroundColor: inputBg }}
              >
                <textarea
                  value={rawConfig}
                  onChange={(e) => {
                    setRawConfigDirty(true);
                    setRawConfig(e.target.value ?? "");
                  }}
                  spellCheck={false}
                  className="w-full h-full min-h-[64vh] px-4 py-3 text-sm font-mono outline-none resize-none"
                  style={{
                    backgroundColor: "transparent",
                    color: textMain,
                    lineHeight: "1.6",
                  }}
                />
              </div>
            </div>
          ) : null}

          {activeTab === "general" ? (
            <div className="animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: borderCol, backgroundColor: inputBg }}>
                  <div className="text-sm font-semibold mb-2">Auto Save</div>
                  <label className="w-full px-2 py-2 rounded-md text-xs flex items-center justify-between gap-2 cursor-pointer hover:bg-cyan-500/10">
                    <span>Enable Auto Save</span>
                    <input
                      type="checkbox"
                      checked={autoSaveEnabled}
                      onChange={(e) => onAutoSaveChange(e.target.checked)}
                    />
                  </label>
                  <p className="text-[11px] mt-2" style={{ color: textMuted }}>
                    Smart debounce (about 1.2s idle), not every keystroke.
                  </p>
                </div>

                <div className="rounded-xl border p-4" style={{ borderColor: borderCol, backgroundColor: inputBg }}>
                  <div className="text-sm font-semibold mb-2">Panel Position</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onPanelSideChange("default")}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${panelSide === "default" ? "bg-indigo-500 text-white border-indigo-500" : ""}`}
                      style={{ borderColor: panelSide === "default" ? undefined : borderCol, color: panelSide === "default" ? undefined : textMain }}
                    >
                      Left / Right
                    </button>
                    <button
                      type="button"
                      onClick={() => onPanelSideChange("swapped")}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${panelSide === "swapped" ? "bg-indigo-500 text-white border-indigo-500" : ""}`}
                      style={{ borderColor: panelSide === "swapped" ? undefined : borderCol, color: panelSide === "swapped" ? undefined : textMain }}
                    >
                      Right / Left
                    </button>
                  </div>
                  <p className="text-[11px] mt-2" style={{ color: textMuted }}>
                    Swap Explorer and Inspector panel sides.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

        </div>

        <div className="absolute bottom-0 left-0 right-0 px-5 py-3 border-t z-10" style={{ borderColor: borderCol, backgroundColor: theme === "dark" ? "rgba(5,10,25,0.95)" : "rgba(248,250,252,0.96)", backdropFilter: "blur(8px)" }}>
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors">Cancel</button>
            {hasProjectConfig ? (
              <button onClick={handleSave} disabled={!!parseError && !rawConfigDirty && !configDraft} className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm">
                <Save size={16} /> Save Changes
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigEditorModal;
