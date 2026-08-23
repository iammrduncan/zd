/**
 * The one shortcut registry — DESIGN.md §7.1, vision §7.1.
 *
 * "There is one shortcut registry. The Reference renders it; it is not a
 * hand-maintained list that drifts from reality."
 *
 * Finding F16 is what happens without this: the first prototype's Shortcut
 * Reference listed chords that did nothing, because the list and the bindings
 * were two separate pieces of work that agreed only as long as someone
 * remembered to make them. So there is exactly one place a binding can exist,
 * and a `Command` cannot be constructed without a handler — the type is the
 * guarantee, not a convention.
 *
 * Workbench-owned: a feature registers contextual command targets on mount and
 * removes them on unmount. It never creates a second application key listener.
 */

/**
 * A key combination, written once and rendered per platform.
 *
 * `mod` is the logical modifier — Cmd on macOS, Ctrl elsewhere (DESIGN.md §8) —
 * so a command declares intent and never has to know which platform it is on.
 */
export interface Chord {
  /** `KeyboardEvent.key`: a single character, or a name like `ArrowDown`. */
  readonly key: string;
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface Command {
  /** Stable dotted name, e.g. `document.save`. Not shown to anyone. */
  readonly id: string;
  /** Absent for command-list-only actions until the user assigns a binding. */
  readonly chord?: Chord;
  /** Global bindings are displayed here but dispatched by the native registrar. */
  readonly scope?: "window" | "global";
  /** Prose for the Reference. What it does, not which key does it. */
  readonly description: string;
  /**
   * Whether this can run right now. Absent means always.
   *
   * §7.1: "A binding that cannot run in the current context is presented
   * honestly rather than displayed as working." The Reference reads this to tell
   * the truth, and `dispatch` reads it so the two can never disagree.
   */
  readonly available?: () => boolean;
  /**
   * Do it. Return false to decline — the chord matched but there was nothing to
   * do, and the key should fall through to the platform rather than be
   * swallowed.
   */
  readonly run: () => boolean;
  /**
   * The chord is no longer held. Absent means the command is a press, not a hold.
   *
   * A held command can end a momentary effect or rearm a repeat-safe toggle.
   * Declaring keyup here rather than listening inside a surface keeps the §7.1
   * rule intact: a binding lives in one place, and half a binding somewhere else
   * is F16 starting again.
   *
   * Called once per hold, whichever key of the chord comes up first.
   */
  readonly release?: () => void;
}

/** One contextual implementation behind a root-owned semantic command. */
export interface CommandTarget {
  readonly id: string;
  readonly commandId: string;
  readonly priority?: number;
  readonly available: () => boolean;
  readonly run: () => boolean;
}

/** Registration order, which is the order the Reference lists them in. */
const registered = new Map<string, Command>();
const bindingOverrides = new Map<string, Chord>();
const targets = new Map<string, Map<string, CommandTarget>>();
const observers = new Set<(commandId: string) => void>();

/** Observe successful command executions without creating a second dispatch path. */
export function registerCommandObserver(observer: (commandId: string) => void): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}

/** Attach one feature behavior without creating another binding or displayed row. */
export function registerCommandTarget(target: CommandTarget): () => void {
  let commandTargets = targets.get(target.commandId);
  if (!commandTargets) {
    commandTargets = new Map();
    targets.set(target.commandId, commandTargets);
  }
  commandTargets.set(target.id, target);
  return () => {
    const current = targets.get(target.commandId);
    if (current?.get(target.id) !== target) return;
    current.delete(target.id);
    if (current.size === 0) targets.delete(target.commandId);
  };
}

function availableTargets(commandId: string): CommandTarget[] {
  return [...(targets.get(commandId)?.values() ?? [])]
    .filter((target) => target.available())
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}

/** Whether the root command has a contextual implementation right now. */
export function commandTargetAvailable(commandId: string): boolean {
  return availableTargets(commandId).length > 0;
}

/** Run exactly one contextual implementation; priorities never cascade. */
export function runCommandTarget(commandId: string): boolean {
  return availableTargets(commandId)[0]?.run() ?? false;
}

/** Chords already taken, so a collision is loud rather than arbitrary. */
function chordKey(chord: Chord): string {
  const parts = [chord.mod && "mod", chord.shift && "shift", chord.alt && "alt"];
  return [...parts.filter(Boolean), chord.key.toLowerCase()].join("+");
}

function effectiveChord(command: Command): Chord | undefined {
  return bindingOverrides.get(command.id) ?? command.chord;
}

