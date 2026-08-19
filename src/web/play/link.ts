// Reading and writing the share link.
//
// The level lives in the URL *fragment*, never the path. Two reasons, and only
// one of them is technical:
//
//   * static hosting has no router. GitHub Pages would 404 on /p/<slug>/, and
//     the spec's URL shape assumes a host that can rewrite. See docs/adr/0006.
//   * a fragment is never sent to the server. Kids' levels stay off every access
//     log between here and their friend's phone, which is a nice property to
//     get for free.
//
// Shape:  <site>/#p/<slug>/<code>
// The slug is decoration -- it is what makes the link readable in a group chat.
// Nothing reads it back; the code alone is the level.

import { decodeLevel, encodeLevel, CodecError } from "../../core/codec.ts";
import type { Level } from "../../core/level.ts";

export interface SharedLevel {
  readonly level: Level;
  readonly slug: string;
}

/** Turn a title into something that survives a URL and a group chat. */
export function slugify(title: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : "a-level";
}

export function linkFor(level: Level, title: string, base: string): string {
  return `${base}#p/${slugify(title)}/${encodeLevel(level)}`;
}

/**
 * The level this URL is asking for, or null when the URL is not a share link.
 * Throws CodecError when it *is* one and the code is broken -- the caller has to
 * tell the player something, not silently drop them into a different level.
 */
export function levelFromHash(hash: string): SharedLevel | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.length === 0) return null;

  const parts = raw.split("/");
  if (parts.length < 3 || parts[0] !== "p") return null;

  const slug = parts[1] as string;
  const code = parts.slice(2).join("/");
  if (code.length === 0) throw new CodecError("that link has a name but no level in it");

  return { level: decodeLevel(code), slug };
}
