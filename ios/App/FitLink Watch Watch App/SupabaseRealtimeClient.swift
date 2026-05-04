import Foundation
import Combine

struct WorkoutLiveStateRow: Decodable {
    let sessionLogId: String?
    let athleteId: String?
    let currentExerciseName: String?
    let currentSetNumber: Int?
    let totalSets: Int?
    let currentState: String?
    let currentHr: Int?
    let totalCompletedSets: Int?
    
    enum CodingKeys: String, CodingKey {
        case sessionLogId = "session_log_id"
        case athleteId = "athlete_id"
        case currentExerciseName = "current_exercise_name"
        case currentSetNumber = "current_set_number"
        case totalSets = "total_sets"
        case currentState = "current_state"
        case currentHr = "current_hr"
        case totalCompletedSets = "total_completed_sets"
    }
}

@MainActor
final class SupabaseRealtimeClient: ObservableObject {
    
    var onWorkoutStateChange: ((WorkoutLiveStateRow) -> Void)?
    var onWorkoutDeleted: (() -> Void)?  // <-- NOVO: callback za DELETE event
    
    @Published private(set) var isConnected: Bool = false
    
    private var webSocketTask: URLSessionWebSocketTask?
    private var pingTimer: Timer?
    private var reconnectTask: Task<Void, Never>?
    private var userId: String?
    private var refCounter: Int = 0
    
    private var realtimeURL: URL {
        let host = SupabaseConfig.url
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
        let urlString = "wss://\(host)/realtime/v1/websocket?apikey=\(SupabaseConfig.anonKey)&vsn=1.0.0"
        return URL(string: urlString)!
    }
    
    func connect(userId: String) {
        self.userId = userId
        
        disconnect()
        
        let session = URLSession.shared
        webSocketTask = session.webSocketTask(with: realtimeURL)
        webSocketTask?.resume()
        
        listen()
        
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            sendJoinMessage(userId: userId)
        }
        
        startPingTimer()
        
