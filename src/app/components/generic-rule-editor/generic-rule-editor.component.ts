import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnInit,
  AfterViewInit,
  forwardRef,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { RuleConfigService } from '../../services/rule-config.service';
import { SuggestionService, SuggestionItem } from '../../services/suggestion.service';
import { RuleTokenizerService } from '../../services/rule-tokenizer.service';
import { PatternMatchService } from '../../services/pattern-match.service';
import { MultiCriteriaParserService } from '../../services/multi-criteria-parser.service';
import { RuleSuggestorConfig } from '../../models/rule-config.model';
import { RuleToken, DataElementToken, OperatorToken, ConnectorToken, TokenizedRule } from '../../models/token.model';
import { RuleEditorFormatterComponent } from '../rule-editor-formatter/rule-editor-formatter.component';

@Component({
  selector: 'app-generic-rule-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RuleEditorFormatterComponent],
  templateUrl: './generic-rule-editor.component.html',
  styleUrls: ['./generic-rule-editor.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => GenericRuleEditorComponent),
      multi: true,
    },
  ],
})
export class GenericRuleEditorComponent implements OnInit, AfterViewInit, ControlValueAccessor {
  private configService = inject(RuleConfigService);
  private suggestionService = inject(SuggestionService);
  private tokenizer = inject(RuleTokenizerService);
  private patternMatch = inject(PatternMatchService);
  private multiCriteriaParser = inject(MultiCriteriaParserService);

  @ViewChild('textarea') textarea!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('suggestionList') suggestionList!: ElementRef<HTMLUListElement>;

  // Configuration inputs
  @Input() placeholder: string = 'Start typing... e.g., Produce Error If Contract Identifier is null';
  @Input() showExamples: boolean = true;
  @Input() showHelp: boolean = true;
  @Input() showTokenPreview: boolean = true;
  @Input() showWarnings: boolean = true;
  @Input() minHeight: string = '200px';
  @Input() externalConfig?: RuleSuggestorConfig; // Allow external config

  // Outputs
  @Output() ruleChanged = new EventEmitter<string>();
  @Output() tokensChanged = new EventEmitter<RuleToken[]>();
  @Output() validationChanged = new EventEmitter<{
    isValid: boolean;
    warnings: string[];
  }>();

  // Internal state
  config = signal<RuleSuggestorConfig | null>(null);
  ruleText = signal('');
  cursorPosition = signal(0);
  suggestions = signal<SuggestionItem[]>([]);
  suggestionPrefix = signal('');
  selectedIndex = signal(0);
  showSuggestions = signal(false);
  showExamplesPanel = signal(false);
  showHelpPanel = signal(false);
  
  // Warnings
  deviationWarning = signal<string | null>(null);
  patternSuggestions = signal<Array<{ name: string; example: string; reason: string }>>([]);
  dismissedCompletenessWarning = signal(false);
  dismissedBracketWarning = signal(false);
  dismissedDeviationWarning = signal(false);

  // Computed
  tokenized = computed(() => {
    const cfg = this.config();
    const raw = this.ruleText();
    if (!cfg) return null;
    return this.tokenizer.tokenize(raw, cfg);
  });

  formattedTokens = computed(() => this.tokenized()?.tokens ?? []);

  private _bracketWarningInternal = computed(() => {
    const raw = this.ruleText();
    if (!raw.trim()) return null;
    const result = this.validateBrackets(raw);
    return result.valid ? null : result.message;
  });

  private _completenessWarningInternal = computed(() => {
    const cfg = this.config();
    if (!cfg) return null;
    const rawText = this.ruleText().trim();
    if (rawText.length === 0) return null;
    const tok = this.tokenized();
    if (!tok) return null;
    const result = this.validateRuleCompleteness(tok.tokens, cfg);
    return result.valid ? null : result.message;
  });

  private _patternMatchResult = computed(() => {
    const cfg = this.config();
    if (!cfg) return null;
    const tok = this.tokenized();
    if (!tok || tok.tokens.length === 0) return null;
    return this.patternMatch.checkPattern(tok.tokens, cfg);
  });

  bracketWarning = computed(() => {
    if (this.dismissedBracketWarning()) return null;
    return this._bracketWarningInternal();
  });

  completenessWarning = computed(() => {
    if (this.dismissedCompletenessWarning()) return null;
    return this._completenessWarningInternal();
  });

  hasActiveWarnings = computed(() => {
    return !!(this._bracketWarningInternal() || this._completenessWarningInternal() || this.deviationWarning());
  });

  // FormControl integration
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  disabled = false;

  examples: string[] = [
    'Produce Error If Contract Identifier is null',
    'Produce Error If Balance greater than Transaction Amount',
    'Produce Error If Balance is 0',
    'Produce Error If life cycle status code in [ACTIVE,CLOSED]',
    'Produce Error If Account Number is present and Balance is null or blank',
    'Produce Error If Balance is 0 and (Status is ACTIVE or Status is PENDING)',
    `Produce Error If Contract Identifier is null

Applicability Criteria:
1. Balance is not null
2. life cycle status code in (ACTIVE, PENDING)

TRIMS Specific Criteria:
1. Account Number is present
2. Transaction Amount greater than 0`,
  ];

  ngOnInit() {
    if (this.externalConfig) {
      this.config.set(this.externalConfig);
    } else {
      this.configService.getConfig().subscribe((cfg) => {
        this.config.set(cfg);
      });
    }
  }

