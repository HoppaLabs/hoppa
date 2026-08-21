// The three things that walk about and hurt you.
//
// Up to now there was one enemy and it was a rounded rectangle with two eye
// rectangles, drawn with fillRect at fractional coordinates. Sampled on the
// canvas, that patch held SEVENTEEN distinct colours -- every edge soft,
// because every coordinate was a float. Real pixel art there is three or four.
// Reported as "the animation breaks the 8bit look", which it did, three ways
// at once: anti-aliased edges, continuous squash-and-stretch scaling, and a
// sine-driven bounce sampled every frame.
//
// Sprite hardware of the era could not scale, could not position at half a
// pixel, and could not tween. What it could do is swap between a small number
// of drawn frames. So: two frames each, whole pixels, no scaling.
//
// Drawn with three inks, the same convention as the characters in
// tools/gallery.ts -- 1 is the body, 2 is the light, 3 is the dark. The dark
// does triple duty as outline, shadow and features, which is the standard way
// three colours are made to carry a figure.
//
// Frame B is the walk beat: legs apart where frame A has them together, and
// for the bat, wings down where frame A has them up. Everything above the legs
// is identical between frames, so the total inked mass barely changes and the
// creature does not appear to inflate as it walks.
//
// Cosmetic only: hard rule 4. Which enemy a level carries is in the wire
// format, but no engine is ever told, and every one of them behaves exactly as
// the single old guard did. A run replays identically whichever art it wore.

import { SPRITE_H, SPRITE_W } from "../src/core/sprite.ts";

export interface Enemy {
  /** The name in a level file, the editor, and the wire format's kind field. */
  readonly name: string;
  /** What the level text calls it. One character, upper case. */
  readonly glyph: string;
  /** Two frames: legs together, legs apart. */
  readonly frames: readonly (readonly string[])[];
  /**
   * The colours, indexed by the digits used in the rows: 1 shadow, 2 mid,
   * 3 lit, 4 a second material, 5 white, 6 outline, and fire after that.
   *
   * A CREATURE gets three, and has to: a character travels inside a link, and
   * spec S5 fixes it at two bits a pixel. An enemy travels nowhere. It is art
   * baked into the bundle, so the only thing that was holding it to three inks
   * was reusing the creature machinery to draw it.
   *
   * Three inks means one is the outline, so a creature has TWO materials --
   * which is why these read as flat next to the era's best work. That work is
   * not more detailed pixel by pixel; it has more distinct materials. On the
   * hardware that came from metasprites: several 8x8 tiles, each with its own
   * three-colour palette, assembled into one character. Same idea here,
   * without the hardware.
   */
  readonly inks: readonly string[];
}

export const ENEMIES: readonly Enemy[] = [
  {
    name: "goblin",
    glyph: "G",
    inks: ["#2e7a45", "#4fbb56", "#96e06b", "#cfe8b0", "#ffffff", "#15322a"],
    frames: [
      [
        "................",
        "..66........66..",
        ".6446......6446.",
        ".644344..443446.",
        ".64422233322446.",
        ".64422222222446.",
        ".64422522522446.",
        ".64422522522446.",
        ".64411111112446.",
        ".64416666663446.",
        ".64423333333446.",
        "..644222222446..",
        "...6442222446...",
        "....64111146....",
        "....66....66....",
        "................",
      ],
      [
        "................",
        "..66........66..",
        ".6446......6446.",
        ".644344..443446.",
        ".64422233322446.",
        ".64422222222446.",
        ".64422522522446.",
        ".64422522522446.",
        ".64411111112446.",
        ".64416666663446.",
        ".64423333333446.",
        "..644222222446..",
        "...6441111446...",
        ".6422......2246.",
        ".66..........66.",
        "................",
      ],
    ],
  },
  {
    name: "bat",
    glyph: "B",
    inks: ["#3d2a6b", "#8b4fc4", "#c98ae8", "#5a3596", "#ffffff", "#181532"],
    frames: [
      [
        "................",
        "6..............6",
        "64............46",
        "644..........446",
        "6444.6....6.4446",
        "6444626..6264446",
        ".64463333326446.",
        "..463552255264..",
        "...6222222116...",
        "....62255116....",
        ".....632216.....",
        ".....621116.....",
        "......6666......",
        "................",
        "................",
        "................",
      ],
      [
        "................",
        "................",
        "................",
        "................",
        ".....6....6.....",
        "....626..626....",
        "....63333326....",
        "...6355225526...",
        "..462222221164..",
        ".64462255116446.",
        "6444.632216.4446",
        "644..621116..446",
        "64....6666....46",
        "6..............6",
        "................",
        "................",
      ],
    ],
  },
  {
    name: "lizard",
    glyph: "D",
    inks: ["#2f7a5c", "#4fb882", "#8fdc9e", "#d3ecdd", "#ffffff", "#193226", "#ff9f3d", "#ffe9a3"],
    frames: [
      [
        "................",
        "........6666....",
        ".......633326...",
        ".......6325526..",
        ".....663322116..",
        "....646322446...",
        "...6446322446...",
        ".....66322446...",
        "....646322446...",
        "...6446322446...",
        ".....66322446...",
        "....626211446...",
        "..6226626.646...",
        "6226..626.646...",
        ".66..6666.6666..",
        "................",
      ],
      [
        "................",
        "........6666....",
        ".......633326...",
        ".......632552677",
        ".....66332211678",
        "....646322446.7.",
        "...6446322446...",
        ".....66322446...",
        "....646322446...",
        "...6446322446...",
        ".....66322446...",
        "....626211446...",
        "..6226626..646..",
        "6226..626..646..",
        ".66..6666..6666.",
        "................",
      ],
    ],
  },
];

