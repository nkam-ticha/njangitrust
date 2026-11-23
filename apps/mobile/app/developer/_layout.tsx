// Developer console routes (D28): outside the member groups, reachable signed in or out. Each
// screen decides from the developer session alone; the member session is never read here.
import { Stack } from 'expo-router';

export default function DeveloperLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
