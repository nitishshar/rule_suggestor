import { Injectable } from '@angular/core';
import { RuleSuggestorConfig, DataElement, PhraseSuggestion, OperatorDefinition, LogicalConnector } from '../models/rule-config.model';

export type SuggestionKind = 'phrase' | 'dataElement' | 'operator' | 'connector' | 'sample';

export interface SuggestionItem {
  kind: SuggestionKind;
  id: string;
  displayText: string;
  insertText: string;
  description?: string;
  /** For data elements */
  guid?: string;
  completeValue?: string;
  category?: string;
}

@Injectable({ providedIn: 'root' })
export class SuggestionService {
  /**
   * Get phrase suggestions (e.g. at start of input or after connector).
   */
  getPhraseSuggestions(config: RuleSuggestorConfig, _prefix: string): SuggestionItem[] {
    return config.phraseSuggestions.map((p) => ({
      kind: 'phrase' as const,
      id: p.id,
      displayText: p.displayText,
      insertText: p.insertText,
      description: p.description,
    }));
  }

  /**
   * Get data element suggestions filtered by prefix (display or complete value).
   */
  getDataElementSuggestions(config: RuleSuggestorConfig, prefix: string): SuggestionItem[] {
    const p = prefix.trim().toLowerCase();
    if (!p) return config.dataElements.map((e) => this.dataElementToSuggestion(e));

    return config.dataElements
      .filter(
        (e) =>
          e.displayValue.toLowerCase().includes(p) ||
          e.completeValue.toLowerCase().includes(p) ||
          e.guid.toLowerCase().includes(p)
      )
      .map((e) => this.dataElementToSuggestion(e));
  }

  private dataElementToSuggestion(e: DataElement): SuggestionItem {
    return {
      kind: 'dataElement',
      id: e.guid,
      displayText: e.displayValue,
      insertText: e.displayValue,
      completeValue: e.completeValue,
      guid: e.guid,
      category: e.category,
    };
  }

  /**
   * Get operator suggestions (optionally filtered).
   */
  getOperatorSuggestions(config: RuleSuggestorConfig, prefix: string): SuggestionItem[] {
    const p = prefix.trim().toLowerCase();
    return config.operators
      .filter(
        (o) =>
          !p ||
          o.displayLabel.toLowerCase().includes(p) ||
          o.symbol.toLowerCase().includes(p)
      )
      .map((o) => ({
        kind: 'operator' as const,
        id: o.id,
        displayText: o.displayLabel,
        insertText: o.displayLabel + ' ',
        description: o.symbol,
      }));
  }

  /**
   * Get connector suggestions (and, or, optionally ( ) ,).
   */
  getConnectorSuggestions(config: RuleSuggestorConfig, options?: { includeParen?: boolean; includeCloseComma?: boolean }): SuggestionItem[] {
    const { includeParen = false, includeCloseComma = false } = options ?? {};
    return config.logicalConnectors
      .filter((c) => {
        if (c.id === 'openParen') return includeParen;
        if (c.id === 'closeParen' || c.id === 'comma') return includeCloseComma;
        return c.id === 'and' || c.id === 'or';
      })
      .map((c) => ({
        kind: 'connector' as const,
        id: c.id,
        displayText: c.displayText,
        insertText: c.id === 'openParen' ? ' (' : c.id === 'closeParen' ? ') ' : c.id === 'comma' ? ', ' : ' ' + c.displayText + ' ',
      }));
  }

  /** After a complete condition: suggest and, or, ( */
  getConditionCompletorSuggestions(config: RuleSuggestorConfig): SuggestionItem[] {
    return this.getConnectorSuggestions(config, { includeParen: true });
  }

  /** Inside in(...) or not in(...): suggest ) and , */
  getInListSuggestions(config: RuleSuggestorConfig): SuggestionItem[] {
    return this.getConnectorSuggestions(config, { includeCloseComma: true });
  }

  /** After ): suggest and, or */
  getAfterCloseParenSuggestions(config: RuleSuggestorConfig): SuggestionItem[] {
    return this.getConnectorSuggestions(config, {});
  }

  /** After "in " or "not in ": suggest ( */
  getOpenParenSuggestion(config: RuleSuggestorConfig): SuggestionItem[] {
    return config.logicalConnectors
      .filter((c) => c.id === 'openParen')
      .map((c) => ({
        kind: 'connector' as const,
        id: c.id,
        displayText: c.displayText,
        insertText: ' (',
      }));
  }

