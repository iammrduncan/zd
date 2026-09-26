use std::fs;

use ratatui::Terminal;
use ratatui::backend::TestBackend;
use ratatui::layout::Rect;
use tempfile::tempdir;
use zd::app::App;
use zd::ui::{draw, layout};

fn buffer_text(terminal: &Terminal<TestBackend>) -> String {
    let buffer = terminal.backend().buffer();
    (0..buffer.area.height)
        .map(|y| {
            (0..buffer.area.width)
                .map(|x| buffer[(x, y)].symbol())
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn test_backend_renders_small_regular_and_wide_layouts() {
    let fixture = tempdir().unwrap();
    fs::write(
        fixture.path().join("README.md"),
        "# Heading\n\nBody text.\n",
    )
    .unwrap();
    let app = App::open(fixture.path().join("README.md")).unwrap();

    for (width, height) in [(40, 12), (80, 24), (160, 50)] {
        let backend = TestBackend::new(width, height);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(|frame| draw(frame, &app)).unwrap();
        let rendered = buffer_text(&terminal);
        assert!(rendered.contains("README.md"));
        assert!(rendered.contains("EDIT"));
        assert!(rendered.contains("Heading"));
    }
}

#[test]
fn hiding_tree_reallocates_document_width_without_changing_selection() {
    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("README.md"), "select me\n").unwrap();
    let mut app = App::open(fixture.path().join("README.md")).unwrap();
    app.pointer_document(0, 0, false, 40).unwrap();
    app.pointer_document(0, 6, true, 40).unwrap();
    let selection = app.document().unwrap().selection();

    let full = Rect::new(0, 0, 100, 30);
    let before = layout(full, &app);
    app.toggle_tree();
    let after = layout(full, &app);
    assert!(before.tree.is_some());
    assert!(after.tree.is_none());
    assert!(after.document.width > before.document.width);
    assert_eq!(app.document().unwrap().selection(), selection);
}
