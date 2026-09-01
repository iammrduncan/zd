//! The `zd` desktop shell.
//!
//! This side stays thin on purpose. It is a file, git, and window layer; the
//! product lives in `packages/app/src/`. See
//! `docs/adr/suite/0001-use-tauri-with-portable-web-frontend_H.md`.

mod desktop;
mod dispatch;
mod launch;
pub mod notifications;
mod quick_access;
mod shell;
#[doc(hidden)]
pub mod supervisor;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(problem) = run_from_environment() {
        eprintln!("zd: {problem}");
        std::process::exit(2);
    }
}

fn run_from_environment() -> Result<(), String> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let invocation_directory = launch::invocation_directory_from_environment();
    match dispatch::parse_command(&arguments, &invocation_directory)? {
        dispatch::LaunchMode::Desktop(launch_request) => {
            run_desktop(launch_request);
            Ok(())
        }
        dispatch::LaunchMode::Serve(arguments) => zd_server::run_foreground(arguments),
        dispatch::LaunchMode::WrapperChild => zd_server::run_wrapper_child(),
    }
}

fn run_desktop(launch_request: launch::NativeOpenRequest) {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(supervisor::Supervisor::default())
        .manage(quick_access::QuickAccessState::default())
        .setup(move |app| {
            app.manage(notifications::NotificationState::new(app.handle().clone()));
            desktop::start(
                app.handle().clone(),
                launch_request.path.as_deref().map(std::path::PathBuf::from),
            )
            .map_err(std::io::Error::other)?;
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                desktop::page_started(webview, payload.url());
            }
        })
        .invoke_handler(tauri::generate_handler![
            desktop::take_desktop_bootstrap,
            shell::open_external,
            shell::register_global_summon,
            shell::toggle_quick_access,
            shell::hide_quick_access,
            shell::show_workbench,
            shell::notification_permission,
            shell::notification_request_permission,
            shell::show_thread_notification,
            shell::pending_notification_actions,
            shell::play_completion_sound,
            shell::close_window,
        ])
        /*
         * Never close on the first ask. Vision §6.3's promise is that what you
         * wrote is still there, and a window that obeys a close request cannot
         * keep it — the buffer is in the webview and goes with it.
         *
         * So the shell refuses every close while the frontend listens to Tauri's
         * native close-request event and answers through `close_window` when it is
         * ready, immediately when the current file is clean.
         *
         * The refusal is unconditional on purpose. A shell that closed when it
         * *believed* the current file was clean would be keeping a second copy of a
         * fact it does not own, and that copy is wrong exactly when it matters.
         */
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => api.prevent_close(),
            tauri::WindowEvent::Focused(focused) => {
                quick_access::window_focus_changed(window, *focused);
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building zd");

    app.run(|app_handle, event| {
        if matches!(&event, tauri::RunEvent::Exit) {
            let _ = app_handle.state::<supervisor::Supervisor>().shutdown();
        }

        #[cfg(target_os = "macos")]
        match event {
            tauri::RunEvent::Opened { urls } => {
                if launch::opened_request(&urls).is_none() {
                    return;
                }
                quick_access::show_ordinary(app_handle);
            }
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } => quick_access::show_ordinary(app_handle),
            _ => {}
        }

        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}
