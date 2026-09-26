use std::fs;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use crossterm::event::{Event, KeyModifiers, MouseButton, MouseEvent, MouseEventKind};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use ratatui::layout::Rect;
use tempfile::tempdir;
use zd::app::App;
use zd::terminal::handle_event;
use zd::ui::{document_content_area, layout, sidebar_content_area};

#[test]
fn pty_quit_restores_every_enabled_terminal_mode() {
    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("README.md"), "# PTY smoke\n").unwrap();
    let pair = NativePtySystem::default()
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .unwrap();
    let original_termios = pair.master.get_termios().unwrap();
    let mut command = CommandBuilder::new(env!("CARGO_BIN_EXE_zd"));
    command.arg(fixture.path().join("README.md"));
    command.env("TERM", "xterm-256color");
    let mut child = pair.slave.spawn_command(command).unwrap();
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().unwrap();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut output = Vec::new();
        reader.read_to_end(&mut output).unwrap();
        tx.send(output).unwrap();
    });

    let mut writer = pair.master.take_writer().unwrap();
    std::thread::sleep(Duration::from_millis(100));
    writer.write_all(&[0x11]).unwrap();
    writer.flush().unwrap();

    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            panic!("zd did not exit after Ctrl-Q");
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let restored_termios = pair.master.get_termios().unwrap();
    drop(writer);
    drop(pair.master);
    let output = rx.recv_timeout(Duration::from_secs(1)).unwrap();

    assert!(status.success());
    assert_eq!(restored_termios, original_termios);
    assert_terminal_sequences(&output);
}

#[test]
fn pty_startup_error_restores_terminal_modes() {
    let fixture = tempdir().unwrap();
    let pair = NativePtySystem::default()
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .unwrap();
    let original_termios = pair.master.get_termios().unwrap();
    let mut command = CommandBuilder::new(env!("CARGO_BIN_EXE_zd"));
    command.arg(fixture.path().join("missing.md"));
    command.env("TERM", "xterm-256color");
    let mut child = pair.slave.spawn_command(command).unwrap();
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().unwrap();

    let status = child.wait().unwrap();
    let restored_termios = pair.master.get_termios().unwrap();
    drop(pair.master);
    let mut output = Vec::new();
    reader.read_to_end(&mut output).unwrap();

    assert!(!status.success());
    assert_eq!(restored_termios, original_termios);
    assert_terminal_sequences(&output);
}

fn assert_terminal_sequences(output: &[u8]) {
    for sequence in [
        b"\x1b[?1049h".as_slice(),
        b"\x1b[?1049l".as_slice(),
        b"\x1b[?2004h".as_slice(),
        b"\x1b[?2004l".as_slice(),
        b"\x1b[?1004h".as_slice(),
        b"\x1b[?1004l".as_slice(),
        b"\x1b[?25l".as_slice(),
        b"\x1b[?25h".as_slice(),
    ] {
        assert!(
            output
                .windows(sequence.len())
                .any(|window| window == sequence),
            "missing terminal sequence {sequence:?} in {output:?}"
        );
    }
}

#[test]
fn constructed_mouse_press_drag_and_release_use_content_coordinates() {
    let fixture = tempdir().unwrap();
    fs::write(fixture.path().join("a.md"), "a界b\n").unwrap();
    fs::write(fixture.path().join("b.md"), "second\n").unwrap();
    let mut app = App::open(fixture.path().join("b.md")).unwrap();
    let area = Rect::new(0, 0, 80, 24);
    let regions = layout(area, &app);
    let tree = sidebar_content_area(regions.tree.unwrap());

    handle_event(
        mouse(MouseEventKind::Down(MouseButton::Left), tree.x, tree.y),
        area,
        &mut app,
    )
    .unwrap();
    assert_eq!(app.active_path().unwrap().to_string_lossy(), "a.md");

    let document = document_content_area(layout(area, &app).document);
    handle_event(
        mouse(
            MouseEventKind::Down(MouseButton::Left),
            document.x + 1,
            document.y,
        ),
        area,
        &mut app,
    )
    .unwrap();
    handle_event(
        mouse(
            MouseEventKind::Drag(MouseButton::Left),
            document.x + 3,
            document.y,
        ),
        area,
        &mut app,
    )
    .unwrap();
    handle_event(
        mouse(
            MouseEventKind::Up(MouseButton::Left),
            document.x + 3,
            document.y,
        ),
        area,
        &mut app,
    )
    .unwrap();
    assert_eq!(app.document().unwrap().selection().start, 1);
    assert_eq!(app.document().unwrap().selection().end, 4);
}

fn mouse(kind: MouseEventKind, column: u16, row: u16) -> Event {
    Event::Mouse(MouseEvent {
        kind,
        column,
        row,
        modifiers: KeyModifiers::NONE,
    })
}
