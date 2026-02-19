import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  AfterViewInit,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RuleConfigService } from '../../services/rule-config.service';
import { SuggestionService, SuggestionItem } from '../../services/suggestion.service';
import { RuleTokenizerService } from '../../services/rule-tokenizer.service';
import { DroolsGeneratorService } from '../../services/drools-generator.service';
import { PatternMatchService } from '../../services/pattern-match.service';
import { MultiCriteriaParserService } from '../../services/multi-criteria-parser.service';
import { RuleSuggestorConfig } from '../../models/rule-config.model';
import { RuleToken, DataElementToken, OperatorToken, ConnectorToken, TokenizedRule } from '../../models/token.model';
import { RuleEditorFormatterComponent } from '../rule-editor-formatter/rule-editor-formatter.component';

interface DroolsExample {
  title: string;
  logicalRule: string;
  droolsExpression: string;
  description: string;
}

@Component({
  selector: 'app-rule-editor-sidebyside',
  standalone: true,
  imports: [CommonModule, RuleEditorFormatterComponent],
  templateUrl: './rule-editor-sidebyside.component.html',
  styleUrls: ['./rule-editor-sidebyside.component.scss'],
})
export class RuleEditorSidebysideComponent implements OnInit, AfterViewInit {
  private configService = inject(RuleConfigService);
  private suggestionService = inject(SuggestionService);
  private tokenizer = inject(RuleTokenizerService);
  private droolsGenerator = inject(DroolsGeneratorService);
  private patternMatch = inject(PatternMatchService);
  private multiCriteriaParser = inject(MultiCriteriaParserService);

  @ViewChild('logicalRuleInput') logicalRuleInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('droolsExpressionInput') droolsExpressionInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('logicalSuggestionList') logicalSuggestionList!: ElementRef<HTMLUListElement>;

  config = signal<RuleSuggestorConfig | null>(null);
  logicalRuleText = signal('');
  droolsExpressionText = signal('');
  cursorPosition = signal(0);
  suggestions = signal<SuggestionItem[]>([]);
  suggestionPrefix = signal('');
  showSuggestions = signal(false);
  selectedIndex = signal(0);
  isDarkTheme = signal(true);
  isAdvancedMode = signal(false);
  showCriteriaHelp = signal(false);
  
  // Help and Examples
  showDroolsHelp = signal(false);
  showLogicalRuleExamples = signal(false);
  showLogicalRuleHelp = signal(false);
  
  // Warnings
  deviationWarning = signal<string | null>(null);
  patternSuggestions = signal<Array<{ name: string; example: string; reason: string }>>([]);
  dismissedCompletenessWarning = signal(false);
  dismissedBracketWarning = signal(false);
  dismissedDeviationWarning = signal(false);

  tokenized = computed(() => {
    const cfg = this.config();
    const raw = this.logicalRuleText();
    if (!cfg) return null;
    return this.tokenizer.tokenize(raw, cfg);
  });

  formattedTokens = computed(() => this.tokenized()?.tokens ?? []);

  // Internal warning signals (always compute)
  private _bracketWarningInternal = computed(() => {
    const raw = this.logicalRuleText();
    if (!raw.trim()) return null;
    
    const result = this.validateBrackets(raw);
    return result.valid ? null : result.message;
  });

  private _completenessWarningInternal = computed(() => {
    const cfg = this.config();
    if (!cfg) return null;
    
    const rawText = this.logicalRuleText().trim();
    if (rawText.length === 0) return null;
    
    // In advanced mode, parse the multi-criteria rule first
    if (this.isAdvancedMode()) {
      const parsed = this.multiCriteriaParser.parseCompleteRule(rawText, cfg);
      
      // Validate main statement if it exists
      if (parsed.mainStatement) {
        const result = this.validateRuleCompleteness(parsed.mainTokens, cfg, false);
        if (!result.valid) return result.message;
      }
      
      // Validate each criteria section condition (skip phrase check for these)
      for (const section of parsed.criteriaSections) {
        for (const tokens of section.tokens) {
          const result = this.validateRuleCompleteness(tokens, cfg, true);
          if (!result.valid) return result.message;
        }
      }
      
      return null;
    } else {
      // Simple mode validation
      const tok = this.tokenized();
      if (!tok) return null;
      
      const result = this.validateRuleCompleteness(tok.tokens, cfg);
      return result.valid ? null : result.message;
    }
  });

