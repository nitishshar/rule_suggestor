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
import { RuleSuggestorConfig } from '../../models/rule-config.model';
import { RuleToken, DataElementToken, TokenizedRule } from '../../models/token.model';
import { RuleEditorFormatterComponent } from '../rule-editor-formatter/rule-editor-formatter.component';

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
  showSamples = signal(false);
  generatedDrools = signal('');
  deviationWarning = signal<string | null>(null);
  savedRuleDisplay = signal<TokenizedRule | null>(null);
  isDarkTheme = signal(true);

  tokenized = computed(() => {
    const cfg = this.config();
    const raw = this.rawText();
    if (!cfg) return null;
    return this.tokenizer.tokenize(raw, cfg);
  });

  formattedTokens = computed(() => this.tokenized()?.tokens ?? []);

  bracketWarning = computed(() => {
    const raw = this.rawText();
    const result = this.validateBrackets(raw);
    return result.valid ? null : result.message;
  });

  ngOnInit(): void {
    this.configService.getConfig().subscribe((c) => this.config.set(c));
    
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
      this.showSamples.set(false);
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

    if (prefix && (item.kind === 'dataElement' || item.kind === 'phrase' || item.kind === 'operator' || item.kind === 'connector')) {
      const beforeWithoutPrefix = before.slice(0, before.length - prefix.length);
      const newBefore = beforeWithoutPrefix + insert;
      const newText = newBefore + after;
      this.rawText.set(newText);
      ta.value = newText;
      ta.selectionStart = ta.selectionEnd = newBefore.length;
      this.cursorPosition.set(newBefore.length);
    } else {
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
    if (this.showInfoPanel()) this.showSamples.set(false);
  }

  toggleSamples(): void {
    this.showSamples.update((v) => !v);
    if (this.showSamples()) this.showInfoPanel.set(false);
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

  applySample(sample: { ruleText: string }): void {
    this.rawText.set(sample.ruleText);
    const ta = this.inputEl?.nativeElement;
    if (ta) {
      ta.value = sample.ruleText;
      ta.selectionStart = ta.selectionEnd = sample.ruleText.length;
    }
    this.showSamples.set(false);
    this.updateSuggestions(sample.ruleText, sample.ruleText.length);
  }

  saveRule(): void {
    const cfg = this.config();
    const tok = this.tokenized();
    if (!cfg || !tok) return;

    const bracketResult = this.validateBrackets(this.rawText());
    if (!bracketResult.valid && bracketResult.message) {
      this.deviationWarning.set(bracketResult.message);
    } else {
      const result = this.patternMatch.checkPattern(tok.tokens, cfg);
      if (!result.matched && result.deviationReason) {
        this.deviationWarning.set(result.deviationReason);
      } else {
        this.deviationWarning.set(null);
      }
    }

    const whenClause = this.droolsGenerator.generateWhenClause(tok.tokens, cfg);
    this.generatedDrools.set(whenClause);
    this.savedRuleDisplay.set(tok);
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

  clearWarning(): void {
    this.deviationWarning.set(null);
  }

  trackBySuggestion(_i: number, item: SuggestionItem): string {
    return item.kind + item.id;
  }
}
