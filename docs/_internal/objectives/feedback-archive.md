# Feedback archive

Raw notes from `docs/_internal/objectives/FEEDBACK.md`, moved here verbatim when they were triaged into tasks.

Kept unedited on purpose. The raw complaint is the evidence; the todo.txt line is only an
interpretation of it, and interpretations turn out to be wrong. When a fix does not land right,
come back and read what was actually said.

Only human notes land here. What the agent notices goes to `docs/_internal/objectives/agent-findings.md`.

---

## 2026-07-29

the app is already 1000 times better than the rust version
why are there random html files in root directory of repo?
from root folder I ran `npm run app:open -- md README.md` but got error: `Could not read /Users/example/github/zd/src-tauri/README.md — /Users/example/github/zd/src-tauri/README.md: No such file or directory (os error 2)`... solved this by directory traversal attacking it my self to open `../README.md` instead.
! the highlight is not pronounced enough. the other part of the document should be more significantly dimmed.
the highlight should not move by mouse cursor, it should be the focused area of the document.
reading and editing mode should be one in the same, so I can place my cursor and use that as the area of focus.
scrolling should also move focus, focus is object that is in the center of the screen. however we need to balance this between scroll focus and i'm editing and just scrolling down for context not to change my focus
since we are thinking reading and editing mode should be one in the same, it should show tasteful markdown symbols such as the hashtags on headers. but it shouldn't sit flush with the left align column, the hashtag should sit outside the left gutter. other things like unorder lists should not be bullet points but just the `-` and such. block quotes automatically turn to block quote after pressing space or enter when typing `>` and require a double enter to leave the blockquote editing it. same thing for code fences... after entering the triplebacktick and the code language (or not) and pressing enter it should create a code block and double enter required to exit (just like typing in slack does).
clicking a web link opens that page in the app with no way to go back.
we should think of the experience we want to have in the app for weblinks and browser pages for external sites. likely a separate mini app browser thats simple browser functionality.
clicking link to another markdown shows that document on white background and raw markdown, does not render the markdown reader.
lets make sure to add a task to enable toggling of word wrap in future, agents.md I wanted to read without wordwrap on.
if we have any hot keys I have no idea which ones are enabled because cmd+. does not yet show me hotkeys.
the app icons suck, we should have our own
i got cheeky and opened an html file, ts file, and css file. it wasn't "terrible" but it did just treat it as markdown and try to parse it. When we should probably just show the contents in our regular monospaced font in code editing mode but still in the style of our reader-editor. something for later.
the shift to edit only mode has a few drawbacks I'll list them in feedback, but in general markdown parsing is bad and tables etc are unreadable. there should be a balance we can find that is beautiful markdown thats also editable inline.
! block quotes after doing new line by default go to regular line, only after typing does it turn that line back to a block quote. It should auto block quote and if nothing is typed and enter is pressed then it demotes it to a newline.
! hashtag headers are still not putting the hashtags in the left gutter
! links are not links...
! tables are not tables, they are the raw markdown
! code blocks are not syntax highlighted differently from rest of doc
! single backtick code fence is not highlighted or properly formatted to show its code. 
! code block pressing enter twice does not leave the code block
! code blocks show the backticks and language choice after creation and should look cleaner without that. we should have a shortcut to enable showing stuff like that if we want raw markdown visible, but by default we render to more beautiful markdown.
! so yes editor by default but it should be beautiful, not just a syntax theme. we should have a shortcut to enable raw mode that shows more raw details (tables, links, code block back ticks, etc...) but by default we render those things better after information for them has been created.
tables need editability in rednered form and able to edit cell contents, add row, remove row, add column, remove column, reorder rows, reorder columns with handles. think closer to the application notion editing for this.
we should add notion style editing as one of our key insipirations
if I press `esc` it should remove my cursor from the editor and go back to tracking center item as the focused block.
! the unfocused text should be more dim. it should be barely legible, and isn't mean to fit any accessability limits its mean to really draw focus to the in focus text. Other option is to make the focused text more prominent.

