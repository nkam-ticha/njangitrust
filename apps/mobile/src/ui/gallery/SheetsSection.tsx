// Gallery: bottom sheet (phone) / dialog (wide), the withdraw sheet with the Ndop band, the PIN
// sheet and the member mini-profile (DESIGN_SYSTEM.md 5.10, 5.11, 5.25, 5.27).
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space } from '@/theme';
import { BottomSheet } from '../sheets/BottomSheet';
import { PinSheet } from '../sheets/PinSheet';
import { MemberProfileSheet } from '../members/MemberProfileSheet';
import { NdopBand } from '../brand/NdopBand';
import { AmountText } from '../money/AmountText';
import { AmountInput } from '../inputs/AmountInput';
import { Button } from '../buttons/Button';
import { Txt } from '../primitives/Txt';
import { GallerySection } from './GallerySection';

type Open = 'withdraw' | 'pin' | 'pinWrong' | 'profile' | null;

export function SheetsSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Open>(null);
  const [amount, setAmount] = useState<number | null>(80840);
  const close = () => setOpen(null);

  return (
    <GallerySection title="BottomSheet / PinSheet / MemberProfileSheet / NdopBand">
      <NdopBand height={32} />
      <NdopBand height={48} />
      <View style={{ paddingHorizontal: space.s4, gap: space.s2 }}>
        <Button
          variant="secondary"
          label={t('withdraw.title', { round: 4 })}
          onPress={() => setOpen('withdraw')}
        />
        <Button variant="secondary" label={t('pinSheet.title')} onPress={() => setOpen('pin')} />
        <Button
          variant="secondary"
          label={t('pinSheet.wrong', { count: 2 })}
          onPress={() => setOpen('pinWrong')}
        />
        <Button
          variant="secondary"
          label={t('memberProfile.a11y', { name: 'Carine Fotso' })}
          onPress={() => setOpen('profile')}
        />
      </View>

      <BottomSheet
        visible={open === 'withdraw'}
        onClose={close}
        title={t('withdraw.title', { round: 4 })}
        topSlot={<NdopBand height={32} />}
        dialogWidth={520}
        footer={<Button fullWidth label={t('withdraw.prepare')} onPress={close} />}
      >
        <Txt variant="secondary" color="textSecondary">
          {t('withdraw.available')}
        </Txt>
        <AmountText amount={81340} size="display" align="left" />
        <AmountInput
          label={t('withdraw.amountLabel')}
          value={amount}
          onChange={setAmount}
          min={100}
          max={80840}
          quick={[{ label: t('withdraw.all'), amount: 80840 }]}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt>{t('withdraw.fee')}</Txt>
          <AmountText amount={500} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt variant="bodyStrong">{t('withdraw.fromBalance')}</Txt>
          <AmountText amount={81340} size="total" />
        </View>
        <Txt
          variant="secondary"
          color="textSecondary"
        >{`${t('withdraw.to', { operator: 'MTN', number: '6•• •• •3 21' })}. ${t('withdraw.partialNote')}`}</Txt>
      </BottomSheet>

      <PinSheet
        visible={open === 'pin'}
        actionTitle={t('confirmation.actions.changePaymentNumber.title')}
        onSubmit={close}
        onCancel={close}
        onForgot={close}
      />
      <PinSheet
        visible={open === 'pinWrong'}
        actionTitle={t('confirmation.actions.changePaymentNumber.title')}
        onSubmit={() => {}}
        onCancel={close}
        onForgot={close}
        triesLeft={2}
      />

      <MemberProfileSheet
        visible={open === 'profile'}
        onClose={close}
        onPrevious={() => {}}
        onNext={() => {}}
        profile={{
          name: 'Carine Fotso',
          isMe: false,
          isAdmin: false,
          isBeneficiary: true,
          roundStatus: 'paid',
          paidDate: '3 nov.',
          turn: { round: 4, date: 'samedi 7 novembre' },
          servedRound: null,
          reliability: { score: 92, onTime: 11, due: 12, window: 12 },
          memberSince: 'octobre 2026',
        }}
      />
    </GallerySection>
  );
}
