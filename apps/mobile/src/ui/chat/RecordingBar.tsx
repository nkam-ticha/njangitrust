// The composer while a voice note is being recorded (spec 1.5, DESIGN_SYSTEM.md 5.23): a cancel
// button, a pulsing dot with the time and a live waveform, and a button that stops and sends.
// When the 3 minute limit is reached the note is ready and the bar says so.
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SendHorizontal, Trash2 } from 'lucide-react-native';
import { radius, size, space, useReduceMotion, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import { VoiceBars } from '../agent/VoiceBars';

interface RecordingBarProps {
  seconds: number;
  /** The limit was reached: the note is ready, nothing more is recorded. */
  ready: boolean;
  onCancel: () => void;
  onSend: () => void;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function RecordingBar({ seconds, ready, onCancel, onSend }: RecordingBarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const reduce = useReduceMotion();
  const dot = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (reduce || ready) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dot, ready, reduce]);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Touchable
          onPress={onCancel}
          radius={radius.full}
          accessibilityRole="button"
          accessibilityLabel={t('chat.voice.cancel')}
          style={styles.round}
        >
          <View style={styles.roundInner}>
            <Trash2 size={24} color={colors.statusLate} strokeWidth={2} />
          </View>
        </Touchable>
        <View
          style={[styles.pill, { backgroundColor: colors.surfaceTint }]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={
            ready
              ? t('chat.voice.maxReached')
              : t('chat.voice.recording', { duration: clock(seconds) })
          }
        >
          <Animated.View
            style={[styles.dot, { backgroundColor: colors.statusLate, opacity: dot }]}
          />
          <Txt variant="bodyStrong">{clock(seconds)}</Txt>
          {ready ? (
            <Txt variant="secondary" color="textSecondary" style={styles.flex} numberOfLines={2}>
              {t('chat.voice.maxReached')}
            </Txt>
          ) : (
            <View style={styles.bars}>
              <VoiceBars active color={colors.iconActive} bars={9} height={22} />
            </View>
          )}
        </View>
        <Touchable
          onPress={onSend}
          radius={radius.full}
          accessibilityRole="button"
          accessibilityLabel={t('chat.voice.stopAndSend')}
          style={styles.round}
        >
          <View style={[styles.roundInner, { backgroundColor: colors.primary }]}>
            <SendHorizontal size={24} color={colors.textOnPrimary} strokeWidth={2} />
          </View>
        </Touchable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.s2, paddingBottom: space.s2, gap: space.s1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s1 },
  round: { width: size.touch, height: size.touch },
  roundInner: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    minHeight: size.touch,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingHorizontal: space.s4,
  },
  dot: { width: 10, height: 10, borderRadius: radius.full },
  bars: { flex: 1, alignItems: 'flex-end' },
  flex: { flex: 1 },
});
