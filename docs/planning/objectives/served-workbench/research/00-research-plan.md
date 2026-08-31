# Served workbench research plan

Date: 2026-08-31

## Questions

1. Which frontend/native boundaries currently read files, manage project grants, run terminals, and
   publish events, and where does browser development implement those capabilities differently?
2. What is the smallest transport-neutral backend boundary that can preserve the existing typed
   platform API and workbench state ownership while serving static frontend assets, commands, and
   asynchronous terminal/filesystem events?
3. Which bind, authentication, origin, session, and path-authority defaults make `zd serve .` safe
   enough for its first release, including access from another computer?
4. How can the packaged Tauri application start, discover, supervise, and stop the exact same
   server without retaining a second Tauri IPC implementation?
5. Which integration and diagnostic evidence can distinguish frontend delay, network delay, and
   backend work while proving browser and Tauri parity?

## Why each matters

1. Identifies duplicate paths to remove and existing deep modules to preserve.
2. Determines the protocol shape and prevents the server from becoming a shallow mirror of Tauri.
3. Determines whether the first goal may listen beyond loopback and what a remote user must do.
4. Determines whether “Tauri is a literal wrapper” is operationally complete across launch, crash,
   reload, and shutdown.
5. Produces falsifiable completion criteria for the goal and addresses the owner's ambiguity about
   where slowness occurs.

## Lines of inquiry

1. **Current repository architecture.** Read `packages/app`, `packages/tauri`, build configuration,
   and tests. Return a map of file, terminal, event, and startup paths; identify proven duplication
   and reusable boundaries. Use repository files as primary evidence.
2. **Protocol and remote security.** Evaluate a minimal HTTP/WebSocket design against browser
   security properties and the repository's grant model. Compare loopback plus SSH forwarding,
   direct network listening, and a managed overlay/reverse proxy. Use primary specifications and
   official framework documentation. Return safe v1 defaults, rejected alternatives, and gaps.
3. **Tauri wrapper and verification.** Trace packaging and runtime lifecycle constraints for a Tauri
   shell that launches the same `zd serve` executable. Return a concrete startup/readiness/shutdown
   sequence, failure behavior, observability fields, and integration-test boundaries. Use current
   code and official Tauri or Rust documentation as primary evidence.

Every return must separate established facts, claims, inferences, and gaps. An unverifiable claim
must be labelled rather than omitted or asserted.

## Out of scope

- Implementing the server, protocol, frontend adapter, or Tauri launcher.
- Designing multi-user collaboration, accounts, cloud hosting, or a public internet service.
- Selecting a long-term binary terminal encoding before measurements require one.
- Replacing the workbench state owner, command registry, editor, or terminal emulator.
- Promising released behavior in user-facing documentation.

## Known constraints

- Human direction requires one `zd serve` backend for browser and Tauri clients.
- [`VISION.md`](../../../../VISION.md) makes network and process authority explicit capabilities
  and assigns files, Git, and pseudoterminals to the `zd` host.
- [ADR 0002](../../../../adr/suite/0002-put-native-authority-behind-platform-boundary_H.md)
  requires one narrow product-oriented platform boundary.
- [ADR 0005](../../../../adr/suite/0005-own-one-versioned-workbench-state_H.md) requires one
  versioned workbench state owner.
- [ADR 0006](../../../../adr/suite/0006-scope-file-access-to-approved-project-grants_H.md)
  forbids arbitrary frontend paths and limits authority to approved project grants.
- [ADR 0007](../../../../adr/suite/0007-dispatch-commands-from-one-workbench-registry_H.md)
  requires all invocation sources to dispatch the same command IDs.
- [`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md) favors a small working slice,
  narrow deep modules, explicit security defaults, request IDs, and measured optimization.
