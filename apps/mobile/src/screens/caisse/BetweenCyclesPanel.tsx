// Caisse: what the group sees between two cycles (D40.2, D40.4): the last cycle's result, and the
// admin's way to start the next one. Nothing starts by itself; with fewer than 3 members it waits.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MIN_MEMBERS_TO_START } from '@njangi/rules';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import { space } from '@/theme';
import { Button, Txt } from '@/ui';
import { useCycles } from '@/features/cycles/queries';
import { BetweenCyclesMoney } from './BetweenCyclesMoney';
import { CycleEndCard } from './CycleEndCard';
import { StartNextCycleSheet } from './StartNextCycleSheet';

export function BetweenCyclesPanel({
  group,
  withMoney = false,
}: {
  group: MyGroupDto;
  /** The Tour also shows the member's own money (withdraw, pay); the fund segment does not. */
  withMoney?: boolean;
}) {
  const { t } = useTranslation();
  const cycles = useCycles(group.groupId);
  const [starting, setStarting] = useState(false);
  if (cycles.data?.phase !== 'BETWEEN_CYCLES') return null;
  const admin = group.role === 'ADMIN';
  const participants = cycles.data.participants ?? 0;
  const enough = participants >= MIN_MEMBERS_TO_START;
  const last = cycles.data.cycles.find((c) => c.closedAt !== null);
  return (
    <View style={styles.column}>
      <Txt variant="sectionTitle" accessibilityRole="header">
        {t('caisse.cycleEnd.betweenCycles.title')}
      </Txt>
      <Txt color="textSecondary">
        {admin
          ? t('caisse.cycleEnd.betweenCycles.adminBody')
          : t('caisse.cycleEnd.betweenCycles.memberBody')}
      </Txt>
      {last ? <CycleEndCard groupId={group.groupId} cycleNumber={last.number} /> : null}
      {/* The admin's main action comes before the member's own money, so it is never pushed
          below the tab bar on a small phone. */}
      {admin && !enough ? (
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.cycleEnd.betweenCycles.notEnough', { count: participants })}
        </Txt>
      ) : null}
      {admin ? (
        <>
          <Button
            fullWidth
            label={t('caisse.cycleEnd.betweenCycles.start')}
            disabled={!enough}
            onPress={() => setStarting(true)}
          />
          <StartNextCycleSheet
            visible={starting}
            groupId={group.groupId}
            onClose={() => setStarting(false)}
          />
        </>
      ) : null}
      {withMoney ? <BetweenCyclesMoney group={group} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ column: { gap: space.s3 } });
