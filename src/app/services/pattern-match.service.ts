import { Injectable } from '@angular/core';
import { RuleToken } from '../models/token.model';
import { RuleSuggestorConfig, RulePattern } from '../models/rule-config.model';

export interface PatternMatchResult {
  matched: boolean;
  matchedPattern?: RulePattern;
  /** Human-readable reason for deviation */
  deviationReason?: string;
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
      return { matched: false, deviationReason: 'Rule should start with a phrase like "Produce Error If".' };
    }
    if (!hasDataElement && tokens.some((t) => t.type !== 'text' && t.type !== 'phrase')) {
      return { matched: false, deviationReason: 'Rule should include at least one data element in angle brackets.' };
    }

    for (const pattern of config.rulePatterns) {
      if (this.roughMatch(tokens, pattern)) {
        return { matched: true, matchedPattern: pattern };
      }
    }

    if (hasPhrase && hasDataElement) {
      return { matched: true }; // Custom but valid structure
    }

    return {
      matched: false,
      deviationReason: 'Rule does not match predefined patterns. You can still save; consider using a pattern from the info reference.',
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
}
