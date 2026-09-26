use std::fs;
use std::path::Path;

use tempfile::tempdir;
use zd::document::{Document, SourceRange};
use zd::review::{AnchorState, MAX_REVIEW_BYTES, ReviewStore};

fn selected(text: &str, range: SourceRange) -> Document {
    let mut document = Document::new(text);
    document.select(range).unwrap();
    document
}

#[test]
fn comments_reopen_and_reanchor_without_guessing_ambiguous_text() {
    let fixture = tempdir().unwrap();
    let original = selected("aa target zz", SourceRange::new(3, 9));
    let mut store = ReviewStore::open(fixture.path()).unwrap();
    let id = store
        .add_comment(Path::new("notes.md"), &original, "check this")
        .unwrap()
        .to_string();
    store.save().unwrap();

    let reopened = ReviewStore::open(fixture.path()).unwrap();
    let comment = reopened.comment(&id).unwrap();
    assert_eq!(
        reopened.resolve(comment, &original),
        AnchorState::Attached(SourceRange::new(3, 9))
    );
    assert_eq!(
        reopened.resolve(comment, &Document::new("aa target zz!")),
        AnchorState::Attached(SourceRange::new(3, 9))
    );
    assert_eq!(
        reopened.resolve(comment, &Document::new("prefix aa target zz")),
        AnchorState::Attached(SourceRange::new(10, 16))
    );
    assert_eq!(
        reopened.resolve(comment, &Document::new("--target--")),
        AnchorState::Attached(SourceRange::new(2, 8))
    );
    assert_eq!(
        reopened.resolve(comment, &Document::new("target target")),
        AnchorState::Detached
    );
    assert_eq!(
        reopened.resolve(comment, &Document::new("deleted")),
        AnchorState::Detached
    );
}

#[test]
fn malformed_oversize_escape_and_failed_write_are_non_destructive() {
    let fixture = tempdir().unwrap();
    fs::create_dir(fixture.path().join(".zd")).unwrap();
    fs::write(fixture.path().join(".zd/review-v1.json"), b"not json").unwrap();
    assert!(ReviewStore::open(fixture.path()).is_err());

    fs::write(
        fixture.path().join(".zd/review-v1.json"),
        vec![b'x'; MAX_REVIEW_BYTES + 1],
    )
    .unwrap();
    assert!(ReviewStore::open(fixture.path()).is_err());

    fs::remove_file(fixture.path().join(".zd/review-v1.json")).unwrap();
    let document = selected("safe", SourceRange::new(0, 4));
    let mut store = ReviewStore::open(fixture.path()).unwrap();
    assert!(
        store
            .add_comment(Path::new("../escape.md"), &document, "no")
            .is_err()
    );
    store
        .add_comment(Path::new("safe.md"), &document, "kept in memory")
        .unwrap();

    fs::create_dir(fixture.path().join(".zd/review-v1.json")).unwrap();
    assert!(store.save().is_err());
    assert!(
        fs::read_dir(fixture.path().join(".zd"))
            .unwrap()
            .all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains(".tmp"))
    );
}

#[test]
fn save_never_removes_or_overwrites_an_existing_temporary_file() {
    let fixture = tempdir().unwrap();
    fs::create_dir(fixture.path().join(".zd")).unwrap();
    let occupied = fixture
        .path()
        .join(format!(".zd/.review-v1.json.{}.tmp", std::process::id()));
    fs::write(&occupied, "owned by another writer").unwrap();
    let document = selected("safe", SourceRange::new(0, 4));
    let mut store = ReviewStore::open(fixture.path()).unwrap();
    store
        .add_comment(Path::new("safe.md"), &document, "comment")
        .unwrap();

    store.save().unwrap();

    assert_eq!(
        fs::read_to_string(occupied).unwrap(),
        "owned by another writer"
    );
    assert!(ReviewStore::open(fixture.path()).unwrap().comments().len() == 1);
}

#[cfg(unix)]
#[test]
fn review_storage_refuses_a_symlinked_control_directory() {
    use std::os::unix::fs::symlink;

    let fixture = tempdir().unwrap();
    let outside = tempdir().unwrap();
    symlink(outside.path(), fixture.path().join(".zd")).unwrap();

    assert!(ReviewStore::open(fixture.path()).is_err());
    assert!(fs::read_dir(outside.path()).unwrap().next().is_none());
}
