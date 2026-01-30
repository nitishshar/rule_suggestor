import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RuleToken, DataElementToken, OperatorToken, ConnectorToken, ValueToken } from '../../models/token.model';

@Component({
  selector: 'app-rule-editor-formatter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="formatted-rule">
      @for (t of tokens; track $index) {
        @switch (t.type) {
          @case ('dataElement') {
            <span class="token token-data-element" [attr.data-guid]="dataGuid(t)">
              {{ dataDisplayValue(t) }}
            </span>
          }
          @case ('phrase') {
            <span class="token token-phrase">{{ t.displayText }}</span>
          }
          @case ('operator') {
            <span class="token token-operator">{{ operatorDisplayText(t) }}</span>
          }
          @case ('connector') {
            <span class="token token-connector">{{ connectorDisplayText(t) }}</span>
          }
          @case ('value') {
            <span class="token token-value">"{{ valueTokenValue(t) }}"</span>
          }
          @default {
            <span class="token token-text">{{ t.displayText }}</span>
          }
        }
      }
    </span>
  `,
  styles: [`
    .formatted-rule {
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-secondary);
    }

    .token {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .token-data-element {
      font-weight: 600;
      color: var(--text-primary);
      background: rgba(59, 130, 246, 0.12);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .token-phrase {
      color: var(--accent);
      font-weight: 500;
    }

    .token-operator {
      color: var(--text-muted);
    }

    .token-connector {
      color: var(--text-muted);
      font-weight: 500;
    }

    .token-value {
      font-family: var(--font-mono);
      color: var(--success);
    }

    .token-text {
      color: var(--text-secondary);
    }
  `],
})
export class RuleEditorFormatterComponent {
  @Input() tokens: RuleToken[] = [];

  dataGuid(t: RuleToken): string {
    return t.type === 'dataElement' ? (t as DataElementToken).guid : '';
  }

  dataDisplayValue(t: RuleToken): string {
    return t.type === 'dataElement' ? (t as DataElementToken).displayValue : '';
  }

  operatorDisplayText(t: RuleToken): string {
    return t.type === 'operator' ? (t as OperatorToken).displayText : '';
  }

  connectorDisplayText(t: RuleToken): string {
    return t.type === 'connector' ? (t as ConnectorToken).displayText : '';
  }

  valueTokenValue(t: RuleToken): string {
    return t.type === 'value' ? (t as ValueToken).value : '';
  }
}
