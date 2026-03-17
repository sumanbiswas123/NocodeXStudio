import { ResourceIndex, resourceScanner } from './ResourceScanner';
import { SemanticElement } from './DomAnalyzer';

export interface ScanMatchResult {
  targetId: string;
  filePath: string;
  confidence: number;
  method: 'semantic' | 'structural' | 'visual' | 'combined';
  pageType: string;
}

export class DeepScanMatcher {
  private diceCoefficient(str1: string, str2: string): number {
    const s1 = (str1 || '').toLowerCase().replace(/\s+/g, '');
    const s2 = (str2 || '').toLowerCase().replace(/\s+/g, '');
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
   * Performs a deep multi-modal match between a PDF page and project resources.
   * Aligned with Veeva Technical Guidelines (v3.0).
   */
  public findBestMatch(
    pdfText: string,
    pdfPageHash: bigint,
    options: { currentSlideId?: string; pdfPageNumber?: number } = {}
  ): ScanMatchResult | null {
    const index = resourceScanner.getFullIndex();
    const candidates: ScanMatchResult[] = [];
    const normalizedPdfText = pdfText.toLowerCase();

    // Helper to calculate combined score
    const processCandidate = (id: string, info: any, isPopup: boolean) => {
      const textContent = (info as any).textContent || '';
      // Semantic score: use diceCoefficient on content
      const semanticSim = this.diceCoefficient(normalizedPdfText, textContent.toLowerCase());
      
      // Visual score: use dHash if available
      let visualSim = 0;
      if (pdfPageHash && (info as any).visualHash) {
        visualSim = this.calculateVisualSim(pdfPageHash, BigInt((info as any).visualHash));
      }

      let boost = 0;
      
      // Veeva Shared Resource Boost (PI, SI, REFS)
      if (info.pageType?.startsWith('Shared')) {
        const lowerId = id.toLowerCase();
        if (lowerId.includes('pi') && (normalizedPdfText.includes('prescribing') || normalizedPdfText.includes('brief summary'))) boost += 0.35;
        if (lowerId.includes('ref') && normalizedPdfText.includes('reference')) boost += 0.35;
        if (lowerId.includes('si') && (normalizedPdfText.includes('safety') || normalizedPdfText.includes('information'))) boost += 0.35;
      }

      // Sequence Boost for Slides
      if (!isPopup && options.pdfPageNumber !== undefined) {
        // Handle dot slides like 004.1 by looking for the base number
        const matches = id.match(/\d+/g);
        const slideNum = matches ? parseInt(matches[matches.length - 1]) : 0;
        
        // If it's a dot-slide (variation), check if it's very close to the current page
        const isVariation = id.includes('.');
        const sequenceLimit = isVariation ? 3 : 2;
        
        if (slideNum > 0 && Math.abs(slideNum - options.pdfPageNumber) < sequenceLimit) {
          boost += isVariation ? 0.15 : 0.2; 
        }
      }

      // Slide ID Keyword Boost (e.g. PDF text contains "007" and slide is 007)
      // Extract the last numeric part as the "short" ID for better matching
      const idMatches = id.match(/\d+/g);
      const shortId = idMatches ? idMatches[idMatches.length - 1] : '';
      if (shortId.length >= 2 && normalizedPdfText.includes(shortId)) {
        boost += 0.6; // Industry standard: numeric match is the highest signal
      }



      // Context Boost for local popups and slides
      if (options.currentSlideId) {
         if (isPopup) {
            // Prioritize popups that are children of the slide we are currently looking at
            if (info.parentSlideId === options.currentSlideId || info.slideId === options.currentSlideId) {
               boost += 0.35;
            }
         } else {
            // PERSISTENCE BOOST: If we are already on this slide, don't leave it unless there's a strong reason
            if (id === options.currentSlideId) {
               boost += 0.45; // Higher than the popup boost (0.35)
            }
         }
      }



      // Final score formula: weighted semantic + visual + boosts
      
      // Calculate Text Entropy (Uniqueness)
      const uniqueWords = new Set(normalizedPdfText.split(/\s+/)).size;
      const isBoilerplate = normalizedPdfText.length > 0 && uniqueWords < 5; // Very repetitive or sparse text
      
      const textWeightBase = normalizedPdfText.length > 50 ? 0.75 : 0.35;
      const textWeight = isBoilerplate ? textWeightBase * 0.4 : textWeightBase;
      const visualWeight = 1 - textWeight;

      // Secondary Semantic Safeguard: 
      // Don't allow a popup to win based on boosts alone if it has near-zero semantic match
      if (isPopup && semanticSim < 0.05 && boost > 0 && visualSim < 0.5) {
         boost *= 0.5; 
      }

      let confidence = (semanticSim * textWeight) + (visualSim * visualWeight) + boost;

      // Tie-breaker: slight preference for Main slides in close cases
      if (!isPopup) confidence += 0.02;
      // Slight preference for Dot-Variation slides (sub-slides) if confidence is high
      if (id.includes('.')) confidence += 0.01;



      if (confidence > 0.45) {

        candidates.push({
          targetId: id,
          filePath: info.filePath,
          confidence: Math.min(1.0, confidence),
          method: 'combined',
          pageType: info.pageType || (isPopup ? 'Popup' : 'Main')
        });
      }
    };

    // Process all resources
    for (const [id, info] of Object.entries(index.popups)) {
      processCandidate(id, info, true);
    }
    for (const [id, info] of Object.entries(index.slides)) {
      processCandidate(id, info, false);
    }

    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Differentiation Check: If top two are very close, we might have a false positive
    if (candidates.length >= 2) {
      const diff = candidates[0].confidence - candidates[1].confidence;
      if (diff < 0.05) {
        console.warn(`[AI] Low differentiation between ${candidates[0].targetId} and ${candidates[1].targetId}`);
        // Tie-breaker: prefer Main slide over Popup if semantic is equal, unless currentSlide context is strong
      }
    }

    if (candidates.length > 0 && candidates[0].confidence > 0.48) {
      return candidates[0];
    }


    return null;
  }


  /**
   * Refined Hamming distance for visual fallback
   */
  public calculateVisualSim(h1: bigint, h2: bigint): number {
    let diff = h1 ^ h2;
    let distance = 0;
    while (diff > 0n) {
      if (diff & 1n) distance++;
      diff >>= 1n;
    }
    // Higher resolution normalization (256 bits)
    return 1 - (distance / 256);
  }
}

export const deepScanMatcher = new DeepScanMatcher();
