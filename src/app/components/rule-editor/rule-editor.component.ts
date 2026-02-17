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
import { CriteriaParserService } from '../../services/criteria-parser.service';
import { MultiCriteriaParserService } from '../../services/multi-criteria-parser.service';
import { RuleSuggestorConfig } from '../../models/rule-config.model';
import { RuleToken, DataElementToken, OperatorToken, ConnectorToken, TokenizedRule } from '../../models/token.model';
import { RuleEditorFormatterComponent } from '../rule-editor-formatter/rule-editor-formatter.component';
import { RuleCriteria } from '../../models/multi-criteria-rule.model';

@Component({
  selector: 'app-rule-editor',
  standalone: true,
  imports: [CommonModule, RuleEditorFormatterComponent],
  templateUrl: './rule-editor.component.html',
  styleUrls: ['./rule-editor.component.scss'],
})
export class RuleEditorComponent implements OnInit, AfterViewInit {
  private configService = inject(RuleConfigService);
  private suggestionService = inject(SuggestionService);
  private tokenizer = inject(RuleTokenizerService);
  private droolsGenerator = inject(DroolsGeneratorService);
  private patternMatch = inject(PatternMatchService);
  private criteriaParser = inject(CriteriaParserService);
  private multiCriteriaParser = inject(MultiCriteriaParserService);

  @ViewChild('inputEl') inputEl!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('suggestionList') suggestionList!: ElementRef<HTMLUListElement>;

  config = signal<RuleSuggestorConfig | null>(null);
  rawText = signal('');
  cursorPosition = signal(0);
  suggestions = signal<SuggestionItem[]>([]);
  suggestionPrefix = signal('');
  selectedIndex = signal(0);
  showSuggestions = signal(false);
  showInfoPanel = signal(false);
  generatedDrools = signal('');
  deviationWarning = signal<string | null>(null);
  savedRuleDisplay = signal<TokenizedRule | null>(null);
  isDarkTheme = signal(true);
  isAdvancedMode = signal(false);
  criteriaText = signal<{ [key: string]: string }>({});  // Store criteria section texts
  showCriteriaHelp = signal(false);
  patternSuggestions = signal<Array<{ name: string; example: string; reason: string }>>([]);
  
  // Track dismissed warnings
  dismissedCompletenessWarning = signal(false);
  dismissedBracketWarning = signal(false);
  dismissedDeviationWarning = signal(false);

  tokenized = computed(() => {
    const cfg = this.config();
    const raw = this.rawText();
    if (!cfg) return null;
    return this.tokenizer.tokenize(raw, cfg);
  });

  formattedTokens = computed(() => this.tokenized()?.tokens ?? []);

  // Internal warning signals (always compute)
  private _bracketWarningInternal = computed(() => {
    const raw = this.rawText();
    if (!raw.trim()) return null;
    
    const result = this.validateBrackets(raw);
    return result.valid ? null : result.message;
  });

