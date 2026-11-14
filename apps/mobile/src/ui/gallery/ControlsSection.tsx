// Gallery: buttons and inputs in every state (DESIGN_SYSTEM.md 5.1, 5.2).
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react-native';
import { space } from '@/theme';
import { Button } from '../buttons/Button';
import { TextField } from '../inputs/TextField';
import { PhoneField } from '../inputs/PhoneField';
import { AmountInput } from '../inputs/AmountInput';
import { Slider } from '../inputs/Slider';
import { ChoiceRow } from '../inputs/ChoiceRow';
import { SwitchRow } from '../inputs/SwitchRow';
import { PinPad } from '../inputs/PinPad';
import { DateField } from '../inputs/DateField';
import { TimeField } from '../inputs/TimeField';
import { GallerySection, Specimen } from './GallerySection';

export function ControlsSection() {
  const { t } = useTranslation();
  const [loan, setLoan] = useState(30000);
  const [withdraw, setWithdraw] = useState<number | null>(80840);
  const [operator, setOperator] = useState<'MTN' | 'ORANGE'>('MTN');
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState('123');
  const [day, setDay] = useState<string | null>('2026-11-28');
  const [time, setTime] = useState<string | null>('18:00');
  const [mute, setMute] = useState(false);
  const pay = t('confirmation.actions.pay.button', { amount: '11 000 FCFA' });

  return (
    <>
      <GallerySection title="Button">
        <Specimen label="primary / secondary / destructive / text">
          <Button label={pay} onPress={() => {}} />
          <Button variant="secondary" label={t('votes.card.yes')} onPress={() => {}} />
          <Button variant="destructive" label={t('privacy.delete.action')} onPress={() => {}} />
          <Button variant="text" label={t('common.actions.cancel')} onPress={() => {}} />
        </Specimen>
        <Specimen label="icon / loading / disabled / offline / full width">
          <Button
            variant="secondary"
            icon={Download}
            label={t('caisse.ledger.export')}
            onPress={() => {}}
          />
          <Button label={pay} loading />
          <Button label={pay} disabled />
          <Button label={pay} offline />
          <View style={{ alignSelf: 'stretch' }}>
            <Button label={pay} fullWidth onPress={() => {}} />
          </View>
        </Specimen>
      </GallerySection>

      <GallerySection title="Inputs">
        <View style={{ paddingHorizontal: space.s4, gap: space.s5 }}>
          <TextField
            label={t('signup.name.label')}
            placeholder={t('signup.name.placeholder')}
            helper={t('signup.name.help')}
          />
          <TextField
            label={t('signup.name.label')}
            defaultValue="C"
            error={t('errors.validation.nameTooShort')}
          />
          <PhoneField
            label={t('signup.paymentNumber.label')}
            helper={t('signup.paymentNumber.help')}
            initialDigits="699001122"
            onChange={() => {}}
          />
          <PhoneField
            label={t('login.phoneLabel')}
            error={t('errors.validation.phoneInvalid')}
            initialDigits="512"
            onChange={() => {}}
          />
          <AmountInput
            label={t('withdraw.amountLabel')}
            value={withdraw}
            onChange={setWithdraw}
            min={100}
            max={80840}
            helper={t('withdraw.partialNote')}
            quick={[{ label: t('withdraw.all'), amount: 80840 }]}
          />
          <AmountInput
            label={t('loans.request.amount')}
            value={loan}
            onChange={(v) => setLoan(v ?? 0)}
            min={1000}
            max={30000}
          />
          <Slider
            value={loan}
            min={1000}
            max={30000}
            onChange={setLoan}
            accessibilityLabel={t('loans.request.amount')}
          />
          <View style={{ gap: space.s2 }}>
            <ChoiceRow
              label="MTN"
              selected={operator === 'MTN'}
              onPress={() => setOperator('MTN')}
            />
            <ChoiceRow
              label="Orange"
              selected={operator === 'ORANGE'}
              onPress={() => setOperator('ORANGE')}
            />
            <ChoiceRow
              kind="check"
              label={t('signup.consent.checkbox')}
              selected={consent}
              onPress={() => setConsent(!consent)}
            />
          </View>
          <DateField
            label={t('createGroup.schedule.firstPayout')}
            value={day}
            onChange={setDay}
            today="2026-11-05"
            minDay="2026-11-05"
          />
          <TimeField label={t('createGroup.schedule.time')} value={time} onChange={setTime} />
        </View>
        <SwitchRow
          label={t('notifications.settings.muteChat')}
          helper={t('notifications.settings.muteChatHelp')}
          value={mute}
          onChange={setMute}
        />
        <SwitchRow
          label={t('notifications.categories.SECURITY')}
          helper={t('notifications.settings.securityLocked')}
          value
          disabled
        />
        <Specimen label="PinPad: entering / error">
          <PinPad value={pin} onChange={setPin} />
          <PinPad value="" onChange={() => {}} error />
        </Specimen>
      </GallerySection>
    </>
  );
}
