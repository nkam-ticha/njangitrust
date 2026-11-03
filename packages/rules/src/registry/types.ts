// Shape of a registry entry (spec 4.9).

export interface Bilingual {
  fr: string;
  en: string;
}

/** The official wording of one rule of Part 3. */
export interface RuleText {
  /** "R7.3", or "3.1" to "3.3" for definitions, parameters and conventions. */
  id: string;
  /** "R7" for R7.3; "3" for the general sections. */
  section: string;
  /** Title of the section the rule belongs to. */
  title: Bilingual;
  /** The rule itself, word for word from Part 3 (French translated faithfully). */
  text: Bilingual;
  /** Keywords in French and English that find the rule (explain_rule `topic`). */
  topics: string[];
}
