import { Injectable } from '@angular/core';
import {
  RuleToken,
  PhraseToken,
  DataElementToken,
  OperatorToken,
  ValueToken,
  ConnectorToken,
  TextToken,
  TokenizedRule,
} from '../models/token.model';
import {
  RuleSuggestorConfig,
  DataElement,
  PhraseSuggestion,
  OperatorDefinition,
  LogicalConnector,
} from '../models/rule-config.model';

@Injectable({ providedIn: 'root' })
export class RuleTokenizerService {
  /**
   * Parses raw rule text and builds tokens. Recognizes:
   * - Phrase suggestions (from config) at start
   * - <displayValue> or <completeValue> as data elements (matched by config)
   * - Operators and connectors from config
   * - Remaining as text/value
   */
  tokenize(rawText: string, config: RuleSuggestorConfig): TokenizedRule {
    const tokens: RuleToken[] = [];
    let i = 0;
    const len = rawText.length;
    let displayText = '';

    while (i < len) {
      const rest = rawText.slice(i);
      const trimmedRest = rest.replace(/^\s+/, '');
      const consumedSpace = rest.length - trimmedRest.length;
      if (consumedSpace > 0) {
        tokens.push({ type: 'text', displayText: ' ', startIndex: i, endIndex: i + consumedSpace });
        displayText += ' ';
        i += consumedSpace;
        continue;
      }

      // Try phrase at start (only if we're at beginning or after connector)
      const phraseMatch = this.matchPhrase(rest, config.phraseSuggestions);
      if (phraseMatch) {
        const phrase = phraseMatch.phrase;
        const t: PhraseToken = {
          type: 'phrase',
          phraseId: phrase.id,
          displayText: phrase.displayText,
          startIndex: i,
          endIndex: i + phraseMatch.len,
        };
        tokens.push(t);
        displayText += phrase.displayText;
        i += phraseMatch.len;
        continue;
      }

      // Try connector (and / or)
      const connMatch = this.matchConnector(rest, config.logicalConnectors);
      if (connMatch) {
        const conn = connMatch.connector;
        const t: ConnectorToken = {
          type: 'connector',
          connectorId: conn.id,
          displayText: conn.displayText,
          startIndex: i,
          endIndex: i + connMatch.len,
        };
        tokens.push(t);
        displayText += conn.displayText;
        i += connMatch.len;
        continue;
      }

      // Try data element: <...>
      const angleMatch = /^<([^>]*)>/.exec(rest);
      if (angleMatch) {
        const inside = angleMatch[1].trim();
        const dataEl = this.findDataElement(inside, config.dataElements);
        const t: DataElementToken = {
          type: 'dataElement',
          guid: dataEl?.guid ?? '',
          displayValue: dataEl?.displayValue ?? inside,
          completeValue: dataEl?.completeValue ?? inside,
          fullValue: inside,
          displayText: dataEl?.displayValue ?? inside,
          startIndex: i,
          endIndex: i + angleMatch[0].length,
        };
        tokens.push(t);
        displayText += t.displayText; // show display only in editor
        i += angleMatch[0].length;
        continue;
      }

      // Try operator
      const opMatch = this.matchOperator(rest, config.operators);
      if (opMatch) {
        const op = opMatch.op;
        const consumed = rest.slice(0, opMatch.len);
        const trailingSpaces = consumed.length - consumed.trimEnd().length;
        const opEnd = i + opMatch.len - trailingSpaces;
        const t: OperatorToken = {
          type: 'operator',
          operatorId: op.id,
          symbol: op.symbol,
          displayText: op.displayLabel,
          startIndex: i,
          endIndex: opEnd,
        };
        tokens.push(t);
        displayText += op.displayLabel;
        i = opEnd;
        if (trailingSpaces > 0) {
          tokens.push({ type: 'text', displayText: ' '.repeat(trailingSpaces), startIndex: i, endIndex: i + trailingSpaces });
          displayText += ' '.repeat(trailingSpaces);
          i += trailingSpaces;
        }
        continue;
      }

      // Single character as text
      tokens.push({ type: 'text', displayText: rest[0], startIndex: i, endIndex: i + 1 });
      displayText += rest[0];
      i += 1;
    }

    return { tokens, displayText, rawText };
  }

  private matchPhrase(text: string, phrases: PhraseSuggestion[]): { phrase: PhraseSuggestion; len: number } | null {
    const t = text.trimStart();
    for (const p of phrases) {
      if (t.startsWith(p.insertText)) return { phrase: p, len: text.length - t.length + p.insertText.length };
      if (t.startsWith(p.displayText)) return { phrase: p, len: text.length - t.length + p.displayText.length };
    }
    return null;
  }

  private matchConnector(
    text: string,
    connectors: LogicalConnector[]
  ): { connector: LogicalConnector; len: number } | null {
    const t = text.trimStart();
    for (const c of connectors) {
      const withSpace = c.displayText + ' ';
      if (t.startsWith(withSpace)) return { connector: c, len: text.length - t.length + withSpace.length };
      if (t.startsWith(c.displayText)) return { connector: c, len: text.length - t.length + c.displayText.length };
    }
    return null;
  }

  private matchOperator(text: string, operators: OperatorDefinition[]): { op: OperatorDefinition; len: number } | null {
    const t = text.trimStart();
    const sorted = [...operators].sort((a, b) => b.displayLabel.length - a.displayLabel.length);
    for (const op of sorted) {
      if (t.startsWith(op.displayLabel + ' ')) return { op, len: text.length - t.length + op.displayLabel.length + 1 };
      if (t.startsWith(op.symbol + ' ')) return { op, len: text.length - t.length + op.symbol.length + 1 };
      if (t === op.symbol) return { op, len: text.length - t.length + op.symbol.length };
    }
    return null;
  }

  private findDataElement(inside: string, elements: DataElement[]): DataElement | null {
    const lower = inside.toLowerCase();
    return (
      elements.find((e) => e.completeValue === inside) ??
      elements.find ((e) => e.displayValue === inside) ??
      elements.find((e) => e.guid === inside) ??
      elements.find((e) => e.displayValue.toLowerCase() === lower) ??
      null
    );
  }

  /** Get raw text from tokens (e.g. to re-edit). Data elements as <displayValue> for simplicity. */
  toRawFromTokens(tokens: RuleToken[]): string {
    return tokens
      .map((t) => {
        if (t.type === 'dataElement') return '<' + (t as DataElementToken).displayValue + '>';
        return t.displayText;
      })
      .join('');
  }
}
