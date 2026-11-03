// Static SVG drawing of the NjangiRing (DESIGN_SYSTEM.md 6.2 to 6.4): track, dots or arcs,
// beneficiary, served badges, the closed raffia ring. Motions are layered on top by NjangiRing.
import { Circle, G, Path } from 'react-native-svg';
import type { ThemeColors } from '@/theme';
import { angleFor, arcPath, polar, type RingLayout } from './ringGeometry';

export type RingDotState = 'paid' | 'unpaid' | 'late' | 'pending';

export interface PlacedMember {
  key: string;
  state: RingDotState;
  isBeneficiary: boolean;
  served: boolean;
  /** Position on the ring, 0 = 12 o'clock. */
  offset: number;
}

interface RingDrawingProps {
  layout: RingLayout;
  members: PlacedMember[];
  /** Number of positions on the ring (members, plus the empty seat in bidding mode). */
  positions: number;
  closed: boolean;
  /** Bidding mode before the close: an empty raffia seat at 12 o'clock (DD-28). */
  emptySeat: boolean;
  colors: ThemeColors;
}

export function RingDrawing({ layout, members, positions, closed, emptySeat, colors }: RingDrawingProps) {
  const { spec, r, segments } = layout;
  const c = spec.S / 2;
  const span = (0.7 * 360) / positions;
  const strokeFor = (state: RingDotState) =>
    state === 'late' ? colors.statusLate : state === 'pending' ? colors.statusPending : colors.outline;

  return (
    <G>
      {!segments ? (
        <Circle cx={c} cy={c} r={spec.R} fill="none" stroke={closed ? colors.accentRaffia : colors.divider} strokeWidth={closed ? spec.track + 1 : spec.track} />
      ) : null}
      {emptySeat ? (
        segments ? (
          <Path d={arcPath(c, spec.R, -90, span)} fill="none" stroke={colors.raffiaKeyline} strokeWidth={1.5} />
        ) : (
          <Circle cx={c} cy={c - spec.R} r={r * spec.beneficiaryScale - 0.75} fill={colors.canvas} stroke={colors.raffiaKeyline} strokeWidth={1.5} />
        )
      ) : null}
      {members.map((m) => {
        const deg = angleFor(m.offset, positions);
        if (segments) {
          const d = arcPath(c, spec.R, deg, span);
          if (m.isBeneficiary) {
            return (
              <G key={m.key}>
                <Path d={d} fill="none" stroke={colors.raffiaKeyline} strokeWidth={spec.segmentWidth + 1.5} />
                <Path d={d} fill="none" stroke={colors.accentRaffia} strokeWidth={spec.segmentWidth} />
              </G>
            );
          }
          const width = m.state === 'paid' ? spec.segmentWidth : m.state === 'late' ? 1.5 : 1;
          return <Path key={m.key} d={d} fill="none" stroke={m.state === 'paid' ? colors.primary : strokeFor(m.state)} strokeWidth={width} />;
        }
        const p = polar(c, spec.R, deg);
        let dot;
        if (m.isBeneficiary) {
          dot = <Circle cx={p.x} cy={p.y} r={r * spec.beneficiaryScale - spec.keyline / 2} fill={colors.accentRaffia} stroke={colors.raffiaKeyline} strokeWidth={spec.keyline} />;
        } else if (m.state === 'paid') {
          dot = <Circle cx={p.x} cy={p.y} r={r} fill={colors.primary} />;
        } else {
          const w = m.state === 'late' ? spec.late : spec.outline;
          const rr = r - w / 2;
          const dashed = m.state === 'pending' && spec.servedBadge;
          dot = (
            <Circle
              cx={p.x}
              cy={p.y}
              r={rr}
              fill={colors.canvas}
              stroke={strokeFor(m.state)}
              strokeWidth={w}
              strokeDasharray={dashed ? `${((Math.PI * 2 * rr) / 12).toFixed(2)}` : undefined}
            />
          );
        }
        let badge = null;
        if (spec.servedBadge && m.served) {
          const rs = Math.max(3, 0.5 * r);
          const b = polar(c, spec.R + r + 1.5 + rs, deg);
          badge = (
            <G>
              <Circle cx={b.x} cy={b.y} r={rs - 0.5} fill={colors.accentRaffia} stroke={colors.raffiaKeyline} strokeWidth={1} />
              <Path
                d={`M${b.x - 0.5 * rs} ${b.y} L${b.x - 0.1 * rs} ${b.y + 0.4 * rs} L${b.x + 0.55 * rs} ${b.y - 0.4 * rs}`}
                fill="none"
                stroke={colors.onRaffia}
                strokeWidth={1.25}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </G>
          );
        }
        return (
          <G key={m.key}>
            {dot}
            {badge}
          </G>
        );
      })}
    </G>
  );
}
