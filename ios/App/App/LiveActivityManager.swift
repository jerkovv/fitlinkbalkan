//
//  LiveActivityManager.swift
//  App
//
//  Nativni menadzer Live Activity-ja za vezbacev sopstveni trening.
//  Koristi ActivityKit (iOS 16.2+). Tip FitLinkLiveActivityAttributes je deljen
//  sa FitLinkLiveActivity ekstenzijom (prikaz). Na starijem OS-u se ovde i ne
//  ulazi - LiveActivityPlugin pre poziva proverava #available.
//

import Foundation
import ActivityKit

@available(iOS 16.2, *)
final class LiveActivityManager {
    static let shared = LiveActivityManager()
    private init() {}

    // Referenca na tekuci Activity (jedan po treningu).
    private var activity: Activity<FitLinkLiveActivityAttributes>?
    // Poslednje poslato stanje (da skinuta slika ide na NAJNOVIJE stanje).
    private var lastState: FitLinkLiveActivityAttributes.ContentState?
    // URL slike koju trenutno ocekujemo (da zakasneo download stare vezbe ne pregazi novu).
    private var pendingThumbUrl: String?

    // Da li korisnik dozvoljava Live Activities (Settings). Ako je iskljuceno,
    // start je no-op (Activity.request bi ionako bacio).
    private var enabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // Pokrece novi Live Activity sa pocetnim stanjem. Ako vec postoji aktivan
    // (nas ref ili zaostao posle restart-a app-a), prvo ga zavrsi pa pokreni nov,
    // da nikad ne ostane vise od jednog.
    func start(athleteName: String, startedAt: Date, thumbnailUrl: String?, state: FitLinkLiveActivityAttributes.ContentState) {
        guard enabled else {
            NSLog("[LiveActivity] areActivitiesEnabled == false -> start no-op")
            return
        }

        // Snapshot postojecih PRE pravljenja novog (da async zavrsavanje ne
        // pogodi bas novopokrenuti Activity).
        let stale = Activity<FitLinkLiveActivityAttributes>.activities
        activity = nil

        let url = (thumbnailUrl?.isEmpty == false) ? thumbnailUrl : nil
        pendingThumbUrl = url

        // Vec kesirana slika -> ubaci ime odmah (pre request-a). Inace placeholder.
        var initial = state
        if let url, LiveActivityImageCache.isCached(url) {
            initial.imageFileName = LiveActivityImageCache.fileName(for: url)
        }
        lastState = initial

        let attributes = FitLinkLiveActivityAttributes(athleteName: athleteName, workoutStartedAt: startedAt)
        do {
            let act = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: initial, staleDate: nil),
                pushType: nil
            )
            activity = act
            NSLog("[LiveActivity] started id=\(act.id)")
        } catch {
            NSLog("[LiveActivity] start failed: \(error.localizedDescription)")
        }

        // Zavrsi zaostale (bez novog koji smo upravo napravili).
        if !stale.isEmpty {
            Task {
                for old in stale {
                    await old.end(nil, dismissalPolicy: .immediate)
                }
            }
        }

        // Slika jos nije kesirana -> skini pa je ubaci u stanje cim stigne.
        if let url, initial.imageFileName == nil {
            fetchAndApply(url)
        }
    }

    // Azurira ContentState postojeceg Activity-ja. Bez aktivnog -> no-op.
    func update(thumbnailUrl: String?, state: FitLinkLiveActivityAttributes.ContentState) {
        guard let act = activity else {
            NSLog("[LiveActivity] update bez aktivnog Activity-ja -> no-op")
            return
        }
        let url = (thumbnailUrl?.isEmpty == false) ? thumbnailUrl : nil
        pendingThumbUrl = url

        var newState = state
        if let url, LiveActivityImageCache.isCached(url) {
            newState.imageFileName = LiveActivityImageCache.fileName(for: url)
        }
        lastState = newState
        Task {
            await act.update(ActivityContent(state: newState, staleDate: nil))
        }

        if let url, newState.imageFileName == nil {
            fetchAndApply(url)
        }
    }

    // Zavrsava sve tekuce Live Activity-je naseg tipa (nas ref + eventualni
    // zaostali), dismissalPolicy .immediate.
    func end() {
        let running = Activity<FitLinkLiveActivityAttributes>.activities
        activity = nil
        lastState = nil
        pendingThumbUrl = nil
        guard !running.isEmpty else { return }
        Task {
            for a in running {
                await a.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    // Skine sliku (off-main) i ubaci je u NAJNOVIJE stanje cim stigne - samo ako URL
    // nije u medjuvremenu promenjen (pendingThumbUrl) i ako Activity jos zivi.
    private func fetchAndApply(_ url: String) {
        LiveActivityImageCache.download(url) { [weak self] fileName in
            guard let self, let fileName else { return }
            guard self.pendingThumbUrl == url, let act = self.activity, var s = self.lastState else { return }
            s.imageFileName = fileName
            self.lastState = s
            Task {
                await act.update(ActivityContent(state: s, staleDate: nil))
            }
        }
    }
}
