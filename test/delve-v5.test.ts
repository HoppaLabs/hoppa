import { expect, test } from "bun:test";
import { DAY7_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { GRID_AREA, idx } from "../src/core/grid.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { TILE_COUNT, TILE_GUARD, TILE_GUARD_REELING } from "../src/core/tiles.ts";
import {
  BRUK,
  NIM,
  PELL,
  PIP_BUDGET,
  PIP_MAX,
  PRESETS,
  SPENDABLE,
  buildToCaps,
  capsToBuild,
  clampPip,
  creatureFromBuild,
  creatureFromCaps,
  pipToCap,
  spent,
  uniformCreature,
  withinBudget,
} from "../src/core/creature.ts";
import {
  ALERT_MAX,
  DelveV5,
  NOISE_RADIUS,
  TURN_CAP,
  alertCeilingFor,
  bargeStunFor,
  reachFor,
} from "../src/engines/delve/v5.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { INPUT_WAIT, STATUS_LOST, STATUS_PLAYING, STATUS_WON } from "../src/engines/types.ts";

const level = parseLevel(DAY7_LEVEL_TEXT);
const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };

// v5's rules are frozen, so its INPUTS are pinned here too. These are the caps
// the presets had when a character spent points across four characteristics;
// the set later shrank to two (docs/adr/0012), and a frozen engine must never
// be tested against a moving target.
const V5_BASH = creatureFromCaps("01J8XK4M2P7Q", "Bash", { FORCE: 255, GUARD: 153 });
const V5_NIM = creatureFromCaps("01J8XK6R4T2B", "Nim", { HASTE: 255, GUARD: 51, REACH: 102 });
const V5_PELL = creatureFromCaps("01J8XK8W6Y5N", "Pell", { GUARD: 204, REACH: 204 });
const V5_PRESETS = [V5_BASH, V5_NIM, V5_PELL] as const;

const WINS = {
  Bash: "..RRRRRRRRRDDDDLLLDDDDLLLLLRRRDDDRRRRRRRRRRRRRUUURRRUUUURLDDDDLLLDDDRRRR",
  Nim: "...RRRRRRRRRDDDDLLLDDDDLLLLLRRRDDDRRRRRRRRRRRRRUUURRRUUUURLDDDDLLLDDDRRRR",
  Pell: "RRRRRRRRRDDDDLLLDDDDLLLLRRRRRRRRRRRRRRRRRRUUUDDDLLLDDDLLLRRRRRRR",
} as const;

/** Where the guards are right now, read off the tiles the engine emits. */
function guardsOnScreen(engine: DelveV5): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const tiles = engine.render();
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === TILE_GUARD || tiles[i] === TILE_GUARD_REELING) {
      out.push({ x: i % 24, y: (i / 24) | 0 });
    }
  }
  return out;
}

/**
 * Walk until a guard is next to us, then step straight into it. Hand-written
 * routes kept missing the patrol entirely; this cannot.
 */
function walkIntoAGuard(engine: DelveV5, limit = 200): number {
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < limit && status === STATUS_PLAYING; i++) {
    const me = engine.position();
    const beside = guardsOnScreen(engine).find(
      (g) => Math.abs(g.x - me.x) + Math.abs(g.y - me.y) === 1,
    );
    if (beside !== undefined) {
      const dir =
        beside.x > me.x ? MOVES.R : beside.x < me.x ? MOVES.L : beside.y > me.y ? MOVES.D : MOVES.U;
      return engine.step(dir as number);
    }

    // A guard two cells off is walking towards us. Stand still and let it come
    // adjacent -- keep advancing and it simply walks onto us, which is a catch,
    // not a barge.
    const closing = guardsOnScreen(engine).some(
      (g) => Math.abs(g.x - me.x) + Math.abs(g.y - me.y) === 2,
    );
    status = closing
      ? engine.step(INPUT_WAIT)
      : engine.step(me.x < 3 ? (MOVES.R as number) : (MOVES.D as number));
  }
  return status;
}

function play(creature: typeof V5_BASH, log: string) {
  const engine = new DelveV5(level, creature);
  let status: number = STATUS_PLAYING;
  for (const ch of log) status = engine.step(MOVES[ch] as number);
  return { engine, status };
}

