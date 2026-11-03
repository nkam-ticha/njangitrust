// The original Ndop-inspired band (docs/design/assets/ndop-band.svg, DESIGN_SYSTEM.md 5.27).
// Used in two places only (spec 1.2): the in-app splash and the payout (withdraw) sheet.
// Brand constants, identical in both themes. Decorative.
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

interface NdopBandProps {
  /** 32 on phones, 40 on wide screens, 48 on the splash. */
  height?: 32 | 40 | 48;
}

const SEEDS: Array<[number, number]> = [
  [52.6, 11.4],
  [54.5, 16],
  [52.6, 20.6],
  [48, 22.5],
  [43.4, 20.6],
  [41.5, 16],
  [43.4, 11.4],
];

export function NdopBand({ height = 32 }: NdopBandProps) {
  const { colors } = useTheme();
  const s = height / 32;
  const id = `ndop-${height}`;
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ height, alignSelf: 'stretch' }}>
      <Svg width="100%" height={height}>
        <Defs>
          <Pattern id={id} width={64 * s} height={height} patternUnits="userSpaceOnUse">
            <G scale={s}>
              <Rect width={64} height={32} fill={colors.brandGround} />
              <G fill={colors.brandMotif}>
                <Path d="M0 0h64l-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4z" />
                <Path d="M0 32h64l-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4z" />
                <Rect x={0.5} y={8} width={1} height={16} />
                <Rect x={30.5} y={8} width={1} height={16} />
                <Rect x={32.5} y={8} width={1} height={16} />
                <Rect x={62.5} y={8} width={1} height={16} />
                <Circle cx={16} cy={16} r={1.75} />
                {SEEDS.map(([cx, cy]) => (
                  <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.3} />
                ))}
              </G>
              <Path d="M16 9.25 22.75 16 16 22.75 9.25 16Z" fill="none" stroke={colors.brandMotif} strokeWidth={1.5} />
              <Circle cx={48} cy={9.5} r={1.9} fill={colors.accentRaffia} />
            </G>
          </Pattern>
        </Defs>
        <Rect width="100%" height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