  // Public warning signals (respect dismissal)
  bracketWarning = computed(() => {
    if (this.dismissedBracketWarning()) return null;
    return this._bracketWarningInternal();
  });

  completenessWarning = computed(() => {
    if (this.dismissedCompletenessWarning()) return null;
    return this._completenessWarningInternal();
  });

  // Track if there are any warnings (for red border highlight)
  hasActiveWarnings = computed(() => {
    return !!(this._bracketWarningInternal() || this._completenessWarningInternal() || this.deviationWarning());
  });

  droolsExamples: DroolsExample[] = [
    {
      title: 'Existence - Attribute Population',
      logicalRule: 'Produce Error If Contract Identifier is null or empty',
      droolsExpression: '<Deposits.Deposits Contract>:(Contract Identifier == null || Contract Identifier == "")',
      description: 'Check if required attributes are populated'
    },
    {
      title: 'Comparison - Data Element Comparison',
      logicalRule: 'Produce Error If Balance greater than Transaction Amount',
      droolsExpression: '<Deposits.Deposits Account>:(Balance > Transaction Amount)',
      description: 'Compare values between two data elements'
    },
    {
      title: 'Natural Language - Using "is"',
      logicalRule: 'Produce Error If Balance is 0',
      droolsExpression: '<Deposits.Deposits Account>:(Balance == 0)',
      description: 'Natural language equality check'
    },
    {
      title: 'Domain Values - Using "in"',
      logicalRule: 'Produce Error If life cycle status code not in [ACTIVE,CLOSED,PENDING]',
      droolsExpression: '<Deposits.Deposits>:(life cycle status code not in (\'ACTIVE\', \'CLOSED\', \'PENDING\'))',
      description: 'Validate values against predefined list'
    },
    {
      title: 'Grouped Conditions - Using Parentheses',
      logicalRule: 'Produce Error If Balance is 0 and (Status is ACTIVE or Status is PENDING)',
      droolsExpression: '<Deposits.Deposits Account>:(Balance == 0 && (Status == "ACTIVE" || Status == "PENDING"))',
      description: 'Complex conditions with logical grouping'
    },
    {
      title: 'Populated Check',
      logicalRule: 'Produce Error If Contract Identifier is populated',
      droolsExpression: '<Deposits.Deposits Contract>:(Contract Identifier != null)',
      description: 'Check if field has a value (is not null)'
    }
  ];

  logicalRuleExamples: string[] = [
    'Produce Error If Contract Identifier is null',
    'Produce Error If Balance greater than Transaction Amount',
    'Produce Error If Balance is 0',
    'Produce Error If life cycle status code in [ACTIVE,CLOSED]',
    'Produce Error If Account Number is present and Balance is null or blank',
    'Produce Error If Balance is 0 and (Status is ACTIVE or Status is PENDING)'
  ];

  logicalRuleHelpText = `
**Logical Rule Syntax Help:**

**Basic Structure:**
- Start with a phrase: "Produce Error If", "Produce Warning If"
- Add data element: Contract Identifier, Balance, Account Number
- Add operator: is null, equals, greater than, in
- Add value or another data element

**Operators:**
- Existence: is null, is not null, populated, is present, is null or blank
- Comparison: equals, is, greater than, less than, >, <
- Lists: in, not in, is in, is not in (use [] or ())
- Natural Language: "is" for equals, "populated" for not null

**Combining Conditions:**
- Use "and" or "or" to combine
- Use () or [] for grouping
- Example: (Balance > 0 and Status is ACTIVE) or Amount > 1000

**Tips:**
- Autocomplete suggests as you type
- Both [] and () work for lists
- Case doesn't matter for phrases
  `;

