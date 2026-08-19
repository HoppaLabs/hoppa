// Bit-level reader and writer, and base64url. Integer arithmetic only.
//
// Everything here is in service of the codec: links are permanent, so the exact
// bit layout is a compatibility surface and gets its own small, boring module
// rather than being smeared through the encoder.

export class BitWriter {
  private readonly bytes: number[] = [];
  private current = 0;
  private used = 0;

  /** Write the low `width` bits of `value`, most significant first. */
  write(value: number, width: number): void {
    for (let i = (width - 1) | 0; i >= 0; i = (i - 1) | 0) {
      const bit = ((value >>> i) & 1) | 0;
      this.current = ((this.current << 1) | bit) | 0;
      this.used = (this.used + 1) | 0;
      if (this.used === 8) {
        this.bytes.push(this.current & 0xff);
        this.current = 0;
        this.used = 0;
      }
    }
  }

  /** Pad with zero bits to a byte boundary and hand back the bytes. */
  finish(): Uint8Array {
    if (this.used > 0) {
      this.bytes.push((this.current << (8 - this.used)) & 0xff);
      this.current = 0;
      this.used = 0;
    }
    const out = new Uint8Array(this.bytes.length);
    for (let i = 0; i < this.bytes.length; i = (i + 1) | 0) out[i] = this.bytes[i] as number;
    return out;
  }

  /** Bits written so far, before padding. */
  bitLength(): number {
    return (this.bytes.length * 8 + this.used) | 0;
  }
}

export class BitReaderError extends Error {}

export class BitReader {
  private readonly bytes: Uint8Array;
  private position = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  read(width: number): number {
    let out = 0;
    for (let i = 0; i < width; i = (i + 1) | 0) {
      const byte = (this.position >>> 3) | 0;
      if (byte >= this.bytes.length) {
        throw new BitReaderError("ran off the end of the data -- the code is truncated");
      }
      const shift = (7 - (this.position & 7)) | 0;
      const bit = (((this.bytes[byte] as number) >>> shift) & 1) | 0;
      out = ((out << 1) | bit) | 0;
      this.position = (this.position + 1) | 0;
    }
    return out >>> 0;
  }

  remaining(): number {
    return (this.bytes.length * 8 - this.position) | 0;
  }
}

// base64url, written out rather than reached for, so the alphabet is visible and
// cannot drift. No padding: it would only add characters to a URL.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function toBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i = (i + 3) | 0) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : -1;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : -1;

    out += ALPHABET[(a >>> 2) & 63] as string;
    out += ALPHABET[((a << 4) & 48) | (b < 0 ? 0 : (b >>> 4) & 15)] as string;
    if (b < 0) break;
    out += ALPHABET[((b << 2) & 60) | (c < 0 ? 0 : (c >>> 6) & 3)] as string;
    if (c < 0) break;
    out += ALPHABET[c & 63] as string;
  }
  return out;
}

export class Base64urlError extends Error {}

function valueOf(ch: string): number {
  const at = ALPHABET.indexOf(ch);
  if (at < 0) throw new Base64urlError(`"${ch}" is not a base64url character`);
  return at | 0;
}

export function fromBase64url(text: string): Uint8Array {
  const clean = text.trim();
  const full = (clean.length >>> 2) | 0;
  const tail = (clean.length & 3) | 0;
  if (tail === 1) throw new Base64urlError("code length is impossible -- it has been truncated");

  const size = (full * 3 + (tail === 0 ? 0 : tail - 1)) | 0;
  const out = new Uint8Array(size);
  let at = 0;

  for (let i = 0; i < clean.length; i = (i + 4) | 0) {
    const chunk = clean.length - i;
    const a = valueOf(clean[i] as string);
    const b = valueOf(clean[i + 1] as string);
    out[at] = ((a << 2) | (b >>> 4)) & 0xff;
    at = (at + 1) | 0;
    if (chunk < 3) break;
    const c = valueOf(clean[i + 2] as string);
    out[at] = ((b << 4) | (c >>> 2)) & 0xff;
    at = (at + 1) | 0;
    if (chunk < 4) break;
    const d = valueOf(clean[i + 3] as string);
    out[at] = ((c << 6) | d) & 0xff;
    at = (at + 1) | 0;
  }

  return out;
}