/**
 * Measurable properties of a sprite, so "does this look right" has an answer
 * that is not an opinion.
 *
 * Suggested as an adversarial check against reference artwork. The references
 * turned out to be unusable -- one was a JPEG, and JPEG destroys the flat
 * regions and hard edges that pixel art IS, measuring 74 colours and 87 orphan
 * pixels where a real sprite has a handful. But the measurements are worth
 * having anyway, because they caught three things in OUR art that the eye did
 * not: the bat had 18 orphan pixels and the dragon 15, against the goblin's 1.
 *
 * An orphan is an inked pixel with no neighbour of its own colour. The craft
 * writing is unanimous that these read as dirt rather than as detail, and that
 * they are the first thing lost when a sprite moves over a busy background.
 * One or two, placed deliberately, are how an eye is drawn; fifteen is noise.
 */
export interface Measured {
  readonly inks: number;
  readonly fill: number;
  readonly orphans: number;
  readonly symmetry: number;
  readonly headShare: number;
}

export function measure(rows: readonly string[]): Measured {
  const h = rows.length;
  const w = (rows[0] as string).length;
  const at = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const ch = (rows[y] as string)[x] as string;
    return ch === "." ? null : ch;
  };

  const seen = new Set<string>();
  let inked = 0;
  let orphans = 0;
  let top = h;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = at(x, y);
      if (ch === null) continue;
      inked = (inked + 1) | 0;
      seen.add(ch);
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      // EIGHT-way, not four. A one-pixel diagonal is how every slope in pixel
      // art is drawn, and a four-way test calls every pixel of one an orphan --
      // so this metric spent a while reporting 16 orphans on a bat whose only
      // crime was having wings with sloping edges. A real orphan touches
      // nothing of its own colour in any direction.
      let touching = false;
      for (let dy = -1; dy <= 1 && !touching; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (at(x + dx, y + dy) === ch) { touching = true; break; }
        }
      }
      if (!touching) orphans = (orphans + 1) | 0;
    }
  }

  let mirrored = 0;
  let both = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = at(x, y);
      const b = at(w - 1 - x, y);
      if (a === null && b === null) continue;
      both = (both + 1) | 0;
      if (a === b) mirrored = (mirrored + 1) | 0;
    }
  }

  const tall = bottom - top + 1;
  const headTo = top + Math.floor(tall * 0.45);
  let head = 0;
  for (let y = top; y <= headTo; y++) {
    for (let x = 0; x < w; x++) if (at(x, y) !== null) head = (head + 1) | 0;
  }

  return {
    inks: seen.size,
    fill: inked / (w * h),
    orphans,
    symmetry: both === 0 ? 0 : mirrored / both,
    headShare: inked === 0 ? 0 : head / inked,
  };
}

