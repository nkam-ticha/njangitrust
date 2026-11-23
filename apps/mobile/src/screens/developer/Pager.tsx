// Previous / next page of a developer list (the API pages with `page` and `pageSize`).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space } from '@/theme';
import { Button, Txt } from '@/ui';

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pager({ page, pageSize, total, onChange }: PagerProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <View style={styles.row}>
      <Button
        variant="secondary"
        label={t('developer.list.previous')}
        disabled={page <= 1}
        onPress={() => onChange(page - 1)}
      />
      <Txt variant="secondary" color="textSecondary">
        {t('developer.list.page', { page, pages })}
      </Txt>
      <Button
        variant="secondary"
        label={t('developer.list.next')}
        disabled={page >= pages}
        onPress={() => onChange(page + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s2,
    flexWrap: 'wrap',
  },
});
