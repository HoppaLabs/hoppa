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
    // The deadlock. `justKilled()` is a per-TICK flag and the page reads it
    // per FRAME; while the world is held no tick runs, so without this gate
    // the flag never clears, every frame re-triggers the hold, and the game
    // stops dead on the first kill. Found in a browser, not in a test.
    breaks: "the world holds for ever on the first kill",
    file: "src/web/play/hitstop.ts",
    find: "    if (tick === this.seen) return false;",
    replace: "    if (false) return false;",
  },
  {
    // A hold that never runs out is the same deadlock by another route.
    breaks: "the flinch never ends, so the clock never restarts",
    file: "src/web/play/hitstop.ts",
    find: "    if (this.left > 0) this.left = (this.left - 1) | 0;",
    replace: "    if (this.left > 0) this.left = this.left | 0;",
  },
  {
    // Banking time through a hold turns a pause into a lurch: the moment it
    // lets go, every missed tick runs in one frame.
    breaks: "the loop banks time while held, so the pause ends in a lurch",
    file: "src/web/play/realtime.ts",
    find: "        this.pump.reset();\n      } else if (!this.finished()) {",
    replace: "      } else if (!this.finished()) {",
  },
  {
    // "Not surrounded by sandcastle walls." The edge of the room is not a
    // thing anybody built, and a ring of castles round it drowns out the
    // shapes a child actually drew.
    breaks: "the beach is walled in by sandcastles again",
    file: "src/core/tileset.ts",
    find: '  rim: "sea",',
    replace: "",
  },
  {
    // A bay drawn down to the shore grows a shoreline between itself and the
    // sea it runs into.
    breaks: "painted water no longer joins the sea along the bottom",
    file: "src/core/tileset.ts",
    find: "  if (seaRim && y === GRID_H - 2) return open & ~POND_S;",
    replace: "  if (false) return open & ~POND_S;",
  },
  {
    // Reported as "the seagulls are moving in the wrong direction". A sprite
    // drawn facing left, in a renderer that mirrors for left, walks backwards
    // for its whole life.
    //
    // The row picked matters: this one carries the BEAK, which is the landmark
    // test/facing-art.test.ts measures. The first version of this mutation
    // flipped an outline row instead and sailed straight through -- a mutation
    // that cannot break the thing the test looks at is not a mutation.
    breaks: "the gull goes back to being drawn facing the wrong way",
    file: "src/core/enemies.ts",
    find: '    "...6444444444556",',
    replace: '    "6554444444446...",',
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
    // "The sandcastles look like haystacks, we need to see them from above."
    // The shadow round the open edges is what makes a flat top read as a wall
    // seen from overhead rather than as a lump of sand.
    breaks: "a wall stops throwing a shadow, so a plan view reads as a haystack",
    file: "src/core/tileset.ts",
    find: '      edge(side, step, 0, "1");',
    replace: "",
  },
  {
    // "The turrets should be round." A circle drawn in a square leaves its
    // four corners as the sand outside it; filling them makes it a block.
    breaks: "the corner turret stops being round",
    file: "src/core/tileset.ts",
    find: "      else if (away <= 54) put(x, y, \"1\");   // the shadow it throws",
    replace: '      put(x, y, "1");',
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
    // The garden's exit, the OTHER way it can go wrong. It used to be a table
    // entry pointing at a wooden door; that entry has been dead since flags
    // arrived, so deleting it broke nothing and the mutation proved nothing.
    // What actually decides the garden's way out now is this set.
    breaks: "the garden stops flying a flag and goes back to the dungeon's door",
    file: "src/web/play/renderer.ts",
    find: '"garden", ',
    replace: "",
  },
  {
    // Reported as "I don't think brown airlock good in the sci-fi level" --
    // which is what a world absent from the door table gets. Nothing was an
    // error; it just quietly drew an oak door in orbit.
    breaks: "an oak door in orbit again",
    file: "src/web/play/renderer.ts",
    find: "  space: { shut: AIRLOCK_SHUT, open: AIRLOCK_OPEN },",
    replace: "",
  },
  {
    // Reported: the unbeaten wording read as a warning rather than an
    // invitation. Swapping it back is a silent regression -- nothing crashes,
    // the link still works, and the message is wrong in WhatsApp.
    breaks: "a level you designed goes out advertising that nobody has beaten it",
    file: "src/web/invite.ts",
    find: "? `Try playing this level I designed: ${invite.name}${can}`",
    replace: "? `Play my level: ${invite.name} -- I have not done it yet!${can}`",
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
    // Just the one entry, not the whole line. Matching the line meant every
    // world added after this was written retired it without a word.
    find: "6: CITY, ",
    replace: "",
  },
  {
    breaks: "the city's palette says door and treasure over a pad and a person",
    file: "src/web/level/palette.ts",
    find: ', city: "people"',
    replace: "",
  },
  {
    breaks: "a level's skin is read from 1, so every shipped reef link is a cave",
    file: "src/core/tileset.ts",
    find: "export const FIRST_SKIN = 5;",
    replace: "export const FIRST_SKIN = 1;\nconst ALL_SETS: Readonly<Record<number, Tileset>> = " +
      "{ 1: UNDERGROUND, 2: OUTSIDE, 3: REEF, 4: GARDEN };",
  },
  {
    breaks: "the station forgets it is a skin, so a space level renders as a cave",
    file: "src/core/tileset.ts",
    find: ", 9: SPACE",
    replace: "",
  },
  {
    breaks: "the beach forgets it is a skin, so a beach level renders as a garden",
    file: "src/core/tileset.ts",
    find: "{ 5: BEACH, ",
    replace: "{ ",
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
    find: 'reef: "shark"',
    replace: 'reef: "goblin"',
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
  {
    // dash/9 exists because dash/8 moved at full speed on the tick the button
    // went down and stopped dead on the tick it came up. That is the "moving a
    // cursor" the whole build was asked to fix, so it is the first thing worth
    // checking a test would notice coming back.
    breaks: "the platformer goes back to instant full speed (no weight)",
    file: "src/engines/dash/v9.ts",
    find: "      this.vx = towards(this.vx, (this.run * dx) | 0, push);",
    replace: "      this.vx = ((this.run * dx) | 0);",
  },
  {
    // The other half of the same defect: letting go should coast, not brake.
    breaks: "letting go stops dead instead of sliding",
    file: "src/engines/dash/v9.ts",
    find: "      this.vx = towards(this.vx, 0, drag);",
    replace: "      this.vx = 0;",
  },
  {
    // Coyote time that never expires is worse than none: you can jump from
    // anywhere in mid-air for the rest of the fall, which is a double jump
    // nobody asked for and quietly makes every level easier.
    breaks: "coyote time never runs out, so you can jump in mid-air",
    file: "src/engines/dash/v9.ts",
    find: "    else if (this.coyote > 0) this.coyote = (this.coyote - 1) | 0;",
    replace: "    else if (this.coyote > 0) this.coyote = this.coyote | 0;",
  },
  {
    // Arming the buffer on the button being DOWN rather than on the press
    // means holding jump re-arms it every tick: you bounce for ever.
    breaks: "holding jump re-arms the buffer, so you bounce for ever",
    file: "src/engines/dash/v9.ts",
    find: "    if (jumpDown && !this.jumpWasDown) this.buffered = BUFFER_TICKS;",
    replace: "    if (jumpDown) this.buffered = BUFFER_TICKS;",
  },
  {
    // The jump cut must only touch a jump the player asked for. Applied to
    // every upward move it also clips the bounce off an enemy's head, taking
    // the reward away from the risk.
    breaks: "the jump cut also clips bounces the player did not ask for",
    file: "src/engines/dash/v9.ts",
    find: "    if (this.jumping) {\n      if (this.vy >= 0) this.jumping = false;",
    replace: "    if (true) {\n      if (this.vy >= 0) this.jumping = false;",
  },
  {
    // A fall is stepped in body-wide slices so nothing tunnels through a thin
    // floor. Throwing away a slice that does not fit leaves you standing a
    // third of a cell above the floor, sinking into it over the next ten ticks
    // with `grounded` flickering on and off all the way down.
    breaks: "landing stops short of the floor and then sinks into it",
    file: "src/engines/dash/v9.ts",
    find: "          if (this.fits(this.x, settled)) this.y = settled;",
    replace: "          if (false) this.y = settled;",
  },
  {
    // The top-down half of "it feels like moving a cursor": position assigned
    // straight from the button, with nothing in between.
    breaks: "the top-down game goes back to instant full speed",
    file: "src/engines/roam/v9.ts",
    find: "      : towards(this.vx, wantX, pushFor(this.vx, wantX, accel));",
    replace: "      : (wantX | 0);",
  },
  {
    breaks: "letting go from above stops dead instead of coasting",
    file: "src/engines/roam/v9.ts",
    find: "      ? towards(this.vx, 0, drag)",
    replace: "      ? 0",
  },
  {
    // Holding two buttons used to move you the full speed on BOTH axes: 41%
    // faster across the room than any straight line. Every player finds it
    // within a minute and then never walks straight again, and every room's
    // difficulty was tuned against a speed nobody was using.
    breaks: "a diagonal is a 41% speed boost again",
    file: "src/core/steer.ts",
    find: "export const DIAGONAL = 181;",
    replace: "export const DIAGONAL = 256;",
  },
  {
    // A body clears a one-cell door with 32 subcells to spare and nothing on
    // screen says whether you are inside that window. Without the assist you
    // simply stop, with the gap visibly right there.
    breaks: "a doorway you are nearly lined up with stops you dead again",
    file: "src/engines/roam/v9.ts",
    find: "        const step = straightX ? alignStep(this.y) : 0;",
    replace: "        const step = 0;",
  },
  {
    // The assist has to ask whether being lined up would OPEN the way. Without
    // that test it shuffles you about at every wall you lean on.
    breaks: "the corner assist shuffles you about at a wall with no door in it",
    file: "src/engines/roam/v9.ts",
    find: "        if (worthSlipping(step) && this.fits(nx, middleOf(this.y)) && this.fits(this.x, ny)) {",
    replace: "        if (worthSlipping(step) && this.fits(this.x, ny)) {",
  },
  {
    // A press that lands inside the last swing used to be dropped on the
    // floor, which is felt as the game ignoring you rather than as being early.
    breaks: "a swing asked for during the last one is dropped again",
    file: "src/core/steer.ts",
    find: "  if (down && !wasDown) return SWING_BUFFER_TICKS;",
    replace: "  if (down) return SWING_BUFFER_TICKS;",
  },
  {
    // A hit that moves you two cells in one tick reads as a glitch, not as
    // being thrown.
    breaks: "a hit stops throwing you and just takes a heart",
    file: "src/engines/roam/v9.ts",
    find: "      this.vx = knock.vx;\n      this.vy = knock.vy;",
    replace: "      this.vx = 0;\n      this.vy = 0;",
  },
  {
    breaks: "a hit leaves you in full control, so it never lands",
    file: "src/engines/roam/v9.ts",
    find: "      this.stun = STUN_TICKS;",
    replace: "      this.stun = 0;",
  },
  // calm/4, raze/2 and swim/5 are COPIES of roam/9's movement, because hard
  // rule 3 forbids editing a shipped build. Three copies is three chances for
  // one of them to drift, and a test that only ever exercises roam would not
  // notice. So each copy gets its own mutation.
  {
    breaks: "the garden goes back to instant full speed",
    file: "src/engines/calm/v4.ts",
    find: "      : towards(this.vx, wantX, pushFor(this.vx, wantX, accel));",
    replace: "      : (wantX | 0);",
  },
  {
    breaks: "a gap between the garden's hedges stops you dead again",
    file: "src/engines/calm/v4.ts",
    find: "        const step = straightX ? alignStep(this.y) : 0;",
    replace: "        const step = 0;",
  },
  {
    breaks: "the city goes back to instant full speed",
    file: "src/engines/raze/v2.ts",
    find: "      : towards(this.vx, wantX, pushFor(this.vx, wantX, accel));",
    replace: "      : (wantX | 0);",
  },
  {
    breaks: "a hit in the city stops throwing you",
    file: "src/engines/raze/v2.ts",
    find: "      this.vx = knock.vx;\n      this.vy = knock.vy;",
    replace: "      this.vx = 0;\n      this.vy = 0;",
  },
  {
    // The reef's own diagonal fix: the cap is per axis, so without cutting it
    // when both are held, two buttons buy 41% more speed than one.
    breaks: "swimming diagonally is a 41% speed boost again",
    file: "src/engines/swim/v5.ts",
    find: "    const cap = dx !== 0 && dy !== 0 ? (Math.imul(full, DIAGONAL) >> 8) | 0 : full;",
    replace: "    const cap = full;",
  },
  {
    breaks: "a gap in the reef's rock stops you dead again",
    file: "src/engines/swim/v5.ts",
    find: "        const step = straightX ? alignStep(this.y) : 0;",
    replace: "        const step = 0;",
  },
  {
    // swim/5's whole promise is that the WATER is untouched. A build that
    // quietly changed the drift would still pass every corner test here.
    breaks: "the reef's drift changes, so swimming stops feeling like water",
    file: "src/engines/swim/v5.ts",
    find: "    this.vx = pushed(this.vx, dx, cap);",
    replace: "    this.vx = pushed(this.vx, dx, (cap / 2) | 0);",
  },
  {
    // The other half of "moving a cursor", and the half no engine can fix: a
    // creature that accelerates beautifully and never moves a leg is still a
    // picture being slid across a screen.
    breaks: "the player stops walking and goes back to sliding",
    file: "src/web/play/stride.ts",
    find: "  if (pose === 1) return 1;",
    replace: "  if (pose === 1) return 0;",
  },
  {
    // Five rows moves the bottom third of the body with the feet: the creature
    // does not step, it waddles.
    breaks: "the walk shifts the body as well as the feet",
    file: "src/web/play/stride.ts",
    find: "export const LEG_ROWS = 3;",
    replace: "export const LEG_ROWS = 8;",
  },
  {
    // Half of all frames move nothing even at a dead run, because the screen
    // draws at sixty and the engine ticks at thirty. Without the grace the
    // creature snaps to attention every other frame.
    breaks: "the walk resets between every pair of frames, so it twitches",
    file: "src/web/play/stride.ts",
    find: "export const SETTLE_FRAMES = 5;",
    replace: "export const SETTLE_FRAMES = 1;",
  },
  {
    // A foot that reappears on the other side of the creature is a horror.
    breaks: "legs shoved off the edge wrap round to the other side",
    file: "src/web/play/stride.ts",
    find: "      out[row + x] = source >= 0 && source < SPRITE_W ? (pixels[row + source] as number) : 0;",
    replace: "      out[row + x] = pixels[row + (((source % SPRITE_W) + SPRITE_W) % SPRITE_W)] as number;",
  },
  {
    // Measured from where the drawing actually ends. Otherwise a creature drawn
    // floating, or small in the middle of the box, never moves a leg.
    breaks: "a creature drawn floating never gets a walk",
    file: "src/web/play/stride.ts",
    find: "  const floor = lowestInked(pixels);",
    replace: "  const floor = SPRITE_H - 1;",
  },
  {
    // Two of the four starters were the same creature: Bash and Vance had
    // byte-identical caps AND the same weapon, so the robot was a picture.
    breaks: "the jaeger goes back to being a reskin of Bash",
    file: "src/core/creature.ts",
    find: '  spriteFromRows(VANCE_ROWS, [3, 28, 0]),\n  "wand",',
    replace: "  spriteFromRows(VANCE_ROWS, [3, 28, 0]),",
  },
  {
    // The strength/speed axis inverts underwater and nothing said so. A child
    // picks Nim because fast sounds better and drowns in the reef.
    breaks: "the reef stops saying it is about strength",
    file: "src/web/play/rewards.ts",
    find: '  return engine === "swim" ? "strength" : null;',
    replace: "  return null;",
  },
  {
    // A highlight that is on everywhere is decoration, not information.
    breaks: "every world claims to be about strength, so the hint means nothing",
    file: "src/web/play/rewards.ts",
    find: '  return engine === "swim" ? "strength" : null;',
    replace: '  return "strength";',
  },
  {
    // Enemies stepped by distance with no memory, so one that stopped at the
    // end of its patrol stood there with a leg out.
    breaks: "enemies go back to standing about mid-stride",
    file: "src/web/play/renderer.ts",
    find: "      const pose = enemy.stunned ? 0 : this.strides.at(seat, enemy.x, enemy.y);",
    replace: "      const pose = enemy.stunned ? 0 : ((((enemy.x + enemy.y) / 128) | 0) % 4 + 4) % 4;",
  },
  {
    // The landing dust drawn inside the creature is dust nobody ever sees,
    // because it is drawn underneath. Found by rendering it at true scale.
    breaks: "the landing dust is drawn inside the creature, where it cannot be seen",
    file: "src/web/play/dust.ts",
    find: "  const dx = (7 + frame) | 0;",
    replace: "  const dx = (1 + frame) | 0;",
  },
  {
    breaks: "landing raises no dust at all",
    file: "src/web/play/dust.ts",
    find: "  return wasAirborne && !airborne && vy > DUST_AT_SPEED;",
    replace: "  return false;",
  },
  {
    // Pouring changed a class on the BUTTON and drew nothing on the board, so
    // the water tool read as broken. Reported exactly that way.
    breaks: "the bucket goes back to drawing no water at all",
    file: "src/web/play/pour.ts",
    find: "  if (done < 0 || done > 1) return [];",
    replace: "  if (true) return [];",
  },
  {
    // A stream, not one lump: the drops are staggered along the same throw.
    breaks: "the water comes out as one lump instead of a stream",
    file: "src/web/play/pour.ts",
    find: "    const at = (done * 2 + i / DROPS) % 1;",
    replace: "    const at = done;",
  },
  {
    // The editor's send button asks whether the room can become a link, not
    // whether a bot has been through it. Asked for directly.
    breaks: "the editor refuses to send a level that has not been autoplayed",
    file: "src/web/level/sendable.ts",
    find: "export function canSend(code: string): boolean {\n  if (code.trim() === \"\") return false;",
    replace: "export function canSend(code: string): boolean {\n  if (true) return false;",
  },

  {
    // A trap your friend can see coming is not a trap. Both kinds of box have
    // to leave the engine as the SAME tile.
    breaks: "a box holding a monster is drawn differently, so the trap shows",
    file: "src/engines/roam/v10.ts",
    find: "      this.tiles[cell] = this.opened[cell] === 1 ? TILE_BOX_OPEN : TILE_BOX;",
    replace: "      this.tiles[cell] = this.boxEnemy[cell] >= 0 ? TILE_BOX_OPEN : TILE_BOX;",
  },
  {
    // Opening the box before the weapon resolves puts a freshly released bear
    // inside the same swing's reach: one press opens the box AND kills what
    // came out. That is a button, not a gamble.
    breaks: "the swing that opens a box also kills what comes out",
    file: "src/engines/roam/v10.ts",
    find: "    this.openBoxAhead(dx, dy);\n  }",
    replace: "  }",
  },
  {
    breaks: "a monster in a box is loose from the first tick",
    file: "src/engines/roam/v10.ts",
    find: "          hp: this.enemyHits | 0, down: 0, hidden: 1,",
    replace: "          hp: this.enemyHits | 0, down: 0, hidden: 0,",
  },
  {
    // A gem in a box that did not count toward the door would make boxes
    // decoration: nothing would ever need opening.
    breaks: "a gem in a box stops counting toward the door",
    file: "src/engines/roam/v10.ts",
    find: "      this.collected = (this.collected | (1 << slot)) | 0;",
    replace: "      this.collected = this.collected | 0;",
  },
  {
    // A box that stopped being a wall would be a hole in the room from the
    // first tick, and in a side-on game a platform somebody was standing on.
    breaks: "a shut box is not a wall, so you walk straight through it",
    file: "src/engines/roam/v10.ts",
    find: "    return this.opened[idx(cx, cy)] === 0;",
    replace: "    return true;",
  },
  {
    breaks: "the side-on box cannot be opened by jumping into it",
    file: "src/engines/dash/v10.ts",
    find: "          if (!this.openBoxAt(west, head)) this.openBoxAt(east, head);",
    replace: "          void west; void east; void head;",
  },
  {
    breaks: "the side-on box stops being a wall, so it is not a platform either",
    file: "src/engines/dash/v10.ts",
    find: "    return this.opened[idx(cx, cy)] === 0;",
    replace: "    return true;",
  },
  {
    // The author's choice has to reach the wire, or it is a choice they
    // appeared to make and the link did not carry.
    breaks: "every box holds treasure, whatever the author drew",
    file: "src/core/codec.ts",
    find: "    if (entry[1] === KIND_BOX) bits.write(entry[2] & 1, BOX_BITS);",
    replace: "    if (entry[1] === KIND_BOX) bits.write(0, BOX_BITS);",
  },
];

