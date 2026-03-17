import { VirtualElement } from '../../types';

export interface SemanticElement {
  id: string;
  tagName: string;
  text: string;
  role: string;
  parentId?: string;
  childIds: string[];
  siblingIds: string[];
  depth: number;
  attributes: Record<string, any>;
  xpath: string;
  ariaRole: string;
  shadowBoundary: boolean;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zIndex: number;
  eventListeners: string[];
}

export interface DomGraphQueryResult {
  parent: SemanticElement | null;
  children: SemanticElement[];
  siblings: SemanticElement[];
  shadowBoundaryPath: SemanticElement[];
}

export interface DomActionableAttributes {
  id: string;
  boundingBox: SemanticElement['boundingBox'];
  zIndex: number;
  eventListeners: string[];
}

export interface DomCommand {
  id: string;
  type: 'scroll' | 'highlight' | 'click';
  targetId: string;
  payload: Record<string, any>;
  rollback: {
    targetId: string;
    patch: Partial<VirtualElement>;
  };
}

export interface DomExecutionResult {
  updatedRoot: VirtualElement;
  mutations: Array<{
    targetId: string;
    before: Partial<VirtualElement>;
    after: Partial<VirtualElement>;
  }>;
  validationPassed: boolean;
}

export class DomAnalyzer {
  public analyze(root: VirtualElement): SemanticElement[] {
    const elements: SemanticElement[] = [];

    const getPathSegment = (el: VirtualElement, siblings: VirtualElement[]) => {
      const sameType = siblings.filter((entry) => entry.type === el.type);
      const position = sameType.findIndex((entry) => entry.id === el.id);
      const indexSuffix = sameType.length > 1 ? `[${position + 1}]` : '';
      return `${el.type.toLowerCase()}${indexSuffix}`;
    };

    const traverse = (
      el: VirtualElement,
      depth: number,
      parentId?: string,
      parentXpath = '/root',
      siblingGroup: VirtualElement[] = [el],
    ) => {
      const pathSegment = getPathSegment(el, siblingGroup);
      const xpath = `${parentXpath}/${pathSegment}`;
      const childIds = el.children?.map(c => c.id) || [];
      const siblingIds = siblingGroup.map((entry) => entry.id).filter((id) => id !== el.id);
      const listeners = Object.keys(el.attributes || {})
        .filter((key) => /^on[A-Z]|^on[a-z]/.test(key))
        .map((key) => key.toLowerCase());
      const semanticEl: SemanticElement = {
        id: el.id,
        tagName: el.type.toLowerCase(),
        text: el.content || '',
        role: this.determineRole(el),
        ariaRole: String(el.attributes?.role || this.determineRole(el)).toLowerCase(),
        depth: depth,
        parentId: parentId,
        childIds,
        siblingIds,
        attributes: el.attributes || {},
        xpath,
        shadowBoundary: Boolean(el.attributes?.['data-shadow-root'] || el.attributes?.shadowrootmode),
        boundingBox: this.extractBoundingBox(el),
        zIndex: this.extractZIndex(el),
        eventListeners: listeners,
      };

      elements.push(semanticEl);

      if (el.children) {
        el.children.forEach(child =>
          traverse(child, depth + 1, el.id, xpath, el.children || []),
        );
      }
    };

    traverse(root, 0);
    return elements;
  }

  public queryGraph(index: SemanticElement[], targetId: string): DomGraphQueryResult {
    const map = new Map(index.map((entry) => [entry.id, entry]));
    const target = map.get(targetId) || null;
    const parent = target?.parentId ? map.get(target.parentId) || null : null;
    const children = target?.childIds.map((id) => map.get(id)).filter(Boolean) as SemanticElement[] || [];
    const siblings = target?.siblingIds.map((id) => map.get(id)).filter(Boolean) as SemanticElement[] || [];
    const shadowBoundaryPath: SemanticElement[] = [];
    if (target) {
      let cursor: SemanticElement | null = target;
      while (cursor) {
        if (cursor.shadowBoundary) shadowBoundaryPath.unshift(cursor);
        cursor = cursor.parentId ? map.get(cursor.parentId) || null : null;
      }
    }
    return { parent, children, siblings, shadowBoundaryPath };
  }

  public extractActionableAttributes(index: SemanticElement[], targetId: string): DomActionableAttributes | null {
    const target = index.find((entry) => entry.id === targetId) || null;
    if (!target) return null;
    return {
      id: target.id,
      boundingBox: target.boundingBox,
      zIndex: target.zIndex,
      eventListeners: target.eventListeners,
    };
  }

