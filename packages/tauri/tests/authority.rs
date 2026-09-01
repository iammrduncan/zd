const LIBRARY: &str = include_str!("../src/lib.rs");
const LOCAL_CAPABILITY: &str = include_str!("../capabilities/default.json");
const SHELL_PERMISSIONS: &str = include_str!("../permissions/desktop-bootstrap.toml");

const RETIRED_HOST_COMMANDS: &[&str] = &[
    "apply_durable_state",
    "create_thread_worktree",
    "describe_durable_state",
    "diagnostics_status",
    "disable_diagnostics",
    "enable_diagnostics",
    "file_stamp",
    "file_tree_snapshot",
    "git_compare",
    "git_diff",
    "git_history_page",
    "git_status",
    "launch_request",
    "mutate_file_tree",
    "project_grants",
    "read_bounded_file",
    "read_project_image",
    "read_text_file",
    "record_diagnostic",
    "remove_project_grant",
    "reveal_diagnostics",
    "save_clipboard_image",
    "start_file_tree_watch",
    "stop_file_tree_watch",
    "terminal_dispose",
    "terminal_poll_exit",
    "terminal_read",
    "terminal_resize",
    "terminal_start",
    "terminal_terminate",
    "terminal_write",
    "theme_config_files",
    "workspace_files",
    "write_text_file",
];

fn invoke_handler_source() -> &'static str {
    LIBRARY
        .split_once(".invoke_handler(tauri::generate_handler![")
        .expect("desktop invoke handler")
        .1
        .split_once("])")
        .expect("end of desktop invoke handler")
        .0
}

#[test]
fn migrated_host_authority_is_absent_from_tauri_registration_and_permissions() {
    let handler = invoke_handler_source();

    for command in RETIRED_HOST_COMMANDS {
        assert!(
            !handler.contains(command),
            "{command} is still registered in the Tauri invoke handler"
        );
        assert!(
            !SHELL_PERMISSIONS.contains(command),
            "{command} is still allowed by the desktop shell permission"
        );
    }
}

#[test]
fn registered_custom_commands_are_only_bootstrap_and_viewing_computer_shell() {
    let handler = invoke_handler_source();

    for command in [
        "desktop::take_desktop_bootstrap",
        "shell::accept_open_request",
        "shell::choose_project",
        "shell::close_window",
        "shell::has_pending_open_request",
        "shell::hide_quick_access",
        "shell::notification_permission",
        "shell::notification_request_permission",
        "shell::open_external",
        "shell::pending_open_request",
        "shell::pending_notification_actions",
        "shell::play_completion_sound",
        "shell::register_global_summon",
        "shell::recover_project_grant",
        "shell::show_thread_notification",
        "shell::show_workbench",
        "shell::toggle_quick_access",
    ] {
        assert!(handler.contains(command), "{command} is not registered");
    }
}

#[test]
fn the_local_startup_page_can_only_listen_for_native_status() {
    let capability: serde_json::Value =
        serde_json::from_str(LOCAL_CAPABILITY).expect("local capability JSON");
    assert_eq!(
        capability["permissions"],
        serde_json::json!(["core:event:allow-listen", "core:event:allow-unlisten"])
    );
}
