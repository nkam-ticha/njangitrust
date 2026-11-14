// Edits one rule at creation (S-07 step 4): amounts within their 3.2 range, other rules as choices.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatXAF } from '@njangi/shared';
import { AmountInput, BottomSheet, Button, ChoiceRow, Txt, useLang } from '@/ui';
import {
  AMOUNT_RANGES,
  RULE_CHOICES,
  permilleText,
  ruleLabel,
  ruleValue,
  type AmountRule,
  type RuleName,
} from '@/features/groups/ruleFormat';

type RuleValue = number | string | boolean;

interface RuleEditSheetProps {
  name: RuleName | null;
  value: RuleValue | null;
  onClose: () => void;
  onSave: (name: RuleName, value: RuleValue) => void;
}

const isAmount = (n: RuleName): n is AmountRule => n in AMOUNT_RANGES;

export function RuleEditSheet({ name, value, onClose, onSave }: RuleEditSheetProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const [draft, setDraft] = useState<RuleValue | null>(value);
  const [seen, setSeen] = useState({ name, value });
  if (seen.name !== name || seen.value !== value) {
    setSeen({ name, value });
    setDraft(value);
  }
  if (!name) return null;

  const helpKey = name === 'loanLimitFactorPermille' ? 'loanLimitFactor' : name;
  const range = isAmount(name) ? AMOUNT_RANGES[name] : null;
  const valid = range
    ? typeof draft === 'number' && draft >= range[0] && draft <= range[1]
    : draft !== null;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={ruleLabel(name, t)}
      footer={
        <Button
          fullWidth
          label={t('common.actions.save')}
          disabled={!valid}
          onPress={() => draft !== null && onSave(name, draft)}
        />
      }
    >
      {range ? (
        <AmountInput
          label={ruleLabel(name, t)}
          value={typeof draft === 'number' ? draft : null}
          onChange={setDraft}
          min={range[0]}
          max={range[1]}
          helper={t('rules.contributionAmount.help', {
            min: formatXAF(range[0], lang),
            max: formatXAF(range[1], lang),
          })}
        />
      ) : (
        RULE_CHOICES[name as keyof typeof RULE_CHOICES].map((choice) => (
          <ChoiceRow
            key={String(choice)}
            label={ruleValue(name, choice, t, lang)}
            selected={draft === choice}
            onPress={() => setDraft(choice)}
          />
        ))
      )}
      {name !== 'contributionAmount' ? (
        <Txt variant="secondary" color="textSecondary">
          {t(`rules.${helpKey}.help` as 'rules.loanLimitFactor.help', {
            factor: typeof draft === 'number' ? permilleText(draft, 1000, lang) : '',
          })}
        </Txt>
      ) : null}
    </BottomSheet>
  );
}
