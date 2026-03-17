import { SemanticElement } from './DomAnalyzer';
import { EntityResult } from './EntityExtractor';
import { resourceScanner } from './ResourceScanner';

/**
 * Lightweight Semantic Matcher
 * Links NLP entities to indexed DOM elements.
 */
export class SemanticMatcher {
  /**
   * Simple Dice's Coefficient for string similarity (Small ML pattern)
   */
  private stringSimilarity(str1: string, str2: string): number {
    const s1 = (str1 || '').toLowerCase().replace(/\s/g, '');
    const s2 = (str2 || '').toLowerCase().replace(/\s/g, '');
    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0;

    const bigrams1 = new Map();
    for (let i = 0; i < s1.length - 1; i++) {
      const bigram = s1.substring(i, i + 2);
      bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
    }

    let intersection = 0;
    for (let i = 0; i < s2.length - 1; i++) {
      const bigram = s2.substring(i, i + 2);
      const count = bigrams1.get(bigram) || 0;
      if (count > 0) {
        bigrams1.set(bigram, count - 1);
        intersection++;
      }
    }

    return (2.0 * intersection) / (s1.length + s2.length - 2);
  }

  /**
   * UI Semantic Map - Maps keywords to roles/tags for better lookup
   */
  private semanticMap = {
    'open': ['button', 'POPUP_TRIGGER', 'link'],
    'close': ['button', 'CLOSE_BUTTON', 'x'],
    'information': ['pi', 'información', 'prescribir'],
    'references': ['referencias', 'references'],
    'dialog': ['popup', 'modal', 'dialog', 'POPUP_CONTAINER'],
    'action': ['button', 'CTA']
  };

  /**
   * Checks if an element semantically matches a keyword using the map
   */
  private semanticMatch(keyword: string, el: SemanticElement): number {
    const k = keyword.toLowerCase();
    const roles = Object.entries(this.semanticMap)
      .filter(([key]) => k.includes(key))
      .flatMap(([_, vals]) => vals);

    if (roles.includes(el.role) || roles.includes(el.tagName)) return 1.0;
    
    // Check if keyword is in attributes or text
    if (el.text.toLowerCase().includes(k)) return 0.8;
    if (el.id.toLowerCase().includes(k)) return 0.7;
    
    return 0;
  }

  public findMatch(entities: EntityResult[], index: SemanticElement[], intent?: string): SemanticElement | null {
    const typeEntity = entities.find(e => e.type === 'ELEMENT_TYPE')?.value.toLowerCase();
    const ordinalEntity = entities.find(e => e.type === 'ORDINAL');
    const contentEntity = entities.find(e => e.type === 'CONTENT');
    const roleEntity = entities.find(e => e.type === 'ROLE');

    // Get current project resources for deep linkage
    const pIndex = resourceScanner.getFullIndex();

    let candidates = index.map(el => {
      let score = 0;

      // 1. Exact Tag/Role Match (High weight)
      if (typeEntity) {
        if (el.tagName === typeEntity || el.role.toLowerCase() === typeEntity) score += 5;
      }

      if (roleEntity) {
        if (el.role === roleEntity.value) score += 7;
      }

      // 2. Action-Target Linkage (PDF flat page & Slide-local logic)
      if (contentEntity && (intent === 'POPUP_ACTION' || intent === 'NAVIGATE' || el.tagName === 'button')) {
        const onClick = (el.attributes.onClick || '').toString();
        const contentVal = contentEntity.value.toLowerCase();
        
        // Match against popups
        if (intent === 'POPUP_ACTION' || !intent) {
          for (const [popupId, info] of Object.entries(pIndex.popups)) {
             const idMatch = popupId.toLowerCase().includes(contentVal);
             // @ts-ignore
             const textMatch = (info.textContent || '').toLowerCase().includes(contentVal);
             if (idMatch || textMatch) {
               if (onClick.includes(popupId)) score += 20;
             }
          }
        }

        // Match against slides
        if (intent === 'NAVIGATE' || !intent) {
          for (const [slideId, info] of Object.entries(pIndex.slides)) {
             if (slideId.toLowerCase().includes(contentVal) || info.filePath.toLowerCase().includes(contentVal)) {
               if (onClick.includes(slideId)) score += 20;
             }
          }
        }
      }

      // 3. Intent-Based Boost (Actionable intents favor elements with listeners)
      if (intent === 'POPUP_ACTION' || intent === 'ELEMENT_MOVE') {
        if (el.eventListeners.length > 0 || el.attributes.onClick || ['button', 'a'].includes(el.tagName)) {
          score += 3;
        }
        
        // Boost elements with popup-like roles/ids
        if (el.role === 'POPUP_TRIGGER' || el.id.toLowerCase().includes('popup')) {
          score += 5;
        }
      }

      // 4. Container Context Boost
      if (el.role === 'CLOSE_BUTTON' || el.id.toLowerCase().includes('close')) {
          if (contentEntity?.value.toLowerCase().includes('close')) score += 15;
      }

      // If the keyword mentions "nav" or "footer", check parents
      if (contentEntity) {
        const c = contentEntity.value.toLowerCase();
        const map = new Map(index.map(i => [i.id, i]));
        let parent = el.parentId ? map.get(el.parentId) : null;
        while (parent) {
          if (c.includes('nav') && (parent.role === 'NAV' || parent.id.toLowerCase().includes('nav'))) score += 10;
          if (c.includes('footer') && (parent.role === 'FOOTER' || parent.id.toLowerCase().includes('footer'))) score += 10;
          parent = parent.parentId ? map.get(parent.parentId) : null;
        }
      }

      // 5. Semantic Similarity (Thesaurus)
      if (contentEntity) {
        const semScore = this.semanticMatch(contentEntity.value, el);
        const textSim = this.stringSimilarity(contentEntity.value, el.text);
        const idSim = this.stringSimilarity(contentEntity.value, el.id);
        
        score += Math.max(semScore * 10, textSim * 8, idSim * 5);
      }

      // 6. Fallback: Fuzzy Attribute Match
      if (contentEntity && score < 1) {
        const attrSim = Object.values(el.attributes).some(v => 
          typeof v === 'string' && this.stringSimilarity(contentEntity.value, v) > 0.6
        ) ? 2 : 0;
        score += attrSim;
      }

      return { el, score };
    });

    // Sort by score
    candidates.sort((a, b) => b.score - a.score);

    // Filter by threshold
    let filtered = candidates.filter(c => c.score > 0.8);

    // Handle Ordinal
    if (ordinalEntity && filtered.length > 0) {
      const idx = ordinalEntity.index!;
      if (idx === -1) {
        return filtered[filtered.length - 1].el;
      }
      return filtered[idx]?.el || filtered[0].el;
    }

    return filtered.length > 0 ? filtered[0].el : null;
  }
}

export const semanticMatcher = new SemanticMatcher();
