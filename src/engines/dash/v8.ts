// Dash, behaviour version 8.
//
// v8 is the version where an enemy in mid-air FALLS.
//
// Reported as "the enemies are not moving on the side app". They were not, and
// the reason is v7's own ledge test working exactly as designed: a walker turns
// round rather than step off a platform, and a walker with nothing under it at
// all reads BOTH directions as a ledge. So it flipped its facing every tick,
// thirty times a second, standing perfectly still -- which on screen is not a
// creature deciding anything, it is a creature that is broken.
//
// Measured before and after, ten seconds, an enemy dropped in open sky in a new
// platformer level:
//
//   v7   0.0 cells travelled, 0.0 cells fallen
//   v8   it lands, and then paces like every other one
//
// This is what a child does. They draw a room, they tap a goblin into the
// middle of the sky, and in every platformer ever made it drops to the ground.
// Only the side-on game had the problem: nothing falls underwater or from
// above, so roam and swim were always fine.
//
// v7 and everything before it are still shipped and still hang an enemy in the
// air. Hard rule 3.
//
// Dash, behaviour version 7. Side-on, real time.
//
// v7 is the version where the enemies move.
//
// Reported live, watching a nine-year-old play: "the lizard enemy doesn't
// move". It was not the lizard. The letter on an enemy is cosmetic -- level.ts
// says so -- and sure enough a goblin did not move either, nor a bat, nor one
// put anywhere else in the room. NO enemy has ever moved in the side-on game,
// in any of dash/1 through dash/6. Nobody noticed because until this week no
// side-on level had an enemy in it.
//
// It comes down to two numbers thirty-two subcells apart.
//
// A body is a square, 96 subcells from its middle to each side, and it falls
// until it will not fit. So a creature standing on the floor of a cell has its
// middle at 160 of that cell's 256. An enemy, though, was placed at the middle
// of its cell -- 128 -- and nothing ever made it fall, so it hung 32 subcells
// above the ground it was meant to be standing on.
//
// The ledge test is what stops a walker strolling off the end of a platform,
// and it asked whether there was floor two subcells below its feet: y + 96 + 2.
// From 160 that lands on 258, which is the cell below -- the floor, correctly.
// From 128 it lands on 226, which is still inside the enemy's OWN cell, and
// that cell is empty because the enemy is standing in it. So every walker read
// "ledge ahead" on every tick of every game, turned round, and never took the
// step. Two of them pivoting on the spot, thirty times a second, forever.
//
// So in v7 an enemy stands where a body rests, and the ledge test asks about
// the cell below the one it is in rather than about a distance that only
// happens to work from one exact height. They line up with the player now,
// which they never did.
//
// Everything else is v6 exactly. dash/6 is still here and still exact: every
// link anybody has already sent replays with its enemies rooted to the spot,
// which is hard rule 3 and the whole reason the old builds stay in the bundle.

import { hashInit, hashInt32 } from "../../core/hash.ts";
import { GRID_H, GRID_W, idx } from "../../core/grid.ts";
import { isFire, isLadder, isWall, type Level } from "../../core/level.ts";
import { BRUK, type Creature } from "../../core/creature.ts";
import { ONE, cellCentre, chebyshev, clamp, sign, toCell, towards } from "../../core/fixed.ts";
import {
  TILE_ACTOR, TILE_EXIT_LOCKED, TILE_EXIT_OPEN, TILE_FLOOR, TILE_GUARD,
  TILE_FIRE, TILE_GUARD_REELING, TILE_LADDER, TILE_TREASURE, TILE_WALL,
} from "../../core/tiles.ts";
import {
  FACE_DX, FACE_LEFT, FACE_RIGHT,
  HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_RIGHT, HELD_SWING, HELD_UP,
  STATUS_LOST, STATUS_PLAYING, STATUS_WON,
  type Capability, type Engine, type Status,
} from "../types.ts";

export const DASH_V8_BEHAVIOUR = 8;

export const TICK_CAP = 3600;
export const MAX_TREASURE = 8;

/** Half-width of a body. Half-height is the same: a body is a square. */
export const BODY = 96;

/**
 * How far below the middle of a cell a body comes to rest on that cell's floor.
 *
 * The bottom of a cell is half a cell from its middle; the bottom of a body is
 * half a body from ITS middle. So a body sitting on the floor has its middle
 * this far below the middle of the cell -- 32 subcells, an eighth of a cell.
 * The player has always found this by falling. An enemy never falls, so it is
 * put there.
 */
