/*
 * The focus decisions shared by every document surface.
 *
 * The old rendered reader and the editor once had separate targeting code. The
 * rendered path is gone; the editor still consumes these small, representation-
 * independent decisions so the anchor and its scrolling arithmetic stay in one
 * place.
 */

import { scrollBoxTo, type ScrollMotion } from "./scroll";

/** How much of the document one focus target covers (DESIGN.md §7.6). */
export type FocusGranularity = "line" | "paragraph" | "section";

/** Default granularity, per §4.4. */
export const DEFAULT_GRANULARITY: FocusGranularity = "paragraph";

/*
 * The vertical anchor. §7.6: in Reading Mode the target "follows the vertical
 * anchor"; §5.3 sizes the bottom padding so the first and last blocks can reach
 * it. Neither says where it is.
 *
 * A third of the way down: where the eye rests reading, rather than where a
 * ruler would put it. This was 1/3, moved to 1/2 on a literal reading of §4.1's
 * "the vertical anchor at the centre of the screen", and moved back after using
 * it — "Your center is wrong... Thats what I'm telling you" (2026-07-29). The
 * ratio is the decision and §4.1's sentence follows it, which is now what §4.1
 * says.
 *
 * Two things depend on the number and must not grow their own copy of it:
 *
 *   - The leading and trailing gutters in tokens.css, which are what let the
 *     first and last blocks reach the anchor at all. They were a symmetrical
 *     50vh, which is only correct while the anchor is at the midpoint.
 *   - The editor focus plugin, which puts a block here from its coordinates.
 *
 * Not a setting. §7's list of controls does not include it, so it stays a
 * constant rather than becoming another dial.
 */
const ANCHOR_RATIO = 1 / 3;

/** Viewport y of the document anchor, in client coordinates. */
export function anchorY(surface: Element): number {
  const box = surface.getBoundingClientRect();
  return box.top + box.height * ANCHOR_RATIO;
}

/**
 * The same scroll, for a block that is not one element.
 *
 * The editing surface has no element standing for a block — a paragraph is
 * several `.cm-line` divs and CodeMirror answers in coordinates, not nodes. So
 * the arithmetic lives here once and both callers reach it, rather than the
 * editor growing a second copy that agrees until one of them is edited. That
 * failure has already happened to this exact number: `ANCHOR_RATIO` had five
 * hand-written copies, every one of them self-consistent and none of them the
 * product.
 */
export function scrollBoxToAnchor(
  surface: Element,
  box: { top: number; height: number },
  motion: ScrollMotion = "instant",
): void {
  scrollBoxTo(surface, box, anchorY(surface), motion);
}