  /**
   * Decide what to suggest based on current text and cursor.
   * Returns kind and prefix for filtering.
   */
  getSuggestionsForContext(
    config: RuleSuggestorConfig,
    textBeforeCursor: string,
    textAfterCursor: string
  ): { items: SuggestionItem[]; prefix: string } {
    const trimmed = textBeforeCursor.trimEnd();
    const lastWord = this.getLastWord(trimmed);
    
    // Check if text contains data elements (either with <> or matching known data element names)
    const hasLegacyBrackets = trimmed.includes('<') || trimmed.includes('>');
    const containsDataElement = hasLegacyBrackets || this.containsKnownDataElement(trimmed, config.dataElements);
    
    // Check if we're right after a data element (for operator suggestions)
    const endsWithDataElement = this.endsWithDataElement(trimmed, config.dataElements);

    // Check if text starts with a known phrase (but ONLY if no data elements yet)
    if (!containsDataElement) {
      const startsWithPhrase = config.phraseSuggestions.some(p => 
        trimmed.toLowerCase().startsWith(p.insertText.toLowerCase()) ||
        trimmed.toLowerCase().startsWith(p.displayText.toLowerCase())
      );

      // If starts with phrase and has more text after it -> suggest data elements
      if (startsWithPhrase) {
        const phraseMatch = config.phraseSuggestions.find(p => 
          trimmed.toLowerCase().startsWith(p.insertText.toLowerCase()) ||
          trimmed.toLowerCase().startsWith(p.displayText.toLowerCase())
        );
        if (phraseMatch) {
          const phraseLength = Math.max(phraseMatch.insertText.length, phraseMatch.displayText.length);
          const afterPhrase = trimmed.substring(phraseLength).trim();
          // If there's text after the phrase, use it as prefix for data element filtering
          if (afterPhrase) {
            return { items: this.getDataElementSuggestions(config, afterPhrase), prefix: afterPhrase };
          }
          // Just the phrase with optional space -> suggest data elements
          return { items: this.getDataElementSuggestions(config, ''), prefix: '' };
        }
      }
    }

    // At the very beginning (empty) -> phrase suggestions
    if (/^\s*$/.test(trimmed)) {
      const phrases = this.getPhraseSuggestions(config, lastWord);
      return { items: phrases, prefix: lastWord };
    }

    // Typing a phrase prefix (short text, no data elements yet)
    if (!containsDataElement && trimmed.length < 20) {
      const phrases = this.getPhraseSuggestions(config, lastWord);
      return { items: phrases, prefix: lastWord };
    }

    // Right after a data element (with space) -> suggest operators
    if (endsWithDataElement) {
      return { items: this.getOperatorSuggestions(config, ''), prefix: '' };
    }

    // Inside "in (" or "not in (" (comma-separated list) -> suggest ) and ,
    if (/in\s*\([^)]*$/i.test(trimmed) || /not\s+in\s*\([^)]*$/i.test(trimmed)) {
      return { items: this.getInListSuggestions(config), prefix: '' };
    }

    // After "in " or "not in " (before opening paren) -> suggest (
    if (/\bin\s*$/i.test(trimmed) || /not\s+in\s*$/i.test(trimmed)) {
      return { items: this.getOpenParenSuggestion(config), prefix: '' };
    }

    // After ")" (condition or list complete) -> suggest and, or (including "in (a,b) " with trailing space)
    if (trimmed.endsWith(')') || trimmed.endsWith(' )')) {
      return { items: this.getAfterCloseParenSuggestions(config), prefix: '' };
    }
    if (trimmed.endsWith(' ')) {
      const beforeSpace = trimmed.slice(0, -1);
      if (beforeSpace.endsWith(')')) {
        return { items: this.getAfterCloseParenSuggestions(config), prefix: '' };
      }
    }

    // Legacy: Inside or just after > -> operator or connector (show all operators when right after data element)
    if (trimmed.endsWith('>') || />\s*$/.test(trimmed)) {
      const after = textAfterCursor.trim();
      if (after.startsWith('and') || after.startsWith('or') || after.startsWith('(')) {
        return { items: this.getConditionCompletorSuggestions(config), prefix: '' };
      }
      return { items: this.getOperatorSuggestions(config, ''), prefix: '' };
    }

    // After "and " or "or " or "(" -> data element
    if (/\s(and|or)\s*$/i.test(trimmed) || /\s\(\s*$/.test(trimmed)) {
      return { items: this.getDataElementSuggestions(config, lastWord), prefix: lastWord };
    }

    // Typing prefix of "and" or "or" after a condition (e.g. "equals 890 an") -> suggest and, or, (
    if (containsDataElement && /^(a|an|and|o|or)$/i.test(lastWord)) {
      const beforeLastWord = trimmed.slice(0, trimmed.length - lastWord.length).trimEnd();
      if (beforeLastWord.length > 0) {
        const endsWithNumber = /\d+\s*$/.test(beforeLastWord) || /\s\d+\s*$/.test(beforeLastWord);
        const sortedOps = [...config.operators].sort(
          (a, b) => b.displayLabel.length - a.displayLabel.length
        );
        const endsWithOperator = sortedOps.some(
          (op) =>
            beforeLastWord.endsWith(op.displayLabel) ||
            beforeLastWord.endsWith(' ' + op.displayLabel)
        );
        // Check if we have operator and value after data element
        const words = beforeLastWord.trim().split(/\s+/);
        const hasOperatorAndValue = words.length >= 4; // phrase + data element + operator + value
        if (endsWithNumber || endsWithOperator || hasOperatorAndValue) {
          return { items: this.getConditionCompletorSuggestions(config), prefix: lastWord };
        }
      }
    }

    // After a condition (e.g. "...> is null" or "... is null") -> suggest (, and, or
    if (containsDataElement) {
      const sortedOps = [...config.operators].sort(
        (a, b) => b.displayLabel.length - a.displayLabel.length
      );
      for (const op of sortedOps) {
        if (
          trimmed.endsWith(op.displayLabel) ||
          trimmed.endsWith(' ' + op.displayLabel)
        ) {
          return { items: this.getConditionCompletorSuggestions(config), prefix: '' };
        }
      }
      // Also suggest (, and, or when user just typed a space after condition (e.g. "... is null ")
      if (trimmed.endsWith(' ')) {
        const beforeSpace = trimmed.slice(0, -1);
        for (const op of sortedOps) {
          if (
            beforeSpace.endsWith(op.displayLabel) ||
            beforeSpace.endsWith(' ' + op.displayLabel)
          ) {
            return { items: this.getConditionCompletorSuggestions(config), prefix: '' };
          }
        }
        // After "operator value " (e.g. "... greater than 10 ") -> suggest (, and, or (free-text value allowed)
        if (/\s\d+\s*$/.test(beforeSpace) || /\d+\s*$/.test(beforeSpace)) {
          return { items: this.getConditionCompletorSuggestions(config), prefix: '' };
        }
        // After "operator word " (e.g. "... equals something ") -> suggest (, and, or
        if (this.containsKnownDataElement(beforeSpace, config.dataElements) && /\s[a-zA-Z0-9"]+\s*$/.test(beforeSpace)) {
          // Check if we have at least operator + value after the data element
          const words = beforeSpace.trim().split(/\s+/);
          if (words.length >= 3) { // phrase + dataElement + operator + value
            return { items: this.getConditionCompletorSuggestions(config), prefix: '' };
          }
        }
      }
    }

    // Typing inside potential <...> (no closing > yet)
    const openAngle = trimmed.lastIndexOf('<');
    if (openAngle !== -1 && !trimmed.includes('>', openAngle)) {
      const prefix = trimmed.slice(openAngle + 1);
      return { items: this.getDataElementSuggestions(config, prefix), prefix };
    }

    // Default: mix phrase (if short) and data element by prefix
    if (trimmed.length < 30) {
      const phrases = this.getPhraseSuggestions(config, lastWord);
      if (phrases.length) return { items: phrases, prefix: lastWord };
    }
    return { items: this.getDataElementSuggestions(config, lastWord), prefix: lastWord };
  }

  private containsKnownDataElement(text: string, dataElements: DataElement[]): boolean {
    const lowerText = text.toLowerCase();
    return dataElements.some(de => lowerText.includes(de.displayValue.toLowerCase()));
  }

  private endsWithDataElement(text: string, dataElements: DataElement[]): boolean {
    const trimmed = text.trimEnd();
    // Sort by length descending to match longest names first
    const sorted = [...dataElements].sort((a, b) => b.displayValue.length - a.displayValue.length);
    
    for (const de of sorted) {
      // Check if text ends with the data element name followed by a space
      const pattern = new RegExp(`\\b${de.displayValue}\\s*$`, 'i');
      if (pattern.test(trimmed)) {
        return true;
      }
    }
    return false;
  }

  private getLastWord(text: string): string {
    const match = text.match(/\S+$/);
    return match ? match[0] : '';
  }
}
