> Historical idea, superseded on 2026-08-22. It does not direct current implementation; see the
> [one-workbench execution plan](../../../goals/expanded-scope/goal.md).

the zd md treatment for for BDD development.

should move bdd/features to bdd/md/features

adds first hook into `zd init` creating bdd folders if they don't exist already.

Init creates new /docs/bdd folder with README.md, glossary.md, requirements.md, and bdd.md that define and setup the bdd lifecycle, creation, terminology etc. These are stored as static assets that get added to a repo whenever they are added.

Init creates /docs/bdd/agent_instructions.md describing the flow to use with claude code.

the `zd bdd .` opens up a bdd development editor. It finds and maps out all bdd items within the folder it opened recursively and opens an editor like zd md. zen style editor.

has two main read modes.

- reader
- grapher

reader is like zd md and allows you to read through items block by block. I'm very open to this and how we design blocks to be viewed, but it should still retain the same theming as zd md with fonts etc and styling.

grapher shows a beautiful mindmap/graph/dag dependency tree thingy of the bdd items, and makes it easy to traverse them and read them and find their relationships.

both reader and grapher will show status of last bdd checks (if they exist) in the UI with stylized check/x marks.

You can edit any highlighted bdd node.

open to other ways to generally work on this bdd flow.
