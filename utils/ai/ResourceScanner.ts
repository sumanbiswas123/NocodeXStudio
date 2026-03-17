import { VirtualElement, FileMap } from "../../types";
import { domAnalyzer, SemanticElement } from "./DomAnalyzer";

export interface ResourceIndex {
  popups: Record<
    string,
    {
      slideId: string;
      filePath: string;
      elements: SemanticElement[];
      pageType?: string;
      textContent?: string;
      visualHash?: string;
      parentSlideId?: string | null;
      orientation?: 'portrait' | 'landscape';
    }
  >;
  slides: Record<
    string,
    {
      slideId: string;
      filePath: string;
      pageType?: string;
      textContent?: string;
      visualHash?: string;
      parentSlideId?: string | null;
      orientation?: 'portrait' | 'landscape';
    }
  >;
  sharedResources: SemanticElement[];
}

/**
 * Project-Wide Resource Scanner
 * Indexes popups and shared components across the entire project.
 */
export class ResourceScanner {
  private index: ResourceIndex = {
    popups: {},
    slides: {},
    sharedResources: [],
  };

  /**
   * Scans all loaded files for semantic structures.
   */
  public scan(fileMap: FileMap): ResourceIndex {
    console.log("[AI] Starting Project-Wide Resource Scan...");

    // 1. Look for config.json first
    for (const [path, entry] of Object.entries(fileMap)) {
      if (path.endsWith("config.json")) {
        this.parseConfig(entry.content as string);
      }
    }

    for (const [path, entry] of Object.entries(fileMap)) {
      if (!path.endsWith(".html")) continue;

      const content = entry.content as string;
      if (!content) continue;

      if (path.includes("shared/")) {
        this.indexShared(path, content);
      } else {
        this.indexSlide(path, content);
      }
    }

    return this.index;
  }

  private parseConfig(content: string) {
    try {
      // Config might be a JS file with var com = ..., so we extract the JSON part
      const jsonMatch = content.match(/com\.gsk\.mtconfig\s*=\s*({[\s\S]*?});/);
      if (jsonMatch) {
        // This is still JS, so we might need a safer eval or a real parser
        // For now, let's extract key properties using regex for safety
        const pagesMatch = jsonMatch[1].match(/"pagesAll":\s*\[([\s\S]*?)\]/);
        if (pagesMatch) {
          console.log("[AI] Indexed Slides from Config:", pagesMatch[1]);
        }
      }
    } catch (e) {
      console.warn("[AI] Failed to parse config.json", e);
    }
  }

  private indexSlide(path: string, content: string) {
    // 1. Index local dialogs/popups within the HTML
    const dialogRegex = /<div[^>]+id=["'](dialog\d+)["'][^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    const folderName = path.split("/").slice(0, -1).pop() || "";
    // Dot slides (e.g. 004.1) are SLIDES, not popups
    const isSubSlide = /\.\d+$/.test(folderName);
    const parentSlideId = isSubSlide ? folderName.split(".")[0] : null;

    while ((match = dialogRegex.exec(content)) !== null) {
      const dialogId = match[1];
      const dialogHtml = match[2];

      // Extract text content inside the dialog for deep search
      const textContent = dialogHtml
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      this.index.popups[dialogId] = {
        slideId: folderName || path,
        filePath: path,
        elements: [],
        textContent: textContent.slice(0, 5000),
        pageType: "Child/Popup",
        parentSlideId: folderName, // The current slide is the parent
        orientation: this.detectOrientation(path, content),
      };
    }

    // 2. Index the slide/sub-slide itself
    if (
      content.toLowerCase().includes("popup") ||
      path.includes("popup")
    ) {
      // If the path itself implies it is a popup (Legacy or shared)
      const slideId = folderName || path;
      const textContent = content
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      this.index.popups[slideId] = {
        slideId: slideId,
        filePath: path,
        elements: [],
        textContent: textContent.slice(0, 5000),
        pageType: "Child/Popup",
        parentSlideId: null, // Shared or top-level popup
        orientation: this.detectOrientation(path, content),
      };
    } else if (!path.includes("/shared/")) {
      // Regular slide or Sub-slide (like 004.1)
      const slideId = folderName || path;
      const textContent = content
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      this.index.slides[slideId] = {
        slideId: slideId,
        filePath: path,
        textContent: textContent.slice(0, 5000),
        pageType: isSubSlide ? "Child/SubSlide" : "Main",
        parentSlideId: parentSlideId,
        orientation: this.detectOrientation(path, content),
      };
    }

  }

  private indexShared(path: string, content: string) {
    // Index shared components like references, PI, etc.
    const normalized = path.toLowerCase();
    const slideId = path.split("/").slice(0, -1).pop() || path;
    const textContent = content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (
      normalized.includes("references") ||
      normalized.includes("pi") ||
      normalized.includes("si")
    ) {
      const type = normalized.includes("references")
        ? "References"
        : normalized.includes("pi")
          ? "PI"
          : "SI";

      this.index.popups[slideId] = {
        slideId: slideId,
        filePath: path,
        elements: [],
        // @ts-ignore
        textContent: textContent,
        pageType: `Shared/${type}`,
      };
    } else {
      // General shared component
      this.index.sharedResources.push({
        id: slideId,
        tagName: "div",
        text: textContent,
        role: "SHARED_COMPONENT",
        childIds: [],
        siblingIds: [],
        depth: 0,
        attributes: { path },
        xpath: `//shared/${slideId}`,
        ariaRole: "region",
        shadowBoundary: false,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        zIndex: 0,
        eventListeners: [],
      });
    }
  }

  public getPopupInfo(id: string) {
    return this.index.popups[id];
  }

  public getFullIndex() {
    return this.index;
  }

  private detectOrientation(path: string, content: string): 'portrait' | 'landscape' {
    const normalizedPath = path.toLowerCase();
    
    // 1. Path-based detection (Very strong signal)
    if (normalizedPath.includes("vertical") || normalizedPath.includes("portrait")) {
      return 'portrait';
    }
    
    // 2. Clear content-based detection
    // Strip comments first to avoid false positives from template comments
    const contentWithoutComments = content.replace(/<!--[\s\S]*?-->/g, "");
    const lowerContent = contentWithoutComments.toLowerCase();

    // Look for explicit portrait indicators in code/styles
    if (lowerContent.includes("768x1024") || 
        lowerContent.includes("height: 1024px; width: 768px") || 
        lowerContent.includes("height:1024px;width:768px") ||
        lowerContent.includes("orientation: portrait") ||
        lowerContent.includes('class="portrait"') ||
        lowerContent.includes("body.portrait")) {
      return 'portrait';
    }

    if (lowerContent.includes("landscape") || 
        lowerContent.includes("1024x768") || 
        lowerContent.includes("height: 768px; width: 1024px") || 
        lowerContent.includes("height:768px;width:1024px") ||
        lowerContent.includes("orientation: landscape")) {
      return 'landscape';
    }

    // Default to landscape
    return 'landscape';
  }
}

export const resourceScanner = new ResourceScanner();
