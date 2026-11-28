// "Exporter le registre" (spec 2.14, LED-04): a button, then a sheet to choose the format. Web
// downloads a file; the phone opens its share sheet with the file's text (no extra package, D4).
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react-native';
import { space } from '@/theme';
import { BottomSheet, Button, ChoiceRow, Txt, useLang } from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { errorMessage } from '@/features/errors/errorMessage';
import { useLedgerExport, type LedgerExportFormat } from '@/features/money/useLedgerExport';
import { FileTooLargeError } from '@/lib/fileRules';

export function LedgerExport({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<LedgerExportFormat>('json');
  const exporter = useLedgerExport(groupId);

  const close = () => {
    setOpen(false);
    exporter.reset();
  };

  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        icon={Download}
        label={t('caisse.ledger.exportTitle')}
        onPress={() => setOpen(true)}
      />
      <BottomSheet
        visible={open}
        onClose={close}
        title={t('caisse.ledger.exportTitle')}
        footer={
          <Button
            fullWidth
            icon={Download}
            label={t('caisse.ledger.exportTitle')}
            offline={!online}
            loading={exporter.isPending}
            onPress={() => exporter.mutate(chosen)}
          />
        }
      >
        <Txt color="textSecondary">{t('caisse.ledger.exportHelp')}</Txt>
        <View style={styles.choices}>
          <ChoiceRow
            label={t('caisse.ledger.exportJson')}
            description={t('caisse.ledger.exportJsonHelp')}
            selected={chosen === 'json'}
            onPress={() => setChosen('json')}
          />
          <ChoiceRow
            label={t('caisse.ledger.exportCsv')}
            description={t('caisse.ledger.exportCsvHelp')}
            selected={chosen === 'csv'}
            onPress={() => setChosen('csv')}
          />
        </View>
        {Platform.OS === 'web' ? null : (
          <Txt variant="secondary" color="textSecondary">
            {t('caisse.ledger.exportPhoneNote')}
          </Txt>
        )}
        {exporter.isSuccess && exporter.data === 'saved' ? (
          <Txt variant="secondary" accessibilityLiveRegion="polite">
            {t('caisse.ledger.exportDone')}
          </Txt>
        ) : null}
        {exporter.isError ? (
          <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="assertive">
            {exporter.error instanceof FileTooLargeError
              ? t('caisse.ledger.exportTooLarge')
              : errorMessage(exporter.error, t, lang)}
          </Txt>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  choices: { gap: space.s2 },
});
