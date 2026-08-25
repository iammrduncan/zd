# write

Record an architecture decision a human owner has already made.

`write` creates files. Confirm the owner wants the record written before you write it — see
"Ownership" below. If the decision has not actually been made, you want
[suggest.md](suggest.md) instead.

Read [format.md](format.md) first. It carries the template, statuses, numbering, and the supersede
rule, and this file assumes them.

## Procedure

### 1. Confirm there is one decision, and that it is made

Ask, if it is not already clear:

- What did the owner decide? State it back in one sentence.
- Is this one decision, or several? One record holds one decision. Two decisions are two records.
- Does it change an existing decision? If so, this is a supersede — see step 5.
- Is there a related proposal document? Link it in the Context.

If the owner is describing options rather than an outcome, stop. That is a `suggest` job.

### 2. Place and number it

Follow the project's numbering scheme. Where records are grouped into areas, numbering is usually
**per area** — read that area for its highest number rather than taking the highest in the tree:

```bash
ls docs/adr/<area>/*.md | sed 's|.*/||' | grep -oE '^[0-9]{4}' | sort -n | tail -1
```

Do not reuse a number. Read the repository guidance and surrounding records to learn which scheme
applies.

### 3. Gather the Context before drafting

The Context must carry the facts that make the decision necessary. Collect them from the code and
the existing records, not from assumption:

- What is true now that creates the problem? Name the constraint.
- Which existing ADRs bear on it? Read them. A conflict between two records is often exactly what
  the new record resolves, and saying so is the clearest possible Context.
- What limits apply — platform, performance, dependency maturity, team size?
- What does the related proposal document establish?

An ADR must not use an objective, goal, feedback record, or implementation plan as its authority.
Cite facts and requirements.

### 4. Draft

Use the five-part template from [format.md](format.md). If the project requires a controlled
language, invoke `simplified-technical-english` with `write` and give it the draft.

Watch these, in order of how often they go wrong:

1. **Consequences that list only benefits.** State the costs, the follow-on obligations, and what
   the team is accepting. A record with no cost is advocacy, not a decision.
2. **Justification inside Decision.** Reasons belong in Context. Decision says what we will do.
3. **More than one decision.** If the Decision section has two independent "we will" claims that
   could be accepted separately, it is two records.
4. **A title that names a topic instead of an outcome.** "Rendering" is a topic. "Own BroMetal in a
   BroMetal render driver" is a decision.

### 5. If this supersedes an existing record

Follow [format.md](format.md) exactly:

- Add `Supersedes [NNNN: title](link)` under the new record's Status.
- Change the superseded record's status to `Superseded by`, and link the new record.
- Never edit the superseded record's Context, Decision, or Consequences. Only its status changes.
- Do not delete it. Do not reuse its number.

### 6. Add the index entry

Add the record to `docs/adr/README.md` under its area heading, in number order:

```markdown
- [0022: Short decision title](framework/0022-short-decision-title_H.md)
```

Do this in the same change. A record absent from the index does not exist to a reader.

### 7. Verify and report

Run the checklist in [format.md](format.md). Then tell the owner:

- the path and number of the new record;
- the area, and why that area;
- every ADR it supersedes or conflicts with;
- the STE audit result, with the exact command, **separately** from the format and link checks;
- any term you introduced that needs owner approval;
- which rules you could not check.

Do not report the record as STE compliant on the strength of a linter run.

## Ownership

ADRs are human-owned and carry `_H`. Write one only when a human owner instructs you to.

If the owner asks you to draft first and file later, produce the draft and show it. Do not create
the file, do not take a number, and do not touch the index — a number taken and abandoned is a hole
in a sequence that must never be reused.

For an owner-approved in-place clarification, run `docs/adr/tag-hash.sh` while `HEAD` still contains
the prior text, then edit.