  ngAfterViewInit() {
    // Component ready
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    if (value !== this.ruleText()) {
      this.ruleText.set(value || '');
      if (this.textarea?.nativeElement) {
        this.textarea.nativeElement.value = value || '';
      }
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    const value = ta.value;
    this.ruleText.set(value);
    this.cursorPosition.set(ta.selectionStart);
    
    // Reset dismissed warnings
    this.dismissedCompletenessWarning.set(false);
    this.dismissedBracketWarning.set(false);
    
    this.updateSuggestions(value, ta.selectionStart);
    
    // Emit changes
    this.onChange(value);
    this.ruleChanged.emit(value);
    this.tokensChanged.emit(this.formattedTokens());
    this.emitValidation();
  }

  onKeyDown(event: KeyboardEvent) {
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

  onFocus() {
    this.onTouched();
    const ta = this.textarea?.nativeElement;
    if (ta) {
      this.updateSuggestions(ta.value, ta.selectionStart);
    }
  }

  onBlur() {
    setTimeout(() => {
      this.showSuggestions.set(false);
    }, 200);
  }

  updateSuggestions(text: string, cursorPos: number) {
    const cfg = this.config();
    if (!cfg) return;

    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);

    const result = this.suggestionService.getSuggestionsForContext(cfg, beforeCursor, afterCursor);
    
    this.suggestions.set(result.items);
    this.suggestionPrefix.set(result.prefix);
    this.selectedIndex.set(0);
    this.showSuggestions.set(result.items.length > 0);
  }

  selectSuggestion(item: SuggestionItem) {
    const ta = this.textarea?.nativeElement;
    if (!ta) return;

    const cursorPos = ta.selectionStart;
    const text = ta.value;
    const prefix = this.suggestionPrefix();

    const replaceStart = prefix ? cursorPos - prefix.length : cursorPos;
    
    let insertText = item.insertText;
    if (!prefix && item.kind === 'operator' && replaceStart > 0) {
      const charBeforeInsert = text.charAt(replaceStart - 1);
      if (charBeforeInsert !== ' ' && charBeforeInsert !== '\n') {
        insertText = ' ' + insertText;
      }
    }

    const newText = text.substring(0, replaceStart) + insertText + text.substring(cursorPos);
    this.ruleText.set(newText);
    
    setTimeout(() => {
      ta.value = newText;
      const newCursorPos = replaceStart + insertText.length;
      ta.selectionStart = ta.selectionEnd = newCursorPos;
      ta.focus();
      this.updateSuggestions(newText, newCursorPos);
      this.onChange(newText);
      this.ruleChanged.emit(newText);
      this.tokensChanged.emit(this.formattedTokens());
    }, 0);
  }

  useExample(example: string) {
    this.ruleText.set(example);
    if (this.textarea?.nativeElement) {
      this.textarea.nativeElement.value = example;
    }
    this.showExamplesPanel.set(false);
    this.onChange(example);
    this.ruleChanged.emit(example);
    this.tokensChanged.emit(this.formattedTokens());
    this.emitValidation();
  }

  clearWarning(type: 'completeness' | 'bracket' | 'deviation') {
    if (type === 'completeness') {
      this.dismissedCompletenessWarning.set(true);
    } else if (type === 'bracket') {
      this.dismissedBracketWarning.set(true);
    } else if (type === 'deviation') {
      this.dismissedDeviationWarning.set(true);
      this.deviationWarning.set(null);
    }
    this.emitValidation();
  }

  private emitValidation() {
    const warnings: string[] = [];
    
    if (this.completenessWarning()) {
      warnings.push(this.completenessWarning()!);
    }
    if (this.bracketWarning()) {
      warnings.push(this.bracketWarning()!);
    }
    
    // Check pattern match and update deviation warning/suggestions
    const patternResult = this._patternMatchResult();
    if (patternResult && !patternResult.matched && !this.dismissedDeviationWarning()) {
      if (patternResult.deviationReason) {
        this.deviationWarning.set(patternResult.deviationReason);
      }
      
      if (patternResult.suggestions && patternResult.suggestions.length > 0) {
        this.patternSuggestions.set(
          patternResult.suggestions.map(s => ({
            name: s.pattern.name,
            example: s.pattern.exampleText,
            reason: s.reason
          }))
        );
      } else {
        this.patternSuggestions.set([]);
      }
    } else {
      if (!this.dismissedDeviationWarning()) {
        this.deviationWarning.set(null);
        this.patternSuggestions.set([]);
      }
    }
    
    if (this.deviationWarning()) {
      warnings.push(this.deviationWarning()!);
    }

    this.validationChanged.emit({
      isValid: warnings.length === 0,
      warnings,
    });
  }

  private validateRuleCompleteness(tokens: RuleToken[], config: RuleSuggestorConfig): { valid: boolean; message?: string } {
    if (tokens.length === 0) {
      return { valid: false, message: 'Rule is empty. Please enter a rule expression.' };
    }

    const hasPhrase = tokens.some(t => t.type === 'phrase');
    if (!hasPhrase) {
      return { valid: false, message: 'Rule must start with a phrase (e.g., "Produce Error If").' };
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

  private getLastNonSpaceToken(tokens: RuleToken[]): RuleToken | null {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].type !== 'text' || tokens[i].displayText.trim() !== '') {
        return tokens[i];
      }
    }
    return null;
  }

  private validateBrackets(text: string): { valid: boolean; message?: string } {
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

  trackBySuggestion(_i: number, item: SuggestionItem): string {
    return item.kind + item.id;
  }
}