  private _completenessWarningInternal = computed(() => {
    const cfg = this.config();
    if (!cfg) return null;
    
    const rawText = this.rawText().trim();
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

  formattedSavedRuleSections = computed(() => {
    const cfg = this.config();
    if (!cfg || !this.isAdvancedMode()) return [];
    
    const text = this.rawText();
    if (!text) return [];
    
    const parsed = this.multiCriteriaParser.parseCompleteRule(text, cfg);
    
    const sections: Array<{ isHeader: boolean; text?: string; tokens?: RuleToken[] }> = [];
    
    // Add main statement
    if (parsed.mainStatement) {
      sections.push({
        isHeader: false,
        tokens: parsed.mainTokens
      });
    }
    
    // Add criteria sections
    for (const section of parsed.criteriaSections) {
      // Add section header
      sections.push({
        isHeader: true,
        text: section.sectionTitle
      });
      
      // Add each numbered condition
      for (let i = 0; i < section.conditions.length; i++) {
        const conditionText = `${i + 1}. ${section.conditions[i]}`;
        const tokenized = this.tokenizer.tokenize(conditionText, cfg);
        sections.push({
          isHeader: false,
          tokens: tokenized.tokens
        });
      }
    }
    
    return sections;
  });

  ngOnInit(): void {
    this.configService.getConfig().subscribe((cfg) => {
      this.config.set(cfg);
      
      // Initialize advanced mode from config if not overridden by localStorage
      const savedAdvancedMode = localStorage.getItem('rule-editor-advanced-mode');
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

  ngAfterViewInit(): void {
    // No longer needed - using template-based (keydown) handler
  }

  onInput(e: Event): void {
    this.syncFromInput(e.target as HTMLTextAreaElement);
  }

  onPaste(e: Event): void {
    if (this.isAdvancedMode()) {
      // In advanced mode, format the pasted text
      const clipboardEvent = e as ClipboardEvent;
      const pastedText = clipboardEvent.clipboardData?.getData('text');
      
      if (pastedText) {
        e.preventDefault();
        
        // Format the pasted text with proper line breaks
        let formatted = pastedText;
        
        // Ensure criteria headers are on new lines
        formatted = formatted.replace(/([^\n])\s*(Applicability Criteria:)/gi, '$1\n\n$2');
        formatted = formatted.replace(/([^\n])\s*(TRIMS Specific Criteria:)/gi, '$1\n\n$2');
        formatted = formatted.replace(/([^\n])\s*(Additional Criteria:)/gi, '$1\n\n$2');
        
        // Ensure numbered conditions are on new lines (but not if already on one)
        formatted = formatted.replace(/([^\n])\s+(\d+\.)/g, '$1\n$2');
        
        // Clean up multiple consecutive newlines (max 2)
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        
        const ta = this.inputEl?.nativeElement;
        if (ta) {
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const currentText = ta.value;
          
          const newText = currentText.substring(0, start) + formatted + currentText.substring(end);
          ta.value = newText;
          this.rawText.set(newText);
          
          const newCursorPos = start + formatted.length;
          ta.selectionStart = ta.selectionEnd = newCursorPos;
          this.cursorPosition.set(newCursorPos);
        }
      }
      
      // Hide suggestions after paste
      this.showSuggestions.set(false);
    } else {
      // Simple mode - let paste complete, then tokenize
      setTimeout(() => {
        const ta = e.target as HTMLTextAreaElement;
        this.syncFromInput(ta);
        // Hide suggestions after paste to show the tokenized result
        this.showSuggestions.set(false);
      }, 0);
    }
  }

  onKeyUp(e: Event): void {
    const ke = e as KeyboardEvent;
    // Skip cursor updates for navigation keys
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'Escape'];
    if (navigationKeys.includes(ke.key)) {
      return;
    }
    this.syncFromInput(e.target as HTMLTextAreaElement);
  }

  onCursorChange(e: Event): void {
    this.syncFromInput(e.target as HTMLTextAreaElement);
  }

  private syncFromInput(ta: HTMLTextAreaElement): void {
    this.rawText.set(ta.value);
    this.cursorPosition.set(ta.selectionStart);
    this.updateSuggestions(ta.value, ta.selectionStart);
    
    // Reset dismissed warnings when user types
    this.dismissedCompletenessWarning.set(false);
    this.dismissedBracketWarning.set(false);
  }

  onFocus(): void {
    const ta = this.inputEl?.nativeElement;
    if (ta) {
      this.cursorPosition.set(ta.selectionStart);
      this.updateSuggestions(ta.value, ta.selectionStart);
    }
    this.showSuggestions.set(this.suggestions().length > 0);
  }

  onBlur(): void {
    setTimeout(() => {
      this.showSuggestions.set(false);
      this.showInfoPanel.set(false);
    }, 200);
  }

  onEnterKey(e: Event): void {
    const suggestions = this.suggestions();
    if (this.showSuggestions() && suggestions.length > 0) {
      e.preventDefault();
      const idx = this.selectedIndex();
      if (idx >= 0 && idx < suggestions.length) {
        this.applySuggestion(suggestions[idx]);
      }
    } else if (this.isAdvancedMode()) {
      // Auto-numbering in advanced mode
      const ta = this.inputEl?.nativeElement;
      if (!ta) return;
      
      const ke = e as KeyboardEvent;
      if (ke.shiftKey) return; // Allow Shift+Enter for new line without numbering
      
      const text = ta.value;
      const cursorPos = ta.selectionStart;
      const textBeforeCursor = text.substring(0, cursorPos);
      const lines = textBeforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];
      
      // Check if current line starts with a number
      const numberMatch = /^(\d+)\.\s*(.*)$/.exec(currentLine.trim());
      
      if (numberMatch) {
        e.preventDefault();
        const currentNumber = parseInt(numberMatch[1], 10);
        const nextNumber = currentNumber + 1;
        const newLine = `\n${nextNumber}. `;
        
        const newText = text.substring(0, cursorPos) + newLine + text.substring(ta.selectionEnd);
        const newCursorPos = cursorPos + newLine.length;
        
        ta.value = newText;
        ta.selectionStart = ta.selectionEnd = newCursorPos;
        this.rawText.set(newText);
        this.cursorPosition.set(newCursorPos);
      }
    }
  }

  onTabKey(e: Event): void {
    const suggestions = this.suggestions();
    if (this.showSuggestions() && suggestions.length > 0) {
      e.preventDefault();
      const idx = this.selectedIndex();
      if (idx >= 0 && idx < suggestions.length) {
        this.applySuggestion(suggestions[idx]);
      }
    }
  }

  onArrowDown(e: Event): void {
    const suggestions = this.suggestions();
    if (this.showSuggestions() && suggestions.length > 0) {
      e.preventDefault();
      const idx = this.selectedIndex();
      this.selectedIndex.set((idx + 1) % suggestions.length);
      this.scrollSelectedIntoView();
    }
  }

  onArrowUp(e: Event): void {
    const suggestions = this.suggestions();
    if (this.showSuggestions() && suggestions.length > 0) {
      e.preventDefault();
      const idx = this.selectedIndex();
      this.selectedIndex.set(idx === 0 ? suggestions.length - 1 : idx - 1);
      this.scrollSelectedIntoView();
    }
  }

  onEscapeKey(e: Event): void {
    if (this.showSuggestions()) {
      e.preventDefault();
      this.showSuggestions.set(false);
    }
  }

  private updateSuggestions(fullText: string, cursor: number): void {
    const cfg = this.config();
    if (!cfg) return;
    const before = fullText.slice(0, cursor);
    const after = fullText.slice(cursor);
    const { items, prefix } = this.suggestionService.getSuggestionsForContext(cfg, before, after);
    this.suggestions.set(items);
    this.suggestionPrefix.set(prefix);
    this.selectedIndex.set(0);
    this.showSuggestions.set(items.length > 0);
  }

  private scrollSelectedIntoView(): void {
    setTimeout(() => {
      const list = this.suggestionList?.nativeElement;
      const sel = list?.querySelector('.suggestion-item.selected');
      sel?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  selectSuggestion(item: SuggestionItem): void {
    this.applySuggestion(item);
  }

  private   applySuggestion(item: SuggestionItem): void {
    const ta = this.inputEl?.nativeElement;
    if (!ta) return;
    const before = this.rawText().slice(0, this.cursorPosition());
    const after = this.rawText().slice(this.cursorPosition());
    const prefix = this.suggestionPrefix();

    let insert = item.insertText;
    
    // Add space after data element or phrase if not already present
    if ((item.kind === 'dataElement' || item.kind === 'phrase') && !insert.endsWith(' ') && !after.startsWith(' ')) {
      insert += ' ';
    }

    // Handle criteriaSection specially - replace the entire current line
    if (item.kind === 'criteriaSection' && prefix) {
      // Find the start of the current line
      const lines = before.split('\n');
      const currentLine = lines[lines.length - 1];
      const beforeCurrentLine = lines.slice(0, -1).join('\n');
      const newBefore = (beforeCurrentLine ? beforeCurrentLine + '\n' : '') + insert;
      const newText = newBefore + after;
      this.rawText.set(newText);
      ta.value = newText;
      ta.selectionStart = ta.selectionEnd = newBefore.length;
      this.cursorPosition.set(newBefore.length);
    } else if (prefix && (item.kind === 'dataElement' || item.kind === 'phrase' || item.kind === 'operator' || item.kind === 'connector')) {
      const beforeWithoutPrefix = before.slice(0, before.length - prefix.length);
      const newBefore = beforeWithoutPrefix + insert;
      const newText = newBefore + after;
      this.rawText.set(newText);
      ta.value = newText;
      ta.selectionStart = ta.selectionEnd = newBefore.length;
      this.cursorPosition.set(newBefore.length);
    } else {
      // Add space before operator if needed (when no prefix and no trailing space)
      if (item.kind === 'operator' && before.length > 0) {
        const lastChar = before.charAt(before.length - 1);
        if (lastChar !== ' ' && lastChar !== '\n') {
          insert = ' ' + insert;
        }
      }
      
      const newBefore = before + insert;
      const newText = newBefore + after;
      this.rawText.set(newText);
      ta.value = newText;
      ta.selectionStart = ta.selectionEnd = newBefore.length;
      this.cursorPosition.set(newBefore.length);
    }
    // Refresh suggestions for new context (e.g. operators after data element); keep dropdown open if there are next suggestions
    this.updateSuggestions(this.rawText(), this.cursorPosition());
    this.showSuggestions.set(this.suggestions().length > 0);
    ta.focus();
  }

  toggleInfo(): void {
    this.showInfoPanel.update((v) => !v);
  }

  toggleTheme(): void {
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

  toggleAdvancedMode(): void {
    const newMode = !this.isAdvancedMode();
    this.isAdvancedMode.set(newMode);
    localStorage.setItem('rule-editor-advanced-mode', newMode ? 'true' : 'false');
    
    if (!newMode) {
      // Clear criteria when disabling advanced mode
      this.criteriaText.set({});
    }
  }

  onCriteriaInput(sectionId: string, event: Event): void {
    const ta = event.target as HTMLTextAreaElement;
    const current = this.criteriaText();
    this.criteriaText.set({ ...current, [sectionId]: ta.value });
  }

  onCriteriaKeyDown(sectionId: string, event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      const ta = event.target as HTMLTextAreaElement;
      const text = ta.value;
      const cursorPos = ta.selectionStart;
      
      // Find the last number in the text before cursor
      const textBeforeCursor = text.substring(0, cursorPos);
      const lines = textBeforeCursor.split('\n');
      
      // Look for numbered items (e.g., "1.", "2.", etc.)
      let lastNumber = 0;
      for (const line of lines) {
        const match = /^(\d+)\.\s*/.exec(line.trim());
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > lastNumber) {
            lastNumber = num;
          }
        }
      }
      
      // If we found a number, insert the next number
      if (lastNumber > 0) {
        event.preventDefault();
        const nextNumber = lastNumber + 1;
        const newLine = `\n${nextNumber}. `;
        
        const newText = text.substring(0, cursorPos) + newLine + text.substring(ta.selectionEnd);
        const newCursorPos = cursorPos + newLine.length;
        
        // Update the value
        ta.value = newText;
        ta.selectionStart = ta.selectionEnd = newCursorPos;
        
        // Update the signal
        const current = this.criteriaText();
        this.criteriaText.set({ ...current, [sectionId]: newText });
      } else {
        // First line - start with "1. "
        event.preventDefault();
        const newLine = textBeforeCursor.trim() === '' ? '1. ' : '\n1. ';
        
        const newText = text.substring(0, cursorPos) + newLine + text.substring(ta.selectionEnd);
        const newCursorPos = cursorPos + newLine.length;
        
        ta.value = newText;
        ta.selectionStart = ta.selectionEnd = newCursorPos;
        
        const current = this.criteriaText();
        this.criteriaText.set({ ...current, [sectionId]: newText });
      }
    }
  }

  insertCriteriaTemplate(): void {
    const template = `Produce Error If 

Applicability Criteria:
1. 

TRIMS Specific Criteria:
1. 

Additional Criteria:
1. `;

    this.rawText.set(template);
    const ta = this.inputEl?.nativeElement;
    if (ta) {
      ta.value = template;
      // Position cursor after "Produce Error If "
      const cursorPos = 'Produce Error If '.length;
      ta.selectionStart = ta.selectionEnd = cursorPos;
      ta.focus();
    }
    this.showCriteriaHelp.set(false);
  }

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
      const warningMessage = '⚠ Rule saved but does not conform to all supported patterns. The generated Drools might not be correct. Issues: ' + warnings.join(' | ');
      this.deviationWarning.set(warningMessage);
    } else {
      this.deviationWarning.set(null);
    }

    // Generate Drools based on mode
    if (this.isAdvancedMode()) {
      // Parse complete rule text with all criteria
      const parsed = this.multiCriteriaParser.parseCompleteRule(this.rawText(), cfg);
      
      // Group by domain.subdomain
      const domainGroups = this.multiCriteriaParser.groupByDomain(
        parsed.mainTokens,
        parsed.criteriaSections
      );

      // Generate separate when clauses for each domain
      const whenClauses: string[] = [];
      
      for (const group of domainGroups) {
        // Combine all tokens for this domain
        const allTokens = group.tokens.flat();
        const whenClause = this.droolsGenerator.generateWhenClause(allTokens, cfg);
        if (whenClause) {
          whenClauses.push(`// Domain: ${group.domain}\n${whenClause}`);
        }
      }

      // Combine all when clauses
      if (whenClauses.length > 0) {
        this.generatedDrools.set(whenClauses.join('\n\n'));
      } else {
        this.generatedDrools.set('');
      }
    } else {
      // Simple mode: just generate when clause
      const whenClause = this.droolsGenerator.generateWhenClause(tok.tokens, cfg);
      this.generatedDrools.set(whenClause);
    }

    this.savedRuleDisplay.set(tok);
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
          
          // Make sure the value is not empty (unless it's a data element)
          if (tokens[k].type !== 'dataElement') {
            const valueText = tokens[k].displayText.trim();
            if (!valueText) {
              return { valid: false, message: `Operator "${opToken.displayText}" for "${dataEl.displayValue}" has an empty value.` };
            }
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
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth < 0) {
          return { valid: false, message: 'Closing bracket ")" has no matching opening bracket "(".' };
        }
      }
    }
    if (depth > 0) {
      return { valid: false, message: `${depth} opening bracket(s) "(" have no matching closing bracket(s).` };
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

  trackBySuggestion(_i: number, item: SuggestionItem): string {
    return item.kind + item.id;
  }
}
