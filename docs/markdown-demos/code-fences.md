# Code fences demo

## TypeScript

```typescript
interface Note {
  readonly title: string;
  readonly complete: boolean;
}

const note: Note = { title: "Check Markdown", complete: false };
console.log(note.title);
```

## Rust

```rust
fn main() {
    let surface = "Markdown";
    println!("{surface} stays readable");
}
```

## Shell

```bash
zd md docs/markdown-demos/demo.md
```

## JSON

```json
{
  "surface": "markdown",
  "focusMode": true
}
```

## CSS

```css
.reader {
  max-width: 72ch;
  margin-inline: auto;
}
```

## HTML

```html
<article aria-label="Markdown specimen">
  <p>Raw markup stays code inside this fence.</p>
</article>
```

## Unknown language

```made-up-language
This fence should remain readable even when no syntax grammar exists.
```

## No declared language

```
Plain fenced text keeps the code plane without invented highlighting.
```

## Indented code

    const rendered = true;
    const editable = true;
