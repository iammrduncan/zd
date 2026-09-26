use std::process::ExitCode;

use zd::{HELP, Invocation, VERSION, parse_invocation};

fn main() -> ExitCode {
    match parse_invocation(std::env::args_os().skip(1)) {
        Ok(Invocation::Help) => println!("{HELP}"),
        Ok(Invocation::Version) => println!("zd {VERSION}"),
        Ok(Invocation::Open(path)) => {
            println!("zd {VERSION} terminal workbench prototype");
            println!("project: {}", path.display());
        }
        Err(problem) => {
            eprintln!("zd: {problem}\n\n{HELP}");
            return ExitCode::from(2);
        }
    }
    ExitCode::SUCCESS
}
