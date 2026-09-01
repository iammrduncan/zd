# Serve a workbench to a browser

Run `zd serve` on the machine that owns the project when you want to use that workbench from
another computer. The viewing computer needs only a browser and network access to the host. It does
not need `zd`, an SSH tunnel, a helper, or a browser extension.

## Start the host

On the project host, choose the host's numeric IPv4 address on Tailscale or another protected
private network. Then run:

```sh
cd /path/to/project
zd serve . --bind <protected-network-ip>
```

`zd` approves the selected folder, asks the operating system for a free port, and prints the
connection details only after the workbench is ready:

```text
zd serve URL: http://<protected-network-ip>:<port>
zd serve secret: <process-secret>
```

Keep this process running. The files, Git operations, watchers, terminal sessions, and saved state
all remain on this host.

## Connect from the viewing computer

1. Open the exact `zd serve URL:` value in a browser on the protected network.
2. Enter the separate `zd serve secret:` value in the unlock form.
3. Select **Unlock**.

The secret is valid only for that running host process. A restart creates a new secret and can
select a new port. Do not add the secret to the URL or save it in a shared command history.

One served host admits one controlling browser at a time. Reloading that browser reconnects to the
same session. If another browser reports that the controller is unavailable, close the connected
workbench before connecting from the other browser.

## Use a fixed port

Letting the operating system choose a free port avoids a probe-and-bind race. If a firewall rule
requires one known port, set it explicitly:

```sh
zd serve /path/to/project \
  --bind <protected-network-ip> \
  --port <port>
```

The bind value must be a numeric IPv4 address. The port must be from `0` through `65535`; port `0`
selects a free port.

## Check a failed connection

From the viewing computer, request the health endpoint with the same address and port:

```sh
curl -i http://<protected-network-ip>:<port>/healthz
```

A reachable host returns `204 No Content`. If it does not, check that the host address is reachable
through the protected network and that the host firewall permits the selected port. Use the URL and
secret from the same running process.

`zd serve` uses plain HTTP and does not provide managed TLS. Run it only through Tailscale or an
equivalent protected private network that supplies admission control and transport encryption. Do
not expose the listener directly to the public Internet. The process secret authenticates the
browser; it does not encrypt the connection.

Press `Ctrl+C` in the host terminal to stop the listener, watchers, and terminal descendants. A
browser disconnect by itself does not stop a directly started host.
