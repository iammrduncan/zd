use zd_server::{run_foreground, ServeArgs};

fn main() {
    if let Err(problem) = run() {
        eprintln!("zd serve: {problem}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let arguments = ServeArgs::parse(&arguments)?;
    run_foreground(arguments)
}
