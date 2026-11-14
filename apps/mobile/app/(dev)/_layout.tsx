// Development-only routes (guarded by __DEV__ in the root layout): the component gallery and
// the Progress screen.
import { Stack } from 'expo-router';

export default function DevLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
