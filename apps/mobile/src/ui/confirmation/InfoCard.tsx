// Information cards (spec 4.5; DESIGN_SYSTEM.md 5.22): read results with sensitive values, drawn by
// the app from the server, not written by the agent. Bordered, not raised.
// "Copier" swaps to "Copié" for 2 s (5.14: feedback in place, no toasts).
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, space, useTheme } from '@/theme';
import { Button, type ButtonVariant } from '../buttons/Button';
import { Txt } from '../primitives/Txt';
import type { IconComponent } from '../primitives/Icon';

export interface InfoCardAction {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Shows "Copié" for 2 seconds after the press. */
  copies?: boolean;
  offline?: boolean;
}

interface InfoCardProps {
  icon: IconComponent;
  title: string;
  /** Main value (the own payment number, in large text). */
  value?: ReactNode;
  lines?: string[];
  actions: InfoCardAction[];
}

function CardAction({ action }: { action: InfoCardAction }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <Button
      variant={action.variant ?? 'text'}
      label={copied ? t('common.actions.copied') : action.label}
      offline={action.offline}
      onPress={() => {
        action.onPress();
        if (action.copies) setCopied(true);
      }}
    />
  );
}

export function InfoCard({ icon: Glyph, title, value, lines = [], actions }: InfoCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.divider }]}>
      <View style={styles.head}>
        <Glyph size={24} color={colors.iconPrimary} strokeWidth={2} />
        <Txt variant="bodyStrong" style={styles.flex}>{title}</Txt>
      </View>
      {value}
      {lines.map((line, i) => (
        <Txt key={i} variant="secondary" color="textSecondary">{line}</Txt>
      ))}
      <View style={styles.actions}>
        {actions.map((a) => (
          <CardAction key={a.label} action={a} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.group, padding: space.s4, gap: space.s2, maxWidth: 440, width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginTop: space.s1 },
  flex: { flex: 1 },
});