export const REST = ((ONE >> 1) - BODY) | 0;

/** Subcells per tick, per tick. Gravity is the only constant that matters. */
export const GRAVITY = 6;
/** Nothing falls faster than this, so nothing tunnels through a floor. */
export const TERMINAL = 88;
/** Run speed by speed pips. */
const RUN_BY_PIP: readonly number[] = [22, 28, 34, 40, 46, 52];
/** Jump impulse by strength pips: strength is how hard you push off. */
/**
 * Upward push, by strength pips.
 *
 * v1's weakest was 58, which rises 0.98 of a cell and needs 1.0 -- so a
 * creature that spent everything on speed could not climb a single step, and
 * the side-on game became ladders and flat ground only. Two subcells of
 * velocity, and it made a whole build a trap.
 *
 * These are MEASURED, not chosen: driven through this engine at every strength
 * and step height, they give a maximum step of [1,1,1,2,2,3] cells. Everybody
 * can climb; strength buys a second cell at three pips and a third at five.
 * test/dash-v2.test.ts re-measures on every run.
 */
const JUMP_BY_PIP: readonly number[] = [64, 72, 80, 88, 96, 104];
/** Climbing is deliberately slower than running. */
export const CLIMB_SPEED = 26;
export const ENEMY_SPEED = 22;
/** Ticks a stomped enemy stays down. */
export const STOMP_TICKS = 90;
/** How long a swing stays out, in ticks. Same as from above, so it feels the same. */
export const SWING_TICKS = 8;
/**
 * How far the weapon lands, from the body's centre. Matched to roam's REACH:
 * a sword is a sword in both games, and a child who has learned how close they
 * have to be from above should not have to learn it again from the side.
 */
export const REACH = (BODY + (ONE >> 2) + 2 * (ONE >> 1)) | 0;

/**
 * How close you must be to pick treasure up. **Not the weapon's reach.**
 *
 * The same fix roam/5 made, for the same reason: up to dash/3 these were one
 * number, so a gem came off the floor from 416 subcells away -- over a cell and
 * a half, through walls and floors. From the side that is worse than from
 * above, because it means collecting treasure from the platform below without
 * ever working out how to get up to it.
 *
 * Your own body plus a quarter of a cell. See docs/adr/0028 and 0029.
 */
export const GRAB = (BODY + (ONE >> 2)) | 0;
/** Swings an enemy takes before it is gone, by strength pips. Wands never kill. */
const HITS_BY_PIP: readonly number[] = [4, 3, 3, 2, 2, 1];
/** Ticks a struck enemy stays down, by strength pips. */
const STUN_BY_PIP: readonly number[] = [14, 20, 26, 32, 40, 48];
/** Ticks a wand freezes one for, by strength pips. Always from a single wave. */
const FREEZE_BY_PIP: readonly number[] = [90, 110, 130, 150, 170, 190];

/** Swings this creature needs to put an enemy down for good. 0 for a wand. */
export function hitsToKillFor(creature: Creature): number {
  if (creature.weapon === "wand") return 0;
  return HITS_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}
/** True when this creature's swing can finish an enemy off at all. */
export function killsFor(creature: Creature): boolean {
  return creature.weapon !== "wand";
}
/** How long a struck enemy stays put: a moment for a sword, a while for a wand. */
export function downTicksFor(creature: Creature): number {
  return creature.weapon === "wand"
    ? (FREEZE_BY_PIP[pipOf(creature.caps.FORCE)] as number)
    : (STUN_BY_PIP[pipOf(creature.caps.FORCE)] as number);
}
/** How hard you bounce off something you landed on. */
export const BOUNCE = 62;
export const MERCY_TICKS = 45;

const CONSUMES: ReadonlySet<Capability> = new Set<Capability>(["FORCE", "GUARD", "HASTE", "REACH"]);

function pipOf(value: number): number {
  return clamp((((value | 0) + 25) / 51) | 0, 0, 5);
}

export function runFor(creature: Creature): number {
  return RUN_BY_PIP[pipOf(creature.caps.HASTE)] as number;
}
export function jumpFor(creature: Creature): number {
  return JUMP_BY_PIP[pipOf(creature.caps.FORCE)] as number;
}
/**
 * Hearts come from STRENGTH now. Toughness used to be its own characteristic
 * and nobody could tell the two words apart, so being strong covers standing up
 * to a hit as well as landing one -- which is what most people assumed it meant
 * in the first place. See docs/adr/0012.
 */
