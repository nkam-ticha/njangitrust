// Blocks screenshots on PIN and money screens (D4, expo-screen-capture). Hidden on the web (D1).
import { useEffect } from 'react';
import { Platform } from 'react-native';
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
