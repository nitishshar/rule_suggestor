import { Injectable } from '@angular/core';
import { RuleSuggestorConfig } from '../models/rule-config.model';
import { RuleToken, DataElementToken } from '../models/token.model';
import { RuleTokenizerService } from './rule-tokenizer.service';

export interface ParsedCriteriaSection {
  sectionTitle: string;
  conditions: string[];
  tokens: RuleToken[][];
}

export interface DomainGroup {
  domain: string; // e.g., "Deposits.Deposits Contract"
  conditions: string[];
  tokens: RuleToken[][];
}

@Injectable({
  providedIn: 'root',
})
export class MultiCriteriaParserService {
  constructor(private tokenizer: RuleTokenizerService) {}

  /**
   * Parse complete rule text with criteria sections
   * Extracts main statement and criteria sections
   */
  parseCompleteRule(text: string, config: RuleSuggestorConfig): {
    mainStatement: string;
    mainTokens: RuleToken[];
    criteriaSections: ParsedCriteriaSection[];
  } {
    const lines = text.split('\n');
    let mainStatement = '';
    const criteriaSections: ParsedCriteriaSection[] = [];
    let currentSection: ParsedCriteriaSection | null = null;
    let inCriteriaMode = false; // Track if we've entered criteria sections

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if it's a section header (e.g., "Applicability criteria:", "TRIMS Specific Criteria:")
      // Must contain "criteria:" (case-insensitive)
      const sectionMatch = /^(.+criteria:)\s*$/i.exec(trimmed);
      if (sectionMatch) {
        // Save previous section
        if (currentSection && currentSection.conditions.length > 0) {
          criteriaSections.push(currentSection);
        }
        // Start new section and mark that we're in criteria mode
        inCriteriaMode = true;
        currentSection = {
          sectionTitle: sectionMatch[1],
          conditions: [],
          tokens: [],
        };
        continue;
      }

      // Check if it's a numbered condition (e.g., "1. Condition text")
      const numberMatch = /^(\d+)\.\s*(.+)$/.exec(trimmed);
      if (numberMatch) {
        const conditionText = numberMatch[2].trim();
        
        // If we have a current section, add to it
        if (currentSection) {
          currentSection.conditions.push(conditionText);
          
          // Tokenize the condition
          const tokenized = this.tokenizer.tokenize(conditionText, config);
          currentSection.tokens.push(tokenized.tokens);
        }
        continue;
      }

      // If we haven't entered criteria mode yet, it's part of the main statement
      if (!inCriteriaMode) {
        mainStatement += (mainStatement ? ' ' : '') + trimmed;
      }
      // Otherwise, if we're in a section and the line is not numbered, it might be a continuation
      // For now, we'll ignore non-numbered lines within criteria sections
    }

    // Save last section
    if (currentSection && currentSection.conditions.length > 0) {
      criteriaSections.push(currentSection);
    }

    // Tokenize main statement
    const mainTokenized = this.tokenizer.tokenize(mainStatement, config);

    return {
      mainStatement,
      mainTokens: mainTokenized.tokens,
      criteriaSections,
    };
  }

  /**
   * Group all tokens by domain.subdomain
   * Returns separate groups for each unique domain
   */
  groupByDomain(
    mainTokens: RuleToken[],
    criteriaSections: ParsedCriteriaSection[]
  ): DomainGroup[] {
    const domainMap = new Map<string, DomainGroup>();

    // Helper to extract domain from tokens
    const extractDomain = (tokens: RuleToken[]): string | null => {
      for (const token of tokens) {
        if (token.type === 'dataElement') {
          const dataEl = token as DataElementToken;
          // Extract first two parts of completeValue as domain
          const parts = dataEl.completeValue.split('.');
          if (parts.length >= 2) {
            return parts.slice(0, 2).join('.');
          }
        }
      }
      return null;
    };

    // Process main tokens
    const mainDomain = extractDomain(mainTokens);
    if (mainDomain) {
      if (!domainMap.has(mainDomain)) {
        domainMap.set(mainDomain, {
          domain: mainDomain,
          conditions: [],
          tokens: [],
        });
      }
      domainMap.get(mainDomain)!.tokens.push(mainTokens);
    }

    // Process criteria sections
    for (const section of criteriaSections) {
      for (let i = 0; i < section.tokens.length; i++) {
        const tokens = section.tokens[i];
        const condition = section.conditions[i];
        const domain = extractDomain(tokens);

        if (domain) {
          if (!domainMap.has(domain)) {
            domainMap.set(domain, {
              domain,
              conditions: [],
              tokens: [],
            });
          }
          domainMap.get(domain)!.conditions.push(condition);
          domainMap.get(domain)!.tokens.push(tokens);
        }
      }
    }

    return Array.from(domainMap.values());
  }
}
