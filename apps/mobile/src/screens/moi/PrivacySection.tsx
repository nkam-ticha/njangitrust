// The privacy part of Moi (S-35; spec 1.4, Part 7): what other members see of me, what happens to what
// members send (messages and files are deleted after three months, D33), and "Exporter mes données"
// (PRV-03): one file with my own data only. Web downloads it; the phone opens its share sheet with the
// file's text (no extra package, D4). Account deletion keeps its own button at the end of the screen.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react-native';
import { space } from '@/theme';
import { BottomSheet, Button, SectionHeader, Txt, useLang } from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useDataExport } from '@/features/account/useDataExport';
import { errorMessage } from '@/features/errors/errorMessage';
import { deliverFile } from '@/lib/deliverFile';
import { FileTooLargeError } from '@/lib/fileRules';

export function PrivacySection() {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const [open, setOpen] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const [deliveryError, setDeliveryError] = useState<unknown>(null);
  const exporter = useDataExport();

  const close = () => {
    setOpen(false);
    setDelivered(false);
    setDeliveryError(null);
    exporter.reset();
  };

  const run = () => {
    setDelivered(false);
    setDeliveryError(null);
    exporter.mutate(undefined, {
      onSuccess: (file) => {
        void deliverFile(file).then(
          (outcome) => setDelivered(outcome === 'saved'),
          (error: unknown) => setDeliveryError(error),
        );
      },
    });
  };

  const error = exporter.error ?? deliveryError;

  return (
    <>
      <SectionHeader title={t('moi.privacy')} />
      <View style={styles.notes}>
        <Txt variant="secondary" color="textSecondary">
          {t('privacy.whatOthersSeeBody')}
        </Txt>
        <Txt variant="secondary" color="textSecondary">
          {t('privacy.retention')}
        </Txt>
      </View>
      <Button
        variant="secondary"
        fullWidth
        icon={Download}
        label={t('privacy.export.title')}
        onPress={() => setOpen(true)}
      />
      <BottomSheet
        visible={open}
        onClose={close}
        title={t('privacy.export.title')}
        footer={
          <Button
            fullWidth
            icon={Download}
            label={t('privacy.export.action')}
            offline={!online}
            loading={exporter.isPending}
            onPress={run}
          />
        }
      >
        <Txt>{t('privacy.export.body')}</Txt>
        <Txt variant="secondary" color="textSecondary">
          {t('privacy.export.ownOnly')}
        </Txt>
        {exporter.isPending ? (
          <Txt variant="secondary" accessibilityLiveRegion="polite">
            {t('privacy.export.preparing')}
          </Txt>
        ) : null}
        {delivered ? (
          <Txt variant="secondary" accessibilityLiveRegion="polite">
            {t('privacy.export.ready')}
          </Txt>
        ) : null}
        {error ? (
          <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="assertive">
            {error instanceof FileTooLargeError
              ? t('privacy.export.tooLarge')
              : errorMessage(error, t, lang)}
          </Txt>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  notes: { gap: space.s3, paddingHorizontal: space.s4 },
});
