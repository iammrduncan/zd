//! Core entry contract for the `zd` terminal workbench.

pub mod app;
pub mod document;
pub mod handoff;
pub mod image;
pub mod markdown;
pub mod review;
pub mod terminal;
pub mod ui;
pub mod workspace;

use std::ffi::OsString;
use std::path::PathBuf;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub const HELP: &str = "zd — native terminal workbench\n\nUsage: zd [PATH]\n       zd --help\n       zd --version\n\nOpen PATH, or the current directory when PATH is omitted.\n\nKeys:\n  Tab        Focus files/document\n  Ctrl-B     Show or hide files\n  Ctrl-P     Search the project\n  Ctrl-F/E   Find or replace\n  Ctrl-S     Save\n  Ctrl-Z/Y   Undo or redo\n  Ctrl-R     Read or edit Markdown\n  Ctrl-N/L   Add or list review comments\n  Ctrl-G     Preview an agent handoff\n  Ctrl-U     Paste a clipboard image\n  Ctrl-Q     Quit";

#[derive(Debug, PartialEq, Eq)]
pub enum Invocation {
    Help,
    Version,
    Open(PathBuf),
}

pub fn parse_invocation(
    arguments: impl IntoIterator<Item = OsString>,
) -> Result<Invocation, String> {
    let mut arguments = arguments.into_iter();
    let Some(first) = arguments.next() else {
        return Ok(Invocation::Open(PathBuf::from(".")));
    };

    if arguments.next().is_some() {
        return Err("zd accepts at most one path".to_string());
    }

    match first.to_str() {
        Some("-h" | "--help") => Ok(Invocation::Help),
        Some("-V" | "--version") => Ok(Invocation::Version),
        Some(option) if option.starts_with('-') => Err(format!("unknown option: {option}")),
        _ => Ok(Invocation::Open(PathBuf::from(first))),
    }
}

#[cfg(test)]
mod tests {
    use super::{Invocation, parse_invocation};
    use std::ffi::OsString;
    use std::path::PathBuf;

    #[test]
    fn no_argument_opens_the_current_directory() {
        assert_eq!(
            parse_invocation(Vec::<OsString>::new()),
            Ok(Invocation::Open(PathBuf::from(".")))
        );
    }

    #[test]
    fn one_path_is_preserved_as_an_os_string() {
        assert_eq!(
            parse_invocation([OsString::from("notes/readme.md")]),
            Ok(Invocation::Open(PathBuf::from("notes/readme.md")))
        );
    }

    #[test]
    fn options_and_extra_paths_are_refused() {
        assert_eq!(
            parse_invocation([OsString::from("--serve")]),
            Err("unknown option: --serve".to_string())
        );
        assert_eq!(
            parse_invocation([OsString::from("one"), OsString::from("two")]),
            Err("zd accepts at most one path".to_string())
        );
    }
}
