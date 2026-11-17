// Phone numbers a member types to the agent never reach the model (rule 11, spec 4.8, R13.7). The
// member's message is rewritten with markers, `[phone-1]`; the model passes the marker to the tool
// that needs the number (invite someone, change my own payment number); the server puts the real
// number back before the tool runs. Only numbers typed in this very turn can be resolved, and the
// model's reply never carries a marker or a number.
import { maskLoosePhones } from '../../lib/redact';
import { maskForeignPhones } from './phone-guard';
import { normalizeCameroonPhone, replacePhonesInText } from '@njangi/shared';

const MARKER = /\[phone-(\d{1,2})\]/g;
const MASKED = '6•• •• •• ••';
const MAX_SLOTS = 20;

export class NumberSlots {
  private readonly byMarker = new Map<string, string>();
  private readonly byNumber = new Map<string, string>();

  /** The text with every number replaced by its marker (the same number, the same marker). */
  mask(text: string): string {
    const marked = replacePhonesInText(text, (e164) => {
      let marker = this.byNumber.get(e164);
      if (!marker) {
        if (this.byNumber.size >= MAX_SLOTS) return MASKED;
        marker = `[phone-${this.byNumber.size + 1}]`;
        this.byNumber.set(e164, marker);
        this.byMarker.set(marker, e164);
      }
      return marker;
    });
    // What the scanner does not read as a number (odd separators) is still masked, never resolved.
    return maskLoosePhones(maskForeignPhones(marked, []));
  }

  get used(): boolean {
    return this.byMarker.size > 0;
  }

  /** The tool arguments with each marker of this turn replaced by the number it stands for. */
  resolve<T>(value: T): T {
    if (this.byMarker.size === 0) return value;
    const walk = (item: unknown): unknown => {
      if (typeof item === 'string') {
        return item.replace(MARKER, (marker) => this.byMarker.get(marker) ?? marker);
      }
      if (Array.isArray(item)) return item.map(walk);
      if (item && typeof item === 'object') {
        return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, walk(v)] as const));
      }
      return item;
    };
    return walk(value) as T;
  }
}

/** A reply with any marker the model wrote hidden (it must never show a number or its marker). */
export function hideMarkers(text: string): string {
  return text.replace(MARKER, MASKED);
}

/** Whether `value` is one of this turn's markers or a plain number (used by tests). */
export function isMarker(value: string): boolean {
  return /^\[phone-\d{1,2}\]$/.test(value) || normalizeCameroonPhone(value) !== null;
}
