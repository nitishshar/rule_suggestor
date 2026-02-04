/** Numbered condition within a criteria section */
export interface NumberedCondition {
  number: number;
  text: string;
}

/** Criteria section with numbered conditions */
export interface RuleCriteria {
  sectionId: string;
  sectionTitle: string;
  conditions: NumberedCondition[];
}

/** Multi-criteria rule structure */
export interface MultiCriteriaRule {
  ruleNumber?: number;
  mainStatement: string;
  criterias: RuleCriteria[];
}

/** Collection of multi-criteria rules */
export interface MultiCriteriaRuleSet {
  rules: MultiCriteriaRule[];
}
