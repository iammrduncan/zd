use std::path::PathBuf;

use zd_server::ServeArgs;

fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

#[test]
fn one_folder_defaults_to_an_owned_free_loopback_port() {
    let parsed = ServeArgs::parse(&args(&["project"])).expect("parse served folder");

    assert_eq!(parsed.project(), PathBuf::from("project"));
    assert_eq!(parsed.port(), 0);
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
fn missing_extra_and_unbounded_arguments_are_refused() {
    for raw in [
        args(&[]),
        args(&["one", "two"]),
        args(&["project", "--port"]),
        args(&["project", "--port", "not-a-port"]),
        args(&["project", "--host", "0.0.0.0"]),
        args(&["project", "--assets", "/tmp/workspace"]),
    ] {
        assert!(ServeArgs::parse(&raw).is_err(), "accepted {raw:?}");
    }
}
