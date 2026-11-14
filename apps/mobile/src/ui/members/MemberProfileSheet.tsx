// Member mini-profile (spec 1.2; DESIGN_SYSTEM.md 5.25): public data only, never a phone number.
// Previous / next step through the rotation order, so a missed tap on a dense ring is one tap away.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { size, space, useTheme } from '@/theme';
import { BottomSheet } from '../sheets/BottomSheet';
import { Avatar } from '../identity/Avatar';
import { LabelBadge } from '../identity/Badge';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import { Reliability, type ReliabilityValue } from './Reliability';

export type ProfileRoundStatus =
  'paid' | 'paidLate' | 'unpaid' | 'late' | 'pending' | 'beneficiary' | 'notActive';

export interface MemberProfile {
  name: string;
  isMe: boolean;
  isAdmin: boolean;
  isBeneficiary: boolean;
  /** Null before the first cycle: the row is hidden. */
  roundStatus: ProfileRoundStatus | null;
  /** Bidding mode: the member has no fixed turn yet. */
  biddingTurn?: boolean;
  /** Formatted date for paid statuses. */
  paidDate?: string;
  /** Their turn: round and formatted date, or the round they already received. */
  turn: { round: number; date: string } | null;
  servedRound: number | null;
  reliability: ReliabilityValue;
  /** "octobre 2026" */
  memberSince: string;
  /** Formatted date when the member has left. */
  leftOn?: string | null;
}

interface MemberProfileSheetProps {
  visible: boolean;
  profile: MemberProfile | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function MemberProfileSheet({
  visible,
  profile,
  onClose,
  onPrevious,
  onNext,
}: MemberProfileSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!profile) return null;
  const name = profile.isMe ? t('common.youSuffix', { name: profile.name }) : profile.name;
  const row = (label: string, value: string) => (
    <View style={[styles.row, { borderTopColor: colors.divider }]}>
      <Txt variant="secondary" color="textSecondary" style={styles.label}>
        {label}
      </Txt>
      <Txt style={styles.flex}>{value}</Txt>
    </View>
  );
  const nav = (Glyph: typeof ChevronLeft, label: string, onPress?: () => void) =>
    onPress ? (
      <Touchable
        onPress={onPress}
        radius={24}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.nav}
      >
        <Glyph size={24} color={colors.iconPrimary} strokeWidth={2} />
      </Touchable>
    ) : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={name}>
      <View style={styles.head}>
        {nav(ChevronLeft, t('memberProfile.previous'), onPrevious)}
        <Avatar size={56} name={profile.name} beneficiary={profile.isBeneficiary} />
        <View style={styles.flex}>
          {profile.isAdmin ? <LabelBadge label={t('common.roles.ADMIN')} /> : null}
          {profile.isBeneficiary ? (
            <Txt variant="secondary">{t('memberProfile.roundStatus.beneficiary')}</Txt>
          ) : null}
        </View>
        {nav(ChevronRight, t('memberProfile.next'), onNext)}
      </View>
      {profile.leftOn
        ? row(t('memberProfile.thisRound'), t('memberProfile.left', { date: profile.leftOn }))
        : profile.roundStatus
          ? row(
              t('memberProfile.thisRound'),
              t(`memberProfile.roundStatus.${profile.roundStatus}`, {
                date: profile.paidDate ?? '',
              }),
            )
          : null}
      {profile.servedRound !== null
        ? row(
            t('memberProfile.turn'),
            t('memberProfile.servedValue', { round: profile.servedRound }),
          )
        : profile.turn
          ? row(
              t('memberProfile.turn'),
              t('memberProfile.turnValue', { round: profile.turn.round, date: profile.turn.date }),
            )
          : profile.biddingTurn
            ? row(t('memberProfile.turn'), t('memberProfile.biddingTurn'))
            : null}
      <View style={[styles.row, { borderTopColor: colors.divider }]}>
        <Txt variant="secondary" color="textSecondary" style={styles.label}>
          {t('memberProfile.reliability')}
        </Txt>
        <View style={styles.flex}>
          <Reliability value={profile.reliability} />
        </View>
      </View>
      {row(t('memberProfile.memberSince', { date: '' }).trim(), profile.memberSince)}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  nav: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s3,
    paddingVertical: space.s3,
    borderTopWidth: 1,
  },
  label: { width: 112 },
  flex: { flex: 1 },
});
