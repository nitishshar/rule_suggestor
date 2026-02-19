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
2. Status in (ACTIVE, PENDING)

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
      return { valid: false, message: 'Rule is empty.' };
    }

    const hasPhrase = tokens.some(t => t.type === 'phrase');
    if (!hasPhrase) {
      return { valid: false, message: 'Rule must start with a phrase.' };
    }

    const dataElements = tokens.filter(t => t.type === 'dataElement');
    if (dataElements.length === 0) {
      const nonPhraseTokens = tokens.filter(t => t.type !== 'phrase' && (t.type !== 'text' || t.displayText.trim() !== ''));
      if (nonPhraseTokens.length > 0) {
        return { valid: false, message: 'Rule must contain at least one data element.' };
      }
      return { valid: true };
    }

    return { valid: true };
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
