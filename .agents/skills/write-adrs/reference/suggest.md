# suggest

Propose an ADR that does not exist yet: a draft record, why it should exist, and what adding it
would change.

`suggest` writes nothing into `docs/adr/`. It produces a proposal for a human owner to accept,
reject, or rework. If the owner has already decided and wants it recorded, that is
[write.md](write.md).

Read [format.md](format.md) first.

## Why this command is separate

The ADR tree holds decisions that are made. There is no `Proposed` status, and proposal and review
belong in a proposal document or a pull request. An agent that files a plausible-looking Accepted record has
manufactured authority the team never granted — and because ADRs are what the team holds AI
accountable to, a fabricated one corrupts the thing that makes the rest trustworthy.

So `suggest` produces a proposal artifact. It takes no number, creates no file in the ADR tree, and
never writes `Accepted`.

## Procedure

### 1. Establish that a decision is actually missing

A suggestion is worth making when the architecture already depends on something no record states.
Signals, strongest first:

- **Two existing records conflict**, and code has silently picked one. That conflict is the
  decision. Quote both records.
- **A constraint is enforced in code or tests but written nowhere.** An import ban, a boundary, a
  required call order.
- **The same choice keeps getting re-litigated** in code review or in comments.
- **A new capability forces a choice** that will be expensive to reverse once code depends on it.

Weak signals, which are usually not ADRs: a style preference, a library version bump, anything
already covered by an existing record, and anything that is really an implementation plan.

Before proposing, read the existing records in the area. A suggestion that duplicates ADR 0012 wastes
the owner's attention and damages trust in the rest of your suggestions.

### 2. Gather evidence

Cite facts, not intuition. For each claim in the draft's Context, know where it comes from:

- the file and line that enforces or violates the unwritten rule;
- the existing ADRs that bear on it, by number and title;
- the constraint that makes the decision necessary.

An ADR must not rest on an objective, goal, feedback record, or plan. If the only reason for the
decision is that a plan assumes it, say so plainly — that is a reason to fix the plan, not to file a
record.

### 3. Produce the proposal

Deliver these four parts, in this order.

**1. The draft record.** The full five-part format from [format.md](format.md), so the owner can see
the actual artifact. Two differences from a filed record:

- The status line reads `Draft — not an ADR. Proposed by <agent>, needs owner decision.` Never
  `Accepted`.
- The title has no number: `# Draft: Short decision title`. Taking a number reserves it, and a
  number reserved for a suggestion that gets rejected is a permanent hole.

State the intended area and what the number would be, as information — do not apply it.

**2. Why this should exist.** Answer these directly:

| Question | What a good answer looks like |
| --- | --- |
| What is undocumented? | The specific rule the architecture already relies on |
| What breaks without it? | A concrete way a future change goes wrong |
| Why now? | The trigger — a conflict, a new capability, a recurring argument |
| Why an ADR and not a comment, a plan, or a proposal? | An ADR records a decision that constrains future work |

If you cannot answer "what breaks without it" concretely, do not propose the record.

**3. Impact of adding it.** What changes the moment this becomes Accepted:

- **Existing records** — which it supersedes, contradicts, or narrows, each by number. A suggestion
  that supersedes a record is a much bigger ask; say so.
- **Existing code** — what is already non-conforming, and roughly how much. Name files.
- **Future work** — what becomes forbidden, what becomes required, what needs a new exception path.
- **Reversal cost** — how expensive this is to undo once code depends on it. High reversal cost is
  an argument for a proposal document first, not against the decision.
- **What it does not cover** — the adjacent questions this record deliberately leaves open, so the
  owner is not surprised later.

**4. Open questions.** What you could not resolve and the owner must. Be specific. "Which area owns
this" and "does this supersede 0006 or sit beside it" are useful. "Is this a good idea" is not.

### 4. Report honestly

State plainly:

- that this is a proposal and **no file was created in `docs/adr/`**;
- your confidence that a decision is genuinely missing, and what would raise it;
- the evidence you used, and the claims you could not verify;
- the STE status of the draft — run the audit through `simplified-technical-english`, since the
  owner may file this text nearly as written.

If the investigation shows the decision is already recorded, say so and stop. A suggestion withdrawn
on evidence is a good outcome.

## Where the draft goes

Present the proposal in your reply by default.

If the owner wants it on disk, write it outside the ADR tree — a scratch path, the pull request
body, or a proposal draft, as the owner directs. Never inside the ADR tree, because a file in
that location with that name pattern reads as a filed decision no matter what its status line says.
