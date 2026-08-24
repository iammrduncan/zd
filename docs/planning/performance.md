# v0.2.0 performance and memory review

Measured on 2026-08-24 from commit `1a650df` before the version-only release bump.
These numbers describe one machine and one release build. They are a baseline for later `zd`
builds, not a promise that other computers will produce the same values.

## Test system

| Item | Value |
| --- | --- |
| Computer | MacBook Pro (`Mac16,8`) |
| Processor | Apple M4 Pro, 14 cores |
| Memory | 24 GB |
| Operating system | macOS 26.5.2, arm64 |
| Build | `npx tauri build --config packages/tauri/tauri.conf.json --bundles app` |
| Diagnostics | Production bundle; local diagnostics off |

Serial numbers and other machine identifiers are intentionally excluded.

## Artifact size

| Artifact | Size |
| --- | ---: |
| Native executable | 15,914,032 bytes (15.18 MiB) |
| `zd.app` bundle | 15,660 KiB (15.29 MiB) |
| Minified frontend JavaScript | 2,813.81 kB (878.38 kB gzip) |

The v0.2.0 DMG size is recorded during the final versioned package run. The application bundle is
small because macOS supplies WebKit; its system frameworks are not copied into `zd.app`.

## Runtime workload

The baseline opened the repository as one project and created no terminal thread. The larger idle
workload opened four distinct local projects and created three live `zsh` terminal threads in each
project. All 12 shells were at an idle prompt. The workload was verified through the packaged app's
accessibility tree, and the project and thread shortcuts were used to create it.

Apple's `footprint` tool supplies the primary memory result because its summary accounts for shared
pages across the application, WebKit, and shell processes. Summed RSS is included as a diagnostic
comparison; it can count shared pages more than once. Each idle CPU value is the result of ten
one-second `ps` samples.

| Scenario | Shared-aware physical footprint | Median summed RSS | Idle CPU |
| --- | ---: | ---: | ---: |
| 1 project, 0 threads | 107 MB | 258.0 MiB | 0.0% |
| 4 projects, 12 threads | 217 MB | 366.9 MiB | 0.0% |
| Difference | +110 MB | +108.9 MiB | no measurable change |

On this machine, four open projects and twelve idle terminal threads therefore used about 217 MB
of physical memory and no measurable idle CPU during the sample window.

## Active terminal output

Two bounded workloads exercised the visible terminal in the final 64 KiB renderer configuration:

- A paced workload wrote 100,000 lines (5.43 MiB) in ten batches separated by one second. During
  the six active sampling intervals, the five principal processes used 94.0% CPU on average and
  102.8% at the highest observed point. macOS reports 100% as one fully occupied core. The principal
  process footprint peaked near 541 MB.
- A pressure workload wrote 150,000 lines (8.33 MiB) without a pause while four projects and twelve
  threads were open. The highest observed principal-process footprint was about 1.48 GiB; including
  the other eleven idle shells puts the full workload near 1.52 GiB. WebKit content accounted for
  1.25 GiB of that snapshot. The sample reported no new swap activity. Ten seconds later, the
  workload was still near 0.84 GiB, so this is a real transient pressure case rather than an idle
  memory claim.

The pressure run is intentionally harsher than ordinary agent output. It shows the remaining risk:
large unbroken transcripts can make WebKit retain substantial reclaimable memory even though
scrollback, native queues, and renderer chunks are bounded.

The review found that terminal batches could reach xterm faster than its parser consumed them. The
v0.2.0 code now waits for each xterm write callback before reading the next native batch and renders
at most 64 KiB before yielding to the next frame. A regression test covers the asynchronous consumer
boundary.

## Release fixture results

`npm run test:e2e:release` builds the frontend in production mode and runs the three bounded release
fixtures. All three passed.

| Fixture | Result |
| --- | --- |
| Terminal | 1,048,625 bytes in 172.44 ms; 5.80 MiB/s; resize 21.40 ms |
| Inactive terminals | 24 surfaces; 123,011 bytes of JS heap per surface |
| Terminal idle window | 0 adapter calls; 0.159 ms browser task time over 500 ms |
| Changes | 10,000 status entries; 40 live rows; 21.30 ms initial render; 24.70 ms diff |
| Changes idle window | 0 adapter calls; 14.48 ms browser task time over 500 ms |
| Attention | 1,000 events in 6.30 ms; 0 adapter calls while idle |

The exact times vary between runs. The release fixtures enforce broad ceilings intended to detect
large regressions, while this page preserves the measured baseline.

## How to repeat the review

1. Build the application:

   ```sh
   npx tauri build --config packages/tauri/tauri.conf.json --bundles app
   ```

2. Record artifact sizes:

   ```sh
   stat -f 'binary_bytes=%z' packages/tauri/target/release/bundle/macos/zd.app/Contents/MacOS/zd
   du -sk packages/tauri/target/release/bundle/macos/zd.app
   ```

3. Launch the bundle, open the required local projects, and create terminal threads. Identify the
   `zd` process, the three WebKit processes with the same launch time, and shells whose parent PID is
   the `zd` process.

4. Use `footprint -p <pid> ...` for a shared-aware summary. Use repeated `top` or `ps` samples for
   CPU and RSS. Keep the sampling interval, project count, thread count, visible surface, and output
   byte count with the result.

5. Run the production browser fixtures:

   ```sh
   npm run test:e2e:release
   ```

Do not include private terminal text, project paths, diagnostic contents, serial numbers, or other
machine identifiers in a published result.
