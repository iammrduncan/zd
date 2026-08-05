//! The `zd` desktop shell.
//!
//! This side stays thin on purpose. It is a file, git, and window layer; the
//! product lives in `packages/app/src/`. See docs/path-forward.md.

mod cli;
mod fs;

use tauri::{Emitter, Manager};

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

/// Accept the queued Finder request and move the filesystem boundary with it.
#[tauri::command]
fn accept_open_request(launch: tauri::State<'_, cli::LaunchState>) -> Option<cli::LaunchRequest> {
    launch.accept_pending()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    /*
     * The launch request and filesystem scope are one native state — audit M2.
     * A CLI launch settles both before the webview exists. A Finder request is
     * queued here and only accepted after the document says switching is safe;
     * accepting moves both facts under one lock, so the old document never gains
     * access to the new folder and never loses access while it is still unsaved.
     */
    let launch = cli::LaunchState::new(cli::launch_from_environment());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(launch)
        .invoke_handler(tauri::generate_handler![
            cli::launch_request,
            has_pending_open_request,
            accept_open_request,
            fs::read_text_file,
            fs::workspace_files,
            fs::write_text_file,
            fs::file_stamp,
            fs::open_external,
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
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building zd");

    app.run(|app_handle, event| {
        let tauri::RunEvent::Opened { urls } = event else {
            return;
        };
        let Some(request) = cli::opened_request(&urls) else {
            return;
        };

        app_handle.state::<cli::LaunchState>().queue(request);
        let _ = app_handle.emit("open-requested", ());
    });
}
