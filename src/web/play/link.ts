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
import { decodeCharacter, encodeCharacter } from "../../core/chr.ts";
import type { Build, Creature, Weapon } from "../../core/creature.ts";
import type { Sprite } from "../../core/sprite.ts";

export interface SharedLevel {
  readonly level: Level;
  readonly slug: string;
}

/** Turn a title into something that survives a URL and a group chat. */
/**
 * What a level is called when its link does not say.
 *
 * slugify() never produces an empty slug, but a hash is typed, forwarded and
 * mangled by things that are not this code -- `#p//CODE` is a link somebody can
 * arrive with, and it used to leave the title bar blank and put an empty box in
 * the "played before" row. A level always has a name, even if it is this one.
 */
export const UNNAMED = "a-level";

export function slugify(title: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : UNNAMED;
}

export function linkFor(level: Level, title: string, base: string): string {
  return `${base}#p/${slugify(title)}/${encodeLevel(level)}`;
}

// --- sending a level WITH your time -----------------------------------------
//
// Shape:  <site>/#c/<slug>/<score>/<who>/<code>
//
// A level and nothing else is an invitation. A level with the time you did it
// in is a challenge, and a challenge is the thing a child actually wants to
// send. The share button is only open once you have beaten the level, so there
// is always a time to put in it.
//
// A separate kind rather than an extra piece on the end of `#p/`, because a
// level code is base64url and a run of digits is a perfectly good code: there
// is no way to look at the last segment of a `#p/` link and know whether it is
// a time or part of the level. Every `#p/` link ever sent still means exactly
// what it meant.
//
// What it does NOT carry is the creature itself. A whole character is about
// 130 characters on top of the level, which is what a reply pays because a
// reply is ABOUT the creature. Here the creature is a footnote to the number,
// so only its name travels -- and a name is what makes the number mean
// anything, since a quick creature and a strong one are not racing the same
// race.

export interface SharedChallenge {
  readonly level: Level;
  readonly slug: string;
  /** In whatever the engine counts: seconds in real time, turns otherwise. */
  readonly score: number;
  /** What they played it as. Never empty -- see UNNAMED. */
  readonly who: string;
}

export function challengeLinkFor(
  level: Level,
  title: string,
  score: number,
  who: string,
  base: string,
): string {
  const safe = Math.max(0, score | 0);
  return `${base}#c/${slugify(title)}/${safe}/${slugify(who)}/${encodeLevel(level)}`;
}

/**
 * The challenge this URL is carrying, or null when it is not a challenge link.
 *
 * The LEVEL is what a child tapped the link to play, so it is decoded first
 * and strictly. A damaged time or name loses the boast, which is a shame; if
 * it took the level with it there would be nothing to do at all.
 */
export function challengeFromHash(hash: string): SharedChallenge | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.length === 0) return null;

  const parts = raw.split("/");
  if (parts.length < 5 || parts[0] !== "c") return null;

  const slug = parts[1] as string;
  const score = Number.parseInt(parts[2] as string, 10);
  const who = parts[3] as string;
  const code = parts.slice(4).join("/");
  if (code.length === 0) throw new CodecError("that link has a name but no level in it");

  return {
    level: decodeLevel(code),
    slug: slug === "" ? UNNAMED : slug,
    // A time that did not survive the trip is shown as no time at all, rather
    // than as NaN seconds.
    score: Number.isFinite(score) && score >= 0 ? score | 0 : -1,
    who: who === "" ? UNNAMED : who,
  };
}

// --- sending a result back ---------------------------------------------------
//
// Spec S16 day 11: "send back a result: they watch how you beat it". The
// watching half does not fit and never could -- a one-minute run is 1,700 to
// 3,000 characters run-length encoded, against 76 for a level, and the spec's
// own budget warns above 150. Measured, not assumed.
//
// What fits is the part that actually makes it a conversation: WHO beat it,
// HOW FAST, and the creature they did it with. That is about 130 characters on
// top of the level, and it turns a link you were sent into a reply.
//
// Shape:  <site>/#r/<slug>/<score>/<levelCode>/<characterCode>
// The score is the engine's own number -- seconds for a real-time level, turns
// for a turn-based one -- and the page that opens it knows which, because the
// level says which engine it is.

export interface SharedResult {
  readonly level: Level;
  readonly slug: string;
  /**
   * The creature that beat it, so you can try it yourself -- or null if that
   * part of the link did not survive the trip.
   *
   * The LEVEL is what a child tapped the link to play. If the creature is
   * damaged the boast is lost, which is a shame; if that took the level with
   * it, there would be nothing to do at all. So the level is decoded first and
   * strictly, and the creature is allowed to fail on its own.
   */
  readonly creature: Creature | null;
  readonly who: string | null;
  /** Seconds for a real-time level, turns for a turn-based one. */
  readonly score: number;
}

export function resultLinkFor(
  level: Level,
  title: string,
  name: string,
  build: Build,
  sprite: Sprite,
  weapon: Weapon,
  score: number,
  base: string,
): string {
  const character = encodeCharacter(name, build, sprite, weapon);
  return `${base}#r/${slugify(title)}/${Math.max(0, score | 0)}/${encodeLevel(level)}/${character}`;
}

/**
 * The result this URL is boasting about, or null when it is not a result link.
 *
 * A broken one throws rather than silently becoming an ordinary level: the
 * player tapped a reply, and being quietly given something else is worse than
 * being told it did not work.
 */
export function resultFromHash(hash: string): SharedResult | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.length === 0) return null;

  const parts = raw.split("/");
  if (parts.length < 5 || parts[0] !== "r") return null;

  const slug = parts[1] as string;
  const score = Number.parseInt(parts[2] as string, 10);
  const levelCode = parts[3] as string;
  const character = parts.slice(4).join("/");
  if (levelCode.length === 0) throw new CodecError("that link has a name but no level in it");

  // The level first, and strictly: without it there is nothing to play.
  const level = decodeLevel(levelCode);

  let creature: Creature | null = null;
  let who: string | null = null;
  try {
    const decoded = decodeCharacter(character);
    creature = decoded.creature;
    who = decoded.name;
  } catch {
    // A damaged creature costs the boast, not the game.
  }

  return {
    level,
    slug: slug === "" ? UNNAMED : slug,
    creature,
    who,
    score: Number.isFinite(score) && score >= 0 ? score : 0,
  };
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

  return { level: decodeLevel(code), slug: slug === "" ? UNNAMED : slug };
}
