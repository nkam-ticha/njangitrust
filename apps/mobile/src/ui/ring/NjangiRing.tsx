// NjangiRing (spec 1.2; DESIGN_SYSTEM.md section 6): members in rotation order around a circle,
// the beneficiary at 12 o'clock. Large sizes show the amount collected in the centre and open a
// member's mini-profile on tap; on the web the ring is one tab stop and arrow keys move between dots.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, PixelRatio, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { formatAmount, formatXAF } from '@njangi/shared';
import { fontScaleCaps, useReduceMotion, useTheme } from '@/theme';
import { AmountText, amountLabel, type AmountSize } from '../money/AmountText';
import { Txt } from '../primitives/Txt';
import { useLang } from '../primitives/useLang';
import { isKeyboardModality } from '../primitives/focusVisible';
import { angleFor, memberAt, offsetFromBeneficiary, polar, ringLayout, type RingSize } from './ringGeometry';
import { RingDrawing, type PlacedMember, type RingDotState } from './RingDrawing';
import { OverlayLayer, PulseDot, SweepArc } from './ringMotion';

export interface RingMember {
  membershipId: string;
  name: string;
  state: RingDotState;
  isBeneficiary: boolean;
  served: boolean;
}

export interface NjangiRingProps {
  size: RingSize;
  /** In rotation order, as the server sends them. */
  members: RingMember[];
  /** Integer FCFA collected for the round, and the round's target. */
  collected: number;
  target: number;
  round: number;
  roundsTotal: number;
  /** Large sizes: opens the member's mini-profile. */
  onMemberPress?: (membershipId: string) => void;
  /** The member using the app: only their own landing is announced (6.6). */
  meId?: string;
  /** Turns the motions off (gallery snapshots). */
  animate?: boolean;
}

const LARGE: RingSize[] = ['large', 'largeSmall', 'wide', 'panel'];

