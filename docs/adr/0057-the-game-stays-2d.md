# 0057 — The game stays 2D

**Day 21. Accepted, and the code is gone.**

## What was asked, and what came back

> Here is a stretch objective to think about: what about if we were to extend
> this into 3D with Minecraft style blocks?

then

> Build a test engine for the city, don't break any existing code

then, having looked at it on a phone:

> Isometric is hard to understand, let's stick to 2D

That is the whole point of a spike and it worked exactly as intended. A day
spent, a real answer, and the removal is `git rm` on two files and a revert of
one thirty-line block — which is why it was built that way rather than as a mode
on the flat renderer.

**The spike is deleted.** This file is what is kept, so that nobody proposes it
again in three months without the finding.

## The finding

Isometric projection is hard to read, and the reason is not the art.

A hoppa level is a room you look down into. Every wall is where you see it, the
grid you drew is the grid on the screen, and a six-year-old can point at the bit
they want to change. Rotating that forty-five degrees breaks the correspondence
between *the thing I drew* and *the thing I am looking at* — and this game's
whole loop depends on that correspondence holding for a child who cannot yet
read the words on the buttons.

The rendering worked. The city stood up, the towers lit their windows, the
skyline came from the shape the child drew and cost the wire format nothing. It
was also, on a phone, harder to understand than the flat version it replaced.
Prettier and worse.

## What it also proved, before anybody looked at it

Two things fell out of the spike that were predicted on paper and confirmed in
about ten minutes at the canvas, and both would have applied to any 3D attempt:

1. **Occlusion is a correctness bug here, not a polish one.** A city of
   four-block towers buried the streets and everyone standing in them. This
   game already has the rule written down — *a gem you cannot see is a level you
   cannot finish* — and any projection with height has to answer it before it
   can answer anything else.

2. **The third axis cannot be afforded at all**, and the number says so rather
   than an opinion: a level today is 336 cells in **77 bytes**, and the longest
   whole URL in the game is **156 characters**. That is what makes a level fit
   in a WhatsApp message and a scannable QR code, and it is what makes "no
   backend" possible. A 24x14x8 voxel world is eight times the cells and wants
   more bits each; realistically 1.5–3 KB. That link wraps into a wall of text,
   the QR stops scanning, and you need storage — the one thing this project has
   refused since day one.

So the interesting half of "3D" was never the affordable half, and the
affordable half turns out not to be wanted.

## What stays, which is more than it sounds

The *look* the question was reaching for — chunky, built, lit tops and shaded
sides — is already here and is already flat. The city's skyscrapers pick one of
four kinds from a hash of the cell. The sandcastles have a lit face and a shaded
face and put a turret on every corner. The ponds and the roads join up by
reading their neighbours. All of that is blocks; none of it needed a camera.

The technique the spike was built on — **derive it from the shape the child
drew, and spend nothing on the wire** — is the same one already paying for the
turrets and the road junctions. That idea survives the deletion. The projection
does not.

## Not doing

Isometric or perspective rendering. Voxels. A third axis. If it comes up again,
the answer is this file, and the cost of finding out was one day.
