# Summary — goal 03: Connect source review, Herdr handoff, and image paste

**Completed:** 2026-09-26
**Commits:** `d37f549`, `5e3f11d`, `a8a43a7`, `5e3407e`, `eda2fa2`, `936557e`
**Goal file:** [`execute-goal-03.md`](execute-goal-03.md)

## Action needed from the owner

Nothing before final acceptance. Automated handoff used only a fake executable. No prompt was sent
to the owner's active Herdr agent. The local graphical clipboard remains an owner-side Ghostty check.

## What was delivered

1. A bounded, versioned `.zd/review-v1.json` store records project-relative path, source hash, byte
   range, exact text, bounded context, comment, and stable ID. Atomic writes refuse symlinked control
   paths and preserve concurrent temporary files.
2. Re-anchoring tries same-revision/range, current exact range, unique context, and unique exact text
   in order. Missing or ambiguous text becomes visibly detached. Comments can be created from Edit
   or source-mapped Read selection and reopened from the Reviews sidebar.
3. The Herdr adapter parses bounded structured discovery output, presents an explicit target list,
   builds a bounded/control-safe selection prompt, and requires a separate preview confirmation
   before direct-argv submission. Missing Herdr retains the prepared prompt for manual delivery.
4. The image boundary reads decoded RGBA through an injectable clipboard capability, validates
   checked dimensions and byte counts, normalizes to PNG, enforces encoded bounds, and uses a full
   BLAKE3 content hash for stable filenames.
5. Image installation creates a literal document-local `zd-images` directory, rejects symlinks,
   project escape, non-directories, and mismatched collisions, reuses identical content, and inserts
   a relative Markdown link as one undoable edit only after the file is durable.
6. Commands and overlays now expose add/list review, target/preview handoff, and explicit paste image.
   Bracketed paste feeds prompts and is ignored during handoff confirmation instead of editing behind
   an overlay.

## What I got wrong

The first image cleanup guard marked ownership only after `write_all` completed. A partial write error
could therefore leave a truncated PNG. A failing private guard regression now proves every newly
created uncommitted image is removed, including before a complete write.

The first review context calculation rounded UTF-8 boundaries outward. A multibyte character at the
128-byte edge could produce a 129-byte context that saved but failed validation on reopen. A failing
CJK regression changed both context windows to round inward.

Terminal paste initially bypassed prompt/handoff state and could mutate the document behind an
overlay. A failing application regression now routes paste to the active prompt, caps it, and refuses
document mutation during handoff confirmation.

## Traps worth knowing

- Arboard returns already-decoded pixels, so the retained data is bounded after acquisition; peak
  allocation inside the platform clipboard implementation cannot be guaranteed.
- A hash collision is never overwritten. Existing bytes must exactly equal the newly encoded PNG
  before reuse is reported.
- Undo removes or restores the Markdown link, not the installed content-addressed image file.
- Herdr prompt text is an argv value because Herdr 0.9.1 exposes that contract. The 32 KiB bound
  stays below common per-argument limits, and no shell parses source text.
- Detached comments remain present and visible; `zd` does not silently follow file renames or choose
  among ambiguous matches.

## Evidence

| Check | Result |
|---|---|
| Review | reopen, all four attach strategies, ambiguity/deletion detach, malformed/oversize/escape/symlink refusal passed |
| Review writes | failed-write temp cleanup, occupied-temp preservation, and multibyte context bounds passed |
| Review UI | Edit and Read comments share source selection; detached state renders in the sidebar |
| Handoff | fake discovery/submit proved target argv, preview separation, metacharacters/newlines, ESC/NUL safety, bounds, and non-zero failure |
| Handoff fallback | missing executable retained a visible manual prepared prompt without submission |
| Image | valid PNG, decoded/encoded bounds, hash reuse, collision, symlink, write, escape, unavailable, and insertion-failure cases passed |
| Image transaction | link insertion and removal round-tripped through one undo/redo group; failed insertion removed the new image |
| Quality gate | all 47 root tests, format, strict Clippy, locked release build, link check, and `git diff --check` passed |
| External safety | no live Herdr prompt, tag, publication, network listener, or agent-session mutation occurred |

## What this unblocks

- Goal 04 can verify the complete release binary, document the exact workflow, and record the live
  read-only Herdr/headless environment evidence.

## What remains blocked

- Ghostty mouse, enhanced-key, resize, and local graphical clipboard behavior require the owner's
  macOS session and cannot be claimed from this Linux environment.
