// A live ConfirmationCard: server state, confirm (with the PIN sheet for L2 actions), cancel,
// realtime updates. Used inline in the Njangi tab and in sheets on screens (DESIGN_SYSTEM.md 5.21).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { pick } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { useConnectivity } from '@/state/connectivity';
import { ConfirmationCard, PinSheet, Txt, useLang } from '@/ui';
import { space } from '@/theme';
import { usePendingAction } from '@/features/pendingActions/usePendingAction';
import { errorCode, errorDetails, errorMessage, unlockTime } from '@/features/errors/errorMessage';

interface ActionCardProps {
  action: PendingActionDto;
  /** Called once with the confirmation's result data (for example an invite link). */
  onConfirmed?: (data: Record<string, unknown> | null) => void;
  onCancelled?: () => void;
  onRetry?: () => void;
  onClose?: () => void;
  /** Called with the error code when the confirmation is refused (e.g. a feature not available yet). */
  onError?: (code: string) => void;
  operator?: string;
  maskedNumber?: string;
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
}: ActionCardProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const { action, confirm, cancel, confirming, error, resetError } = usePendingAction(initial);
  const [pinOpen, setPinOpen] = useState(false);

  const code = errorCode(error);
  const pinError = code.startsWith('PIN_INCORRECT');
  const pinLocked = code === 'PIN_LOCKED';
  const attempts = errorDetails(error).attemptsLeft;

  const runConfirm = async (pin?: string) => {
    resetError();
    try {
      const data = await confirm(pin);
      setPinOpen(false);
      onConfirmed?.(data);
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
        onConfirm={() => (action.requiresPin ? setPinOpen(true) : void runConfirm())}
        onCancel={() => {
          void cancel()
            .then(() => onCancelled?.())
            .catch(() => {});
        }}
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
