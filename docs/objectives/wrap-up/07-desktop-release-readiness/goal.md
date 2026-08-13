# Goal 07: Prove desktop release readiness

## Outcome

The completed daily-driver app has measured performance limits, supports independent document
windows, and ships a Windows build that passes a short native checklist.

## Source todos

- **WU-038:** Profile multi-megabyte agent logs and virtualize only if needed.
- **WU-039:** Measure and hold cold launch near 300 ms.
- **WU-040:** Confirm idle CPU stays near zero.
- **WU-041:** Support isolated state across multiple document windows.
- **WU-042:** Verify the Windows build with a short native checklist.

## Acceptance criteria

1. A representative multi-megabyte agent log has a recorded load, scroll, edit, search, and memory
   profile. Virtualization or another optimization is added only when the profile identifies a
   user-visible bottleneck, and the before/after evidence is retained.
2. Release-like cold launch is measured from process start to first meaningful document or Home
   frame and remains near the 300 ms target on the named reference machine.
3. With a document open and no user work pending, CPU settles near zero. Timers, observers, file
   watchers, and animations do not create continuous background work.
4. Multiple windows can open different documents or workspaces. Each window owns its document,
   dirty state, navigation, preferences view, and close confirmation without cross-window leakage.
5. The Windows x64 package builds through the release path and passes a native checklist covering
   install, launch, file/folder open, edit/save, shortcuts, external-link behavior, multiple
   windows, close confirmation, and uninstall.
6. Performance and native results name the hardware, operating system, build type, fixture, and
   commands used so later releases can repeat them.

## Terminal condition

All five source todos are closed, the three performance measurements meet their stated thresholds
or have an approved follow-up decision, two native windows pass isolation checks, and the packaged
Windows build passes the recorded checklist.

## Dependencies

- Measure the stable daily-driver build after goals 03 through 06; optimizing an incomplete path
  does not satisfy this goal.
- Use the existing versioned release workflow and package contract rather than creating a parallel
  release path.

## Exclusions

- Optimization without profiling evidence.
- macOS notarization, Windows code signing, auto-update, or distribution-channel work beyond the
  accepted release ADR.
- Session restore for an unlimited number of windows or cross-device window synchronization.