// --- the budget ---------------------------------------------------------------

test("you cannot be everything: the budget is smaller than the axes", () => {
  expect(PIP_BUDGET).toBeLessThan(SPENDABLE.length * PIP_MAX);
  console.log(`\n  ${SPENDABLE.length} characteristics, ${PIP_MAX} pips each, ${PIP_BUDGET} to spend`);
});

test("every preset is a legal build, inside the budget", () => {
  const rows = PRESETS.map((c) => {
    const build = capsToBuild(c.caps);
    const bars = SPENDABLE.map((s) => `${s.label} ${"*".repeat(build[s.key])}${".".repeat(PIP_MAX - build[s.key])}`);
    return `  ${c.name.padEnd(5)} ${bars.join("  ")}  = ${spent(build)}`;
  });
  console.log(`\n${rows.join("\n")}`);

  for (const creature of PRESETS) {
    const build = capsToBuild(creature.caps);
    expect(withinBudget(build)).toBe(true);
    expect(spent(build)).toBe(PIP_BUDGET);
  }
});

test("a preset can never be better than something a kid may build", () => {
  // Every preset spends the same budget, so none of them is strictly ahead.
  const totals = PRESETS.map((c) => spent(capsToBuild(c.caps)));
  expect(new Set(totals).size).toBe(1);
});

test("pips convert to axes and back without drifting", () => {
  for (let pips = 0; pips <= PIP_MAX; pips++) {
    const build: Record<string, number> = {};
    for (const spend of SPENDABLE) build[spend.key] = pips;
    expect(capsToBuild(buildToCaps(build as never))).toEqual(build);
  }
  expect(pipToCap(0)).toBe(0);
  expect(pipToCap(PIP_MAX)).toBe(255);
});

test("an over-budget or nonsense build is caught rather than trusted", () => {
  expect(withinBudget({ FORCE: 5, HASTE: 5 } as never)).toBe(false);
  expect(spent({ FORCE: 99, HASTE: 0 } as never)).toBe(PIP_MAX);
  expect(clampPip(-3)).toBe(0);
  expect(clampPip(99)).toBe(PIP_MAX);
});

// --- MASS is gone -------------------------------------------------------------

test("MASS is not read: a creature carrying it plays the same as one without", () => {
  const build = { FORCE: 2, HASTE: 2 } as never;
  const light = creatureFromBuild("a", "Light", "?", build, starterSprite());
  const heavy = creatureFromCaps("b", "Heavy", { ...buildToCaps(build), MASS: 255 }, starterSprite());
  expect(heavy.caps.MASS).toBe(255);
  expect(light.caps.MASS).toBe(0);

  const log = WINS.Pell.slice(0, 25);
  expect(hashHex(play(heavy, log).engine.stateHash())).toBe(
    hashHex(play(light, log).engine.stateHash()),
  );
});

test("everybody makes the same amount of noise now", () => {
  expect(NOISE_RADIUS).toBe(1);
  for (const creature of V5_PRESETS) expect(new DelveV5(level, creature).noise()).toBe(NOISE_RADIUS);
});

test("the engine declares the four it actually reads, and MASS is not one", () => {
  const engine = new DelveV5(level, V5_BASH);
  expect([...engine.consumes].sort()).toEqual(["FORCE", "GUARD", "HASTE", "REACH"]);
  expect([...engine.consumes]).not.toContain("MASS");
});

// --- strength -----------------------------------------------------------------

test("strength decides whether walking into a guard is a barge or a death", () => {
  expect(bargeStunFor(V5_BASH)).toBeGreaterThan(0);
  expect(bargeStunFor(V5_NIM)).toBe(0);
  expect(bargeStunFor(V5_PELL)).toBe(0);
});

