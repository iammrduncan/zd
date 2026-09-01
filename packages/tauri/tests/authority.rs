const LIBRARY: &str = include_str!("../src/lib.rs");
const PLATFORM: &str = include_str!("../../app/src/platform.ts");
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
fn migrated_host_authority_is_absent_from_tauri_and_frontend_invoke_registration() {
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
        assert!(
            !PLATFORM.contains(&format!("\"{command}\"")),
            "{command} is still present in the frontend invoke adapter"
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
fn single_instance_arbitration_is_registered_before_every_other_plugin() {
    let source = LIBRARY;
    let arbitration = source
        .find(".plugin(single_instance::plugin())")
        .expect("single-instance arbitration is registered");
    let next_plugin = source
        .find(".plugin(tauri_plugin_opener::init())")
        .expect("opener plugin is registered");
    let setup = source
        .find(".setup(move |app|")
        .expect("desktop setup exists");

    assert_eq!(source.matches("single_instance::plugin()").count(), 1);
    assert!(arbitration < next_plugin);
    assert!(arbitration < setup);
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
