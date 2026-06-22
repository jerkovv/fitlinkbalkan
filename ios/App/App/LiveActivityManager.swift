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

    // Da li korisnik dozvoljava Live Activities (Settings). Ako je iskljuceno,
    // start je no-op (Activity.request bi ionako bacio).
    private var enabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // Pokrece novi Live Activity sa pocetnim stanjem. Ako vec postoji aktivan
    // (nas ref ili zaostao posle restart-a app-a), prvo ga zavrsi pa pokreni nov,
    // da nikad ne ostane vise od jednog.
    func start(athleteName: String, state: FitLinkLiveActivityAttributes.ContentState) {
        guard enabled else {
            NSLog("[LiveActivity] areActivitiesEnabled == false -> start no-op")
            return
        }

        // Snapshot postojecih PRE pravljenja novog (da async zavrsavanje ne
        // pogodi bas novopokrenuti Activity).
        let stale = Activity<FitLinkLiveActivityAttributes>.activities
        activity = nil

        let attributes = FitLinkLiveActivityAttributes(athleteName: athleteName)
        do {
            let act = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
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
    }

    // Azurira ContentState postojeceg Activity-ja. Bez aktivnog -> no-op.
    func update(state: FitLinkLiveActivityAttributes.ContentState) {
        guard let act = activity else {
            NSLog("[LiveActivity] update bez aktivnog Activity-ja -> no-op")
            return
        }
        Task {
            await act.update(ActivityContent(state: state, staleDate: nil))
        }
    }

    // Zavrsava sve tekuce Live Activity-je naseg tipa (nas ref + eventualni
    // zaostali), dismissalPolicy .immediate.
    func end() {
        let running = Activity<FitLinkLiveActivityAttributes>.activities
        activity = nil
        guard !running.isEmpty else { return }
        Task {
            for a in running {
                await a.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
