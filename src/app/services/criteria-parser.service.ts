import { Injectable } from '@angular/core';
import { NumberedCondition } from '../models/multi-criteria-rule.model';

@Injectable({
  providedIn: 'root',
})
export class CriteriaParserService {
  /**
   * Parse numbered conditions from criteria text
   * Example input: "1. Balance type in Principal Balance (1)\n2. Transactions with amount is more than 0"
   * Returns array of NumberedCondition objects
   */
  parseNumberedConditions(text: string): NumberedCondition[] {
    if (!text || !text.trim()) {
      return [];
    }

    const conditions: NumberedCondition[] = [];
    const lines = text.split('\n');
    let currentNumber: number | null = null;
    let currentText = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to match numbered format: "1.", "2.", etc.
      const numberMatch = /^(\d+)\.\s*(.*)$/.exec(trimmed);
      
      if (numberMatch) {
        // Save previous condition if exists
        if (currentNumber !== null && currentText) {
          conditions.push({
            number: currentNumber,
            text: currentText.trim(),
          });
        }

        // Start new condition
        currentNumber = parseInt(numberMatch[1], 10);
        currentText = numberMatch[2];
      } else if (currentNumber !== null) {
        // Continuation of previous numbered item
        currentText += ' ' + trimmed;
      }
    }

    // Save last condition
    if (currentNumber !== null && currentText) {
      conditions.push({
        number: currentNumber,
        text: currentText.trim(),
      });
    }

    return conditions;
  }

  /**
   * Format numbered conditions back to text
   */
  formatNumberedConditions(conditions: NumberedCondition[]): string {
    return conditions.map((c) => `${c.number}. ${c.text}`).join('\n');
  }
}
