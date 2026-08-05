#!/usr/bin/env python3
"""Regenerate the deterministic reading-comfort corpus.

The fixtures are intentionally synthetic and sanitized. They preserve common
structures from agent reports and native-harness output without claiming that
private prompts, repository contents, secrets, or machine logs were captured.
"""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Document:
    name: str
    genre: str
    lines: int
    focus: str


DOCUMENTS = (
    Document("01-rollout-plan.md", "implementation plan", 220, "staged rollout"),
    Document("02-review-findings.md", "code review", 227, "actionable findings"),
    Document("03-ci-failure-transcript.md", "CI harness transcript", 234, "failed checks"),
    Document("04-cross-platform-matrix.md", "test matrix", 241, "platform coverage"),
    Document("05-incident-runbook.md", "incident runbook", 248, "service recovery"),
    Document("06-benchmark-report.md", "benchmark report", 255, "render latency"),
    Document("07-migration-notes.md", "migration guide", 262, "schema migration"),
    Document("08-api-inventory.md", "API inventory", 269, "caller contracts"),
    Document("09-threat-model.md", "threat model", 276, "abuse cases"),
    Document("10-dependency-audit.md", "dependency audit", 283, "supply-chain risk"),
    Document("11-agent-handoff.md", "agent handoff", 290, "remaining work"),
    Document("12-pull-request-summary.md", "pull request summary", 297, "change evidence"),
    Document("13-repository-exploration.md", "repository exploration", 304, "code ownership"),
    Document("14-release-checklist.md", "release checklist", 311, "release gates"),
    Document("15-accessibility-audit.md", "accessibility audit", 318, "keyboard and contrast"),
    Document("16-rendered-ui-qa.md", "rendered UI QA", 325, "layout observations"),
    Document("17-database-rollout.md", "database rollout", 332, "backfill safety"),
    Document("18-agent-tool-trace.md", "agent tool trace", 339, "tool decisions"),
    Document("19-fuzzing-report.md", "fuzzing report", 346, "parser resilience"),
    Document("20-incident-postmortem.md", "incident postmortem", 353, "corrective actions"),
)


