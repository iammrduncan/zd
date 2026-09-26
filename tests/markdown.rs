use zd::document::SourceRange;
use zd::markdown::{MappingKind, MarkdownView};

const SOURCE: &str = r#"# Calm heading

Paragraph with *emphasis*, `code`, and [a link](https://example.com).

> quoted text

- first item
- second item

![diagram](https://example.com/remote.png)

| left | right |
| --- | --- |
| one | two |

```rust
fn main() {}
```

<script>alert('never')</script>
"#;

#[test]
fn markdown_projection_covers_reader_constructs_without_executing_content() {
    let plan = MarkdownView::render(SOURCE, 7, 36);
    let text = plan.plain_text();

    for expected in [
        "Calm heading",
        "emphasis",
        "code",
        "link",
        "quoted text",
        "first item",
        "diagram",
        "remote.png",
        "left",
        "right",
        "fn main() {}",
        "<script>alert('never')</script>",
    ] {
        assert!(
            text.contains(expected),
            "missing {expected:?} from {text:?}"
        );
    }
    assert_eq!(plan.revision, 7);
    assert!(plan.rows.len() > 10);
}

#[test]
fn selectable_spans_have_truthful_source_ranges_and_synthetic_cells_do_not() {
    let plan = MarkdownView::render(SOURCE, 1, 24);
    let mut saw_exact = false;
    let mut saw_whole_node = false;
    let mut saw_synthetic = false;

    for row in &plan.rows {
        for span in &row.spans {
            match span.source {
                Some(source) => {
                    assert!(source.range.start <= source.range.end);
                    assert!(source.range.end <= SOURCE.len());
                    assert!(SOURCE.is_char_boundary(source.range.start));
                    assert!(SOURCE.is_char_boundary(source.range.end));
                    match source.kind {
                        MappingKind::Exact => saw_exact = true,
                        MappingKind::WholeNode => saw_whole_node = true,
                    }
                }
                None => {
                    if span.text.contains('•') || span.text.contains('│') {
                        saw_synthetic = true;
                    }
                }
            }
        }
    }

    assert!(saw_exact);
    assert!(saw_whole_node);
    assert!(saw_synthetic);
    let bullet = plan
        .rows
        .iter()
        .enumerate()
        .find_map(|(row, line)| {
            line.plain_text()
                .find('•')
                .map(|column| (row, column as u16))
        })
        .unwrap();
    assert_eq!(plan.source_at(bullet.0, bullet.1), None);
}

#[test]
fn wrapped_source_hits_return_the_declared_range_instead_of_a_guessed_offset() {
    let plan = MarkdownView::render(SOURCE, 2, 18);
    let hit = plan
        .rows
        .iter()
        .enumerate()
        .find_map(|(row, line)| {
            line.spans.iter().find_map(|span| {
                span.source.map(|source| {
                    let prior_width = line
                        .spans
                        .iter()
                        .take_while(|candidate| !std::ptr::eq(*candidate, span))
                        .map(|candidate| candidate.width())
                        .sum::<usize>();
                    (row, prior_width as u16, source.range)
                })
            })
        })
        .unwrap();

    assert_eq!(plan.source_at(hit.0, hit.1), Some(hit.2));
    assert_ne!(hit.2, SourceRange::new(hit.1 as usize, hit.1 as usize + 1));
}
