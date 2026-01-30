import { Injectable } from '@angular/core';
import { RuleToken, DataElementToken, OperatorToken, ValueToken, ConnectorToken, TextToken } from '../models/token.model';
import { RuleSuggestorConfig } from '../models/rule-config.model';

interface DroolsCondition {
  entity: string;
  attribute: string;
  condition: string;
}

@Injectable({ providedIn: 'root' })
export class DroolsGeneratorService {
  /**
   * Generates the "when" part of a Drools rule from tokenized rule.
   * Format: <Entity>:(attribute condition1 , attribute condition2)
   * Example: <Deposits.Deposits Contract>:(Contract Identifier == null , Balance > 100)
   */
  generateWhenClause(tokens: RuleToken[], config: RuleSuggestorConfig): string {
    const conditions: DroolsCondition[] = [];
    let i = 0;

    while (i < tokens.length) {
      const t = tokens[i];

      if (t.type === 'dataElement') {
        const dataToken = t as DataElementToken;
        const { entity, attribute } = this.parseCompleteValue(dataToken.completeValue);
        i++; // consume data element
        
        // Skip spaces/text tokens
        while (i < tokens.length && tokens[i].type === 'text' && tokens[i].displayText.trim() === '') {
          i++;
        }

        const opToken = i < tokens.length && tokens[i].type === 'operator' ? (tokens[i] as OperatorToken) : undefined;
        if (!opToken) {
          conditions.push({ entity, attribute, condition: `${attribute} != null` });
          continue;
        }

        const opDef = config.operators.find((o) => o.id === opToken.operatorId);
        const droolsOp = opDef?.droolsOperator ?? opToken.symbol;
        i++; // consume operator

        // Skip spaces
        while (i < tokens.length && tokens[i].type === 'text' && tokens[i].displayText.trim() === '') {
          i++;
        }

        // Operators that don't need a value
        if (droolsOp === '== null') {
          conditions.push({ entity, attribute, condition: `${attribute} == null` });
          continue;
        } else if (droolsOp === '!= null') {
          conditions.push({ entity, attribute, condition: `${attribute} != null` });
          continue;
        } else if (droolsOp === 'empty') {
          conditions.push({ entity, attribute, condition: `${attribute} == ""` });
          continue;
        } else if (droolsOp === 'not empty') {
          conditions.push({ entity, attribute, condition: `${attribute} != ""` });
          continue;
        } else if (droolsOp === 'nullOrEmpty') {
          conditions.push({ entity, attribute, condition: `(${attribute} == null || ${attribute} == "")` });
          continue;
        } else if (droolsOp === 'notNullOrEmpty') {
          conditions.push({ entity, attribute, condition: `(${attribute} != null && ${attribute} != "")` });
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
          conditions.push({ entity, attribute, condition: `${attribute} ${droolsOp}` });
          continue;
        }

        const quotedValue = this.quoteIfString(valueStr);
        if (droolsOp === 'length >') {
          conditions.push({ entity, attribute, condition: `${attribute} != null && ${attribute}.length() > ${quotedValue}` });
        } else if (droolsOp === 'length <') {
          conditions.push({ entity, attribute, condition: `${attribute} != null && ${attribute}.length() < ${quotedValue}` });
        } else {
          conditions.push({ entity, attribute, condition: `${attribute} ${droolsOp} ${quotedValue}` });
        }
        continue;
      }

      // Skip connectors - we'll group by entity instead
      i += 1;
    }

    // Group conditions by entity
    return this.formatDroolsOutput(conditions);
  }

  private parseCompleteValue(completeValue: string): { entity: string; attribute: string } {
    // Split by dots: "Deposits.Deposits Contract.Contract Identifier"
    // First two parts = entity, last part = attribute
    const parts = completeValue.split('.');
    if (parts.length >= 3) {
      // Has 3+ parts: first 2 are entity, rest is attribute
      const entity = parts.slice(0, 2).join('.');
      const attribute = parts.slice(2).join('.');
      return { entity, attribute };
    } else if (parts.length === 2) {
      // Has 2 parts: first is entity, second is attribute
      return { entity: parts[0], attribute: parts[1] };
    }
    // Fallback if only 1 part
    return { entity: completeValue, attribute: completeValue };
  }

  private formatDroolsOutput(conditions: DroolsCondition[]): string {
    if (conditions.length === 0) return '';

    // Group by entity
    const groupedByEntity = new Map<string, string[]>();
    
    for (const cond of conditions) {
      if (!groupedByEntity.has(cond.entity)) {
        groupedByEntity.set(cond.entity, []);
      }
      groupedByEntity.get(cond.entity)!.push(cond.condition);
    }

    // Format each entity group
    const entityClauses: string[] = [];
    for (const [entity, conditionList] of groupedByEntity.entries()) {
      const conditionsStr = conditionList.join(' , ');
      entityClauses.push(`<${entity}>:(${conditionsStr})`);
    }

    // Join entity groups with comma separator
    return entityClauses.join(' , ');
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
