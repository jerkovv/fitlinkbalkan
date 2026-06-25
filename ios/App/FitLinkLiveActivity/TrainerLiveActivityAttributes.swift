//
//  TrainerLiveActivityAttributes.swift
//  FitLink - trenerova Live Activity (deljeni podatkovni tip)
//
//  VAZNO: ovaj fajl mora biti clan OBA targeta (App + FitLinkLiveActivityExtension),
//  isto kao FitLinkLiveActivityAttributes.swift. Lezi u ekstenzijinom synchronized
//  folderu (auto-clan ekstenzije); App membership cekiraj rucno u Xcode
//  (Target Membership -> App). Bez toga App target ne kompajlira jer ga
//  TrainerLiveActivityManager i LiveActivityPlugin koriste.
//

import Foundation
import ActivityKit

// Jedan vezbac u trenerovoj listi (top po pulsu).
struct TrainerAthlete: Codable, Hashable {
    var name: String
    var hr: Int?
    var zone: String     // rest/easy/moderate/hard/max (iste zone kao kod atlete)
    var isResting: Bool
    var cal: Int?           // potroseno kcal (opciono; prikazi samo ako > 0)
    var watchConnected: Bool // bez sata -> desna strana prazna, siva tackica
}

@available(iOS 16.1, *)
struct TrainerLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var athletes: [TrainerAthlete]   // do 3 (top po pulsu)
        var activeCount: Int             // ukupno aktivnih vezbaca
        var moreCount: Int               // koliko ih je preko prikazanih 3
    }

    var trainerName: String?
    var sessionStartedAt: Date           // pocetak monitora (stoperica broji unapred)
}
