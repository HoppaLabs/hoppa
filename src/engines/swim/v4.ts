// swim/4: the reef, where a wand freezes the urchins over.
//
// A copy of swim/3, not an edit of it (hard rule 3): every reef link anybody
// has sent pins swim/3 and has to keep replaying under exactly the rules it was
// beaten under.
//
// The same one verb calm/3 gained, for the same reason -- "use the wand to
// freeze water" -- and the reef needed it as much as the garden did: a bucket
// of water is a joke underwater, so until now a bank of urchins had no answer
// at all. See src/engines/calm/v3.ts for why it is the wand, why it is the
// whole bank rather than one cell, and why a sword gets nothing.
//
// Ice over urchins rather than ice over a pond, and the engine is told neither:
// it emits TILE_FROZEN and the reef draws what a reef draws (hard rule 5).
//
import { hashInit, hashInt32 } from "../../core/hash.ts";
import { GRID_H, GRID_W, idx } from "../../core/grid.ts";
import { FLOW_DX, FLOW_DY, isFire, isWall, type Level } from "../../core/level.ts";
import { patrolsFor, type Patrol } from "../../core/patrol.ts";
import { BRUK, type Creature } from "../../core/creature.ts";
import { ONE, cellCentre, chebyshev, clamp, sign, toCell, towards } from "../../core/fixed.ts";
import {
  TILE_ACTOR, TILE_EXIT_LOCKED, TILE_EXIT_OPEN, TILE_FIRE, TILE_FLOOR, TILE_FROZEN, TILE_FLOW,
  TILE_GUARD, TILE_GUARD_REELING, TILE_TREASURE, TILE_WALL,
} from "../../core/tiles.ts";
import {
  FACE_DOWN, FACE_DX, FACE_DY, FACE_LEFT, FACE_RIGHT, FACE_UP,
  HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_RIGHT, HELD_SWING, HELD_UP,
  STATUS_LOST, STATUS_PLAYING, STATUS_WON,
  type Capability, type Engine, type Status,
} from "../types.ts";

export const SWIM_V4_BEHAVIOUR = 4;

/** Ticks before the dark takes you. 30 a second, so two minutes. */
export const TICK_CAP = 3600;
export const MAX_TREASURE = 8;

/** Half-width of a body, in subcells. Smaller than a cell, so corners forgive. */
export const BODY = 96;
/** Walking speed in subcells per tick, by speed pips 0..5. */
const SPEED_BY_PIP: readonly number[] = [20, 26, 32, 38, 44, 50];
/** Enemy speed: below a fast creature, above a slow one, so speed matters. */
/**
 * Enemy walking speed, in subcells per tick.
 *
 * Below every creature's speed on purpose: the player range is 20 to 50, and
 * an enemy that outpaces some builds makes those builds unplayable rather than
 * merely harder. Chosen by measuring against the whole range, not by feel.
 */
export const ENEMY_SPEED = 22;
/**
 * How close an enemy has to be before it gives chase, and how far before it
 * gives up. Four cells was too much: a guard two cells from the start meant
 * being hunted from the first tick with nowhere to learn the controls.
 */
export const SIGHT = ONE * 3;
export const LOSE_INTEREST = ONE * 5;
/** How long a swing stays out. */
export const SWING_TICKS = 8;

/**
 * How long pouring a bucket takes.
 *
 * The price of water, and the only price it has. Long enough that a player
 * feels they SPENT something -- half a second, standing still, while a guard
 * walks its patrol -- and short enough that a child does not think the button
 * is broken. The clock is the score, so putting out three fires is three
 * quarters of a second off your time, and the player who found the way round
 * still beats you.
 */
export const POUR_TICKS = 16;

/**
 * How hard you can push against the water, and how quickly it takes it back.
 *
 * ACCEL is added per tick towards whatever is held; DRAG is what the water
 * removes when nothing is. Drag being the smaller is what "coasting" means.
 *
 * Both numbers were measured rather than chosen. Coasting distance is about
 * `cap * cap / (2 * DRAG)` subcells, and the first pair tried -- 10 and 4 --
 * gave a quarter of a cell, which is not a glide, it is a walk that ends
 * untidily. At 4 and 2 a creature takes six ticks to get up to speed and
 * carries about half a cell after letting go, which is far enough to feel like
 * water and near enough that a child can still stop before the urchins.
 */
export const ACCEL = 4;
export const DRAG = 2;

/**
 * How hard a current pushes, before the creature in it resists.
 *
 * Chosen against the speed table, not picked. A fast creature swims at 50
 * subcells a tick, so a current that is going to matter to them has to be
 * ABOVE that once their resistance is taken off -- otherwise every build
 * shrugs it off and the whole thing is decoration.
 */
export const FLOW_PUSH = 54;

/**
 * What strength takes off it, by pip.
 *
 * Never all of it. A current a strong creature simply ignores stops being part
 * of the level's shape for them, and the point is that it shapes the route
 * DIFFERENTLY for the two builds, not that it disappears for one of them.
 */
const FLOW_RESIST_BY_PIP: readonly number[] = [0, 8, 16, 24, 32, 40];

/**
 * One axis of swimming: push it towards `want`, or let the water take it back.
 *
 * Pure and integer-only, so the determinism check has nothing to complain
 * about and a test can reason about one axis without building a level.
 */
