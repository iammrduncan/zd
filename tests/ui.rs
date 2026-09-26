use std::fs;

use ratatui::Terminal;
use ratatui::backend::TestBackend;
use ratatui::layout::Rect;
use ratatui::style::Color;
use tempfile::tempdir;
use zd::app::App;
use zd::document::{Document, SourceRange};
use zd::review::ReviewStore;
use zd::ui::{document_content_area, draw, layout};

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

#[test]
fn narrow_tree_focus_replaces_the_document_instead_of_being_painted_over() {
    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("README.md"), "document-only-text\n").unwrap();
    let mut app = App::open(fixture.path().join("README.md")).unwrap();
    app.handle_key(crossterm::event::KeyEvent::new(
        crossterm::event::KeyCode::Tab,
        crossterm::event::KeyModifiers::NONE,
    ))
    .unwrap();
    let backend = TestBackend::new(40, 12);
    let mut terminal = Terminal::new(backend).unwrap();
    terminal.draw(|frame| draw(frame, &app)).unwrap();
    let rendered = buffer_text(&terminal);

    assert!(rendered.contains("Files"));
    assert!(rendered.contains("README.md"));
    assert!(!rendered.contains("document-only-text"));
}

#[cfg(unix)]
#[test]
fn control_characters_in_paths_are_inert_when_rendered() {
    use std::os::unix::ffi::OsStrExt;

    let fixture = tempdir().unwrap();
    let name = std::ffi::OsStr::from_bytes(b"evil\x1b[2J.md");
    let path = fixture.path().join(name);
    fs::write(&path, "safe body\n").unwrap();
    let app = App::open(path).unwrap();
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();
    terminal.draw(|frame| draw(frame, &app)).unwrap();

    assert!(!buffer_text(&terminal).contains('\x1b'));
}

#[test]
fn source_selection_is_visible_in_edit_and_read_modes() {
    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("README.md"), "# Heading\n").unwrap();
    let mut app = App::open(fixture.path().join("README.md")).unwrap();
    app.pointer_document(0, 0, false, 40).unwrap();
    app.pointer_document(0, 1, true, 40).unwrap();
    let mut terminal = Terminal::new(TestBackend::new(80, 24)).unwrap();
    terminal.draw(|frame| draw(frame, &app)).unwrap();
    let document_area = document_content_area(layout(Rect::new(0, 0, 80, 24), &app).document);
    assert_eq!(
        terminal.backend().buffer()[(document_area.x, document_area.y)].bg,
        Color::Blue
    );

    app.handle_key(crossterm::event::KeyEvent::new(
        crossterm::event::KeyCode::Char('r'),
        crossterm::event::KeyModifiers::CONTROL,
    ))
    .unwrap();
    app.pointer_document(0, 0, false, 40).unwrap();
    terminal.draw(|frame| draw(frame, &app)).unwrap();
    assert_eq!(
        terminal.backend().buffer()[(document_area.x, document_area.y)].bg,
        Color::Blue
    );
}

#[test]
fn review_sidebar_marks_detached_comments_visibly() {
    let fixture = tempdir().unwrap();
    let path = fixture.path().join("README.md");
    fs::write(&path, "original").unwrap();
    let mut source = Document::new("original");
    source.select(SourceRange::new(0, 8)).unwrap();
    let mut reviews = ReviewStore::open(fixture.path()).unwrap();
    reviews
        .add_comment(
            std::path::Path::new("README.md"),
            &source,
            "needs attention",
        )
        .unwrap();
    reviews.save().unwrap();
    fs::write(&path, "changed").unwrap();

    let mut app = App::open(path).unwrap();
    app.handle_key(crossterm::event::KeyEvent::new(
        crossterm::event::KeyCode::Char('l'),
        crossterm::event::KeyModifiers::CONTROL,
    ))
    .unwrap();
    let mut terminal = Terminal::new(TestBackend::new(80, 24)).unwrap();
    terminal.draw(|frame| draw(frame, &app)).unwrap();
    let rendered = buffer_text(&terminal);

    assert!(rendered.contains("detached"));
    assert!(rendered.contains("needs attention"));
}

#[test]
fn document_and_tree_viewports_follow_the_active_row() {
    let fixture = tempdir().unwrap();
    let document_text = (0..30)
        .map(|line| format!("line-{line:02}"))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(fixture.path().join("README.md"), &document_text).unwrap();
    for index in 0..20 {
        fs::write(fixture.path().join(format!("file-{index:02}.txt")), "file").unwrap();
    }
    let mut app = App::open(fixture.path().join("README.md")).unwrap();
    app.pointer_document(29, 0, false, 40).unwrap();
    let mut terminal = Terminal::new(TestBackend::new(40, 12)).unwrap();
    terminal.draw(|frame| draw(frame, &app)).unwrap();
    assert!(buffer_text(&terminal).contains("line-29"));

    app.handle_key(crossterm::event::KeyEvent::new(
        crossterm::event::KeyCode::Tab,
        crossterm::event::KeyModifiers::NONE,
    ))
    .unwrap();
    for _ in 0..15 {
        app.handle_key(crossterm::event::KeyEvent::new(
            crossterm::event::KeyCode::Down,
            crossterm::event::KeyModifiers::NONE,
        ))
        .unwrap();
    }
    terminal.draw(|frame| draw(frame, &app)).unwrap();
    assert!(buffer_text(&terminal).contains("file-15.txt"));
}