  public generateCommands(
    target: DomActionableAttributes,
    options: { allowClick: boolean },
  ): DomCommand[] {
    const commands: DomCommand[] = [];
    commands.push({
      id: `${target.id}-scroll`,
      type: 'scroll',
      targetId: target.id,
      payload: { align: 'center' },
      rollback: {
        targetId: target.id,
        patch: {},
      },
    });
    commands.push({
      id: `${target.id}-highlight`,
      type: 'highlight',
      targetId: target.id,
      payload: { outline: '2px solid #22d3ee' },
      rollback: {
        targetId: target.id,
        patch: {},
      },
    });
    if (options.allowClick && target.eventListeners.length > 0) {
      commands.push({
        id: `${target.id}-click`,
        type: 'click',
        targetId: target.id,
        payload: { simulated: true },
        rollback: {
          targetId: target.id,
          patch: {},
        },
      });
    }
    return commands;
  }

  public executeInSandbox(root: VirtualElement, commands: DomCommand[]): DomExecutionResult {
    const cloneNode = (node: VirtualElement): VirtualElement => ({
      ...node,
      styles: { ...node.styles },
      attributes: node.attributes ? { ...node.attributes } : undefined,
      children: node.children.map((child) => cloneNode(child)),
    });
    const updatedRoot = cloneNode(root);
    const mutations: DomExecutionResult['mutations'] = [];
    const patchNode = (node: VirtualElement, targetId: string, patch: Partial<VirtualElement>) => {
      if (node.id === targetId) {
        const before: Partial<VirtualElement> = {
          styles: { ...node.styles },
          attributes: node.attributes ? { ...node.attributes } : undefined,
        };
        if (patch.styles) {
          node.styles = { ...node.styles, ...(patch.styles as Record<string, any>) };
        }
        if (patch.attributes) {
          node.attributes = { ...(node.attributes || {}), ...patch.attributes };
        }
        const after: Partial<VirtualElement> = {
          styles: { ...node.styles },
          attributes: node.attributes ? { ...node.attributes } : undefined,
        };
        mutations.push({ targetId, before, after });
      }
      node.children.forEach((child) => patchNode(child, targetId, patch));
    };
    for (const command of commands) {
      if (command.type === 'highlight') {
        patchNode(updatedRoot, command.targetId, {
          styles: {
            outline: String(command.payload.outline || '2px solid #22d3ee'),
          } as any,
        });
      }
      if (command.type === 'scroll') {
        patchNode(updatedRoot, command.targetId, {
          attributes: {
            'data-scroll-command': JSON.stringify(command.payload),
          },
        });
      }
      if (command.type === 'click') {
        patchNode(updatedRoot, command.targetId, {
          attributes: {
            'data-click-command': JSON.stringify(command.payload),
          },
        });
      }
    }
    const validationPassed = mutations.length >= commands.filter((entry) => entry.type !== 'click').length;
    return { updatedRoot, mutations, validationPassed };
  }

  private determineRole(el: VirtualElement): string {
    const tag = el.type.toLowerCase();
    const id = (el.id || '').toLowerCase();
    const className = (el.attributes?.className || '').toLowerCase();

    if (tag === 'button' || className.includes('btn') || el.attributes?.onClick) {
      if (className.includes('close') || id.includes('close')) return 'CLOSE_BUTTON';
      if (id.includes('popup') || id.includes('dialog') || className.includes('open-dialog')) return 'POPUP_TRIGGER';
      return 'CTA';
    }

    if (tag === 'img' || className.includes('logo') || id.includes('logo')) {
      return 'BRANDING';
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || className.includes('heading') || className.includes('title')) {
      return 'HEADING';
    }

    if (className.includes('footer') || tag === 'footer') {
      return 'FOOTER';
    }

    if (className.includes('dialog') || className.includes('modal') || id.includes('dialog')) {
      return 'POPUP_CONTAINER';
    }

    return 'CONTENT';
  }

  private parsePixelValue(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return 0;
    const match = value.trim().match(/-?\d+(\.\d+)?/);
    if (!match) return 0;
    return Number(match[0]) || 0;
  }

  private extractBoundingBox(el: VirtualElement): SemanticElement['boundingBox'] {
    const styles = el.styles || {};
    return {
      x: this.parsePixelValue(styles.left),
      y: this.parsePixelValue(styles.top),
      width: this.parsePixelValue(styles.width),
      height: this.parsePixelValue(styles.height),
    };
  }

  private extractZIndex(el: VirtualElement): number {
    const styles = el.styles || {};
    const raw = styles.zIndex;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }
}

export const domAnalyzer = new DomAnalyzer();
