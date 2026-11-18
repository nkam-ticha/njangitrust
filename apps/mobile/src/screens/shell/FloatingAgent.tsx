// The agent, within reach on every screen: a floating orb the member can drag anywhere. A tap opens
// the conversation (the Njangi tab). It hides on that tab, remembers where it was left, snaps to
// the nearest side so it never covers the middle of a screen, and shows what the agent is doing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { size, space, useBreakpoint } from '@/theme';
import { AgentOrb, navigationLayoutFor } from '@/ui';
import { useAgentActivity } from '@/state/agentActivity';
import { BottomSheet } from '@/ui';
import { NjangiTab } from '@/screens/njangi/NjangiTab';

const ORB = 56;
const MARGIN = space.s2;
const STORAGE_KEY = 'njangi.agentOrb';
/** A touch that moves less than this is a tap. */
const TAP_SLOP = 6;

interface Saved {
  side: 'left' | 'right';
  /** Where it sits between the top and the bottom limit: 0 to 1. */
  fy: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function FloatingAgent() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { breakpoint } = useBreakpoint();
  const mode = useAgentActivity((s) => s.mode);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [dragging, setDragging] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Where it may go: inside the screen, clear of the status bar and of the tab bar on phones.
  const bounds = useMemo(() => {
    const bottomBar = navigationLayoutFor(breakpoint) === 'tabs' ? size.tabBar : 0;
    return {
      minX: MARGIN,
      maxX: Math.max(MARGIN, width - ORB - MARGIN),
      minY: insets.top + MARGIN,
      maxY: Math.max(insets.top + MARGIN, height - insets.bottom - bottomBar - ORB - MARGIN),
    };
  }, [breakpoint, height, insets.bottom, insets.top, width]);
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);
  // Set when the member drops the orb: the spring already moves it, so it is not placed again.
  const dropped = useRef<Saved | null>(null);

  const pos = useState(() => new Animated.ValueXY({ x: -200, y: -200 }))[0];
  const current = useRef({ x: -200, y: -200 });
  const scale = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    const id = pos.addListener((value) => {
      current.current = value;
    });
    return () => pos.removeListener(id);
  }, [pos]);

  // Where it was left last time (right side, lower part of the screen the first time).
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
        const ok =
          parsed &&
          (parsed.side === 'left' || parsed.side === 'right') &&
          typeof parsed.fy === 'number';
        if (alive)
          setSaved(
            ok ? { side: parsed.side!, fy: clamp(parsed.fy!, 0, 1) } : { side: 'right', fy: 0.82 },
          );
      })
      .catch(() => {
        if (alive) setSaved({ side: 'right', fy: 0.82 });
      });
    return () => {
      alive = false;
    };
  }, []);

  // Placed (and kept in view when the window changes size) from the saved side and height.
  useEffect(() => {
    if (!saved) return;
    if (dropped.current === saved) {
      dropped.current = null;
      return;
    }
    pos.setValue({
      x: saved.side === 'left' ? bounds.minX : bounds.maxX,
      y: bounds.minY + saved.fy * (bounds.maxY - bounds.minY),
    });
  }, [saved, bounds, pos]);

  const open = useCallback(() => setChatOpen(true), []);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // The PanResponder is created once; its callbacks read the refs on gestures, never during render.
  /* eslint-disable react-hooks/refs */
  const [responder] = useState(() => {
    const start = { x: 0, y: 0, moved: false };
    const release = (tap: boolean) => {
      setDragging(false);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
      if (tap && !start.moved) {
        openRef.current();
        return;
      }
      const b = boundsRef.current;
      const side: Saved['side'] =
        current.current.x + ORB / 2 > (b.minX + b.maxX + ORB) / 2 ? 'right' : 'left';
      const y = clamp(current.current.y, b.minY, b.maxY);
      Animated.spring(pos, {
        toValue: { x: side === 'left' ? b.minX : b.maxX, y },
        useNativeDriver: false,
        friction: 7,
        tension: 70,
      }).start();
      const fy = b.maxY > b.minY ? (y - b.minY) / (b.maxY - b.minY) : 0.5;
      const next: Saved = { side, fy };
      dropped.current = next;
      setSaved(next);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ side, fy })).catch(() => undefined);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.x = current.current.x;
        start.y = current.current.y;
        start.moved = false;
        setDragging(true);
        Animated.spring(scale, { toValue: 1.14, useNativeDriver: true }).start();
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) > TAP_SLOP) start.moved = true;
        const b = boundsRef.current;
        pos.setValue({
          x: clamp(start.x + g.dx, b.minX, b.maxX),
          y: clamp(start.y + g.dy, b.minY, b.maxY),
        });
      },
      onPanResponderRelease: () => release(true),
      onPanResponderTerminate: () => release(false),
    });
  });
  /* eslint-enable react-hooks/refs */

  // On the conversation itself the orb would sit on top of it.
  if (!saved || pathname === '/') return null;

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <Animated.View
        {...responder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('agent.orb.open')}
        accessibilityHint={t('agent.orb.hint')}
        onAccessibilityTap={open}
        style={[
          styles.orb,
          {
            transform: [...pos.getTranslateTransform(), { scale }],
            // A pointer cursor on the web; harmless elsewhere.
            ...(dragging ? { cursor: 'grabbing' } : { cursor: 'pointer' }),
          },
        ]}
      >
        <AgentOrb size={ORB} mode={mode} />
      </Animated.View>
      <BottomSheet
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        title={t('common.agentName')}
        dialogWidth={480}
        scrollContent={false}
      >
        <NjangiTab />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  orb: { position: 'absolute', left: 0, top: 0, width: ORB, height: ORB, borderRadius: ORB / 2 },
});
