use std::path::PathBuf;

use zd_host::{
    ClipboardImageMediaType, ClipboardImageRequest, FileTreeCreationKind, FileTreeMutationRequest,
    FileTreeMutationResult, HostService, ResourceRef,
};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock is after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-host-file-{name}-{stamp}"));
        std::fs::create_dir_all(&path).expect("create scratch directory");
        Self(path)
    }

    fn join(&self, relative: &str) -> PathBuf {
        self.0.join(relative)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn scope(host: &HostService, relative_path: &str) -> ResourceRef {
    let project = host.project_grants().remove(0);
    ResourceRef {
        project_id: project.id,
        worktree_id: project.worktrees[0].id.clone(),
        relative_path: relative_path.to_string(),
    }
}

#[test]
fn text_listing_stamp_and_project_images_share_host_grant_authority() {
    let scratch = Scratch::new("basic");
    std::fs::create_dir(scratch.join("docs")).expect("create docs");
    std::fs::write(scratch.join("notes.md"), "before\n").expect("write fixture");
    std::fs::write(scratch.join("docs/ignored.txt"), "ignored\n").expect("write ignored file");
    let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
    std::fs::write(scratch.join("docs/figure.png"), png).expect("write image");
    let host = HostService::open_project(&scratch.0).expect("approve project");
    let notes = scope(&host, "notes.md");

    let listing = host
        .workspace_files(&notes.project_id, &notes.worktree_id)
        .expect("list workspace files");
    assert_eq!(
        listing
            .files
            .iter()
            .map(|file| file.relative.as_str())
            .collect::<Vec<_>>(),
        vec!["notes.md"]
    );
    assert_eq!(host.read_text_file(&notes).expect("read text"), "before\n");
    let before = host
        .file_stamp(&notes)
        .expect("stamp file")
        .expect("file exists");

    host.write_text_file(&notes, "after\n").expect("write text");

    assert_eq!(
        std::fs::read_to_string(scratch.join("notes.md")).unwrap(),
        "after\n"
    );
    let after = host
        .file_stamp(&notes)
        .expect("stamp file")
        .expect("file exists");
    assert_eq!(after.length, 6);
    assert_ne!(before.length, after.length);
    let image = host
        .read_project_image(&scope(&host, "docs/figure.png"))
        .expect("read project image");
    assert_eq!(image.media_type, "image/png");
    assert_eq!(image.bytes, png);

    let mut outside = notes;
    outside.project_id = "project-unapproved".to_string();
    assert!(host.write_text_file(&outside, "escape").is_err());
}

#[test]
fn writes_are_bounded_and_preserve_existing_permissions() {
    let scratch = Scratch::new("write-bounds");
    let path = scratch.join("notes.md");
    std::fs::write(&path, "old").expect("write fixture");
    let host = HostService::open_project(&scratch.0).expect("approve project");
    let notes = scope(&host, "notes.md");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640))
            .expect("set fixture permissions");
    }
    host.write_text_file(&notes, "replacement")
        .expect("replace document");
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;

        assert_eq!(std::fs::metadata(&path).unwrap().mode() & 0o777, 0o640);
    }

    let oversized = "x".repeat(8 * 1024 * 1024 + 1);
    assert!(host.write_text_file(&notes, &oversized).is_err());
    assert_eq!(std::fs::read_to_string(path).unwrap(), "replacement");
}

#[test]
fn image_validation_refuses_unknown_and_oversized_files() {
    let scratch = Scratch::new("image-bounds");
    std::fs::write(scratch.join("figure.svg"), "<svg/>").expect("write unsupported image");
    let large = std::fs::File::create(scratch.join("large.png")).expect("create large image");
    large
        .set_len(16 * 1024 * 1024 + 1)
        .expect("extend sparse image");
    let host = HostService::open_project(&scratch.0).expect("approve project");

    assert!(host
        .read_project_image(&scope(&host, "figure.svg"))
        .is_err());
    assert!(host.read_project_image(&scope(&host, "large.png")).is_err());
}

#[test]
fn file_tree_mutations_commit_only_inside_the_active_grant() {
    let scratch = Scratch::new("mutations");
    std::fs::create_dir(scratch.join("docs")).expect("create docs");
    let host = HostService::open_project(&scratch.0).expect("approve project");
    let resource = scope(&host, "docs/notes.md");
    let create = FileTreeMutationRequest::Create {
        project_id: resource.project_id.clone(),
        worktree_id: resource.worktree_id.clone(),
        relative_path: resource.relative_path.clone(),
        kind: FileTreeCreationKind::File,
    };
    assert_eq!(
        host.mutate_file_tree(create),
        FileTreeMutationResult::Committed
    );
    assert!(scratch.join("docs/notes.md").is_file());

    let denied = FileTreeMutationRequest::Create {
        project_id: "project-unapproved".to_string(),
        worktree_id: resource.worktree_id,
        relative_path: "outside.md".to_string(),
        kind: FileTreeCreationKind::File,
    };
    assert!(matches!(
        host.mutate_file_tree(denied),
        FileTreeMutationResult::Refused { .. }
    ));
    assert!(!scratch.join("outside.md").exists());
}

#[test]
fn clipboard_images_use_a_fixed_grant_scoped_destination() {
    let scratch = Scratch::new("clipboard");
    let host = HostService::open_project(&scratch.0).expect("approve project");
    let resource = scope(&host, "unused");
    let png = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
    let request = ClipboardImageRequest {
        project_id: resource.project_id.clone(),
        worktree_id: resource.worktree_id.clone(),
        media_type: ClipboardImageMediaType::Png,
        bytes: png.clone(),
    };
    let saved = host
        .save_clipboard_image(&request)
        .expect("save clipboard image");
    assert!(saved
        .relative_path
        .starts_with("docs/screenshots/screenshot-"));
    assert_eq!(
        std::fs::read(scratch.join(&saved.relative_path)).unwrap(),
        png
    );

    let denied = ClipboardImageRequest {
        project_id: "project-unapproved".to_string(),
        ..request
    };
    assert!(host.save_clipboard_image(&denied).is_err());
}