export function pushed(speed: number, want: number, cap: number): number {
  if (want !== 0) return clamp((speed + ACCEL * want) | 0, -cap, cap);
  if (speed > 0) return speed > DRAG ? (speed - DRAG) | 0 : 0;
  if (speed < 0) return speed < -DRAG ? (speed + DRAG) | 0 : 0;
  return 0;
}

/**
 * How far the water goes: the cell you are facing, and the one you are in.
 *
 * NOT the sword's reach. Reach is bought with strength pips, and a fire that
 * only a strong creature can put out would make a level unbeatable for a fast
 * one -- and it is the fast, weak creature a child builds first. Water is the
 * same for everybody, because it is a route, and routes belong to the level.
 */
/**
 * Ticks of mercy after being hit. Long enough to actually get away: at 30 the
 * mercy ran out while still inside the guard, so five hearts went in five
 * seconds.
 */
export const MERCY_TICKS = 50;
/** Ticks a struck enemy stays down, by strength pips. */
const STUN_BY_PIP: readonly number[] = [14, 20, 26, 32, 40, 48];
/**
 * Sword hits an enemy takes before it is gone, by strength pips. A weak
 * creature can still clear a path; it just has to work at it.
 */
const HITS_BY_PIP: readonly number[] = [4, 3, 3, 2, 2, 1];
/**
 * Ticks a wand freezes an enemy for, by strength pips. Three seconds at no
 * strength, six and a bit at full -- always from ONE wave.
 *
 * Deliberately far longer than a sword's stun. The wand's whole case is that
 * it works immediately and never has to be landed twice; if the freeze were
 * short it would just be a worse sword, and nobody would ever pick it.
 */
const FREEZE_BY_PIP: readonly number[] = [90, 110, 130, 150, 170, 190];

/**
 * How long a wand holds WATER solid, by strength pips.
 *
 * The same numbers as the enemy freeze on purpose. A wand does one thing --
 * it makes a dangerous thing safe for a while -- and a child who has learned
 * how long a frozen bear stays frozen has learned how long a frozen pond
 * stays frozen. Two different durations would be two things to learn for no
 * reason.
 *
 * Long enough to cross what you can freeze: at no pips it is three seconds,
 * and a pond is at most MAX_FIRE cells across.
 */
const ICE_BY_PIP: readonly number[] = [90, 110, 130, 150, 170, 190];

/** How long this creature's wand holds water. Zero for a sword. */
export function iceTicksFor(creature: Creature): number {
  if (creature.weapon !== "wand") return 0;
  return ICE_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}

/**
 * How close to its home cell an enemy has to be before it counts as back on
 * patrol. Half a cell -- the corridor walk snaps it the rest of the way.
 */
const HOME_SLACK = ONE >> 1;

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>(["FORCE", "GUARD", "HASTE", "REACH"]);

function pipOf(value: number): number {
  return clamp((((value | 0) + 25) / 51) | 0, 0, 5);
}

export function speedFor(creature: Creature): number {
  return SPEED_BY_PIP[pipOf(creature.caps.HASTE)] as number;
}
/**
 * Hearts come from STRENGTH now. Toughness used to be its own characteristic
 * and nobody could tell the two words apart, so being strong covers standing up
 * to a hit as well as landing one -- which is what most people assumed it meant
 * in the first place. See docs/adr/0012.
 */
/**
 * Hearts, by strength. Three at none, eight at full.
 *
 * v3 started at two, which meant a creature that spent everything on speed
 * died to two touches -- and one of those is nearly free, because you have to
 * learn a room before you can avoid what is in it. Three is the difference
 * between a mistake and a run.
 */
export function heartsFor(creature: Creature): number {
  return (3 + pipOf(creature.caps.FORCE)) | 0;
}
/**
 * How far the sword lands, measured from the body's centre. The same for
 * everyone: reach was a fourth characteristic that nobody asked for, and two
 * things to spend points on is as much as a child should have to weigh.
 */
export const REACH = (BODY + (ONE >> 2) + 2 * (ONE >> 1)) | 0;

/**
 * How close you must be to pick treasure up. **Not the weapon's reach.**
 *
 * Up to roam/4 these were the same number, so a gem came off the floor from
 * 416 subcells away -- more than a cell and a half. Walking down the corridor
 * NEXT to a treasure collected it, which is what "the proximity to capture the
 * treasure is too far" was describing.
 *
 * A sword is meant to reach; a hand is not. This is your own body plus a
 * quarter of a cell, so you collect a gem by going to it: anywhere inside its
 * cell picks it up (half a cell from the centre at the very corner), and a
 * little grace outside covers walking briskly past the edge.
 */
export const GRAB = (BODY + (ONE >> 2)) | 0;

export function reachFor(_creature: Creature): number {
  return REACH;
}
/** How long a struck enemy stays down. */
export function stunFor(creature: Creature): number {
  return STUN_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}

/**
 * Sword hits this creature needs to put an enemy down for good.
 *
 * A wand never kills, whatever its strength -- that is the trade, not a
 * shortcoming, so this is only asked of a creature carrying a sword.
 */
export function hitsToKillFor(creature: Creature): number {
  if (creature.weapon === "wand") return 0;
  return HITS_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}

/** True when this creature's swing can finish an enemy off at all. */
export function killsFor(creature: Creature): boolean {
  return creature.weapon !== "wand";
}

/**
 * How long a struck enemy stays put. A sword buys you a moment between swings;
 * a wand buys you the room.
 */
