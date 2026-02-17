import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RuleEditorComponent } from './components/rule-editor/rule-editor.component';
import { RuleEditorSidebysideComponent } from './components/rule-editor-sidebyside/rule-editor-sidebyside.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RuleEditorComponent, RuleEditorSidebysideComponent],
  template: `
    <header class="app-header">
      <div class="header-content">
        <div class="header-text">
          <h1>Business Rule Expression Suggestor</h1>
          <p class="tagline">Define data quality rules with suggestions; generate Drools when-clauses.</p>
        </div>
        <nav class="header-nav">
          <button 
            type="button"
            class="nav-link" 
            [class.active]="currentView() === 'classic'"
            (click)="switchView('classic')"
          >
            Classic View
          </button>
          <button 
            type="button"
            class="nav-link" 
            [class.active]="currentView() === 'sidebyside'"
            (click)="switchView('sidebyside')"
          >
            Side by Side
          </button>
        </nav>
      </div>
    </header>
    <main class="app-main">
      <app-rule-editor *ngIf="currentView() === 'classic'" />
      <app-rule-editor-sidebyside *ngIf="currentView() === 'sidebyside'" />
    </main>
  `,
  styles: [`
    .app-header {
      padding: 24px;
      border-bottom: 1px solid var(--border);
      background: var(--surface-elevated);
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1400px;
      margin: 0 auto;
      gap: 24px;
    }

    .header-text {
      flex: 1;
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

    .header-nav {
      display: flex;
      gap: 12px;
    }

    .nav-link {
      padding: 10px 20px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s;
      white-space: nowrap;
      cursor: pointer;
    }

    .nav-link:hover {
      background: var(--surface-hover);
      border-color: var(--accent);
    }

    .nav-link.active {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }

    .app-main {
      min-height: calc(100vh - 120px);
      padding: 0;
    }

    @media (max-width: 768px) {
      .header-content {
        flex-direction: column;
        align-items: flex-start;
      }

      .header-nav {
        width: 100%;
      }

      .nav-link {
        flex: 1;
        text-align: center;
      }
    }
  `],
})
export class AppComponent {
  currentView = signal<'classic' | 'sidebyside'>('classic');

  switchView(view: 'classic' | 'sidebyside') {
    this.currentView.set(view);
  }
}