/** The generator's own gate, before anything ships. */
/**
 * The garden's three, and the reef's three.
 *
 * THEY USED TO LIVE IN THE GENERATED FILE, hand-edited in after it was
 * written -- which meant the file said "GENERATED, do not edit" and would have
 * thrown both casts away, 460 lines down to 160, the moment anybody ran the
 * generator it names. Found by running it.
 *
 * A world absent from CASTS gets the dungeon three.
 */
export const GARDEN_CAST: readonly Enemy[] = [
  {
    // The one thing in the garden that means you harm, and the reason calm/2 has
    // a weapon in it at all.
    // 
    // It takes the GUARD slot. "G" is the one that hurts you in every other world
    // too -- a goblin below ground, a shark in the water -- so no new entity kind
    // was spent on it, and kind 7 stays free. The cost is the bird: three slots,
    // three creatures, and the bear wanted one.
    name: "bear",
    glyph: "G",
    inks: ["#3a2410", "#6b4423", "#8f5f30", "#c9a273", "#ffffff", "#1a1008"],
    frames: [
      [
        "..666......666..",
        "..616......616..",
        "..612666666216..",
        "..622222222226..",
        "...6252222526...",
        "...6262222626...",
        "...6224664226...",
        "...6244444426...",
        "....62444426....",
        "..662224422266..",
        ".61113333331116.",
        ".61113333331116.",
        "..612333333216..",
        "...6233333326...",
        "....61133116....",
        "....66666666....",
      ],
      [
        "..666......666..",
        "..616......616..",
        "..612666666216..",
        "..622222222226..",
        "...6252222526...",
        "...6262222626...",
        "...6224664226...",
        "...6244444426...",
        "....62444426....",
        "..662224422266..",
        ".61113333331116.",
        ".61113333331116.",
        "..612333333216..",
        "...6233333326...",
        "...6111331116...",
        "...6666666666...",
      ],
    ],
  },
  {
    name: "bunny",
    glyph: "B",
    // "I think the bunny icons could be improved a lot." They could: it was a
    // rounded rectangle with two stubs on top and two dots in it, and at a
    // glance it read as a gamepad. A rabbit is EARS -- tall, upright, lined
    // with pink -- over a round head with a pale muzzle, and a body narrower
    // than the head so there is a neck rather than a box.
    inks: ["#4a2f16", "#9a6b38", "#c49461", "#e6c9a0", "#ffffff", "#2a1a0d", "#f0a0b4"],
    frames: [
      [
        "...6226..6226...",
        "...6276..6726...",
        "...6276..6726...",
        "...6276666726...",
        "...6222222226...",
        "...6223333226...",
        "..622563256226..",
        "..622662266226..",
        "..622447744226..",
        "...6244664426...",
        "....62444426....",
        "....62222226....",
        "...6223333226...",
        "..622444444226..",
        "...6244224426...",
        "....66666666....",
      ],
      [
        "..6226....6226..",
        "..6226....6226..",
        "...6276..6726...",
        "...6276666726...",
        "...6222222226...",
        "...6223333226...",
        "..622563256226..",
        "..622662266226..",
        "..622447744226..",
        "...6244664426...",
        "....62444426....",
        "...6223333226...",
        "..622444444226..",
        "...6244224426...",
        "....66666666....",
        "................",
      ],
    ],
  },
  {
    name: "squirrel",
    glyph: "D",
    inks: ["#6b350c", "#a35314", "#d87a1f", "#ffd0a3", "#ffffff", "#3d1d06"],
    frames: [
      [
        ".........66666..",
        "........6633366.",
        "...666.663333366",
        "..66366633366336",
        "..63336333666226",
        ".663333632666116",
        ".633233326661166",
        ".63252352261166.",
        ".6322222211666..",
        ".62612222166....",
        ".6211122216.....",
        ".6211111166.....",
        ".611661116......",
        ".616666116......",
        ".666..6666......",
        "................",
      ],
      [
        "........666666..",
        ".......66333366.",
        "...666.633333366",
        "..66366633666236",
        "..63336333666216",
        ".663333632661166",
        ".63323332661166.",
        ".6325225226166..",
        ".632222222166...",
        ".62612222266....",
        ".6211111116.....",
        "66211111166.....",
        "63116661116.....",
        "61166.66116.....",
        "6666...6666.....",
        "................",
      ],
    ],
  },
];

