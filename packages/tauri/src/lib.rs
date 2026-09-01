//! The `zd` desktop shell.
//!
//! The workbench host runs in one supervised child of this process. This crate
//! owns CLI dispatch, child lifecycle, and viewing-computer behavior; filesystem,
//! Git, persistence, watcher, diagnostic, and terminal work stays in `zd-host`.

mod desktop;
mod dispatch;
mod executables;
mod installed_smoke;
mod launch;
pub mod notifications;
mod quick_access;
mod shell;
mod single_instance;
#[doc(hidden)]
pub mod supervisor;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    run_desktop();
}

pub fn run_console() {
    if let Err(problem) = run_console_from_environment() {
        eprintln!("zd: {problem}");
        std::process::exit(2);
    }
}

pub fn run_desktop() {
    if let Err(problem) = run_desktop_from_environment() {
        eprintln!("zd: {problem}");
        std::process::exit(2);
    }
}

fn run_console_from_environment() -> Result<(), String> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let invocation_directory = launch::invocation_directory_from_environment();
    match dispatch::parse_command(&arguments, &invocation_directory)? {
        dispatch::LaunchMode::Desktop(launch_request) => launch_desktop(launch_request),
        dispatch::LaunchMode::Serve(arguments) => zd_server::run_foreground(arguments),
        dispatch::LaunchMode::WrapperChild => zd_server::run_wrapper_child(),
    }
}

fn run_desktop_from_environment() -> Result<(), String> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let invocation_directory = launch::invocation_directory_from_environment();
    let installed_smoke = installed_smoke::InstalledSmoke::from_environment()?;
    match dispatch::parse_command(&arguments, &invocation_directory)? {
        dispatch::LaunchMode::Desktop(launch_request) => {
            run_desktop_app(launch_request, installed_smoke);
            Ok(())
        }
        dispatch::LaunchMode::Serve(_) | dispatch::LaunchMode::WrapperChild => {
            Err("zd-desktop accepts only an optional desktop path".to_string())
        }
    }
}

fn launch_desktop(launch_request: launch::NativeOpenRequest) -> Result<(), String> {
    let executable = executables::desktop_for_console()?;
    let mut command = std::process::Command::new(executable);
    if let Some(path) = launch_request.path {
        command.arg(path);
    }
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| "the desktop application could not start".to_string())
}

fn run_desktop_app(
    launch_request: launch::NativeOpenRequest,
    installed_smoke: installed_smoke::InstalledSmoke,
) {
    let setup_smoke = installed_smoke.clone();
    let app = tauri::Builder::default()
        .plugin(single_instance::plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(supervisor::Supervisor::default())
        .manage(installed_smoke)
        .manage(shell::OpenIntentState::default())
        .manage(quick_access::QuickAccessState::default())
        .setup(move |app| {
            setup_smoke.install(app.handle());
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
            shell::choose_project,
            shell::recover_project_grant,
            shell::has_pending_open_request,
            shell::pending_open_request,
            shell::accept_open_request,
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
         * A ready workbench owns its dirty-buffer decision, so its first close
         * request is deferred to the frontend and completed through `close_window`.
         * Before readiness there is no workbench buffer to protect. After child
         * exit the shell commands deliberately refuse the disconnected page, and
         * the child has already been reaped, so an explicit native close may exit.
         */
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let phase = window
                    .app_handle()
                    .state::<supervisor::Supervisor>()
                    .snapshot()
                    .phase;
                if desktop::should_prevent_close(phase) {
                    api.prevent_close();
                }
            }
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
                let Some(request) = launch::opened_request(&urls) else {
                    return;
                };
                if let Some(path) = request.path.as_deref() {
                    shell::queue_native_open(app_handle, std::path::Path::new(path));
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
