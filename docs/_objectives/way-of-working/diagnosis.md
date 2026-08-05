# Finding out what is true

Four rules for the part of a session that is not building anything — the part where you are trying
to work out what is actually happening.

They are here because each of them cost a real session in the repo this came from, and because
none of them is obvious. The failure mode they share is confident wrongness: a measurement that
answers a question you did not ask, stated as though it answered the one you did.

## Measure the round trip, not the thing you can see

When a position and a coordinate might disagree, measure **position → coordinates → position** and
compare the ends. Anything that survives the trip is right. Anything that does not is the defect,
and it names itself.

The alternative is to probe by matching text or by counting DOM children, and the trouble is that
both of those can be wrong in ways that look like data. Three probes built that way got a caret
bug confidently wrong — one of them produced a filed task with a root cause that was not the cause.
The round trip found it in one pass, because it needs no text to match and no list to index: it
asks the engine where something is, then asks the engine what is there, and the two answers either
agree or they do not.

Reach for it first whenever the question is "is this where I think it is".

## A test in the real engine is not automatically the honest one

A browser test feels like the truth because a browser is where the thing runs. But the harness
driving it is not the platform, and where the two differ is exactly where you stop learning
anything.

Playwright synthesises `Alt+z` as `key: "z"` from a US layout. macOS delivers it as `key: "Ω"`,
because Option is a compose key. So a full end-to-end suite went green while **every** Alt chord in
the product was dead on the platform it shipped for. The honest test hands the matcher the event
the platform actually delivers, and that is a unit test — the one place you control the input
completely.

Ask what the harness is *supplying* as well as what it is checking. Anything the harness invents on
your behalf — a keystroke, a layout, a clock, a locale — is a thing your test is no longer testing.

## A filed suspect is written as the question it answers, not as the answer

You will often finish a session knowing the symptom and suspecting a cause. Write the suspicion
down as a suspicion. Once a line has a date on it, it reads as a finding forever after, and the
next person to touch it spends their time disbelieving you rather than measuring.

Two examples from one week, both mine. A task line carried "the fade drops the scroll position" as
though it were established; it was wrong in every part — not the removal, not the strip, not the
fade — and four control measurements located the real cause in about a minute each. Another said a
suite failure was the dev server reloading a stylesheet; six attempts failed to reproduce it, and
one measurement showed the server it blamed does not even exist between runs.

If it does not reproduce, say so and leave the cause open. Record what you tried and what you could
not make happen — that is worth more than a plausible story, because it is what stops the next
person repeating it.

## A bisect narrows to a file, and reading finds the line

Bisecting is good at answering "where", and bad at answering "why". Once it has pointed at a file,
stop bisecting and read.

A fence-typing bug survived a bisect that had already cleared the wrong suspect. The faulty line
was found by reading — and the comment directly above it described the failure it was causing, in
words, written by whoever put the bug there. Two more diagnoses that week went faster once the
probing stopped and the reading started.

The corollary: read the failure itself before forming a hypothesis. A wrapper's own docstring once
described the layering it depended on, and that layering *was* the bug — one paragraph would have
beaten the two experiments that came first.
