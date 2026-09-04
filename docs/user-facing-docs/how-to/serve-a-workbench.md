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

The process secret is valid only for that running host process. After the first successful unlock,
the browser remembers this host and reconnects without asking for the next process secret. This
works after a reload and after `zd serve` restarts on another free port, as long as you use the same
host name or IP address and the same browser profile. A different browser profile, host address, or
cleared site cookie requires the current process secret again.

The remembered credential is an HTTP-only site cookie. Page scripts and browser storage cannot read
it. Do not add the process secret to the URL or save it in a shared command history.

One served host admits one controlling browser page at a time. When another paired page connects,
it takes control and retires the previous page. You do not need to close the previous page or enter
the process secret again. Reload a retired page if you want that page to take control again.

## Open another folder on the host

1. Choose **Open** in the `PROJECTS` header.
2. In **Open remote folder**, navigate through the folders shown by the host. Use the name filter to
   narrow a large directory.
3. Select a folder, then choose **Open This Folder**.

The selected folder opens beside the current project. It returns the next time you run `zd serve`
for the same startup project, including its unsaved drafts and terminal identities. Secondary-click
the project heading and choose **Close** when you no longer want it restored.

The browser never submits an absolute path. It can navigate and select only directory handles that
the host issued for the current **Open remote folder** dialog.

## Reconnect to live terminals

A page reload or `zd serve` process restart reattaches each terminal to the same terminal process and
session identity. Use the terminal or thread menu to terminate and remove a terminal when you intend
to close it. A host operating-system restart or terminal-keeper failure cannot preserve the live
process; the workbench then reports that the terminal is unavailable instead of starting a duplicate.

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

Press `Ctrl+C` in the host terminal to stop the listener and watchers. Live terminal sessions stay
in the host terminal keeper and reconnect when you start `zd serve` again. Terminate them in the UI
first if you want to close them. A browser disconnect by itself does not stop a directly started
host.
