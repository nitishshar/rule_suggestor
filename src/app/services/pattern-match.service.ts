import { Injectable } from '@angular/core';
import { RuleToken } from '../models/token.model';
import { RuleSuggestorConfig, RulePattern } from '../models/rule-config.model';

export interface PatternSuggestion {
  pattern: RulePattern;
  similarity: number; // 0-1, higher is better
  reason: string;
}

export interface PatternMatchResult {
  matched: boolean;
  matchedPattern?: RulePattern;
  /** Human-readable reason for deviation */
  deviationReason?: string;
  /** Suggested patterns that are close matches */
  suggestions?: PatternSuggestion[];
}

@Injectable({ providedIn: 'root' })
export class PatternMatchService {
  /**
   * Checks if the tokenized rule follows one of the predefined patterns.
   * Simple heuristic: has phrase + at least one data element + operator/value.
   */
  checkPattern(tokens: RuleToken[], config: RuleSuggestorConfig): PatternMatchResult {
    const hasPhrase = tokens.some((t) => t.type === 'phrase');
    const hasDataElement = tokens.some((t) => t.type === 'dataElement');
    const hasOperator = tokens.some((t) => t.type === 'operator');
    const hasConnector = tokens.some((t) => t.type === 'connector');

    if (!hasPhrase && tokens.length > 0) {
      const suggestions = this.getSimilarPatterns(tokens, config, 3);
      return { 
        matched: false, 
        deviationReason: 'Rule should start with a phrase like "Produce Error If".',
        suggestions
      };
    }
    if (!hasDataElement && tokens.some((t) => t.type !== 'text' && t.type !== 'phrase')) {
      const suggestions = this.getSimilarPatterns(tokens, config, 3);
      return { 
        matched: false, 
        deviationReason: 'Rule should include at least one data element.',
        suggestions
      };
    }

    for (const pattern of config.rulePatterns) {
      if (this.roughMatch(tokens, pattern)) {
        return { matched: true, matchedPattern: pattern };
      }
    }

    if (hasPhrase && hasDataElement) {
      return { matched: true }; // Custom but valid structure
    }

    // Get suggestions for patterns that are close to the current rule
    const suggestions = this.getSimilarPatterns(tokens, config, 3);
    
    return {
      matched: false,
      deviationReason: 'Rule does not match predefined patterns. You can still save; see suggestions below.',
      suggestions
    };
  }

  private roughMatch(tokens: RuleToken[], _pattern: RulePattern): boolean {
    const types = tokens.filter((t) => t.type !== 'text').map((t) => t.type);
    const hasPhrase = types.includes('phrase');
    const hasData = types.includes('dataElement');
    const hasOp = types.includes('operator');
    if (hasPhrase && hasData && (hasOp || types.includes('value'))) return true;
    if (hasPhrase && hasData) return true;
    return false;
  }

  /**
   * Get similar patterns based on token structure similarity
   */
  private getSimilarPatterns(tokens: RuleToken[], config: RuleSuggestorConfig, limit: number): PatternSuggestion[] {
    const tokenTypes = tokens.filter((t) => t.type !== 'text').map((t) => t.type);
    const currentStructure = {
      hasPhrase: tokenTypes.includes('phrase'),
      hasDataElement: tokenTypes.includes('dataElement'),
      hasOperator: tokenTypes.includes('operator'),
      hasConnector: tokenTypes.includes('connector'),
      dataElementCount: tokenTypes.filter(t => t === 'dataElement').length,
      operatorCount: tokenTypes.filter(t => t === 'operator').length,
      connectorCount: tokenTypes.filter(t => t === 'connector').length
    };

    const scoredPatterns = config.rulePatterns.map(pattern => {
      const { similarity, reason } = this.calculateSimilarity(currentStructure, pattern, tokens);
      return {
        pattern,
        similarity,
        reason
      };
    });

    // Sort by similarity (highest first) and take top N
    return scoredPatterns
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .filter(s => s.similarity > 0.3); // Only show if at least 30% similar
  }

  /**
   * Calculate similarity between current rule structure and a pattern
   */
  private calculateSimilarity(
    current: {
      hasPhrase: boolean;
      hasDataElement: boolean;
      hasOperator: boolean;
      hasConnector: boolean;
      dataElementCount: number;
      operatorCount: number;
      connectorCount: number;
    },
    pattern: RulePattern,
    tokens: RuleToken[]
  ): { similarity: number; reason: string } {
    let score = 0;
    let maxScore = 0;
    const reasons: string[] = [];

    // Check phrase (most important)
    maxScore += 3;
    if (current.hasPhrase) {
      score += 3;
    } else {
      reasons.push('Add a phrase like "Produce Error If"');
    }

    // Check data element
    maxScore += 2;
    if (current.hasDataElement) {
      score += 2;
    } else {
      reasons.push('Add at least one data element');
    }

    // Check operator
    maxScore += 2;
    if (current.hasOperator) {
      score += 2;
    } else if (current.hasDataElement) {
      reasons.push('Add an operator after the data element');
    }

    // Check connector (for multi-condition rules)
    if (pattern.exampleText.includes(' and ') || pattern.exampleText.includes(' or ')) {
      maxScore += 1;
      if (current.hasConnector) {
        score += 1;
      } else if (current.dataElementCount >= 1) {
        reasons.push('Use "and" or "or" to combine conditions');
      }
    }

    // Bonus: check if pattern name matches the current structure
    if (pattern.name.toLowerCase().includes('comparison') && current.dataElementCount >= 2) {
      score += 1;
      maxScore += 1;
    }
    if (pattern.name.toLowerCase().includes('populated') || pattern.name.toLowerCase().includes('present')) {
      const hasPopulatedOp = tokens.some(t => 
        t.type === 'operator' && 
        (t.displayText === 'populated' || t.displayText === 'present' || t.displayText === 'is present')
      );
      if (hasPopulatedOp) {
        score += 1;
        maxScore += 1;
      }
    }

    const similarity = maxScore > 0 ? score / maxScore : 0;
    const reason = reasons.length > 0 ? reasons.join('; ') : 'Structure matches pattern';

    return { similarity, reason };
  }
}
