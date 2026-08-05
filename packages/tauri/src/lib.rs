//! The `zd` desktop shell.
//!
//! This side stays thin on purpose. It is a file, git, and window layer; the
//! product lives in `packages/app/src/`. See docs/path-forward.md.

mod cli;
mod fs;

/// Close the window, having been told it is safe to.
///
/// The counterpart of the refusal below. Only the frontend knows whether there is
/// unsaved work, so the shell never closes on its own — it asks, and this is the
/// answer coming back.
#[tauri::command]
fn close_window(window: tauri::Window) -> Result<(), String> {
    window.destroy().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    /*
     * The filesystem scope, settled before the webview exists — audit finding M2.
     *
     * Read from the command line here rather than from `launch_request`, and the
     * difference is the whole point: `launch_request` is a command the *frontend*
     * calls, so a compromised webview could simply never call it, or call it twice.
     * A trust boundary the untrusted side can move is not one. This is the same
     * `parse_args` answer the frontend will be given, taken independently.
     */
    let scope = fs::Scope(
        cli::launch_request()
            .path
            .map(|path| fs::scope_for(std::path::Path::new(&path))),
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(scope)
        .invoke_handler(tauri::generate_handler![
            cli::launch_request,
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
        .run(tauri::generate_context!())
        .expect("error while running zd");
}
