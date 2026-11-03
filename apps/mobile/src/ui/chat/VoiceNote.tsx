// Voice note player (spec 1.5; DESIGN_SYSTEM.md 5.23, DD-23): play/pause disc, a progress track
// (not a waveform), the duration, and a speed pill cycling 1× → 1,5× → 2×. Presentational: the
// screen drives it with expo-audio.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react-native';
import { radius, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export type VoiceSpeed = 1 | 1.5 | 2;

interface VoiceNoteProps {
  playing: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  speed: VoiceSpeed;
  onToggle: () => void;
  onSpeed: (next: VoiceSpeed) => void;
  /** Sender's name, or null for the member's own note. */
  from: string | null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const NEXT: Record<VoiceSpeed, VoiceSpeed> = { 1: 1.5, 1.5: 2, 2: 1 };
const SPEED_KEY = { 1: 'x1', 1.5: 'x15', 2: 'x2' } as const;

export function VoiceNote({ playing, position, duration, speed, onToggle, onSpeed, from }: VoiceNoteProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const ratio = duration > 0 ? Math.min(1, position / duration) : 0;
  const speedLabel = t(`chat.voice.speeds.${SPEED_KEY[speed]}`);
  return (
    <View style={styles.row} accessibilityLabel={from ? t('chat.voice.a11y', { name: from, duration: clock(duration) }) : t('chat.voice.a11yOwn', { duration: clock(duration) })}>
      <Touchable onPress={onToggle} radius={radius.full} accessibilityRole="button" accessibilityLabel={playing ? t('chat.voice.pause') : t('chat.voice.play')}>
        <View style={[styles.play, { backgroundColor: colors.primary }]}>
          {playing ? <Pause size={20} color={colors.textOnPrimary} strokeWidth={2} /> : <Play size={20} color={colors.textOnPrimary} strokeWidth={2} />}
        </View>
      </Touchable>
      <View
        style={[styles.track, { backgroundColor: colors.outline }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('chat.voice.position', { elapsed: clock(position), duration: clock(duration) })}
      >
        <View style={[styles.played, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]} />
        <View style={[styles.thumb, { left: `${ratio * 100}%`, backgroundColor: colors.primary }]} />
      </View>
      <Txt variant="caption" color="textSecondary" style={styles.time}>{clock(playing || position > 0 ? position : duration)}</Txt>
      <Touchable onPress={() => onSpeed(NEXT[speed])} radius={radius.full} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('chat.voice.speed', { speed: speedLabel })}>
        <View style={[styles.speed, { borderColor: colors.outline }]}>
          <Txt variant="captionStrong">{speedLabel}</Txt>
        </View>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3, minWidth: 220 },
  play: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 4, borderRadius: radius.full },
  played: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.full },
  thumb: { position: 'absolute', top: -4, width: 12, height: 12, marginLeft: -6, borderRadius: radius.full },
  time: { minWidth: 32 },
  speed: { minHeight: 28, minWidth: 40, borderRadius: radius.full, borderWidth: 1, paddingHorizontal: space.s2, alignItems: 'center', justifyContent: 'center' },
});