export const REEF_CAST: readonly Enemy[] = [
  {
    name: "shark",
    glyph: "G",
    // Reported as "the sharks look like fish". They were: a round body, a
    // blunt nose, a bump for a fin. What makes a shark is the SILHOUETTE --
    // a big raked dorsal, a pointed snout with the mouth slung underneath
    // it, a long torpedo body and a forked tail on a thin peduncle -- so
    // those are drawn first and the shading only follows the shape.
    inks: ["#2b3a4a", "#546679", "#8fa1b3", "#e8f1f8", "#ffffff", "#0b0f14"],
    frames: [
      [
        "........6.......",
        ".......616......",
        ".......6116.....",
        "......61116.....",
        ".....611116....6",
        ".....6111116..61",
        "..6.611111166611",
        "6656111111111111",
        "1111111122211166",
        "6656533333333111",
        "..6.644444466611",
        "...62226666...61",
        "....62226......6",
        ".....666........",
        "................",
        "................",
      ],
      [
        "........6.......",
        ".......616......",
        ".......6116.....",
        "......61116....6",
        ".....611116...61",
        ".....6111116.611",
        "..6.611111166611",
        "6656111111111111",
        "1111111122211166",
        "6656533333333111",
        "..66644444466611",
        "..622266666...61",
        "...62226......61",
        "....666........6",
        "................",
        "................",
      ],
    ],
  },
  {
    name: "kraken",
    glyph: "B",
    // The octopus was a friendly red balloon. A kraken is mass and eyes: a
    // heavy dome, a beak under it, and eight arms that curl differently in
    // each frame so it writhes rather than bobs.
    inks: ["#2a0f33", "#5a1b52", "#8c2a6b", "#d94f7a", "#ffe066", "#12060f"],
    frames: [
      [
        ".....666666.....",
        "....64444226....",
        "...6344333226...",
        "..633333333226..",
        ".63111333311136.",
        ".63115333351136.",
        ".63111333311136.",
        "..612226622216..",
        "..663226622366..",
        ".63332632633336.",
        ".633326326326336",
        "6226326326326632",
        "2266326326326632",
        "26.636636636..62",
        "26626626..626626",
        "62662626.626.626",
      ],
      [
        ".....666666.....",
        "....64444226....",
        "...6344333226...",
        "..633333333226..",
        ".63111333311136.",
        ".63115333351136.",
        ".63111333311136.",
        "..612226622216..",
        "..663226622366..",
        ".633326326333366",
        "6226326326336332",
        "326.63263326.662",
        "326.63263326.622",
        "626626663626.626",
        "26.626..6226.626",
        "26..626.626...62",
      ],
    ],
  },
  {
    name: "squid",
    glyph: "D",
    // The two things that say squid rather than octopus: a cone of a mantle
    // with the point UP, and fins at that point. Then the eyes, which are
    // the only part a child looks at, and the two long tentacles with a
    // paddle on the end among the shorter arms.
    inks: ["#5c1526", "#96263f", "#d9455e", "#ffb0a8", "#ffffff", "#1a0710"],
    frames: [
      [
        ".....664466.....",
        "...6623443266...",
        "..626234432626..",
        ".62262344326226.",
        "6222633443362226",
        ".62263344336266.",
        "..66633443366...",
        "....63344336....",
        "....63333336....",
        "...6233333326...",
        "..655333333556..",
        "..656333333656..",
        "..666222222666..",
        ".63362262626336.",
        ".63326266226336.",
        "..622626626226..",
      ],
      [
        ".....664466.....",
        "...6623443266...",
        "..626234432626..",
        ".62262344326226.",
        "6222633443362226",
        ".62263344336266.",
        "..66633443366...",
        "....63344336....",
        "....63333336....",
        "...6233333326...",
        "..655333333556..",
        "..6563333336566.",
        ".626622222266226",
        "626..622226..626",
        "6336.622226.6336",
        "6336.626626.6336",
      ],
    ],
  },
];

