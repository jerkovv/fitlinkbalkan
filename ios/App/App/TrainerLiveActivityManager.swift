//
//  TrainerLiveActivityManager.swift
//  App
//
//  ActivityKit menadzer za TRENEROVU Live Activity (zaseban od atletine u
//  LiveActivityManager.swift). Drzi jednu trenerovu aktivnost, azurira je i
//  hvata push token (.token) za daljinski update (Faza 2b). Tip
//  TrainerLiveActivityAttributes je deljen sa ekstenzijom (prikaz).
//

import Foundation
import ActivityKit

@available(iOS 16.2, *)
final class TrainerLiveActivityManager {
    static let shared = TrainerLiveActivityManager()
    private init() {}

    // Referenca na tekucu trenerovu aktivnost (jedna).
    private var activity: Activity<TrainerLiveActivityAttributes>?
    // Plugin postavi ovo da emituje push token (hex) ka JS-u kad stigne.
    var onPushToken: ((String) -> Void)?
    // Task koji slusa pushTokenUpdates; otkazujemo ga na end().
    private var pushTokenTask: Task<Void, Never>?

    private var enabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // Da li je trenerova aktivnost ziva (po sistemu, ne po nasoj referenci) - preziva
    // izlazak sa ekrana i restart app-a. React ovo cita na mount da vrati toggle.
    var isRunning: Bool {
        !Activity<TrainerLiveActivityAttributes>.activities.isEmpty
    }

    // Pokrece novu aktivnost; ako vec postoji (nas ref ili zaostao), prvo zavrsi
    // zaostale pa pokreni novu, da nikad ne ostane vise od jedne.
    func start(trainerName: String?, sessionStartedAt: Date, state: TrainerLiveActivityAttributes.ContentState) {
        guard enabled else {
            NSLog("[TrainerLA] areActivitiesEnabled == false -> start no-op")
            return
        }

        let stale = Activity<TrainerLiveActivityAttributes>.activities
        activity = nil

        let attributes = TrainerLiveActivityAttributes(trainerName: trainerName, sessionStartedAt: sessionStartedAt)
        let content = ActivityContent(state: state, staleDate: nil)

        pushTokenTask?.cancel()
        pushTokenTask = nil

        var act: Activity<TrainerLiveActivityAttributes>?
        var usedPush = false
        do {
            act = try Activity.request(attributes: attributes, content: content, pushType: .token)
            usedPush = true
        } catch {
            NSLog("[TrainerLA] request .token failed: \(error.localizedDescription) -> fallback pushType nil")
            do {
                act = try Activity.request(attributes: attributes, content: content, pushType: nil)
            } catch {
                NSLog("[TrainerLA] request (fallback nil) failed: \(error.localizedDescription)")
            }
        }

        if let act {
            activity = act
            NSLog("[TrainerLA] started id=\(act.id) push=\(usedPush)")
            if usedPush {
                pushTokenTask = Task {
                    for await tokenData in act.pushTokenUpdates {
                        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                        await MainActor.run { self.onPushToken?(hex) }
                    }
                }
            }
        }

        if !stale.isEmpty {
            Task {
                for old in stale {
                    await old.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
    }

    // Azurira ContentState. Ako smo izgubili referencu (povratak na ekran / restart
    // app-a), preuzmi prvu zivu aktivnost tog tipa pa azuriraj; ako nema nijedne, no-op.
    func update(state: TrainerLiveActivityAttributes.ContentState) {
        if activity == nil {
            activity = Activity<TrainerLiveActivityAttributes>.activities.first
        }
        guard let act = activity else {
            NSLog("[TrainerLA] update bez aktivne aktivnosti -> no-op")
            return
        }
        Task {
            await act.update(ActivityContent(state: state, staleDate: nil))
        }
    }

    // Zavrsava sve tekuce trenerove aktivnosti (nas ref + zaostale), .immediate.
    func end() {
        pushTokenTask?.cancel()
        pushTokenTask = nil
        let running = Activity<TrainerLiveActivityAttributes>.activities
        activity = nil
        guard !running.isEmpty else { return }
        Task {
            for a in running {
                await a.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