export function NjangiRing({ size, members, collected, target, round, roundsTotal, onMemberPress, meId, animate = true }: NjangiRingProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const lang = useLang();
  const reduce = useReduceMotion();
  const n = members.length;
  const b = members.findIndex((m) => m.isBeneficiary);
  const emptySeat = b === -1; // bidding mode before the close (DD-28)
  const positions = emptySeat ? n + 1 : n;
  const layout = ringLayout(size, positions);
  const { spec } = layout;
  const c = spec.S / 2;
  const complete = target > 0 && collected >= target;
  const large = LARGE.includes(size);

  const placed: PlacedMember[] = members.map((m, k) => ({
    key: m.membershipId,
    state: m.state,
    isBeneficiary: m.isBeneficiary,
    served: m.served,
    offset: emptySeat ? k + 1 : offsetFromBeneficiary(k, b, n),
  }));
  const pointOf = (k: number) => polar(c, spec.R, angleFor(placed[k]?.offset ?? 0, positions));

  // Motions: detect contributions landing and the round closing while mounted (6.7).
  const previous = useRef<Map<string, RingDotState> | null>(null);
  const wasComplete = useRef(complete);
  const [pulses, setPulses] = useState<Array<{ id: string; k: number; delay: number }>>([]);
  const [sweep, setSweep] = useState<{ delay: number } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = new Map(members.map((m) => [m.membershipId, m.state]));
    if (!before) return;
    const landed = members.map((m, k) => ({ m, k })).filter(({ m }) => m.state === 'paid' && before.get(m.membershipId) !== 'paid' && before.has(m.membershipId));
    for (const { m } of landed) {
      if (m.membershipId === meId) AccessibilityInfo.announceForAccessibility(t('ring.a11y.contributionLanded', { name: m.name }));
    }
    const motion = animate && !reduce && !layout.segments;
    const shown = motion ? landed.slice(0, 3) : [];
    if (shown.length) setPulses((p) => [...p, ...shown.map(({ m, k }, i) => ({ id: `${m.membershipId}-${Date.now()}`, k, delay: i * 120 }))]);
    if (complete && !wasComplete.current) {
      AccessibilityInfo.announceForAccessibility(t('ring.a11y.roundCompleted'));
      if (animate && !reduce && !layout.segments) setSweep({ delay: shown.length ? 600 + (shown.length - 1) * 120 : 0 });
    }
    wasComplete.current = complete;
  }, [members, complete, animate, reduce, layout.segments, meId, t]);
  const endPulse = useCallback((id: string) => setPulses((p) => p.filter((x) => x.id !== id)), []);
  const endSweep = useCallback(() => setSweep(null), []);

  // Keyboard (web): roving focus between dots, Enter opens the profile.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || focusIndex === null || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const order = placed.map((p, k) => ({ k, o: p.offset })).sort((x, y) => x.o - y.o).map((x) => x.k);
      const at = order.indexOf(focusIndex);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setFocusIndex(order[(at + 1) % n] ?? 0);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setFocusIndex(order[(at - 1 + n) % n] ?? 0);
      else if (e.key === 'Home') setFocusIndex(order[0] ?? 0);
      else if (e.key === 'Enter' || e.key === ' ') {
        const m = members[focusIndex];
        if (m) onMemberPress?.(m.membershipId);
      } else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const [pressIndex, setPressIndex] = useState<number | null>(null);

  // Screen-reader summary (6.6).
  const paid = members.filter((m) => m.state === 'paid').length;
  const late = members.filter((m) => m.state === 'late').length;
  const beneficiaryName = b >= 0 ? (members[b]?.name ?? '') : '';
  const summary = [
    t('ring.a11y.summary', { round, total: roundsTotal, name: beneficiaryName, collected: amountLabel(collected, lang), target: amountLabel(target, lang) }),
    complete ? t('ring.a11y.complete') : `${t('ring.a11y.paidCount', { count: paid })} ${t('ring.a11y.unpaidCount', { count: n - paid })}`,
    !complete && late > 0 ? t('ring.a11y.lateCount', { count: late }) : '',
  ].filter(Boolean).join(' ');

  // Centre text (6.5): steps down 32 → 24 → 19 to fit; moves below the ring at large text.
  const below = PixelRatio.getFontScale() >= fontScaleCaps.ringCentre;
  const inner = 2 * (spec.R - spec.rMax - 12);
  const chars = formatXAF(collected, lang).length;
  const amountSize: AmountSize = chars * 0.62 * 32 <= inner ? 'display' : chars * 0.62 * 24 <= inner ? 'large' : 'total';
  const centre = large ? (
    <View style={below ? styles.below : styles.centre} pointerEvents="none">
      <AmountText amount={collected} size={amountSize} align="center" />
      <Txt variant={complete ? 'secondaryStrong' : 'secondary'} color={complete ? 'textPrimary' : 'textSecondary'} align="center">
        {complete ? t('ring.center.complete') : t('ring.center.of', { target: formatAmount(target, lang) })}
      </Txt>
    </View>
  ) : null;

  const marker = focusIndex ?? pressIndex;
  const markerPoint = marker !== null ? pointOf(marker) : null;
  const interactive = large && !!onMemberPress;

  return (
    <View style={styles.wrap}>
      <View style={{ width: spec.S, height: spec.S }}>
        <Svg width={spec.S} height={spec.S} style={styles.visible}>
          <RingDrawing layout={layout} members={placed} positions={positions} closed={complete && !sweep} emptySeat={emptySeat} colors={colors} />
          {sweep ? <SweepArc c={c} R={spec.R} width={spec.track + 1} color={colors.accentRaffia} delay={sweep.delay} onDone={endSweep} /> : null}
        </Svg>
        <OverlayLayer size={spec.S}>
          {pulses.map((p) => {
            const pt = pointOf(p.k);
            return <PulseDot key={p.id} x={pt.x} y={pt.y} r={layout.r} color={colors.primary} delay={p.delay} onDone={() => endPulse(p.id)} />;
          })}
          {markerPoint ? (
            <View style={[styles.marker, { left: markerPoint.x - layout.r - 4, top: markerPoint.y - layout.r - 4, width: (layout.r + 4) * 2, height: (layout.r + 4) * 2, borderColor: colors.focusRing }]} />
          ) : null}
          {!below ? centre : null}
        </OverlayLayer>
        <Pressable
          accessible
          accessibilityRole={interactive ? 'button' : 'image'}
          accessibilityLabel={summary}
          accessibilityHint={interactive ? (Platform.OS === 'web' ? t('ring.a11y.keyboardHint') : t('ring.a11y.hint')) : undefined}
          disabled={!interactive}
          focusable={interactive}
          onFocus={() => interactive && isKeyboardModality() && setFocusIndex(b >= 0 ? b : 0)}
          onBlur={() => setFocusIndex(null)}
          onPressIn={(e) => interactive && setPressIndex(memberAt(e.nativeEvent.locationX, e.nativeEvent.locationY, size, positions, emptySeat ? 0 : b))}
          onPressOut={() => setPressIndex(null)}
          onPress={(e) => {
            const k = memberAt(e.nativeEvent.locationX, e.nativeEvent.locationY, size, positions, emptySeat ? 0 : b);
            const index = emptySeat && k !== null ? k - 1 : k;
            const m = index !== null && index >= 0 ? members[index] : undefined;
            if (m) onMemberPress?.(m.membershipId);
          }}
          style={[StyleSheet.absoluteFill, interactive ? styles.pointer : null]}
        />
      </View>
      {below ? centre : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  visible: { overflow: 'visible' },
  centre: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  below: { alignItems: 'center', marginTop: 8 },
  marker: { position: 'absolute', borderWidth: 2, borderRadius: 999 },
  pointer: { cursor: 'pointer' },
});
