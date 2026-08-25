# write

Draft a page of one declared type.

**Do not start without a type.** If it has not been decided, run [classify.md](classify.md) first. A
draft that has not decided what it is becomes all four types at once, which is the defect this skill
exists to prevent.

## Before drafting

Answer three questions and write the answers down:

1. **Who is reading this page?**
2. **What are they trying to understand or finish?**
3. **What is the shortest path to a useful result?**

Then draft from that point of view. Do not organise the page around the order the code was built,
the modules that implement it, or the guarantees that mattered while it was being written.

## The opening

The first paragraph says **what the thing is and why someone would use it**, in terms the reader
already has. The smallest working example goes near the top.

Move storage, validation, protocol, ownership, and boundary rules to the section where the reader
needs them — which is after they understand the thing, not before.

Do not open a page about a point light with stable identity, component records, and render bindings.
Open with the visible idea:

> A point light shines from one position in every direction, like a lamp or torch. Use it to light a
> small area around an object or place in your world.

The identity and render rules still matter. They belong after the reader can create one.

## Shape, by type

**Tutorial** — one path, no branches. Every step concrete. A visible result early and at the end. It
must work start to finish; test it. No justification: link to an Explanation instead.

**How-to** — titled as the task in the reader's words. Straight into the first action. Assume
competence. Cover the task, not its variations. State the finish condition so they know they are
done.

**Reference** — the same structure on every page of the set, so it can be learned once. Tables over
prose. Signatures, defaults, limits, errors. No narrative, no advice.

**Explanation** — start from the question or surprise that brings the reader. Give the alternatives
and say why this one. **Name the cost.** End where the understanding is complete, not with steps.

## Before delivering

- Read the first paragraph alone. Does it say what this is and why to use it?
- Find the smallest working example. Is it near the top?
- Look for sections belonging to another type. Move or link them.
- Check every claim you made about behaviour against the source. Documentation that is confidently
  wrong is worse than missing.

## Report

- the type and the reader it serves;
- what you verified against the source, and what you asserted from the request;
- anything you could not confirm — say so rather than writing it smoothly;
- what other pages this should link to, and what is now missing.
