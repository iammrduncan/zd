# audit

Report what is wrong with a page. Change nothing.

If the fixes should be applied, that is `write` on a retyped page, or [split.md](split.md). Do not
drift from one into the other because the corrections look obvious.

## Procedure

### 1. Classify it first

Run [classify.md](classify.md). Almost every real defect is a type problem wearing prose clothes,
and a critique that has not established the type will report symptoms.

### 2. Read it as its reader

Read the page as the reader you named — not as someone checking it. The failures below are all
failures of *arrival*: they only show up if you come to the page cold, wanting what it promises.

### 3. Check, in this order

**Does the opening say what this is and why?**
Read the first paragraph alone. If it opens with architecture, guarantees, or identity rules, the
goal is buried. This is the most common defect and the most damaging: readers leave before the page
gets good.

**Is the smallest working example near the top?**
Or is it after four sections of preamble?

**Does the page hold one type?**
Look for the confusion table in [types.md](types.md). Name the specific section that belongs
elsewhere.

**Does it serve one reader?**
Two audiences in one page is not a mixing problem, it is a splitting problem.

**Is it organised around the reader or the implementation?**
Section order following the module structure, or the order the feature was built, is the tell.

**Are the facts right?**
Check names, signatures, defaults, and limits against the source. A page that is out of date is a
worse defect than any of the above, and the only one that will actively break someone's work.

### 4. Report

Four parts, in order:

1. **Type** — what it is, what it should be, and whether they match.
2. **Defects**, ranked, each with the evidence quoted and the specific section named.
3. **Not checked** — what you could not verify. If you did not check the signatures against the
   source, say so; the reader of your audit will otherwise assume you did.
4. **Verdict** — keep, retype, or split, and the single change that would help most.

Rank by what costs the reader most. A buried goal costs every reader; an awkward sentence costs
none.

## Do not

- Do not edit the page.
- Do not list every small thing. An audit of thirty nits and one buried goal reads as thirty-one
  equal problems.
- Do not report style preferences as defects. "I would phrase this differently" is not a finding.
- Do not say "this could be clearer". Name what is unclear and why.
