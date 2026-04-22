import { normalizePath } from "./appHelpers";
import type {
  ReferenceAuditIssue,
  ReferenceConfigModel,
  ReferenceRegistry,
  ReferenceTargetRef,
  ReferenceUsageNode,
  ReferenceWorkspace,
} from "./referenceTypes";
import type { FileMap } from "../../types";

function makeSelector(element: Element): string {
  if (element.id) return `#${element.id}`;
  const tag = element.tagName.toLowerCase();
  const classNames = Array.from(element.classList).slice(0, 2).join(".");
  if (classNames) return `${tag}.${classNames}`;
  const parent = element.parentElement;
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter(
    (child) => child.tagName === element.tagName,
  );
  const position = siblings.indexOf(element) + 1;
  return `${tag}:nth-of-type(${Math.max(1, position)})`;
}

function extractSlideId(filePath: string): string | null {
  const normalized = normalizePath(filePath);
  if (normalized.includes("/shared/")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 2] || null;
}

function parseTargetTokens(
  rawValue: string,
  registry: ReferenceRegistry,
  issues: ReferenceAuditIssue[],
  context: {
    filePath: string;
    selector: string | null;
    slideId: string | null;
  },
): ReferenceTargetRef[] {
  const tokens = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return tokens.flatMap((rawToken, index) => {
    if (/^foot_/i.test(rawToken)) {
      const numeric = Number(rawToken.replace(/^foot_/i, ""));
      const entry = registry.byKindAndIndex.footnote[numeric];
      if (!entry) {
        issues.push({
          id: `bad-foot-token-${context.filePath}-${index}`,
          severity: "warn",
          source: "html",
          title: "Unknown footnote target",
          detail: `Could not resolve "${rawToken}" against footnotesAll.`,
          filePath: context.filePath,
          selector: context.selector,
          slideId: context.slideId,
        });
        return [];
      }
      return [
        {
          stableId: entry.stableId,
          kind: "footnote" as const,
          token: rawToken,
          masterIndex: entry.masterIndex,
          localOrder: index + 1,
          rawToken,
        },
      ];
    }

    const numeric = Number(rawToken);
    if (Number.isFinite(numeric) && numeric > 0) {
      const entry = registry.byKindAndIndex.reference[numeric];
      if (!entry) {
        issues.push({
          id: `bad-ref-token-${context.filePath}-${index}`,
          severity: "warn",
          source: "html",
          title: "Unknown reference target",
          detail: `Could not resolve "${rawToken}" against referencesAll.`,
          filePath: context.filePath,
          selector: context.selector,
          slideId: context.slideId,
        });
        return [];
      }
      return [
        {
          stableId: entry.stableId,
          kind: "reference" as const,
          token: rawToken,
          masterIndex: entry.masterIndex,
          localOrder: index + 1,
          rawToken,
        },
      ];
    }

    issues.push({
      id: `bad-token-${context.filePath}-${index}`,
      severity: "warn",
      source: "html",
      title: "Malformed data-reftarget token",
      detail: `Unsupported data-reftarget token "${rawToken}".`,
      filePath: context.filePath,
      selector: context.selector,
      slideId: context.slideId,
    });
    return [];
  });
}

function buildConfigUsageNodes(
  model: ReferenceConfigModel,
  registry: ReferenceRegistry,
): ReferenceUsageNode[] {
  const nodes: ReferenceUsageNode[] = [];
  model.pagesAll.forEach((slideId, pageIndex) => {
    (["reference", "footnote", "abbreviation"] as const).forEach((kind) => {
      const targetRefs: ReferenceTargetRef[] = model.pageMappings[kind][
        pageIndex
      ]
        .map((masterIndex, localIndex) => {
          const entry = registry.byKindAndIndex[kind][masterIndex];
          if (!entry) return null;
          return {
            stableId: entry.stableId,
            kind,
            token: String(masterIndex),
            masterIndex,
            localOrder: localIndex + 1,
            rawToken: String(masterIndex),
          };
        })
        .filter(Boolean) as ReferenceTargetRef[];
      nodes.push({
        nodeId: `slide:${slideId}:${kind}`,
        scopeType: "slide",
        containerScope: "slide",
        slideId,
        filePath: `config://${slideId}`,
        popupId: null,
        selector: null,
        selectorText: `${slideId} ${kind}`,
        rawText: "",
        rawDataRefTarget: "",
        targetRefs,
      });
    });
  });
  return nodes;
}

