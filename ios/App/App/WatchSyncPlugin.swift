// ============================================================================
// UPOZORENJE: Ako pokreneš `npx cap sync`, dodaj `WatchSyncPlugin` nazad u
// `ios/App/App/capacitor.config.json` → `packageClassList`. Ovaj plugin NIJE
// npm paket (živi direktno u App targetu, ne u `plugins/` folderu), pa ga
// `cap sync` ne pronalazi i briše iz liste. Bez te liste Capacitor ne
// registruje plugin → `WatchSync.sendTokenToWatch(...)` baca UNIMPLEMENTED
// → pairing token nikad ne stigne na Watch.
//
// Trajno rešenje: refactor u zasebni lokalni Capacitor plugin paket pod
// `plugins/capacitor-watchsync/` (kao što je `capacitor-healthkit-live`).
// ============================================================================

import Foundation
import Capacitor
import WatchConnectivity

// Capacitor plugin koji salje pairing token sa iPhone-a na Apple Watch
// preko WatchConnectivity framework-a (WCSession.updateApplicationContext).
//
// Payload format:
//   pair: { "type": "pair_token", "token": "...", "user_id": "...", "timestamp": ... }
//   clear: { "type": "clear_token", "timestamp": ... }
//
// Watch razlikuje po "type" polju i azurira UserDefaults.
@objc(WatchSyncPlugin)
public class WatchSyncPlugin: CAPPlugin, WCSessionDelegate {

    private var session: WCSession?

    // Keš poslednjeg identiteta koji je JS pushovao (sendTokenToWatch /
    // clearWatchToken). Sluzi kao izvor za handshake (Watch pull) kada Watch
    // posalje "request_current_token". Token je stabilan po korisniku
    // (get_or_create vraca isti string), pa kesirana vrednost == sveze RPC.
    // Persistuje u UserDefaults da prezivi cold-start app procesa.
    private let cacheTokenKey = "watchsync.cachedToken"
    private let cacheUserIdKey = "watchsync.cachedUserId"
    private let cacheLoggedOutKey = "watchsync.loggedOut"

    override public func load() {
        guard WCSession.isSupported() else {
            print("[WatchSync] WCSession not supported on this device")
            return
        }

        let s = WCSession.default
        s.delegate = self
        s.activate()
        self.session = s
        print("[WatchSync] WCSession.activate() called")
    }

    // MARK: - JS API

    @objc func sendTokenToWatch(_ call: CAPPluginCall) {
        guard let token = call.getString("token"),
              let userId = call.getString("userId") else {
            call.reject("Missing token or userId")
            return
        }

        // Azuriraj handshake keš cim znamo ko je ulogovan, nezavisno od
        // trenutne dostupnosti sata - da Watch pull uvek dobije aktuelni nalog.
        UserDefaults.standard.set(token, forKey: cacheTokenKey)
        UserDefaults.standard.set(userId, forKey: cacheUserIdKey)
        UserDefaults.standard.set(false, forKey: cacheLoggedOutKey)

        guard let session = self.session else {
            call.reject("WCSession not available")
            return
        }

        guard session.activationState == .activated else {
            call.reject("WCSession not yet activated (state: \(session.activationState.rawValue))")
            return
        }

        guard session.isPaired else {
            call.reject("Watch is not paired with this iPhone")
            return
        }

        guard session.isWatchAppInstalled else {
            call.reject("FitLink Watch app is not installed")
            return
        }

        let payload: [String: Any] = [
            "type": "pair_token",
            "token": token,
            "user_id": userId,
            "timestamp": Date().timeIntervalSince1970
        ]

        do {
            // Primarno: updateApplicationContext - cuva poslednji snapshot,
            // garantuje delivery sledeci put kad Watch postane reachable.
            try session.updateApplicationContext(payload)

            // Backup: transferUserInfo - FIFO queue, dodatna pouzdanost
            // u slucaju da Watch app jos nije pokrenuta.
            session.transferUserInfo(payload)

            print("[WatchSync] Token sent to Watch (user: \(userId))")
            call.resolve([
                "success": true,
                "reachable": session.isReachable
            ])
        } catch {
            print("[WatchSync] sendTokenToWatch failed: \(error.localizedDescription)")
            call.reject("Failed to send token: \(error.localizedDescription)")
        }
    }