export function downTicksFor(creature: Creature): number {
  return creature.weapon === "wand"
    ? (FREEZE_BY_PIP[pipOf(creature.caps.FORCE)] as number)
    : (STUN_BY_PIP[pipOf(creature.caps.FORCE)] as number);
}

interface Enemy {
  x: number;
  y: number;
  /** Which way along its corridor it walks: +1 or -1. */
  dir: number;
  stun: number;
  chasing: number;
  /** Sword hits left before it goes down for good. */
  hp: number;
  /** 1 once it has been put down. It stays down until the level restarts. */
  down: number;
}

export class SwimV4 implements Engine {
  readonly id = "swim" as const;
  readonly behaviourVersion = SWIM_V4_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
  private readonly creature: Creature;
  private readonly patrols: readonly Patrol[];
  private readonly enemies: Enemy[];
  private readonly speed: number;
  private readonly hearts: number;
  private readonly reach: number;
  private readonly stunTicks: number;
  /** Sword hits this creature needs to put an enemy down for good. */
  private readonly enemyHits: number;
  /** Subcells a tick this creature takes off a current. */
  private readonly resist: number;
  /** False for a wand: it freezes and never finishes. */
  private readonly kills: boolean;

  private x: number;
  private y: number;
  private facing: number;
  private tick: number;
  private collected: number;
  private hp: number;
  private swing: number;
  /** Subcells per tick. Water gives them slowly and takes them slowly. */
  private vx: number;
  private vy: number;
  /** Ticks of breath left. Refilled at the surface, and never anywhere else. */
  /** Ticks left of the pour, for the picture. 0 when not pouring. */
  private pour: number;
  /**
   * Which fires are out, one flag per entry in level.fireCells.
   *
   * A Uint8Array rather than a bitmask: treasure gets away with `1 << i`
   * because spec L4 caps it at eight, and nothing caps fire. A room could be
   * paved with it.
   */
  private readonly doused: Uint8Array;
  /**
   * Ticks of ice left on each entry in level.fireCells, or 0 for open water.
   *
   * Int16 rather than a flag, because unlike dousing this WEARS OFF -- which is
   * the whole character of a wand. Authoritative state: two runs of the same
   * log have to agree about which cells were solid when somebody walked over
   * them, or a shared level does not replay.
   */
  private readonly ice: Int16Array;
  /** How long this creature's wand holds it. Zero for a sword. */
  private readonly iceTicks: number;
  /** True on the tick a wave froze water. Presentation only. */
  private frozeWaterThisTick = false;

  /** Which way each current flows. Straight off the level; never changes. */
  private readonly currentDirs: Uint8Array;
  private mercy: number;
  private status: Status;
  private readonly allTreasure: number;
  private readonly tiles: Uint8Array;
  private struckThisTick = false;
  /** True on the tick a pour actually put something out. Presentation only. */
  private dousedThisTick = false;
  private hurtThisTick = false;
  private killedThisTick = false;
  private frozeThisTick = false;

  constructor(level: Level, creature: Creature = BRUK) {
    if (level.treasureCells.length > MAX_TREASURE) {
      throw new Error(`level has ${level.treasureCells.length} treasures; this engine holds ${MAX_TREASURE}`);
    }
    this.level = level;
    this.creature = creature;
    this.patrols = patrolsFor(level);
    this.speed = speedFor(creature);
    this.hearts = heartsFor(creature);
    this.reach = reachFor(creature);
    this.stunTicks = downTicksFor(creature);
    this.enemyHits = hitsToKillFor(creature);
    this.resist = FLOW_RESIST_BY_PIP[pipOf(creature.caps.FORCE)] as number;
    this.kills = killsFor(creature);

    this.x = cellCentre(level.startX);
    this.y = cellCentre(level.startY);
    this.facing = FACE_DOWN;
    this.tick = 0;
    this.collected = 0;
    this.hp = this.hearts;
    this.swing = 0;
    this.vx = 0;
    this.vy = 0;
    // You start with a full breath wherever the level puts you, so a start
    // placed at the bottom of a deep room is a hard level rather than a broken
    // one.
    this.pour = 0;
    this.doused = new Uint8Array(level.fireCells.length);
    this.ice = new Int16Array(level.fireCells.length);
    this.iceTicks = iceTicksFor(creature) | 0;
    this.currentDirs = level.currentDirs;
    this.mercy = 0;
    this.status = STATUS_PLAYING;
    this.allTreasure = ((1 << level.treasureCells.length) - 1) | 0;
    this.tiles = new Uint8Array(GRID_W * GRID_H);

    this.enemies = [];
    for (let i = 0; i < this.patrols.length; i = (i + 1) | 0) {
      const home = (this.patrols[i] as Patrol).home;
      this.enemies.push({
        x: cellCentre(home % GRID_W),
        y: cellCentre((home / GRID_W) | 0),
        dir: 1, stun: 0, chasing: 0,
        hp: this.enemyHits | 0, down: 0,
      });
    }
  }

