// Moi: change my payment number (S-30, R13) and delete my account (S-39, PRV-03). Each prepares a
// card on the server and the member confirms it with their PIN; the app never changes either by
// itself. The new number is typed here once and sealed on the server: it is not shown again in full.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Operator } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { signOut } from '@/api/session';
import { useConnectivity } from '@/state/connectivity';
import { useSession } from '@/state/session';
import { space } from '@/theme';
import { Button, ChoiceRow, MaskedNumber, PhoneField, Txt, useLang } from '@/ui';
import {
  refreshSelf,
  useChangeNumberRequest,
  useDeleteAccountRequest,
} from '@/features/account/useAccount';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';

/** How long withdrawals to a new number wait unless the group voted otherwise (R13.5). */
const DEFAULT_HOLD_HOURS = 48;

export function ChangeNumberSheet({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const user = useSession((s) => s.user);
  const online = useConnectivity((s) => s.online);
  const request = useChangeNumberRequest();
  const [number, setNumber] = useState<string | null>(null);
  const [detected, setDetected] = useState<Operator | null>(null);
  const [chosen, setChosen] = useState<'MTN' | 'ORANGE' | null>(null);
  const [action, setAction] = useState<PendingActionDto | null>(null);

  if (action) {
    return (
      <ActionCard
        action={action}
        onConfirmed={() => {
          void refreshSelf().finally(onDone);
        }}
        onCancelled={() => setAction(null)}
        onClose={onDone}
      />
    );
  }

  const unknown = number !== null && detected === 'UNKNOWN';
  const operator = unknown ? chosen : null;
  const ready = number !== null && (!unknown || chosen !== null);

  return (
    <View style={styles.column}>
      {user?.paymentNumber ? (
        <View style={styles.row}>
          <Txt variant="secondary" color="textSecondary">
            {t('paymentNumber.current')}
          </Txt>
          <MaskedNumber
            e164={user.paymentNumber.number}
            variant="secondary"
            color="textSecondary"
          />
        </View>
      ) : null}
      <PhoneField
        label={t('paymentNumber.newLabel')}
        onChange={(e164, op) => {
          setNumber(e164);
          setDetected(op);
          setChosen(null);
        }}
      />
      {unknown ? (
        <>
          <Txt variant="secondary" color="textSecondary">
            {t('signup.paymentNumber.unknownOperator')}
          </Txt>
          {(['MTN', 'ORANGE'] as const).map((name) => (
            <ChoiceRow
              key={name}
              label={t(`common.operators.${name}`)}
              selected={chosen === name}
              onPress={() => setChosen(name)}
            />
          ))}
        </>
      ) : null}
      <Txt variant="secondary" color="textSecondary">
        {t('paymentNumber.holdWarning', { hours: DEFAULT_HOLD_HOURS })}
      </Txt>
      <Txt variant="secondary" color="textSecondary">
        {t('paymentNumber.allGroups')} {t('paymentNumber.inProgress')}
      </Txt>
      <Txt variant="secondary" color="textSecondary">
        {t('paymentNumber.notify')}
      </Txt>
      {request.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(request.error, t, lang)}
        </Txt>
      ) : null}
      <Button
        fullWidth
        label={t('paymentNumber.prepare')}
        loading={request.isPending}
        offline={!online}
        disabled={!ready || request.isPending}
        onPress={() => {
          if (!number) return;
          request.mutate(
            { number, ...(operator ? { operator } : {}) },
            { onSuccess: (prepared) => setAction(prepared) },
          );
        }}
      />
    </View>
  );
}

export function DeleteAccountSheet({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const request = useDeleteAccountRequest();
  const [action, setAction] = useState<PendingActionDto | null>(null);

  if (action) {
    return (
      <ActionCard
        action={action}
        // The account is gone: every session was closed by the server, close this one too.
        onConfirmed={() => {
          void signOut();
        }}
        onCancelled={() => setAction(null)}
        onClose={onDone}
      />
    );
  }

  return (
    <View style={styles.column}>
      <Txt>{t('privacy.delete.conditions')}</Txt>
      <Txt variant="secondary" color="textSecondary">
        {t('privacy.delete.what')}
      </Txt>
      {request.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(request.error, t, lang)}
        </Txt>
      ) : null}
      <Button
        fullWidth
        variant="destructive"
        label={t('privacy.delete.action')}
        loading={request.isPending}
        offline={!online}
        onPress={() => request.mutate(undefined, { onSuccess: (prepared) => setAction(prepared) })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
