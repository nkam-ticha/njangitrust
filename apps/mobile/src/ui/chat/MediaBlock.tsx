// Media inside a bubble (DESIGN_SYSTEM.md 5.23, 10.1, D9). On mobile data, images show their
// 320 px thumbnail (or a tinted block) with the size, and download on tap.
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Download, FileText, Image as ImageIcon, Play } from 'lucide-react-native';
import { radius, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export type MediaState = 'ready' | 'notDownloaded' | 'downloading' | 'failed';

interface VisualMediaProps {
  kind: 'image' | 'video';
  /** Full image or video poster when downloaded; else the thumbnail; else nothing. */
  source?: ImageSourcePropType | string | null;
  width: number;
  height: number;
  state: MediaState;
  /** Formatted file size ("240 Ko"). */
  sizeLabel: string;
  /** Formatted video duration ("0:42"). */
  durationLabel?: string;
  from: string;
  onPress: () => void;
}

export function VisualMedia({ kind, source, width, height, state, sizeLabel, durationLabel, from, onPress }: VisualMediaProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const w = Math.min(240, width);
  const h = Math.min(320, Math.round((w * height) / Math.max(1, width)));
  const label = kind === 'image' ? t('chat.media.photoA11y', { name: from }) : t('chat.media.videoA11y', { name: from, duration: durationLabel ?? '' });
  const overlay =
    state === 'notDownloaded' || state === 'failed' ? (
      <View style={styles.center}>
        <View style={[styles.disc, { backgroundColor: colors.scrim }]}>
          <Download size={20} color={colors.textOnPrimary} strokeWidth={2} />
        </View>
        <Txt variant="captionStrong" style={[styles.pill, { backgroundColor: colors.surfaceRaised }]}>
          {state === 'failed' ? t('errors.media.downloadFailed') : t('chat.media.tapToDownload', { size: sizeLabel })}
        </Txt>
      </View>
    ) : state === 'downloading' ? (
      <View style={styles.center}>
        <Txt variant="captionStrong" style={[styles.pill, { backgroundColor: colors.surfaceRaised }]}>{t('chat.media.downloading')}</Txt>
      </View>
    ) : kind === 'video' ? (
      <View style={styles.center}>
        <View style={[styles.playDisc, { backgroundColor: colors.scrim }]}>
          <Play size={24} color={colors.textOnPrimary} strokeWidth={2} />
        </View>
      </View>
    ) : null;

  return (
    <Touchable onPress={onPress} accessibilityRole={kind === 'image' ? 'imagebutton' : 'button'} accessibilityLabel={label} radius={radius.group}>
      <View style={[styles.frame, { width: w, height: h, backgroundColor: colors.surfaceTint }]}>
        {source ? (
          <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        ) : (
          <View style={styles.center}>
            <ImageIcon size={24} color={colors.iconSecondary} strokeWidth={2} />
          </View>
        )}
        {overlay}
        {kind === 'video' && durationLabel ? (
          <Txt variant="captionStrong" style={[styles.duration, { backgroundColor: colors.surfaceRaised }]}>{durationLabel}</Txt>
        ) : null}
      </View>
    </Touchable>
  );
}

interface DocumentProps {
  fileName: string;
  sizeLabel: string;
  onOpen: () => void;
}

export function DocumentAttachment({ fileName, sizeLabel, onOpen }: DocumentProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Touchable onPress={onOpen} accessibilityRole="button" accessibilityLabel={t('chat.media.documentA11y', { file: fileName, size: sizeLabel })} radius={radius.group}>
      <View style={styles.doc}>
        <FileText size={24} color={colors.iconPrimary} strokeWidth={2} />
        <View style={styles.flex}>
          <Txt variant="bodyStrong" numberOfLines={2}>{fileName}</Txt>
          <Txt variant="secondary" color="textSecondary">{`PDF, ${sizeLabel}`}</Txt>
        </View>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.group, overflow: 'hidden', maxWidth: '100%' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: space.s2 },
  disc: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  playDisc: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: radius.full, paddingHorizontal: space.s2, paddingVertical: 2, overflow: 'hidden' },
  duration: { position: 'absolute', left: space.s2, bottom: space.s2, borderRadius: radius.full, paddingHorizontal: space.s2, overflow: 'hidden' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingVertical: space.s1, minWidth: 200 },
  flex: { flex: 1, minWidth: 0 },
});
