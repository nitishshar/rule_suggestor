import { Injectable } from '@angular/core';
import { RuleToken, DataElementToken, OperatorToken, ValueToken, ConnectorToken, TextToken } from '../models/token.model';
import { RuleSuggestorConfig } from '../models/rule-config.model';
import { MultiCriteriaRule, RuleCriteria } from '../models/multi-criteria-rule.model';

interface DroolsCondition {
  entity: string;
  attribute: string;
  condition: string;
  connector?: string; // The connector AFTER this condition (&&, ||, or none)
  fullPath: string; // Original completeValue for entity determination
}

@Injectable({ providedIn: 'root' })
export class DroolsGeneratorService {
  /**
   * Generates the "when" part of a Drools rule from tokenized rule.
   * Format: <Entity>:(attribute condition1 && attribute condition2)
   * Example: <Deposits.Deposits Contract>:(Contract Identifier == null && Balance > 100)
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
        let conditionStr = '';
        
        if (!opToken) {
          conditionStr = `${attribute} != null`;
        } else {
          const opDef = config.operators.find((o) => o.id === opToken.operatorId);
          const droolsOp = opDef?.droolsOperator ?? opToken.symbol;
          i++; // consume operator

          // Skip spaces
          while (i < tokens.length && tokens[i].type === 'text' && tokens[i].displayText.trim() === '') {
            i++;
          }

          // Operators that don't need a value
          if (droolsOp === '== null') {
            conditionStr = `${attribute} == null`;
          } else if (droolsOp === '!= null') {
            conditionStr = `${attribute} != null`;
          } else if (droolsOp === 'empty') {
            conditionStr = `${attribute} == ""`;
          } else if (droolsOp === 'not empty') {
            conditionStr = `${attribute} != ""`;
          } else if (droolsOp === 'nullOrEmpty') {
            conditionStr = `(${attribute} == null || ${attribute} == "")`;
          } else if (droolsOp === 'notNullOrEmpty') {
            conditionStr = `(${attribute} != null && ${attribute} != "")`;
          } else if (droolsOp === 'in' || droolsOp === 'not in') {
            // Special handling for "in" and "not in" - collect everything including ( ) and ,
            const listValues: string[] = [];
            let currentValue = '';
            let parenDepth = 0;
            let foundOpenParen = false;
            
            while (i < tokens.length) {
              const tok = tokens[i];
              
              // Track parentheses depth
              if (tok.type === 'connector') {
                const connToken = tok as ConnectorToken;
                if (connToken.connectorId === 'openParen') {
                  parenDepth++;
                  foundOpenParen = true;
                } else if (connToken.connectorId === 'closeParen') {
                  // Add the last value before closing
                  if (currentValue.trim()) {
                    listValues.push(this.quoteWithSingleQuotes(currentValue.trim()));
                    currentValue = '';
                  }
                  parenDepth--;
                  i++;
                  if (parenDepth === 0) break; // Completed the list
                } else if (connToken.connectorId === 'comma') {
                  // End current value, start next
                  if (currentValue.trim()) {
                    listValues.push(this.quoteWithSingleQuotes(currentValue.trim()));
                    currentValue = '';
                  }
                } else {
                  // Hit "and" or "or" - stop here
                  break;
                }
              } else if (tok.type === 'text' || tok.type === 'value') {
                const txt = tok.displayText.trim();
                if (txt) currentValue += txt;
              } else if (tok.type === 'dataElement' || tok.type === 'operator') {
                // Hit another data element or operator - stop
                break;
              }
              i++;
            }
            
            if (foundOpenParen && listValues.length > 0) {
              const listStr = `(${listValues.join(', ')})`;
              conditionStr = `${attribute} ${droolsOp} ${listStr}`;
            } else {
              conditionStr = `${attribute} ${droolsOp}`;
            }
          } else {
            // Operators that need a value (equals, >, <, etc.)
            let valueStr = '';
            while (i < tokens.length) {
              const tok = tokens[i];
              if (tok.type === 'connector' || tok.type === 'dataElement' || tok.type === 'operator') break;
              if (tok.type === 'text' || tok.type === 'value') {
                const txt = tok.displayText.trim();
                if (txt) valueStr += txt;
              }
              i++;
            }

            if (!valueStr) {
              conditionStr = `${attribute} ${droolsOp}`;
            } else {
              const quotedValue = this.quoteIfString(valueStr);
              if (droolsOp === 'length >') {
                conditionStr = `${attribute} != null && ${attribute}.length() > ${quotedValue}`;
              } else if (droolsOp === 'length <') {
                conditionStr = `${attribute} != null && ${attribute}.length() < ${quotedValue}`;
              } else {
                conditionStr = `${attribute} ${droolsOp} ${quotedValue}`;
              }
            }
          }
        }

        // Check for connector after this condition
        while (i < tokens.length && tokens[i].type === 'text' && tokens[i].displayText.trim() === '') {
          i++;
        }

        let connector: string | undefined;
        if (i < tokens.length && tokens[i].type === 'connector') {
          const connToken = tokens[i] as ConnectorToken;
          const connDef = config.logicalConnectors.find((c) => c.id === connToken.connectorId);
          connector = connDef?.droolsText ?? connToken.displayText;
          i++; // consume connector
        }

        conditions.push({ entity, attribute, condition: conditionStr, connector, fullPath: dataToken.completeValue });
        continue;
      }

      i += 1;
    }

    // Group conditions by entity and preserve connectors
    return this.formatDroolsOutput(conditions);
  }

  private parseCompleteValue(completeValue: string): { entity: string; attribute: string } {
    // Split by dots: "Deposits.Deposits Contract.Contract Identifier"
    // First TWO parts = entity, LAST part = attribute name for condition
    // Full path after first two = full attribute path for grouping
    const parts = completeValue.split('.');
    if (parts.length >= 3) {
      // Entity: first TWO parts "Deposits.Deposits"
      const entity = parts.slice(0, 2).join('.');
      // Attribute: LAST part only "Contract Identifier" for use in conditions
      const attribute = parts[parts.length - 1];
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

    // Use the first condition's full path to determine the output entity
    // E.g., "Deposits.Deposits Contract.Contract Identifier" -> "Deposits.Deposits Contract"
    const firstParts = conditions[0].fullPath.split('.');
    const outputEntity = firstParts.length >= 3 ? firstParts.slice(0, firstParts.length - 1).join('.') : conditions[0].entity;
    
    // Within the group, join conditions based on whether attributes are the same
    const condParts: string[] = [];
    for (let i = 0; i < conditions.length; i++) {
      condParts.push(conditions[i].condition);
      // Add connector between conditions
      if (i < conditions.length - 1) {
        const currentAttr = conditions[i].attribute;
        const nextAttr = conditions[i + 1].attribute;
        
        // If same attribute name, use comma; otherwise use &&
        if (currentAttr === nextAttr) {
          condParts.push(' , ');
        } else {
          condParts.push(' && ');
        }
      }
    }
    
    const conditionsStr = condParts.join('');
    return `<${outputEntity}>:(${conditionsStr})`;
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

  private quoteWithSingleQuotes(val: string): string {
    const trimmed = val.trim();
    if (trimmed === 'null') return 'null';
    if (trimmed === 'true' || trimmed === 'false') return trimmed;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
      return trimmed;
    return `'${trimmed.replace(/'/g, "\\'")}'`;
  }

  /**
   * Generate comprehensive Drools output for multi-criteria rules
   * Includes main rule statement and all criteria sections
   */
  generateMultiCriteriaWhenClause(
    ruleNumber: number,
    mainTokens: RuleToken[],
    criterias: RuleCriteria[],
    config: RuleSuggestorConfig
  ): string {
    const lines: string[] = [];
    
    // Add rule number header
    lines.push(`// Rule #${ruleNumber}`);
    lines.push('');
    
    // Generate main rule when clause
    const mainWhen = this.generateWhenClause(mainTokens, config);
    if (mainWhen) {
      lines.push(`// Main Condition:`);
      lines.push(mainWhen);
      lines.push('');
    }
    
    // Add criteria sections
    for (const criteria of criterias) {
      if (criteria.conditions.length > 0) {
        lines.push(`// ${criteria.sectionTitle}`);
        criteria.conditions.forEach((cond) => {
          lines.push(`//   ${cond.number}. ${cond.text}`);
        });
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Generate complete Drools rule (rule + when + then) for multi-criteria
   */
  generateCompleteMultiCriteriaRule(
    ruleNumber: number,
    mainTokens: RuleToken[],
    criterias: RuleCriteria[],
    config: RuleSuggestorConfig
  ): string {
    const lines: string[] = [];
    
    lines.push(`rule "BusinessRule_${ruleNumber}"`);
    lines.push(`when`);
    
    // Generate main when clause
    const mainWhen = this.generateWhenClause(mainTokens, config);
    if (mainWhen) {
      lines.push(`  ${mainWhen}`);
    }
    
    // Add criteria as comments (or could be converted to additional conditions)
    for (const criteria of criterias) {
      if (criteria.conditions.length > 0) {
        lines.push(`  // ${criteria.sectionTitle}`);
        criteria.conditions.forEach((cond) => {
          lines.push(`  //   ${cond.number}. ${cond.text}`);
        });
      }
    }
    
    lines.push(`then`);
    lines.push(`  // TODO: Define action (error, warning, etc.)`);
    lines.push(`end`);
    
    return lines.join('\n');
  }
}
