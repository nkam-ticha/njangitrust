// Signed-in routes: the five tabs, plus create a group, founding members and notifications.
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { AgentGlow } from '@/ui';
import { useAgentBusyMode } from '@/features/agent/useAgent';
import { useAppLockGate } from '@/features/appLock/useAppLockGate';
import { usePushRegistration, usePushTaps } from '@/features/notifications/usePush';
import { AppLockScreen } from '@/screens/appLock/AppLockScreen';
import { FloatingAgent } from '@/screens/shell/FloatingAgent';

// The agent is within reach everywhere: a floating orb on every screen, and a glow around the
// screen while it is answering. On a phone, this phone's push token is saved here (nothing on web),
// and the optional fingerprint or face lock covers the app when it is on (D36).
export default function AppLayout() {
  const mode = useAgentBusyMode();
  usePushRegistration();
  usePushTaps();
  const locked = useAppLockGate();
  return (
    <View style={styles.fill}>
      <Stack screenOptions={{ headerShown: false }} />
      <AgentGlow active={mode !== 'idle'} />
      <FloatingAgent />
      {locked ? <AppLockScreen /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
