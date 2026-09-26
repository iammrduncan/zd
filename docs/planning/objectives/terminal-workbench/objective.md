# Objective: terminal workbench

**Started:** 2026-09-26
**Status:** Being defined

## What we want

> I want you to research and think through a completely different pivot... Move all our code and
> current docs and ADRs etc into a /v0 folder. We now are rethinking this and we want this in rust
> again :P ... We don't need to serve a ui. we don't need to run our own system. I've adopted using
> herdr and others are using all kinds of TUI harnesses and multiplexers. I expect terminal
> multiplexers to continue to grow. So now I want our simplistic artistic viewpoint of reading
> markdown and markdown editing etc to work in native terminal as a TUI. Right now I'm using herdr
> and ghostty terminal. What we care about most is proper file tree and filetree mechanics, proper
> search across files, proper code editing in the terminal with cursor and mouse support. The
> ability to highlight text and leave a comment, or send it to the agent of our choice in herdr or
> another terminal etc... The ability to find/replace in the terminal editor. The ability to read
> beautiful markdown and our reading mode etc... The ability to collapse the file tree and just
> have the open file etc... We should learn from existing TUI editors and systems. If one fits that
> we can simplify and strip stuff away from it we might do that and just modify it or extend it to
> have our markdown reader. I still also want the paste an image and it inlights the link into the
> markdown and saves it to the correct ./zd-images folder... etc... so your goal is:
>
> 1. Do research on TUI and Terminal editors.
> 2. Do research on herdr, ghostty, etc...
> 3. Figure out how we should go about this.
> 4. Implement a v1.0.1 prototype for me to test.
>
> Go forth, do well. I believe in you, and I think you'll do amazing. But make no mistakes you
> wonderful terminal engineer!!!

## Why now

> I've adopted using herdr and others are using all kinds of TUI harnesses and multiplexers. I
> expect terminal multiplexers to continue to grow.

## What good looks like

> A v1.0.1 prototype for me to test.

## What worries me

> Make no mistakes you wonderful terminal engineer!!!

## Constraints

> We want this in Rust again. We don't need to serve a UI. We don't need to run our own system.

## Explicitly not this

> We don't need to serve a UI. We don't need to run our own system.

## Open questions for research

> Learn from existing TUI editors and systems. If one fits, simplify and strip it down or extend it
> with our Markdown reader.