export const BEACH_CAST: readonly Enemy[] = [
  {
    name: "crab",
    glyph: "G",
    // The crab came off the reef when the kraken and the squid took those
    // slots, and a beach is where it belonged all along -- it is the one
    // creature on this list a child has actually met.
    // RED, not the sandy brown it wore on the reef. A brown crab on brown
    // sand is a crab nobody sees coming, and this is the one thing on the
    // beach that hunts you -- the colour is the warning.
    inks: ["#6b1420", "#a31d2e", "#d82f42", "#ff9f3d", "#ffffff", "#3a0d12"],
    frames: [
      [
        ".6666......6666.",
        "663366....663366",
        "633336....633336",
        "6333366666633336",
        "6623663333663266",
        ".66263333336266.",
        ".66623333332666.",
        "6622222222222266",
        "6212225225222126",
        "6211222222221126",
        "6611111111111166",
        "6161111111111616",
        "3166166116616613",
        "6666666666666666",
        "................",
        "................",
      ],
      [
        "................",
        ".6666......6666.",
        "663366....663366",
        "6333366666633336",
        "6333366333363333",
        "6632663333336633",
        ".666233333326666",
        "6622232222222266",
        "6222225225222226",
        "6221222222221226",
        "6611111111111166",
        "3661111111111661",
        "6116166116616116",
        "6666666666666666",
        "................",
        "................",
      ],
    ],
  },
  {
    name: "gull",
    glyph: "B",
    // At sixteen pixels a gull IS its wings, so they reach the edge of the
    // tile and change between the frames, which is the only animation a
    // bird needs. Drawn from one half and mirrored: a bird with two
    // different wings reads as a bird with a broken one.
    inks: ["#39485c", "#7c8899", "#cdd6e0", "#ffffff", "#ff9f3d", "#0d1014"],
    frames: [
      [
        "................",
        "666....66....666",
        "1116..6446..6111",
        "1116664444666111",
        "2333366446633332",
        "2233344554433322",
        "6222344554433226",
        ".66224444442266.",
        "...6644444466...",
        "....64444446....",
        "....64444446....",
        "....64444446....",
        ".....666666.....",
        ".....633336.....",
        ".....636636.....",
        "......6..6......",
      ],
      [
        "................",
        ".......66.......",
        "......6446......",
        ".....644446.....",
        ".....664466.....",
        "....64455446....",
        "...6644554466...",
        ".66224444442266.",
        "6333344444433336",
        "2333344444433332",
        "2332244444422332",
        "2226644444466222",
        "1116.666666.6111",
        "1116.633336.6111",
        "666..636636..666",
        "......6..6......",
      ],
    ],
  },
  {
    name: "jellyfish",
    glyph: "D",
    // The bell squeezes and opens between the frames and the tentacles trail
    // the other way, which is how a jellyfish moves. Eyes, because every
    // other creature here has them and one without read as a bag -- round
    // ones, because two white bars read as a visor.
    inks: ["#42126b", "#6b1fa8", "#9a3ad5", "#c46ff0", "#ffffff", "#25093a"],
    frames: [
      [
        "....64444336....",
        "...6444444336...",
        "..644444444326..",
        ".6224444443326..",
        ".62235444353226.",
        ".62236633366226.",
        ".62233333333226.",
        ".62233333333226.",
        "..6622666662226.",
        "...62222322226..",
        "...62622322626..",
        "..626623326626..",
        "..626623326626..",
        "..626623326626..",
        "...6262336226...",
        "...6226366226...",
      ],
      [
        ".....666666.....",
        "...6644444466...",
        "..644444444326..",
        ".62244444433226.",
        ".622354443532226",
        "6222366333662226",
        "6222333333332226",
        "6222333333332226",
        "6222333333332226",
        "626622666662266.",
        ".66226223226226.",
        "..622622322626..",
        ".62662622626626.",
        ".62662226326626.",
        "..6266266326226.",
        "..626626622626..",
      ],
    ],
  },
];