  ngOnInit() {
    this.configService.getConfig().subscribe((cfg) => {
      this.config.set(cfg);
      
      // Initialize advanced mode from config if not overridden by localStorage
      const savedAdvancedMode = localStorage.getItem('rule-editor-sidebyside-advanced-mode');
      if (savedAdvancedMode !== null) {
        // Use localStorage if it exists (user preference)
        this.isAdvancedMode.set(savedAdvancedMode === 'true');
      } else if (cfg.advancedMode?.enabled !== undefined) {
        // Otherwise use config default
        this.isAdvancedMode.set(cfg.advancedMode.enabled);
      }
    });
    
    // Load saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      this.isDarkTheme.set(false);
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      this.isDarkTheme.set(true);
      document.documentElement.removeAttribute('data-theme');
    }
  }

  ngAfterViewInit() {
    // Initial focus setup if needed
  }

  toggleDarkTheme() {
    const newTheme = !this.isDarkTheme();
    this.isDarkTheme.set(newTheme);
    
    if (newTheme) {
      // Switch to dark theme
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      // Switch to light theme
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  }

  onLogicalRuleInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    this.logicalRuleText.set(ta.value);
    this.cursorPosition.set(ta.selectionStart);
    
    // Reset dismissed warnings when user types
    this.dismissedCompletenessWarning.set(false);
    this.dismissedBracketWarning.set(false);
    
    this.updateSuggestions(ta.value, ta.selectionStart);
  }

  onLogicalRuleKeyUp(event: KeyboardEvent) {
    const ta = event.target as HTMLTextAreaElement;
    this.cursorPosition.set(ta.selectionStart);
  }

  onLogicalRuleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && this.showSuggestions() && this.suggestions().length > 0) {
      event.preventDefault();
      this.selectSuggestion(this.suggestions()[this.selectedIndex()]);
    } else if (event.key === 'Tab' && this.showSuggestions() && this.suggestions().length > 0) {
      event.preventDefault();
      this.selectSuggestion(this.suggestions()[this.selectedIndex()]);
    } else if (event.key === 'ArrowDown' && this.showSuggestions()) {
      event.preventDefault();
      this.selectedIndex.update((i) => Math.min(i + 1, this.suggestions().length - 1));
    } else if (event.key === 'ArrowUp' && this.showSuggestions()) {
      event.preventDefault();
      this.selectedIndex.update((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Escape') {
      this.showSuggestions.set(false);
    }
  }

  onLogicalRuleFocus() {
    const ta = this.logicalRuleInput?.nativeElement;
    if (ta) {
      this.updateSuggestions(ta.value, ta.selectionStart);
    }
  }

  onLogicalRuleBlur() {
    setTimeout(() => {
      this.showSuggestions.set(false);
    }, 200);
  }

  onDroolsExpressionInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    this.droolsExpressionText.set(ta.value);
  }

  onDroolsExpressionFocus() {
    // Auto-generate Drools when focusing on the Drools expression field
    // Only if logical rule exists and field is currently empty
    if (this.logicalRuleText().trim() && !this.droolsExpressionText().trim()) {
      this.generateDrools();
    }
  }

  updateSuggestions(text: string, cursorPos: number) {
    const cfg = this.config();
    if (!cfg) return;

    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);

    const result = this.suggestionService.getSuggestionsForContext(cfg, beforeCursor, afterCursor);
    
    this.suggestions.set(result.items);
    this.suggestionPrefix.set(result.prefix); // Store the prefix for correct replacement
    this.selectedIndex.set(0);
    this.showSuggestions.set(result.items.length > 0);
  }

  selectSuggestion(item: SuggestionItem) {
    const ta = this.logicalRuleInput?.nativeElement;
    if (!ta) return;

    const cursorPos = ta.selectionStart;
    const text = ta.value;
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    const prefix = this.suggestionPrefix();

    // Calculate replacement position based on prefix from suggestion service
    // If there's a prefix, replace it; otherwise just insert at cursor
    const replaceStart = prefix ? cursorPos - prefix.length : cursorPos;
    
    // Add space before operator if needed (when no prefix and no trailing space)
    let insertText = item.insertText;
    if (!prefix && item.kind === 'operator' && replaceStart > 0) {
      const charBeforeInsert = text.charAt(replaceStart - 1);
      if (charBeforeInsert !== ' ' && charBeforeInsert !== '\n') {
        insertText = ' ' + insertText;
      }
    }

    const newText = text.substring(0, replaceStart) + insertText + afterCursor;
    this.logicalRuleText.set(newText);
    
    setTimeout(() => {
      ta.value = newText;
      const newCursorPos = replaceStart + insertText.length;
      ta.selectionStart = ta.selectionEnd = newCursorPos;
      ta.focus();
      this.updateSuggestions(newText, newCursorPos);
    }, 0);
  }

  generateDrools() {
    const cfg = this.config();
    const rawText = this.logicalRuleText();
    if (!cfg || !rawText) return;

    // Check if this is a multi-criteria rule (contains "criteria:" sections)
    const isMultiCriteria = /criteria:/i.test(rawText);
    
    let whenClause: string;
    
    if (isMultiCriteria) {
      // Parse as multi-criteria rule
      const parsed = this.multiCriteriaParser.parseCompleteRule(rawText, cfg);
      
      // Convert parsed criteria sections to the format expected by generator
      const criterias = parsed.criteriaSections.map((section, idx) => ({
        sectionId: `section_${idx + 1}`,
        sectionTitle: section.sectionTitle,
        conditions: section.conditions.map((cond, condIdx) => ({
          number: condIdx + 1,
          text: cond
        }))
      }));
      
      // Extract tokens for each criteria condition
      const criteriaTokens = parsed.criteriaSections.map(section => section.tokens);
      
      // Generate multi-criteria Drools
      whenClause = this.droolsGenerator.generateMultiCriteriaWhenClause(
        1, // rule number
        parsed.mainTokens,
        criterias,
        cfg,
        criteriaTokens // Pass the tokens
      );
    } else {
      // Simple single-line rule
      const tok = this.tokenized();
      if (!tok) return;
      whenClause = this.droolsGenerator.generateWhenClause(tok.tokens, cfg);
    }

    this.droolsExpressionText.set(whenClause);
  }

  useExample(example: DroolsExample) {
    this.logicalRuleText.set(example.logicalRule);
    this.droolsExpressionText.set(example.droolsExpression);
    this.showDroolsHelp.set(false);
  }

  useLogicalRuleExample(example: string) {
    this.logicalRuleText.set(example);
    this.showLogicalRuleExamples.set(false);
    // Auto-generate Drools
    setTimeout(() => this.generateDrools(), 100);
  }

  clearAll() {
    this.logicalRuleText.set('');
    this.droolsExpressionText.set('');
  }

  copyDroolsToClipboard() {
    if (this.droolsExpressionText()) {
      navigator.clipboard.writeText(this.droolsExpressionText());
    }
  }

  trackBySuggestion(_i: number, item: SuggestionItem): string {
    return item.kind + item.id;
  }

  /** Save rule and generate Drools with warnings */
  saveRule(): void {
    const cfg = this.config();
    const tok = this.tokenized();
    if (!cfg || !tok) return;

    // Collect all warnings but allow saving
    const warnings: string[] = [];
    
    if (this.completenessWarning()) {
      warnings.push(this.completenessWarning()!);
    }

    if (this.bracketWarning()) {
      warnings.push(this.bracketWarning()!);
    }

    // Check pattern matching (only this creates the dismissible deviation warning)
    const result = this.patternMatch.checkPattern(tok.tokens, cfg);
    if (!result.matched && result.deviationReason) {
      warnings.push(result.deviationReason);
      
      // Store pattern suggestions if available
      if (result.suggestions && result.suggestions.length > 0) {
        this.patternSuggestions.set(
          result.suggestions.map(s => ({
            name: s.pattern.name,
            example: s.pattern.exampleText,
            reason: s.reason
          }))
        );
      }
    } else {
      this.patternSuggestions.set([]);
    }

    // Show combined warning if there are any issues
    if (warnings.length > 0) {
      const warningMsg = warnings.join(' ') + ' NOTE: The generated Drools might not be correct.';
      this.deviationWarning.set(warningMsg);
    } else {
      this.deviationWarning.set(null);
    }

    // Generate Drools regardless
    this.generateDrools();
  }

  /** Validates that the rule is complete and ready to save. */
  validateRuleCompleteness(tokens: RuleToken[], config: RuleSuggestorConfig, skipPhraseCheck = false): { valid: boolean; message?: string } {
    if (tokens.length === 0) {
      return { valid: false, message: 'Rule is empty. Please enter a rule expression.' };
    }

    // Check for phrase at the beginning (skip for criteria conditions)
    if (!skipPhraseCheck) {
      const hasPhrase = tokens.some(t => t.type === 'phrase');
      if (!hasPhrase) {
        return { valid: false, message: 'Rule must start with a phrase (e.g., "Produce Error If").' };
      }
    }

    // Check for at least one data element
    const dataElements = tokens.filter(t => t.type === 'dataElement');
    if (dataElements.length === 0) {
      // Only show this warning if user has typed more than just the phrase
      const nonPhraseTokens = tokens.filter(t => t.type !== 'phrase' && (t.type !== 'text' || t.displayText.trim() !== ''));
      if (nonPhraseTokens.length > 0) {
        return { valid: false, message: 'Rule must contain at least one data element.' };
      }
      // If only phrase, don't show warning yet
      return { valid: true };
    }

    // Check if rule ends with a connector (incomplete condition)
    // Note: closing paren ")" and comma "," are valid at the end
    const lastNonSpaceToken = this.getLastNonSpaceToken(tokens);
    if (lastNonSpaceToken) {
      if (lastNonSpaceToken.type === 'connector') {
        const connToken = lastNonSpaceToken as ConnectorToken;
        // Only flag "and", "or", and "(" as incomplete at the end
        const incompleteConnectors = ['and', 'or', 'openParen'];
        if (incompleteConnectors.includes(connToken.connectorId)) {
          const connDef = config.logicalConnectors.find(c => c.id === connToken.connectorId);
          const connText = connDef?.displayText || 'connector';
          return { valid: false, message: `Rule ends with "${connText}" but has no following condition.` };
        }
      }
      
      // Check if rule ends with an operator that needs a value
      if (lastNonSpaceToken.type === 'operator') {
        const opToken = lastNonSpaceToken as OperatorToken;
        const opDef = config.operators.find(o => o.id === opToken.operatorId);
        const droolsOp = opDef?.droolsOperator;
        const noValueOps = ['== null', '!= null', 'empty', 'not empty', 'nullOrEmpty', 'notNullOrEmpty'];
        
        if (droolsOp && !noValueOps.includes(droolsOp)) {
          if (droolsOp === 'in' || droolsOp === 'not in') {
            return { valid: false, message: `Operator "${opToken.displayText}" must be followed by a list in parentheses.` };
          }
          return { valid: false, message: `Operator "${opToken.displayText}" is missing a value.` };
        }
      }
    }

    // First pass: identify data elements that are used as values (after operators)
    const dataElementsUsedAsValues = new Set<number>();
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'operator') {
        // Check if next non-space token is a data element (used as value)
        let nextIdx = i + 1;
        while (nextIdx < tokens.length && tokens[nextIdx].type === 'text' && tokens[nextIdx].displayText.trim() === '') {
          nextIdx++;
        }
        if (nextIdx < tokens.length && tokens[nextIdx].type === 'dataElement') {
          dataElementsUsedAsValues.add(nextIdx);
        }
      }
    }

    // Check each data element has an operator (unless it's used as a value)
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'dataElement') {
        const dataEl = tokens[i] as DataElementToken;
        
        // Skip validation if this data element is being used as a value in a comparison
        if (dataElementsUsedAsValues.has(i)) {
          continue;
        }
        
        // Look for operator after data element (skip text/spaces)
        let j = i + 1;
        while (j < tokens.length && tokens[j].type === 'text' && tokens[j].displayText.trim() === '') {
          j++;
        }
        
        if (j >= tokens.length || tokens[j].type !== 'operator') {
          return { valid: false, message: `Data element "${dataEl.displayValue}" is missing an operator.` };
        }

        // Check if operator needs a value
        const opToken = tokens[j] as OperatorToken;
        const opDef = config.operators.find(o => o.id === opToken.operatorId);
        const droolsOp = opDef?.droolsOperator;
        
        // Operators that don't need values
        const noValueOps = ['== null', '!= null', 'empty', 'not empty', 'nullOrEmpty', 'notNullOrEmpty'];
        
        if (droolsOp && !noValueOps.includes(droolsOp)) {
          // This operator needs a value - check if there's text/value/dataElement after it
          let k = j + 1;
          while (k < tokens.length && tokens[k].type === 'text' && tokens[k].displayText.trim() === '') {
            k++;
          }
          
          // Special case: "in" and "not in" operators are followed by "(" or "[" which is valid
          if (droolsOp === 'in' || droolsOp === 'not in') {
            // Check if followed by "(" or "["
            if (k < tokens.length && tokens[k].type === 'connector') {
              const connToken = tokens[k] as ConnectorToken;
              if (connToken.connectorId === 'openParen' || connToken.connectorId === 'openBracket') {
                // Valid - "in (" or "in [" pattern detected
                continue;
              }
            }
            // If not followed by "(" or "[", it's missing the list
            return { valid: false, message: `Operator "${opToken.displayText}" for "${dataEl.displayValue}" must be followed by a list in parentheses or brackets.` };
          }
          
          // For other operators, check if next token is value, text, or dataElement (for comparisons)
          if (k >= tokens.length || (tokens[k].type !== 'text' && tokens[k].type !== 'value' && tokens[k].type !== 'dataElement')) {
            return { valid: false, message: `Operator "${opToken.displayText}" for "${dataEl.displayValue}" is missing a value.` };
          }
          
          // Check that the value/text is non-empty
          if (tokens[k].type === 'text' && tokens[k].displayText.trim() === '') {
            return { valid: false, message: `Operator "${opToken.displayText}" for "${dataEl.displayValue}" has an empty value.` };
          }
        }
      }
    }

    return { valid: true };
  }

  /** Get the last non-whitespace token */
  private getLastNonSpaceToken(tokens: RuleToken[]): RuleToken | null {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].type !== 'text' || tokens[i].displayText.trim() !== '') {
        return tokens[i];
      }
    }
    return null;
  }

  /** Validates that every ( has a matching ). */
  validateBrackets(text: string): { valid: boolean; message?: string } {
    let depth = 0;
    for (const ch of text) {
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') {
        depth--;
        if (depth < 0) {
          return { valid: false, message: 'Closing bracket has no matching opening bracket.' };
        }
      }
    }
    if (depth > 0) {
      return { valid: false, message: `${depth} opening bracket(s) have no matching closing bracket(s).` };
    }
    return { valid: true };
  }

  clearWarning(type: 'completeness' | 'bracket' | 'deviation'): void {
    if (type === 'completeness') {
      this.dismissedCompletenessWarning.set(true);
    } else if (type === 'bracket') {
      this.dismissedBracketWarning.set(true);
    } else if (type === 'deviation') {
      this.dismissedDeviationWarning.set(true);
      this.deviationWarning.set(null);
    }
  }

  toggleAdvancedMode(): void {
    const newMode = !this.isAdvancedMode();
    this.isAdvancedMode.set(newMode);
    localStorage.setItem('rule-editor-sidebyside-advanced-mode', newMode ? 'true' : 'false');
  }
}
