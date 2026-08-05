# Open-source readiness audit

Audited: 2026-08-05

Target: `v0.1.0`

This audit establishes the public boundary of the repository before history rewriting, release
engineering, documentation-site work, and promotion. It records why retained internal-looking
files exist so later cleanups do not have to rediscover their purpose.

## Decision

Two cleanup approaches were considered:

1. Keep every tracked planning and development artifact, adding only a license and ignore rules.
   This minimizes the immediate diff but publishes empty scaffolds and retains an optional local
   inference dependency with known high-severity advisories.
2. Preserve substantive product history and documented workflows, while removing zero-information
   scaffolds and tooling that expands the default install and security boundary.

The second approach was chosen. It removes files that contain no information and one optional
display feature, without erasing product decisions or prematurely reorganizing documentation that
will be handled by the dedicated documentation-site phase.

## Removed now

- Eighteen empty goal markdown files, six empty goal-directory placeholders, the empty
  `docs/report.txt` stub, and the stale `docs/goals/status.md` index. The neighboring
  `initial_thoughts.md` files remain as the actual roadmap record; `docs/vision.md` and
  `docs/todo.txt` are the current status sources.
- The local Gemma event summarizer used only by `zdloop`. Deterministic event labels already cover
  the same dashboard need with no model download or native image-processing dependency.
- `@huggingface/transformers` from the default dependency tree. On the audit date, `npm audit
  --omit=dev --package-lock-only` reported two high-severity `sharp`/libvips advisories inherited
  through that package and no available fix.

## Retained deliberately

- `docs/goals/initial-prototype/`, `docs/path-forward.md`, and `docs/vision.md`: current design and
  task documents cite the first prototype's evidence and the stack decision.
- Other non-empty `docs/goals/*/initial_thoughts.md` files: these are the suite roadmap described in
  the README, not release documentation for `zd md`.
- `.claude/commands/`, `.agents/skills/`, `.codex/config.toml`, and `docs/way-of-working/`: the README
  documents these as the repository's contributor automation. The tracked Codex configuration
  contains model defaults only, not credentials.
- The generated agent-document fixture corpus: it exercises the product's defining long-document
  path and is test input, not build output.
- Bundled iA Writer fonts: their OFL license and source record live beside the font files.

Generated app output, Tauri schemas and targets, Playwright results, coverage, local session logs,
review output, `.env` files, and OS metadata are already ignored and are not tracked.

## Security and privacy findings

- No tracked private keys, common provider-token formats, or credential assignments were found by
  the working-tree scan.
- Git history contains 73 commits whose author address is a personal email and 13 commits authored
  by an automation identity. The history-rewrite phase must normalize attribution before the
  repository becomes public.
- The repository is currently private on GitHub. Its description is `Markdown Zen Mode`, and
  GitHub does not detect a license yet. Update visibility and public metadata only after the clean
  history and release artifacts are ready.
- The complete npm audit also found a high-severity development-only `brace-expansion` advisory
  with an available lockfile fix. The cleanup updates the lockfile and both production and complete
  audits now report zero vulnerabilities.
- The current development machine runs Node 22.15.0, while `jsdom@30` requires Node 22.22.2 or a
  supported newer release and `undici@8` requires Node 22.19.0. Commands still run, but the install
  and versioning phase must declare and document the actual minimum Node version.

## Required later phases

- Back up the current repository, then replace the 425-commit development history with meaningful
  reviewable chunks while preserving the `rust-prototype` tag separately.
- Align the three current `0.5.0` declarations to `0.1.0` through one versioning source and release
  workflow.
- Restore CI as part of tagged packaging and publication rather than reviving the intentionally
  disabled prototype workflow.
- Replace manual macOS installation guidance with tested install paths and downloadable release
  artifacts.
- Restructure user and contributor documentation with Diátaxis, then shorten the README around the
  product, install path, screenshot, and documentation links.
- Replace placeholder icons and prepare the release announcement before changing GitHub visibility.
