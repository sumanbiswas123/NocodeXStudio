import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileMap } from "../types";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

interface MasterFeaturePanelProps {
  files: FileMap;
  onAddElement: (type: string) => void;
  isVisible: boolean;
  theme: "light" | "dark";
}

type DemoItem = {
  type: string;
  label: string;
  hint: string;
};

type SlideFeature = {
  slideId: string;
  slideDir: string;
  fileNames: string[];
  functions: string[];
  animations: string[];
  libraries: string[];
};

type ToolReview = {
  type: string;
  label: string;
  hint: string;
  reasons: string[];
  sourceSlides: string[];
};

const DEMO_ITEMS: DemoItem[] = [
  { type: "preset:calendar-dialog", label: "Calendar Functionality", hint: "Month nav + reset + day grid" },
  { type: "preset:popup", label: "Popup Button", hint: "Button that opens a popup panel" },
];

const MINI_ARROW_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 44'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0%' stop-color='#22d3ee'/>
          <stop offset='100%' stop-color='#6366f1'/>
        </linearGradient>
      </defs>
      <polygon points='0,0 330,0 360,22 330,44 0,44 20,22' fill='url(#g)'/>
    </svg>`,
  );

const collectMasterFunctions = (files: FileMap): string[] => {
  const names = new Set<string>();
  const scriptFiles = Object.entries(files).filter(([path, file]) => {
    if (!/(^|\/)shared\/js\/.+\.js$/i.test(path)) return false;
    if (/\.min\.js$/i.test(path)) return false;
    return typeof file?.content === "string" && file.content.length > 0;
  });
  for (const [, file] of scriptFiles) {
    const src = String(file.content);
    const fnRegex = /(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    const methodRegex = /([A-Za-z_$][\w$]*)\s*:\s*function\s*\(/g;
    let match: RegExpExecArray | null = null;
    while ((match = fnRegex.exec(src)) !== null) names.add(match[1]);
    while ((match = methodRegex.exec(src)) !== null) names.add(match[1]);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
};

const collectSlideFeatures = (files: FileMap): SlideFeature[] => {
  const allPaths = Object.keys(files).map((path) => path.replace(/\\/g, "/"));
  const slideDirs = Array.from(
    new Set(
      allPaths
        .map((path) => {
          const parts = path.split("/");
          const idx = parts.findIndex((part) => /_\d{3,}$/i.test(part));
          if (idx < 0) return "";
          return parts.slice(0, idx + 1).join("/");
        })
        .filter(Boolean),
    ),
  );
  const callRegex = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  const keyframeRegex = /@keyframes\s+([A-Za-z_-][\w-]*)/gi;
  const animationRegex = /animation(?:-name)?\s*:\s*([^;]+);/gi;
  const ignoreCalls = new Set([
    "if",
    "for",
    "while",
    "switch",
    "return",
    "function",
    "typeof",
    "catch",
    "new",
  ]);
  const libraryMatchers: Array<[string, RegExp]> = [
    ["swiper", /\bswiper\b/i],
    ["iscroll", /\biscroll\b/i],
    ["hammer", /\bhammer\b/i],
    ["jquery", /\bjQuery\b|\$\(/i],
    ["veeva", /\bveeva\b|com\.veeva/i],
    ["video", /\bvideo\b|videojs/i],
    ["race", /\brace\b/i],
    ["calendar", /\bcalendar\b/i],
  ];

  const features: SlideFeature[] = [];
  for (const slideDir of slideDirs) {
    const slideId = slideDir.split("/").pop() || slideDir;
    const related = Object.entries(files).filter(([path]) => {
      const normalized = path.replace(/\\/g, "/");
      return (
        normalized.startsWith(`${slideDir}/`) &&
        /\.(html?|js|css)$/i.test(normalized)
      );
    });
    const fileNames = related.map(([path]) => path.split("/").pop() || "").filter(Boolean);
    const functions = new Set<string>();
    const animations = new Set<string>();
    const libraries = new Set<string>();
    for (const [path, file] of related) {
      const content = typeof file?.content === "string" ? file.content : "";
      const lowerPath = path.toLowerCase();
      if (/\bcalendar\b/.test(lowerPath)) libraries.add("calendar");
      if (/\battitudinal|segmentation\b/.test(lowerPath)) libraries.add("segmentation");
      if (/\brace\b/.test(lowerPath)) libraries.add("race");
      if (/\bvideo\b/.test(lowerPath)) libraries.add("video");
      if (/\bswiper|swipe\b/.test(lowerPath)) libraries.add("swipe");
      if (/\bref|footnote|abbreviation\b/.test(lowerPath)) libraries.add("references");
      if (!content) continue;
      let match: RegExpExecArray | null = null;
      while ((match = callRegex.exec(content)) !== null) {
        const name = match[1];
        if (ignoreCalls.has(name)) continue;
        if (name.length <= 1) continue;
        functions.add(name);
      }
      while ((match = keyframeRegex.exec(content)) !== null) {
        animations.add(match[1]);
      }
      while ((match = animationRegex.exec(content)) !== null) {
        const raw = match[1].split(",")[0].trim();
        const name = raw.split(/\s+/)[0];
        if (name && name !== "none" && !/^\d/.test(name)) animations.add(name);
      }
      for (const [lib, regex] of libraryMatchers) {
        if (regex.test(content)) libraries.add(lib);
      }
      callRegex.lastIndex = 0;
      keyframeRegex.lastIndex = 0;
      animationRegex.lastIndex = 0;
    }
    features.push({
      slideId,
      slideDir,
      fileNames,
      functions: Array.from(functions).sort((a, b) => a.localeCompare(b)),
      animations: Array.from(animations).sort((a, b) => a.localeCompare(b)),
      libraries: Array.from(libraries).sort((a, b) => a.localeCompare(b)),
    });
  }
  return features.sort((a, b) => a.slideId.localeCompare(b.slideId));
};

const TOOL_META: Record<string, { label: string; hint: string; checks: RegExp[] }> = {
  "preset:calendar-dialog": {
    label: "Calendar Functionality",
    hint: "Month navigation + reset + day grid",
    checks: [/calendar/i, /date/i],
  },
  "preset:dots-swipe": {
    label: "Internal Swiping (Dots)",
    hint: "Pagination-dot swipe sections",
    checks: [/dot/i, /swipe/i, /swiper/i, /slide/i],
  },
  "preset:carousel": {
    label: "Carousel",
    hint: "Auto and manual slide pattern",
    checks: [/carousel/i, /swiper/i, /slide/i, /dot/i],
  },
  "preset:video-panel": {
    label: "Video Functionality",
    hint: "Dialog video + tabbed video tracking pattern",
    checks: [/video/i, /openDialog/i, /vjs/i, /dialog/i, /tab/i],
  },
  "preset:popup": {
    label: "Popup Button",
    hint: "Open a popup overlay/dialog",
    checks: [/popup/i, /dialog/i, /openDialog/i],
  },
};

const MasterFeaturePanel: React.FC<MasterFeaturePanelProps> = ({ files, onAddElement, isVisible, theme }) => {
  const [activeDemoIndex, setActiveDemoIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [previewTick, setPreviewTick] = useState(0);
  const [smoothTick, setSmoothTick] = useState(0);
  const [demoCols, setDemoCols] = useState(2);
  const demoGridRef = useRef<HTMLDivElement | null>(null);

  const functionNames = useMemo(() => collectMasterFunctions(files), [files]);
  const slideFeatures = useMemo(() => collectSlideFeatures(files), [files]);
  const toolReviews = useMemo<ToolReview[]>(() => {
    const allFunctionText = functionNames.join(" ").toLowerCase();
    const reviews: ToolReview[] = [];
    for (const [type, meta] of Object.entries(TOOL_META)) {
      const sourceSlides = slideFeatures
        .filter((slide) => {
          const haystack = [
            slide.slideId,
            ...slide.fileNames,
            ...slide.functions,
            ...slide.animations,
            ...slide.libraries,
          ]
            .join(" ")
            .toLowerCase();
          return meta.checks.some((regex) => regex.test(haystack));
        })
        .map((slide) => slide.slideId);
      const reasons: string[] = [];
      for (const regex of meta.checks) {
        const token = regex.source.replace(/[\\^$.*+?()[\]{}|]/g, "").replace(/i/g, "");
        if (!token) continue;
        if (sourceSlides.some((slide) => slide.toLowerCase().includes(token))) reasons.push(`matched slide id: ${token}`);
        else if (slideFeatures.some((slide) => slide.fileNames.some((f) => f.toLowerCase().includes(token)))) reasons.push(`matched file name: ${token}`);
        else if (allFunctionText.includes(token)) reasons.push(`matched function keyword: ${token}`);
      }
      reviews.push({
        type,
        label: meta.label,
        hint: meta.hint,
        reasons: Array.from(new Set(reasons)).slice(0, 3),
        sourceSlides: sourceSlides.slice(0, 8),
      });
    }
    return reviews;
  }, [functionNames, slideFeatures]);

  const startToolDrag = (event: React.DragEvent, type: string) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-nocodex-element", type);
    event.dataTransfer.setData("text/plain", type);
    window.dispatchEvent(
      new CustomEvent("nocodex-toolbox-drag-state", {
        detail: { active: true, type },
      }),
    );
  };

  const endToolDrag = () => {
    window.dispatchEvent(
      new CustomEvent("nocodex-toolbox-drag-state", {
        detail: { active: false, type: "" },
      }),
    );
  };

  useEffect(() => {
    if (!autoPlay || !isVisible) return;
    const timer = window.setInterval(() => {
      setActiveDemoIndex((prev) => (prev + 1) % DEMO_ITEMS.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [autoPlay, isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    const timer = window.setInterval(() => {
      setPreviewTick((prev) => (prev + 1) % 1000);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    const timer = window.setInterval(() => {
      setSmoothTick((prev) => (prev + 1) % 100000);
    }, 80);
    return () => window.clearInterval(timer);
  }, [isVisible]);

  useEffect(() => {
    const target = demoGridRef.current;
    if (!target || typeof ResizeObserver === "undefined") return;
    const applyCols = (width: number) => {
      if (width < 220) setDemoCols(1);
      else if (width < 460) setDemoCols(2);
      else if (width < 700) setDemoCols(3);
      else setDemoCols(4);
    };
    applyCols(target.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? target.clientWidth;
      applyCols(width);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const activeDemo = DEMO_ITEMS[activeDemoIndex];
  const panelBg = theme === "dark" ? "rgba(15,23,42,0.6)" : "var(--bg-glass-strong)";
  const cardBg = theme === "dark" ? "rgba(15,23,42,0.5)" : "var(--bg-glass)";

  const renderToolPreview = (type: string) => {
    const previewBg = theme === "dark" ? "rgba(30,41,59,0.9)" : "#f8fafc";
    const previewBgAlt = theme === "dark" ? "rgba(30,41,59,0.95)" : "#f3f4f6";
    const previewInnerBg = theme === "dark" ? "rgba(51,65,85,0.75)" : "#ffffff";
    const previewText = theme === "dark" ? "#e2e8f0" : "#0f172a";
    const previewBorder = theme === "dark" ? "rgba(148,163,184,0.35)" : "var(--border-color)";
    if (type === "preset:calendar-dialog") {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthIndex = previewTick % 12;
      const highlighted = (previewTick % 14) + 1;
      return (
        <div className="rounded-lg border p-2" style={{ borderColor: previewBorder, backgroundColor: previewBg, color: previewText }}>
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span>{monthNames[monthIndex]}</span>
            <span>{2026 + Math.floor(monthIndex / 12)}</span>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-[9px]">
            {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
              <div key={d} className="text-center bg-slate-600 text-white py-0.5">{d}</div>
            ))}
            {Array.from({ length: 14 }).map((_, idx) => (
              <div key={idx} className={`text-center py-0.5 transition-colors ${idx + 1 === highlighted ? "bg-yellow-300 text-slate-900" : theme === "dark" ? "bg-slate-700 text-slate-100" : "bg-slate-100"}`}>{idx + 1}</div>
            ))}
          </div>
        </div>
      );
    }
    if (type === "preset:video-panel") {
      const activeTab = previewTick % 2;
      return (
        <div className="rounded-lg border p-2" style={{ borderColor: previewBorder, backgroundColor: theme === "dark" ? "rgba(51,65,85,0.72)" : "#e5e7eb", color: previewText }}>
          <div className="flex gap-1.5 mb-2">
            <span className="text-[7px] px-1.5 py-1 rounded border font-semibold" style={{ backgroundColor: previewInnerBg, borderColor: previewBorder }}>Video Dialog</span>
            <span className="text-[7px] px-1.5 py-1 rounded border font-semibold" style={{ backgroundColor: previewInnerBg, borderColor: previewBorder }}>Video Dialog with tabs</span>
          </div>
          <div className="rounded border p-1.5" style={{ borderColor: previewBorder, backgroundColor: previewInnerBg }}>
            <div className="flex gap-1 mb-1">
              <span className={`text-[7px] px-1.5 py-0.5 rounded-t-md border text-white ${activeTab === 0 ? "bg-orange-500 border-orange-500" : "bg-zinc-400 border-zinc-400"}`}>VIDEO TAB1</span>
              <span className={`text-[7px] px-1.5 py-0.5 rounded-t-md border text-white ${activeTab === 1 ? "bg-orange-500 border-orange-500" : "bg-zinc-400 border-zinc-400"}`}>VIDEO TAB2</span>
            </div>
            <div className="h-10 rounded border bg-slate-800 relative overflow-hidden">
              <span className="absolute left-1 top-1 text-[7px] text-white/90">Dialog Videos on Tabs</span>
              <span className="absolute inset-0 m-auto w-3.5 h-3.5 rounded-full border border-white/90" />
              <span className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-[35%] w-0 h-0 border-l-[4px] border-l-white border-y-[3px] border-y-transparent" />
            </div>
          </div>
        </div>
      );
    }
    if (type === "preset:carousel") {
      const active = previewTick % 3;
      return (
        <div className="rounded-lg border p-2" style={{ borderColor: "var(--border-color)", backgroundColor: "#0f172a" }}>
          <div className="h-12 rounded overflow-hidden border" style={{ borderColor: "rgba(148,163,184,0.4)" }}>
            <div className={`h-full w-full transition-all ${active === 0 ? "bg-cyan-400/70" : active === 1 ? "bg-violet-400/70" : "bg-emerald-400/70"}`} />
          </div>
          <div className="flex justify-center gap-1 mt-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <span key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === active ? "bg-sky-400" : "bg-slate-500"}`} />
            ))}
          </div>
        </div>
      );
    }
    if (type === "preset:flip-card") {
      const flipped = previewTick % 2 === 1;
      return (
        <div className="rounded-lg border p-2" style={{ borderColor: previewBorder, backgroundColor: previewBg, color: previewText }}>
          <div className={`h-12 rounded border flex items-center justify-center text-[9px] font-semibold transition-colors ${flipped ? "bg-emerald-100 border-emerald-300" : "bg-sky-100 border-sky-300"}`}>
            {flipped ? "Back" : "Front"}
          </div>
        </div>
      );
    }
    if (type === "preset:scroll-reveal") {
      const visible = previewTick % 2 === 1;
      return (
        <div className="rounded-lg border p-2" style={{ borderColor: previewBorder, backgroundColor: previewBg, color: previewText }}>
          <div className={`h-12 rounded border transition-all ${visible ? "opacity-100 translate-y-0" : "opacity-50 translate-y-1"}`} style={{ borderColor: previewBorder, backgroundColor: previewInnerBg }}>
            <div className="h-2 w-1/2 bg-slate-300 rounded mt-2 ml-2" />
            <div className="h-2 w-2/3 bg-slate-200 rounded mt-1 ml-2" />
          </div>
        </div>
      );
    }
    if (type === "preset:popup") {
      return (
        <div className="rounded-lg border p-2" style={{ borderColor: previewBorder, backgroundColor: previewBg, color: previewText }}>
          <div className="text-[9px] mb-1">Popup Button</div>
          <div className="flex items-center gap-2">
            <div className="px-2 py-1 rounded border text-[8px]" style={{ borderColor: previewBorder, backgroundColor: previewInnerBg }}>
              Open Popup
            </div>
            <div className="h-6 w-10 rounded border" style={{ borderColor: previewBorder, backgroundColor: previewInnerBg }} />
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-lg border p-2 text-[10px]" style={{ borderColor: previewBorder, backgroundColor: previewBg, color: previewText }}>
        Widget Preview
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto p-2.5 space-y-4 custom-scrollbar">
      <div className="space-y-2">
        {toolReviews
          .filter((item) =>
            [
              "preset:calendar-dialog",
              "preset:dots-swipe",
              "preset:carousel",
              "preset:video-panel",
              "preset:popup",
            ].includes(item.type),
          )
          .map((item) => (
          <div
            key={item.type}
            className="rounded-md border p-2.5 cursor-grab active:cursor-grabbing"
            style={{ borderColor: "var(--border-color)", backgroundColor: cardBg }}
            draggable
            onDragStart={(event) => startToolDrag(event, item.type)}
            onDragEnd={endToolDrag}
            onClick={() => onAddElement(item.type)}
          >
            <div className="mb-2">{renderToolPreview(item.type)}</div>
            <div className="text-xs font-semibold">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MasterFeaturePanel;
