// Signed-in routes: the five tabs, plus create a group, founding members and notifications.
import { Stack } from 'expo-router';

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
