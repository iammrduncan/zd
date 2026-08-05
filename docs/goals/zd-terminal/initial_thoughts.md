simple in app terminal that can be opened on any open zd mini app or studio.

has two hotkeys: In app hotkey that shows/hides the terminal. Global hotkey that brings the application to the foreground, on the current desktop viewed, and opens the terminal. Pressing global hotkey again minimizes the application.

text box allows clicking any where on text just like warp.

allows multi tab

highly performant and built on top of some other library cause we are not terminal experts, we just want it in the flow if we need it in the flow.

the terminal styling should match the zen beautiful framework of zd, but use monospaced font. Should match the existing styling and theme applied to all mini apps.

use libghostty for terminal emulator. https://github.com/coder/libghostty-vt-node

Should be able to split panes etc.
Should be able to have vertical tabs.
If running agent, main app can monitor and show agent status somewhere (I'll figure out how I want that to look later)
