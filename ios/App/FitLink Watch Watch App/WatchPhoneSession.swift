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
