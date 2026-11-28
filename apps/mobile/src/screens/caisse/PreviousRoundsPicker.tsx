// Caisse > Tour, "Tours précédents" (#88; spec 2.7 rounds, CAI-03): pick an earlier round of the cycle to
// see who paid and the payout breakdown (what was collected, the fees, the automatic deductions, what
// was withdrawn). Every figure is the server's; nothing is calculated here.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDateShort } from '@njangi/shared';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import { space } from '@/theme';
import {
  Banner,
  BottomSheet,
  Chip,
  ChipRow,
  GroupedList,
  ListRow,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useMembers } from '@/features/groups/useGroups';
import { useRound } from '@/features/money/queries';
import { errorMessage } from '@/features/errors/errorMessage';
import { BreakdownSheet } from './BreakdownSheet';
import { earlierRounds, roundPayers } from './previousRounds';

interface PreviousRoundsPickerProps {
  group: MyGroupDto;
  /** The round in progress; the picker offers the ones before it. */
  currentNumber: number;
}

export function PreviousRoundsPicker({ group, currentNumber }: PreviousRoundsPickerProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number | null>(null);
  const rounds = earlierRounds(currentNumber);
  if (!rounds.length) return null;
  return (
    <>
      <SectionHeader inset={false} title={t('caisse.tour.previousRounds')} />
      <ChipRow label={t('caisse.tour.roundPicker')}>
        {rounds.map((n) => (
          <Chip
            key={n}
            kind="filter"
            label={t('caisse.previous.roundChip', { round: n })}
            selected={picked === n}
            onPress={() => setPicked(n)}
          />
        ))}
      </ChipRow>
      <BottomSheet
        visible={picked !== null}
        onClose={() => setPicked(null)}
        title={t('caisse.breakdown.title', { round: picked ?? 0 })}
      >
        {picked !== null ? <PreviousRound group={group} number={picked} /> : null}
      </BottomSheet>
    </>
  );
}

function PreviousRound({ group, number }: { group: MyGroupDto; number: number }) {
  const { t } = useTranslation();
  const lang = useLang();
  const round = useRound(group.groupId, number);
  const members = useMembers(group.groupId);

  if (round.isPending || members.isPending) return <SkeletonRows rows={4} />;
  if (round.isError || members.isError) {
    return <Banner kind="error" text={errorMessage(round.error ?? members.error, t, lang)} />;
  }
  const r = round.data;
  const payers = roundPayers(members.data ?? [], r.unpaidMembershipIds, r.paidCount);
  const mine = r.beneficiaryMembershipId === group.membershipId;

  return (
    <View style={styles.column}>
      {r.beneficiaryName || mine ? (
        <Txt color="textSecondary">
          {mine
            ? t('caisse.previous.beneficiaryYou', { date: formatDateShort(r.payoutAt, lang) })
            : t('caisse.previous.beneficiary', {
                name: r.beneficiaryName ?? '',
                date: formatDateShort(r.payoutAt, lang),
              })}
        </Txt>
      ) : null}

      <Txt variant="sectionTitle">
        {t('caisse.previous.paidOf', { paid: r.paidCount, total: r.contributionCount })}
      </Txt>
      {payers.paid?.length ? (
        <View style={styles.flush}>
          <GroupedList>
            {payers.paid.map((name, i) => (
              <ListRow key={`${i}-${name}`} titleWeight="regular" title={name} />
            ))}
          </GroupedList>
        </View>
      ) : null}

      {payers.unpaid.length ? (
        <>
          <Txt variant="sectionTitle">
            {t('caisse.previous.unpaidTitle', { count: payers.unpaid.length })}
          </Txt>
          <View style={styles.flush}>
            <GroupedList>
              {payers.unpaid.map((name, i) => (
                <ListRow key={`${i}-${name}`} titleWeight="regular" title={name} />
              ))}
            </GroupedList>
          </View>
        </>
      ) : (
        <Txt color="textSecondary">{t('caisse.tour.allPaid')}</Txt>
      )}

      <Txt variant="sectionTitle">{t('caisse.tour.breakdown')}</Txt>
      <BreakdownSheet groupId={group.groupId} roundNumber={number} forBeneficiary={mine} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  flush: { marginHorizontal: -space.s4 },
});
