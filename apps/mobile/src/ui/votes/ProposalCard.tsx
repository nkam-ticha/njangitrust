// ProposalCard (spec 1.5; DESIGN_SYSTEM.md 5.20). Bordered, not raised. Secret votes show
// participation only until the close (R11.5). "Oui" and "Non" each open a ConfirmationCard.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleDashed, CircleX, Lock, TimerOff } from 'lucide-react-native';
import { radius, space, useTheme } from '@/theme';
import { Button } from '../buttons/Button';
import { LabelBadge } from '../identity/Badge';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export type ProposalType =
  | 'RULE_CHANGE' | 'MEMBER_ADD' | 'MEMBER_REMOVE' | 'ROTATION_CHANGE' | 'ADMIN_CHANGE'
  | 'EARLY_EXIT' | 'ADMIN_LOAN' | 'SOLIDARITY_PAYOUT' | 'FINE_WAIVER' | 'LEDGER_CORRECTION';
export type ProposalStatus = 'OPEN' | 'PASSED' | 'REJECTED' | 'EXPIRED';
export type MyVote = 'none' | 'yes' | 'no' | 'secret';
export type NotEligibleReason = 'notEligible' | 'excludedTarget' | 'excludedProposer' | 'excludedAdmin' | 'joinedAfter';

export interface ProposalCardProps {
  type: ProposalType;
  /** Already built from copy: votes.titles.* */
  title: string;
  proposerName: string;
  proposedByMe?: boolean;
  secret: boolean;
  status: ProposalStatus;
  eligible: number;
  needed: number;
  /** Totals: hidden by the server for open secret votes (null). */
  yes: number | null;
  no: number | null;
  /** Members who voted (participation). */
  voted: number;
  /** Formatted duration ("2 jours"), open proposals only. */
  timeLeft?: string;
  myVote: MyVote;
  notEligible?: NotEligibleReason | null;
  /** Closed proposals: "Appliqué au tour 5", built from copy votes.card.effect.* */
  effect?: string;
  onYes?: () => void;
  onNo?: () => void;
  onOpen?: () => void;
  offline?: boolean;
}

function VoteBar({ fill, tick, label }: { fill: number; tick?: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={label} style={[styles.bar, { backgroundColor: colors.surfaceTint }]}>
      <View style={[styles.fill, { width: `${Math.min(100, fill * 100)}%`, backgroundColor: colors.primary }]} />
      {tick !== undefined ? <View style={[styles.tick, { left: `${Math.min(100, tick * 100)}%`, backgroundColor: colors.textPrimary }]} /> : null}
    </View>
  );
}

export function ProposalCard(p: ProposalCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const open = p.status === 'OPEN';
  const secretOpen = p.secret && open;
  const yes = p.yes ?? 0;
  const no = p.no ?? 0;

  const myVoteLine = p.notEligible
    ? { icon: null, text: t(`votes.card.yourVote.${p.notEligible}`) }
    : p.myVote === 'none'
      ? { icon: <CircleDashed size={20} color={colors.iconSecondary} strokeWidth={2} />, text: t('votes.card.yourVote.notVoted') }
      : { icon: <CircleCheck size={20} color={colors.statusPaid} strokeWidth={2} />, text: t(`votes.card.yourVote.${p.myVote}`) };

  const result =
    p.status === 'PASSED' ? { Glyph: CircleCheck, color: colors.statusPaid }
    : p.status === 'REJECTED' ? { Glyph: CircleX, color: colors.statusLate }
    : { Glyph: TimerOff, color: colors.iconSecondary };

  const body = (
    <View style={[styles.card, { borderColor: colors.divider }]}>
      <View style={styles.headRow}>
        <Txt variant="secondary" color="textSecondary" style={styles.flex}>{t(`votes.types.${p.type}`)}</Txt>
        {p.secret ? <LabelBadge icon={Lock} label={t('votes.card.secretBadge')} /> : null}
      </View>
      <Txt variant="bodyStrong" numberOfLines={3}>{p.title}</Txt>
      <Txt variant="secondary" color="textSecondary">
        {[p.proposedByMe ? t('votes.card.proposerYou') : t('votes.card.proposer', { name: p.proposerName }), open && p.timeLeft ? t('votes.card.timeLeft', { duration: p.timeLeft }) : null]
          .filter(Boolean)
          .join(' · ')}
      </Txt>

      {open ? (
        secretOpen ? (
          <>
            <VoteBar fill={p.voted / Math.max(1, p.eligible)} label={t('votes.card.participation', { voted: p.voted, eligible: p.eligible })} />
            <Txt variant="secondary" color="textSecondary">
              {`${t('votes.card.participation', { voted: p.voted, eligible: p.eligible })}. ${t('votes.card.participationNote')}`}
            </Txt>
          </>
        ) : (
          <>
            <VoteBar fill={yes / Math.max(1, p.eligible)} tick={p.needed / Math.max(1, p.eligible)} label={t('votes.card.a11yProgress', { yes, needed: p.needed, eligible: p.eligible })} />
            <Txt variant="secondary" color="textSecondary">{`${t('votes.card.progress', { yes, needed: p.needed })} · ${t('votes.card.noCount', { count: no })}`}</Txt>
          </>
        )
      ) : (
        <View style={styles.headRow}>
          <View style={[styles.result, { borderColor: colors.outline }]}>
            <result.Glyph size={14} color={result.color} strokeWidth={2} />
            <Txt variant="captionStrong">{t(`votes.card.result.${p.status as 'PASSED' | 'REJECTED' | 'EXPIRED'}`)}</Txt>
          </View>
          <Txt variant="secondary" color="textSecondary" style={styles.flex}>
            {[t('votes.card.tally', { yes, no, none: Math.max(0, p.eligible - yes - no) }), p.effect].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      )}

      {open ? (
        <View style={styles.headRow}>
          {myVoteLine.icon}
          <Txt style={styles.flex}>{myVoteLine.text}</Txt>
        </View>
      ) : null}

      {open && !p.notEligible && p.myVote === 'none' ? (
        p.offline ? (
          <Button label="" offline fullWidth />
        ) : (
          <View style={styles.buttons}>
            <Button variant="secondary" label={t('votes.card.yes')} onPress={p.onYes} fullWidth style={styles.flex} />
            <Button variant="secondary" label={t('votes.card.no')} onPress={p.onNo} fullWidth style={styles.flex} />
          </View>
        )
      ) : null}
    </View>
  );

  if (!p.onOpen) return body;
  return (
    <Touchable onPress={p.onOpen} accessibilityRole="button" accessibilityLabel={p.title} pressedLayer={null}>
      {body}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.group, padding: space.s4, gap: space.s2 + 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  bar: { height: 8, borderRadius: radius.full, marginVertical: space.s1 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.full },
  tick: { position: 'absolute', top: -3, width: 2, height: 14, borderRadius: 1 },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.s1, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: space.s2, minHeight: 24 },
  buttons: { flexDirection: 'row', gap: space.s2 },
  flex: { flex: 1 },
});
