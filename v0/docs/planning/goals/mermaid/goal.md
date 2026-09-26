# Mermaid Diagram Rendering

Status: **complete — 2026-08-23**

## Outcome

Render Mermaid diagrams as quiet, theme-native content inside Markdown and when opening standalone
Mermaid files. The source remains the authority: Raw Mode reveals the editable definition, saving
writes that definition, and invalid syntax stays visible instead of becoming an empty diagram.

## Delivered behavior

- Complete `mermaid` fenced blocks render on the existing Markdown surface.
- `.mmd` and `.mermaid` files open as standalone diagrams through the same CodeMirror buffer owner.
- `Cmd+E` / `Ctrl+E` switches either form to literal, editable source and back without changing the
  document.
- Diagrams consume semantic `zd` colour and typography roles, so an existing SVG responds to Current
  Light, Dark, Dracula, and validated theme changes without remounting.
- Renderer output passes through a closed SVG element/attribute boundary. Scripts, event handlers,
  external references, embedded HTML, remote images, and the renderer's remote font import cannot
  enter the live document.
- Invalid, incomplete, or unsupported Mermaid stays honest source text. No renderer failure prevents
  the file from opening or editing.
- File detection and file-tree classification recognize both standalone extensions.

## Completion evidence

- Unit coverage proves extension detection, file classification, valid/invalid rendering, semantic
  theme variables, and the inert SVG boundary.
- Browser coverage proves fenced and standalone rendering, Raw Mode source recovery, editability,
  and compatibility with the adjacent fenced-code and Raw Mode behaviors.
- Visual inspection covers Markdown and standalone layouts in Current Light and Dark, including a
  live theme transition on the same SVG.
