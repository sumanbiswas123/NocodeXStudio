export interface EntityResult {
  type: string;
  value: string;
  index?: number;
}

/**
 * Lightweight Entity Extractor
 * Zero LLM dependency.
 */
export class EntityExtractor {
  private patterns = {
    COLOR: /\b(red|blue|green|yellow|black|white|gray|purple|orange|pink|cyan|magenta|lime|gold|\#[0-9a-f]{3,6}|rgba?\(.*?\))\b/i,
    CSS_UNIT: /(\d+(px|em|rem|%|vh|vw|pt))\b/i,
    ORDINAL: /\b(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\b/i,
    ELEMENT_TYPE: /\b(button|image|img|title|header|text|paragraph|div|section|link|anchor|a)\b/i,
    PROPERTY: /\b(color|background|font-size|size|padding|margin|width|height|opacity|border|weight|style)\b/i
  };

  private ordinalMap: Record<string, number> = {
    first: 0, '1st': 0,
    second: 1, '2nd': 1,
    third: 2, '3rd': 2,
    fourth: 3, '4th': 3,
    fifth: 4, '5th': 4,
    last: -1
  };

  /**
   * Extracts entities from text.
   */
  public extract(text: string): EntityResult[] {
    const results: EntityResult[] = [];

    // Extract Color
    const colorMatch = text.match(this.patterns.COLOR);
    if (colorMatch) {
      results.push({ type: 'CSS_VALUE', value: colorMatch[0] });
    }

    // Extract Units
    const unitMatch = text.match(this.patterns.CSS_UNIT);
    if (unitMatch) {
      results.push({ type: 'CSS_VALUE', value: unitMatch[0] });
    }

    // Extract Ordinal
    const ordinalMatch = text.match(this.patterns.ORDINAL);
    if (ordinalMatch) {
      const val = ordinalMatch[0].toLowerCase();
      results.push({ type: 'ORDINAL', value: val, index: this.ordinalMap[val] });
    }

    // Extract Element Type
    const typeMatch = text.match(this.patterns.ELEMENT_TYPE);
    if (typeMatch) {
      results.push({ type: 'ELEMENT_TYPE', value: typeMatch[0].toLowerCase() });
    }

    // Extract Property
    const propMatch = text.match(this.patterns.PROPERTY);
    if (propMatch) {
      results.push({ type: 'PROPERTY', value: propMatch[0].toLowerCase() });
    }

    // Extract Quote Content (for replacement text)
    const quoteMatch = text.match(/["'](.*?)["']/);
    if (quoteMatch) {
      results.push({ type: 'CONTENT', value: quoteMatch[1] });
    } else {
      // Look for "with X" or "to X" patterns for content
      const withMatch = text.match(/\bwith\s+([A-Z][a-z0-9_]*)\b/);
      if (withMatch) {
        results.push({ type: 'CONTENT', value: withMatch[1] });
      }
    }

    // Extract Role/Type (Small ML - keyword matching)
    const roles: Record<string, string[]> = {
      'CTA': ['button', 'btn', 'action', 'submit'],
      'BRANDING': ['logo', 'brand', 'icon', 'symbol', 'shingrix logo'],
      'FOOTER': ['footer', 'bottom'],
      'HEADING': ['title', 'heading', 'header', 'subject'],
      'POPUP_TRIGGER': ['popup', 'dialog', 'modal', 'open', 'pi', 'información para prescribir', 'referencias', 'references'],
      'CLOSE_BUTTON': ['close', 'exit', 'x button']
    };

    for (const [role, keywords] of Object.entries(roles)) {
      if (keywords.some(k => text.toLowerCase().includes(k))) {
        results.push({ type: 'ROLE', value: role });
        break; 
      }
    }

    return results;
  }
}

export const entityExtractor = new EntityExtractor();
