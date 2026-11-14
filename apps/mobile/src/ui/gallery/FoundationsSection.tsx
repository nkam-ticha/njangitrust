// Gallery: colour aliases and type styles (DESIGN_SYSTEM.md 2.2, 3.2).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, space, typography, useTheme, type ThemeColors, type TypeStyleName } from '@/theme';
import { Txt } from '../primitives/Txt';
import { AmountText } from '../money/AmountText';
import { GallerySection } from './GallerySection';

const SWATCHES: Array<keyof ThemeColors> = [
  'canvas',
  'surfaceRaised',
  'surfaceTint',
  'bubbleOwn',
  'selectedTint',
  'disabledFill',
  'dangerTint',
  'textPrimary',
  'textSecondary',
  'primary',
  'primaryPressed',
  'danger',
  'outline',
  'divider',
  'statusPaid',
  'statusLate',
  'statusPending',
  'accentRaffia',
  'brandGround',
];

export function FoundationsSection() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const amountStyles: TypeStyleName[] = [
    'amountDisplay',
    'amountLarge',
    'amountTotal',
    'amount',
    'amountSmall',
  ];
  const sizeFor = {
    amountDisplay: 'display',
    amountLarge: 'large',
    amountTotal: 'total',
    amount: 'body',
    amountSmall: 'small',
  } as const;
  const textStyles: TypeStyleName[] = [
    'screenTitle',
    'groupTitle',
    'sectionTitle',
    'body',
    'bodyStrong',
    'secondary',
    'secondaryStrong',
    'caption',
    'captionStrong',
  ];

  return (
    <>
      <GallerySection title="Colours">
        <View style={styles.grid}>
          {SWATCHES.map((name) => (
            <View key={name} style={styles.swatch}>
              <View
                style={[
                  styles.chip,
                  { backgroundColor: colors[name], borderColor: colors.divider },
                ]}
              />
              <Txt variant="caption">{name}</Txt>
            </View>
          ))}
        </View>
      </GallerySection>
      <GallerySection title="Type">
        <View style={styles.type}>
          {amountStyles.map((s) => (
            <View key={s} style={styles.typeRow}>
              <Txt
                variant="caption"
                color="textSecondary"
                style={styles.typeName}
              >{`${s} ${typography[s].fontSize}`}</Txt>
              <AmountText amount={70000} size={sizeFor[s as keyof typeof sizeFor]} align="left" />
            </View>
          ))}
          {textStyles.map((s) => (
            <View key={s} style={styles.typeRow}>
              <Txt
                variant="caption"
                color="textSecondary"
                style={styles.typeName}
              >{`${s} ${typography[s].fontSize}`}</Txt>
              <Txt variant={s} style={styles.flex}>
                {t('welcome.title')}
              </Txt>
            </View>
          ))}
        </View>
      </GallerySection>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s3, paddingHorizontal: space.s4 },
  swatch: { width: 96, gap: space.s1 },
  chip: { height: 40, borderRadius: radius.group, borderWidth: 1 },
  type: { paddingHorizontal: space.s4, gap: space.s3 },
  typeRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.s3, flexWrap: 'wrap' },
  typeName: { width: 140 },
  flex: { flex: 1, minWidth: 160 },
});
