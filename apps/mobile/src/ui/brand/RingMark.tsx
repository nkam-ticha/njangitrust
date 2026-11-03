// RingMark (docs/design/assets/ring-mark.svg): the Njangi tab icon and the agent's avatar,
// drawn on lucide's 24 grid with its 2 px stroke. The open ring at 12 o'clock is the beneficiary.
import Svg, { Circle } from 'react-native-svg';

interface RingMarkProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

const SEEDS: Array<[number, number]> = [
  [17.66, 6.34],
  [20, 12],
  [17.66, 17.66],
  [12, 20],
  [6.34, 17.66],
  [4, 12],
  [6.34, 6.34],
];

export function RingMark({ size = 24, color, strokeWidth = 2 }: RingMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={4} r={2} />
      {SEEDS.map(([cx, cy]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} />
      ))}
    </Svg>
  );
}