cmd+i hotkey doesn't work if window is focused but editor isn't. this should be a app level hotkey not an codemirror editor level hot key. make sure when creating hotkeys that they are applied at the correct scope.
! we need the cmd+. hotkey wired in asap so i can see what commands are supposed to be working or not
! the focus line is further towards the bottom than I would expect. we should have the focal point be closer to the top of the application.
! when a doc opens, it opens with its first line fairly low in the. should be higher.
esc key still does not escape you from the editor selected
! hashtags are in gutters great, but their size should match the header size... currently they look smaller and wony out of place.
! as you scroll down down the doc the hash tags get further and further unaligned until they are above the header it is supposed to be with
pressing enter on the last item in a list does not create a new item in the list like i expected it would
pressing tab on a list item does not indent it like i expected it would. i should be able to select a list of items and indent them all one more by using tab or de-indent with shift+tab like any normal editor.
! reorder tasks to have render focused stuff and behavior focused items high priority first so we can get those out of the way. the retire task is still directly under the checkpoint, so the next run hits the blocker again the moment you clear the checkpoint. Moving it below the five construct tasks (links, tables, fenced code, inline code, images/rules) would make it unblock itself in sequence, so move those construct tasks up and this one behind them.
! i overrode the 90% fade but there still is not enough contrast between the focused zone and the faded out zone, I have given this feedback many times and we still haven't addressed it. place a checkpoint immediately after the task or tasks you create to solve this, and we will iterate on this item until it is right.
there is a focus bug that happens sometimes that a sentance thats part of a focused paragraph and towards the end of the paragraph is focused when another part of the paragram is focused, but when that sentance moves into focus the previous part of the paragraph looses focus so your "block" of focus is not bound correctly.
for items in our task queue that are marked as DECIDE that discuss a design choice, visual preference, etc... To help with decision first create tasks that are marked as COMPARE that generate a side by side comparison of the style choice so I can look and see visually what the difference is. update docs in way-of-working and other areas as needed to support this new type of task.
ok, we broke the focus though. At least on lists, it doesnt focus the whole list only individual list items.

## 2026-07-30