  /** One tick. `held` is a bitmask of the buttons down right now. */
  step(held: number): Status {
    if (this.status !== STATUS_PLAYING) return this.status;

    const buttons = held | 0;
    this.struckThisTick = false;
    this.hurtThisTick = false;
    this.killedThisTick = false;
    this.frozeThisTick = false;
    this.tick = (this.tick + 1) | 0;

    this.dousedThisTick = false;
    this.frozeWaterThisTick = false;
    this.thaw();
    if (this.mercy > 0) this.mercy = (this.mercy - 1) | 0;
    if (this.swing > 0) this.swing = (this.swing - 1) | 0;
    if (this.pour > 0) this.pour = (this.pour - 1) | 0;

    this.swim(buttons);
    this.drift();

    // A pour starts when the button goes down and cannot be re-started until
    // it has finished, exactly as a swing works. Holding the bucket does not
    // empty it faster.
    if ((buttons & HELD_SWING) !== 0 && this.pour === 0) {
      this.pour = POUR_TICKS;
      this.douse();
    }

    // A swing starts when the button goes down; holding it does not flail.
    if ((buttons & HELD_ACT) !== 0 && this.swing === 0) {
      this.swing = SWING_TICKS;
      this.strike();
      // The same wave, at the urchins. See calm/3, which gained this first.
      this.freezeWater();
    }

    this.moveEnemies();
    this.touchEnemies();
    // After the guards, and sharing their mercy window: two hits in one tick
    // would take two hearts for one mistake, and the player cannot tell a
    // guard standing in fire from a guard standing next to it.
    this.touchFire();
    this.collectTreasure();

    if (this.hp <= 0) {
      this.status = STATUS_LOST;
      return this.status;
    }

    if (
      this.level.exitX >= 0 &&
      this.collected === this.allTreasure &&
      toCell(this.x) === this.level.exitX &&
      toCell(this.y) === this.level.exitY
    ) {
      this.status = STATUS_WON;
      return this.status;
    }

    if (this.tick >= TICK_CAP) this.status = STATUS_LOST;
    return this.status;
  }

  /**
   * Swimming.
   *
   * The same four buttons as walking and a different relationship with them:
   * they push, they do not place. Holding builds speed towards a cap; letting
   * go leaves it to the water, which takes it back more slowly than you built
   * it. That gap between ACCEL and DRAG is the entire feel of the thing.
   *
   * The speed cap is the creature's, so a fast creature is fast here too -- but
   * it takes them the same handful of ticks to get there, and the same handful
   * to stop.
   */
  private swim(buttons: number): void {
    let dx = 0;
    let dy = 0;
    if ((buttons & HELD_LEFT) !== 0) dx = (dx - 1) | 0;
    if ((buttons & HELD_RIGHT) !== 0) dx = (dx + 1) | 0;
    if ((buttons & HELD_UP) !== 0) dy = (dy - 1) | 0;
    if ((buttons & HELD_DOWN) !== 0) dy = (dy + 1) | 0;

    if (dx > 0) this.facing = FACE_RIGHT;
    else if (dx < 0) this.facing = FACE_LEFT;
    else if (dy > 0) this.facing = FACE_DOWN;
    else if (dy < 0) this.facing = FACE_UP;

    const cap = this.speed | 0;
    this.vx = pushed(this.vx, dx, cap);
    this.vy = pushed(this.vy, dy, cap);

    // One axis at a time, so you slide along rock instead of sticking to it.
    // A wall also takes the speed you were carrying into it -- swimming into a
    // cliff and then bouncing off it would be a trampoline, not a cliff.
    if (this.vx !== 0) {
      const nx = (this.x + this.vx) | 0;
      if (this.fits(nx, this.y)) this.x = nx;
      else this.vx = 0;
    }
    if (this.vy !== 0) {
      const ny = (this.y + this.vy) | 0;
      if (this.fits(this.x, ny)) this.y = ny;
      else this.vy = 0;
    }
  }

