// The second step of a developer action (D28): the developer types the exact name of the account or
// group before the destructive button works. The API's error, if any, is shown here in the current
// language and the sheet stays open.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space } from '@/theme';
import { BottomSheet, Button, TextField, Txt, useLang } from '@/ui';
import { errorMessage } from '@/features/errors/errorMessage';

interface TypeNameSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  /** "Type « name » to confirm". */
  prompt: string;
  fieldLabel: string;
  /** What has to be typed. */
  name: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  pending: boolean;
  error: unknown;
}

const clean = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function TypeNameSheet({
  visible,
  onClose,
  title,
  body,
  prompt,
  fieldLabel,
  name,
  confirmLabel,
  onConfirm,
  pending,
  error,
}: TypeNameSheetProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const [typed, setTyped] = useState('');
  const matches = clean(typed) === clean(name) && clean(name).length > 0;

  const close = () => {
    setTyped('');
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={title}
      dismissible={!pending}
      footer={
        <View style={styles.footer}>
          <Button
            fullWidth
            variant="destructive"
            label={confirmLabel}
            disabled={!matches}
            loading={pending}
            onPress={async () => {
              try {
                await onConfirm();
                setTyped('');
              } catch {
                // The error is shown below; the sheet stays open.
              }
            }}
          />
          <Button fullWidth variant="text" label={t('common.actions.cancel')} onPress={close} />
        </View>
      }
    >
      <View style={styles.body}>
        <Txt>{body}</Txt>
        <TextField
          label={fieldLabel}
          helper={prompt}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          error={error ? errorMessage(error, t, lang) : null}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.s4 },
  footer: { gap: space.s2 },
});