/**
 * How long the suite gets before a mutation counts as having HUNG it.
 *
 * The suite is about four seconds. Ninety is absurdly generous and still ends
 * the day the runner otherwise wedges the machine -- which it did: a mutation
 * that stopped a countdown ever reaching zero turned a `while (holding())` in
 * a test into an infinite loop, and because spawnSync waits forever, three
 * orphaned `bun test` processes sat pinning a core each until somebody noticed
 * everything else had gone slow.
 *
 * A hang IS a caught mutation, and arguably the loudest kind: the suite
 * noticed so hard it never finished. What it must not be is silent.
 */
const SUITE_TIMEOUT_MS = 90_000;

async function suiteIsGreen(): Promise<boolean> {
  const run = Bun.spawnSync([...SUITE], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: SUITE_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  // A timeout kills the child, so exitCode is null or non-zero either way --
  // which is "not green", which is "caught". Said out loud so a hang is not
  // mistaken for an ordinary failure by whoever reads the report.
  if (run.exitCode === null) console.log("     (the suite HUNG on this one, which counts as caught)");
  return run.exitCode === 0;
}

async function main(): Promise<void> {
  if (!(await suiteIsGreen())) {
    console.log("the suite is RED before any mutation. Fix that first.");
    process.exit(1);
  }

  const survivors: Mutation[] = [];
  // Kept apart from the survivors, and that is the whole point of this list.
  // A mutation whose `find` no longer matches did not survive the suite -- it
  // was never applied. Counting the two together says "the tests have a hole"
  // about something that is really "this check stopped being a check", which
  // is the more dangerous of the two and reads as the less. Both fail the run.
  const stale: Mutation[] = [];
  console.log(`${MUTATIONS.length} mutations, each one a defect this project has shipped or nearly shipped.\n`);

  for (const mutation of MUTATIONS) {
    const path = mutation.file;
    const original = await Bun.file(path).text();
    if (!original.includes(mutation.find)) {
      console.log(`  STALE     ${mutation.breaks}\n     (the code it edits has moved, so nothing was broken -- fix or drop it)`);
      stale.push(mutation);
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
  if (survivors.length === 0 && stale.length === 0) {
    console.log(`all ${MUTATIONS.length} caught: every one of these defects fails at least one test.`);
    return;
  }
  if (stale.length > 0) {
    console.log(`${stale.length} STALE -- these never ran, so they prove nothing:`);
    for (const one of stale) console.log(`  - ${one.breaks}\n      ${one.file}`);
    console.log("");
  }
  if (survivors.length > 0) {
    console.log(`${survivors.length} SURVIVED -- these can break with the suite still green:`);
    for (const one of survivors) console.log(`  - ${one.breaks}\n      ${one.file}`);
  }
  process.exit(1);
}

if (import.meta.main) await main();
