// Bidding (enchère, R8, spec 1.4 Bidding): shown only when the cycle is in bidding mode. The bid is
// sealed: nobody sees the amounts until the bidding closes. The bid itself is a card the member confirms.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatXAF, pick } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import {
  AmountInput,
  Banner,
  Button,
  GroupedList,
  ListRow,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useBids, usePlaceBid } from '@/features/bids/useBids';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';

interface BiddingPanelProps {
  groupId: string | null;
  roundId: string;
  roundNumber: number;
}

export function BiddingPanel({ groupId, roundId, roundNumber }: BiddingPanelProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const query = useBids(groupId, roundId);
  const place = usePlaceBid(groupId, roundId);
  const [amount, setAmount] = useState<number | null>(null);
  const [action, setAction] = useState<PendingActionDto | null>(null);

  if (query.isPending) return <SkeletonRows rows={2} />;
  if (query.isError) {
    return <Banner kind="error" text={errorMessage(query.error, t, lang)} />;
  }
  const data = query.data;
  const mine = data.mine;
  const revealed = data.bids;
  const winner = revealed?.find((b) => b.membershipId === data.winnerMembershipId) ?? null;

  return (
    <View style={styles.column}>
      <Txt variant="sectionTitle">{t('bidding.title', { round: roundNumber })}</Txt>
      <Txt color="textSecondary">{t('bidding.explain')}</Txt>
      <Txt variant="secondary" color="textSecondary">
        {t('bidding.closesAt', { date: pick(data.closesAt, lang) })}
      </Txt>
      <Txt variant="secondary" color="textSecondary">
        {t(data.count === 1 ? 'bidding.bidsCount_one' : 'bidding.bidsCount_other', {
          count: data.count,
        })}
      </Txt>

      {revealed === null ? (
        <>
          <Txt>
            {mine
              ? t('bidding.yourBid', { amount: formatXAF(mine.amount, lang) })
              : t('bidding.noBid')}
          </Txt>
          {action ? (
            <ActionCard
              action={action}
              onConfirmed={() => {
                setAction(null);
                setAmount(null);
                void query.refetch();
              }}
              onCancelled={() => setAction(null)}
              onClose={() => setAction(null)}
            />
          ) : (
            <>
              <AmountInput label={t('bidding.amountLabel')} value={amount} onChange={setAmount} />
              {place.error ? (
                <Txt variant="secondary" color="textDanger">
                  {errorMessage(place.error, t, lang)}
                </Txt>
              ) : null}
              <Button
                fullWidth
                label={mine ? t('bidding.raise') : t('bidding.place')}
                loading={place.isPending}
                offline={!online}
                disabled={amount === null || place.isPending}
                onPress={() => {
                  if (amount === null) return;
                  place.mutate(amount, { onSuccess: (prepared) => setAction(prepared) });
                }}
              />
            </>
          )}
        </>
      ) : (
        <>
          <SectionHeader inset={false} title={t('bidding.results.title')} />
          {winner ? (
            <Txt>
              {winner.membershipId === data.winnerMembershipId
                ? t('bidding.results.winner', {
                    name: winner.name,
                    amount: formatXAF(winner.amount, lang),
                  })
                : null}
            </Txt>
          ) : (
            <Txt color="textSecondary">{t('bidding.results.tieNote')}</Txt>
          )}
          <View style={styles.flush}>
            <GroupedList>
              {revealed.map((bid) => (
                <ListRow
                  key={bid.membershipId}
                  title={bid.name}
                  subtitle={t('bidding.results.bidRow', {
                    name: bid.name,
                    time: formatDateTime(bid.reachedAt, lang),
                  })}
                  trailing={<Txt>{formatXAF(bid.amount, lang)}</Txt>}
                />
              ))}
            </GroupedList>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  flush: { marginHorizontal: -space.s4 },
});
