import { intentEngine, IntentResult } from './IntentEngine';
import { entityExtractor, EntityResult } from './EntityExtractor';
import { domAnalyzer, SemanticElement } from './DomAnalyzer';
import { semanticMatcher } from './SemanticMatcher';
import { resourceScanner } from './ResourceScanner';
import { VirtualElement, FileMap } from '../../types';

export interface AIResponse {
  intent: string;
  targetId?: string;
  properties: Record<string, string>;
  content?: string;
  confidence: number;
  rawText: string;
  updatedRoot?: VirtualElement;
  message: string;
  actionRequired?: 'OPEN_POPUP' | 'NAVIGATE';
  actionData?: any;
}

/**
 * Unified AI Pipeline
 * Orchestrates all lightweight modules with project awareness.
 */
export class AIPipeline {
  public process(
    text: string,
    root?: VirtualElement,
    fileMap?: FileMap,
    options: { allowPopupActions?: boolean, annotationContext?: any } = {},
  ): AIResponse {
    if (fileMap) {
      resourceScanner.scan(fileMap);
    }

    let intentResult = intentEngine.classify(text);
    const entities = entityExtractor.extract(text);
    
    // --- Phase 4: Metadata Override (Zero Guessing) ---
    const ctx = options.annotationContext;
    if (ctx) {
      // 1. If it's a flow change, force Navigation or Popup
      if (ctx.annotationIntent === 'flowChange' || ctx.annotationType === 'flowChange') {
         if (ctx.mappedSlideId) {
            intentResult = { intent: 'NAVIGATE', confidence: 1.0 };
         } else if (ctx.detectedSubtype === 'Safety' || ctx.detectedSubtype === 'Reference') {
            intentResult = { intent: 'POPUP_ACTION', confidence: 1.0 };
         }
      }
      // 2. If it's a styling/textual change, ensure intent matches
      else if (ctx.annotationIntent === 'stylingChange') {
         intentResult = { intent: 'STYLE_CHANGE', confidence: 0.9 };
      }
      else if (ctx.annotationIntent === 'textualChange') {
         intentResult = { intent: 'CONTENT_UPDATE', confidence: 0.9 };
      }
    }

    let targetElement: SemanticElement | null = null;
    let index: SemanticElement[] = [];
    let sandboxApplied = false;
    if (root) {
      index = domAnalyzer.analyze(root);
      targetElement = semanticMatcher.findMatch(entities, index, intentResult.intent);
      if (targetElement) {
        const actionable = domAnalyzer.extractActionableAttributes(index, targetElement.id);
        if (actionable) {
          const commands = domAnalyzer.generateCommands(actionable, {
            allowClick: Boolean(options.allowPopupActions),
          });
          const sandbox = domAnalyzer.executeInSandbox(root, commands);
          sandboxApplied = sandbox.validationPassed;
        }
      }
    }

    const props: Record<string, string> = {};
    const propEntity = entities.find(e => e.type === 'PROPERTY');
    const valEntity = entities.find(e => e.type === 'CSS_VALUE');
    const contentEntity = entities.find(e => e.type === 'CONTENT');

    let actionRequired: 'OPEN_POPUP' | 'NAVIGATE' | undefined;
    let actionData: any;

    // --- Strict Action Resolution ---
    
    // 1. Metadata Context Priority (100% Accuracy)
    if (ctx && ctx.mappedSlideId && intentResult.intent === 'NAVIGATE') {
      actionRequired = 'NAVIGATE';
      actionData = { slideId: ctx.mappedSlideId, filePath: ctx.mappedFilePath };
    }

    // 2. Fallback to Heuristics if no direct mapping exists
    if (!actionRequired && intentResult.intent === 'NAVIGATE' && fileMap) {
      const pIndex = resourceScanner.getFullIndex();
      const contentVal = contentEntity?.value.toLowerCase() || '';
      
      for (const [slideId, info] of Object.entries(pIndex.slides)) {
         if (slideId.toLowerCase() === contentVal || info.filePath.toLowerCase().includes(contentVal)) {
            actionRequired = 'NAVIGATE';
            actionData = { slideId, filePath: info.filePath };
            break;
         }
      }

      if (!actionRequired) {
        const pageNumMatch = text.match(/(?:page|slide)\s*(\d+)/i);
        if (pageNumMatch) {
          const targetNum = pageNumMatch[1];
          for (const [slideId, info] of Object.entries(pIndex.slides)) {
            if (slideId.includes(targetNum) || info.filePath.includes(targetNum)) {
              actionRequired = 'NAVIGATE';
              actionData = { slideId, filePath: info.filePath };
              break;
            }
          }
        }
      }
    }

    if (!actionRequired && intentResult.intent === 'POPUP_ACTION' && fileMap && options.allowPopupActions) {
      const pIndex = resourceScanner.getFullIndex();
      for (const [popupId, info] of Object.entries(pIndex.popups)) {
        if (text.toLowerCase().includes(info.slideId.toLowerCase()) || text.toLowerCase().includes(popupId.toLowerCase())) {
          actionRequired = 'OPEN_POPUP';
          actionData = { popupId, filePath: info.filePath };
          break;
        }
      }
    }

    if (actionRequired) {
      targetElement = null; 
    }

    if (propEntity && valEntity) {
      props[propEntity.value] = valEntity.value;
    } else if (valEntity && intentResult.intent === 'STYLE_CHANGE') {
      props['color'] = valEntity.value;
    }

    let updatedRoot = root;
    let message = intentResult.intent !== 'UNKNOWN' ? `Intent: ${intentResult.intent}. ` : '';

    if (root && targetElement && intentResult.intent !== 'UNKNOWN') {
      updatedRoot = this.applyToRoot(root, targetElement.id, intentResult.intent, props, contentEntity?.value);
      message += `Applied change to ${targetElement.tagName} (${targetElement.role}).`;
    } else if (actionRequired === 'OPEN_POPUP') {
      message = `I found that "${actionData.popupId}" is a popup in this project. Opening it for you...`;
    } else if (intentResult.intent === 'UNKNOWN') {
      message = "I'm sorry, I couldn't understand that instruction. Could you try rephrasing?";
    } else if (root && !targetElement) {
      message += "I found the intent, but couldn't locate the specific element in the current view.";
    }
    if (sandboxApplied) {
      message += " DOM sandbox validation passed.";
    }

    return {
      intent: intentResult.intent,
      targetId: targetElement?.id,
      properties: props,
      content: contentEntity?.value,
      confidence: intentResult.confidence,
      rawText: text,
      updatedRoot,
      message,
      actionRequired,
      actionData
    };
  }

  private applyToRoot(root: VirtualElement, targetId: string, intent: string, props: Record<string, string>, content?: string): VirtualElement {
    const clone = (node: VirtualElement): VirtualElement => {
      const newNode = { ...node, styles: { ...node.styles } };
      
      if (node.id === targetId) {
        if (intent === 'STYLE_CHANGE') {
          newNode.styles = { ...newNode.styles, ...props } as any;
        } else if (intent === 'CONTENT_UPDATE' && content) {
          newNode.content = content;
        }
      }

      if (node.children) {
        newNode.children = node.children.map(clone);
      }

      return newNode;
    };

    return clone(root);
  }
}

export const aiPipeline = new AIPipeline();
