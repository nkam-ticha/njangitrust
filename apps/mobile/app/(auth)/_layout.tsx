// Signed-out routes: welcome, sign-up, login, forgot PIN (SCREENS.md section 4).
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
