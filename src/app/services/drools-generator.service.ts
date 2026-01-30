import { Injectable } from '@angular/core';
import { RuleToken, DataElementToken, OperatorToken, ValueToken, ConnectorToken } from '../models/token.model';
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
        const opToken = tokens[i + 1] as OperatorToken | undefined;
        const valueToken = tokens[i + 2] as ValueToken | undefined;

        const fieldPath = this.toDroolsFieldPath(dataToken.completeValue);
        let condition = '';

        if (opToken?.type === 'operator') {
          const opDef = config.operators.find((o) => o.id === opToken.operatorId);
          const droolsOp = opDef?.droolsOperator ?? opToken.symbol;

          if (droolsOp === '== null') condition = `${fieldPath} == null`;
          else if (droolsOp === '!= null') condition = `${fieldPath} != null`;
          else if (droolsOp === 'empty') condition = `${fieldPath} == \"\"`;
          else if (droolsOp === 'not empty') condition = `${fieldPath} != \"\"`;
          else if (droolsOp === 'nullOrEmpty') condition = `(${fieldPath} == null || ${fieldPath} == \"\")`;
          else if (droolsOp === 'notNullOrEmpty') condition = `(${fieldPath} != null && ${fieldPath} != \"\")`;
          else if (droolsOp === 'length >') {
            const val = valueToken?.type === 'value' ? valueToken.value : '0';
            condition = `${fieldPath} != null && ${fieldPath}.length() > ${val}`;
            i += 2;
          } else if (droolsOp === 'length <') {
            const val = valueToken?.type === 'value' ? valueToken.value : '0';
            condition = `${fieldPath} != null && ${fieldPath}.length() < ${val}`;
            i += 2;
          } else if (valueToken?.type === 'value') {
            const v = this.quoteIfString(valueToken.value);
            condition = `${fieldPath} ${droolsOp} ${v}`;
            i += 2;
          } else {
            condition = `${fieldPath} ${droolsOp}`;
          }
          i += 1;
        } else {
          condition = `${fieldPath} != null`;
        }

        parts.push(condition);
        i += 1;
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
    // e.g. "Deposits.Deposits Contract.Contract Identifier" -> getLastPart or full path
    // For simplicity we use a camelCase last segment as typical in Drools facts.
    const segments = completeValue.split(/\s+/);
    const last = segments[segments.length - 1];
    return last.replace(/\s/g, '_').replace(/-/g, '_').toLowerCase() || completeValue;
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
