// Previous / next page of a developer list (the API pages with `page` and `pageSize`). The page
// label sits above two equal buttons, so the pair fits on a 320 dp screen without wrapping.
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
    <View style={styles.wrap}>
      <Txt variant="secondaryStrong" color="textSecondary" align="center">
        {t('developer.list.page', { page, pages })}
      </Txt>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Button
            fullWidth
            variant="secondary"
            label={t('developer.list.previous')}
            disabled={page <= 1}
            onPress={() => onChange(page - 1)}
          />
        </View>
        <View style={styles.cell}>
          <Button
            fullWidth
            variant="secondary"
            label={t('developer.list.next')}
            disabled={page >= pages}
            onPress={() => onChange(page + 1)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s2, paddingTop: space.s2 },
  row: { flexDirection: 'row', gap: space.s3 },
  cell: { flex: 1, minWidth: 0 },
});
