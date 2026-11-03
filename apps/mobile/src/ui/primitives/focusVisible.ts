// Keyboard focus is shown only when the member is using the keyboard (DESIGN_SYSTEM.md 8.5):
// a pointer or touch press never shows the focus ring. On native this is always false.
import { Platform } from 'react-native';

let keyboardModality = false;

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (!e.metaKey && !e.altKey && !e.ctrlKey) keyboardModality = true;
  }, true);
  document.addEventListener('pointerdown', () => {
    keyboardModality = false;
  }, true);
}

export function isKeyboardModality(): boolean {
  return keyboardModality;
}
