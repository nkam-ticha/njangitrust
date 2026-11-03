// ConfirmationCard (spec 1.5, 4.5; DESIGN_SYSTEM.md 5.21). Drawn from the server's PendingAction,
// never from the agent's text: the app shows `preview` in the member's language and never
// computes an amount. The verb carries through: Payer → Payé.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck, CircleSlash, Clock, Info, Lock, TimerOff } from 'lucide-react-native';
import { pick } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { duration, elevation, radius, space, useReduceMotion, useTheme } from '@/theme';
import { AmountText, amountLabel } from '../money/AmountText';
import { Button } from '../buttons/Button';
import { LabelBadge } from '../identity/Badge';
import { Txt } from '../primitives/Txt';
import { useLang } from '../primitives/useLang';
import { failureCopy } from './failureCopy';
import { doneVerb } from './doneVerb';

export interface ConfirmationCardProps {
  action: PendingActionDto;
  onConfirm: () => void;
  onCancel: () => void;
  /** Failed: prepares a new card. */
  onRetry?: () => void;
  /** Expired: prepares the same action again. */
  onPrepareAgain?: () => void;
  onViewLedger?: () => void;
  onClose?: () => void;
  offline?: boolean;
  /** "MTN" or "Orange", for processing and failure texts. */
  operator?: string;
  /** The member's masked number, for "Envoi vers ton numéro …". */
  maskedNumber?: string;
  /** Still waiting for the operator after 2 minutes. */
  stillWaiting?: boolean;
  /** The operator stayed silent for 10 minutes (keep checking 24 h). */
  operatorSilent?: boolean;
  /** Collapse cancelled and expired cards to one line once scrolled past (DD-17). */
  compact?: boolean;
  /** Current time, for the expiry note in the last two minutes. */
  now?: Date;
}

const PAYMENT_TYPES = ['pay', 'pay_debts', 'repay_loan'];
const DISBURSE_TYPES = ['withdraw'];

