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
        // Emituj push token (kad ActivityKit isporuci) ka JS-u preko "laPushToken" eventa.
        // Postaviti PRE start-a, da listener bude spreman kad token stigne.
        LiveActivityManager.shared.onPushToken = { [weak self] hex in
            self?.notifyListeners("laPushToken", data: ["token": hex])
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

    // Pred-kesira sve slike vezbi tog treninga u App Group (da budu spremne kad sat
    // prebaci vezbu dok je telefon zakljucan). Fire-and-forget; resolve odmah.
    // Nije #available-ogradjeno: kes je obican URLSession/UIImage (radi na svakom iOS).
    @objc func precache(_ call: CAPPluginCall) {
        let urls = call.getArray("urls", String.self) ?? []
        for url in urls where !url.isEmpty {
            LiveActivityImageCache.download(url) { _ in }   // download sam preskace ako je kesirano
        }
        call.resolve()
    }

    // MARK: - Trenerova Live Activity (zaseban tip/menadzer)

    @objc func trainerStart(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities zahtevaju iOS 16.2+")
            return
        }
        // Push token (kad stigne) ka JS-u preko "trainerLaPushToken". Pre start-a.
        TrainerLiveActivityManager.shared.onPushToken = { [weak self] hex in
            self?.notifyListeners("trainerLaPushToken", data: ["token": hex])
        }
        let startedAt: Date
        if let ms = call.getDouble("sessionStartedAtMs") {
            startedAt = Date(timeIntervalSince1970: ms / 1000.0)
        } else {
            startedAt = Date()
        }
        TrainerLiveActivityManager.shared.start(
            trainerName: call.getString("trainerName"),
            sessionStartedAt: startedAt,
            state: Self.trainerContentState(from: call)
        )
        call.resolve(["success": true])
    }

    @objc func trainerUpdate(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities zahtevaju iOS 16.2+")
            return
        }
        TrainerLiveActivityManager.shared.update(state: Self.trainerContentState(from: call))
        call.resolve(["success": true])
    }

    @objc func trainerEnd(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["success": true])
            return
        }
        TrainerLiveActivityManager.shared.end()
        call.resolve(["success": true])
    }

    // Da li trenerova aktivnost trenutno radi (po sistemu). React ovo cita na mount
    // da vrati toggle u tacno stanje (preziva izlazak sa ekrana / restart app-a).
    @objc func trainerStatus(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["active": false])
            return
        }
        call.resolve(["active": TrainerLiveActivityManager.shared.isRunning])
    }

    // Gradi trenerov ContentState iz JS poziva. athletes = niz {name,hr,zone,isResting}.
    @available(iOS 16.2, *)
    private static func trainerContentState(from call: CAPPluginCall) -> TrainerLiveActivityAttributes.ContentState {
        var athletes: [TrainerAthlete] = []
        if let raw = call.getArray("athletes", JSObject.self) {
            for item in raw {
                let name = item["name"] as? String ?? ""
                let hr = (item["hr"] as? NSNumber)?.intValue
                let zone = item["zone"] as? String ?? "rest"
                let isResting = item["isResting"] as? Bool ?? false
                let cal = (item["cal"] as? NSNumber)?.intValue
                athletes.append(TrainerAthlete(name: name, hr: hr, zone: zone, isResting: isResting, cal: cal))
            }
        }
        return TrainerLiveActivityAttributes.ContentState(
            athletes: athletes,
            activeCount: call.getInt("activeCount") ?? athletes.count,
            moreCount: call.getInt("moreCount") ?? 0
        )
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