  /**
   * The water taking you with it.
   *
   * Applied to POSITION, after the swimming, and never to velocity. A current
   * that fed momentum would compound: a few seconds in a fast one and you are
   * crossing the room at a speed the level could not have anticipated, into
   * whatever is on the far side of it.
   *
   * Which current you are in is decided by the cell your middle is in, the same
   * measurement fire uses, and for the same reason: a body is most of a cell
   * wide, so going by the edges would have you swept while the sprite is
   * clearly outside the flow.
   */
  private drift(): void {
    const cells = this.level.currentCells;
    if (cells.length === 0) return;
    const here = idx(
      clamp(toCell(this.x), 0, GRID_W - 1),
      clamp(toCell(this.y), 0, GRID_H - 1),
    );
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((cells[i] as number) !== here) continue;
      const dir = (this.currentDirs[i] ?? 0) | 0;
      const push = Math.max(0, (FLOW_PUSH - this.resist) | 0);
      if (push === 0) return;
      const nx = (this.x + (FLOW_DX[dir] as number) * push) | 0;
      const ny = (this.y + (FLOW_DY[dir] as number) * push) | 0;
      // Rock stops the water as surely as it stops you.
      if (nx !== this.x && this.fits(nx, this.y)) this.x = nx;
      if (ny !== this.y && this.fits(this.x, ny)) this.y = ny;
      return;
    }
  }



  /** Does a body centred here clear the walls? */
  private fits(x: number, y: number): boolean {
    const left = toCell((x - BODY) | 0);
    const right = toCell((x + BODY) | 0);
    const top = toCell((y - BODY) | 0);
    const bottom = toCell((y + BODY) | 0);
    for (let cy = top; cy <= bottom; cy = (cy + 1) | 0) {
      for (let cx = left; cx <= right; cx = (cx + 1) | 0) {
        if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
        if (isWall(this.level, cx, cy)) return false;
      }
    }
    return true;
  }

  private moveEnemies(): void {
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      const patrol = this.patrols[i] as Patrol;

      // Dead is dead, for this attempt. Every game of this shape works that
      // way -- you clear a room and it stays clear -- and starting the level
      // again brings the whole room back with it.
      if (enemy.down !== 0) continue;

      if (enemy.stun > 0) {
        enemy.stun = (enemy.stun - 1) | 0;
        continue;
      }

      // Hysteresis: it takes SIGHT to notice you and LOSE_INTEREST to forget,
      // so a guard does not flicker between chasing and strolling on the line.
      const distance = chebyshev(enemy.x, enemy.y, this.x, this.y);
      const near = enemy.chasing !== 0 ? distance <= LOSE_INTEREST : distance <= SIGHT;
      enemy.chasing = near ? 1 : 0;

      if (near) {
        this.stepOneAxis(enemy, this.x, this.y);
        continue;
      }

      // Not chasing. A chase drags an enemy out of the corridor it was drawn
      // in, and the corridor's extent only means anything ON that corridor --
      // v1 applied it wherever the chase had left the enemy, which is how a
      // guard ended up pacing a column of solid rock. So: walk back to the
      // cell it came from first, and only pace once it is there.
      const homeX = cellCentre(patrol.home % GRID_W);
      const homeY = cellCentre((patrol.home / GRID_W) | 0);
      const offX = (enemy.x - homeX) | 0;
      const offY = (enemy.y - homeY) | 0;
      const horizontal = patrol.axis === 0;
      const strayed = horizontal
        ? (offY > HOME_SLACK || offY < -HOME_SLACK)
        : (offX > HOME_SLACK || offX < -HOME_SLACK);

      if (strayed) {
        this.walkEnemyHome(enemy, homeX, homeY);
        continue;
      }

      // On the corridor's line. Snap the off-axis drift away, then pace.
      if (horizontal) enemy.y = homeY;
      else enemy.x = homeX;

      const lowCell = horizontal ? patrol.lo % GRID_W : (patrol.lo / GRID_W) | 0;
      const low = cellCentre(lowCell);
      const high = cellCentre((lowCell + patrol.length - 1) | 0);

      const at = horizontal ? enemy.x : enemy.y;
      let next = (at + ENEMY_SPEED * enemy.dir) | 0;
      if (next >= high) { next = high; enemy.dir = -1; }
      else if (next <= low) { next = low; enemy.dir = 1; }
      // Belt and braces: the corridor was measured from open cells, so this
      // should always pass. It is here so that no future change to how a
      // patrol is derived can put an enemy inside a wall again.
      if (horizontal) { if (this.enemyFits(next, enemy.y)) enemy.x = next; else enemy.dir = (-enemy.dir) | 0; }
      else { if (this.enemyFits(enemy.x, next)) enemy.y = next; else enemy.dir = (-enemy.dir) | 0; }
    }
  }

  /**
   * Head back toward the cell this enemy was drawn in, one axis at a time.
   *
   * The comment said this in v6 and the code did both axes, which is how a
   * guard strolling home cut a diagonal across a room it had never been able
   * to walk diagonally through.
   */
  private walkEnemyHome(enemy: Enemy, homeX: number, homeY: number): void {
    this.stepOneAxis(enemy, homeX, homeY);
  }

  /**
   * One step, on one axis, toward a point.
   *
   * The axis with further to go moves. Blocked, the other one is tried instead
   * -- otherwise an enemy walks into a wall and stays there while you stroll
   * round it, which is worse than the diagonal this replaces.
   *
   * A tie goes to the horizontal. Arbitrary, but it has to be SOMETHING fixed:
   * every replay of this run, on any phone, has to break the tie the same way.
   */
  private stepOneAxis(enemy: Enemy, toX: number, toY: number): void {
    const awayX = (toX - enemy.x) | 0;
    const awayY = (toY - enemy.y) | 0;
    const farX = (awayX < 0 ? -awayX : awayX) | 0;
    const farY = (awayY < 0 ? -awayY : awayY) | 0;

    const tryX = (): boolean => {
      if (awayX === 0) return false;
      const nx = towards(enemy.x, toX, ENEMY_SPEED);
      if (nx === enemy.x || !this.enemyFits(nx, enemy.y)) return false;
      enemy.x = nx;
      return true;
    };
    const tryY = (): boolean => {
      if (awayY === 0) return false;
      const ny = towards(enemy.y, toY, ENEMY_SPEED);
      if (ny === enemy.y || !this.enemyFits(enemy.x, ny)) return false;
      enemy.y = ny;
      return true;
    };

    if (farX >= farY) {
      if (!tryX()) tryY();
    } else {
      if (!tryY()) tryX();
    }
  }

  /**
   * Does an enemy body centred here clear the walls?
   *
   * The same test the player gets. v1 checked a single point, so an enemy could
   * stand with three quarters of itself inside a wall and the check was happy.
   */
  private enemyFits(x: number, y: number): boolean {
    return this.fits(x, y);
  }

  /** The sword. Strength decides how long what you hit stays down. */
  private strike(): void {
    const dx = FACE_DX[this.facing] as number;
    const dy = FACE_DY[this.facing] as number;

    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.down !== 0) continue;
      if (enemy.stun > 0) continue;

      // Measured from YOU, not from the blade's tip.
      //
      // v1 and v2 asked whether the enemy was within a cell of the tip, which
      // is a ring 0.6 to 2.6 cells ahead with a hole in the middle. An enemy
      // standing on top of you -- exactly when you most want to swing -- fell
      // through the hole, so you took hits while swinging and nothing
      // happened. Reported from a real game.
      const away = chebyshev(enemy.x, enemy.y, this.x, this.y);
      if (away > this.reach) continue;

      // ...and it has to be in front of you, unless it is close enough to be
      // touching, in which case which way you happen to face is not something
      // a player is tracking while being chased.
      const ahead = (((enemy.x - this.x) | 0) * dx + ((enemy.y - this.y) | 0) * dy) | 0;
      if (away > BODY + BODY && ahead < 0) continue;

      this.struckThisTick = true;

      if (this.kills) {
        enemy.hp = (enemy.hp - 1) | 0;
        if (enemy.hp <= 0) {
          enemy.down = 1;
          enemy.chasing = 0;
          enemy.stun = 0;
          this.killedThisTick = true;
          continue;
        }
      } else {
        // A wand does not wear an enemy down: every wave is the same wave, and
        // waving again at something already frozen just tops the freeze up.
        this.frozeThisTick = true;
      }

      enemy.stun = this.stunTicks | 0;
      enemy.chasing = 0;

      // Knocked back along the swing, as far as the room allows. The whole
      // body has to land clear: v1 tested the destination as a point, so a
      // shove could park an enemy half inside a wall.
      const shoveX = (enemy.x + sign((enemy.x - this.x) | 0) * ONE) | 0;
      const shoveY = (enemy.y + sign((enemy.y - this.y) | 0) * ONE) | 0;
      if (this.enemyFits(shoveX, enemy.y)) enemy.x = towards(enemy.x, shoveX, ONE);
      if (this.enemyFits(enemy.x, shoveY)) enemy.y = towards(enemy.y, shoveY, ONE);
    }
  }

  private touchEnemies(): void {
    if (this.mercy > 0) return;
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.down !== 0) continue;
      if (enemy.stun > 0) continue;
      if (chebyshev(enemy.x, enemy.y, this.x, this.y) > BODY + BODY) continue;

      this.hp = (this.hp - 1) | 0;
      this.mercy = MERCY_TICKS;
      this.hurtThisTick = true;

      // Thrown clear, not nudged: landing still inside the guard means the
      // next hit arrives the moment mercy ends.
      const awayX = (this.x + sign((this.x - enemy.x) | 0) * ONE * 2) | 0;
      const awayY = (this.y + sign((this.y - enemy.y) | 0) * ONE * 2) | 0;
      if (this.fits(awayX, this.y)) this.x = awayX;
      if (this.fits(this.x, awayY)) this.y = awayY;
      return;
    }
  }

  /**
   * Standing in fire.
   *
   * Measured from the CELL the middle of you is in, not from the body's edges.
   * A body is three quarters of a cell, so edge overlap would set light to you
   * while the sprite is still clearly beside the flame -- and unlike a guard,
   * fire never moves, so the player would have no way to read what happened.
   *
   * You are NOT thrown clear. A guard throws you because it is about to hit
   * you again; fire cannot follow, and being flung out of it into a wall or a
   * second flame is worse than being left to walk out.
   */
  /**
   * Empty the bucket over the fire in front of you, and the one under you.
   *
   * Under you as well as in front, because the moment a child reaches for the
   * bucket is the moment they have just walked into a flame -- and being told
   * "turn round and face the thing you are standing in" is not a rule anybody
   * would guess. It costs nothing: a fire you are standing in is already
   * taking a heart off you.
   *
   * Cells, not distances. The sword measures subcells because an enemy is
   * somewhere between two of them; a fire is a square on the board and it is
   * either the square you mean or it is not.
   */
  private douse(): void {
    const here = idx(
      clamp(toCell(this.x), 0, GRID_W - 1),
      clamp(toCell(this.y), 0, GRID_H - 1),
    );
    const ax = (toCell(this.x) + (FACE_DX[this.facing] as number)) | 0;
    const ay = (toCell(this.y) + (FACE_DY[this.facing] as number)) | 0;
    const ahead = ax < 0 || ax >= GRID_W || ay < 0 || ay >= GRID_H ? -1 : idx(ax, ay);

    const burning = this.level.fireCells;
    for (let i = 0; i < burning.length; i = (i + 1) | 0) {
      if (this.doused[i] === 1) continue;
      const cell = burning[i] as number;
      if (cell !== here && cell !== ahead) continue;
      this.doused[i] = 1;
      this.dousedThisTick = true;
    }
  }

  /** One tick off every sheet of ice. */
  private thaw(): void {
    for (let i = 0; i < this.ice.length; i = (i + 1) | 0) {
      const left = this.ice[i] as number;
      if (left > 0) this.ice[i] = (left - 1) | 0;
    }
  }

  /**
   * Wave the wand at the water in front of you, and the WHOLE POND goes solid.
   *
   * The pond, not the cell. Freezing one square at a time would mean standing
   * in the water to reach the next one, taking a heart for each square of a
   * crossing -- which is not a way across, it is a slower way of drowning. A
   * pond is one thing to look at and it is one thing to freeze.
   *
   * Flood-filled through touching water only, so two ponds either side of a
   * path stay two ponds. Bounded by MAX_FIRE, so the walk is a handful of
   * cells however it is written.
   */
  private freezeWater(): void {
    if (this.iceTicks === 0) return;
    const ax = (toCell(this.x) + (FACE_DX[this.facing] as number)) | 0;
    const ay = (toCell(this.y) + (FACE_DY[this.facing] as number)) | 0;
    // The one you are facing, or the one you are standing in -- somebody who
    // has just walked into a pond is not thinking about which way they face.
    const from = this.waterAt(ax, ay) >= 0
      ? this.waterAt(ax, ay)
      : this.waterAt(toCell(this.x), toCell(this.y));
    if (from < 0) return;

    const burning = this.level.fireCells;
    const reached = new Uint8Array(burning.length);
    const queue: number[] = [from];
    reached[from] = 1;
    for (let at = 0; at < queue.length; at = (at + 1) | 0) {
      const which = queue[at] as number;
      const cell = burning[which] as number;
      const cx = (cell % GRID_W) | 0;
      const cy = ((cell / GRID_W) | 0) | 0;
      for (let side = 0; side < 4; side = (side + 1) | 0) {
        const nx = (cx + (FACE_DX[side] as number)) | 0;
        const ny = (cy + (FACE_DY[side] as number)) | 0;
        const next = this.waterAt(nx, ny);
        if (next < 0 || reached[next] === 1) continue;
        reached[next] = 1;
        queue.push(next);
      }
    }

    for (let i = 0; i < queue.length; i = (i + 1) | 0) {
      const which = queue[i] as number;
      if (this.doused[which] === 1) continue;
      this.ice[which] = this.iceTicks | 0;
      this.frozeWaterThisTick = true;
    }
  }

  /** Which entry of fireCells is at this cell, or -1. */
  private waterAt(cx: number, cy: number): number {
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return -1;
    const cell = idx(cx, cy);
    const burning = this.level.fireCells;
    for (let i = 0; i < burning.length; i = (i + 1) | 0) {
      if ((burning[i] as number) === cell) return i;
    }
    return -1;
  }

  /** True when this fire is still burning: everything else asks through here. */
  private alight(cx: number, cy: number): boolean {
    if (!isFire(this.level, cx, cy)) return false;
    const cell = idx(cx, cy);
    const burning = this.level.fireCells;
    for (let i = 0; i < burning.length; i = (i + 1) | 0) {
      // Out for good, or solid for now: either way it cannot hurt you, and
      // everything that asks about the hazard asks through here.
      if ((burning[i] as number) === cell) {
        return this.doused[i] === 0 && (this.ice[i] as number) === 0;
      }
    }
    return false;
  }

  private touchFire(): void {
    if (this.mercy > 0) return;
    const cx = toCell(this.x);
    const cy = toCell(this.y);
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return;
    // A fire that has been put out is a floor tile that used to be dangerous.
    if (!this.alight(cx, cy)) return;

    this.hp = (this.hp - 1) | 0;
    this.mercy = MERCY_TICKS;
    this.hurtThisTick = true;
  }

  private collectTreasure(): void {
    const cells = this.level.treasureCells;
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) !== 0) continue;
      const cell = cells[i] as number;
      const tx = cellCentre(cell % GRID_W);
      const ty = cellCentre((cell / GRID_W) | 0);
      if (chebyshev(tx, ty, this.x, this.y) <= GRAB) {
        this.collected = (this.collected | (1 << i)) | 0;
      }
    }
  }

  render(): Uint8Array {
    const walls = this.level.walls;
    for (let i = 0; i < this.tiles.length; i = (i + 1) | 0) {
      this.tiles[i] = walls[i] === 1 ? TILE_WALL : TILE_FLOOR;
    }
    // Under the gems and the door, so a gem drawn on a burning cell is still
    // findable -- fire never changes, and a gem you cannot see is a level you
    // cannot finish.
    // Under the hazard and the gems: a current is the water itself, and
    // anything floating in it is in front of it.
    const flowing = this.level.currentCells;
    for (let i = 0; i < flowing.length; i = (i + 1) | 0) {
      this.tiles[flowing[i] as number] = TILE_FLOW;
    }
    const burning = this.level.fireCells;
    for (let i = 0; i < burning.length; i = (i + 1) | 0) {
      if (this.doused[i] === 1) continue; // out, and it stays out
      // Ice is its own tile: walkable now, urchins again in a moment, and a
      // child crossing it has to be able to see which it is.
      this.tiles[burning[i] as number] =
        (this.ice[i] as number) > 0 ? TILE_FROZEN : TILE_FIRE;
    }
    const cells = this.level.treasureCells;
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) === 0) this.tiles[cells[i] as number] = TILE_TREASURE;
    }
    if (this.level.exitX >= 0) {
      this.tiles[idx(this.level.exitX, this.level.exitY)] =
        this.collected === this.allTreasure ? TILE_EXIT_OPEN : TILE_EXIT_LOCKED;
    }
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.down !== 0) continue;
      const cell = idx(clamp(toCell(enemy.x), 0, GRID_W - 1), clamp(toCell(enemy.y), 0, GRID_H - 1));
      this.tiles[cell] = enemy.stun > 0 ? TILE_GUARD_REELING : TILE_GUARD;
    }
    this.tiles[idx(clamp(toCell(this.x), 0, GRID_W - 1), clamp(toCell(this.y), 0, GRID_H - 1))] =
      TILE_ACTOR;
    return this.tiles;
  }

  stateHash(): number {
    let h = hashInit();
    h = hashInt32(h, this.x);
    h = hashInt32(h, this.y);
    h = hashInt32(h, this.facing);
    h = hashInt32(h, this.tick);
    h = hashInt32(h, this.collected);
    h = hashInt32(h, this.hp);
    h = hashInt32(h, this.swing);
    h = hashInt32(h, this.pour);
    h = hashInt32(h, this.vx);
    h = hashInt32(h, this.vy);
    // Which fires are out is authoritative state: two runs of the same log
    // must agree about it, or a shared level would not replay.
    for (let i = 0; i < this.doused.length; i = (i + 1) | 0) {
      h = hashInt32(h, this.doused[i] as number);
    }
    // ...and so is which are frozen, and for how much longer. A sheet of ice
    // decides whether a stroke lands on ground or on a spine, so a replay that
    // disagreed about it would disagree about the hearts.
    for (let i = 0; i < this.ice.length; i = (i + 1) | 0) {
      h = hashInt32(h, this.ice[i] as number);
    }
    h = hashInt32(h, this.mercy);
    h = hashInt32(h, this.status);
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      const enemy = this.enemies[i] as Enemy;
      h = hashInt32(h, enemy.x);
      h = hashInt32(h, enemy.y);
      h = hashInt32(h, enemy.dir);
      h = hashInt32(h, enemy.stun);
      h = hashInt32(h, enemy.hp);
      h = hashInt32(h, enemy.down);
    }
    return h | 0;
  }

  message(): string | null {
    const name = this.creature.name;
    if (this.status === STATUS_WON) return `${name} got out with the lot.`;
    if (this.status === STATUS_LOST) {
      return this.hp <= 0 ? `${name} went down swinging.` : "The dark got bored of waiting.";
    }
    if (this.hurtThisTick) return "That hurt.";
    if (this.killedThisTick) return "Got it.";
    if (this.frozeThisTick) return "Frozen solid.";
    if (this.struckThisTick) return "Down it goes.";
    return null;
  }

  // --- presentation, never hashed ------------------------------------------------

  where(): { x: number; y: number; facing: number } {
    return { x: this.x, y: this.y, facing: this.facing };
  }
  /**
   * `dir` rides along so the picture can face the way the thing is going.
   *
   * A shark that always faces right moonwalks half its patrol. It is state the
   * engine already keeps and already hashes -- this only stops it being
   * private, exactly as dash/7 did when its enemies started moving.
   */
  enemyPositions(): Array<{
    x: number; y: number; stunned: boolean; chasing: boolean; dir: number;
  }> {
    return this.enemies
      .filter((e) => e.down === 0)
      .map((e) => ({
        x: e.x, y: e.y, stunned: e.stun > 0, chasing: e.chasing !== 0, dir: e.dir | 0,
      }));
  }
  /** Enemies still standing, for the HUD. Presentation only. */
  enemiesLeft(): number {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i = (i + 1) | 0) {
      if ((this.enemies[i] as Enemy).down === 0) n = (n + 1) | 0;
    }
    return n;
  }
  /** True on the tick a swing finished one off. Presentation only. */
  justKilled(): boolean { return this.killedThisTick; }
  /** True on the tick a wave froze one. Presentation only. */
  justFroze(): boolean { return this.frozeThisTick; }
  /** Whether this creature's swing can kill at all. Presentation only. */
  canKill(): boolean { return this.kills; }
  merciful(): boolean { return this.mercy > 0; }
  swinging(): boolean { return this.swing > 0; }
  /** Ticks left of the pour, so the page can draw the water. Presentation only. */
  pouring(): number { return this.pour | 0; }
  /** True on the tick a pour actually put something out. Presentation only. */
  justDoused(): boolean { return this.dousedThisTick; }
  /** How many fires are still burning, and how many there were. For the HUD. */
  firesLeft(): { out: number; total: number } {
    let out = 0;
    for (let i = 0; i < this.doused.length; i = (i + 1) | 0) {
      if (this.doused[i] === 1) out = (out + 1) | 0;
    }
    return { out, total: this.doused.length };
  }
  /** Ticks left of the current swing, for drawing the arc. Presentation only. */
  swingLeft(): number { return this.swing; }
  swingLength(): number { return SWING_TICKS; }
  justStruck(): boolean { return this.struckThisTick; }
  justHurt(): boolean { return this.hurtThisTick; }
  /** True while any guard has noticed you. Presentation only. */
  hunted(): boolean {
    return this.enemies.some((e) => e.down === 0 && e.chasing !== 0 && e.stun === 0);
  }
  health(): { hp: number; max: number } { return { hp: this.hp, max: this.hearts }; }
  ticks(): number { return this.tick; }
  seconds(): number { return (this.tick / 30) | 0; }
  collectedCount(): number {
    let n = 0;
    for (let i = 0; i < this.level.treasureCells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) !== 0) n = (n + 1) | 0;
    }
    return n;
  }
  treasureTotal(): number { return this.level.treasureCells.length | 0; }
  exitOpen(): boolean { return this.collected === this.allTreasure; }
  currentStatus(): Status { return this.status; }
  position(): { x: number; y: number } { return { x: toCell(this.x), y: toCell(this.y) }; }
}
