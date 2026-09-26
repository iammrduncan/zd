use std::fs;
use std::path::Path;

use tempfile::tempdir;
use zd::workspace::{EntryKind, Workspace};

fn write(path: &Path, contents: impl AsRef<[u8]>) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

#[test]
fn tree_is_ignore_aware_ordered_collapsible_and_bounded() {
    let fixture = tempdir().unwrap();
    write(
        &fixture.path().join(".gitignore"),
        "ignored.txt\nignored-dir/\n",
    );
    write(&fixture.path().join("alpha/a.txt"), "needle\n");
    write(&fixture.path().join("zeta/z.txt"), "other\n");
    write(&fixture.path().join("root.txt"), "needle root\n");
    write(&fixture.path().join("ignored.txt"), "needle ignored\n");
    write(
        &fixture.path().join("ignored-dir/no.txt"),
        "needle ignored\n",
    );
    write(&fixture.path().join(".hidden"), "needle hidden\n");

    let mut workspace = Workspace::open(fixture.path()).unwrap();
    let collapsed = workspace.tree_with_limit(20);
    let visible = collapsed
        .entries
        .iter()
        .map(|entry| (entry.path.to_string_lossy().into_owned(), entry.kind))
        .collect::<Vec<_>>();
    assert_eq!(
        visible,
        vec![
            ("alpha".into(), EntryKind::Directory),
            ("zeta".into(), EntryKind::Directory),
            ("root.txt".into(), EntryKind::File),
        ]
    );

    workspace.toggle_directory(Path::new("alpha")).unwrap();
    let expanded = workspace.tree_with_limit(20);
    assert_eq!(
        expanded
            .entries
            .iter()
            .map(|entry| entry.path.to_string_lossy().into_owned())
            .collect::<Vec<_>>(),
        ["alpha", "alpha/a.txt", "zeta", "root.txt"]
    );
    let capped = workspace.tree_with_limit(2);
    assert_eq!(capped.entries.len(), 2);
    assert!(capped.truncated);
}

#[test]
fn search_shares_scope_policy_skips_unsupported_content_and_sanitizes_preview() {
    let fixture = tempdir().unwrap();
    write(&fixture.path().join(".gitignore"), "ignored.txt\n");
    write(
        &fixture.path().join("src/a.txt"),
        "first needle\ncontrol \u{1b}[31m needle\n",
    );
    write(&fixture.path().join("b.txt"), "needle b\n");
    write(&fixture.path().join("ignored.txt"), "needle ignored\n");
    write(&fixture.path().join("binary.bin"), b"needle\0binary");
    write(
        &fixture.path().join("invalid.txt"),
        [0xff, b'n', b'e', b'e', b'd', b'l', b'e'],
    );
    let oversize = fixture.path().join("oversize.txt");
    fs::File::create(&oversize)
        .unwrap()
        .set_len(zd::document::MAX_DOCUMENT_BYTES as u64 + 1)
        .unwrap();

    #[cfg(unix)]
    std::os::unix::fs::symlink(
        fixture.path().join("src"),
        fixture.path().join("linked-src"),
    )
    .unwrap();

    let workspace = Workspace::open(fixture.path()).unwrap();
    let tree_paths = workspace
        .tree()
        .entries
        .iter()
        .map(|entry| entry.path.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    assert!(tree_paths.contains(&"binary.bin".to_string()));
    assert!(tree_paths.contains(&"invalid.txt".to_string()));
    assert!(tree_paths.contains(&"oversize.txt".to_string()));
    assert!(!tree_paths.iter().any(|path| path.contains("ignored")));
    assert!(!tree_paths.iter().any(|path| path.contains("linked-src")));

    let results = workspace.search_with_limit("needle", true, 20).unwrap();
    assert_eq!(
        results
            .matches
            .iter()
            .map(|hit| (hit.path.to_string_lossy().into_owned(), hit.line))
            .collect::<Vec<_>>(),
        [
            ("b.txt".into(), 1),
            ("src/a.txt".into(), 1),
            ("src/a.txt".into(), 2)
        ]
    );
    assert!(
        results
            .matches
            .iter()
            .all(|hit| !hit.preview.contains('\u{1b}'))
    );
    assert!(!results.truncated);

    let capped = workspace.search_with_limit("needle", true, 1).unwrap();
    assert_eq!(capped.matches.len(), 1);
    assert!(capped.truncated);
    assert!(workspace.resolve(Path::new("../outside")).is_err());
    #[cfg(unix)]
    assert!(workspace.resolve(Path::new("linked-src/a.txt")).is_err());
}
