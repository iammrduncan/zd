# Run a served workbench from source

Use `zd serve` when the workbench and all host operations must run on another machine. The viewing
computer needs only a browser with network access to that machine; it does not run zd, open an SSH
tunnel, or install a helper.

From the repository root on the host machine, run:

```sh
npm run app:serve -- /absolute/path/to/project --bind <protected-network-ip>
```

Use the host's numeric Tailscale or other protected-network IPv4 address for
`<protected-network-ip>`. Omit the project to approve the current directory. Omit `--bind` to listen
on all IPv4 interfaces, or use `--bind 127.0.0.1` for a same-machine browser.

The command builds the web application, starts the Rust host on an available port, and prints two
lines after the HTTP and WebSocket routes are ready:

```text
zd serve URL: http://<numeric-ip>:<ephemeral-port>
zd serve secret: <process-secret>
```

Open the printed URL from the viewing computer. Enter the separate process secret and select
**Unlock**. Keep the command running while you work. Press `Ctrl+C` in its shell to stop the host,
watchers, and terminal processes.

## Use a fixed port

Add `--port <port>` when a firewall rule or network policy requires one known port:

```sh
npm run app:serve -- /absolute/path/to/project \
  --bind <protected-network-ip> \
  --port 4317
```

The bind value must be a numeric IPv4 address. Port `0`, the default, asks the operating system to
select an available port without a probe-and-bind race.

## Check a failed connection

From the viewing computer, request the state-free health endpoint with the exact printed authority:

```sh
curl -i http://<numeric-ip>:<port>/healthz
```

A reachable host returns `204 No Content`. If it does not:

1. Confirm that the address belongs to the host machine and is reachable through the protected
   network.
2. Confirm that the port is allowed by the host firewall.
3. Use the URL and secret from the same running process. A restart creates a new port and secret.
4. Close another connected workbench. The first version permits one controlling browser at a time.

The browser URL must use the same numeric authority that reached the server. The host rejects
foreign Origin/Host pairs and does not trust forwarding headers.

## Security boundary

The initial served host uses plain HTTP. Run it only across Tailscale or an equivalent protected
private network that provides admission and transport encryption. Do not expose it directly to the
public Internet. The process secret authenticates the controller; it does not encrypt traffic.

The secret is sent only in the first WebSocket frame. It is not placed in the URL, cookies, browser
storage, diagnostics, or ordinary application logs. Browser requests use project, worktree, and
relative-resource identities; they cannot submit a new absolute root.

## Desktop behavior

The Tauri application starts the same host executable as one loopback child and connects without an
unlock form. Reload and secondary desktop launches reuse that child. Tauri retains only trusted
picker/file-open input, window presentation and close, quick access, notifications/sound, and
external links.

## Verify the source path

Run the real served-browser target:

```sh
npm run test:e2e:served
```

The target builds the frontend and shipped Rust executable, opens a generated project through the
real authenticated socket, exercises file, Git, watcher, terminal, persistence, and reconnect
behavior, and checks listener/process cleanup.
