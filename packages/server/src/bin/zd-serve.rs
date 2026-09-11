//! Headless foreground host entry point.
//!
//! `zd-serve [<folder>] [--bind <ip>] [--port <port>] [--secret <text>]` runs the
//! same `zd serve` contract from the `zd` console dispatcher, but builds from
//! the `zd-server` crate alone so hosts without the desktop toolchain can still
//! serve a workbench. The terminal keeper re-executes this binary with its
//! private mode argument, so both forms dispatch here.

use std::path::PathBuf;

use zd_host::terminal::{run_terminal_keeper, TERMINAL_KEEPER_ARGUMENT};
use zd_server::{run_foreground, ServeArgs};

fn main() {
    if let Err(problem) = run() {
        eprintln!("zd-serve: {problem}");
        std::process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if arguments
        .first()
        .is_some_and(|argument| argument == TERMINAL_KEEPER_ARGUMENT)
    {
        let state_directory = arguments
            .get(1)
            .filter(|path| arguments.len() == 2 && PathBuf::from(path).is_absolute())
            .map(PathBuf::from)
            .ok_or_else(|| "terminal keeper mode requires one absolute state path".to_string())?;
        #[cfg(unix)]
        {
            return run_terminal_keeper(&state_directory);
        }
        #[cfg(not(unix))]
        {
            let _ = state_directory;
            return Err("the terminal keeper is unavailable on this platform".to_string());
        }
    }
    run_foreground(ServeArgs::parse(&arguments)?)
}