export const CITY_CAST: readonly Enemy[] = [
  {
    name: "kaiju",
    glyph: "G",
    // The big one, and the reason the room exists. Seen from above like
    // everything else in the adventure game, so what there is to work with
    // is the SHOULDERS, the head between them and the tail behind -- which
    // is plenty, because that reads as a monster from further away than a
    // face does.
    inks: ["#12521f", "#1c7d2c", "#2fae42", "#ffc23d", "#ff5f4d", "#0a2a12"],
    frames: [
      [
        "......666.......",
        ".....63336......",
        ".....611116.....",
        ".66662511526....",
        "62222234432266..",
        "622222333322226.",
        "666122344322226.",
        "222122333322266.",
        "2221223443222226",
        "6666223333222226",
        "...622333322666.",
        "....66666666....",
        ".......6226.....",
        "......66226.....",
        ".....62226......",
        "....62266.......",
      ],
      [
        "......666.......",
        ".....63336......",
        ".....611116.....",
        "....62511526666.",
        "..66223443222226",
        ".622223333222226",
        ".622223443221666",
        ".662223333221222",
        "6222223443221222",
        "6222223333226666",
        ".666223333226...",
        "....66666666....",
        ".......6226.....",
        "........62266...",
        ".........622266.",
        "..........662226",
      ],
    ],
  },
  {
    name: "swarmer",
    glyph: "B",
    // The flier. Small, wide-winged, and the one that gets over the blocks
    // instead of coming down the street.
    inks: ["#12521f", "#1c7d2c", "#2fae42", "#ffc23d", "#ff5f4d", "#0a2a12"],
    frames: [
      [
        "................",
        "66............66",
        "226..........622",
        "22266.6666.66222",
        "6222261111622226",
        ".62222522522226.",
        "..662122221266..",
        "....61111116....",
        "....61144116....",
        ".....614416.....",
        ".....611116.....",
        ".....611116.....",
        "......6116......",
        ".......66.......",
        "................",
        "................",
      ],
      [
        "................",
        "................",
        "................",
        "......6666......",
        ".....611116.....",
        ".....652256.....",
        "....61222216....",
        "..6621111116666.",
        "6622211441122226",
        "2222261441222222",
        "2226661111666622",
        "666..611116...66",
        "......6116......",
        ".......66.......",
        "................",
        "................",
      ],
    ],
  },
  {
    name: "crawler",
    glyph: "D",
    // The low one: a long body on many legs. Legs drawn AFTER the body, or
    // the body covers them and it is a slab with stripes on.
    inks: ["#12521f", "#1c7d2c", "#2fae42", "#ffc23d", "#ff5f4d", "#0a2a12"],
    frames: [
      [
        "................",
        "....66..66..66..",
        "...622662266226.",
        "....626.626.626.",
        "....62666266626.",
        ".6661111111116..",
        "622224444444446.",
        "1511344344344336",
        "1511333333333336",
        "622222222222226.",
        ".6661111111116..",
        "....666666666.6.",
        ".....626.626.626",
        ".....626.626.626",
        ".....62266226622",
        "......66..66..66",
      ],
      [
        "................",
        ".....66..66..66.",
        "....622662266226",
        ".....626.626.626",
        "....662666266626",
        ".66611111111166.",
        "622224444444446.",
        "1511344344344336",
        "1511333333333336",
        "622222222222226.",
        ".6661111111116..",
        "....6666666666..",
        "....626.626.626.",
        "....626.626.626.",
        "....622662266226",
        ".....66..66..66.",
      ],
    ],
  },
];

export const CASTS: Readonly<Record<string, readonly Enemy[]>> = {
  garden: GARDEN_CAST,
  reef: REEF_CAST,
  beach: BEACH_CAST,
  city: CITY_CAST,
};

/** Every drawing this file holds, for the checks below. */
export const ALL: readonly Enemy[] = [
  ...ENEMIES, ...GARDEN_CAST, ...REEF_CAST, ...BEACH_CAST, ...CITY_CAST,
];

