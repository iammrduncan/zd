use std::fs;

use tempfile::tempdir;
use zd::document::{Document, FindDirection, FindQuery, MoveDirection, SourceRange};

#[test]
fn movement_and_backspace_follow_graphemes_while_cells_follow_display_width() {
    let mut document = Document::new("a\u{301}👩‍💻界");
    document.set_cursor(document.len_bytes()).unwrap();

    assert_eq!(
        document.point_at(document.len_bytes()).unwrap().cell_column,
        5
    );
    document.move_cursor(MoveDirection::Previous, false);
    assert_eq!(document.cursor(), 14);
    document.move_cursor(MoveDirection::Previous, false);
    assert_eq!(document.cursor(), 3);
    document.move_cursor(MoveDirection::Next, false);
    assert_eq!(document.cursor(), 14);

    document.backspace().unwrap();
    assert_eq!(document.text(), "a\u{301}界");
    assert_eq!(document.cursor(), 3);
    assert_eq!(
        document.point_at(document.len_bytes()).unwrap().cell_column,
        3
    );
}

#[test]
fn multiline_edits_keep_a_valid_source_selection_and_group_history() {
    let mut document = Document::new("alpha\nbeta\ngamma");
    document.select(SourceRange::new(3, 11)).unwrap();
    document.insert("ONE\nTWO").unwrap();

    assert_eq!(document.text(), "alpONE\nTWOgamma");
    assert!(document.selection().is_empty());
    assert!(document.text().is_char_boundary(document.cursor()));

    document.insert("\nPASTE\n").unwrap();
    assert!(document.undo());
    assert_eq!(document.text(), "alpONE\nTWOgamma");
    assert!(document.undo());
    assert_eq!(document.text(), "alpha\nbeta\ngamma");
    assert!(document.redo());
    assert!(document.redo());
    assert_eq!(document.text(), "alpONE\nTWO\nPASTE\ngamma");
}

#[test]
fn invalid_ranges_are_refused_before_edit_size_arithmetic() {
    let mut document = Document::new("safe");
    assert!(
        document
            .replace(SourceRange::new(0, usize::MAX), "")
            .is_err()
    );
    assert_eq!(document.text(), "safe");
}

#[test]
fn find_wraps_in_both_directions_and_replace_all_is_one_edit() {
    let mut document = Document::new("Alpha alpha\naba");
    let insensitive = FindQuery::literal("alpha").case_sensitive(false);
    assert_eq!(
        document.find(&insensitive, 2, FindDirection::Next).unwrap(),
        Some(SourceRange::new(6, 11))
    );
    assert_eq!(
        document
            .find(&insensitive, 0, FindDirection::Previous)
            .unwrap(),
        Some(SourceRange::new(6, 11))
    );

    let regex = FindQuery::regex("(?m)^a.a$");
    assert_eq!(
        document.find(&regex, 0, FindDirection::Next).unwrap(),
        Some(SourceRange::new(12, 15))
    );
    let zero_width = FindQuery::regex(r"(?m)^|$");
    assert_eq!(document.matches(&zero_width).unwrap().len(), 4);

    let count = document.replace_all(&insensitive, "word").unwrap();
    assert_eq!(count, 2);
    assert_eq!(document.text(), "word word\naba");
    assert!(document.undo());
    assert_eq!(document.text(), "Alpha alpha\naba");
    assert!(document.redo());
    assert_eq!(document.text(), "word word\naba");

    let mut captures = Document::new("name: Ada");
    let capture_query = FindQuery::regex(r"name: (\w+)");
    assert!(
        captures
            .replace_next(&capture_query, "$1", 0, FindDirection::Next)
            .unwrap()
    );
    assert_eq!(captures.text(), "Ada");
    assert!(captures.undo());
    assert_eq!(captures.text(), "name: Ada");
}

#[test]
fn atomic_save_confirms_disk_bytes_before_clearing_dirty_state() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("notes.md");
    fs::write(&path, "before\n").unwrap();
    let mut document = Document::open(&path).unwrap();
    document.set_cursor(document.len_bytes()).unwrap();
    document.insert("after\n").unwrap();
    assert!(document.is_dirty());

    let refused = directory.path().join("refused");
    fs::create_dir(&refused).unwrap();
    assert!(document.save_to(&refused).is_err());
    assert!(document.is_dirty());
    assert_eq!(fs::read_to_string(&path).unwrap(), "before\n");

    document.save().unwrap();
    assert!(!document.is_dirty());
    assert_eq!(fs::read_to_string(&path).unwrap(), "before\nafter\n");
    assert_eq!(Document::open(&path).unwrap().text(), document.text());
}

#[test]
fn invalid_utf8_and_oversize_files_are_refused_without_lossy_decoding() {
    let directory = tempdir().unwrap();
    let binary = directory.path().join("binary.txt");
    fs::write(&binary, b"text\0binary").unwrap();
    assert!(Document::open(binary).is_err());

    let invalid = directory.path().join("invalid.txt");
    fs::write(&invalid, [0xff, 0xfe]).unwrap();
    assert!(Document::open(invalid).is_err());

    let oversize = directory.path().join("oversize.txt");
    let file = fs::File::create(&oversize).unwrap();
    file.set_len(zd::document::MAX_DOCUMENT_BYTES as u64 + 1)
        .unwrap();
    assert!(Document::open(oversize).is_err());
}