/**
 * Add a command. Returns the function that removes it again.
 *
 * Throws when a *different* command wants a chord that is already taken, rather
 * than letting the later one win: two handlers on one key means the Reference
 * cannot say what that key does, and which one runs becomes registration order —
 * invisible, and arbitrary.
 *
 * Re-registering the same id replaces it, because that is a window remounting
 * its own commands with fresh closures, not a collision. Throwing on that would
 * make the second mount of any feature a crash.
 */
export function register(command: Command): () => void {
  const desired = effectiveChord(command);
  const taken = desired
    ? [...registered.values()].find((existing) => {
        const existingChord = effectiveChord(existing);
        return (
          existing.id !== command.id &&
          existingChord !== undefined &&
          chordKey(existingChord) === chordKey(desired)
        );
      })
    : undefined;
  if (taken) {
    throw new Error(`${command.id} wants ${chordKey(desired!)}, which ${taken.id} already has`);
  }

  registered.set(command.id, command);
  return () => {
    // Only if it is still the same command. A feature remounting registers a
    // fresh closure, and an old unregister must not remove the new one.
    if (registered.get(command.id) === command) registered.delete(command.id);
  };
}

/** Every registered command, in registration order. What the Reference renders. */
export function commands(): Command[] {
  return [...registered.values()].map((command) => {
    const chord = bindingOverrides.get(command.id);
    return chord ? { ...command, chord } : command;
  });
}

export type CommandBindingResult =
  { readonly updated: true } | { readonly updated: false; readonly problem: string };

/** Rebind one window command without creating a second dispatch path. */
export function setCommandChord(commandId: string, chord: Chord): CommandBindingResult {
  const command = registered.get(commandId);
  if (!command) return { updated: false, problem: "That command is no longer available." };
  if (command.scope === "global") {
    return {
      updated: false,
      problem: "Global shortcuts are managed by the operating system.",
    };
  }
  const conflict = [...registered.values()].find((candidate) => {
    const candidateChord = effectiveChord(candidate);
    return (
      candidate.id !== commandId &&
      candidateChord !== undefined &&
      chordKey(candidateChord) === chordKey(chord)
    );
  });
  if (conflict) {
    return {
      updated: false,
      problem: `${chordLabel(chord)} is already assigned to ${conflict.description}.`,
    };
  }
  bindingOverrides.set(commandId, chord);
  holding.delete(commandId);
  return { updated: true };
}

/** Restore a command's registered default. */
export function resetCommandChord(commandId: string): CommandBindingResult {
  const command = registered.get(commandId);
  if (!command) return { updated: false, problem: "That command is no longer available." };
  if (!command.chord) {
    bindingOverrides.delete(commandId);
    holding.delete(commandId);
    return { updated: true };
  }
  const conflict = [...registered.values()].find((candidate) => {
    const candidateChord = effectiveChord(candidate);
    return (
      candidate.id !== commandId &&
      candidateChord !== undefined &&
      chordKey(candidateChord) === chordKey(command.chord!)
    );
  });
  if (conflict) {
    return {
      updated: false,
      problem: `${chordLabel(command.chord)} is already assigned to ${conflict.description}.`,
    };
  }
  bindingOverrides.delete(commandId);
  holding.delete(commandId);
  return { updated: true };
}

/** Turn a physical key press into this platform's logical, editable chord. */
export function chordFromEvent(event: KeyboardEvent): Chord | null {
  if (MODIFIERS.has(event.key) || event.key === "Escape") return null;
  const platform = currentPlatform();
  const mod = platform === "mac" ? event.metaKey : event.ctrlKey;
  const foreign = platform === "mac" ? event.ctrlKey : event.metaKey;
  if (foreign || (!mod && !event.altKey)) return null;
  let key = event.key;
  if (event.altKey && /^Key[A-Z]$/u.test(event.code)) key = event.code.slice(3).toLowerCase();
  if (event.altKey && /^Digit[0-9]$/u.test(event.code)) key = event.code.slice(5);
  return {
    key,
    ...(mod ? { mod: true } : {}),
    ...(event.shiftKey ? { shift: true } : {}),
    ...(event.altKey ? { alt: true } : {}),
  };
}

/** Run one registry entry through the same availability and observation path as a chord. */
export function executeCommand(command: Command, held = false): boolean {
  const current = registered.get(command.id);
  if (!current || current.run !== command.run) return false;
  if (current.available && !current.available()) return false;
  if (!current.run()) return false;
  for (const observer of observers) {
    try {
      observer(command.id);
    } catch {
      // Observability cannot change whether a command runs.
    }
  }
  if (!held) current.release?.();
  return true;
}

