import { Component } from '@angular/core';
import { RuleEditorComponent } from './components/rule-editor/rule-editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RuleEditorComponent],
  template: `
    <header class="app-header">
      <h1>Business Rule Expression Suggestor</h1>
      <p class="tagline">Define data quality rules with suggestions; generate Drools when-clauses.</p>
    </header>
    <main class="app-main">
      <app-rule-editor />
    </main>
  `,
  styles: [`
    .app-header {
      padding: 24px 24px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--surface-elevated);
    }

    .app-header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 8px 0;
    }

    .tagline {
      font-size: 14px;
      color: var(--text-secondary);
      margin: 0;
    }

    .app-main {
      min-height: calc(100vh - 120px);
      padding: 0;
    }
  `],
})
export class AppComponent {}
