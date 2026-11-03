// Chat message (spec 1.5; DESIGN_SYSTEM.md 5.23). Radius 12, no tails. Own messages right on
// bubbleOwn; others left on bubbleOther with name and avatar on the first of a run; the agent in the
// group has no fill, a 1 px border, the RingMark and "Njangi · Assistant".
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ban, Check, CircleAlert, Clock, EyeOff } from 'lucide-react-native';
import { contentWidth, radius, space, useTheme } from '@/theme';
import { Avatar } from '../identity/Avatar';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export type MessageAuthor = 'own' | 'other' | 'agent';
export type DeliveryState = 'sent' | 'queued' | 'failed';

export interface MessageBubbleProps {
  author: MessageAuthor;
  /** Author's name (others and agent); shown on the first message of a run. */
  name?: string;
  firstOfRun?: boolean;
  /** Formatted time ("18:02"). */
  time: string;
  /** Text with @mentions already split out: strings and { mention } parts. */
  parts?: Array<string | { mention: string }>;
  /** Media or document block rendered above the text. */
  media?: ReactNode;
  reply?: { name: string; text: string; onPress?: () => void };
  deleted?: boolean;
  hidden?: boolean;
  delivery?: DeliveryState;
  onRetry?: () => void;
  onLongPress?: () => void;
  onMentionPress?: (name: string) => void;
  /** Agent in the group: the "Ouvrir" button for the member it answered privately. */
  footer?: ReactNode;
}

export function MessageBubble(p: MessageBubbleProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const own = p.author === 'own';
  const agent = p.author === 'agent';
  const text = (p.parts ?? []).map((part) => (typeof part === 'string' ? part : `@${part.mention}`)).join('');
  const a11y = own ? t('chat.message.a11yOwn', { time: p.time, text }) : t('chat.message.a11y', { name: p.name ?? '', time: p.time, text });

  if (p.deleted || p.hidden) {
    const Glyph = p.deleted ? Ban : EyeOff;
    return (
      <View style={[styles.lane, own && styles.laneOwn]}>
        <View style={styles.placeholder}>
          <Glyph size={16} color={colors.iconSecondary} strokeWidth={2} />
          <Txt variant="secondary" color="textSecondary">
            {p.hidden ? t('chat.message.hidden') : own ? t('chat.message.deletedOwn') : t('chat.message.deleted')}
          </Txt>
        </View>
      </View>
    );
  }

  const bubble = (
    <View
      style={[
        styles.bubble,
        agent
          ? { borderWidth: 1, borderColor: colors.divider }
          : { backgroundColor: own ? colors.bubbleOwn : colors.bubbleOther },
      ]}
    >
      {p.reply ? (
        <Touchable onPress={p.reply.onPress} disabled={!p.reply.onPress} accessibilityRole="button" accessibilityLabel={t('chat.message.replyTo', { name: p.reply.name })}>
          <View style={[styles.quote, { backgroundColor: own ? colors.surfaceTint : colors.canvas }]}>
            <Txt variant="captionStrong" color="textLink">{p.reply.name}</Txt>
            <Txt variant="caption" color="textSecondary" numberOfLines={1}>{p.reply.text}</Txt>
          </View>
        </Touchable>
      ) : null}
      {p.media}
      {p.parts?.length ? (
        <Txt selectable>
          {p.parts.map((part, i) =>
            typeof part === 'string' ? (
              part
            ) : (
              <Txt key={i} variant="bodyStrong" color="textLink" onPress={() => p.onMentionPress?.(part.mention)}>
                {`@${part.mention}`}
              </Txt>
            ),
          )}
        </Txt>
      ) : null}
      <View style={styles.meta}>
        <Txt variant="caption" color="textSecondary">{p.time}</Txt>
        {own && p.delivery === 'queued' ? <Clock size={14} color={colors.iconSecondary} strokeWidth={2} /> : null}
        {own && (p.delivery ?? 'sent') === 'sent' ? <Check size={14} color={colors.iconSecondary} strokeWidth={2} /> : null}
      </View>
      {p.footer}
    </View>
  );

  return (
    <View style={[styles.lane, own && styles.laneOwn]} accessible accessibilityLabel={a11y}>
      {!own ? <View style={styles.avatarSlot}>{p.firstOfRun ? <Avatar size={32} name={p.name} agent={agent} /> : null}</View> : null}
      <View style={[styles.column, own && styles.columnOwn]}>
        {!own && p.firstOfRun ? (
          <View style={styles.nameRow}>
            <Txt variant="secondaryStrong" color={agent ? 'textLink' : 'textPrimary'}>{p.name}</Txt>
            {agent ? <Txt variant="caption" color="textSecondary">{t('agent.group.caption')}</Txt> : null}
          </View>
        ) : null}
        <Touchable onLongPress={p.onLongPress} disabled={!p.onLongPress} pressedLayer={null} hoverLayer={null} accessibilityRole="text">
          {bubble}
        </Touchable>
        {own && p.delivery === 'failed' ? (
          <Touchable onPress={p.onRetry} accessibilityRole="button" accessibilityLabel={t('chat.message.failed')}>
            <View style={styles.failed}>
              <CircleAlert size={16} color={colors.statusLate} strokeWidth={2} />
              <Txt variant="secondary" color="textDanger">{t('chat.message.failed')}</Txt>
            </View>
          </Touchable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lane: { flexDirection: 'row', paddingHorizontal: space.s4, gap: space.s2 },
  laneOwn: { justifyContent: 'flex-end' },
  avatarSlot: { width: 32 },
  column: { maxWidth: '80%', gap: 2 },
  columnOwn: { alignItems: 'flex-end' },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.s1 },
  bubble: { borderRadius: radius.group, paddingHorizontal: space.s3, paddingVertical: space.s2, gap: space.s1, maxWidth: contentWidth.bubble },
  quote: { borderRadius: radius.group, padding: space.s2 },
  meta: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 2 },
  placeholder: { flexDirection: 'row', alignItems: 'center', gap: space.s1, paddingVertical: space.s1 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: space.s1, paddingVertical: space.s1 },
});