/** Test seam, and used when a window tears down. Production code rarely needs it. */
export function clearCommands(): void {
  registered.clear();
  bindingOverrides.clear();
  holding.clear();
  targets.clear();
  observers.clear();
}

function matches(chord: Chord, event: KeyboardEvent, platform: Platform): boolean {
  /*
   * `mod` is one logical modifier, resolved per platform — Cmd on macOS, Ctrl
   * elsewhere (DESIGN.md §8).
   *
   * This accepted *either* physical modifier until 2026-07-30, on the reasoning
   * that one entry then served both platforms and a Windows build could not
   * silently end up with no shortcuts. The cost was worse than the risk. On macOS,
   * the platform §8 names primary, `ctrl+e` matched the `mod+e` raw-mode chord,
   * `ctrl+s` matched save, and `ctrl+.` opened the Reference — and macOS ships
   * emacs-style `ctrl+a`, `ctrl+e`, `ctrl+k` as system-wide text-editing keys that
   * `defaultKeymap` implements. Because `attachShortcuts` listens in the capture
   * phase on `window`, this registry won before the editor ever saw the key: a Mac
   * user reaching for end-of-line toggled raw mode instead.
   *
   * The other physical modifier must be *absent*, not merely ignored, and that is
   * the half a straight "require metaKey on mac" misses. A chord with no `mod` at
   * all — Escape — would otherwise match with Ctrl held, so `ctrl+Escape` would
   * drop the caret. Stating it as "this platform's modifier is what the chord says,
   * and the other one is up" covers both chords with a modifier and chords without.
   */
  const mac = platform === "mac";
  const logical = mac ? event.metaKey : event.ctrlKey;
  const foreign = mac ? event.ctrlKey : event.metaKey;

  if (Boolean(chord.mod) !== logical) return false;
  if (foreign) return false;
  if (Boolean(chord.shift) !== event.shiftKey) return false;
  if (Boolean(chord.alt) !== event.altKey) return false;

  /*
   * An Alt chord matches the *physical* key; every other chord matches the
   * character.
   *
   * Option is a compose key on macOS, which §8 names as the primary platform. It does
   * not deliver Option+Z as `key: "z"` with a modifier flag — it delivers what
   * composition produced, `key: "Ω"`, and only `code` still says `KeyZ`. So a chord
   * with `alt` can never match on the character, on the one platform that matters
   * most. Finding F03 records this being hit in the version of this app that shipped:
   * `command_option_z_consumes_the_composed_text_event_before_the_editor_sees_it`.
   *
   * Deliberately not `code` for everything. Without Alt the character is the honest
   * thing to match, so `Mod-s` keeps working on a layout that does not put S where a
   * US keyboard does. Only Alt changes the character out from under the chord, so
   * only Alt pays the cost of ignoring the layout.
   */
  if (chord.alt) return event.code === physicalKey(chord.key);

  // Case-insensitively: caps lock and shift both change `event.key` to "S"
  // without changing which chord the user pressed.
  return chord.key.toLowerCase() === event.key.toLowerCase();
}

/**
 * The `KeyboardEvent.code` a chord's key sits on, for a US layout.
 *
 * Only reached for Alt chords, and only ever for the handful of keys a chord uses.
 * A letter or digit maps by name; anything else is already a `code`-style name like
 * `ArrowDown`, which `code` reports identically.
 */
function physicalKey(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key;
}

/**
 * Run the command this event asks for. Returns whether the key was claimed.
 *
 * The single production keyboard path F16 asks for by name: "Every displayed
 * binding must dispatch through the real production keyboard path to its named
 * command." Nothing else in the app may listen for a chord.
 */
export function dispatch(event: KeyboardEvent): boolean {
  if (
    event.target instanceof Element &&
    event.target.closest("[data-shortcut-recorder]") !== null
  ) {
    return false;
  }
  // Read once per press rather than once per registered command, and read here
  // rather than cached at module load: a test stubs the navigator, and a value
  // captured at import would be the platform the module happened to load under.
  const platform = currentPlatform();

  for (const command of registered.values()) {
    if (command.scope === "global") continue;
    const chord = effectiveChord(command);
    if (!chord) continue;
    if (!matches(chord, event, platform)) continue;
    if (!executeCommand(command, true)) return false;
    // Only a command that actually ran is holding. One that declined has nothing
    // to release, and calling `release` on it would close something it never
    // opened.
    if (command.release) holding.set(command.id, { ...command, chord });
    event.preventDefault();
    return true;
  }
  return false;
}