function buildHtmlUsageNodes(
  files: FileMap,
  model: ReferenceConfigModel,
  registry: ReferenceRegistry,
  issues: ReferenceAuditIssue[],
): ReferenceUsageNode[] {
  const nodes: ReferenceUsageNode[] = [];
  const htmlFiles = Object.values(files).filter(
    (file) => file.type === "html" && typeof file.content === "string",
  );

  htmlFiles.forEach((file) => {
    const filePath = normalizePath(file.path);
    const slideId = extractSlideId(filePath);
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(
      String(file.content || ""),
      "text/html",
    );
    const superscripts = Array.from(
      documentNode.querySelectorAll("sup"),
    ).filter((element) => {
      const className = element.getAttribute("class") || "";
      return /\bgotoRef\b/i.test(className);
    });

    superscripts.forEach((element, index) => {
      const selector = makeSelector(element);
      const rawDataRefTarget = String(
        element.getAttribute("data-reftarget") || "",
      ).trim();
      const rawText = (element.textContent || "").trim();
      const popupRoot = element.closest(
        ".popup,[data-popup-id],[role='dialog'],.modal,.dialog,[id^='dialog']",
      );
      const inSharedPath = filePath.includes("/shared/");
      const insideSafeContainer = Boolean(
        element.closest(".mainContent,.dialogBody,.swiper-container"),
      );
      const hasTabsActiveContainer = element.classList.contains(
        "tabsactivecontainer",
      );

      if ((!insideSafeContainer || popupRoot) && !hasTabsActiveContainer) {
        issues.push({
          id: `missing-tabsactive-${filePath}-${index}`,
          severity: "warn",
          source: "html",
          title: "Potential missing tabsactivecontainer class",
          detail:
            "This superscript sits outside the safe reference containers or inside a popup without the tabsactivecontainer helper class.",
          filePath,
          selector,
          slideId,
        });
      }

      if (!rawDataRefTarget) {
        issues.push({
          id: `missing-data-target-${filePath}-${index}`,
          severity: "warn",
          source: "html",
          title: "gotoRef superscript missing data-reftarget",
          detail:
            "This superscript has the gotoRef class but no data-reftarget attribute.",
          filePath,
          selector,
          slideId,
        });
      }

      const popupId =
        popupRoot?.getAttribute("id") ||
        popupRoot?.getAttribute("data-popup-id") ||
        null;

      const targetRefs = parseTargetTokens(rawDataRefTarget, registry, issues, {
        filePath,
        selector,
        slideId,
      });

      nodes.push({
        nodeId: `sup:${filePath}:${index + 1}`,
        scopeType: "superscript",
        containerScope: inSharedPath
          ? "sharedPopup"
          : popupRoot
            ? "localPopup"
            : "slide",
        slideId,
        filePath,
        popupId,
        selector,
        selectorText: `${rawText} ${rawDataRefTarget}`.trim(),
        rawText,
        rawDataRefTarget,
        targetRefs,
      });
    });
  });

  if (!model.settings.embedReferences && nodes.length > 0) {
    issues.push({
      id: "embed-references-disabled-with-superscripts",
      severity: "warn",
      source: "config",
      title: "Embedded superscripts found while embedReferences is disabled",
      detail:
        "The project contains gotoRef superscripts, but config.embedReferences is false. Embedded reference popups may not behave as expected.",
    });
  }

  return nodes;
}

export function buildReferenceWorkspace(
  model: ReferenceConfigModel,
  registry: ReferenceRegistry,
  files: FileMap,
): ReferenceWorkspace {
  const issues = [...model.issues];
  const usageNodes = [
    ...buildConfigUsageNodes(model, registry),
    ...buildHtmlUsageNodes(files, model, registry, issues),
  ];

  return {
    model,
    registry,
    usageNodes,
    issues,
  };
}
