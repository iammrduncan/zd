use std::fs;
use std::path::{Path, PathBuf};

fn markdown_files(directory: &Path, files: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(directory).expect("read documentation directory") {
        let path = entry.expect("read documentation entry").path();
        if path.is_dir() {
            markdown_files(&path, files);
        } else if path.extension().is_some_and(|extension| extension == "md") {
            files.push(path);
        }
    }
}

fn local_links(contents: &str) -> impl Iterator<Item = &str> {
    contents.split("](").skip(1).filter_map(|tail| {
        let target = tail.split(')').next()?.trim().trim_matches(['<', '>']);
        (!target.is_empty()
            && !target.starts_with('#')
            && !target.contains("://")
            && !target.starts_with("mailto:"))
        .then_some(target)
    })
}

#[test]
fn current_markdown_links_resolve_inside_the_repository() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = vec![
        root.join("README.md"),
        root.join("CONTRIBUTING.md"),
        root.join("CHANGELOG.md"),
    ];
    markdown_files(&root.join("docs"), &mut files);

    let mut broken = Vec::new();
    for file in files {
        let contents = fs::read_to_string(&file).expect("read Markdown file");
        for target in local_links(&contents) {
            let path = target.split('#').next().expect("link path");
            let resolved = file.parent().expect("Markdown parent").join(path);
            if !resolved.exists() {
                broken.push(format!("{}: {target}", file.display()));
            }
        }
    }

    assert_eq!(broken, Vec::<String>::new());
}

#[test]
fn current_ci_builds_only_the_native_rust_product() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let workflow = fs::read_to_string(root.join(".github/workflows/ci.yml"))
        .expect("read current CI workflow")
        .to_ascii_lowercase();

    for retired_surface in ["npm", "vite", "playwright", "tauri", "v0/"] {
        assert!(
            !workflow.contains(retired_surface),
            "current workflow contains retired surface {retired_surface}"
        );
    }
    assert!(workflow.contains("cargo test --locked"));
    assert!(workflow.contains("cargo build --release --locked"));
}

#[test]
fn dev_helper_requires_a_linker_before_using_the_native_toolchain() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let helper = fs::read_to_string(root.join("scripts/dev-container.sh"))
        .expect("read development container helper");

    assert!(
        helper
            .contains("command -v cargo >/dev/null 2>&1 \\\n    && command -v cc >/dev/null 2>&1"),
        "the helper must not select native Cargo without a linker"
    );
}
