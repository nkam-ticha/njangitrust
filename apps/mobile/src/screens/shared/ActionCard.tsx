// A live ConfirmationCard: server state, confirm (with the PIN sheet for L2 actions), cancel,
// realtime updates. Used inline in the Njangi tab and in sheets on screens (DESIGN_SYSTEM.md 5.21).
// Every confirmation in the app goes through this component, so the single-flight rule lives here:
// one tap sends one request, the card shows "sending" in the same moment, and a second tap (or the
// same card on another screen) joins that request instead of reaching the server.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { pick } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { useConnectivity } from '@/state/connectivity';
import { ConfirmationCard, PinSheet, Txt, useLang } from '@/ui';
import { space } from '@/theme';
import { pendingActionKey } from '@/features/pendingActions/actionState';
import { usePendingAction } from '@/features/pendingActions/usePendingAction';
import { errorCode, errorDetails, errorMessage, unlockTime } from '@/features/errors/errorMessage';

interface ActionCardProps {
  action: PendingActionDto;
  /**
   * Called once with the confirmation's result data (for example an invite link), and with the
   * confirmed action (its `result.ref` is the payment or withdrawal to follow).
   */
  onConfirmed?: (data: Record<string, unknown> | null, action?: PendingActionDto) => void;
  onCancelled?: () => void;
  onRetry?: () => void;
  onClose?: () => void;
  /** Called with the error code when the confirmation is refused (e.g. a feature not available yet). */
  onError?: (code: string) => void;
  operator?: string;
  maskedNumber?: string;
  /** Collapse a cancelled or expired card to one line (a card in the conversation's past). */
  compact?: boolean;
}

export function ActionCard({
  action: initial,
  onConfirmed,
  onCancelled,
  onRetry,
  onClose,
  onError,
  operator,
  maskedNumber,
  compact,
}: ActionCardProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const { action, confirm, cancel, confirming, error, resetError } = usePendingAction(initial);
  const qc = useQueryClient();
  const [pinOpen, setPinOpen] = useState(false);

  const code = errorCode(error);
  const pinError = code.startsWith('PIN_INCORRECT');
  const pinLocked = code === 'PIN_LOCKED';
  const attempts = errorDetails(error).attemptsLeft;

  const runConfirm = async (pin?: string): Promise<void> => {
    resetError();
    try {
      const data = await confirm(pin);
      setPinOpen(false);
      // The card is in the cache by now: the confirmed state, or the real state if the server had
      // already handled this card (then there is nothing new to follow up).
      const latest = qc.getQueryData<PendingActionDto>(pendingActionKey(initial.id));
      if (latest && (latest.status === 'CONFIRMED' || latest.status === 'DONE')) {
        onConfirmed?.(data, latest);
      }
    } catch (e) {
      // Shown below the card, or in the PIN sheet for PIN errors.
      onError?.(errorCode(e));
    }
  };

  return (
    <View style={styles.wrap}>
      <ConfirmationCard
        action={action}
        offline={!online}
        operator={operator}
        maskedNumber={maskedNumber}
        compact={compact}
        sending={confirming && !pinOpen}
        onConfirm={() => (action.requiresPin ? setPinOpen(true) : runConfirm())}
        onCancel={() =>
          cancel()
            .then(() => onCancelled?.())
            .catch(() => {})
        }
        onRetry={onRetry}
        onPrepareAgain={onRetry}
        onClose={onClose}
      />
      {error && !pinOpen ? (
        <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="assertive">
          {errorMessage(error, t, lang)}
        </Txt>
      ) : null}
      {action.requiresPin ? (
        <PinSheet
          visible={pinOpen}
          actionTitle={pick(action.preview.title, lang)}
          checking={confirming}
          triesLeft={
            pinError
              ? typeof attempts === 'number'
                ? attempts
                : code.endsWith('LAST_ATTEMPT')
                  ? 1
                  : 2
              : null
          }
          lockedUntil={pinLocked ? unlockTime(error, lang) : null}
          onSubmit={(pin) => void runConfirm(pin)}
          onCancel={() => {
            setPinOpen(false);
            resetError();
          }}
          onForgot={() => setPinOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s2, width: '100%', maxWidth: 440 },
});
