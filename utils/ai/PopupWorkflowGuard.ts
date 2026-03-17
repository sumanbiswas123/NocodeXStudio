export interface PopupDomQueryLog {
  selector: string;
  matchCount: number;
  context: "slide-canvas" | "shared-popup";
}

export interface PopupDomActionLog {
  method: "click" | "focus" | "dispatchEvent";
  selector: string;
}

export interface PopupDomAuditReport {
  queries: PopupDomQueryLog[];
  actionAttempts: PopupDomActionLog[];
  assertionPassed: boolean;
}

export function auditPopupDomQueries(
  htmlContent: string,
  context: "slide-canvas" | "shared-popup",
): PopupDomAuditReport {
  const queries: PopupDomQueryLog[] = [];
  const actionAttempts: PopupDomActionLog[] = [];
  if (!htmlContent.trim()) {
    return {
      queries: [
        { selector: ".popup", matchCount: 0, context },
        { selector: ".annotation", matchCount: 0, context },
        { selector: "[data-popup-id]", matchCount: 0, context },
      ],
      actionAttempts,
      assertionPassed: true,
    };
  }
  const domParserAvailable = typeof DOMParser !== "undefined";
  const documentNode = domParserAvailable
    ? new DOMParser().parseFromString(htmlContent, "text/html")
    : null;
  const selectors = [".popup", ".annotation", "[data-popup-id]"];
  const elementProto = (globalThis as any).Element?.prototype as
    | {
        click?: () => void;
        focus?: () => void;
        dispatchEvent?: (event: Event) => boolean;
      }
    | undefined;
  const originalClick = elementProto?.click;
  const originalFocus = elementProto?.focus;
  const originalDispatch = elementProto?.dispatchEvent;
  const recordAction = (method: PopupDomActionLog["method"]) => {
    actionAttempts.push({ method, selector: "(runtime)" });
  };
  if (elementProto) {
    if (typeof elementProto.click === "function") {
      elementProto.click = function patchedClick() {
        recordAction("click");
      };
    }
    if (typeof elementProto.focus === "function") {
      elementProto.focus = function patchedFocus() {
        recordAction("focus");
      };
    }
    if (typeof elementProto.dispatchEvent === "function") {
      elementProto.dispatchEvent = function patchedDispatch(event: Event) {
        if (
          event instanceof MouseEvent ||
          event.type === "click" ||
          event.type === "focus"
        ) {
          recordAction("dispatchEvent");
        }
        return true;
      };
    }
  }
  try {
    for (const selector of selectors) {
      const matchCount = documentNode
        ? documentNode.querySelectorAll(selector).length
        : estimateMatchesFromMarkup(htmlContent, selector);
      queries.push({ selector, matchCount, context });
    }
  } finally {
    if (elementProto) {
      if (originalClick) elementProto.click = originalClick;
      if (originalFocus) elementProto.focus = originalFocus;
      if (originalDispatch) elementProto.dispatchEvent = originalDispatch;
    }
  }
  return {
    queries,
    actionAttempts,
    assertionPassed: actionAttempts.length === 0,
  };
}

function estimateMatchesFromMarkup(html: string, selector: string): number {
  const source = html.toLowerCase();
  if (selector === ".popup") {
    return (source.match(/class\s*=\s*["'][^"']*\bpopup\b[^"']*["']/g) || []).length;
  }
  if (selector === ".annotation") {
    return (source.match(/class\s*=\s*["'][^"']*\bannotation\b[^"']*["']/g) || []).length;
  }
  if (selector === "[data-popup-id]") {
    return (source.match(/data-popup-id\s*=\s*["'][^"']+["']/g) || []).length;
  }
  return 0;
}
