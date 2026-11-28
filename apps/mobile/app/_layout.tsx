import '@/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/api/queryClient';
import { restoreSession } from '@/api/session';
import { armColdStart } from '@/features/appLock/appLockStore';
import { useSession } from '@/state/session';
import { ThemeProvider } from '@/theme';
import { fontSources } from '@/theme/fonts';

// Stop the whole-screen blue selection on long-press/hold: the page background and containers are
// not selectable, but text (see Txt) and inputs are, so members can still select and copy text.
// Buttons stay unselectable so pressing and holding one never highlights its label.
// Also prevent horizontal overscroll, window bouncing, and white edge lines on web.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleId = 'disable-long-press-selection';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        overflow-x: hidden !important;
        overscroll-behavior-x: none !important;
        background-color: #141B3D;
      }
      #root {
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
        overflow-x: hidden !important;
      }
      :where(html, body, #root, #root *) {
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      button, button *, [role="button"], [role="button"] * {
        -webkit-user-select: none !important;
        user-select: none !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// Keep the splash up until the fonts are loaded and the session is known.
void SplashScreen.preventAutoHideAsync();
// The app lock asks at once only when this launch restores an existing session (D36).
armColdStart();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontSources);
  const status = useSession((state) => state.status);

  useEffect(() => {
    void restoreSession();
  }, []);

  const ready = (fontsLoaded || fontError !== null) && status !== 'restoring';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  const signedIn = status === 'signedIn';

  return (
    <SafeAreaProvider style={{ flex: 1, width: '100%', minHeight: '100%' }}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            {/* Signed out, "/" redirects to /welcome: both groups would otherwise claim "/". */}
            <Stack.Protected guard={signedIn} redirectTo="/welcome">
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn} redirectTo="/">
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            {/* The component gallery exists only in development builds. */}
            <Stack.Protected guard={__DEV__}>
              <Stack.Screen name="(dev)" />
            </Stack.Protected>
          </Stack>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
