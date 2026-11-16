// Streaming through the output guard (spec 4.2, 4.8 point 5). A phone number can arrive split over
// several deltas, so text is released only up to the last letter when digits follow it: digit
// groups never join across a letter, so everything released is final and already masked.
import { maskForeignPhones } from './phone-guard';

const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;

/** The index just after the last letter of `text`, or 0. */
function afterLastLetter(text: string): number {
  const chars = Array.from(text);
  let offset = text.length;
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const char = chars[i]!;
    if (LETTER.test(char)) return offset;
    offset -= char.length;
  }
  return 0;
}

export class StreamGuard {
  private raw = '';
  private released = '';

  constructor(
    private readonly allowed: readonly string[],
    private readonly emit: (text: string) => void,
  ) {}

  push(delta: string): void {
    this.raw += delta;
    const cut = afterLastLetter(this.raw);
    const safeEnd = DIGIT.test(this.raw.slice(cut)) ? cut : this.raw.length;
    this.release(maskForeignPhones(this.raw.slice(0, safeEnd), this.allowed));
  }

  /** The whole reply, guarded; releases what was held back. */
  finish(): string {
    const final = maskForeignPhones(this.raw, this.allowed);
    this.release(final);
    return final;
  }

  /** Forgets this step's text (it ended with tool calls). */
  reset(): void {
    this.raw = '';
    this.released = '';
  }

  get emitted(): boolean {
    return this.released.length > 0;
  }

  private release(guarded: string): void {
    if (guarded.length <= this.released.length || !guarded.startsWith(this.released)) return;
    this.emit(guarded.slice(this.released.length));
    this.released = guarded;
  }
}
