// The gem coming out of the box.
//
//     "It needs to be clear they got a gem. At the moment it happens so quick
//      you don't realise it was a gem and it looks empty, at least on the from
//      above levels."
//
// Right, and the cause is in the engine's favour rather than against it: a gem
// in a box goes STRAIGHT into your purse, because the box was a wall and the
// cell it leaves behind is somewhere you have not stood -- a gem you had to go
// back for would read as one you had missed. So nothing is ever dropped on the
// floor, and from above, where there is no gravity to sell the moment, opening
// a box looked exactly like opening an empty one.
//
// The counter did go up. A counter going up is not an EVENT: a child watching
// their creature does not have the treasure line in their eye, and the whole
// reason boxes are worth having is the moment you find out.
//
// So the gem is drawn coming out. It rises out of the box, hangs, and fades --
// about half a second, which is long enough to read and short enough that it
// is gone before you have walked into the next thing.
//
// It is drawn AFTER the fact, which is worth being clear about: by the time
// this runs the box is open and the player has already seen what was inside.
// Nothing here can tell anybody what is in a box that is still shut.

/** How long the gem is in the air, in frames. Half a second at sixty. */
export const POP_FRAMES = 30;

/** Where the gem is, relative to the middle of the box it came out of. */
export interface Pop {
  /** Art pixels UP from the box's middle. */
  readonly rise: number;
  /** 0..1, in whole steps. */
  readonly fade: number;
  /** Side of the gem, in art pixels. */
  readonly size: number;
}

/**
 * The gem, `frame` frames after the box opened.
 *
 * Out fast and then hanging, rather than rising steadily: a thing that comes
 * out of a box is thrown, and what makes it read as thrown is that most of the
 * distance happens in the first few frames. The hang is what gives a child time
 * to see what it was.
 */
export function popAt(frame: number): Pop | null {
  if (frame < 0 || frame >= POP_FRAMES) return null;
  const at = frame / POP_FRAMES;
  // Most of the rise in the first third, then it hangs.
  const climb = at < 0.34 ? at / 0.34 : 1;
  const rise = Math.round(2 + climb * 10);
  // Full for the first two thirds -- that is the part that has to be READ --
  // and then two steps out. Whole steps, like everything else drawn here.
  const fade = at < 0.6 ? 1 : at < 0.82 ? 0.66 : 0.33;
  // It shrinks a little as it goes, which reads as going away rather than as
  // being taken away.
  const size = at < 0.7 ? 10 : 8;
  return { rise, fade, size };
}
