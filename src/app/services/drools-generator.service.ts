import { Injectable } from '@angular/core';
import { RuleToken, DataElementToken, OperatorToken, ValueToken, ConnectorToken, TextToken } from '../models/token.model';
import { RuleSuggestorConfig } from '../models/rule-config.model';

@Injectable({ providedIn: 'root' })
export class DroolsGeneratorService {
  /**
   * Generates the "when" part of a Drools rule from tokenized rule.
   * Uses completeValue (path) for field reference and maps operators to Drools syntax.
   */
  generateWhenClause(tokens: RuleToken[], config: RuleSuggestorConfig): string {
    const parts: string[] = [];
    let i = 0;

    while (i < tokens.length) {
      const t = tokens[i];

      if (t.type === 'dataElement') {
        const dataToken = t as DataElementToken;
        i++; // consume data element
        
        // Skip spaces/text tokens
        while (i < tokens.length && tokens[i].type === 'text' && tokens[i].displayText.trim() === '') {
          i++;
        }

        const opToken = i < tokens.length && tokens[i].type === 'operator' ? (tokens[i] as OperatorToken) : undefined;
        if (!opToken) {
          parts.push(`${this.toDroolsFieldPath(dataToken.completeValue)} != null`);
          continue;
        }

        const opDef = config.operators.find((o) => o.id === opToken.operatorId);
        const droolsOp = opDef?.droolsOperator ?? opToken.symbol;
        const fieldPath = this.toDroolsFieldPath(dataToken.completeValue);
        i++; // consume operator

        // Skip spaces
        while (i < tokens.length && tokens[i].type === 'text' && tokens[i].displayText.trim() === '') {
          i++;
        }

        // Operators that don't need a value
        if (droolsOp === '== null') {
          parts.push(`${fieldPath} == null`);
          continue;
        } else if (droolsOp === '!= null') {
          parts.push(`${fieldPath} != null`);
          continue;
        } else if (droolsOp === 'empty') {
          parts.push(`${fieldPath} == ""`);
          continue;
        } else if (droolsOp === 'not empty') {
          parts.push(`${fieldPath} != ""`);
          continue;
        } else if (droolsOp === 'nullOrEmpty') {
          parts.push(`(${fieldPath} == null || ${fieldPath} == "")`);
          continue;
        } else if (droolsOp === 'notNullOrEmpty') {
          parts.push(`(${fieldPath} != null && ${fieldPath} != "")`);
          continue;
        }

        // Operators that need a value: collect text/value tokens until we hit a connector or data element
        let valueStr = '';
        while (i < tokens.length) {
          const tok = tokens[i];
          // Stop at connectors or data elements
          if (tok.type === 'connector' || tok.type === 'dataElement' || tok.type === 'operator') break;
          // Collect text/value tokens
          if (tok.type === 'text' || tok.type === 'value') {
            const txt = tok.displayText.trim();
            if (txt) {
              valueStr += txt;
            }
          }
          i++;
        }

        if (!valueStr) {
          // No value found, just output operator (shouldn't happen for equals, >, <, etc.)
          parts.push(`${fieldPath} ${droolsOp}`);
          continue;
        }

        const quotedValue = this.quoteIfString(valueStr);
        if (droolsOp === 'length >') {
          parts.push(`${fieldPath} != null && ${fieldPath}.length() > ${quotedValue}`);
        } else if (droolsOp === 'length <') {
          parts.push(`${fieldPath} != null && ${fieldPath}.length() < ${quotedValue}`);
        } else {
          parts.push(`${fieldPath} ${droolsOp} ${quotedValue}`);
        }
        continue;
      }

      if (t.type === 'connector') {
        const conn = t as ConnectorToken;
        const connDef = config.logicalConnectors.find((c) => c.id === conn.connectorId);
        parts.push(connDef?.droolsText ?? conn.displayText);
        i += 1;
        continue;
      }

      i += 1;
    }

    if (parts.length === 0) return '';
    return parts.join(' ');
  }

  private toDroolsFieldPath(completeValue: string): string {
    // Use the full path from the data element token
    // e.g. "Deposits.Deposits Contract.Account Number" as-is
    return completeValue;
  }

  private quoteIfString(val: string): string {
    const trimmed = val.trim();
    if (trimmed === 'null') return 'null';
    if (trimmed === 'true' || trimmed === 'false') return trimmed;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
      return trimmed;
    return `"${trimmed.replace(/"/g, '\\"')}"`;
  }
}
