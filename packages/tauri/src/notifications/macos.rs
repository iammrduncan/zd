use super::{
    ActionRouter, CompletionSound, CompletionSoundRequest, NativeNotificationAction,
    NotificationPermission, ThreadNotificationRequestV1,
};
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{Bool, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, DefinedClass};
use objc2_app_kit::NSSound;
use objc2_foundation::{NSArray, NSError, NSObject, NSObjectProtocol, NSSet, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
    UNNotificationAction, UNNotificationActionOptionNone, UNNotificationActionOptions,
    UNNotificationCategory, UNNotificationCategoryOptions, UNNotificationPresentationOptions,
    UNNotificationRequest, UNNotificationResponse, UNNotificationSettings,
    UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};
use std::ptr::NonNull;
use std::sync::{mpsc, Arc};
use std::time::Duration;

const CATEGORY_ID: &str = "ZD_THREAD_ATTENTION";
const VIEW_ACTION_ID: &str = "ZD_VIEW";
const CLOSE_ACTION_ID: &str = "ZD_CLOSE";
const DEFAULT_ACTION_ID: &str = "com.apple.UNNotificationDefaultActionIdentifier";
const DISMISS_ACTION_ID: &str = "com.apple.UNNotificationDismissActionIdentifier";

define_class!(
    // SAFETY: NSObject has no subclassing requirements, the ivar is initialized before `init`,
    // and this delegate does not implement Drop.
    #[unsafe(super(NSObject))]
    #[name = "ZdNotificationDelegate"]
    #[ivars = Arc<ActionRouter>]
    struct NotificationDelegate;

    // SAFETY: NSObjectProtocol has no additional safety requirements.
    unsafe impl NSObjectProtocol for NotificationDelegate {}

    // SAFETY: Selectors and signatures match UNUserNotificationCenterDelegate exactly.
    unsafe impl UNUserNotificationCenterDelegate for NotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion_handler.call((
                UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::List,
            ));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion_handler: &block2::DynBlock<dyn Fn()>,
        ) {
            let notification_id = response
                .notification()
                .request()
                .identifier()
                .to_string();
            let action_id = response.actionIdentifier().to_string();
            let action = match action_id.as_str() {
                VIEW_ACTION_ID | DEFAULT_ACTION_ID => Some(NativeNotificationAction::View),
                CLOSE_ACTION_ID | DISMISS_ACTION_ID => Some(NativeNotificationAction::Close),
                _ => None,
            };
            if let Some(action) = action {
                self.ivars().deliver(&notification_id, action);
            }
            completion_handler.call(());
        }
    }
);

impl NotificationDelegate {
    fn new(router: Arc<ActionRouter>) -> Retained<Self> {
        let this = Self::alloc().set_ivars(router);
        // SAFETY: `this` is an allocated NSObject subclass with initialized ivars.
        unsafe { msg_send![super(this), init] }
    }
}

pub(super) fn install(router: Arc<ActionRouter>) -> Result<(), String> {
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let view = UNNotificationAction::actionWithIdentifier_title_options(
        &NSString::from_str(VIEW_ACTION_ID),
        &NSString::from_str("View"),
        UNNotificationActionOptions::Foreground,
    );
    let close = UNNotificationAction::actionWithIdentifier_title_options(
        &NSString::from_str(CLOSE_ACTION_ID),
        &NSString::from_str("Close"),
        UNNotificationActionOptionNone,
    );
    let actions = NSArray::from_retained_slice(&[view, close]);
    let intents: Retained<NSArray<NSString>> = NSArray::from_retained_slice(&[]);
    let category = UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
        &NSString::from_str(CATEGORY_ID),
        &actions,
        &intents,
        UNNotificationCategoryOptions::CustomDismissAction,
    );
    center.setNotificationCategories(&NSSet::from_retained_slice(&[category]));

    let delegate = NotificationDelegate::new(router);
    center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    // The notification center's delegate property is weak. It is process-lifetime shell state and
    // must outlive every delivered notification action.
    let _ = Retained::into_raw(delegate);
    Ok(())
}

fn permission_from(status: UNAuthorizationStatus) -> NotificationPermission {
    match status {
        UNAuthorizationStatus::Authorized
        | UNAuthorizationStatus::Provisional
        | UNAuthorizationStatus::Ephemeral => NotificationPermission::Granted,
        UNAuthorizationStatus::Denied => NotificationPermission::Denied,
        UNAuthorizationStatus::NotDetermined => NotificationPermission::Prompt,
        _ => NotificationPermission::Unsupported,
    }
}

pub(super) fn permission() -> NotificationPermission {
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let (sender, receiver) = mpsc::sync_channel(1);
    let completion = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        // SAFETY: Apple guarantees the settings pointer is valid for this callback.
        let status = unsafe { settings.as_ref() }.authorizationStatus();
        let _ = sender.send(permission_from(status));
    });
    center.getNotificationSettingsWithCompletionHandler(&completion);
    receiver
        .recv_timeout(Duration::from_secs(5))
        .unwrap_or(NotificationPermission::Unsupported)
}

pub(super) fn request_permission() -> NotificationPermission {
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let (sender, receiver) = mpsc::sync_channel(1);
    let completion = RcBlock::new(move |granted: Bool, error: *mut NSError| {
        let result = if !error.is_null() {
            NotificationPermission::Unsupported
        } else if granted.as_bool() {
            NotificationPermission::Granted
        } else {
            NotificationPermission::Denied
        };
        let _ = sender.send(result);
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert,
        &completion,
    );
    receiver
        .recv_timeout(Duration::from_secs(300))
        .unwrap_or(NotificationPermission::Unsupported)
}

pub(super) fn show(request: &ThreadNotificationRequestV1) -> Result<(), String> {
    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(&request.title));
    content.setBody(&NSString::from_str(&request.body));
    content.setCategoryIdentifier(&NSString::from_str(CATEGORY_ID));
    content.setThreadIdentifier(&NSString::from_str(&request.thread_id));
    let native_request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSString::from_str(&request.notification_id),
        &content,
        None,
    );
    UNUserNotificationCenter::currentNotificationCenter()
        .addNotificationRequest_withCompletionHandler(&native_request, None);
    Ok(())
}

fn play_sound(request: &CompletionSoundRequest) -> Result<(), String> {
    let preferred = match request.sound {
        CompletionSound::Subtle => "Pop",
        CompletionSound::Bright => "Glass",
        CompletionSound::Gentle => "Purr",
    };
    let sound = NSSound::soundNamed(&NSString::from_str(preferred))
        .or_else(|| NSSound::soundNamed(&NSString::from_str("Ping")))
        .ok_or_else(|| "no safe system completion sound is available".to_owned())?;
    if sound.isPlaying() {
        return Ok(());
    }
    sound.setVolume(request.volume as f32);
    if sound.play() {
        Ok(())
    } else {
        Err("the system completion sound could not be played".into())
    }
}

pub(super) async fn play_sound_on_main(
    app: &tauri::AppHandle,
    request: CompletionSoundRequest,
) -> Result<(), String> {
    let (sender, receiver) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = sender.send(play_sound(&request));
    })
    .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "the system completion sound timed out".to_owned())?
    })
    .await
    .map_err(|error| error.to_string())?
}
