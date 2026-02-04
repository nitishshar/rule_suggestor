/** Data element: display in UI, complete value for Drools, guid for storage */
export interface DataElement {
  guid: string;
  displayValue: string;
  completeValue: string;
}

/** Initial/phrase suggestion (e.g. "Produce Error If") */
export interface PhraseSuggestion {
  id: string;
  displayText: string;
  /** Text inserted when selected (can equal displayText) */
  insertText: string;
  description?: string;
}

/** Operator for conditions */
export interface OperatorDefinition {
  id: string;
  symbol: string;
  displayLabel: string;
  /** For Drools generation */
  droolsOperator?: string;
  /** Applicable value types */
  valueTypes?: ('string' | 'number' | 'boolean' | 'date' | 'any')[];
}

/** Logical connector */
export interface LogicalConnector {
  id: string;
  displayText: string;
  droolsText: string;
}

/** One variant of a DQ rule pattern with suggested next steps */
export interface RulePattern {
  id: string;
  name: string;
  description: string;
  /** Example rule text for this pattern */
  exampleText: string;
  /** Ordered suggestions for what can come next (phrase id, 'dataElement', 'operator', 'value', 'and', 'or') */
  nextSuggestions: string[];
  /** Sample Drools when-clause for reference */
  sampleDroolsWhen?: string;
}

/** Criteria section for advanced multi-criteria rules */
export interface CriteriaSection {
  id: string;
  displayText: string;
  description: string;
}

/** Phrase template for advanced mode */
export interface PhraseTemplate {
  id: string;
  template: string;
  description: string;
}

/** Advanced mode configuration */
export interface AdvancedModeConfig {
  enabled: boolean;
  criteriaSections: CriteriaSection[];
  phraseTemplates: PhraseTemplate[];
}

/** Full JSON-driven configuration */
export interface RuleSuggestorConfig {
  /** Advanced multi-criteria mode configuration */
  advancedMode?: AdvancedModeConfig;
  /** Configurable initial phrase suggestions */
  phraseSuggestions: PhraseSuggestion[];
  /** All available data elements */
  dataElements: DataElement[];
  /** Operators (equality, relational) */
  operators: OperatorDefinition[];
  /** Logical connectors */
  logicalConnectors: LogicalConnector[];
  /** Predefined rule patterns for DQ rules */
  rulePatterns: RulePattern[];
  /** Rule style reference (shown on info icon hover) */
  ruleStyleReference: { title: string; examples: string[] }[];
}
