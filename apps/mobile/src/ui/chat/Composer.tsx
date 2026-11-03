// Composers (DESIGN_SYSTEM.md 5.23, 5.24). Group chat: attach, text, mic that becomes send.
// Njangi tab: text and send only; disabled offline and while rate-limited (DD-16).
// Web: Enter sends, Shift+Enter adds a line (8.5).
import { StyleSheet, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Mic, Paperclip, SendHorizontal } from 'lucide-react-native';
import { radius, size, space, typography, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

interface ComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  kind: 'chat' | 'agent';
  /** Chat only. */
  onAttach?: () => void;
  /** Chat only: tap-to-record (the accessible alternative to hold-to-record). */
  onVoice?: () => void;
  /** Agent only: replaces the placeholder (offline, rate limit). */
  disabledReason?: string | null;
  /** Shown above the field ("Réponse à Carine" with cancel). */
  replyTo?: { name: string; onCancel: () => void } | null;
}

export function Composer({ value, onChange, onSend, kind, onAttach, onVoice, disabledReason, replyTo }: ComposerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const disabled = !!disabledReason;
  const canSend = value.trim().length > 0 && !disabled;
  const onKey = (e: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>) => {
    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey && canSend) {
      e.preventDefault();
      onSend();
    }
  };

  const round = (Glyph: typeof Mic, label: string, onPress: (() => void) | undefined, filled = false) => (
    <Touchable onPress={onPress} disabled={!onPress || disabled} radius={radius.full} accessibilityRole="button" accessibilityLabel={label} style={styles.round}>
      <View style={[styles.roundInner, filled && { backgroundColor: colors.primary }]}>
        <Glyph size={24} color={filled ? colors.textOnPrimary : disabled ? colors.iconSecondary : colors.iconPrimary} strokeWidth={2} />
      </View>
    </Touchable>
  );

  return (
    <View style={styles.wrap}>
      {replyTo ? (
        <View style={[styles.reply, { backgroundColor: colors.surfaceTint }]}>
          <Txt variant="secondaryStrong" style={styles.flex}>{t('chat.message.replyTo', { name: replyTo.name })}</Txt>
          <Touchable onPress={replyTo.onCancel} accessibilityRole="button" accessibilityLabel={t('chat.message.cancelReply')}>
            <Txt variant="secondaryStrong" color="textLink">{t('common.actions.cancel')}</Txt>
          </Touchable>
        </View>
      ) : null}
      <View style={styles.row}>
        {kind === 'chat' ? round(Paperclip, t('chat.composer.attach'), onAttach) : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          multiline
          onKeyPress={onKey}
          placeholder={disabledReason ?? (kind === 'agent' ? t('agent.composer.placeholder') : t('chat.composer.placeholder'))}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={kind === 'agent' ? t('agent.composer.placeholder') : t('chat.composer.placeholder')}
          maxLength={1000}
          style={[typography.body, styles.input, { color: colors.textPrimary, borderColor: colors.outline, backgroundColor: disabled ? colors.disabledFill : 'transparent' }]}
        />
        {kind === 'chat' && !canSend
          ? round(Mic, t('chat.composer.voiceTap'), onVoice)
          : round(SendHorizontal, kind === 'agent' ? t('agent.composer.send') : t('chat.composer.send'), canSend ? onSend : undefined, canSend)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.s2, paddingBottom: space.s2, gap: space.s1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s1 },
  input: { flex: 1, minHeight: size.touch, maxHeight: 22 * 5 + 24, borderWidth: 1, borderRadius: radius.group, paddingHorizontal: 14, paddingVertical: 12, outlineWidth: 0 },
  round: { width: size.touch, height: size.touch },
  roundInner: { width: size.touch, height: size.touch, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  reply: { flexDirection: 'row', alignItems: 'center', gap: space.s2, borderRadius: radius.group, paddingHorizontal: space.s3, minHeight: 40 },
  flex: { flex: 1 },
});
