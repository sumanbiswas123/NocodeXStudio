export type IntentType = 'NAVIGATE' | 'STYLE_CHANGE' | 'CONTENT_UPDATE' | 'ELEMENT_MOVE' | 'POPUP_ACTION' | 'UNKNOWN';

export interface IntentResult {
  intent: IntentType;
  confidence: number;
}

/**
 * Lightweight Intent Engine
 * Zero LLM dependency. Uses regex and keyword matching.
 */
export class IntentEngine {
  private patterns: Record<IntentType, RegExp[]> = {
    NAVIGATE: [
       /(?:page|slide)\s*\d+/i, /go to/i, /navigate/i, /switch to/i, /jump to/i, /next/i, /previous/i
    ],
    STYLE_CHANGE: [
      /color/i, /background/i, /font-size/i, /padding/i, /margin/i, /border/i, /width/i, /height/i, /opacity/i,
      /bold/i, /italic/i, /underline/i, /center/i, /align/i, /display/i, /visible/i, /hidden/i, /make it/i, /change to/i
    ],
    CONTENT_UPDATE: [
      /change text/i, /replace/i, /set title/i, /update content/i, /change heading/i, /rename/i, /text as/i, /write/i, /Welcome/i
    ],
    ELEMENT_MOVE: [
      /move/i, /below/i, /above/i, /next to/i, /after/i, /before/i, /shift/i, /position/i, /top/i, /bottom/i, /left/i, /right/i
    ],
    POPUP_ACTION: [
       /popup/i, /modal/i, /dialog/i, /reference/i, /pi/i, /objection/i, /show section/i, /Safety/i, /prescribing/i, /información/i
    ],
    UNKNOWN: []
  };

  /**
   * Classifies the input text into an intent.
   * Target processing time: < 5ms
   */
  public classify(text: string): IntentResult {
    const scores: Record<IntentType, number> = {
      NAVIGATE: 0,
      STYLE_CHANGE: 0,
      CONTENT_UPDATE: 0,
      ELEMENT_MOVE: 0,
      POPUP_ACTION: 0,
      UNKNOWN: 0
    };

    let totalMatch = 0;

    for (const [intent, regexes] of Object.entries(this.patterns) as [IntentType, RegExp[]][]) {
      for (const regex of regexes) {
        if (regex.test(text)) {
          scores[intent]++;
          totalMatch++;
        }
      }
    }

    if (totalMatch === 0) {
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    // Find the highest score
    let bestIntent: IntentType = 'UNKNOWN';
    let maxScore = 0;

    for (const [intent, score] of Object.entries(scores) as [IntentType, number][]) {
      if (score > maxScore) {
        maxScore = score;
        bestIntent = intent;
      }
    }

    return {
      intent: bestIntent,
      confidence: maxScore / totalMatch || 0
    };
  }
}

export const intentEngine = new IntentEngine();
