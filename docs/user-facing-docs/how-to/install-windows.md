# Install zd on Windows

Use the x64 setup executable from a GitHub Release for normal installation.

## Install a release

1. Open the [latest GitHub Release](https://github.com/iammrduncan/zd/releases/latest).
2. Download the Windows x64 `-setup.exe` and its matching `.sha256` file.
3. In PowerShell, verify that the installer matches the published checksum:

   ```powershell
   $installer = Get-Item .\zd_*-setup.exe
   $expected = (Get-Content "$($installer.FullName).sha256").Split()[0]
   $actual = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
   $actual -eq $expected
   ```

   Continue only when PowerShell prints `True`.

4. Run the setup executable and complete the per-user installation.

The v0.1 Windows installer is not code signed. Windows may show a SmartScreen warning even when the
checksum matches the release.

## Update

Download and verify the installer from the newer release, then run it over the existing
installation.

## Remove

Remove `zd` from Windows Settings → Apps → Installed apps. Your projects, files, and Git worktrees
are ordinary filesystem content and are not removed with the application.

Desktop completion notifications and sounds are currently unavailable on Windows. Projects, files,
Git inspection, editing, and terminal threads remain available; the Attention settings report the
unsupported notification capability directly.