    @objc func clearWatchToken(_ call: CAPPluginCall) {
        // Odjava: handshake od sada vraca loggedOut dok se neko ne uloguje.
        UserDefaults.standard.set(true, forKey: cacheLoggedOutKey)
        UserDefaults.standard.removeObject(forKey: cacheTokenKey)
        UserDefaults.standard.removeObject(forKey: cacheUserIdKey)

        guard let session = self.session else {
            // Tiho - nema sesije, nema sta da se brise
            call.resolve(["success": true, "skipped": true])
            return
        }

        guard session.activationState == .activated,
              session.isPaired,
              session.isWatchAppInstalled else {
            // Nema upareno ili nije aktivirano - nema sta da se brise
            call.resolve(["success": true, "skipped": true])
            return
        }

        let payload: [String: Any] = [
            "type": "clear_token",
            "timestamp": Date().timeIntervalSince1970
        ]

        do {
            try session.updateApplicationContext(payload)
            session.transferUserInfo(payload)
            print("[WatchSync] Clear token sent to Watch")
            call.resolve(["success": true])
        } catch {
            print("[WatchSync] clearWatchToken failed: \(error.localizedDescription)")
            call.reject("Failed to clear token: \(error.localizedDescription)")
        }
    }

    @objc func isWatchPaired(_ call: CAPPluginCall) {
        guard let session = self.session,
              session.activationState == .activated else {
            call.resolve(["paired": false])
            return
        }
        call.resolve(["paired": session.isPaired])
    }

    @objc func isWatchAppInstalled(_ call: CAPPluginCall) {
        guard let session = self.session,
              session.activationState == .activated else {
            call.resolve(["installed": false])
            return
        }
        call.resolve(["installed": session.isWatchAppInstalled])
    }

    // MARK: - WCSessionDelegate (required)

    public func session(_ session: WCSession,
                        activationDidCompleteWith activationState: WCSessionActivationState,
                        error: Error?) {
        if let error = error {
            print("[WatchSync] Activation error: \(error.localizedDescription)")
            return
        }
        print("[WatchSync] Activation state: \(activationState.rawValue), paired: \(session.isPaired), installed: \(session.isWatchAppInstalled), reachable: \(session.isReachable)")
    }

    // Handshake (pull): Watch trazi identitet trenutno ulogovanog korisnika.
    // Sinhroni odgovor iz keša - brzo, unutar replyHandler timeout-a.
    public func session(_ session: WCSession,
                        didReceiveMessage message: [String : Any],
                        replyHandler: @escaping ([String : Any]) -> Void) {
        guard (message["type"] as? String) == "request_current_token" else {
            replyHandler(["error": "unknown_request"])
            return
        }

        let defaults = UserDefaults.standard
        if defaults.bool(forKey: cacheLoggedOutKey) {
            print("[WatchSync] Handshake → loggedOut")
            replyHandler(["loggedOut": true])
            return
        }

        if let token = defaults.string(forKey: cacheTokenKey),
           let userId = defaults.string(forKey: cacheUserIdKey) {
            print("[WatchSync] Handshake → token for user \(userId)")
            replyHandler(["token": token, "userId": userId])
        } else {
            // Nemamo kesiran identitet (JS jos nije pushovao u ovom procesu).
            // NE tvrdimo loggedOut - Watch zadrzava keš kao nesiguran i pokušava
            // ponovo dok se identitet ne ustanovi.
            print("[WatchSync] Handshake → unknown (no cached identity)")
            replyHandler(["unknown": true])
        }
    }

    public func sessionDidBecomeInactive(_ session: WCSession) {
        print("[WatchSync] Session became inactive")
    }

    public func sessionDidDeactivate(_ session: WCSession) {
        // Pri switch-u Apple ID-a na Watch-u, sesija se deaktivira.
        // Reaktiviraj odmah da bi mogla da prima nove eventove.
        print("[WatchSync] Session deactivated - reactivating")
        WCSession.default.activate()
    }

    public func sessionWatchStateDidChange(_ session: WCSession) {
        print("[WatchSync] Watch state changed - paired: \(session.isPaired), installed: \(session.isWatchAppInstalled)")
    }

    public func sessionReachabilityDidChange(_ session: WCSession) {
        print("[WatchSync] Reachability changed: \(session.isReachable)")
    }
}
