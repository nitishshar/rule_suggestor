import { DataElement } from './rule-config.model';

export type TokenType = 'phrase' | 'dataElement' | 'operator' | 'value' | 'connector' | 'text';

export interface BaseToken {
  type: TokenType;
  /** Display text in editor */
  displayText: string;
  /** Start index in full rule text */
  startIndex: number;
  /** End index in full rule text */
  endIndex: number;
}

export interface PhraseToken extends BaseToken {
  type: 'phrase';
  phraseId: string;
}

export interface DataElementToken extends BaseToken {
  type: 'dataElement';
  guid: string;
  displayValue: string;
  completeValue: string;
  /** Full internal representation e.g. Deposits.Deposits Contract.Contract Identifier */
  fullValue: string;
}

export interface OperatorToken extends BaseToken {
  type: 'operator';
  operatorId: string;
  symbol: string;
}

export interface ValueToken extends BaseToken {
  type: 'value';
  value: string;
}

export interface ConnectorToken extends BaseToken {
  type: 'connector';
  connectorId: string;
  displayText: string;
}

export interface TextToken extends BaseToken {
  type: 'text';
}

export type RuleToken =
  | PhraseToken
  | DataElementToken
  | OperatorToken
  | ValueToken
  | ConnectorToken
  | TextToken;

export interface TokenizedRule {
  tokens: RuleToken[];
  /** Plain display string (data elements shown as display text only) */
  displayText: string;
  /** Raw text user typed (for parsing) */
  rawText: string;
}
