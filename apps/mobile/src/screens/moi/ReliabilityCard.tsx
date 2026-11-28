// Moi > Ma fiabilité (FSD STA-02, R14): the share of my last due items paid on time in the active
// group, with the counts and the formula behind the info button. The server computes it; nothing is
// calculated here. "Nouveau membre" shows until there are 3 due items (R14.2).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space } from '@/theme';
import { Button, Reliability, SectionHeader, SkeletonRows, Txt } from '@/ui';
import { useMyReliability } from '@/features/me/useReliability';

export function ReliabilityCard({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { t } = useTranslation();
  const query = useMyReliability(groupId);
  return (
    <>
      <SectionHeader title={t('moi.reliability')} />
      <View style={styles.body}>
        <Txt variant="secondary" color="textSecondary">
          {t('moi.reliabilityIn', { group: groupName })}
        </Txt>
        {query.isPending ? <SkeletonRows rows={1} /> : null}
        {query.isError ? (
          <>
            <Txt variant="secondary" color="textDanger">
              {t('moi.reliabilityFailed')}
            </Txt>
            <Button
              variant="text"
              label={t('common.actions.retry')}
              onPress={() => void query.refetch()}
            />
          </>
        ) : null}
        {query.data ? (
          <Reliability
            value={{
              score: query.data.percent,
              onTime: query.data.onTime,
              due: query.data.total,
              window: query.data.window,
            }}
          />
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.s2, paddingHorizontal: space.s4 },
});
