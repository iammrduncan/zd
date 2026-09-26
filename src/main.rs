use std::io::{self, IsTerminal};
use std::process::ExitCode;

use zd::{HELP, Invocation, VERSION, parse_invocation, terminal};

fn main() -> ExitCode {
    match parse_invocation(std::env::args_os().skip(1)) {
        Ok(Invocation::Help) => println!("{HELP}"),
        Ok(Invocation::Version) => println!("zd {VERSION}"),
        Ok(Invocation::Open(path)) => {
            if io::stdin().is_terminal() && io::stdout().is_terminal() {
                if let Err(problem) = terminal::run(&path) {
                    eprintln!("zd: {problem}");
                    return ExitCode::FAILURE;
                }
            } else {
                println!("zd {VERSION} terminal workbench prototype");
                println!("project: {}", path.display());
            }
        }
        Err(problem) => {
            eprintln!("zd: {problem}\n\n{HELP}");
            return ExitCode::from(2);
        }
    }
    ExitCode::SUCCESS
}
