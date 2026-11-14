// PIN sheet for L2 actions (spec 4.5, R13.2; DESIGN_SYSTEM.md 5.11): opens after the tap on
// the card's primary button. Screenshots are blocked while it is open (phone only).
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space } from '@/theme';
import { BottomSheet } from './BottomSheet';
import { PinPad } from '../inputs/PinPad';
import { Txt } from '../primitives/Txt';
import { Button } from '../buttons/Button';
import { useBackgroundCover, useScreenshotBlock } from './useScreenshotBlock';

export interface PinSheetProps {
  visible: boolean;
  /** The card title, shown as the subtitle ("Changer ton numéro de paiement"). */
  actionTitle: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  onForgot: () => void;
  checking?: boolean;
  /** Tries left after a wrong PIN; null when no error. */
  triesLeft?: number | null;
  /** Locked until this time (already formatted). */
  lockedUntil?: string | null;
}

export function PinSheet({
  visible,
  actionTitle,
  onSubmit,
  onCancel,
  onForgot,
  checking,
  triesLeft = null,
  lockedUntil = null,
}: PinSheetProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  useScreenshotBlock(visible);
  const covered = useBackgroundCover(visible);

  // Clear the digits when the sheet reopens or after a wrong PIN.
  const resetKey = `${visible}-${triesLeft ?? 'none'}`;
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPin('');
  }

  const error = lockedUntil
    ? t('pinSheet.locked', { time: lockedUntil })
    : triesLeft !== null
      ? t('pinSheet.wrong', { count: triesLeft })
      : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onCancel}
      title={t('pinSheet.title')}
      dismissible={!checking}
      dialogWidth={400}
    >
      {covered ? <View style={styles.cover} /> : null}
      <View style={covered ? styles.hidden : styles.body}>
        <Txt variant="secondary" color="textSecondary">
          {actionTitle}
        </Txt>
        <PinPad
          value={pin}
          onChange={setPin}
          onComplete={onSubmit}
          error={!!error && pin.length === 0}
          disabled={checking || !!lockedUntil}
        />
        <View style={styles.status} accessibilityLiveRegion="assertive">
          {checking ? (
            <Txt variant="secondary" color="textSecondary" align="center">
              {t('pinSheet.checking')}
            </Txt>
          ) : null}
          {error && !checking ? (
            <Txt variant="secondary" color="textDanger" align="center">
              {error}
            </Txt>
          ) : null}
          {Platform.OS === 'web' ? (
            <Txt variant="caption" color="textSecondary" align="center">
              {t('pinSheet.keyboardHint')}
            </Txt>
          ) : null}
        </View>
        <View style={styles.center}>
          <Button variant="text" label={t('pinSheet.forgot')} onPress={onForgot} />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  status: { minHeight: 24, gap: space.s1 },
  center: { alignItems: 'center' },
  body: { gap: space.s3 },
  hidden: { display: 'none' },
  cover: { minHeight: 360 },
});
