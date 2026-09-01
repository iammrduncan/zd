# Install zd on Linux

Use the x86_64 Debian package when your Debian-based system provides GTK 3 and WebKitGTK 4.1. The
package installs both the desktop launcher and the `zd` terminal command.

## Install a release

1. Open the [latest GitHub Release](https://github.com/iammrduncan/zd/releases/latest).
2. Download `zd_<version>_amd64.deb` and its matching `.sha256` file.
3. From the download directory, verify the package:

   ```sh
   sha256sum -c zd_<version>_amd64.deb.sha256
   ```

4. Continue only when `sha256sum` reports `OK`. If verification fails, delete both files and
   download them again from the release.
5. Install the package and its declared runtime dependencies:

   ```sh
   sudo apt install ./zd_<version>_amd64.deb
   ```

Open `zd` from the desktop application menu, or run `zd`, `zd <folder>`, or `zd <file>` from a
terminal. To use the installed command on a remote host, see
[Serve a workbench](serve-a-workbench.md).

## Installed files

The package installs these executable and application paths:

| Path | Purpose |
| --- | --- |
| `/usr/bin/zd` | Console command and foreground `zd serve` host |
| `/usr/bin/zd-desktop` | Desktop wrapper used by the application menu and file associations |
| `/usr/lib/zd/assets` | One production workbench frontend shared by browser and desktop clients |

The desktop wrapper is an implementation detail. Use `zd` for terminal commands.

## Update

Download and verify the newer Debian package, then install it with the same `apt install` command.
The package replaces its installed executables and assets without changing your project files or
saved `zd` state.

## Remove

Remove the installed package with:

```sh
sudo apt remove zd
```

This removes the package files. Your projects, files, and Git worktrees remain where you created
them. Local settings and saved workbench state under `$XDG_CONFIG_HOME/com.zensuite.zd`, or
`~/.config/com.zensuite.zd` when `XDG_CONFIG_HOME` is unset, also remain unless you remove that
directory separately.
