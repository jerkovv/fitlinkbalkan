// ============================================================================
// UPOZORENJE: Ako pokreneš `npx cap sync`, ovaj plugin (kao i WatchSync) NIJE
// npm paket - zivi direktno u App targetu - pa ga `cap sync` ne pronalazi i
// brise iz `capacitor.config.json` -> `packageClassList`. Registracija je zato
// u kodu: `bridge?.registerPluginInstance(LiveActivityPlugin())` u
// MainViewController.capacitorDidLoad(). Ne oslanjaj se na packageClassList.
// ============================================================================

import Foundation
import Capacitor

// Capacitor most ka LiveActivityManager-u. JS ime: "LiveActivity".
// Metode: start / update / end. Polja stanja stizu iz CAPPluginCall-a; datumi
// kao epoch ms (Double) -> Date. Live Activities su iOS 16.2+, pa je svaka
// metoda ogradjena #available; na starijem OS-u start/update je reject, end je
// tih no-op resolve.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin {

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities zahtevaju iOS 16.2+")
            return
        }
        let athleteName = call.getString("athleteName") ?? ""
        let startedAt: Date
        if let ms = call.getDouble("workoutStartedAtMs") {
            startedAt = Date(timeIntervalSince1970: ms / 1000.0)
        } else {
            startedAt = Date()
        }
        LiveActivityManager.shared.start(
            athleteName: athleteName,
            startedAt: startedAt,
            thumbnailUrl: call.getString("thumbnailUrl"),
            state: Self.contentState(from: call)
        )
        call.resolve(["success": true])
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities zahtevaju iOS 16.2+")
            return
        }
        LiveActivityManager.shared.update(thumbnailUrl: call.getString("thumbnailUrl"), state: Self.contentState(from: call))
        call.resolve(["success": true])
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            // Nista za zavrsiti na starijem OS-u.
            call.resolve(["success": true])
            return
        }
        LiveActivityManager.shared.end()
        call.resolve(["success": true])
    }

    // Gradi ContentState iz JS poziva. restEndsAtMs je epoch ms (Double) -> Date?;
    // heartRate i durationMinutes su opcioni (nil ako nisu prosledjeni).
    @available(iOS 16.2, *)
    private static func contentState(from call: CAPPluginCall) -> FitLinkLiveActivityAttributes.ContentState {
        var restEndsAt: Date? = nil
        if let ms = call.getDouble("restEndsAtMs") {
            restEndsAt = Date(timeIntervalSince1970: ms / 1000.0)
        }
        return FitLinkLiveActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "",
            setNumber: call.getInt("setNumber") ?? 0,
            totalSets: call.getInt("totalSets") ?? 0,
            heartRate: call.getInt("heartRate"),
            hrZone: call.getString("hrZone") ?? "rest",
            isResting: call.getBool("isResting") ?? false,
            restEndsAt: restEndsAt,
            isDurationBased: call.getBool("isDurationBased") ?? false,
            durationMinutes: call.getInt("durationMinutes"),
            weightText: call.getString("weightText"),
            nextExerciseName: call.getString("nextExerciseName"),
            nextInfo: call.getString("nextInfo"),
            watchConnected: call.getBool("watchConnected") ?? false
        )
    }
}
