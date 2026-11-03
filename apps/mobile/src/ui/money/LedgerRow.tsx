// LedgerRow (spec 1.5; DESIGN_SYSTEM.md 5.19). The amount is the cash movement at the operator:
// signed for cash entries, unsigned and secondary for non-cash entries, absent for decisions (DD-24).
// Amounts are never coloured; the sign carries the direction.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AlarmClock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gavel,
  HandCoins,
  HeartHandshake,
  LogOut,
  Repeat,
  Scale,
  Split,
  Undo2,
} from 'lucide-react-native';
import { radius, size, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import { useLang } from '../primitives/useLang';
import type { IconComponent } from '../primitives/Icon';
import { AmountText, amountLabel } from './AmountText';

export type LedgerType =
  | 'PAYMENT_RECEIVED'
  | 'FINE_ASSESSED'
  | 'BID_ASSESSED'
  | 'AUTO_SETTLEMENT'
  | 'WITHDRAWAL_COMPLETED'
  | 'LOAN_DISBURSED'
  | 'SOLIDARITY_DISBURSED'
  | 'LEAVER_REFUND'
  | 'FUND_DISTRIBUTION'
  | 'REVERSAL'
  | 'EVENT';

const ICONS: Record<LedgerType, IconComponent> = {
  PAYMENT_RECEIVED: ArrowDownToLine,
  FINE_ASSESSED: AlarmClock,
  BID_ASSESSED: Gavel,
  AUTO_SETTLEMENT: Repeat,
  WITHDRAWAL_COMPLETED: ArrowUpFromLine,
  LOAN_DISBURSED: HandCoins,
  SOLIDARITY_DISBURSED: HeartHandshake,
  LEAVER_REFUND: LogOut,
  FUND_DISTRIBUTION: Split,
  REVERSAL: Undo2,
  EVENT: Scale,
};

export interface LedgerRowProps {
  seq: number;
  type: LedgerType;
  /** Description in the member's language (descriptionFr / descriptionEn from the server). */
  description: string;
  /** Date and time already formatted for Douala ("3 nov., 14:32"). */
  when: string;
  /** Cash movement at the operator (cash:provider posting); null when no cash moved. */
  cashAmount: number | null;
  /** Amount of a non-cash entry (fine, automatic deduction, bid, fund sharing). */
  amount?: number | null;
  operatorRef?: string | null;
  onPress?: () => void;
  selected?: boolean;
  divider?: boolean;
}

export function LedgerRow({ seq, type, description, when, cashAmount, amount = null, operatorRef, onPress, selected, divider }: LedgerRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const lang = useLang();
  const Glyph = ICONS[type];
  const ref = operatorRef ? (operatorRef.length > 10 ? `${operatorRef.slice(0, 10)}…` : operatorRef) : null;
  const subtitle = [when, t('caisse.ledger.shortRef', { seq }), ref].filter(Boolean).join(' · ');
  const shown = cashAmount ?? amount;
  const label = t('caisse.ledger.rowA11y', {
    date: when,
    description,
    amount: shown === null ? '' : amountLabel(shown, lang, cashAmount !== null ? 'always' : 'auto'),
    ref: operatorRef ?? String(seq),
  });

  return (
    <Touchable onPress={onPress} disabled={!onPress} radius={0} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected }}>
      <View style={[styles.row, selected && { backgroundColor: colors.selectedTint }]}>
        {divider ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
        <View style={[styles.icon, { backgroundColor: colors.surfaceTint }]}>
          <Glyph size={20} color={colors.iconPrimary} strokeWidth={2} />
        </View>
        <View style={styles.text}>
          <Txt numberOfLines={2}>{description}</Txt>
          <Txt variant="secondary" color="textSecondary">{subtitle}</Txt>
        </View>
        {cashAmount !== null ? <AmountText amount={cashAmount} sign="always" /> : amount !== null ? <AmountText amount={amount} tone="secondary" /> : null}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: size.rowTwoLine, flexDirection: 'row', alignItems: 'flex-start', gap: space.s3, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  divider: { position: 'absolute', top: 0, right: 0, left: space.s4 + size.avatar + space.s3, height: 1 },
  icon: { width: size.avatar, height: size.avatar, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
});
