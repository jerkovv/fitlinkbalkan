//
//  FitLinkLiveActivityAttributes.swift
//  FitLink
//
//  DELJENI TIP - mora biti clan OBA targeta:
//    1) App (LiveActivityManager / LiveActivityPlugin ga koriste)
//    2) FitLinkLiveActivityExtension (prikaz: lock screen + Dynamic Island)
//  Jedan izvor istine za ContentState - enkodiranje (App) i dekodiranje
//  (ekstenzija) moraju da se poklope.
//
//  Napomena o @available: App target deploy-uje na iOS 15.0, a ActivityKit
//  (ActivityAttributes) je iOS 16.1+. Zato je tip ogradjen @available(iOS 16.1, *)
//  - u App targetu se sme referencirati samo iz 16.1+ konteksta (manager je
//  @available(iOS 16.2, *)); ekstenzija deploy-uje na 16.2 pa je svuda dostupan.
//

import Foundation
import ActivityKit
import CryptoKit

@available(iOS 16.1, *)
struct FitLinkLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var exerciseName: String      // tekuca vezba
        var setNumber: Int            // tekuci set
        var totalSets: Int            // ukupno setova
        var heartRate: Int?           // puls, nil ako nema
        var hrZone: String            // "rest"/"easy"/"moderate"/"hard"/"max"
        var isResting: Bool           // true = pauza, false = aktivan set
        var restEndsAt: Date?         // kraj pauze (za odbrojavanje), nil ako nije pauza
        var isDurationBased: Bool     // kardio (minuti) umesto setova
        var durationMinutes: Int?     // ciljani minuti za kardio
        var weightText: String?       // npr "100 kg x 8" ili nil (bodyweight/kardio)
        var nextExerciseName: String? // ime sledece vezbe, nil ako je poslednja
        var nextInfo: String?         // npr "4 serije" ili nil
        var watchConnected: Bool      // sat prisutan -> prikazuje se puls; false -> bez HR
        var imageFileName: String?    // ime kesirane slike u App Group, nil dok se ne skine
    }
    var athleteName: String           // fiksno, ime vezbaca (za sad nas trening)
    var workoutStartedAt: Date        // fiksno, pocetak treninga (stoperica broji unapred)
}

// MARK: - App Group thumbnail kes (deljeno: App pise, ekstenzija cita istu putanju)

// App Group dodat na oba targeta (App + FitLinkLiveActivityExtension).
let liveActivityAppGroup = "group.rs.fitlink.app"

// Stabilan naziv fajla iz URL-a: sha256 hex + ".png".
func liveActivityThumbFileName(forURL url: String) -> String {
    let digest = SHA256.hash(data: Data(url.utf8))
    let hex = digest.map { String(format: "%02x", $0) }.joined()
    return hex + ".png"
}

// Folder za kesirane thumbnail-e u App Group containeru (pravi ga ako ne postoji).
func liveActivityThumbDir() -> URL? {
    guard let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: liveActivityAppGroup
    ) else { return nil }
    let dir = container.appendingPathComponent("Library/Caches/la_thumbs", isDirectory: true)
    if !FileManager.default.fileExists(atPath: dir.path) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    return dir
}

// Putanja kesiranog fajla po imenu (koje je vec u ContentState.imageFileName).
func liveActivityThumbURL(fileName: String) -> URL? {
    liveActivityThumbDir()?.appendingPathComponent(fileName)
}
