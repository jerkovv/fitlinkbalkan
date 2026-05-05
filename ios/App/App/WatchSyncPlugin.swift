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