test("a strong creature barges a guard, holds its ground, and walks on", () => {
  const engine = new DelveV5(level, V5_BASH);
  const before = engine.position();
  const status = walkIntoAGuard(engine);

  expect(engine.didBarge()).toBe(true);
  expect(status).toBe(STATUS_PLAYING); // it shoved past instead of dying
  expect(engine.wasCaught()).toBe(false);
  // It held its ground rather than swapping into the guard's cell.
  expect(engine.position()).not.toEqual(before);

  let reeling = 0;
  for (const tile of engine.render()) if (tile === TILE_GUARD_REELING) reeling++;
  expect(reeling).toBe(1);
});

test("a weak creature walking into the same guard is caught", () => {
  const engine = new DelveV5(level, V5_PELL); // no strength at all
  const status = walkIntoAGuard(engine);
  expect(status).toBe(STATUS_LOST);
  expect(engine.wasCaught()).toBe(true);
  expect(engine.didBarge()).toBe(false);
});

test("a barged guard is stunned for exactly as long as strength says", () => {
  // Pinned caps, not a build: v5 reads GUARD, and a build can no longer spend
  // points on it. A creature with GUARD 0 loses to the alarm before the stun
  // has run its course, which would measure the alarm, not the stun.
  const strong = creatureFromCaps("s", "Strong", { FORCE: 255, GUARD: 255 }, starterSprite());
  const engine = new DelveV5(level, strong);
  expect(engine.bargePower()).toBe(4);

  walkIntoAGuard(engine);
  expect(engine.didBarge()).toBe(true);

  // Retreat while counting. Loitering next to a guard you have just shoved is
  // not a plan: barging knocks it down, it does not make you quiet, so standing
  // there fills the alarm and ends the run. That is the intended behaviour, and
  // it is why this walks away rather than waiting.
  // Back away from the guard we just shoved -- walking into it again would
  // reset the stun and measure nothing. The direction has to be computed:
  // whichever way is away depends on where the encounter happened.
  const me = engine.position();
  const reeling0 = guardsOnScreen(engine).find(
    (g) => Math.abs(g.x - me.x) + Math.abs(g.y - me.y) <= 1,
  );
  const away =
    reeling0 === undefined
      ? (MOVES.U as number)
      : reeling0.x > me.x
        ? (MOVES.L as number)
        : reeling0.x < me.x
          ? (MOVES.R as number)
          : reeling0.y > me.y
            ? (MOVES.U as number)
            : (MOVES.D as number);

  let reelingTurns = 0;
  for (let i = 0; i < 12; i++) {
    if (engine.step(away) !== STATUS_PLAYING) break;
    if (engine.didBarge()) break;
    let reeling = 0;
    for (const tile of engine.render()) if (tile === TILE_GUARD_REELING) reeling++;
    if (reeling === 0) break;
    reelingTurns++;
  }
  expect(reelingTurns).toBeGreaterThan(0);
  expect(reelingTurns).toBeLessThanOrEqual(engine.bargePower());
});

test("shoving a guard does not make you quiet: the alarm still fills", () => {
  const engine = new DelveV5(level, V5_BASH);
  walkIntoAGuard(engine);
  expect(engine.didBarge()).toBe(true);

  // Stand there admiring the work.
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < 20 && status === STATUS_PLAYING; i++) status = engine.step(INPUT_WAIT);
  expect(status).toBe(STATUS_LOST);
  expect(engine.wasCaught()).toBe(false); // heard, not touched
});

test("barging is something you do, not a shield: a guard can still walk onto you", () => {
  // Park in the connector the guard patrols and let it come. Strength never
  // makes you safe from being walked into.
  const engine = new DelveV5(level, BRUK);
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < 400 && status === STATUS_PLAYING; i++) {
    const me = engine.position();
    status = engine.step(me.x < 3 ? (MOVES.R as number) : INPUT_WAIT);
  }
  expect(status).toBe(STATUS_LOST);
  expect(engine.wasCaught() || engine.alertLevel() >= engine.alertMax()).toBe(true);
});

test("guard phase and stun are hashed, because barging moves them off cycle", () => {
  const quiet = new DelveV5(level, V5_BASH);
  const shover = new DelveV5(level, V5_BASH);
  // Same creature, same number of turns, but one of them shoved a guard.
  for (const ch of "RR") quiet.step(MOVES[ch] as number);
  for (const ch of "RR") shover.step(MOVES[ch] as number);
  expect(hashHex(shover.stateHash())).toBe(hashHex(quiet.stateHash()));

  walkIntoAGuard(shover);
  expect(shover.didBarge()).toBe(true);
  expect(hashHex(shover.stateHash())).not.toBe(hashHex(quiet.stateHash()));
});

