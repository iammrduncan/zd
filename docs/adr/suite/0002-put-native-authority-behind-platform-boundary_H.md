# 0002: Put native authority behind one platform boundary

## Status

Accepted

## Context

The frontend needs files, launch information, external links, and window-close control. Direct
Tauri calls throughout the product would couple every feature to one desktop shell.

The [portable-frontend decision](0001-use-tauri-with-portable-web-frontend_H.md) requires product
code to run without a native shell. Native operations also cross a security boundary and need one
reviewable owner.

## Decision

We will put frontend access to native features behind `packages/app/src/platform.ts`.

Product modules will use the platform interface. They will not import Tauri APIs. The browser
implementation will provide safe local behavior for development and tests.

The Rust side will own operating-system authority. It will validate paths and URL schemes before
it performs an operation.

The platform interface will expose product needs, not Tauri implementation details. We will add an
operation only when a working feature needs it.

## Consequences

- Product modules can run in a browser without a Tauri mock throughout the codebase.
- Security-sensitive operations have one frontend entry point and one native owner.
- A shell change needs a new adapter instead of a frontend rewrite.
- The platform interface can become shallow if it mirrors every native API. Reviews must reject
  pass-through operations without a product need.
- IPC inputs and outputs need validation and boundary tests.