link is rendered but not clickable
esc is set to close shortcut menu, when releasing cmd+. should just close it. esc should be set to unfocus the editor (caret goes away)
"Needs [Node](https://nodejs.org) and [Rust](https://rust-lang.org/tools/install/)." || section is rendered right above a code block. either it rendered in wrong line (I don't think so) or it should also bring the code block up to focus as well when this line is highlighed cause they are right next to each other.
"Looking at it in a browser" || when this is at the bottom of the screen and my cursor/caret goes down past it, it goes off the window and the window does not scroll down until it reaches the table.
! table renders, but is not editable unless going into raw mode.
! "They live in `dev/` rather than beside `index.html` so the repo root shows one entry point and that entry point is the one that ships." || this section of the editor behaves funky. if I go below this line then back up it skips this line and goes above the talble, then if I start going back down it goes to the table. I am unable to select the text here correclty as it seems like its almost covered by something.
clicking on the last line of a code block does not place caret on that line and instead places it below the code block
! oh everything below the table (looking at README.md) seems to be that if you click below that table, then up arrow the caret goes above the table, no matter how far below you are. funky
arrow key navigation is buggy
cmd+left-arrow and cmd+right-arrow is buggy
! everything with caret placement and arrow key navigation and text selection work in raw code mode but not in rendered editing mode.

## 2026-07-31

cmd+i after it fades it forces you back to the top of the document

! rendered tables do not render internal contents markdown. so things like single back tick code fences are ignored etc...

when wordrap is off, stuff goes off the side of screen and I cannot scroll right to see it.

we should use short cut option+arrow-keys to jump down to the next "focus block". Option key on mac keyboards is right next to the arrow key so a nice hotkey. by jump to focus block I mean if I just hit arrow key it goes line by line, if I hit option+arrow-keys right now it does jump but its more editor jump than zd md focus block jump.

## 2026-08-01

add task for sidebar creation section to have the cli enable `zd md .` to open folder at that location and show those files in sidebar.

## 2026-08-01

if you turn off line wrap, there should still be some margin on the right most screen so when you scroll right the last character isn't at edge of screen making it hard to read.
clicking link just places a caret at the link, does not open it
! on README.md "Needs [Node](https://nodejs.org) and [Rust](https://rust-lang.org/tools/install/)." if its highlighted for focus the code block right below it should be highlighted for focus.
opt+arrow key scroll is working for jumping sections. Two things. 1. It should be listed in the shortcuts listing. 2. If using that it should try to center the new block onto the center focal point.
! tables are always high contrast and never dimmed even when they are not in focus. in render mode.
tables are still not able to be edited in render mode.
! you had a review done against you stored in @docs/audit
! no confirm exit without save on quit.
we need auto pair. so if I type [ or { then it auto creates the other side, if I highlight text and hit one it auto wraps the text. Need this for back ticks and quotes etc.
stats line needs Read time (Just show '4m' or soemthing like that, no details but if someone sees a time on a stat they know what it is) and line count

## 2026-07-30

<!-- This heading reads as going backwards after the three above it. It is not: `date +%F` says
2026-07-30 and every commit in the log agrees, while the headings above were stamped from a date
two days ahead. The drift is an open task in todo.txt with the correction still undecided; this
section uses the clock rather than joining the drift. -->

the confirmation on close if unsaved should probably be a more prominant signal that they have to confirm or click cancel on.
the caret does not judder on new lines in typewriter
! however the line animation shifting up is not smooth enough. It should be a smoother scroll up anytime text scrolls. iA Writers scroll is a good example of this.
! the other scroll thing is that when you reach the bottom of a page and scroll down it shouldn't just scroll and move down from there it should smoothly return the caret back to center by scrolling that doc position to the center of the page again.
i commented out the ci, we are not nearly ready for that yet
tables still render weird and the caret never goes into them so they are never focused and it often skips them when going through doc.

## 2026-07-31

option+arrow key is unreliable and jump. Instead if it holding your focus point in the center of the screen it hops around the screen. It should pull the next focus point in front of you and smoothly ease it to be into the focal point. Instead its all over the place and the easing is too fast. (But i just realized thats in typewriter mode, in normal mode it works as expected)
! bottom of screen caret warp to focal point to scroll page easing is too fast
! when the app starts, auto focus the editor so the caret is placed and then show at top right of editor for about 5 seconds a tooltip that says "Use opt+down-arrow to shift your focus while reading".
holding enter on typewriter mode cause full doc judder, its not a smooth scroll. doing a single enter seems smooth but the hold and repeate doesn't.
cmd+w just closed the window. It did not ask for a confirm to quit without save.

## 2026-07-31

! caret is not placed on open, editor is not focused automatically on start.
! treat the opt+arrowkey easing the same you did for the bottom of screen scroll up easing
! still judder on typewriter mode on holding enter, or holding donw down/up arrow key to go through lines. not smooth scroll, its reacting to every line instead of scrolling smoothly
! on cmd+w I saw it didn't exit when I hit it, and did on a second hit.. but I did not see any pop up or message asking me if I wanted to confirm exit without saving or cancel. And cmd+w hitting again shouldn't actually kill app without clicking on that confirmation. Standard editor stuff here folks.
I want to see the folder cleaned up... src & src-tauri should go under src/app, and src/tauri. scripts under src/scripts, actually instead of src/<name> it should be packages/<name>... so packages/app, packages/tauri, packages/scripts, etc... tests should be filed under correct thing... so if tests of app it should be packages/app/tests... app source should be packages/app/src... get rid of random index.html and dev/*.html if those aren't used and if they are put them in right spot... same with .ruff and assets/fonts etc... lets clean it up a bit in here.

## 2026-08-01

on opt+arrow ever one and a while there is a judder but its a performance judder like i see it catch and then release like some performance thing...
!cmd+w does prevent exiting, but there is no visual confirmation box to click cancel or close on.
!do the folder reorganization I mentioned before

## 2026-08-03

! zdloop needs mouse scroll, after summary was unable to scroll to top of agent stream.
We should move up the sidebar work so I can start using zd on other projects as a daily driver and find more opportunities than just the few bugs we are working out
! zdloop should ask for model choice on start what model, what effort level, enable fastmode?
probably later should use sqllite as our db store for comments and other app state, can be after base md app build.
after base md app build should siphon file navigator as a separate reusable componentat for multiple apps not just the md mini_app.
! add delete comment option.
! add file sort with folders first then files, both abc order just like every other editor.
! allow file tree to scroll right if name/list goes beyond pane of file list.
unable to click top of window and drag window around to rearrange on screen
when a user toggles word wrap off, the left margin should go towards the left of the screen, so that long lines don't automatically go off the end of a screen.
! zdloop doesn't allow scroll back with mouse, so when decision is asked, I am unable to scroll up to compate to see what I am supposed to be comparing. if it's asking me to look at something and make a decision, then I need to know what to look at the command or whatever.
DECISION: use the Widen compact inset on the compare markers.
comparisons should be launched and then asked for input... and then after answered they should be cleaned up and not to exist in the dev folder forever. this builds on a prior issue with zdloop where I cannot tell what it is asking a decision on if it was a compare the step before. and then I have to go find the command randomly to run... dumb.

## 2026-08-05

for file browser, the folders when opened should have a thin line going from the bottom of it to the end of files listed under it. This way you can see what files are nested under that folder without guessing based on depth etc. Zed editor does this, love it.
! add reading progress indicator. Telling me how far I am in document and how much I have left. Should be small and to bottom right of window.
