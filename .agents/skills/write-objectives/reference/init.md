# init

Scaffold a new objective and hand it to the owner to fill in.

Aliases: `scaffold`.

## Do this

1. **Create `<objectives>/<name>/objective.md`** from
   [templates/objective.md](templates/objective.md), with every prompt left unanswered.
2. **Say these three things, in your reply:**
   - the path you created;
   - **that `objective.md` is theirs to fill in, and that you must not invent their intent**;
   - that `create-research` comes next, once it has content.

That is the whole command. It is two actions, and it is finished in one turn. Do not survey the
repository first — there is nothing to learn from other objectives that changes what this one's
scaffold looks like.

## What this command does and does not do

It creates the folder and an `objective.md` full of prompts. **It does not write the objective.**
The owner's intent is the one input the whole lifecycle rests on, and an agent that invents it
produces research, plans, and goals that are all internally consistent and about the wrong thing.

Two failures are equally bad, and the second is easier to fall into:

- **Inventing the intent.** Filling in "What we want" with goals the owner never stated.
- **Explaining instead of acting.** Reading the skill, describing what an objective is, and never
  creating the file or telling the owner it is theirs. The owner is left with nothing.

## Procedure

### 1. Decide the scope

Ask, if it is not clear from the request:

- Is this a large arc of work, or one bounded piece? A large arc is an objective. One bounded piece
  is a simple goal — see [simple-goals.md](simple-goals.md), and use `init <name> --simple`.
- What is the short kebab-case name? Prefer the subject, not the activity: `demo-refining`,
  `inspection-tooling`, `asset-catalog` are the right shape.

Check the name is not taken, including in `_archives/`. A name reused after archival makes the
history ambiguous.

### 2. Create the folder

```
<objectives>/<name>/
  objective.md
```

That is all. Do not create `research/`, plan documents, or `goals/` — each is created by the command
that fills it, so the folder shape always reports the true phase.

### 3. Write objective.md from the template

Copy [templates/objective.md](templates/objective.md). It is a set of prompts, not a form to be
completed by you. Leave every prompt unanswered except the name and the date.

If the owner gave intent in the request, put it under "What we want" verbatim, attributed as their
words. Do not expand it, do not infer goals from it, and do not add a scope section they did not
state.

### 4. Add the index entry

Add the objective to the active table in the objectives index:

```markdown
| [<Name>](<name>/README.md) | — | <one line, from the owner's intent or "being defined"> |
```

The roadmap column stays `—` until there is a plan.

### 5. Report

Tell the owner, in this order:

- the path created;
- **that `objective.md` is theirs to fill in** — say it plainly, in those terms. It is the single
  most important sentence this command produces, and an agent that creates the file without saying
  so has left the owner unsure whether it is waiting on them;
- that nothing else should start until it has content;
- the specific prompts in it that matter most for this piece of work;
- that `create-research` is the next command, and what it will do.

Do not offer to fill in `objective.md` for them. Offer to talk it through — dialogue is how intent
gets stated, and their words in the file are worth more than your summary of them.

## When the owner wants to start immediately

If they want research started in the same session, still create `objective.md` first and get its
content from them in conversation. Write down what they say, read it back, and only then move on.
Five minutes of stated intent saves a research phase pointed at the wrong problem.