        isConnected = true
    }
    
    func disconnect() {
        pingTimer?.invalidate()
        pingTimer = nil
        reconnectTask?.cancel()
        reconnectTask = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
    }
    
    private func nextRef() -> String {
        refCounter += 1
        return String(refCounter)
    }
    
    private func sendJoinMessage(userId: String) {
        let topic = "realtime:fitlink-watch-\(userId)"
        let ref = nextRef()
        
        let joinPayload: [String: Any] = [
            "topic": topic,
            "event": "phx_join",
            "payload": [
                "config": [
                    "broadcast": [
                        "self": false,
                        "ack": false
                    ],
                    "presence": [
                        "key": ""
                    ],
                    "postgres_changes": [
                        [
                            "event": "*",
                            "schema": "public",
                            "table": "workout_live_state",
                            "filter": "athlete_id=eq.\(userId)"
                        ]
                    ]
                ]
            ],
            "ref": ref,
            "join_ref": ref
        ]
        
        guard let data = try? JSONSerialization.data(withJSONObject: joinPayload),
              let jsonString = String(data: data, encoding: .utf8) else {
            print("Realtime: failed to serialize join message")
            return
        }
        
        print("Realtime: sending join for topic \(topic)")
        
        webSocketTask?.send(.string(jsonString)) { error in
            if let error = error {
                print("Realtime: send join failed: \(error.localizedDescription)")
            } else {
                print("Realtime: join request sent")
            }
        }
    }
    
    private func listen() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let message):
                Task { @MainActor in
                    self.handleMessage(message)
                    self.listen()
                }
                
            case .failure(let error):
                print("Realtime: receive error: \(error.localizedDescription)")
                Task { @MainActor in
                    self.isConnected = false
                    self.scheduleReconnect()
                }
            }
        }
    }
    
    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        guard case .string(let text) = message,
              let data = text.data(using: .utf8) else { return }
        
        do {
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return
            }
            
            let event = json["event"] as? String ?? "unknown"
            
            print("Realtime RAW: event=\(event)")
            
            if event == "postgres_changes" {
                guard let payload = json["payload"] as? [String: Any] else {
                    print("Realtime: postgres_changes bez payload-a")
                    return
                }
                
                // Provera u nested payload.data formatu (standard supabase format)
                if let payloadData = payload["data"] as? [String: Any] {
                    let eventType = payloadData["type"] as? String ?? "UNKNOWN"
                    print("Realtime: \(eventType) on workout_live_state")
                    
                    // KLJUČNO: handle DELETE kao "trening završen"
                    if eventType == "DELETE" {
                        print("Realtime: DELETE detected, treating as workout completed")
                        onWorkoutDeleted?()
                        return
                    }
                    
                    if let recordDict = payloadData["record"] as? [String: Any] {
                        parseAndNotify(recordDict)
                    }
                }
                // Provera u flat payload formatu (alternative format)
                else if let recordDict = payload["record"] as? [String: Any] {
                    let eventType = payload["type"] as? String ?? "UNKNOWN"
                    print("Realtime: \(eventType) on workout_live_state (direct)")
                    
                    if eventType == "DELETE" {
                        print("Realtime: DELETE detected (direct), treating as workout completed")
                        onWorkoutDeleted?()
                        return
                    }
                    
                    parseAndNotify(recordDict)
                }
                // DELETE event mozda dolazi BEZ record polja - samo old_record
                else if let payloadData = payload["data"] as? [String: Any],
                        payloadData["type"] as? String == "DELETE" {
                    print("Realtime: DELETE detected (no record), treating as workout completed")
                    onWorkoutDeleted?()
                }
                else if payload["type"] as? String == "DELETE" {
                    print("Realtime: DELETE detected (flat, no record), treating as workout completed")
                    onWorkoutDeleted?()
                }
                else {
                    print("Realtime: nepoznat postgres_changes format - keys: \(payload.keys.sorted())")
                }
            }
            else if event == "phx_reply" {
                if let payload = json["payload"] as? [String: Any],
                   let status = payload["status"] as? String {
                    print("Realtime: phx_reply status=\(status)")
                    if status == "error", let response = payload["response"] {
                        print("Realtime: ERROR response: \(response)")
                    }
                }
            }
            else if event == "system" {
                if let payload = json["payload"] as? [String: Any],
                   let status = payload["status"] as? String {
                    print("Realtime: system status=\(status)")
                }
            }
            else {
                print("Realtime: unhandled event '\(event)'")
            }
        } catch {
            print("Realtime: parse error: \(error.localizedDescription)")
        }
    }
    
    private func parseAndNotify(_ recordDict: [String: Any]) {
        do {
            let data = try JSONSerialization.data(withJSONObject: recordDict)
            let row = try JSONDecoder().decode(WorkoutLiveStateRow.self, from: data)
            onWorkoutStateChange?(row)
        } catch {
            print("Realtime: decode row error: \(error.localizedDescription)")
        }
    }
    
    private func startPingTimer() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.sendHeartbeat()
            }
        }
    }
    
    private func sendHeartbeat() {
        let heartbeat: [String: Any] = [
            "topic": "phoenix",
            "event": "heartbeat",
            "payload": [:],
            "ref": nextRef()
        ]
        
        guard let data = try? JSONSerialization.data(withJSONObject: heartbeat),
              let jsonString = String(data: data, encoding: .utf8) else { return }
        
        webSocketTask?.send(.string(jsonString)) { error in
            if let error = error {
                print("Realtime: heartbeat failed: \(error.localizedDescription)")
            }
        }
    }
    
    private func scheduleReconnect() {
        reconnectTask?.cancel()
        reconnectTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            
            if !Task.isCancelled, let userId = self.userId {
                print("Realtime: reconnecting...")
                self.connect(userId: userId)
            }
        }
    }
}