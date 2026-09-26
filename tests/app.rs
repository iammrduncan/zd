use std::fs;
use std::path::Path;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use tempfile::tempdir;
use zd::app::{App, Focus, HandoffStage, Mode, SidebarMode, bindings};
use zd::image::{ClipboardImage, ImageError, RgbaImage};
use zd::review::AnchorState;

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
        "comment",
        "reviews",
        "agent handoff",
        "paste image",
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

#[test]
fn vertical_keyboard_movement_preserves_a_display_cell_column() {
    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("lines.txt"), "ab界d\nx\nab界d\n").unwrap();
    let mut app = App::open(fixture.path().join("lines.txt")).unwrap();

    app.pointer_document(0, 4, false, 40).unwrap();
    app.handle_key(key(KeyCode::Down)).unwrap();
    assert_eq!(app.document().unwrap().cursor(), 8);
    app.handle_key(key(KeyCode::Down)).unwrap();
    assert_eq!(app.document().unwrap().cursor(), 14);
    app.handle_key(key(KeyCode::Up)).unwrap();
    assert_eq!(app.document().unwrap().cursor(), 8);
}

struct FakeImage;

impl ClipboardImage for FakeImage {
    fn read_image(&mut self) -> Result<RgbaImage, ImageError> {
        Ok(RgbaImage {
            width: 1,
            height: 1,
            pixels: vec![1, 2, 3, 255],
        })
    }
}

#[cfg(unix)]
fn fake_herdr(directory: &Path) -> std::path::PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let path = directory.join("herdr-fake");
    fs::write(
        &path,
        "#!/bin/sh\n\
         if [ \"$1:$2\" = \"agent:list\" ]; then\n\
           printf '%s' '{\"result\":{\"agents\":[{\"agent\":\"codex\",\"pane_id\":\"pane-1\",\"focused\":true}]}}'\n\
           exit 0\n\
         fi\n\
         printf '%s\\0' \"$@\" > \"$(dirname \"$0\")/capture\"\n",
    )
    .unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
    path
}

#[cfg(unix)]
#[test]
fn review_handoff_and_image_commands_share_the_active_source_selection() {
    let fixture = tempdir().unwrap();
    let path = fixture.path().join("notes.md");
    fs::write(&path, "alpha beta\n").unwrap();
    let mut app = App::open(&path).unwrap();
    app.pointer_document(0, 0, false, 40).unwrap();
    app.pointer_document(0, 5, true, 40).unwrap();

    app.handle_key(control('n')).unwrap();
    type_text(&mut app, "review this");
    app.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(app.active_comments().len(), 1);
    assert_eq!(
        app.active_comments()[0].state,
        AnchorState::Attached(zd::document::SourceRange::new(0, 5))
    );
    assert!(fixture.path().join(".zd/review-v1.json").exists());
    app.handle_key(control('l')).unwrap();
    assert_eq!(app.sidebar_mode(), SidebarMode::Review);

    let mut reopened = App::open(&path).unwrap();
    reopened.pointer_document(0, 0, false, 40).unwrap();
    reopened.pointer_document(0, 5, true, 40).unwrap();
    let executable = fake_herdr(fixture.path());
    reopened.set_herdr_executable(&executable);
    reopened.handle_key(control('g')).unwrap();
    type_text(&mut reopened, "explain this");
    reopened.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(reopened.handoff_stage(), Some(HandoffStage::Targets));
    assert!(!fixture.path().join("capture").exists());
    reopened.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(reopened.handoff_stage(), Some(HandoffStage::Preview));
    assert!(reopened.prepared_handoff().unwrap().text.contains("alpha"));
    assert!(!fixture.path().join("capture").exists());
    reopened.handle_key(key(KeyCode::Enter)).unwrap();
    assert!(fixture.path().join("capture").exists());
    assert_eq!(reopened.handoff_stage(), None);

    reopened.pointer_document(0, 10, false, 40).unwrap();
    reopened
        .paste_image_from(&mut FakeImage, "architecture")
        .unwrap();
    assert!(
        reopened
            .document()
            .unwrap()
            .text()
            .contains("![architecture]")
    );
}

#[test]
fn unavailable_herdr_keeps_a_manual_prepared_prompt_without_submitting() {
    let fixture = tempdir().unwrap();
    let path = fixture.path().join("notes.md");
    fs::write(&path, "selection").unwrap();
    let mut app = App::open(path).unwrap();
    app.pointer_document(0, 0, false, 40).unwrap();
    app.pointer_document(0, 9, true, 40).unwrap();
    app.set_herdr_executable(fixture.path().join("missing-herdr"));

    app.handle_key(control('g')).unwrap();
    type_text(&mut app, "inspect");
    app.handle_key(key(KeyCode::Enter)).unwrap();

    assert_eq!(app.handoff_stage(), Some(HandoffStage::Preview));
    assert!(app.handoff_target().is_none());
    assert!(app.prepared_handoff().unwrap().text.contains("selection"));
    assert!(app.status().contains("manual delivery"));
}

#[test]
fn bracketed_paste_targets_prompts_and_never_edits_behind_handoff_preview() {
    let fixture = tempdir().unwrap();
    let path = fixture.path().join("notes.md");
    fs::write(&path, "alpha").unwrap();
    let mut app = App::open(path).unwrap();
    app.pointer_document(0, 0, false, 40).unwrap();
    app.pointer_document(0, 5, true, 40).unwrap();

    app.handle_key(control('f')).unwrap();
    app.handle_paste("alpha").unwrap();
    app.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(app.document().unwrap().selection().start, 0);

    app.set_herdr_executable(fixture.path().join("missing-herdr"));
    app.handle_key(control('g')).unwrap();
    app.handle_paste("inspect").unwrap();
    app.handle_key(key(KeyCode::Enter)).unwrap();
    assert_eq!(app.handoff_stage(), Some(HandoffStage::Preview));
    let before = app.document().unwrap().text();
    app.handle_paste("must not edit").unwrap();
    assert_eq!(app.document().unwrap().text(), before);
}
