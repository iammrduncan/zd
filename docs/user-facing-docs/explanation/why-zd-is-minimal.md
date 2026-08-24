# Why zd is intentionally minimal

`zd` is purposefully opinionated. It follows the maintainer's daily driver workflow for reading and
editing Markdown, steering terminal-based coding agents, and moving among project, thread, file, and
Git context. It may not fit everyone, and it is not designed to become a universal IDE.

## The workflow comes first

The recurring loop is small: open a project, return to a thread, read the current Markdown or source
file, leave precise feedback, paste a screenshot when words are not enough, run the next command,
and inspect the Git change. Fast project shortcuts and the current thread/file switch keep that loop
available without rebuilding context.

The interface keeps only the regions that support this flow. Projects and threads stay on the left,
the document or terminal stays in the centre, and Files or Changes stay on the right. The centre can
show a thread and file together when both matter.

## Restraint is a product choice

The Markdown reader/editor receives more attention than a conventional utility pane because long
plans, feedback, and agent-written documents are primary work. Terminal agents, code files, and Git
surround that surface without replacing it.

This choice leaves out many general IDE features. `zd` does not aim to provide language servers,
debuggers, refactoring suites, a plugin marketplace, remote project hosting, or Git write commands.
Those exclusions keep the daily path quiet, local, quick to summon, and easy to understand.

If this matches how you build, start with [your first workbench](../tutorials/first-workbench.md).
If it does not, the limits are intentional rather than unfinished promises.
