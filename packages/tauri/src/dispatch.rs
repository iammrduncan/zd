use std::path::Path;

use zd_server::ServeArgs;

use crate::launch::{parse_launch_args, NativeOpenRequest};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LaunchMode {
    Desktop(NativeOpenRequest),
    Serve(ServeArgs),
    WrapperChild,
}

pub(crate) fn parse_command(
    arguments: &[String],
    invocation_directory: &Path,
) -> Result<LaunchMode, String> {
    if arguments
        .first()
        .is_some_and(|argument| argument == "__zd-wrapper-child")
    {
        return if arguments.len() == 1 {
            Ok(LaunchMode::WrapperChild)
        } else {
            Err("wrapper child mode accepts no arguments".to_string())
        };
    }
    if arguments
        .first()
        .is_some_and(|argument| argument == "serve")
    {
        return ServeArgs::parse_in(&arguments[1..], invocation_directory).map(LaunchMode::Serve);
    }
    Ok(LaunchMode::Desktop(parse_launch_args(
        arguments,
        invocation_directory,
    )?))
}

#[cfg(test)]
mod tests {
    use std::net::Ipv4Addr;
    use std::path::PathBuf;

    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    fn cwd() -> PathBuf {
        PathBuf::from("/work/notes")
    }

    #[test]
    fn bare_and_single_path_forms_select_the_desktop() {
        assert_eq!(
            parse_command(&args(&[]), &cwd()).unwrap(),
            LaunchMode::Desktop(NativeOpenRequest { path: None })
        );
        assert_eq!(
            parse_command(&args(&["plan.md"]), &cwd()).unwrap(),
            LaunchMode::Desktop(NativeOpenRequest {
                path: Some("/work/notes/plan.md".to_string()),
            })
        );
    }

    #[test]
    fn serve_is_a_subcommand_but_an_explicit_relative_path_named_serve_is_not() {
        let LaunchMode::Serve(served) = parse_command(&args(&["serve"]), &cwd()).unwrap() else {
            panic!("serve did not select the foreground host");
        };
        assert_eq!(served.project(), cwd());
        assert_eq!(served.bind(), Ipv4Addr::UNSPECIFIED);
        assert_eq!(served.port(), 0);

        assert_eq!(
            parse_command(&args(&["./serve"]), &cwd()).unwrap(),
            LaunchMode::Desktop(NativeOpenRequest {
                path: Some("/work/notes/serve".to_string()),
            })
        );
    }

    #[test]
    fn serve_options_are_parsed_only_in_serve_mode() {
        let LaunchMode::Serve(served) = parse_command(
            &args(&["serve", "project", "--bind", "127.0.0.1", "--port", "4100"]),
            &cwd(),
        )
        .unwrap() else {
            panic!("serve options did not select the foreground host");
        };
        assert_eq!(served.project(), PathBuf::from("/work/notes/project"));
        assert_eq!(served.bind(), Ipv4Addr::LOCALHOST);
        assert_eq!(served.port(), 4_100);

        for invalid in [
            args(&["--bind", "127.0.0.1"]),
            args(&["project", "--port", "4100"]),
            args(&["one", "two"]),
        ] {
            assert!(
                parse_command(&invalid, &cwd()).is_err(),
                "accepted {invalid:?}"
            );
        }
    }

    #[test]
    fn wrapper_child_mode_is_exact_and_has_no_public_options() {
        assert_eq!(
            parse_command(&args(&["__zd-wrapper-child"]), &cwd()).unwrap(),
            LaunchMode::WrapperChild
        );
        assert!(parse_command(&args(&["__zd-wrapper-child", "project"]), &cwd()).is_err());
        assert!(parse_command(&args(&["--wrapper-child"]), &cwd()).is_err());
    }
}
