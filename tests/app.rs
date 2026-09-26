use std::fs;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use tempfile::tempdir;
use zd::app::{App, Focus, Mode, SidebarMode, bindings};

fn key(code: KeyCode) -> KeyEvent {
    KeyEvent::new(code, KeyModifiers::NONE)
}

fn control(character: char) -> KeyEvent {
    KeyEvent::new(KeyCode::Char(character), KeyModifiers::CONTROL)
}

fn type_text(app: &mut App, text: &str) {
    for character in text.chars() {
        app.handle_key(key(KeyCode::Char(character))).unwrap();
    }
}

#[test]
fn keyboard_workflow_covers_tree_search_edit_find_replace_save_modes_and_quit() {
    let fixture = tempdir().unwrap();
    fs::create_dir(fixture.path().join("src")).unwrap();
    fs::write(fixture.path().join("README.md"), "alpha alpha\n").unwrap();
    fs::write(fixture.path().join("src/main.rs"), "fn unique_token() {}\n").unwrap();
    let mut app = App::open(fixture.path().join("README.md")).unwrap();

    let labels = bindings()
        .iter()
        .map(|binding| binding.label)
        .collect::<Vec<_>>();
    for required in [
        "focus",
        "tree",
        "project search",
        "save",
        "undo",
        "redo",
        "find",
        "replace",
        "read/edit",
        "quit",
    ] {
        assert!(labels.contains(&required), "missing binding {required}");
    }

    app.handle_key(key(KeyCode::Tab)).unwrap();
    assert_eq!(app.focus(), Focus::Tree);
    app.handle_key(key(KeyCode::Tab)).unwrap();
    assert_eq!(app.focus(), Focus::Document);
    app.handle_key(control('b')).unwrap();
    assert!(!app.tree_visible());
    app.handle_key(control('b')).unwrap();

    app.handle_key(control('p')).unwrap();
    type_text(&mut app, "unique_token");
    app.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(app.sidebar_mode(), SidebarMode::Search);
    assert_eq!(app.search_results().len(), 1);
    app.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(app.active_path().unwrap().to_string_lossy(), "src/main.rs");

    app.handle_key(key(KeyCode::End)).unwrap();
    app.handle_key(key(KeyCode::Char('x'))).unwrap();
    assert!(app.document().unwrap().text().ends_with('x'));
    app.handle_key(control('z')).unwrap();
    assert!(!app.document().unwrap().text().ends_with('x'));
    app.handle_key(control('y')).unwrap();
    assert!(app.document().unwrap().text().ends_with('x'));

    app.open_file(std::path::Path::new("README.md")).unwrap();
    app.handle_key(control('f')).unwrap();
    type_text(&mut app, "alpha");
    app.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(app.document().unwrap().selection().start, 0);

    app.handle_key(control('h')).unwrap();
    type_text(&mut app, "alpha");
    app.handle_key(key(KeyCode::Enter)).unwrap();
    type_text(&mut app, "omega");
    app.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(app.document().unwrap().text(), "omega omega\n");
    app.handle_key(control('s')).unwrap();
    assert_eq!(
        fs::read_to_string(fixture.path().join("README.md")).unwrap(),
        "omega omega\n"
    );

    app.handle_key(control('r')).unwrap();
    assert_eq!(app.mode(), Mode::Read);
    app.handle_key(control('r')).unwrap();
    assert_eq!(app.mode(), Mode::Edit);
    app.handle_key(control('q')).unwrap();
    assert!(app.should_quit());
}

#[test]
fn mouse_tree_and_document_actions_use_source_coordinates() {
    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("a.md"), "a界b\n").unwrap();
    fs::write(fixture.path().join("b.md"), "second\n").unwrap();
    let mut app = App::open(fixture.path().join("b.md")).unwrap();

    app.pointer_tree(0).unwrap();
    assert_eq!(app.active_path().unwrap().to_string_lossy(), "a.md");
    app.pointer_document(0, 1, false, 40).unwrap();
    app.pointer_document(0, 3, true, 40).unwrap();
    assert_eq!(app.document().unwrap().selection().start, 1);
    assert_eq!(app.document().unwrap().selection().end, 4);

    app.handle_key(control('r')).unwrap();
    app.pointer_document(0, 0, false, 40).unwrap();
    assert!(!app.document().unwrap().selection().is_empty());
}
