// A PNG writer, in about a hundred lines, because there are no dependencies.
//
// This is the same bargain as the QR encoder (docs/adr/0012): the format is
// small, the part of it we need is smaller, and a build-time image is not worth
// a supply chain.
//
// The one trick is deflate. PNG data must be zlib-wrapped deflate, but deflate
// has a **stored** block type -- "here are N bytes, uncompressed" -- which is
// perfectly legal and trivial to emit. The icons are a few kilobytes either
// way, and a compressor would be a hundred lines of Huffman coding to save
// nothing anybody would notice.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32, which is what the zlib wrapper checks the data with. */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function be32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const name = new Uint8Array([...type].map((ch) => ch.charCodeAt(0)));
  const typed = new Uint8Array(name.length + body.length);
  typed.set(name, 0);
  typed.set(body, name.length);

  const out = new Uint8Array(4 + typed.length + 4);
  out.set(be32(body.length), 0);
  out.set(typed, 4);
  out.set(be32(crc32(typed)), 4 + typed.length);
  return out;
}

/** zlib stream of stored deflate blocks. Legal, and as simple as it gets. */
function zlib(data: Uint8Array): Uint8Array {
  const MAX = 65535;
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let at = 0; at < data.length; at += MAX) {
    const slice = data.subarray(at, Math.min(at + MAX, data.length));
    const last = at + MAX >= data.length ? 1 : 0;
    const len = slice.length;
    blocks.push(new Uint8Array([last, len & 0xff, (len >>> 8) & 0xff, ~len & 0xff, (~len >>> 8) & 0xff]));
    blocks.push(slice);
  }
  blocks.push(be32(adler32(data)));
  return join(blocks);
}

function join(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * A PNG from **indexed** pixels: one palette entry per pixel, at 2 bits each.
 *
 * Four colours is all an icon of a creature needs -- the page background plus a
 * sub-palette -- and at 2bpp a 512px icon is 66 KB rather than the 786 KB the
 * same image costs as uncompressed truecolour. That matters because these go in
 * the offline cache, which a child downloads on a phone.
 *
 * No alpha: a home screen icon is drawn on a square that is always filled, and
 * iOS ignores transparency on `apple-touch-icon` anyway -- it composites it onto
 * black, which looks like a mistake.
 */
export function encodeIndexedPng(
  width: number,
  height: number,
  pixels: Uint8Array,
  palette: readonly (readonly [number, number, number])[],
): Uint8Array {
  if (pixels.length !== width * height) {
    throw new Error(`expected ${width * height} pixels, got ${pixels.length}`);
  }
  if (palette.length === 0 || palette.length > 4) {
    throw new Error(`2bpp holds 1 to 4 colours, got ${palette.length}`);
  }
  if (width % 4 !== 0) throw new Error(`width must pack into whole bytes, got ${width}`);

  // Every row is prefixed with its filter type. 0 is "none": there is no
  // compressor behind this, so a cleverer filter would only cost time.
  const stride = width / 4;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + stride);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const value = (pixels[y * width + x] as number) & 3;
      // Most significant bits first, which is how PNG reads sub-byte pixels.
      raw[row + 1 + (x >> 2)] |= value << (6 - (x % 4) * 2);
    }
  }

  const plte = new Uint8Array(palette.length * 3);
  for (let at = 0; at < palette.length; at++) {
    plte[at * 3] = (palette[at] as readonly number[])[0] as number;
    plte[at * 3 + 1] = (palette[at] as readonly number[])[1] as number;
    plte[at * 3 + 2] = (palette[at] as readonly number[])[2] as number;
  }

  const header = join([
    be32(width),
    be32(height),
    new Uint8Array([2, 3, 0, 0, 0]), // 2 bits per pixel, indexed, no interlace
  ]);

  return join([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", plte),
    chunk("IDAT", zlib(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