GENRE_SECTIONS = {
    "implementation plan": (
        "## Proposed sequence",
        "1. Establish the observable baseline.",
        "2. Make one reversible change.",
        "3. Verify the critical path before widening the rollout.",
    ),
    "code review": (
        "## Findings",
        "- P1: preserve the caller's failure context.",
        "- P2: add a regression test at the system boundary.",
        "- P3: simplify the branch before adding another option.",
    ),
    "CI harness transcript": (
        "## Harness excerpt",
        "```text",
        "suite=reading-mode case=warm-theme result=pass elapsed_ms=42",
        "suite=reading-mode case=wide-table result=pass elapsed_ms=51",
        "```",
    ),
    "test matrix": (
        "## Coverage matrix",
        "| Platform | Theme | Width | Result |",
        "|:--|:--|--:|:--|",
        "| macOS | Light | 1440 | pass |",
        "| Windows | Dark | 1920 | pass |",
    ),
    "incident runbook": (
        "## Recovery procedure",
        "> Prefer the reversible mitigation while evidence is incomplete.",
        "- [ ] Confirm impact using the public health check.",
        "- [ ] Apply the bounded mitigation.",
        "- [ ] Record the result and rollback signal.",
    ),
    "benchmark report": (
        "## Measurements",
        "| Percentile | Open | Scroll |",
        "|--:|--:|--:|",
        "| p50 | 31 ms | 7 ms |",
        "| p99 | 78 ms | 13 ms |",
    ),
    "migration guide": (
        "## Compatibility notes",
        "Old readers ignore the additive field.",
        "New readers accept both the previous and current record shapes.",
        "Rollback leaves the original column populated.",
    ),
    "API inventory": (
        "## Caller-facing operations",
        "- `open(path)` returns a readable document.",
        "- `reload()` preserves the visible anchor.",
        "- `close()` is idempotent for an already closed document.",
    ),
    "threat model": (
        "## Trust boundaries",
        "| Input | Abuse case | Mitigation |",
        "|:--|:--|:--|",
        "| Markdown | active HTML | render as inert text |",
        "| Image URL | tracking request | block remote fetch |",
    ),
    "dependency audit": (
        "## Reviewed dependencies",
        "- Parser versions are pinned by the workspace lockfile.",
        "- Image decoding stays behind an explicit local-file boundary.",
        "- No fixture contains credentials or production endpoints.",
    ),
    "agent handoff": (
        "## State at handoff",
        "- Completed: repository map and failing proof.",
        "- In progress: production-path renderer coverage.",
        "- Remaining: native-duration evidence on release hardware.",
    ),
    "pull request summary": (
        "## What changed",
        "- Added a coarse-grained regression test.",
        "- Kept production behavior behind the existing interface.",
        "- Recorded focused formatting, lint, and scenario evidence.",
    ),
    "repository exploration": (
        "## Ownership map",
        "- `design.rs` owns suite appearance policy.",
        "- `app.rs` owns native rendering and input dispatch.",
        "- reading support owns executable acceptance evidence.",
    ),
    "release checklist": (
        "## Gates",
        "- [x] Unit and integration tests passed.",
        "- [x] Canonical and runtime feature files match.",
        "- [ ] Native soak evidence attached to the release candidate.",
    ),
    "accessibility audit": (
        "## Keyboard observations",
        "- Focus order follows the visible reading order: Tab → link → heading.",
        "- Link roles and names survive semantic rendering.",
        "- Reduced-motion policy removes unrequested animation.",
    ),
    "rendered UI QA": (
        "## Visual observations",
        "- The prose column remains centered.",
        "- Headings do not collide with adjacent paragraphs.",
        "- No glyph body crosses the horizontal clip boundary.",
        "![Blocked remote layout sample](https://example.invalid/layout-sample.png)",
    ),
    "database rollout": (
        "## Backfill stages",
        "1. Add the nullable destination column.",
        "2. Backfill bounded batches with resumable checkpoints.",
        "3. Compare reads before changing the source of truth.",
    ),
    "agent tool trace": (
        "## Tool decisions",
        "```text",
        "read repository state",
        "run focused failing test",
        "apply minimal source patch",
        "rerun focused proof",
        "```",
    ),
    "fuzzing report": (
        "## Interesting inputs",
        "- Deeply nested emphasis terminates without recursion failure.",
        "- Incomplete links remain readable inert text.",
        "- Mixed line endings preserve source order.",
    ),
    "incident postmortem": (
        "## Corrective actions",
        "- Add the missing end-to-end alert.",
        "- Make rollback evidence part of the deployment gate.",
        "- Rehearse recovery with the same artifact shipped to users.",
    ),
}

GENRE_VOCABULARY = {
    "implementation plan": (
        "canary cohort",
        "release operator",
        "advance the staged rollout",
        "health-check delta",
        "automatic rollback threshold",
    ),
    "code review": (
        "changed call path",
        "reviewer",
        "resolve the highest-priority finding",
        "regression assertion",
        "lost failure context",
    ),
    "CI harness transcript": (
        "failing shard",
        "harness worker",
        "replay the isolated check",
        "exit status and elapsed time",
        "nondeterministic retry",
    ),
    "test matrix": (
        "coverage cell",
        "test coordinator",
        "close the platform gap",
        "platform-theme-width result",
        "an untested configuration",
    ),
    "incident runbook": (
        "mitigation step",
        "incident commander",
        "restore the degraded service",
        "public health probe",
        "an irreversible recovery action",
    ),
    "benchmark report": (
        "latency sample",
        "benchmark driver",
        "compare the candidate build",
        "p50 and p99 distribution",
        "a warmed-cache-only conclusion",
    ),
    "migration guide": (
        "compatibility stage",
        "migration owner",
        "move readers to the additive schema",
        "old-and-new record comparison",
        "an unrecoverable backfill",
    ),
    "API inventory": (
        "caller contract",
        "API maintainer",
        "clarify the common operation",
        "return value and error behavior",
        "implementation detail leakage",
    ),
    "threat model": (
        "trust boundary",
        "security reviewer",
        "block the abuse path",
        "attacker capability and mitigation",
        "remote content execution",
    ),
    "dependency audit": (
        "third-party package",
        "dependency steward",
        "verify the pinned release",
        "license, checksum, and advisory record",
        "an unreviewed transitive update",
    ),
    "agent handoff": (
        "working checkpoint",
        "receiving agent",
        "resume the bounded task",
        "completed proof and remaining blocker",
        "duplicated or reverted work",
    ),
    "pull request summary": (
        "reviewable change",
        "pull-request author",
        "explain the shipped behavior",
        "focused test and command evidence",
        "an unrelated diff hidden in the patch",
    ),
    "repository exploration": (
        "ownership boundary",
        "repository explorer",
        "trace the production path",
        "file, symbol, and caller map",
        "a guessed module responsibility",
    ),
    "release checklist": (
        "release gate",
        "release captain",
        "promote the signed candidate",
        "artifact hash and native observation",
        "publishing before evidence is complete",
    ),
    "accessibility audit": (
        "keyboard path",
        "accessibility reviewer",
        "remove the interaction barrier",
        "focus order and semantic role",
        "a pointer-only control",
    ),
    "rendered UI QA": (
        "painted frame",
        "visual QA operator",
        "inspect the reading surface",
        "clip, overlap, and measure profile",
        "a hidden horizontal overflow",
    ),
    "database rollout": (
        "backfill batch",
        "database operator",
        "advance the resumable migration",
        "checkpoint count and read comparison",
        "locking the primary write path",
    ),
    "agent tool trace": (
        "tool decision",
        "automation agent",
        "choose the narrowest capability",
        "request, result, and next inference",
        "a mutation without explicit scope",
    ),
    "fuzzing report": (
        "minimized input",
        "fuzzing harness",
        "reproduce the parser edge",
        "seed, crash signature, and reduction",
        "discarding a non-ASCII failure",
    ),
    "incident postmortem": (
        "corrective action",
        "postmortem facilitator",
        "close the systemic gap",
        "owner, due date, and verification signal",
        "blaming an individual instead of the control",
    ),
}


