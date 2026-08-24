# Customize themes

Themes change the workbench colours without changing your projects, open files, or terminal
sessions. Choose one theme for the whole workbench, then add overrides only where a different
reading or working surface helps you.

## Change the workbench theme

1. Press `Cmd+,` on macOS or `Ctrl+,` elsewhere to open **Settings**.
2. Under **Appearance**, choose **Follow System**, **Current Light**, **Dark**, **Dracula**,
   **Homebrew**, or an installed local theme in the **Theme** row.
3. Close Settings.

The change applies immediately and remains selected when you reopen `zd`. **Follow System** uses
Current Light or Dark when the operating-system appearance changes.

You can also press `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` elsewhere, type `theme`, and choose a
theme from the Command List.

## Override one surface

Open **Settings**, then choose a palette in any of these Appearance rows:

| Setting | What it changes |
| --- | --- |
| **Threads theme** | The active terminal thread surface. |
| **Projects panel theme** | The Projects and thread-navigation panel. |
| **Code theme** | Code and plain-text editor surfaces. |
| **Markdown theme** | Rendered and raw Markdown editor surfaces. |
| **File panel theme** | The Files and Changes panel. |
| **Settings / Meta theme** | Settings, Command List, Shortcut Reference, and feedback views. |

Choose **Workbench** in a surface row to remove its override and inherit the workbench theme again.
Each override applies immediately, persists across launches, and does not restart a terminal or
remount an editor.

## Install a local theme

1. Create the `zd` configuration directory if it does not exist.

   | Platform | Directory |
   | --- | --- |
   | macOS | `~/Library/Application Support/zd` |
   | Windows | `%APPDATA%\zd` |
   | Linux | `$XDG_CONFIG_HOME/zd`, or `~/.config/zd` when `XDG_CONFIG_HOME` is unset |

2. Create a direct child named `<name>.theme.config`. Use only letters, numbers, `_`, or `-` in
   `<name>`. Do not use `system` or `workbench`.
3. Copy the complete example from the [theme configuration reference](../reference/theme-config.md)
   and change its display name and colours. Keep every listed key.
4. Quit and reopen `zd`. Themes are discovered during launch.
5. Open Settings or the Command List and choose the new display name.

An invalid file produces a local configuration notice and does not prevent `zd` from opening. The
notice names the file and the first validation problem.

## Update or remove a local theme

To update a theme, edit the same `.theme.config` file and reopen `zd`. Keep the filename when you
want existing selections to keep the same theme identity.

To remove a theme, delete its file and reopen `zd`. If it was selected, `zd` uses the last available
theme or Current Light and shows a local notice. Any surface override that refers to the removed
theme returns to the workbench theme.
