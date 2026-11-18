import { Platform, Share } from 'react-native';

/**
 * Copies text to the clipboard across web and native platforms.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fallback to execCommand below
      }
    }
    if (typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) return true;
      } catch {
        // Fallback below
      }
    }
  }

  try {
    await Share.share({ message: text });
    return true;
  } catch {
    return false;
  }
}
