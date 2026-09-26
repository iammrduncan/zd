use std::collections::BTreeSet;
use std::fs;
use std::process::Command;

fn zd() -> Command {
    Command::new(env!("CARGO_BIN_EXE_zd"))
}

fn control_keys(text: &str) -> BTreeSet<&str> {
    text.match_indices("Ctrl-")
        .filter_map(|(offset, _)| text.get(offset..offset + 6))
        .filter(|key| key.as_bytes()[5].is_ascii_uppercase())
        .collect()
}

#[test]
fn help_names_the_native_terminal_workbench() {
    let output = zd().arg("--help").output().expect("run zd --help");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("help is UTF-8");
    assert!(stdout.contains("native terminal workbench"));
    assert!(stdout.contains("Usage: zd [PATH]"));
    assert!(!stdout.contains("serve"));
    let reference = fs::read_to_string(format!("{}/docs/REFERENCE.md", env!("CARGO_MANIFEST_DIR")))
        .expect("read key reference");
    for binding in zd::app::bindings() {
        assert!(
            stdout.contains(binding.key),
            "help is missing the {} binding {}",
            binding.label,
            binding.key
        );
        assert!(
            reference.contains(binding.key),
            "reference is missing the {} binding {}",
            binding.label,
            binding.key
        );
    }
    let registered_controls = zd::app::bindings()
        .iter()
        .map(|binding| binding.key)
        .filter(|key| key.starts_with("Ctrl-"))
        .collect();
    assert_eq!(control_keys(&stdout), registered_controls);
    assert_eq!(control_keys(&reference), registered_controls);
}

#[test]
fn version_is_the_v1_prototype_version() {
    let output = zd().arg("--version").output().expect("run zd --version");
    assert!(output.status.success());
    assert_eq!(output.stdout, b"zd 1.0.1\n");
}

#[test]
fn launch_smoke_reports_the_selected_project() {
    let output = zd().arg("sample-project").output().expect("launch zd");
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let stdout = String::from_utf8(output.stdout).expect("launch output is UTF-8");
    assert!(stdout.contains("terminal workbench prototype"));
    assert!(stdout.contains("project: sample-project"));
}
