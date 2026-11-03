// A payment number (spec 1.5, DESIGN_SYSTEM.md 5.18): masked as `6•• •• •7 89`, or in full
// for its owner only (`own`). Other members' numbers never reach the app (spec 2.11).
import { useTranslation } from 'react-i18next';
import { formatOwnNumber, maskNumber } from '@njangi/shared';
import { Txt, type TxtProps } from '../primitives/Txt';

interface MaskedNumberProps extends Omit<TxtProps, 'children'> {
  /** `+2376XXXXXXXX`. */
  e164: string;
  /** The member's own number, shown in full. */
  own?: boolean;
}

export function MaskedNumber({ e164, own = false, ...rest }: MaskedNumberProps) {
  const { t } = useTranslation();
  const national = e164.slice(4);
  const spoken = (digits: string) => digits.split('').join(' ');
  const label = own
    ? t('a11y.ownNumber', { digits: spoken(national) })
    : t('a11y.maskedNumber', { last: spoken(national.slice(-3)) });
  return (
    <Txt accessibilityLabel={label} {...rest}>
      {own ? formatOwnNumber(e164) : maskNumber(e164)}
    </Txt>
  );
}