/** Held commands waiting for their keys to come up, by id. */
const holding = new Map<string, Command & { readonly chord: Chord }>();

/** The keys the browser reports as modifiers going up. */
const MODIFIERS = new Set(["Meta", "Control", "Shift", "Alt"]);

/**
 * End any hold this keyup finishes.
 *
 * A chord stops being held as soon as *any* of its keys is released, and which
 * one comes up first is not something a person controls. So a modifier going up
 * ends every hold, and the chord's own key ends its own.
 *
 * Idempotent per hold: both keys of the chord always come up, and the surface
 * must not be closed twice.
 */
export function releaseHeld(event: KeyboardEvent): void {
  const released = event.key.toLowerCase();
  const isModifier = MODIFIERS.has(event.key);

  for (const [id, command] of [...holding]) {
    if (!isModifier && command.chord.key.toLowerCase() !== released) continue;
    holding.delete(id);
    command.release?.();
  }
}

/**
 * Listen for chords on `target`. Returns the detach function.
 *
 * **Capture phase**, and that is the whole of it.
 *
 * In the bubble phase the editor's own handler on `.cm-content` runs first, because it
 * is the event's target and `window` is the last stop. CodeMirror scrolls its selection
 * into view while handling a key it does not recognise, so by the time `dispatch` got
 * the event and called `preventDefault` the document had already moved — to wherever
 * the caret was, which after reading ahead is a long way back. Reported as "cmd+i
 * after it fades it forces you back to the top of the document" (2026-07-31); the fade
 * was a coincidence of timing and the chord was the cause.
 *
 * §4.1 forbids exactly that: "scrolling for context leaves focus where it is — reading
 * ahead is not the same as moving." An application command is not an editing key and
 * must not behave like one.
 *
 * The cost of capture is that this sees every key in the window before anything else
 * does, so `dispatch` claiming only what it has a command for stops being a nicety.
 * It already returns false and calls no `preventDefault` for an unmatched chord, and
 * editor/surface.spec.ts pins that typing still reaches the editor.
 */
export function attachShortcuts(target: EventTarget = window): () => void {
  const onKeyDown = (event: Event) => {
    dispatch(event as KeyboardEvent);
  };
  const onKeyUp = (event: Event) => {
    releaseHeld(event as KeyboardEvent);
  };
  target.addEventListener("keydown", onKeyDown, true);
  target.addEventListener("keyup", onKeyUp, true);
  return () => {
    target.removeEventListener("keydown", onKeyDown, true);
    target.removeEventListener("keyup", onKeyUp, true);
  };
}

export type Platform = "mac" | "other";

/** Which notation this platform writes. */
export function currentPlatform(): Platform {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "mac" : "other";
}

/**
 * Named keys, so the Reference never prints "ArrowDown".
 *
 * §7.1 wants "platform-correct key notation", which on macOS means the glyphs
 * and elsewhere means words.
 */
const KEY_LABELS: Record<string, { mac: string; other: string }> = {
  ArrowDown: { mac: "↓", other: "Down" },
  ArrowUp: { mac: "↑", other: "Up" },
  ArrowLeft: { mac: "←", other: "Left" },
  ArrowRight: { mac: "→", other: "Right" },
  Enter: { mac: "↩", other: "Enter" },
  Escape: { mac: "esc", other: "Esc" },
  Home: { mac: "Home", other: "Home" },
  End: { mac: "End", other: "End" },
  " ": { mac: "Space", other: "Space" },
};

/**
 * How this chord is written for a reader.
 *
 * Modifier order is fixed rather than following the declaration, so the Reference
 * reads as a column instead of as a set of one-off spellings.
 */
export function chordLabel(chord: Chord, platform: Platform = currentPlatform()): string {
  const named = KEY_LABELS[chord.key];
  const key = named
    ? named[platform]
    : chord.key.length === 1
      ? chord.key.toUpperCase()
      : chord.key;

  if (platform === "mac") {
    return `${chord.alt ? "⌥" : ""}${chord.shift ? "⇧" : ""}${chord.mod ? "⌘" : ""}${key}`;
  }

  const parts = [chord.mod ? "Ctrl" : "", chord.alt ? "Alt" : "", chord.shift ? "Shift" : ""];
  return [...parts.filter(Boolean), key].join("+");
}
