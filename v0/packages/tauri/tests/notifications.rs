use serde_json::json;
use zd_lib::notifications::{
    validate_notification_request, validate_sound_request, ActionStore, CompletionSound,
    CompletionSoundRequest, NativeNotificationAction, NotificationAction,
    ThreadNotificationRequestV1,
};

fn request(version: usize) -> ThreadNotificationRequestV1 {
    ThreadNotificationRequestV1 {
        schema_version: 1,
        notification_id: format!("attention:thread-alpha:{version}"),
        event_id: format!("thread-alpha:{version}"),
        project_id: "project-alpha".into(),
        worktree_id: "worktree-alpha".into(),
        thread_id: "thread-alpha".into(),
        title: "zd".into(),
        body: "Workbench · Review output · Codex".into(),
    }
}

#[test]
fn notification_request_rejects_content_paths_commands_and_unknown_fields() {
    for extra in [
        json!({ "prompt": "private" }),
        json!({ "output": "private" }),
        json!({ "path": "/private/work" }),
        json!({ "command": "arbitrary" }),
    ] {
        let mut value = serde_json::to_value(request(1)).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        assert!(serde_json::from_value::<ThreadNotificationRequestV1>(value).is_err());
    }
}

#[test]
fn notification_request_is_bounded_and_identifies_only_the_closed_target() {
    let valid = request(1);
    assert!(validate_notification_request(&valid).is_ok());

    let mut wrong_title = valid.clone();
    wrong_title.title = "another app".into();
    assert!(validate_notification_request(&wrong_title).is_err());

    let mut content = valid.clone();
    content.body = "x".repeat(241);
    assert!(validate_notification_request(&content).is_err());

    let mut control = valid.clone();
    control.body = "Project\nsecret".into();
    assert!(validate_notification_request(&control).is_err());

    let serialized = serde_json::to_string(&valid).unwrap();
    assert!(serialized.contains("project-alpha"));
    assert!(serialized.contains("thread-alpha"));
    assert!(!serialized.contains("relativePath"));
}

#[test]
fn native_actions_recover_the_exact_stable_target_once() {
    let store = ActionStore::default();
    store.remember(&request(1)).unwrap();

    let action = store
        .record_action("attention:thread-alpha:1", NativeNotificationAction::View)
        .unwrap();
    assert_eq!(action.action, NotificationAction::View);
    assert_eq!(action.project_id, "project-alpha");
    assert_eq!(action.worktree_id, "worktree-alpha");
    assert_eq!(action.thread_id, "thread-alpha");
    assert!(store
        .record_action("attention:thread-alpha:1", NativeNotificationAction::View)
        .is_none());
    assert_eq!(store.drain(), vec![action]);
    assert!(store.drain().is_empty());
}

#[test]
fn close_is_a_distinct_notification_only_action() {
    let store = ActionStore::default();
    store.remember(&request(2)).unwrap();

    let action = store
        .record_action("attention:thread-alpha:2", NativeNotificationAction::Close)
        .unwrap();

    assert_eq!(action.action, NotificationAction::Close);
    assert_eq!(action.notification_id, "attention:thread-alpha:2");
}

#[test]
fn pending_targets_and_actions_remain_bounded() {
    let store = ActionStore::default();
    for version in 0..400 {
        store.remember(&request(version)).unwrap();
    }

    assert!(store
        .record_action("attention:thread-alpha:0", NativeNotificationAction::View)
        .is_none());
    for version in 200..400 {
        let _ = store.record_action(
            &format!("attention:thread-alpha:{version}"),
            NativeNotificationAction::View,
        );
    }
    assert!(store.drain().len() <= 64);
}

#[test]
fn completion_sound_is_a_closed_choice_with_bounded_volume() {
    assert!(validate_sound_request(&CompletionSoundRequest {
        sound: CompletionSound::Subtle,
        volume: 0.4,
    })
    .is_ok());
    assert!(validate_sound_request(&CompletionSoundRequest {
        sound: CompletionSound::Bright,
        volume: f64::NAN,
    })
    .is_err());
    assert!(validate_sound_request(&CompletionSoundRequest {
        sound: CompletionSound::Gentle,
        volume: 1.1,
    })
    .is_err());
    assert!(serde_json::from_value::<CompletionSoundRequest>(json!({
        "sound": "custom-file",
        "volume": 0.5
    }))
    .is_err());
}
