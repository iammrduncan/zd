# Initial prototype summary

Archive status: consolidated

Prototype disposition: incomplete controlled stop

Audited: 2026-07-28 at `47ec60efc528d425b5ad9159db05ce1985de6599`

The initial prototype was the first full attempt at `zd md`, the first tool in the Zen Suite. It
aimed to turn long agent-written Markdown into a calm, local-first reading and editing experience
with focus and Typewriter modes, restrained typography, workspace navigation, settings, search,
column splits, Git context, and native desktop delivery.

The work established several durable foundations:

- a suite-owned design system influenced by iA Writer and OmmWriter, with text-first interaction,
  shared settings, and no decorative application chrome;
- a substantial Rust desktop implementation backed by canonical BDD, regressions, design tests,
  packaging checks, and an evidence ledger;
- explicit separation between automated behavior evidence and native visual, temporal, and
  platform acceptance.

At the final audit, 404 library tests passed. The BDD corpus contained 735 canonical scenarios and
expanded to 758 executable scenarios; 753 passed. The latest pre-final coverage report measured
90.32% lines, 90.27% functions, and 72.22% branches. These results demonstrated a serious
prototype, but not an accepted release.

The prototype stopped because five BDD assertions still failed, the current macOS application had
not been rebuilt and accepted, remote CI and Windows packaging were unresolved, and release-grade
performance, security, typography, and harsh-critic evidence remained incomplete. All 18 hands-on
findings were still open pending current native proof. They clustered around local versus external
links, shortcut truthfulness, focus behavior, Markdown and code typography, list hierarchy, Quick
Open stability, and the quality of completion evidence itself.

The durable lesson was that a green model or adapter suite cannot prove native behavior. Visual,
keyboard, motion, packaging, and performance claims need red-first coverage at the deepest useful
boundary plus fresh, hash-bound native evidence and human review. The prototype was therefore
stopped honestly rather than relabeled complete.

Current direction lives in the current design contract, the accepted [ADRs](../../adr/README.md),
and the active [wrap-up goals](../wrap-up/README.md). The original goal, raw thoughts, F01–F18
ledger, and detailed remaining-gap audit remain available in repository history.
