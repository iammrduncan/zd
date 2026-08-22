> Historical idea, superseded on 2026-08-22. It does not direct current implementation; see the
> [one-workbench execution plan](../../../goals/expanded-scope/goal.md).

easy command line first todo list manager.

operates using todo.txt guidelines

typically I used todo.txt cli to manage all my todos, works amazing.

this will basicaly do my most needed / wanted things with it.

able to add todo

able to set priority after the fact or during add

able to mark single or multiple done

able to search by the various methods of tags, dates, etc.

able to reprioritize

able to append to, edit, or replace a todo

able to generate todo report

able to list todos by priority by alphabetical order

able to use local todo files or standard global todo file (local todo files are great for tracking single repos)

has an equivelent zen interface that is text only view, matches styling and theming of zd md and has zen productivity focusing things.

adds additional metadata field to any todo that can be access by doing `zd td desc <id>` and allows you to view, edit, replace it. That can be use to store markdown content as a description field. Which can be used by agents or other use cases. Typical human quick todo's don't require this, but agents may need aditional context.

we need some way to tag an item as "claimed" by an agent, that prevents race conditions but doesn't get crazy difficult to manage.

standardize progress tags for todo, in progress, in review, change requested, done. `zd td start`, `zd td review`, `zd td change`, `zd td add`, `zd td do`. if change requested this is a second metadata field in addition to description metadata field. This is it, no more metadata fields other than these. If someone wants to extend they can add a plugin. 

default `zd td ls` never shows metadata desc or change requested fields. Shows just list like normal todo.txt cli.

metadata fields desc, change requested are stored in just normal text files just like regular todos are. Just stored in separate files. todos have @m:<id> @cr:<id> on them if they have accompanying metadata or change request that correspond to the other file ids.

metadata files are just newline delimited. anything on a line is part of that metadata and the id of that metadata is the line number.

if a todo is done and archived, and no other todo references that metadata item, that metadata item is also archived and all ids across metadata and todos are updated.
