use std::fs;
use std::path::Path;

use tempfile::tempdir;
use zd::document::{Document, MAX_DOCUMENT_BYTES};
use zd::image::{
    ClipboardImage, ImageError, MAX_IMAGE_DIMENSION, RgbaImage, encode_png, paste_image,
};
use zd::workspace::Workspace;

struct FakeClipboard(Result<RgbaImage, ImageError>);

impl ClipboardImage for FakeClipboard {
    fn read_image(&mut self) -> Result<RgbaImage, ImageError> {
        self.0
            .as_ref()
            .map(Clone::clone)
            .map_err(|error| ImageError::Unavailable(error.to_string()))
    }
}

fn pixel() -> RgbaImage {
    RgbaImage {
        width: 1,
        height: 1,
        pixels: vec![20, 40, 60, 255],
    }
}

#[test]
fn valid_image_installs_png_reuses_hash_and_inserts_one_undo_group() {
    let fixture = tempdir().unwrap();
    fs::create_dir(fixture.path().join("docs")).unwrap();
    let document_path = fixture.path().join("docs/notes.md");
    fs::write(&document_path, "before\n").unwrap();
    let workspace = Workspace::open(fixture.path()).unwrap();
    let mut document = Document::open(&document_path).unwrap();
    document.set_cursor(document.len_bytes()).unwrap();

    let installed = paste_image(
        &workspace,
        Path::new("docs/notes.md"),
        &mut document,
        &mut FakeClipboard(Ok(pixel())),
        "diagram",
    )
    .unwrap();
    assert!(!installed.reused);
    assert!(installed.relative_path.starts_with("zd-images/"));
    let png = fs::read(fixture.path().join("docs").join(&installed.relative_path)).unwrap();
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    assert!(document.text().contains("![diagram](zd-images/image-"));
    assert!(document.undo());
    assert_eq!(document.text(), "before\n");
    assert!(document.redo());
    assert!(document.text().contains("![diagram](zd-images/image-"));

    let mut another = Document::new("");
    let reused = paste_image(
        &workspace,
        Path::new("docs/notes.md"),
        &mut another,
        &mut FakeClipboard(Ok(pixel())),
        "same",
    )
    .unwrap();
    assert!(reused.reused);
    assert_eq!(reused.relative_path, installed.relative_path);
}

#[test]
fn invalid_pixels_unavailable_clipboard_and_project_escape_do_not_edit() {
    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("notes.md"), "safe").unwrap();
    let workspace = Workspace::open(fixture.path()).unwrap();
    let invalid = RgbaImage {
        width: 2,
        height: 2,
        pixels: vec![0; 15],
    };
    for (path, mut clipboard) in [
        ("notes.md", FakeClipboard(Ok(invalid))),
        (
            "notes.md",
            FakeClipboard(Err(ImageError::Unavailable("headless".into()))),
        ),
        ("../escape.md", FakeClipboard(Ok(pixel()))),
    ] {
        let mut document = Document::new("safe");
        assert!(
            paste_image(
                &workspace,
                Path::new(path),
                &mut document,
                &mut clipboard,
                "image"
            )
            .is_err()
        );
        assert_eq!(document.text(), "safe");
    }
    assert!(!fixture.path().join("zd-images").exists());
}

#[cfg(unix)]
#[test]
fn symlink_collision_write_and_document_failures_leave_no_partial_image() {
    use std::os::unix::fs::symlink;

    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("notes.md"), "").unwrap();
    let workspace = Workspace::open(fixture.path()).unwrap();
    let outside = tempdir().unwrap();
    symlink(outside.path(), fixture.path().join("zd-images")).unwrap();
    let mut document = Document::new("");
    assert!(
        paste_image(
            &workspace,
            Path::new("notes.md"),
            &mut document,
            &mut FakeClipboard(Ok(pixel())),
            "image"
        )
        .is_err()
    );
    assert!(fs::read_dir(outside.path()).unwrap().next().is_none());
    fs::remove_file(fixture.path().join("zd-images")).unwrap();

    let first = paste_image(
        &workspace,
        Path::new("notes.md"),
        &mut document,
        &mut FakeClipboard(Ok(pixel())),
        "image",
    )
    .unwrap();
    let installed_path = fixture.path().join(&first.relative_path);
    fs::write(&installed_path, "collision").unwrap();
    let mut clean = Document::new("");
    assert!(
        paste_image(
            &workspace,
            Path::new("notes.md"),
            &mut clean,
            &mut FakeClipboard(Ok(pixel())),
            "image"
        )
        .is_err()
    );
    assert_eq!(clean.text(), "");

    fs::remove_dir_all(fixture.path().join("zd-images")).unwrap();
    fs::write(fixture.path().join("zd-images"), "not a directory").unwrap();
    assert!(
        paste_image(
            &workspace,
            Path::new("notes.md"),
            &mut clean,
            &mut FakeClipboard(Ok(pixel())),
            "image"
        )
        .is_err()
    );
    fs::remove_file(fixture.path().join("zd-images")).unwrap();
    fs::create_dir(fixture.path().join("zd-images")).unwrap();

    let mut full = Document::new("x".repeat(MAX_DOCUMENT_BYTES));
    full.set_cursor(full.len_bytes()).unwrap();
    assert!(
        paste_image(
            &workspace,
            Path::new("notes.md"),
            &mut full,
            &mut FakeClipboard(Ok(RgbaImage {
                width: 1,
                height: 1,
                pixels: vec![1, 2, 3, 255],
            })),
            "image"
        )
        .is_err()
    );
    assert!(
        fs::read_dir(fixture.path().join("zd-images"))
            .unwrap()
            .next()
            .is_none()
    );
    assert_eq!(full.len_bytes(), MAX_DOCUMENT_BYTES);
}

#[test]
fn dimensions_decoded_length_and_encoded_size_are_bounded() {
    assert!(
        encode_png(&RgbaImage {
            width: 0,
            height: 1,
            pixels: Vec::new(),
        })
        .is_err()
    );
    assert!(
        encode_png(&RgbaImage {
            width: MAX_IMAGE_DIMENSION + 1,
            height: 1,
            pixels: Vec::new(),
        })
        .is_err()
    );
    assert!(
        encode_png(&RgbaImage {
            width: MAX_IMAGE_DIMENSION,
            height: MAX_IMAGE_DIMENSION,
            pixels: Vec::new(),
        })
        .is_err()
    );

    let mut state = 1_u32;
    let mut pixels = vec![0; 2_048 * 2_048 * 4];
    for byte in &mut pixels {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        *byte = state as u8;
    }
    assert!(matches!(
        encode_png(&RgbaImage {
            width: 2_048,
            height: 2_048,
            pixels,
        }),
        Err(ImageError::EncodedTooLarge)
    ));
}