export function heartsFor(creature: Creature): number {
  return (2 + pipOf(creature.caps.FORCE)) | 0;
}
/** The same for everyone; see the note on hearts. */
export function reachFor(_creature: Creature): number {
  return (BODY + (ONE >> 2) + 2 * (ONE >> 1)) | 0;
}

interface Walker {
  x: number;
  y: number;
  dir: number;
  stun: number;
  /** Swings left before it is gone. */
  hp: number;
  /** 1 once it has been put down. It stays down until the level restarts. */
  down: number;
  /**
   * How fast it is falling. 0 whenever it is standing on something.
   *
   * New in v8, and the only new piece of walker state -- so it is the only
   * thing that had to join the hash.
   */
  vy: number;
}

export class DashV8 implements Engine {
  readonly id = "dash" as const;
  readonly behaviourVersion = DASH_V8_BEHAVIOUR;
  readonly consumes = CONSUMES;

  private readonly level: Level;
  private readonly creature: Creature;
  private readonly walkers: Walker[];
  private readonly run: number;
  private readonly jump: number;
  private readonly reach: number;
  private readonly downTicks: number;
  private readonly walkerHits: number;
  private readonly kills: boolean;
  private readonly hearts: number;

  private x: number;
  private y: number;
  private vy: number;
  private facing: number;
  private grounded: boolean;
  private climbing: boolean;
  private tick: number;
  private collected: number;
  private hp: number;
  private mercy: number;
  private status: Status;
  private readonly allTreasure: number;
  private readonly tiles: Uint8Array;
  private stompedThisTick = false;
  private struckThisTick = false;
  private killedThisTick = false;
  private frozeThisTick = false;
  private swing = 0;
  private hurtThisTick = false;

  constructor(level: Level, creature: Creature = BRUK) {
    if (level.treasureCells.length > MAX_TREASURE) {
      throw new Error(`level has ${level.treasureCells.length} treasures; dash v4 holds ${MAX_TREASURE}`);
    }
    this.level = level;
    this.creature = creature;
    this.run = runFor(creature);
    this.jump = jumpFor(creature);
    this.hearts = heartsFor(creature);
    this.reach = reachFor(creature);

    this.x = cellCentre(level.startX);
    this.y = cellCentre(level.startY);
    this.vy = 0;
    this.facing = FACE_RIGHT;
    this.grounded = false;
    this.climbing = false;
    this.tick = 0;
    this.collected = 0;
    this.hp = this.hearts;
    this.mercy = 0;
    this.status = STATUS_PLAYING;
    this.allTreasure = ((1 << level.treasureCells.length) - 1) | 0;
    this.tiles = new Uint8Array(GRID_W * GRID_H);

    this.reach = reachFor(creature);
    this.downTicks = downTicksFor(creature);
    this.walkerHits = hitsToKillFor(creature);
    this.kills = killsFor(creature);

    this.walkers = [];
    for (let i = 0; i < level.guardCells.length; i = (i + 1) | 0) {
      const cell = level.guardCells[i] as number;
      this.walkers.push({
        x: cellCentre(cell % GRID_W),
        y: (cellCentre((cell / GRID_W) | 0) + REST) | 0,
        dir: 1,
        stun: 0,
        hp: this.walkerHits | 0,
        down: 0,
        vy: 0,
      });
    }
  }

