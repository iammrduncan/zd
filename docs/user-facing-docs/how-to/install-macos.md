# Install zd on macOS

Use a release DMG for normal installation. Building from source is useful when testing a change.

## Install a release

1. Open the [latest GitHub Release](https://github.com/iammrduncan/zd/releases/latest).
2. Download the DMG and matching `.sha256` file for your Mac. `uname -m` prints `arm64` on Apple
   Silicon and `x86_64` on an Intel Mac.
3. From the download directory, verify the image before opening it:

   ```sh
   shasum -a 256 -c zd_<version>_<architecture>.dmg.sha256
   ```

4. Open the DMG and drag `zd.app` to `Applications`.
5. The v0.1 build is ad-hoc signed, not notarized. If Gatekeeper blocks the first launch, use the
   Open Anyway control in System Settings → Privacy & Security after confirming the checksum.

To make the terminal command available, create a link in a directory already on PATH. This command
fails instead of replacing an existing `zd` entry:

```sh
sudo mkdir -p /usr/local/bin
sudo ln -s /Applications/zd.app/Contents/MacOS/zd /usr/local/bin/zd
command -v zd
```

## Install a source build

From a checkout with the supported Node and Rust toolchains installed:

```sh
npm ci
npm run package:macos
sudo npm run install:macos
```

The installer stages a complete replacement app, preserves no stale bundle files, and refuses to
overwrite an unrelated `/usr/local/bin/zd` command.

## Update

For a release build, replace `/Applications/zd.app` with the app from the new verified DMG. The
existing command link continues to point into it. For a source build, rerun the package and install
commands above.

## Remove

Inspect the command link before removing exactly these installed paths:

```sh
ls -l /usr/local/bin/zd
sudo rm /usr/local/bin/zd
sudo rm -rf /Applications/zd.app
```

Your Markdown files are ordinary files and are not removed with the application.
