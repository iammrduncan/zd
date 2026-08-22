//! The `zd` desktop shell.
//!
//! This side stays thin on purpose. It is a file, git, and window layer; the
//! product lives in `packages/app/src/`. See suite ADR 0001.

mod cli;
mod file_tree;
mod fs;
mod git;
#[path = "git/process.rs"]
mod git_process;
mod grants;
pub mod instrumentation;
pub mod notifications;
mod projects;
mod quick_access;
pub mod terminal;
mod terminal_runtime;
mod themes;
mod worktrees;

#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::Manager;

/// Close the window, having been told it is safe to.
///
/// The counterpart of the refusal below. Only the frontend knows whether there is
/// unsaved work, so the shell never closes on its own — it asks, and this is the
/// answer coming back.
#[tauri::command]
fn close_window(window: tauri::Window) -> Result<(), String> {
    window.destroy().map_err(|error| error.to_string())
}

/// Whether macOS has delivered a file-open request that the document has not
/// accepted yet. This closes the small race between the native event and the
/// webview installing its listener.
#[tauri::command]
fn has_pending_open_request(launch: tauri::State<'_, cli::LaunchState>) -> bool {
    launch.has_pending()
}

/// Accept the queued Finder request after the current work says switching is safe.
#[tauri::command]
fn accept_open_request(launch: tauri::State<'_, cli::LaunchState>) -> Option<cli::LaunchRequest> {
    launch.accept_pending()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    /*
     * Native launch/open events add project grants before the webview sees their
     * opaque identities. Accepting a queued request changes only active context;
     * earlier grants stay valid so inactive dirty work is not stranded.
     */
    let launch = cli::LaunchState::new(cli::launch_from_environment());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(launch)
        .manage(quick_access::QuickAccessState::default())
        .manage(terminal_runtime::TerminalState::default())
        .setup(|app| {
            app.manage(notifications::NotificationState::new(app.handle().clone()));
            let directory = app.path().app_config_dir()?.join("diagnostics");
            let diagnostics =
                instrumentation::DiagnosticState::new(directory, env!("CARGO_PKG_VERSION"))
                    .map_err(std::io::Error::other)?;
            app.manage(diagnostics);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cli::launch_request,
            cli::project_grants,
            projects::choose_project,
            projects::recover_project_grant,
            cli::pending_open_request,
            cli::remove_project_grant,
            has_pending_open_request,
            accept_open_request,
            file_tree::file_tree_snapshot,
            git::git_status,
            git::git_history_page,
            git::git_compare,
            git::git_diff,
            worktrees::create_thread_worktree,
            fs::read_text_file,
            fs::read_bounded_file,
            fs::workspace_files,
            fs::write_text_file,
            fs::file_stamp,
            fs::open_external,
            themes::theme_config_files,
            quick_access::register_global_summon,
            quick_access::toggle_quick_access,
            quick_access::hide_quick_access,
            quick_access::show_workbench,
            notifications::notification_permission,
            notifications::notification_request_permission,
            notifications::show_thread_notification,
            notifications::pending_notification_actions,
            notifications::play_completion_sound,
            instrumentation::runtime::diagnostics_status,
            instrumentation::runtime::enable_diagnostics,
            instrumentation::runtime::disable_diagnostics,
            instrumentation::runtime::record_diagnostic,
            instrumentation::runtime::reveal_diagnostics,
            terminal_runtime::terminal_start,
            terminal_runtime::terminal_write,
            terminal_runtime::terminal_resize,
            terminal_runtime::terminal_read,
            terminal_runtime::terminal_poll_exit,
            terminal_runtime::terminal_terminate,
            terminal_runtime::terminal_dispose,
            close_window,
        ])
        /*
         * Never close on the first ask. Vision §6.3's promise is that what you
         * wrote is still there, and a window that obeys a close request cannot
         * keep it — the buffer is in the webview and goes with it.
         *
         * So the shell refuses every close while the frontend listens to Tauri's
         * native close-request event and answers through `close_window` when it is
         * ready, immediately when the document is clean.
         *
         * The refusal is unconditional on purpose. A shell that closed when it
         * *believed* the document was clean would be keeping a second copy of a
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
            app_handle
                .state::<instrumentation::DiagnosticState>()
                .shutdown();
            app_handle
                .state::<terminal_runtime::TerminalState>()
                .shutdown();
        }

        #[cfg(target_os = "macos")]
        match event {
            tauri::RunEvent::Opened { urls } => {
                let Some(request) = cli::opened_request(&urls) else {
                    return;
                };
                app_handle.state::<cli::LaunchState>().queue(request);
                quick_access::show_ordinary(app_handle);
                let _ = app_handle.emit("open-requested", ());
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