  step(held: number): Status {
    if (this.status !== STATUS_PLAYING) return this.status;

    const buttons = held | 0;
    this.stompedThisTick = false;
    this.hurtThisTick = false;
    this.struckThisTick = false;
    this.killedThisTick = false;
    this.frozeThisTick = false;
    this.tick = (this.tick + 1) | 0;
    if (this.mercy > 0) this.mercy = (this.mercy - 1) | 0;

    this.moveSideways(buttons);
    this.moveVertically(buttons);

    // A swing starts when the button goes down; holding it does not flail.
    if (this.swing > 0) this.swing = (this.swing - 1) | 0;
    if ((buttons & HELD_SWING) !== 0 && this.swing === 0) {
      this.swing = SWING_TICKS;
      this.strike();
    }

    this.moveWalkers();
    this.touchWalkers();
    // After the walkers, and sharing their mercy window: two hits in one tick
    // would take two hearts for one mistake, and a walker standing on spikes
    // cannot be told apart from one standing beside them.
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

  private moveSideways(buttons: number): void {
    let dx = 0;
    if ((buttons & HELD_LEFT) !== 0) dx = (dx - 1) | 0;
    if ((buttons & HELD_RIGHT) !== 0) dx = (dx + 1) | 0;
    if (dx === 0) return;

    this.facing = dx > 0 ? FACE_RIGHT : FACE_LEFT;
    const nx = (this.x + this.run * dx) | 0;
    if (this.fits(nx, this.y)) this.x = nx;
  }

  private moveVertically(buttons: number): void {
    const onLadder = this.overLadder(this.x, this.y);

    // Climbing suspends gravity entirely, the way it does in every game of this
    // shape. A ladder you fall off halfway up is not a ladder.
    if (onLadder && ((buttons & HELD_UP) !== 0 || (buttons & HELD_DOWN) !== 0)) {
      // Take hold of it. Whatever part of you was over the ladder, all of you
      // is on it now -- which is what lets a body wider than the gap in the
      // floor go up through it at all.
      //
      // Only when you are NOT also pushing left or right. Sideways movement
      // happens first in a tick, so a snap that ignored the steering would
      // drag you straight back onto the ladder every time you tried to leave
      // it: you could climb one and then never get off. Pressing a direction
      // means "step off", and it wins.
      if ((buttons & (HELD_LEFT | HELD_RIGHT)) === 0) {
        const rung = this.ladderColumn(this.x, this.y);
        if (rung >= 0) {
          const centre = cellCentre(rung);
          // ...but never INTO a wall. A ladder tucked against one would
          // otherwise shove you through it.
          if (this.fits(centre, this.y)) this.x = centre;
        }
      }
      this.climbing = true;
      this.vy = 0;
      const dy = (buttons & HELD_UP) !== 0 ? -CLIMB_SPEED : CLIMB_SPEED;
      const ny = (this.y + dy) | 0;
      if (this.fits(this.x, ny)) this.y = ny;
      this.grounded = false;
      return;
    }
    if (this.climbing && onLadder) {
      // Still holding on, just not moving.
      this.vy = 0;
      return;
    }
    this.climbing = false;

    // Jumping. Strength is how hard you push off, so a strong creature clears
    // gaps a quick one has to go round.
    if (this.grounded && (buttons & HELD_ACT) !== 0) {
      this.vy = (-this.jump) | 0;
      this.grounded = false;
    }

    this.vy = (this.vy + GRAVITY) | 0;
    if (this.vy > TERMINAL) this.vy = TERMINAL;

    // Step the fall in slices no larger than a body, so nothing tunnels through
    // a one-cell-thick floor at speed.
    let left = this.vy;
    const stepSize = BODY;
    this.grounded = false;
    while (left !== 0) {
      const slice = left > 0 ? (left < stepSize ? left : stepSize) : left > -stepSize ? left : -stepSize;
      const ny = (this.y + slice) | 0;
      if (this.fits(this.x, ny)) {
        this.y = ny;
        left = (left - slice) | 0;
      } else {
        if (slice > 0) this.grounded = true; // landed
        this.vy = 0;
        break;
      }
    }
  }

  /**
   * Which column's ladder you are touching, or -1.
   *
   * Nearest to the middle of you wins, and a tie goes to the left, so two
   * ladders side by side always resolve the same way for everybody replaying
   * the same log.
   */
  private ladderColumn(x: number, y: number): number {
    const left = toCell((x - BODY + 1) | 0);
    const right = toCell((x + BODY - 1) | 0);
    const top = toCell((y - BODY + 1) | 0);
    const bottom = toCell((y + BODY - 1) | 0);
    let best = -1;
    let bestGap = 0;
    for (let cx = left; cx <= right; cx = (cx + 1) | 0) {
      if (cx < 0 || cx >= GRID_W) continue;
      let has = false;
      for (let cy = top; cy <= bottom; cy = (cy + 1) | 0) {
        if (cy < 0 || cy >= GRID_H) continue;
        if (isLadder(this.level, cx, cy)) { has = true; break; }
      }
      if (!has) continue;
      const away = (cellCentre(cx) - x) | 0;
      const gap = (away < 0 ? -away : away) | 0;
      if (best < 0 || gap < bestGap) { best = cx; bestGap = gap; }
    }
    return best;
  }

  private overLadder(x: number, y: number): boolean {
    const cx = toCell(x);
    const top = toCell((y - BODY + 1) | 0);
    const bottom = toCell((y + BODY - 1) | 0);
    for (let cy = top; cy <= bottom; cy = (cy + 1) | 0) {
      if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) continue;
      if (isLadder(this.level, cx, cy)) return true;
    }
    return false;
  }

