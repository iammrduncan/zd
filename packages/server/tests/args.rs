use std::net::Ipv4Addr;
use std::path::PathBuf;

use zd_server::ServeArgs;

fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

#[test]
fn one_folder_defaults_to_an_owned_free_network_listener() {
    let parsed = ServeArgs::parse(&args(&["project"])).expect("parse served folder");

    assert_eq!(parsed.project(), PathBuf::from("project"));
    assert_eq!(parsed.bind(), Ipv4Addr::UNSPECIFIED);
    assert_eq!(parsed.port(), 0);
}

#[test]
fn an_explicit_numeric_bind_is_structured_and_order_independent() {
    for raw in [
        args(&["project", "--bind", "100.80.233.115"]),
        args(&["--bind", "100.80.233.115", "project"]),
    ] {
        let parsed = ServeArgs::parse(&raw).expect("parse explicit bind");
        assert_eq!(parsed.project(), PathBuf::from("project"));
        assert_eq!(parsed.bind(), Ipv4Addr::new(100, 80, 233, 115));
    }
}

#[test]
fn an_explicit_port_is_structured_and_order_independent() {
    for raw in [
        args(&["project", "--port", "49151"]),
        args(&["--port", "49151", "project"]),
    ] {
        let parsed = ServeArgs::parse(&raw).expect("parse explicit port");
        assert_eq!(parsed.project(), PathBuf::from("project"));
        assert_eq!(parsed.port(), 49_151);
    }
}

#[test]
fn a_trusted_caller_can_select_an_isolated_state_directory() {
    let parsed = ServeArgs::parse(&args(&[
        "project",
        "--state-dir",
        "/tmp/zd-state",
        "--port",
        "49151",
    ]))
    .expect("parse isolated state directory");

    assert_eq!(
        parsed.state_directory(),
        Some(PathBuf::from("/tmp/zd-state").as_path())
    );
}

#[test]
fn missing_extra_and_unbounded_arguments_are_refused() {
    for raw in [
        args(&[]),
        args(&["one", "two"]),
        args(&["project", "--port"]),
        args(&["project", "--port", "not-a-port"]),
        args(&["project", "--bind"]),
        args(&["project", "--bind", "remote.example"]),
        args(&["project", "--bind", "100.80.233.115", "--bind", "127.0.0.1"]),
        args(&["project", "--host", "0.0.0.0"]),
        args(&["project", "--assets", "/tmp/workspace"]),
        args(&["project", "--state-dir"]),
    ] {
        assert!(ServeArgs::parse(&raw).is_err(), "accepted {raw:?}");
    }
}
