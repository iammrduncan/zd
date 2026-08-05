# Open your first document

In this tutorial you will open a folder, move through a document without losing your reading place,
make one edit, and save it. You need `zd` installed; use the
[macOS installation guide](../how-to/install-macos.md) first if `command -v zd` finds nothing.

## 1. Make a small workspace

```sh
mkdir zd-first-read
cd zd-first-read
printf '# Field notes\n\nA quiet first paragraph.\n\n## Next\n\nSomething to revise.\n' > notes.md
zd md .
```

The folder opens with `notes.md` in the file sidebar. Choose it if it is not already open. The
Markdown is shaped as a document, but it is still the editable source.

## 2. Move your focus

Click in the first paragraph. It stays at full contrast while surrounding blocks recede. Press
`Option+Down Arrow` to jump to the next focus block, then `Option+Up Arrow` to return.

Hold `Cmd+.` at any point. The shortcut reference remains visible only while the keys are held, so
you return to exactly the same document context when you let go.

## 3. Edit in place

Put the caret after “Something to revise” and type:

```text
 while the thought is fresh
```

There is no edit-mode switch. Syntax punctuation remains quiet, and the paragraph keeps the same
reading measure while you type.

## 4. Save and check the file

Press `Cmd+S`, close the app, then inspect the source in the terminal:

```sh
cat notes.md
```

The sentence you added is in the ordinary Markdown file. `zd` does not convert it to another
format.

You have now used the core loop: open a workspace, move attention by readable blocks, edit the
rendered source, and save. See the [CLI reference](../reference/cli.md) for the other launch forms.
