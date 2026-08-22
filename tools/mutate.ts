// Break things on purpose, and check the suite notices.
//
// WHY
//
// "reach lifts a gem from further away" built a long arm and a short arm,
// walked them the same path, and checked the long one collected no later.
// REACH stopped being a spendable characteristic in adr/0012, so `Build` has
// no such key and the two creatures were IDENTICAL: it compared a number to
// itself. It passed every run for nine days.
//
// A green suite says the tests did not fail. It does not say they COULD. This
// asks the only question that separates those two: if the thing were broken,
// would anybody know?
//
// Each mutation below is a real defect this project has shipped or nearly
// shipped, written as a one-line edit. A mutation that SURVIVES -- suite still
// green with the code broken -- is a hole, and the report names it.
//
// Not in `bun run check`: it runs the whole suite once per mutation, so it is
// minutes rather than seconds. Run it when you add a guard test, to find out
// whether you added one.

const SUITE = ["bun", "test"] as const;

interface Mutation {
  /** What real defect this re-creates. */
  readonly breaks: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
}

const MUTATIONS: readonly Mutation[] = [
  {
    // The spike escapes and every child is in the experiment. The single most
    // important property of a thing built as "don't break any existing code".
    breaks: "the blocks spike turns itself on for everybody",
    file: "src/web/play/iso.ts",
    find: '  return new URLSearchParams(search).get("iso") === "1";',
    replace: "  return true;",
  },
  {
    // A city of tall towers is beautiful and unplayable: the streets and
    // everyone standing in them vanish behind the skyline.
    breaks: "nothing is seen through, so the player disappears behind a tower",
    file: "src/web/play/iso.ts",
    find: "  return nearer > 0 && nearer <= 6;",
    replace: "  return false;",
  },
  {
    // A tower every cell is not a castle, it is a fence -- and it erases the
    // shape the child drew.
    breaks: "a straight run of wall becomes a row of turrets",
    file: "src/core/tileset.ts",
    find: "  return !(north && south) && !(east && west);",
    replace: "  return true;",
  },
  {
    // "Single cells should be turrets" -- the lone case, which is the whole of
    // a small fort.
    breaks: "a wall cell standing on its own stops being a turret",
    file: "src/core/tileset.ts",
    find: "  if (walls === 0) return true;",
    replace: "  if (walls === 0) return false;",
  },
  {
    // Every palm on every beach becomes a sandcastle. Found by writing the
    // sandcastles: the kinds path ran before the `alone` check.
    breaks: "a lone wall stops being a palm, because the castles outrank it",
    file: "src/web/play/renderer.ts",
    find: "if (tile === TILE_WALL && !alone && this.towers.size > 0) {",
    replace: "if (tile === TILE_WALL && this.towers.size > 0) {",
  },
  {
    // All castle everywhere is a wall of battlements with no beach left in it.
    breaks: "every beach wall is a sandcastle, so a drawn shape stops reading",
    file: "src/core/tileset.ts",
    find: "const CASTLE_KINDS: readonly Pattern[] = [DUNE, CASTLE_WALL, CASTLE_DOOR, CASTLE_LOW];",
    replace: "const CASTLE_KINDS: readonly Pattern[] = [CASTLE_WALL, CASTLE_WALL, CASTLE_DOOR, CASTLE_LOW];",
  },
  {
    // The Easter egg fires by accident. Touching the top row happens constantly
    // in ordinary play, and a child yanked out of a friend's level has not
    // found a secret, they have found a crash.
    breaks: "the surface egg fires on a touch, not a push",
    file: "src/web/play/surface.ts",
    find: "    if (!atTop || !holdingUp) {",
    replace: "    if (false) {",
  },
  {
    // ...or the push accumulates across the whole level instead of being a
    // held second at the surface.
    breaks: "pushing at the surface adds up across a whole run",
    file: "src/web/play/surface.ts",
    find: "      this.held = 0;\n      return false;",
    replace: "      return false;",
  },
  {
    // The point of calm/3. Ice that is not in the hash is state a replay can
    // disagree about, and a garden link is only worth anything because the
    // proof replays cold.
    breaks: "frozen water never reaches the hash, so a proof stops proving",
    file: "src/engines/calm/v3.ts",
    find: "    for (let i = 0; i < this.ice.length; i = (i + 1) | 0) {\n      h = hashInt32(h, this.ice[i] as number);",
    replace: "    for (let i = 0; i < 0; i = (i + 1) | 0) {\n      h = hashInt32(h, this.ice[i] as number);",
  },
  {
    // A wand that freezes for ever is a bucket, and the trade goes away.
    breaks: "ice never wears off, so a wand becomes a bucket",
    file: "src/engines/calm/v3.ts",
    find: "      if (left > 0) this.ice[i] = (left - 1) | 0;",
    replace: "      if (left > 0) this.ice[i] = left | 0;",
  },
  {
    // A sword must get nothing. That is the trade, the same shape as "a wand
    // never kills".
    breaks: "a sword freezes water too, so the wand has no job again",
    file: "src/engines/swim/v4.ts",
    find: '  if (creature.weapon !== "wand") return 0;',
    replace: "  if (false) return 0;",
  },
  {
    // One cell at a time means standing in the water to reach the next one.
    breaks: "only the cell in front freezes, so crossing costs a heart a square",
    file: "src/engines/calm/v3.ts",
    find: "        if (next < 0 || reached[next] === 1) continue;",
    replace: "        if (true) continue;",
  },
  {
    // The garden's pond is SOLID, so ice is a bridge rather than a painkiller.
    // Without this the freeze does nothing at all in the garden.
    breaks: "frozen ponds stay solid, so the garden's wand does nothing",
    file: "src/engines/calm/v3.ts",
    find: "        && this.alight(pondX, pondY)) return false;",
    replace: "        && true) return false;",
  },
  {
    // Reported: "it's weird for a jaeger to have a wand".
    breaks: "the jaeger goes back to waving a wand at a kaiju",
    file: "src/web/play/weapon.ts",
    find: '  if (engine === "raze") return weapon === "wand" ? "coldlaser" : "laser";',
    replace: '  if (engine === "raze" && weapon !== "wand") return "laser";',
  },
  {
    // The bug itself: a condition that named one engine, while four more
    // builds doused and showed no button.
    breaks: "the bucket goes back to being roam's alone, and four builds lose it",
    file: "src/web/play/water.ts",
    find: "  calm: 1,",
    replace: "",
  },
  {
    // ...and the other half, which hid it even in roam. The bucket is not an
    // action button and `#pad.one` must not sweep it up.
    breaks: "the pad hides the bucket again, so no game has ever had one",
    file: "src/web/play/index.html",
    find: "  #pad.one #swing { display: none; }",
    replace: "  #pad.one #swing, #pad.one #water { display: none; }",
  },
  {
    // Turning it on everywhere put a bucket of water on a lawn.
    breaks: "a bucket is offered on a pond, the sea and a bank of urchins",
    file: "src/web/play/water.ts",
    find: '  return hazard === "fire";',
    replace: "  return true;",
  },
  {
    // Reported as "a yellow creature": the icon beside a shared link was the
    // starter, and a link in WhatsApp is how this game travels.
    breaks: "the shared-link icon goes back to being somebody else's creature",
    file: "tools/icon.ts",
    find: 'import { VANCE } from "../src/core/creature.ts";',
    replace: 'import { BRUK as VANCE } from "../src/core/creature.ts";',
  },
  {
    // The garden drew the DUNGEON's door, on a lawn, for six days.
    breaks: "the garden's way out goes back to a padlocked oak door on the grass",
    file: "src/web/play/renderer.ts",
    find: "  garden: { shut: GARDEN_DOOR_SHUT, open: GARDEN_DOOR_OPEN },",
    replace: "",
  },
  {
    // The whole point of the editor's send button. If the code the bot played
    // is not compared with the code on the paper, the button stays open across
    // an edit and a child sends a room nothing has ever been through.
    breaks: "a proof of one room counts as a proof of the room it became",
    file: "src/web/level/sendable.ts",
    find: "  return run.code === code;",
    replace: "  return true;",
  },
  {
    // The narrower half: autoplay that could NOT finish must not open it.
    breaks: "a bot that failed to get out still opens the send button",
    file: "src/web/level/sendable.ts",
    find: "  if (!run.won && !run.place) return false;",
    replace: "  if (false) return false;",
  },
  {
    // Reported: the unbeaten wording read as a warning rather than an
    // invitation. Swapping it back is a silent regression -- nothing crashes,
    // the link still works, and the message is wrong in WhatsApp.
    breaks: "a level you designed goes out advertising that nobody has beaten it",
    file: "src/web/invite.ts",
    find: "    ? `Try playing this level I designed: ${invite.name}`",
    replace: "    ? `Play my level: ${invite.name} -- I have not done it yet!`",
  },
  {
    // The order of the four ways to send. The share sheet has to come first:
    // when the clipboard went first and failed silently, nothing appeared on
    // screen AND the old link stayed on the clipboard.
    breaks: "the clipboard is tried before the phone's own share sheet",
    file: "src/web/send.ts",
    find: '  if (typeof navigator.share === "function") {',
    replace: "  if (false) {",
  },
  {
    // The whole risk of raze/1 in one edit. A smashed building is state; state
    // that is not hashed is state a replay can disagree about, and a shared
    // level is only worth anything because the proof replays cold.
    breaks: "a smashed building never reaches the hash, so a proof stops proving",
    file: "src/engines/raze/v1.ts",
    find: "    for (let i = 0; i < this.razed.length; i = (i + 1) | 0) {\n      if (this.razed[i] === 0) continue;",
    replace: "    for (let i = 0; i < this.razed.length; i = (i + 1) | 0) {\n      if (this.razed[i] === 0 || true) continue;",
  },
  {
    breaks: "any creature can level a building, so strength unlocks nothing again",
    file: "src/engines/raze/v1.ts",
    find: "export const SMASH_PIP = 4;",
    replace: "export const SMASH_PIP = 0;",
  },
  {
    breaks: "a smashed building never stops burning, so you can wall yourself in",
    file: "src/engines/raze/v1.ts",
    find: "      if (left > 0) this.ember[i] = (left - 1) | 0;",
    replace: "      if (left > 0) this.ember[i] = left | 0;",
  },
  {
    breaks: "the city hands the jaeger a sword to fight a kaiju with",
    file: "src/web/play/weapon.ts",
    find: '  if (engine === "raze") return weapon === "wand" ? "coldlaser" : "laser";',
    replace: '  if (engine === "raze") return "sword";',
  },

  {
    // The other half of the same line, and the one that shipped: `none` on a
    // body turns the page's own scrolling off with the pinch.
    breaks: "the creature editor stops scrolling, because its body says none",
    file: "src/web/make/index.html",
    find: "    touch-action: pan-y;",
    replace: "    touch-action: none;",
  },
  {
    breaks: "freshening a draft drops its skin, so the beach opens as a garden",
    file: "src/core/draft.ts",
    find: "  tilesetId = draft.tilesetId,",
    replace: "  tilesetId = 0,",
  },
  {
    breaks: "the city forgets it is a skin, so a city level renders as a cave",
    file: "src/core/tileset.ts",
    find: "const SKINS: Readonly<Record<number, Tileset>> = { 5: BEACH, 6: CITY };",
    replace: "const SKINS: Readonly<Record<number, Tileset>> = { 5: BEACH };",
  },
  {
    breaks: "the city's palette says door and treasure over a pad and a person",
    file: "src/web/level/palette.ts",
    find: 'names: { garden: "flowers", beach: "shells", city: "people" }',
    replace: 'names: { garden: "flowers", beach: "shells" }',
  },
  {
    breaks: "a level's skin is read from 1, so every shipped reef link is a cave",
    file: "src/core/tileset.ts",
    find: "export const FIRST_SKIN = 5;",
    replace: "export const FIRST_SKIN = 1;\nconst ALL_SETS: Readonly<Record<number, Tileset>> = " +
      "{ 1: UNDERGROUND, 2: OUTSIDE, 3: REEF, 4: GARDEN };",
  },
  {
    breaks: "the beach forgets it is a skin, so a beach level renders as a garden",
    file: "src/core/tileset.ts",
    find: "const SKINS: Readonly<Record<number, Tileset>> = { 5: BEACH, 6: CITY };",
    replace: "const SKINS: Readonly<Record<number, Tileset>> = { 6: CITY };",
  },
  {
    breaks: "switching tab within one engine drops the skin, so the beach tab does nothing",
    file: "src/core/draft.ts",
    find: "  if (engine === draft.engine) return { ...draft, behaviourVersion, tilesetId };",
    replace: "  if (engine === draft.engine) return { ...draft, behaviourVersion };",
  },
  {
    breaks: "the underwater weapon goes back to a sword",
    file: "src/web/play/weapon.ts",
    find: '  if (engine === "swim") return "trident";',
    replace: '  if (engine === "swim") return "sword";',
  },
  {
    breaks: "a wand turns into a trident underwater, so the picture lies about what it does",
    file: "src/web/play/weapon.ts",
    find: '  if (weapon === "wand") return "wand";',
    replace: "  if (false) return \"wand\";",
  },
  {
    breaks: "ponds go back to a rim on every side, so a big pool reads as puddles",
    file: "src/core/tileset.ts",
    find: "export function pondFor(open: number): Pattern {",
    replace: "export function pondFor(open: number): Pattern {\n  open = POND_N | POND_E | POND_S | POND_W;",
  },
  {
    breaks: "a pond stops looking at its neighbours, so nothing ever joins up",
    file: "src/core/tileset.ts",
    find: "  return (same(x, y - 1) ? 0 : POND_N)",
    replace: "  return (false ? 0 : POND_N)",
  },
  {
    breaks: "enemies in the side-on game stop falling (the day-18 bug)",
    file: "src/engines/dash/v8.ts",
    find: "  private dropWalker(walker: Walker): void {",
    replace: "  private dropWalker(walker: Walker): void {\n    if (walker !== undefined) return;",
  },
  {
    breaks: "enemies stop moving at all (the day-17 bug)",
    file: "src/engines/roam/v8.ts",
    find: "export const ENEMY_SPEED = 22;",
    replace: "export const ENEMY_SPEED = 0;",
  },
  {
    breaks: "a current stops pushing, so strength has no job underwater",
    file: "src/engines/swim/v3.ts",
    find: "export const FLOW_PUSH = 54;",
    replace: "export const FLOW_PUSH = 0;",
  },
  {
    breaks: "the underwater palette says goblin over a picture of a shark",
    file: "src/web/level/palette.ts",
    find: 'names: { reef: "shark", garden: "bear", beach: "crab", city: "kaiju" }',
    replace: 'names: { reef: "goblin", garden: "bear", beach: "crab", city: "kaiju" }',
  },
  {
    breaks: "the reef's cast is listed out of glyph order, so a shark draws as a squid",
    file: "src/core/enemies.ts",
    find: "  reef: REEF_CAST,\n  beach: BEACH_CAST,",
    replace: "  reef: [REEF_CAST[2], REEF_CAST[1], REEF_CAST[0]] as readonly Enemy[],\n  beach: BEACH_CAST,",
  },
  {
    // Eighteen days of undecodable QR codes. Everything that checked the
    // encoder checked it against itself; nothing compared it to a number from
    // outside. This mutation restores the exact swap.
    breaks: "the QR generator polynomial is built reversed (the day-18 bug)",
    file: "src/core/qr.ts",
    find: "      next[j] = (next[j] as number) ^ (poly[j] as number);\n      next[j + 1] = (next[j + 1] as number) ^ gfMul(poly[j] as number, EXP[i] as number);",
    replace: "      next[j] = (next[j] as number) ^ gfMul(poly[j] as number, EXP[i] as number);\n      next[j + 1] = (next[j + 1] as number) ^ (poly[j] as number);",
  },
  {
    // The one place in the project where WHICH creature it is changes what it
    // does. If this ever stops holding, a garden fills with things that hunt.
    breaks: "bunnies and squirrels start hunting you like the bear (calm/2)",
    file: "src/engines/calm/v2.ts",
    find: "      if (enemy.art !== BEAR) continue;\n      if (chebyshev(enemy.x, enemy.y, this.x, this.y) > BODY + BODY) continue;",
    replace: "      if (chebyshev(enemy.x, enemy.y, this.x, this.y) > BODY + BODY) continue;",
  },
  {
    // The value that looks right and is not: `manipulation` turns off
    // double-tap and leaves PINCH alone, which is the gesture two thumbs make
    // by accident all game long.
    breaks: "the play page hands pinch back to the browser",
    file: "src/web/play/index.html",
    find: "    touch-action: pan-y;\n  }\n  /* The title stays centred",
    replace: "    touch-action: manipulation;\n  }\n  /* The title stays centred",
  },
  {
    breaks: "drowning stops saying it is drowning",
    file: "src/web/play/breath.ts",
    find: 'return { text: "no air -- swim up!", said: AIR_OUT };',
    replace: "return { text: null, said: AIR_OUT };",
  },
  {
    breaks: "the garden is reported as a level somebody failed to finish",
    file: "src/core/bot.ts",
    find: "  const place = aPlace(level.engine, level.behaviourVersion);",
    replace: "  const place = false;",
  },
  {
    breaks: "the garden demands a door the palette will not sell you",
    file: "src/core/advice.ts",
    find: "  const place = aPlace(result.level.engine, result.level.behaviourVersion);",
    replace: "  const place = false;",
  },
  {
    // The first attempt here was `TILE_TREASURE = 4 as number`, which changes
    // nothing at all -- so it survived, correctly, and told me only that I had
    // written a mutation that does not mutate. A mutation that cannot break
    // anything is the same mistake as a test that cannot fail.
    breaks: "a cosmetic tileset id reaches stateHash (hard rule 4)",
    file: "src/engines/roam/v8.ts",
    find: "    h = hashInt32(h, this.collected);",
    replace: "    h = hashInt32(h, this.collected);\n    h = hashInt32(h, this.level.tilesetId);",
  },
];

