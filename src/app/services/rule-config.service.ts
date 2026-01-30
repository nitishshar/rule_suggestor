import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { RuleSuggestorConfig } from '../models/rule-config.model';

const CONFIG_PATH = 'assets/config/rule-suggestor-config.json';

@Injectable({ providedIn: 'root' })
export class RuleConfigService {
  private config$: Observable<RuleSuggestorConfig> | null = null;

  constructor(private http: HttpClient) {}

  getConfig(): Observable<RuleSuggestorConfig> {
    if (!this.config$) {
      this.config$ = this.http.get<RuleSuggestorConfig>(CONFIG_PATH).pipe(shareReplay(1));
    }
    return this.config$;
  }
}
