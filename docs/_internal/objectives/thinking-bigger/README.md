# Thinking bigger

Research snapshot: 2026-08-12

Status: research and initial implementation drafts, not an accepted proposal or architecture
decision

This folder investigates the two directions in [`thoughts.md`](thoughts.md). Both start from the
same product goal: keep ZD opinionated and immediately useful, then let people add mini-apps,
widgets, panels, and hotkeys until the workspace can become distinctly their own.

The reports deliberately separate product intent from technology enthusiasm. A dependency is not
an architecture merely because it appears in an inspiring project, and a complete rewrite must
earn the loss of the existing ZD experience.

## Synthesis

| Document | Question answered |
| --- | --- |
| [`synthesis.md`](synthesis.md) | What do the investigations collectively imply, and which experiments should happen first? |
| [`research/decision-framework.md`](research/decision-framework.md) | How should the two directions be compared without pretending the unknowns are facts? |
| [`research/product-shape-and-delivery.md`](research/product-shape-and-delivery.md) | What is the opinionated product, and what is the smallest falsifiable delivery sequence? |

## Direction-specific research and draft specs

| Document | Question answered |
| --- | --- |
| [`research/thought-1-native-gpui.md`](research/thought-1-native-gpui.md) | What would a Rust-native, GPUI-based ZD workbench actually require? |
| [`research/thought-2-webgpu-wasm-celld.md`](research/thought-2-webgpu-wasm-celld.md) | Can a WebGPU/Wasm workspace credibly run both through Tauri locally and celld in the cloud? |

## Shared research

| Document | Question answered |
| --- | --- |
| [`research/source-projects.md`](research/source-projects.md) | What are the named inspirations today, and which assumptions about them are supported? |
| [`research/current-zd-fit.md`](research/current-zd-fit.md) | Which current ZD assets survive each direction, and what is the least-destructive migration path? |
| [`research/extensibility-model.md`](research/extensibility-model.md) | How can customization grow in stages without beginning with a universal plugin SDK? |
| [`research/security-and-trust.md`](research/security-and-trust.md) | What authority would extensions and local/cloud runtimes hold, and how should it be constrained? |

## Research method

- Capability claims use current primary sources: official repositories, documentation, manifests,
  licenses, releases, specifications, and the current ZD worktree.
- Reports label verified facts, architectural inferences, and unresolved questions separately.
- Direction and product proposals include alternatives, bounded slices, tests, security constraints,
  unknowns, and kill gates. Supporting fact sheets provide evidence and adoption checks.
- Significant proposed designs receive at least one credible alternative, following
  [`GOOD_ENGINEERING_H.md`](../../../GOOD_ENGINEERING_H.md)'s “design it twice” rule.
- Runtime behavior that documentation cannot establish becomes a bounded spike with an explicit
  success or kill condition.
- Initial slices favor one end-to-end workflow over a general framework. Extension APIs should
  emerge from working bundled features and a real second consumer.
- Existing ADRs remain authoritative. These records do not supersede them, and any selected broad
  direction should proceed through a human-owned ZSIP and the resulting ADRs.

## Document roles and precedence

[`research/product-shape-and-delivery.md`](research/product-shape-and-delivery.md) owns the product
hypothesis and stage order. [`research/current-zd-fit.md`](research/current-zd-fit.md) owns claims
about the current repository. [`research/security-and-trust.md`](research/security-and-trust.md) may
block any stage. The two direction reports describe conditional, disposable technology spikes; they
do not widen the recommended product scope without an explicit product/design decision.
[`research/source-projects.md`](research/source-projects.md) establishes upstream facts and adoption
checks only. [`synthesis.md`](synthesis.md) reconciles these roles but does not supersede accepted
ADRs or [`DESIGN.md`](../../../../DESIGN.md).

## Snapshot qualification

The referenced projects are moving quickly. Recheck license, activity, API stability, platform
support, and the evidence gaps recorded here before adopting or distributing a dependency.
