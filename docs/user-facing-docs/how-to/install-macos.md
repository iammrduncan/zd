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

4. Continue only when `shasum` reports `OK`. If verification fails, delete the download and get the
   DMG and checksum again from the release.
5. Open the DMG, drag `zd.app` to `Applications`, then open `zd` from Applications.

## If macOS says “zd” Not Opened

The v0.1 build is ad-hoc signed and not notarized, so macOS may show the **“zd” Not Opened** alert
with only **Move to Trash** and **Done**. Continue only when you downloaded `zd` from the official
release and its checksum passed.

1. In the alert, choose **Done**.
2. Open Apple menu → **System Settings** → **Privacy & Security**.
3. Scroll to **Security**. Find the message that `zd` was blocked, then choose **Open Anyway**. Apple
   makes this button available for about an hour after the blocked launch.
4. When the warning returns, choose **Open** and authenticate if macOS asks.

macOS saves an exception for this copy of `zd`, so later launches work normally. You do not need to
disable Gatekeeper or change the global **Allow apps downloaded from** setting.

If **Open Anyway** is missing, try to open `zd` from Applications again, choose **Done**, then return
to Privacy & Security. On a managed Mac, the control may be unavailable; contact your administrator
instead of weakening the security policy.

Apple documents the same recovery path in
[Open apps safely on your Mac](https://support.apple.com/102445).

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

Your projects, files, and Git worktrees are ordinary filesystem content and are not removed with the
application. Local `zd` settings and opt-in diagnostic files remain in your user configuration and
data directories unless you remove them separately.
