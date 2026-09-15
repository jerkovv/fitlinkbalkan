import UIKit
import Capacitor

// Aplikacija izgradjena sa iOS 27 SDK-om se bez UIScene zivotnog ciklusa ne pokrene
// ("UIScene life cycle is required"). Prozor pravi Main.storyboard preko Info.plist
// (UISceneStoryboardFile), a linkovi i univerzalni linkovi, koji su ranije stizali na
// AppDelegate, sad stizu ovde i idu Capacitor-u istim putem (ApplicationDelegateProxy).
// Push token i dalje stize na AppDelegate - to se scenama ne menja.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        // Hladno pokretanje preko linka: iOS ga tad ne salje kroz openURLContexts,
        // nego ovde, u connectionOptions.
        if let url = connectionOptions.urlContexts.first?.url {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
        }
        if let activity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                continue: activity,
                restorationHandler: { _ in }
            )
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}