  private fits(x: number, y: number): boolean {
    const left = toCell((x - BODY + 1) | 0);
    const right = toCell((x + BODY - 1) | 0);
    const top = toCell((y - BODY + 1) | 0);
    const bottom = toCell((y + BODY - 1) | 0);
    for (let cy = top; cy <= bottom; cy = (cy + 1) | 0) {
      for (let cx = left; cx <= right; cx = (cx + 1) | 0) {
        if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
        if (isWall(this.level, cx, cy)) return false;
      }
    }
    return true;
  }

  /**
   * Is there floor under this spot? Used so walkers turn at a ledge.
   *
   * The cell BELOW the one the walker is in. Up to v6 this measured a distance
   * from the middle of the body -- `y + BODY + 2` -- which only reaches the
   * next cell down if the body is resting on the floor, and an enemy never
   * was. It read the enemy's own empty cell instead and answered "ledge" every
   * time. Asking about a cell cannot be thrown off by a fraction of one.
   */
  private floorUnder(x: number, y: number): boolean {
    const cx = toCell(x);
    const cy = (toCell(y) + 1) | 0;
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
    return isWall(this.level, cx, cy);
  }

  private moveWalkers(): void {
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      if (walker.down !== 0) continue;
      if (walker.stun > 0) {
        walker.stun = (walker.stun - 1) | 0;
        continue;
      }

      // Falling comes first, and while it is in the air it does not walk.
      // A walker that could steer mid-fall would drift out over a pit it was
      // never standing next to, which is the thing the ledge test exists to
      // stop happening on the ground.
      if (!this.floorUnder(walker.x, walker.y)) {
        this.dropWalker(walker);
        continue;
      }
      walker.vy = 0;

      const nx = (walker.x + ENEMY_SPEED * walker.dir) | 0;
      // Both tests are taken at the leading edge of the body rather than at
      // its middle. Measured on the middle, a walker put its face a third of a
      // cell into the bricks before it turned round, and stepped the same
      // third of a cell out over the end of a platform -- which nobody ever
      // saw, because until v7 no walker took a step at all.
      const lead = (nx + BODY * walker.dir) | 0;
      const blocked = !this.clearFor(nx, walker.y) || !this.clearFor(lead, walker.y);
      const ledge = !this.floorUnder(lead, walker.y);
      if (blocked || ledge) {
        walker.dir = (-walker.dir) | 0;
      } else {
        walker.x = nx;
      }
    }
  }

  /**
   * One tick of falling, for a walker with nothing under it.
   *
   * The player's fall, with the player's constants, sliced the same way: a
   * slice no larger than a body, so nothing tunnels through a floor one cell
   * thick at speed. Landing snaps to REST above the deck it landed on, which
   * is the height a walker is spawned at -- so one that fell is standing
   * exactly where one that was drawn there stands, and neither reads the floor
   * differently afterwards.
   */
  private dropWalker(walker: Walker): void {
    walker.vy = (walker.vy + GRAVITY) | 0;
    if (walker.vy > TERMINAL) walker.vy = TERMINAL;

    let left = walker.vy;
    while (left > 0) {
      const slice = left < BODY ? left : BODY;
      const ny = (walker.y + slice) | 0;
      if (!this.walkerFits(walker.x, ny)) break;
      walker.y = ny;
      left = (left - slice) | 0;
      if (this.floorUnder(walker.x, walker.y)) break;
    }

    // Landed: sit on the deck, at exactly the height a walker DRAWN on that
    // cell is spawned at. Without this it stops wherever in the cell the last
    // slice left it -- measured at 90 subcells above the deck, a third of a
    // cell of daylight under its feet, which is the sort of thing nobody can
    // name but everybody can see.
    if (this.floorUnder(walker.x, walker.y)) {
      walker.y = (cellCentre(toCell(walker.y)) + REST) | 0;
      walker.vy = 0;
    }
  }

  /** Does a walker's body clear the walls here? Its own cell, and its edges. */
  private walkerFits(x: number, y: number): boolean {
    return this.clearFor(x, y)
      && this.clearFor((x - BODY) | 0, y)
      && this.clearFor((x + BODY) | 0, y);
  }

  private clearFor(x: number, y: number): boolean {
    const cx = toCell(x);
    const cy = toCell(y);
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return false;
    return !isWall(this.level, cx, cy);
  }

  /**
   * The weapon. Measured from YOU, not from the blade's tip, so an enemy
   * pressed against you is hit rather than falling through the middle of the
   * arc -- the same fix roam/3 needed, and for the same reason.
   *
   * Facing here is only ever left or right, which is the whole difference from
   * the game seen from above: you cannot swing at something below you. That is
   * what stomping is for.
   */
  private strike(): void {
    const dx = FACE_DX[this.facing] as number;

    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      if (walker.down !== 0) continue;
      if (walker.stun > 0) continue;

      const away = chebyshev(walker.x, walker.y, this.x, this.y);
      if (away > this.reach) continue;

      // In front of you, unless it is close enough to be touching.
      const ahead = (((walker.x - this.x) | 0) * dx) | 0;
      if (away > BODY + BODY && ahead < 0) continue;

      this.struckThisTick = true;

      if (this.kills) {
        walker.hp = (walker.hp - 1) | 0;
        if (walker.hp <= 0) {
          walker.down = 1;
          walker.stun = 0;
          this.killedThisTick = true;
          continue;
        }
      } else {
        this.frozeThisTick = true;
      }

      walker.stun = this.downTicks | 0;

      // Shoved along the swing, as far as the ground allows.
      const shoveX = (walker.x + sign((walker.x - this.x) | 0) * ONE) | 0;
      if (this.clearFor(shoveX, walker.y)) walker.x = towards(walker.x, shoveX, ONE);
    }
  }

  /**
   * Landing on something beats it; walking into it does not. The difference is
   * whether you were on the way down, which is the rule every child already
   * knows from Mario.
   */
  /**
   * Standing on the spikes.
   *
   * Measured from the CELL the middle of you is in. A body is three quarters
   * of a cell, so edge overlap would catch you while the sprite is clearly
   * beside them -- and this hazard never moves, so there is nothing for the
   * player to blame it on.
   *
   * No knock-back. A walker knocks you clear because it is about to hit you
   * again; spikes cannot follow, and being flung off a ledge by the floor is a
   * worse punishment than the heart it already cost.
   */
  private touchFire(): void {
    if (this.mercy > 0) return;
    const cx = toCell(this.x);
    const cy = toCell(this.y);
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return;
    if (!isFire(this.level, cx, cy)) return;

    this.hp = (this.hp - 1) | 0;
    this.mercy = MERCY_TICKS;
    this.hurtThisTick = true;
  }

  private touchWalkers(): void {
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      if (walker.down !== 0) continue;
      if (walker.stun > 0) continue;
      if (chebyshev(walker.x, walker.y, this.x, this.y) > BODY + BODY) continue;

      const fromAbove = this.vy > 0 && this.y < walker.y;
      if (fromAbove) {
        walker.stun = STOMP_TICKS;
        this.vy = (-BOUNCE) | 0;
        this.grounded = false;
        this.stompedThisTick = true;
        continue;
      }

      if (this.mercy > 0) continue;
      this.hp = (this.hp - 1) | 0;
      this.mercy = MERCY_TICKS;
      this.hurtThisTick = true;
      // Knocked back and up, so you are not standing in it when mercy ends.
      const awayX = (this.x + sign((this.x - walker.x) | 0) * ONE) | 0;
      if (this.fits(awayX, this.y)) this.x = awayX;
      this.vy = (-BOUNCE) | 0;
      this.grounded = false;
      return;
    }
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
      if (walls[i] === 1) this.tiles[i] = TILE_WALL;
      else if (this.level.ladders[i] === 1) this.tiles[i] = TILE_LADDER;
      else this.tiles[i] = TILE_FLOOR;
    }
    // Under the gems and the door: a gem you cannot see is a level you cannot
    // finish, and the hazard never changes.
    const burning = this.level.fireCells;
    for (let i = 0; i < burning.length; i = (i + 1) | 0) {
      this.tiles[burning[i] as number] = TILE_FIRE;
    }
    const cells = this.level.treasureCells;
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if ((this.collected & (1 << i)) === 0) this.tiles[cells[i] as number] = TILE_TREASURE;
    }
    if (this.level.exitX >= 0) {
      this.tiles[idx(this.level.exitX, this.level.exitY)] =
        this.collected === this.allTreasure ? TILE_EXIT_OPEN : TILE_EXIT_LOCKED;
    }
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      if (walker.down !== 0) continue;
      const cell = idx(clamp(toCell(walker.x), 0, GRID_W - 1), clamp(toCell(walker.y), 0, GRID_H - 1));
      this.tiles[cell] = walker.stun > 0 ? TILE_GUARD_REELING : TILE_GUARD;
    }
    this.tiles[idx(clamp(toCell(this.x), 0, GRID_W - 1), clamp(toCell(this.y), 0, GRID_H - 1))] =
      TILE_ACTOR;
    return this.tiles;
  }

  stateHash(): number {
    let h = hashInit();
    h = hashInt32(h, this.x);
    h = hashInt32(h, this.y);
    h = hashInt32(h, this.vy);
    h = hashInt32(h, this.facing);
    h = hashInt32(h, this.grounded ? 1 : 0);
    h = hashInt32(h, this.climbing ? 1 : 0);
    h = hashInt32(h, this.tick);
    h = hashInt32(h, this.collected);
    h = hashInt32(h, this.hp);
    h = hashInt32(h, this.mercy);
    h = hashInt32(h, this.status);
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      const walker = this.walkers[i] as Walker;
      h = hashInt32(h, walker.x);
      h = hashInt32(h, walker.y);
      h = hashInt32(h, walker.dir);
      h = hashInt32(h, walker.stun);
      h = hashInt32(h, walker.hp);
      h = hashInt32(h, walker.down);
      // New in v8, and authoritative: two replays of the same log have to agree
      // about how fast a walker is falling, or a level would not replay.
      h = hashInt32(h, walker.vy);
    }
    return h | 0;
  }

  message(): string | null {
    const name = this.creature.name;
    if (this.status === STATUS_WON) return `${name} made it to the top.`;
    if (this.status === STATUS_LOST) {
      return this.hp <= 0 ? `${name} ran out of bounce.` : "Out of time.";
    }
    if (this.hurtThisTick) return "Ouch.";
    if (this.killedThisTick) return "Got it.";
    if (this.frozeThisTick) return "Frozen solid.";
    if (this.stompedThisTick) return "Bounced right off it.";
    return null;
  }

  // --- presentation, never hashed ------------------------------------------------

  where(): { x: number; y: number; facing: number } {
    return { x: this.x, y: this.y, facing: this.facing };
  }
  /**
   * `dir` is which way each walker is heading, and it is handed out so the
   * picture can face that way.
   *
   * It is not new and it is not cosmetic: a walker's direction has been part of
   * stateHash() since dash/1, because it is what the simulation turns round at
   * a ledge. This only stops it being private. Hard rule 4 says cosmetics must
   * never touch the hash; it does not say the presentation may not READ the
   * state, and a run replays identically whether anything looked or not.
   *
   * There was simply nothing to look at before v7, because no walker moved.
   */
  enemyPositions(): Array<{
    x: number; y: number; stunned: boolean; chasing: boolean; dir: number;
  }> {
    return this.walkers
      .filter((w) => w.down === 0)
      .map((w) => ({ x: w.x, y: w.y, stunned: w.stun > 0, chasing: false, dir: w.dir | 0 }));
  }
  onGround(): boolean { return this.grounded; }
  onLadder(): boolean { return this.climbing; }
  falling(): number { return this.vy; }
  swinging(): boolean { return this.swing > 0; }
  swingLeft(): number { return this.swing; }
  swingLength(): number { return SWING_TICKS; }
  /** True on the tick a swing finished one off. Presentation only. */
  justKilled(): boolean { return this.killedThisTick; }
  /** True on the tick a wave froze one. Presentation only. */
  justFroze(): boolean { return this.frozeThisTick; }
  /** Enemies still standing, for the HUD. Presentation only. */
  enemiesLeft(): number {
    let n = 0;
    for (let i = 0; i < this.walkers.length; i = (i + 1) | 0) {
      if ((this.walkers[i] as Walker).down === 0) n = (n + 1) | 0;
    }
    return n;
  }
  merciful(): boolean { return this.mercy > 0; }
  justStomped(): boolean { return this.stompedThisTick; }
  justHurt(): boolean { return this.hurtThisTick; }
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