export function check(): string[] {
  const wrong: string[] = [];
  // Per CAST, not globally: every cast uses the same three glyphs, because a
  // level stores an enemy as an index and the worlds are alternative art for
  // the same three slots.
  for (const [world, cast] of [["dungeon", ENEMIES], ["garden", GARDEN_CAST], ["reef", REEF_CAST], ["beach", BEACH_CAST],
    ["city", CITY_CAST]] as const) {
    if (cast.length !== ENEMIES.length) {
      wrong.push(`${world}: ${cast.length} creatures, want ${ENEMIES.length}`);
    }
    cast.forEach((one, at) => {
      const want = (ENEMIES[at] as Enemy).glyph;
      if (one.glyph !== want) wrong.push(`${world}: ${one.name} is "${one.glyph}", want "${want}"`);
    });
  }
  const seen = new Set<string>();
  for (const one of ALL) {
    if (seen.has(`${one.glyph}`) && ENEMIES.includes(one)) {
      wrong.push(`${one.name}: glyph ${one.glyph} is already taken`);
    }
    if (ENEMIES.includes(one)) seen.add(one.glyph);
    if (!/^[A-Z]$/.test(one.glyph)) wrong.push(`${one.name}: glyph must be one capital letter`);
    if (one.frames.length !== 2) wrong.push(`${one.name}: ${one.frames.length} frames, want 2`);
    for (let f = 0; f < one.frames.length; f++) {
      const rows = one.frames[f] as readonly string[];
      if (rows.length !== SPRITE_H) wrong.push(`${one.name} f${f}: ${rows.length} rows`);
      for (let y = 0; y < rows.length; y++) {
        const row = rows[y] as string;
        if (row.length !== SPRITE_W) wrong.push(`${one.name} f${f} r${y}: ${row.length} wide`);
        for (const ch of row) {
          if (ch === ".") continue;
          const at = ch.charCodeAt(0) - 49;
          if (at < 0 || at >= one.inks.length) {
            wrong.push(`${one.name} f${f} r${y}: glyph "${ch}" has no ink`);
          }
        }
      }
    }
    if (one.inks.length < 3) wrong.push(`${one.name}: ${one.inks.length} inks, want at least 3`);
    // Nine, because a row is characters and "1".."9" is what there is. Seven
    // was an arbitrary stop on the way up from three; the lizard wanted eight
    // the moment it got a shadow tone as well as a fire.
    if (one.inks.length > 9) wrong.push(`${one.name}: ${one.inks.length} inks, more than a digit`);
    for (const ink of one.inks) {
      if (!/^#[0-9a-f]{6}$/.test(ink)) wrong.push(`${one.name}: "${ink}" is not a colour`);
    }
    // A TRAILING unused ink is waste -- a colour somebody meant to draw with
    // and forgot. A gap in the middle is not: the casts share a role layout,
    // 1 shadow, 2 mid, 3 lit, 4 a second material, 5 white, 6 outline, and a
    // creature with no second material leaves slot 4 empty so that every other
    // slot still means the same thing in every drawing.
    //
    // This check only ever ran over the dungeon three, so when it was widened
    // to the garden and the reef it flagged four creatures at once -- a bunny
    // and a squirrel and two sea things with no second material. None of them
    // was a mistake, which is what told me the check was too strong rather
    // than the drawings too sloppy.
    const used = new Set(one.frames.flatMap((rows) => rows.join("").split("")));
    let last = one.inks.length - 1;
    while (last >= 0 && !used.has(String.fromCharCode(49 + last))) {
      wrong.push(`${one.name}: ink ${last + 1} (${one.inks[last]}) is on the end and never drawn with`);
      last--;
    }
    // The two frames have to be the same creature. A walk beat moves the legs;
    // it does not redraw the animal, and a large change in inked mass reads as
    // the sprite inflating rather than stepping.
    const mass = one.frames.map((rows) => rows.join("").replace(/\./g, "").length);
    // A walk beat moves the legs and nothing else, so the mass barely shifts.
    // A WING beat legitimately moves a lot of it -- that is the animation. So
    // the check is a share of the smaller frame rather than a flat count: a
    // third is a bat flapping, and half is a sprite inflating.
    const drift = Math.abs((mass[0] as number) - (mass[1] as number));
    const share = drift / Math.min(mass[0] as number, mass[1] as number);
    if (share > 0.33) {
      wrong.push(`${one.name}: frames differ by ${(share * 100) | 0}% of the smaller, too much`);
    }
    if ((mass[0] as number) < 40) wrong.push(`${one.name}: only ${mass[0]} pixels, too small`);

    for (let f = 0; f < one.frames.length; f++) {
      const seen = measure(one.frames[f] as readonly string[]);
      // Deliberate single pixels are how an eye gets drawn. A scatter of them
      // is noise, and the first thing a busy background eats.
      // Eight of them is about four eye pixels plus a few deliberate points.
      // Beyond that it is scatter.
      if (seen.orphans > 8) {
        wrong.push(`${one.name} f${f}: ${seen.orphans} orphan pixels, reads as dirt`);
      }
      // The head carries every identity signal at this size, so it gets a
      // third to a half of the drawing. Less and the face has no room.
      if (seen.headShare < 0.3) {
        wrong.push(`${one.name} f${f}: head is ${(seen.headShare * 100) | 0}% of it, too small`);
      }
    }
  }
  return wrong;
}

function enemiesModule(): string {
  const lines = [
    "// GENERATED by tools/enemies.ts -- do not edit. Run `bun run tools/enemies.ts`.",
    "//",
    "// The three things that walk about and hurt you, two frames each.",
    "//",
    "// Rows of digits plus a list of colours, rather than the two-bits-a-pixel",
    "// a CREATURE uses. A creature has to fit in a link and spec S5 fixes it at",
    "// three inks; an enemy travels nowhere, so it can have as many materials as",
    "// it needs -- which is what the era's best work actually had, by way of",
    "// metasprites, and what these were missing.",
    "//",
    "// Cosmetic only: hard rule 4. Which one a level carries travels in the wire",
    "// format, but no engine is ever told, and all three behave exactly as the",
    "// single old guard did.",
    "",
    "export interface Enemy {",
    "  readonly name: string;",
    "  /** What the level text calls it. */",
    "  readonly glyph: string;",
    "  /** Two frames: legs together, legs apart. Digits index `inks`. */",
    "  readonly frames: readonly (readonly string[])[];",
    "  /** Colours, indexed by digit: \"1\" is inks[0]. */",
    "  readonly inks: readonly string[];",
    "}",
    "",
    "export const ENEMIES: readonly Enemy[] = [",
  ];
  const write = (cast: readonly Enemy[]): void => {
    for (const one of cast) {
      lines.push("  {");
      lines.push(`    name: ${JSON.stringify(one.name)},`);
      lines.push(`    glyph: ${JSON.stringify(one.glyph)},`);
      lines.push(`    inks: [${one.inks.map((i) => JSON.stringify(i)).join(", ")}],`);
      lines.push("    frames: [");
      for (const rows of one.frames) {
        lines.push("      [");
        for (const row of rows) lines.push(`        ${JSON.stringify(row)},`);
        lines.push("      ],");
      }
      lines.push("    ],");
      lines.push("  },");
    }
    lines.push("];");
    lines.push("");
  };

  write(ENEMIES);
  lines.push("/** The garden's three. A bear that means it, and two that do not. */");
  lines.push("export const GARDEN_CAST: readonly Enemy[] = [");
  write(GARDEN_CAST);
  lines.push("/** The reef's three. */");
  lines.push("export const REEF_CAST: readonly Enemy[] = [");
  write(REEF_CAST);
  lines.push("");
  lines.push("export const BEACH_CAST: readonly Enemy[] = [");
  write(BEACH_CAST);
  lines.push("");
  lines.push("export const CITY_CAST: readonly Enemy[] = [");
  write(CITY_CAST);

  lines.push("/** Which cast a world uses. Anything not named here uses the dungeon three. */");
  lines.push("export const CASTS: Readonly<Record<string, readonly Enemy[]>> = {");
  lines.push("  garden: GARDEN_CAST,");
  lines.push("  reef: REEF_CAST,");
  lines.push("  beach: BEACH_CAST,");
  lines.push("  city: CITY_CAST,");
  lines.push("};");
  lines.push("");
  lines.push("/** The enemy a level glyph means, or undefined. */");
  lines.push("export function enemyByGlyph(glyph: string, world?: string): Enemy | undefined {");
  lines.push("  // Which world matters, or the LEVEL EDITOR shows a lizard on a button that");
  lines.push("  // paints a shark. Reported exactly that way.");
  lines.push("  const cast = (world !== undefined ? CASTS[world] : undefined) ?? ENEMIES;");
  lines.push("  return cast.find((one) => one.glyph === glyph);");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

if (import.meta.main) {
  const wrong = check();
  if (wrong.length > 0) {
    console.error(wrong.join("\n"));
    process.exit(1);
  }
  await Bun.write("src/core/enemies.ts", enemiesModule());
  console.log(`  src/core/enemies.ts — ${ALL.length} creatures across ${Object.keys(CASTS).length + 1} casts, ${ALL.length * 2} frames`);
}
