// Njangi tab status header (SCREENS.md S-10; DESIGN_SYSTEM.md 5.24): the 64 px ring and three
// lines built from the overview, never from AI text. One button to Caisse › Tour.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  ShieldAlert,
} from 'lucide-react-native';
import { size, space, useTheme } from '@/theme';
import { NjangiRing, type RingMember } from '../ring/NjangiRing';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export type ContributionStatus = 'toPay' | 'paid' | 'late' | 'processing';

interface StatusHeaderProps {
  round: number;
  roundsTotal: number;
  members: RingMember[];
  collected: number;
  target: number;
  /** First name of the beneficiary, or null when it is the member. */
  beneficiaryName: string | null;
  contribution: ContributionStatus;
  operator?: string;
  withdrawalsPaused?: boolean;
  /** Hidden on large screens, where the side panel shows the big ring (8.2). */
  showRing?: boolean;
  onPress: () => void;
}

export function StatusHeader(p: StatusHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const line2 =
    p.beneficiaryName === null
      ? t('agent.header.beneficiaryYou')
      : t('agent.header.beneficiary', { name: p.beneficiaryName });
  const status = {
    toPay: {
      Glyph: CircleDashed,
      color: colors.iconSecondary,
      text: t('agent.header.status.toPay'),
    },
    paid: { Glyph: CircleCheck, color: colors.statusPaid, text: t('agent.header.status.paid') },
    late: { Glyph: CircleAlert, color: colors.statusLate, text: t('agent.header.status.late') },
    processing: {
      Glyph: Clock,
      color: colors.statusPending,
      text: t('agent.header.status.processing', { operator: p.operator ?? 'Mobile Money' }),
    },
  }[p.contribution];
  const line3 = p.withdrawalsPaused
    ? { Glyph: ShieldAlert, color: colors.statusLate, text: t('agent.header.withdrawalsPaused') }
    : {
        Glyph: status.Glyph,
        color: status.color,
        text: t('agent.header.contribution', { status: status.text }),
      };
  const line1 = t('agent.header.round', { round: p.round, total: p.roundsTotal });

  return (
    <Touchable
      onPress={p.onPress}
      radius={0}
      accessibilityRole="button"
      accessibilityLabel={`${line1}. ${line2}. ${line3.text}`}
      accessibilityHint={t('agent.header.a11y')}
    >
      <View style={[styles.row, { borderBottomColor: colors.divider }]}>
        {p.showRing !== false ? (
          <NjangiRing
            size="header"
            members={p.members}
            collected={p.collected}
            target={p.target}
            round={p.round}
            roundsTotal={p.roundsTotal}
          />
        ) : null}
        <View style={styles.lines}>
          <Txt variant="bodyStrong">{line1}</Txt>
          <Txt variant="secondary" color="textSecondary">
            {line2}
          </Txt>
          <View style={styles.l3}>
            <line3.Glyph size={16} color={line3.color} strokeWidth={2} />
            <Txt variant="secondary" style={styles.flex}>
              {line3.text}
            </Txt>
          </View>
        </View>
        <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={2} />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingLeft: space.s4,
    paddingRight: space.s3,
    paddingVertical: space.s2,
    borderBottomWidth: 1,
    minHeight: size.tabBar + space.s4,
  },
  lines: { flex: 1, minWidth: 0 },
  l3: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1 },
});
