// The real type of a file from its first bytes (spec 2.12: checked after upload; the type the
// phone declared is never trusted). Only the formats the app accepts are recognised.

export type DetectedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'application/pdf'
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/3gpp'
  | 'audio/mp4'
  | 'audio/aac'
  | 'audio/mpeg'
  | 'audio/ogg'
  | 'video/webm';

/** Bytes needed to recognise every supported format. */
export const SNIFF_BYTES = 32;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (bytes: Uint8Array, prefix: readonly number[], offset = 0) =>
  prefix.every((b, i) => bytes[offset + i] === b);

/** ISO base media files (mp4, mov, m4a, 3gp, heic) by their `ftyp` brand. */
function fromFtyp(bytes: Uint8Array): DetectedType | null {
  if (ascii(bytes, 4, 8) !== 'ftyp') return null;
  const brand = ascii(bytes, 8, 12);
  if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  if (['M4A ', 'M4B '].includes(brand)) return 'audio/mp4';
  if (brand === 'qt  ') return 'video/quicktime';
  if (brand.startsWith('3gp') || brand.startsWith('3g2')) return 'video/3gpp';
  if (['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'MSNV'].includes(brand)) return 'video/mp4';
  return null;
}

export function detectFileType(bytes: Uint8Array): DetectedType | null {
  if (bytes.length < 4) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg';
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (ascii(bytes, 0, 3) === 'ID3' || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3])) {
    return 'audio/mpeg';
  }
  // ADTS AAC: sync word 0xFFF, layer 00.
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf6) === 0xf0) return 'audio/aac';
  return bytes.length >= 12 ? fromFtyp(bytes) : null;
}
