## v0 archive instructions

This directory contains the inactive browser/Tauri product. Run its npm and Cargo commands from
`v0/`. Preserve its architecture and public behavior unless a repair is required to keep the
archive runnable.

- Add or update tests with any code change.
- Add a failing regression test before fixing a reported error.
- Read `docs/GOOD_ENGINEERING_H.md` and `docs/DESIGN.md` before making design decisions.
- Keep changes scoped to the archive; v1 authority lives at the repository root.
