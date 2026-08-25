# audit

Put the plan or the goals in front of a panel of specialist reviewers, then remediate what they
find.

This is the reflection step. Use it after `create-plan`, after `create-goals`, when execution keeps
hitting surprises, or when the owner asks whether the plan holds up.

## Why a panel

One reviewer with one perspective finds one class of problem. A rendering specialist and a testing
specialist looking at the same plan find different defects, and neither finds the other's. The panel
exists to get coverage that a single pass cannot.

The panel is adversarial by construction. Reviewers are asked to find what is wrong, not to confirm
the plan. A panel that returns "this looks good" was briefed wrong.

## Procedure

### 1. Pick the panel

Two or three reviewers, each a specialist in an area this objective actually touches. Derive the
areas from the plan, not from a standard list. For a rendering objective: a graphics specialist, a
performance specialist, a test-design specialist. For a tooling objective: an API-design specialist,
a security specialist, an operator-experience specialist.

Three is the practical ceiling. Beyond that the findings overlap and the remediation cost outruns
the value.

Include one reviewer whose specialism is **not** the objective's centre of gravity. The rendering
plan reviewed only by rendering people misses that nothing is testable.

### 2. Brief each reviewer

Each gets:

- the artifacts under review — the plan documents, or the goal files, or both;
- `objective.md`, so they can judge whether the plan serves the intent;
- the constraints: the relevant ADRs, the direction documents, `GOOD_ENGINEERING_H.md`;
- **their lens**, stated: "review as a test-design specialist. Assume the plan is wrong and find
  where";
- the return format: findings, each with severity, evidence, and a concrete remediation.

Brief them to distinguish **defect** (this is wrong) from **risk** (this may go wrong) from
**preference** (I would do it differently). Preferences are not findings — say so in the brief, or
you will get a pile of them.

Run the panel concurrently. Reviewers must not see each other's findings; independence is what makes
agreement meaningful.

### 3. Triage the findings

Merge the returns. For each finding:

| Verdict | Meaning | Action |
| --- | --- | --- |
| Confirmed | Verified against the artifact or the code | Remediate |
| Plausible | Cannot verify from here | Investigate, then confirm or drop |
| Rejected | Checked, and the reviewer is wrong | Record why. Do not silently drop it |
| Preference | Defensible either way | Record. Do not remediate without the owner |

Verify before remediating. A reviewer agent asserting something about the code is a claim, not a
fact, and remediating an imagined defect makes the plan worse.

Where two reviewers agree independently, weight it higher. Where they conflict, say so and decide
with evidence.

### 4. Remediate

The main agent remediates — not the reviewers. Fix the confirmed findings in the plan documents or
the goal files.

- Amending an **open goal**: edit it in place. Note what changed and why at the bottom.
- Amending a **plan document**: add a later numbered document that supersedes it, with a later
  numbered document that says what it supersedes. Do not rewrite history.
- A finding that invalidates a **completed goal**: do not edit the completed goal. Record it in the
  audit report and, if it needs work, cut a new goal.

### 5. Write the audit report

A numbered plan document, `NN-AUDIT-<topic>.md`:

- the panel: who reviewed, with what lens;
- the findings, grouped by verdict, each with its evidence;
- what was remediated, and where;
- what was rejected, and why;
- what needs the owner;
- what the panel could not assess.

### 6. Report

Tell the owner: the most serious confirmed finding, what changed as a result, what needs their
decision, and what the panel could not judge.

Say plainly if the panel found nothing serious. That is a real result — but check the briefs first,
because it is more often a sign the panel was briefed to agree.

## What this command must not do

- Do not let reviewers edit the artifacts. They review; the main agent remediates. A reviewer that
  edits is no longer independent of the thing it is reviewing.
- Do not remediate a preference without the owner.
- Do not treat a reviewer's claim about the code as verified. Check it.
- Do not rewrite a completed goal or its summary.
