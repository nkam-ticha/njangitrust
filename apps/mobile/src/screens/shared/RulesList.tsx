// A group's rules as a grouped list (invitation R1.5, group settings, create-group summary).
import { useTranslation } from 'react-i18next';
import type { RuleSetParamsDto } from '@njangi/shared/contracts/groups';
import { GroupedList, ListRow, Txt, useLang } from '@/ui';
import { RULE_ORDER, ruleLabel, ruleValue, type RuleName } from '@/features/groups/ruleFormat';

interface RulesListProps {
  params: Omit<RuleSetParamsDto, 'payoutTime'>;
  /** Makes every row editable (create a group, step 4). */
  onEdit?: (name: RuleName) => void;
  /** Rules shown elsewhere in the flow. */
  hide?: RuleName[];
}

export function RulesList({ params, onEdit, hide = [] }: RulesListProps) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <GroupedList>
      {RULE_ORDER.filter(
        (n) => !hide.includes(n) && (n !== 'customPeriodMinutes' || params.frequency === 'CUSTOM'),
      ).map((name) => {
        const label = ruleLabel(name, t);
        const value = ruleValue(name, params[name], t, lang);
        return (
          <ListRow
            key={name}
            title={label}
            titleWeight="regular"
            trailing={
              <Txt variant="bodyStrong" align="right">
                {value}
              </Txt>
            }
            chevron={!!onEdit}
            onPress={onEdit ? () => onEdit(name) : undefined}
            accessibilityLabel={
              onEdit
                ? t('createGroup.rules.editRule', { rule: `${label}, ${value}` })
                : `${label}, ${value}`
            }
          />
        );
      })}
    </GroupedList>
  );
}
