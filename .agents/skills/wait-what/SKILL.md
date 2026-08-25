---
name: wait-what
description: "Stop — that did not land. Re-pitch it. Invoke on a message you did not follow, on a file that reads badly, or with `init` to draft a CONTEXT.md. Human-invoked only."
disable-model-invocation: true
---

<!--
MIT License

Copyright (c) 2026 Shannon Duncan, shannon@iammrduncan.com. Aliases: shadowcodex, iamMrDuncan

========================================================================
Upstream Components Copyright Notices
========================================================================
Copyright (c) 2026 Matt Pocock

========================================================================
License Text
========================================================================
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
-->

# Wait, what?

Something did not land. Re-pitch it.

Adapted from [`mattpocock/skills`](https://github.com/mattpocock/skills) (MIT), which is where this
idea and its shape come from.

## Which path

| Invoked as | Means | Go to |
| --- | --- | --- |
| `wait-what` | "What you just said makes no sense" | below, now |
| `wait-what <path>` | "What you wrote in this file makes no sense" | [reference/artifact.md](reference/artifact.md) |
| `wait-what init` | "We have no shared vocabulary" | [reference/init.md](reference/init.md) |

A bare invocation is an interrupt. Answer it here, immediately. Do not read a reference file first.

## Re-pitch

**Do not summarise what you said. Do not apologise. Do not start the work again.**

Re-pitch the same claim:

- **Restore the context.** What were you looking at, and what were you trying to establish? One
  sentence of each. The message probably failed because it arrived without them.
- **Write it in ASD-STE100 Simplified Technical English.** Short active sentences, one topic each,
  approved vocabulary. Load `simplified-technical-english` if you need the rules, and run
  its linter over the re-pitch if it is more than a couple of sentences.
- **Use the terms this repository already uses.** Read `CONTEXT.md` if there is one, otherwise the
  nearest `AGENTS.md`, and the ADRs for anything architectural. Do not reach for a synonym because
  it reads better — a new word for a known thing is how this failed in the first place.
- **Cut the scaffolding.** Named intermediate steps, hedges, and restated premises are usually what
  buried the claim. Say the thing.

## If it was wrong, say so

Sometimes the message did not land because it was **incorrect**, not because it was unclear.

If that is what happened, say so plainly and correct it. Do not re-pitch it. A fluent restatement of
a wrong claim is worse than the first attempt, because it spends the reader's trust on making the
error easier to believe.
