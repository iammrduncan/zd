# Shortcut reference

The live Shortcut Reference is authoritative because it is rendered from the command registry that
dispatches each key. Press `Cmd+.` on macOS or `Ctrl+.` elsewhere to show the commands available in
the current context. Its compact table also edits application shortcuts: select a binding, press the
replacement chord, or use Reset to restore the default. Operating-system shortcuts remain visible
but system-managed.

| Action | macOS | Windows and Linux |
| --- | --- | --- |
| Find in the current file or terminal | `Cmd+F` | `Ctrl+F` |
| Toggle Focus Mode | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Filter the active file tree | `Cmd+P` | `Ctrl+P` |
| Show or hide Files and Changes | `Cmd+Shift+B` | `Ctrl+Shift+B` |
| Open the searchable Command List | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Open or close Settings | `Cmd+,` | `Ctrl+,` |
| Activate project 1 through 9 | `Cmd+1` … `Cmd+9` | `Ctrl+1` … `Ctrl+9` |
| Activate the previous or next project | `Cmd+Option+Up` / `Cmd+Option+Down` | `Ctrl+Alt+Up` / `Ctrl+Alt+Down` |
| Start a terminal thread in the active project | `Cmd+N` | `Ctrl+N` |
| Switch between the current thread and file | `Cmd+B` | `Ctrl+B` |
| Show or hide the active project terminal | `Cmd+J` | `Ctrl+J` |
| Split the active project terminal | `Cmd+D` | `Ctrl+D` |
| Close the active project terminal split | `Cmd+Shift+D` | `Ctrl+Shift+D` |
| Summon or hide the workbench globally | `Cmd+Shift+Space` | `Ctrl+Shift+Space` |
| Save the current file | `Cmd+S` | `Ctrl+S` |
| Show literal Markdown source | `Cmd+E` | `Ctrl+E` |
| Toggle line wrapping | `Cmd+Option+Z` | `Ctrl+Alt+Z` |
| Toggle Typewriter Mode | `Cmd+Option+T` | `Ctrl+Alt+T` |
| Next or previous focus block | `Option+Down` / `Option+Up` | `Alt+Down` / `Alt+Up` |
| Dismiss the current transient or mode | `Escape` | `Escape` |

A context-dependent shortcut falls through when its target is unavailable. The global summon may be
unavailable when the operating system refuses registration or another application owns the chord;
ordinary launch still works.

After opening the file filter, use its visible close action or press `Escape` to return focus to the
file tree without losing its expansion, selection, or scroll position.

To change a window shortcut, open **Settings**, choose its current binding under **Shortcuts**, and
press the replacement chord. A chord already used by another command is refused. **Reset** restores
the registered default. The global summon shortcut remains managed by the operating system. The
`[p]` and `[f]` in the top drag strip show or hide Projects and Files/Changes. `[s]` opens Settings,
and `[h]` opens the live Shortcut Reference.

To change the theme, open the Command List, type `theme`, and choose **Theme: Follow System**,
**Theme: Light**, **Theme: Dark**, **Theme: Dracula**, **Theme: Homebrew**, or a validated
installed theme. The selection applies immediately and is restored the next time zd starts. Use
[Customize themes](../how-to/customize-themes.md) to apply different palettes to individual
workbench surfaces.