export function ConfirmationCard(props: ConfirmationCardProps) {
  const { action, onConfirm, onCancel, onRetry, onPrepareAgain, onViewLedger, onClose, offline, operator = 'Mobile Money', maskedNumber = '', stillWaiting, operatorSilent, compact, now } = props;
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const lang = useLang();
  const reduce = useReduceMotion();
  const { preview, status } = action;
  const title = pick(preview.title, lang);

  // State changes cross-fade in 160 ms (7.3); instant with reduce motion.
  const fade = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: duration.crossFade, useNativeDriver: true }).start();
  }, [status, reduce, fade]);

  const [clock, setClock] = useState(() => now ?? new Date());
  useEffect(() => {
    if (status !== 'PENDING' || now) return;
    const id = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(id);
  }, [status, now]);
  const minutesLeft = Math.ceil((new Date(action.expiresAt).getTime() - (now ?? clock).getTime()) / 60_000);

  if (compact && (status === 'CANCELLED' || status === 'EXPIRED')) {
    return (
      <View style={[styles.compact, { borderColor: colors.divider }]}>
        <Txt variant="secondary" color="textSecondary">
          {`${title} · ${status === 'CANCELLED' ? t('confirmation.cancelled.title') : t('confirmation.expired.title')}`}
        </Txt>
      </View>
    );
  }

  const icon = (Glyph: typeof CircleCheck, color: string) => <Glyph size={24} color={color} strokeWidth={2} />;
  const failure = status === 'FAILED' && action.failure ? failureCopy(action.failure, t, lang, { operator }) : null;
  const header =
    status === 'DONE' ? { icon: icon(CircleCheck, colors.statusPaid), text: doneVerb(action.type, t) ?? (action.result?.summary ? pick(action.result.summary, lang) : t('common.actions.done')) }
    : status === 'FAILED' ? { icon: icon(CircleAlert, colors.statusLate), text: failure?.title ?? t('confirmation.failed.generic.title') }
    : status === 'EXPIRED' ? { icon: icon(TimerOff, colors.iconSecondary), text: t('confirmation.expired.title') }
    : status === 'CANCELLED' ? { icon: icon(CircleSlash, colors.iconSecondary), text: t('confirmation.cancelled.title') }
    : status === 'CONFIRMED' && operatorSilent ? { icon: icon(Clock, colors.statusPending), text: t('confirmation.pendingLate.title', { operator }) }
    : { icon: null, text: title };

  const processingText = PAYMENT_TYPES.includes(action.type)
    ? t('confirmation.processing.payment', { operator })
    : DISBURSE_TYPES.includes(action.type)
      ? t('confirmation.processing.withdrawal', { number: maskedNumber })
      : t('confirmation.processing.generic');

  return (
    <View
      accessibilityLabel={t('confirmation.a11y.card', { title })}
      style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.divider }, elevation('card', colors, scheme)]}
    >
      <View style={styles.head}>
        {header.icon}
        <Txt variant="sectionTitle" accessibilityRole="header" style={styles.flex}>{header.text}</Txt>
      </View>
      {action.requiresPin && status === 'PENDING' ? <LabelBadge icon={Lock} label={t('confirmation.pinRequired')} /> : null}

      {preview.lines.map((line, i) => (
        <View key={i} style={styles.line} accessible accessibilityLabel={t('confirmation.a11y.line', { label: pick(line.label, lang), words: amountLabel(line.amount, lang) })}>
          <Txt style={styles.flex}>{pick(line.label, lang)}</Txt>
          <AmountText amount={line.amount} />
        </View>
      ))}
      {preview.total !== null ? (
        <View style={[styles.line, styles.total, { borderTopColor: colors.divider }]} accessible accessibilityLabel={t('confirmation.a11y.total', { words: amountLabel(preview.total, lang) })}>
          <Txt variant="bodyStrong" style={styles.flex}>{t('confirmation.lines.total')}</Txt>
          <AmountText amount={preview.total} size="total" />
        </View>
      ) : null}

      <Animated.View style={[styles.stateBlock, { opacity: fade }]} accessibilityLiveRegion={status === 'FAILED' ? 'assertive' : 'polite'}>
        {status === 'PENDING' ? (
          <>
            {preview.notes.map((note, i) => (
              <View key={i} style={styles.note}>
                <Info size={16} color={colors.iconSecondary} strokeWidth={2} />
                <Txt variant="secondary" color="textSecondary" style={styles.flex}>{pick(note, lang)}</Txt>
              </View>
            ))}
            {minutesLeft > 0 && minutesLeft <= 2 ? (
              <Txt variant="secondary" color="textSecondary">{t('confirmation.notes.expiresSoon', { duration: t('time.duration.minutes', { count: minutesLeft }) })}</Txt>
            ) : null}
            <View style={styles.actions}>
              <Button variant="text" label={t('confirmation.buttons.cancel')} onPress={onCancel} />
              <Button label={pick(preview.confirmLabel, lang)} onPress={onConfirm} offline={offline} style={styles.flex} fullWidth />
            </View>
          </>
        ) : null}

        {status === 'CONFIRMED' && !operatorSilent ? (
          <View style={styles.status}>
            <ActivityIndicator size="small" color={colors.statusPending} />
            <View style={styles.flex}>
              <Txt variant="bodyStrong">{processingText}</Txt>
              {PAYMENT_TYPES.includes(action.type) ? <Txt variant="secondary" color="textSecondary">{t('confirmation.processing.paymentHelp', { operator })}</Txt> : null}
              {stillWaiting ? <Txt variant="secondary" color="textSecondary">{t('confirmation.processing.stillWaiting', { operator })}</Txt> : null}
            </View>
          </View>
        ) : null}
        {status === 'CONFIRMED' && operatorSilent ? (
          <>
            <Txt variant="secondary" color="textSecondary">{t('confirmation.pendingLate.body')}</Txt>
            {onClose ? <Button variant="text" label={t('confirmation.buttons.close')} onPress={onClose} /> : null}
          </>
        ) : null}

        {status === 'DONE' ? (
          <View style={styles.doneRow}>
            {action.result?.ref ? <Txt variant="secondary" color="textSecondary" selectable style={styles.flex}>{t('common.reference', { ref: action.result.ref })}</Txt> : <View style={styles.flex} />}
            {onViewLedger ? <Button variant="text" label={t('confirmation.buttons.viewLedger')} onPress={onViewLedger} /> : null}
          </View>
        ) : null}

        {status === 'FAILED' ? (
          <>
            <View style={[styles.failBox, { backgroundColor: colors.dangerTint }]}>
              <Txt>{failure?.body ?? t('confirmation.failed.generic.body')}</Txt>
            </View>
            <View style={styles.actions}>
              {onClose ? <Button variant="text" label={t('confirmation.buttons.close')} onPress={onClose} /> : null}
              {onRetry ? <Button label={t('confirmation.buttons.retry')} onPress={onRetry} offline={offline} style={styles.flex} fullWidth /> : null}
            </View>
          </>
        ) : null}

        {status === 'EXPIRED' ? (
          <>
            <Txt variant="secondary" color="textSecondary">{t('confirmation.expired.body')}</Txt>
            {onPrepareAgain ? <Button variant="secondary" label={t('confirmation.buttons.prepareAgain')} onPress={onPrepareAgain} offline={offline} /> : null}
          </>
        ) : null}
        {status === 'CANCELLED' ? <Txt variant="secondary" color="textSecondary">{t('confirmation.cancelled.body')}</Txt> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.sheet, borderWidth: 1, padding: space.s5, gap: space.s3, maxWidth: 440, width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space.s3 },
  total: { borderTopWidth: 1, paddingTop: space.s3 },
  stateBlock: { gap: space.s3, marginTop: space.s1 },
  note: { flexDirection: 'row', gap: space.s2, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, alignItems: 'center', marginTop: space.s1 },
  status: { flexDirection: 'row', gap: space.s3, alignItems: 'flex-start' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  failBox: { borderRadius: radius.group, padding: space.s3 },
  compact: { borderWidth: 1, borderRadius: radius.group, paddingHorizontal: space.s4, paddingVertical: space.s2, alignSelf: 'stretch' },
  flex: { flex: 1 },
});