async function suiteIsGreen(): Promise<boolean> {
  const run = Bun.spawnSync([...SUITE], { stdout: "pipe", stderr: "pipe" });
  return run.exitCode === 0;
}

async function main(): Promise<void> {
  if (!(await suiteIsGreen())) {
    console.log("the suite is RED before any mutation. Fix that first.");
    process.exit(1);
  }

  const survivors: Mutation[] = [];
  console.log(`${MUTATIONS.length} mutations, each one a defect this project has shipped or nearly shipped.\n`);

  for (const mutation of MUTATIONS) {
    const path = mutation.file;
    const original = await Bun.file(path).text();
    if (!original.includes(mutation.find)) {
      console.log(`  ?? ${mutation.breaks}\n     (no longer applies: the code it edits has moved -- fix or drop it)`);
      survivors.push(mutation);
      continue;
    }
    try {
      await Bun.write(path, original.replace(mutation.find, mutation.replace));
      const green = await suiteIsGreen();
      console.log(`  ${green ? "SURVIVED" : "caught  "}  ${mutation.breaks}`);
      if (green) survivors.push(mutation);
    } finally {
      // Always, on every path. A mutation left behind is a broken checkout.
      await Bun.write(path, original);
    }
  }

  console.log("");
  if (survivors.length === 0) {
    console.log(`all ${MUTATIONS.length} caught: every one of these defects fails at least one test.`);
    return;
  }
  console.log(`${survivors.length} SURVIVED -- these can break with the suite still green:`);
  for (const one of survivors) console.log(`  - ${one.breaks}\n      ${one.file}`);
  process.exit(1);
}

if (import.meta.main) await main();