def detailed_observations(document: Document) -> tuple[str, ...]:
    artifact, actor, action, evidence, risk = GENRE_VOCABULARY[document.genre]
    return (
        f"The {actor} examines the {artifact} before they {action}, preserving the {evidence}.",
        f"A missing {evidence} blocks progress because it could conceal {risk}.",
        f"The next {artifact} is intentionally bounded; its result decides whether to {action}.",
        f"Review notes distinguish observed {evidence} from assumptions about the {artifact}.",
        f"The fallback prevents {risk} while the {actor} gathers a fresh {evidence}.",
        (
            f"For {document.focus}, completion means the {artifact} has an owner, a falsifiable "
            f"{evidence}, and a reversible next action."
        ),
        (
            f"The {actor} records why they did not {action} when the latest {evidence} remains "
            "ambiguous."
        ),
    )


def document_lines(document: Document) -> list[str]:
    key = document.name.removesuffix(".md")
    genre_lines = GENRE_SECTIONS[document.genre]
    lines = [
        "---",
        f"fixture_id: {key}",
        f"genre: {document.genre}",
        "provenance: deterministic-sanitized-agent-harness-style",
        "---",
        "",
        f"# {document.genre.title()}: {document.focus.title()}",
        "",
        f"BEGIN_CORPUS_{key}",
        "",
        (
            f"This **DECISION_SENTINEL_{key}** records representative {document.genre} "
            "prose with enough context to evaluate sustained reading."
        ),
        "",
        f"See [LINK_SENTINEL_{key}](https://example.invalid/{key}) for the referenced evidence.",
        "",
        f"## HEADING_SENTINEL_{key}",
        "",
        f"- LIST_SENTINEL_{key}",
        "- Supporting context stays close to the decision it explains.",
        "- The final claim names the observation that would falsify it.",
        "",
        *genre_lines,
        "",
        "## Detailed observations",
        "",
    ]

    observations = detailed_observations(document)
    paragraph = 0
    while len(lines) < document.lines - 1:
        if paragraph % 4 == 0 and len(lines) < document.lines - 2:
            lines.append("")
        lines.append(
            f"Observation {paragraph + 1}. {observations[paragraph % len(observations)]}"
        )
        paragraph += 1
    lines.append(f"END_CORPUS_{key}")
    assert len(lines) == document.lines
    return lines


def main() -> None:
    root = Path(__file__).resolve().parent
    for document in DOCUMENTS:
        output = "\n".join(document_lines(document)) + "\n"
        (root / document.name).write_text(output, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