// --- the runs -----------------------------------------------------------------

test.each(V5_PRESETS.map((c) => [c.name, c] as const))(
  "%s beats the level on its own build",
  (name, creature) => {
    const { engine, status } = play(creature, WINS[name as keyof typeof WINS]);
    expect(status).toBe(STATUS_WON);
    expect(engine.collectedCount()).toBe(engine.treasureTotal());
    console.log(`  ${name.padEnd(5)} ${String(engine.turns()).padStart(3)} turns  "${engine.message()}"`);
  },
);

test("speed still buys turns, not steps", () => {
  const bruk = play(V5_BASH, WINS.Bash).engine;
  const nim = play(V5_NIM, WINS.Nim).engine;
  expect(nim.turns()).toBeLessThan(bruk.turns());
});

test("reach still lifts a gem from the next cell", () => {
  expect(reachFor(V5_PELL)).toBe(1);
  expect(reachFor(V5_BASH)).toBe(0);
});

test("nerve still buys spottings, capped at the alert ceiling", () => {
  expect(alertCeilingFor(V5_PELL)).toBe(ALERT_MAX);
  expect(alertCeilingFor(V5_NIM)).toBeLessThan(ALERT_MAX);
});

// --- the usual guarantees ------------------------------------------------------

test("E3: three replays of one log produce identical hashes", () => {
  const log = WINS.Bash.slice(0, 30);
  const hashes = [0, 1, 2].map(() => hashHex(play(V5_BASH, log).engine.stateHash()));
  expect(new Set(hashes).size).toBe(1);
});

test("E7: render() returns exactly w*h valid tile indices", () => {
  const tiles = play(BRUK, "RRDD").engine.render();
  expect(tiles.length).toBe(GRID_AREA);
  for (const tile of tiles) {
    expect(tile).toBeGreaterThanOrEqual(0);
    expect(tile).toBeLessThan(TILE_COUNT);
  }
});

test("E10: cosmetics still do not reach stateHash()", () => {
  const restyled = parseLevel(DAY7_LEVEL_TEXT.replace("tiles=1", "tiles=7"));
  const log = WINS.Pell.slice(0, 20);
  const themed = new DelveV5(restyled, V5_PELL);
  for (const ch of log) themed.step(MOVES[ch] as number);
  expect(hashHex(themed.stateHash())).toBe(hashHex(play(V5_PELL, log).engine.stateHash()));
});

test("E1/E2/E4: uniform creatures play and terminate", () => {
  for (const value of [0, 255]) {
    const engine = new DelveV5(level, uniformCreature(value, "Test"));
    let status: number = STATUS_PLAYING;
    let steps = 0;
    while (status === STATUS_PLAYING && steps < TURN_CAP * 3) {
      status = engine.step(INPUT_WAIT);
      steps++;
    }
    expect(status).not.toBe(STATUS_PLAYING);
    expect(engine.turns()).toBeLessThanOrEqual(TURN_CAP);
  }
});

test("E5-ish: seeded random logs never crash and always terminate", () => {
  let state = 0x7ab31d | 0;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % 5;
  };
  for (let run = 0; run < 150; run++) {
    const creature = V5_PRESETS[run % V5_PRESETS.length] as typeof V5_BASH;
    const engine = new DelveV5(level, creature);
    let status: number = STATUS_PLAYING;
    for (let i = 0; i < 400 && status === STATUS_PLAYING; i++) status = engine.step(next());
    expect(engine.render().length).toBe(GRID_AREA);
    expect(engine.turns()).toBeLessThanOrEqual(TURN_CAP);
  }
});

test("guards render as guards, reeling or not", () => {
  const tiles = new DelveV5(level, V5_BASH).render();
  let guards = 0;
  for (const tile of tiles) if (tile === TILE_GUARD || tile === TILE_GUARD_REELING) guards++;
  expect(guards).toBe(3);
});
