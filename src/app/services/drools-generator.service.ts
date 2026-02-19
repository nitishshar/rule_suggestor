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

      // Handle standalone parentheses (not part of "in" operator)
      if (t.type === 'connector') {
        const connToken = t as ConnectorToken;
        if (connToken.connectorId === 'openParen' || connToken.connectorId === 'closeParen') {
          // Add parenthesis as a pseudo-condition
          conditions.push({
            entity: '',
            attribute: '',
            condition: connToken.connectorId === 'openParen' ? '(' : ')',
            fullPath: ''
          });
          i++;
          continue;
        }
      }

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
          conditionStr = `${this.wrapAttribute(attribute)} != null`;
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
            conditionStr = `${this.wrapAttribute(attribute)} == null`;
          } else if (droolsOp === '!= null') {
            conditionStr = `${this.wrapAttribute(attribute)} != null`;
          } else if (droolsOp === 'empty') {
            conditionStr = `${this.wrapAttribute(attribute)} == ""`;
          } else if (droolsOp === 'not empty') {
            conditionStr = `${this.wrapAttribute(attribute)} != ""`;
          } else if (droolsOp === 'nullOrEmpty') {
            conditionStr = `(${this.wrapAttribute(attribute)} == null || ${this.wrapAttribute(attribute)} == "")`;
          } else if (droolsOp === 'notNullOrEmpty') {
            conditionStr = `(${this.wrapAttribute(attribute)} != null && ${this.wrapAttribute(attribute)} != "")`;
          } else if (droolsOp === 'in' || droolsOp === 'not in') {
            // Special handling for "in" and "not in" - collect everything including ( ) or [ ] and ,
            const listValues: string[] = [];
            let currentValue = '';
            let bracketDepth = 0;
            let foundOpenBracket = false;
            
            while (i < tokens.length) {
              const tok = tokens[i];
              
              // Track brackets/parentheses depth (both ( ) and [ ] work)
              if (tok.type === 'connector') {
                const connToken = tok as ConnectorToken;
                if (connToken.connectorId === 'openParen' || connToken.connectorId === 'openBracket') {
                  bracketDepth++;
                  foundOpenBracket = true;
                } else if (connToken.connectorId === 'closeParen' || connToken.connectorId === 'closeBracket') {
                  // Add the last value before closing
                  if (currentValue.trim()) {
                    listValues.push(this.quoteWithSingleQuotes(currentValue.trim()));
                    currentValue = '';
                  }
                  bracketDepth--;
                  i++;
                  if (bracketDepth === 0) break; // Completed the list
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
            
            if (foundOpenBracket && listValues.length > 0) {
              const listStr = `(${listValues.join(', ')})`;
              conditionStr = `${this.wrapAttribute(attribute)} ${droolsOp} ${listStr}`;
            } else {
              conditionStr = `${this.wrapAttribute(attribute)} ${droolsOp}`;
            }
          } else {
            // Operators that need a value (equals, >, <, etc.)
            // Check if next token is a data element (for comparing two data elements)
            let valueStr = '';
            let isDataElementComparison = false;
            let comparisonAttribute = '';
            
            if (i < tokens.length && tokens[i].type === 'dataElement') {
              // Comparing two data elements (e.g., "Balance > Transaction Amount")
              const valueDataToken = tokens[i] as DataElementToken;
              const { attribute: valueAttr } = this.parseCompleteValue(valueDataToken.completeValue);
              comparisonAttribute = valueAttr;
              isDataElementComparison = true;
              i++; // consume data element
            } else {
              // Regular value comparison
              while (i < tokens.length) {
                const tok = tokens[i];
                if (tok.type === 'connector' || tok.type === 'dataElement' || tok.type === 'operator') break;
                if (tok.type === 'text' || tok.type === 'value') {
                  const txt = tok.displayText.trim();
                  if (txt) valueStr += txt;
                }
                i++;
              }
            }

            if (isDataElementComparison) {
              // Data element comparison - wrap both attributes
              conditionStr = `${this.wrapAttribute(attribute)} ${droolsOp} ${this.wrapAttribute(comparisonAttribute)}`;
            } else if (!valueStr) {
              conditionStr = `${this.wrapAttribute(attribute)} ${droolsOp}`;
            } else {
              const quotedValue = this.quoteIfString(valueStr);
              if (droolsOp === 'length >') {
                conditionStr = `${this.wrapAttribute(attribute)} != null && ${this.wrapAttribute(attribute)}.length() > ${quotedValue}`;
              } else if (droolsOp === 'length <') {
                conditionStr = `${this.wrapAttribute(attribute)} != null && ${this.wrapAttribute(attribute)}.length() < ${quotedValue}`;
              } else {
                conditionStr = `${this.wrapAttribute(attribute)} ${droolsOp} ${quotedValue}`;
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
          // Only treat and/or as connectors here (not parentheses)
          if (connToken.connectorId === 'and' || connToken.connectorId === 'or') {
            const connDef = config.logicalConnectors.find((c) => c.id === connToken.connectorId);
            connector = connDef?.droolsText ?? connToken.displayText;
            i++; // consume connector
          }
          // Parentheses will be handled in the main loop as standalone items
        }

        conditions.push({ entity, attribute, condition: conditionStr, connector, fullPath: dataToken.completeValue });
        continue;
      }

      i += 1;
    }

    // Group conditions by entity and preserve connectors
    return this.formatDroolsOutput(conditions);
  }

  /**
   * Wraps an attribute name in angle brackets for Drools syntax
   */
  private wrapAttribute(attribute: string): string {
    return `<${attribute}>`;
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

    // Find the first real condition (not a parenthesis) to determine output entity
    const firstRealCondition = conditions.find(c => c.fullPath);
    if (!firstRealCondition) return '';
    
    const firstParts = firstRealCondition.fullPath.split('.');
    const outputEntity = firstParts.length >= 3 ? firstParts.slice(0, firstParts.length - 1).join('.') : firstRealCondition.entity;
    
    // Join conditions using their actual connectors (respecting and/or and parentheses)
    let result = '';
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      const prevCond = i > 0 ? conditions[i - 1] : null;
      const nextCond = i < conditions.length - 1 ? conditions[i + 1] : null;
      
      // Handle opening parenthesis
      if (cond.condition === '(') {
        // Add space before ( if there's content before it
        if (result && !result.endsWith(' ')) {
          result += ' ';
        }
        result += '(';
        continue;
      }
      
      // Handle closing parenthesis
      if (cond.condition === ')') {
        result += ')';
        // Look for connector in previous real condition (not parenthesis)
        // to add after the closing paren
        for (let j = i - 1; j >= 0; j--) {
          if (conditions[j].condition !== '(' && conditions[j].condition !== ')') {
            if (conditions[j].connector && nextCond) {
              result += ` ${conditions[j].connector} `;
            }
            break;
          }
        }
        continue;
      }
      
      // Add the condition
      result += cond.condition;
      
      // Add connector after condition
      if (nextCond) {
        // Don't add connector if next is closing paren
        // (it will be handled by the closing paren logic)
        if (nextCond.condition !== ')' && cond.connector) {
          result += ` ${cond.connector} `;
        }
      }
    }
    
    return `<${outputEntity}>:(${result})`;
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
   * Includes main rule statement and all criteria sections with tokens
   */
  generateMultiCriteriaWhenClause(
    ruleNumber: number,
    mainTokens: RuleToken[],
    criterias: RuleCriteria[],
    config: RuleSuggestorConfig,
    criteriaTokens?: RuleToken[][][] // Optional: tokens for each criteria condition
  ): string {
    const lines: string[] = [];
    
    // Generate main rule when clause
    const mainWhen = this.generateWhenClause(mainTokens, config);
    if (mainWhen) {
      lines.push(`// Main Condition:`);
      lines.push(mainWhen);
      lines.push('');
    }
    
    // Add criteria sections with proper Drools formatting
    for (let i = 0; i < criterias.length; i++) {
      const criteria = criterias[i];
      if (criteria.conditions.length > 0) {
        lines.push(`// ${criteria.sectionTitle}`);
        
        for (let j = 0; j < criteria.conditions.length; j++) {
          const cond = criteria.conditions[j];
          
          // Try to generate Drools from tokens if available
          if (criteriaTokens && criteriaTokens[i] && criteriaTokens[i][j]) {
            const tokens = criteriaTokens[i][j];
            const droolsCondition = this.generateWhenClause(tokens, config);
            if (droolsCondition) {
              lines.push(droolsCondition);
            } else {
              // Fallback to plain text if generation fails
              lines.push(cond.text);
            }
          } else {
            // No tokens available, use plain text
            lines.push(cond.text);
          }
        }
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
