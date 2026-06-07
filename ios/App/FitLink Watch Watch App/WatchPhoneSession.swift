import Foundation
import WatchConnectivity
import Combine

// Sluzi kao receiver za pairing payload-e koje iPhone salje preko
// WCSession.updateApplicationContext / transferUserInfo.
//
// Payload format (mora se poklapati sa WatchSyncPlugin na iPhone strani):
//   pair_token: { "type": "pair_token", "token": "...", "user_id": "...", "timestamp": ... }
//   clear_token: { "type": "clear_token", "timestamp": ... }
//
// Cuva token u UserDefaults da preživi reboot Watch-a i cold start app-a.
final class WatchPhoneSession: NSObject, ObservableObject {

    static let shared = WatchPhoneSession()

    @Published private(set) var pairingToken: String?
    @Published private(set) var pairedUserId: String?

    // True dok handshake (pull) nije potvrdio identitet sa telefona - npr.
    // telefon nedostupan pa errorHandler padne. Dok je true, ne tvrdimo
    // "Povezano" sa sigurnošću; ContentView retry-uje na svaki poll tick.
    @Published private(set) var tokenIsUncertain: Bool = false

    private let tokenKey = "fitlink.pairingToken"
    private let userIdKey = "fitlink.pairedUserId"

    private override init() {
        super.init()

        // Procitaj prethodno sacuvane vrednosti pre aktivacije sesije
        let defaults = UserDefaults.standard
        self.pairingToken = defaults.string(forKey: tokenKey)
        self.pairedUserId = defaults.string(forKey: userIdKey)

        if let saved = self.pairingToken {
            print("[WatchPhoneSession] Loaded saved token (user: \(self.pairedUserId ?? "?")), prefix: \(String(saved.prefix(8)))...")
        } else {
            print("[WatchPhoneSession] No saved token in UserDefaults")
        }

        // Aktiviraj WCSession
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
            print("[WatchPhoneSession] WCSession.activate() called")
        } else {
            print("[WatchPhoneSession] WCSession not supported on this device")
        }
    }

    // MARK: - Payload handling

    private func handlePayload(_ payload: [String: Any]) {
        guard let type = payload["type"] as? String else {
            print("[WatchPhoneSession] Payload missing 'type' field, ignoring keys: \(payload.keys)")
            return
        }

        switch type {
        case "pair_token":
            guard let token = payload["token"] as? String,
                  let userId = payload["user_id"] as? String else {
                print("[WatchPhoneSession] pair_token payload missing token or user_id")
                return
            }
            // Idempotent - ako je isti token, ne diraj @Published da ne triggeruje view update
            if token == self.pairingToken && userId == self.pairedUserId {
                print("[WatchPhoneSession] pair_token same as current, skipping")
                return
            }
            UserDefaults.standard.set(token, forKey: tokenKey)
            UserDefaults.standard.set(userId, forKey: userIdKey)
            self.pairingToken = token
            self.pairedUserId = userId
            print("[WatchPhoneSession] Token paired - user: \(userId), prefix: \(String(token.prefix(8)))...")

        case "clear_token":
            if self.pairingToken == nil && self.pairedUserId == nil {
                print("[WatchPhoneSession] clear_token received but already empty, skipping")
                return
            }
            UserDefaults.standard.removeObject(forKey: tokenKey)
            UserDefaults.standard.removeObject(forKey: userIdKey)
            self.pairingToken = nil
            self.pairedUserId = nil
            print("[WatchPhoneSession] Token cleared (user logged out on iPhone)")

        default:
            print("[WatchPhoneSession] Unknown payload type: \(type)")
        }
    }

    // MARK: - Public API

    /// Forsira clear lokalno keširanog tokena. Poziva se kad ContentView
    /// otkrije da server-vraćeni userId ne odgovara cached pairedUserId
    /// (znak da je iPhone u međuvremenu prebacio nalog ali sync nije
    /// stigao do Watch-a).
    func clearLocalToken() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: userIdKey)
        self.pairingToken = nil
        self.pairedUserId = nil
        print("[WatchPhoneSession] Local token cleared (identity mismatch)")
    }

    /// Handshake (pull): pita telefon ko je trenutno ulogovan i sinhronizuje
    /// lokalni keš sa odgovorom. Poziva se na .task, scenePhase .active,
    /// activation-complete i na poll tick dok je tokenIsUncertain.
    func requestCurrentToken() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default

        guard session.activationState == .activated else {
            // Sesija jos nije spremna - markiraj nesigurnim, pokušaj kasnije.
            DispatchQueue.main.async { [weak self] in self?.tokenIsUncertain = true }
            return
        }

        session.sendMessage(["type": "request_current_token"], replyHandler: { [weak self] reply in
            DispatchQueue.main.async {
                guard let self = self else { return }

                if let loggedOut = reply["loggedOut"] as? Bool, loggedOut {
                    print("[WatchPhoneSession] Handshake reply: loggedOut")
                    self.clearLocalToken()
                    self.tokenIsUncertain = false
                    return
                }

                if let token = reply["token"] as? String,
                   let userId = reply["userId"] as? String {
                    // UVEK prepiši (handlePayload skipuje samo ako je identično).
                    self.handlePayload(["type": "pair_token", "token": token, "user_id": userId])
                    self.tokenIsUncertain = false
                    return
                }

                // "unknown" ili neocekivan oblik - telefon ne zna identitet jos.
                // Zadrzi keš, ostani nesiguran, retry sledeci put.
                print("[WatchPhoneSession] Handshake reply: unknown identity, keeping cache as uncertain")
                self.tokenIsUncertain = true
            }
        }, errorHandler: { [weak self] error in
            DispatchQueue.main.async {
                print("[WatchPhoneSession] Handshake error: \(error.localizedDescription)")
                // Telefon nedostupan - zadrzi keš ali markiraj nesigurnim.
                self?.tokenIsUncertain = true
            }
        })
    }
}

// MARK: - WCSessionDelegate

extension WatchPhoneSession: WCSessionDelegate {

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        if let error = error {
            print("[WatchPhoneSession] Activation error: \(error.localizedDescription)")
            return
        }
        print("[WatchPhoneSession] Activation state: \(activationState.rawValue), reachable: \(session.isReachable)")

        // Cim je sesija spremna, povuci aktuelni identitet sa telefona
        // (pokriva slucaj kada je .task pozvao requestCurrentToken pre aktivacije).
        if activationState == .activated {
            requestCurrentToken()
        }

        // Pri aktivaciji, iOS automatski isporucuje POSLEDNJI applicationContext
        // koji je iPhone poslao - tako da ako je iPhone vec poslao token,
        // ovde se nista ne radi (delegate metoda ce biti pozvana zasebno).
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        // Ova delegate metoda moze biti pozvana sa background queue-a,
        // a @Published mora ici sa main thread-a.
        DispatchQueue.main.async { [weak self] in
            self?.handlePayload(applicationContext)
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any] = [:]) {
        DispatchQueue.main.async { [weak self] in
            self?.handlePayload(userInfo)
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        print("[WatchPhoneSession] Reachability changed: \(session.isReachable)")
    }
}
