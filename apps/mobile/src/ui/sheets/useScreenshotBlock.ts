// Blocks screenshots on PIN and money screens (D4, expo-screen-capture) and covers them in the iOS
// app switcher (D21). Nothing to do on the web (D1).
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

export function useScreenshotBlock(active: boolean): void {
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    const key = 'njangi-sensitive';
    void ScreenCapture.preventScreenCaptureAsync(key);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync(key);
    };
  }, [active]);
}

/**
 * iOS can't block screenshots, and its app switcher keeps a snapshot of the screen (D21): true
 * while a sensitive view is showing and the app is not in the foreground, so the view can hide
 * its content behind a plain cover.
 */
export function useBackgroundCover(active: boolean): boolean {
  const [background, setBackground] = useState(false);
  useEffect(() => {
    if (!active || Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', (state) => setBackground(state !== 'active'));
    return () => sub.remove();
  }, [active]);
  return active && background && AppState.currentState !== 'active';
}
