Lots of LLM driven agents and coding harnesses generate tons of markdown documents.

It gets cumbersome to read these in code editors, etc. I want something that I can kick back and read the book my agent just wrote for their execution plan on building systems to solve some grand plan/software problem.

I want features of it such as line focus (where I am using my keyboard/mouse to scroll down and everything but the line or paragraph or section I am looking at is greyed out for focus).

I want it to use fonts that are great for high quality and low quality screens alike, easy on the eyes, and great font features for reading lots of documents.

I want a few toggles of themes and controls to tune things like blue light filtering, dark mode, light mode, how much to grey out sections not focused, font size, custom header sizes etc.

I want the app to default in reading mode, with quick keys to find docs using cmd+k then start searching for what doc you want to read in the current opened directory and be able to navigate to them quickly. 

I want the ability to view the code and make edits and save them.

I want the ability to toggle on and off diff mode for folders that support git (aka highlight files that were added, changed, deleted, etc).

I want only a very basic side bar that can be collapsed or sent to either side that is similar to the zed editor file browser bar, extremely minimum with a monospaced font for the sideboar/file browser.

I want by default only markdown files to be shown, toggle can show others as needed. Non-markdown files show up as just editale code, in some default code editor.

I want this to be extremely fast and responsive, like zed editor was supposed to be. So lets write this in RUST.

I want to launch this via cli with either `zd md .` to open current folder `zd md <filename>` to open one file if it exists or create the file if it doesn't exist.

Markdown editor mode should also be elegant like iA Writer is. I want all the same features on editing that I want for reading such as line, paragraph, section highlight with others faded,

In markdown editoer mode I want a typewriter styled writing available as an option.

I want users to be able to run zd md as a standalone app as well, if they just do `zd md` in terminal with no options or open the app from their desktop or spotlight (windows and mac) it should open up and ask them to pick a folder/file or create folder/file, and should show recently viewed folders/files. With a basic minimal homesplashpagethingy.

I want the ability to do cmd+| or cmd+\ to increase or decrease the splits of pages (Oh yeah you should be able to split a page so it wraps to the following column).

You can do cmd++ or cmd+- to increase/decrease font.

That should start us...

I want my dreary eyes to be able to actually focus and read...

---

## Addendum — 2026-07-27: renamed to `zd`, this is tool #1

The product and repo were renamed from `md-zen`/`mdzen` to **`zd`** (Zen Suite). The markdown
reader/editor described above is no longer a standalone binary — it is the first tool in a suite,
invoked as **`zd md`**. Lines 23 and 29 above have been updated in place to use the new command;
everything else above is unchanged, and all line references from `docs/bdd/` still resolve.

What this changes for this spec:

- The three invocation forms are now `zd md .`, `zd md <filename>`, and bare `zd md`.
- Bare `zd` is the *suite* entry point, not the markdown Home Screen. It is out of scope here.
- The other planned tools (`zd td`, `zd bdd`, `zd mer`, `zd studio`, `zd init`) are out of scope
  for this spec. They will be spec'd separately, the same way this one was.

What this does **not** change: the markdown reader is still the whole focus of the current work,
and it is first precisely because reading piles of agent-written markdown is the most painful part
of the author's day. See `README.md` for the suite context.
