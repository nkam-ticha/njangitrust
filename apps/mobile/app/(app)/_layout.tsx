// Signed-in routes: the five tabs, plus create a group, founding members and notifications.
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { AgentGlow } from '@/ui';
import { useAgentActivity } from '@/state/agentActivity';
import { FloatingAgent } from '@/screens/shell/FloatingAgent';

// The agent is within reach everywhere: a floating orb on every screen, and a glow around the
// screen while it is answering.
export default function AppLayout() {
  const mode = useAgentActivity((s) => s.mode);
  return (
    <View style={styles.fill}>
      <Stack screenOptions={{ headerShown: false }} />
      <AgentGlow active={mode !== 'idle'} />
      <FloatingAgent />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
