// The five destinations (spec 1.3) as bottom tabs on phones, a rail on medium screens and a
// sidebar on wide screens (DESIGN_SYSTEM.md 5.9, 8.1). Same component, different layout.
import { Tabs } from 'expo-router';
import { useUnreadTotal } from '@/features/chat/useChat';
import { useSession } from '@/state/session';
import { useBreakpoint } from '@/theme';
import { Navigation, navigationLayoutFor, type TabKey } from '@/ui';

const ROUTE_TO_TAB: Record<string, TabKey> = {
  index: 'njangi',
  groupe: 'groupe',
  caisse: 'caisse',
  votes: 'votes',
  moi: 'moi',
};
const TAB_TO_ROUTE: Record<TabKey, string> = {
  njangi: 'index',
  groupe: 'groupe',
  caisse: 'caisse',
  votes: 'votes',
  moi: 'moi',
};

export default function TabsLayout() {
  const { breakpoint } = useBreakpoint();
  const layout = navigationLayoutFor(breakpoint);
  const name = useSession((s) => s.user?.name);
  const unreadChat = useUnreadTotal();
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarPosition: layout === 'tabs' ? 'bottom' : 'left' }}
      tabBar={({ state, navigateToTab }) => {
        const current = state.routes[state.index]?.name ?? 'index';
        return (
          <Navigation
            layout={layout}
            active={ROUTE_TO_TAB[current] ?? 'njangi'}
            onSelect={(tab) => {
              const route = state.routes.find((r) => r.name === TAB_TO_ROUTE[tab]);
              if (route) navigateToTab(route.key);
            }}
            unreadChat={unreadChat}
            votesWaiting={0}
            agentWaiting={false}
            memberName={name}
          />
        );
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="groupe" />
      <Tabs.Screen name="caisse" />
      <Tabs.Screen name="votes" />
      <Tabs.Screen name="moi" />
    </Tabs>
  );
}
