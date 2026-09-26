use std::process::Command;

fn zd() -> Command {
    Command::new(env!("CARGO_BIN_EXE_zd"))
}

#[test]
fn help_names_the_native_terminal_workbench() {
    let output = zd().arg("--help").output().expect("run zd --help");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("help is UTF-8");
    assert!(stdout.contains("native terminal workbench"));
    assert!(stdout.contains("Usage: zd [PATH]"));
    assert!(!stdout.contains("serve"));
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
