/**
 * How the editor surface moves, named by intent rather than mechanism.
 *
 * §2: "Motion is either immediate or eased, never janky."
 *
 * - `instant`: a position, not a journey.
 * - `smooth`: travelling a long distance to the focal point on purpose.
 * - `nudge`: keeping a pinned line in place after one edit.
 * - `follow`: keeping that nudge continuous while a key repeats.
 * - `return`: bringing the caret back from a window edge to the focal point.
 */
export type ScrollMotion = "instant" | "smooth" | "nudge" | "follow" | "return";

/**
 * Checked here because explicit `scrollTo` behaviour and our own animation cannot
 * be reached by a `scroll-behavior` rule in CSS.
 */
function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/* One animation per surface, so two windows never cancel each other's motion. */
const nudging = new WeakMap<Element, number>();

/* Remove the direct-input listeners belonging to an active focal journey. */
const directInputCleanup = new WeakMap<Element, () => void>();

interface FollowingNudge {
  target: number;
  row: number;
  written: number;
}

const activeFollows = new WeakMap<Element, FollowingNudge>();

function stopEase(surface: Element): void {
  const pending = nudging.get(surface);
  if (pending !== undefined) cancelAnimationFrame(pending);
  nudging.delete(surface);
  activeFollows.delete(surface);

  directInputCleanup.get(surface)?.();
  directInputCleanup.delete(surface);
}

/** A wheel, touch, or pointer takes the document back from an app-owned journey. */
function yieldToDirectInput(surface: Element): void {
  const stop = () => stopEase(surface);
  surface.addEventListener("wheel", stop, { passive: true });
  surface.addEventListener("touchstart", stop, { passive: true });
  surface.addEventListener("pointerdown", stop, { passive: true });
  surface.addEventListener("mousedown", stop, { passive: true });

  directInputCleanup.set(surface, () => {
    surface.removeEventListener("wheel", stop);
    surface.removeEventListener("touchstart", stop);
    surface.removeEventListener("pointerdown", stop);
    surface.removeEventListener("mousedown", stop);
  });
}

/**
 * A nudge gives up past one and a half rows rather than lagging behind input.
 * Browser smoothing was tried first: nine lines typed in a row walked the caret
 * 28, 55, 83…245px down the window because its duration outlasted each keystroke.
 */
const NUDGE_ROWS = 1.5;

/** Roughly eight frames per row: a glide, not a fade. */
const NUDGE_MS_PER_ROW = 140;

/** Portion of the remaining repeat distance travelled on each painted frame. */
const FOLLOW_PORTION = 0.35;

/** A repeated key may move quickly, but no painted frame cuts by a whole row. */
const FOLLOW_MAX_ROWS_PER_FRAME = 0.75;

/**
 * A fixed half second keeps a journey to the focal point responsive while leaving
 * enough visible travel to follow. The former 220ms edge return and the browser's
 * roughly 300ms focus jump were both reported as warps.
 */
const FOCAL_JOURNEY_MS = 500;

/** Ease out cubic: leaves immediately, arrives gently. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Ease to `top`, replacing the motion already in flight.
 *
 * Direct input wins immediately, so an edge return never overwrites a trackpad flick
 * and the reader never has to fight the document.
 *
 * A `scrollTop` change without direct input is different. CodeMirror corrects its
 * scroll position when an estimated off-screen height becomes measured. Treating that
 * as a reader taking control canceled a focus jump halfway through: the document went
 * 979 → 1148 → 1026 and stayed there, the reported catch and release. Translate both
 * ends of the journey by the correction instead. The remaining distance is unchanged,
 * and the animation stays in the document coordinate system CodeMirror just refined.
 */
function easeScrollTo(surface: Element, top: number, duration: number): void {
  stopEase(surface);

  let from = surface.scrollTop;
  let target = top;

  if (duration <= 0 || target === from) {
    surface.scrollTop = target;
    return;
  }

  yieldToDirectInput(surface);

  const started = performance.now();
  let written = from;

  const step = (now: number) => {
    const correction = surface.scrollTop - written;
    if (Math.abs(correction) > 1) {
      from += correction;
      target += correction;
    }

    const through = Math.min(1, (now - started) / duration);
    surface.scrollTop = from + (target - from) * easeOut(through);
    written = surface.scrollTop;

    if (through < 1) nudging.set(surface, requestAnimationFrame(step));
    else stopEase(surface);
  };

  nudging.set(surface, requestAnimationFrame(step));
}

/** Ease one small correction, or place it immediately if it is already too far. */
function nudgeTo(surface: Element, top: number, row: number): void {
  const distance = Math.abs(top - surface.scrollTop);

  if (row <= 0 || distance > row * NUDGE_ROWS) {
    stopEase(surface);
    surface.scrollTop = top;
    return;
  }

  easeScrollTo(surface, top, (distance / row) * NUDGE_MS_PER_ROW);
}

/**
 * Follow a destination that moves under key repeat without restarting the ease.
 *
 * Restarting `nudgeTo` on every repeated Enter sheds its velocity, falls two rows
 * behind, then takes the give-up cut above. Measured before this path existed, the
 * surface moved 3px, 3px, then 49px in one painted frame. One animation instead
 * follows the latest target, capped below one row per painted frame, and settles
 * exactly when repeat stops.
 */
function followTo(surface: Element, top: number, row: number): void {
  const active = activeFollows.get(surface);
  if (active) {
    active.target = top;
    active.row = row;
    return;
  }

  stopEase(surface);

  const nudge: FollowingNudge = {
    target: top,
    row,
    written: surface.scrollTop,
  };
  activeFollows.set(surface, nudge);

  const advance = () => {
    if (Math.abs(surface.scrollTop - nudge.written) > 1) {
      nudging.delete(surface);
      activeFollows.delete(surface);
      return;
    }

    const distanceLeft = nudge.target - surface.scrollTop;
    const easedStep = distanceLeft * FOLLOW_PORTION;
    const largestStep = nudge.row * FOLLOW_MAX_ROWS_PER_FRAME;
    const frameStep = Math.sign(easedStep) * Math.min(Math.abs(easedStep), largestStep);
    surface.scrollTop += frameStep;
    nudge.written = surface.scrollTop;

    if (Math.abs(nudge.target - surface.scrollTop) <= 0.5) {
      surface.scrollTop = nudge.target;
      nudge.written = surface.scrollTop;
      nudging.delete(surface);
      activeFollows.delete(surface);
      return;
    }

    nudging.set(surface, requestAnimationFrame(advance));
  };

  nudging.set(surface, requestAnimationFrame(advance));
}

/**
 * Scroll so the centre of `box` lands on viewport line `y`.
 *
 * The default is intentionally instant: opening a document at its anchor is a
 * position, while a focus jump is a journey. Only the caller knows which it means.
 */
export function scrollBoxTo(
  surface: Element,
  box: { top: number; height: number },
  y: number,
  motion: ScrollMotion = "instant",
): void {
  const top = surface.scrollTop + box.top + box.height / 2 - y;
  const reduceMotion = reducedMotion();

  if (!reduceMotion) {
    if (motion === "nudge") return nudgeTo(surface, top, box.height);
    if (motion === "follow") return followTo(surface, top, box.height);
    if (motion === "smooth" || motion === "return") {
      return easeScrollTo(surface, top, FOCAL_JOURNEY_MS);
    }
  }

  surface.scrollTo({ top, behavior: "instant" });
}
