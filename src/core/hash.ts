// FNV-1a 32-bit, built on Math.imul so it stays exact in a language with no integers.
// Covers authoritative state only. Never render output, never appearance.

const FNV_OFFSET = 0x811c9dc5 | 0;
const FNV_PRIME = 0x01000193;

export function hashInit(): number {
  return FNV_OFFSET;
}

export function hashByte(h: number, byte: number): number {
  return Math.imul((h ^ (byte & 0xff)) | 0, FNV_PRIME) | 0;
}

export function hashInt32(h: number, value: number): number {
  let out = h | 0;
  const v = value | 0;
  out = hashByte(out, v & 0xff);
  out = hashByte(out, (v >>> 8) & 0xff);
  out = hashByte(out, (v >>> 16) & 0xff);
  out = hashByte(out, (v >>> 24) & 0xff);
  return out | 0;
}

export function hashBytes(h: number, bytes: Uint8Array): number {
  let out = h | 0;
  for (let i = 0; i < bytes.length; i = (i + 1) | 0) {
    out = hashByte(out, bytes[i] as number);
  }
  return out | 0;
}

// Unsigned view, for printing and for fixture comparison.
export function hashHex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, "0");
}
