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

// Response struct za watch_poll_state RPC
private struct PollStateResponse: Decodable {
    let success: Bool
    let userId: String?
    let workout: PolledWorkout?
    
    enum CodingKeys: String, CodingKey {
        case success
        case userId = "user_id"
        case workout
    }
}

private struct PolledWorkout: Decodable {
    let sessionId: String?
    let currentExerciseName: String?
    let currentSetNumber: Int?
    let totalSets: Int?
    let currentState: String?
    let currentHr: Int?
    
    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case currentExerciseName = "current_exercise_name"
        case currentSetNumber = "current_set_number"
        case totalSets = "total_sets"
        case currentState = "current_state"
        case currentHr = "current_hr"
    }
}

// Klasa zadrzava ISTO IME i ISTI API kao stari WebSocket klijent
// Razlika: unutra koristi REST polling umesto WebSocket-a
@MainActor
final class SupabaseRealtimeClient: ObservableObject {
    
    // Public API - isti kao pre, ContentView se ne menja
    var onWorkoutStateChange: ((WorkoutLiveStateRow) -> Void)?
    var onWorkoutDeleted: (() -> Void)?
    
    @Published private(set) var isConnected: Bool = false
    
    // Polling logika
    private var pollTimer: Timer?
    private var pairingToken: String?
    private var lastWorkoutSignature: String = ""
    private var lastHadWorkout: Bool = false
    private var pollInterval: TimeInterval = 2.0  // 2 sekunde
    private var consecutiveErrors: Int = 0
    
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 12
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()
    
    private let decoder = JSONDecoder()
    
    // Public API: connect prima userId za kompatibilnost, ali interno koristi token
    func connect(userId: String) {
        // userId nam ne treba ovde, ali zadrzavamo signature
        // Token se setuje preko setToken(_:) pre connect-a
        startPolling()
    }
    
    func disconnect() {
        pollTimer?.invalidate()
        pollTimer = nil
        isConnected = false
    }
    
    // Novi metod - postavi token pre connect-a
    func setToken(_ token: String) {
        self.pairingToken = token
    }
    
    private func startPolling() {
        pollTimer?.invalidate()
        consecutiveErrors = 0
        
        // Prvi poll odmah
        Task { @MainActor in
            await pollOnce()
        }
        
        // Setup periodicno
        pollTimer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.pollOnce()
            }
        }
    }
    
    private func pollOnce() async {
        guard let token = pairingToken else {
            print("Polling: no token, skipping")
            return
        }
        
        do {
            let response = try await callPollState(token: token)
            
            // Reset error counter na uspeh
            if consecutiveErrors > 0 {
                print("Polling: recovered after \(consecutiveErrors) errors")
                consecutiveErrors = 0
            }
            
            isConnected = true
            
            guard response.success else {
                print("Polling: server returned success=false")
                return
            }
            
            // Workout state changed?
            if let workout = response.workout {
                handleWorkoutPolled(workout)
                lastHadWorkout = true
            } else {
                // Nema workout-a sad, a pre je bilo - znaci trening je zavrsen
                if lastHadWorkout {
                    print("Polling: workout disappeared, treating as completed")
                    onWorkoutDeleted?()
                    lastHadWorkout = false
                    lastWorkoutSignature = ""
                }
            }
            
        } catch {
            consecutiveErrors += 1
            print("Polling: error #\(consecutiveErrors): \(error.localizedDescription)")
            
            // Posle 3 greske, smatra se da nismo povezani
            if consecutiveErrors >= 3 {
                isConnected = false
            }
            
            // Posle 5 gresaka, povecaj interval (rate limit / spore mreze)
            if consecutiveErrors >= 5 && pollInterval < 10 {
                pollInterval = min(pollInterval * 1.5, 10.0)
                print("Polling: backing off to \(pollInterval)s")
                
                // Restart timer sa novim interval-om
                pollTimer?.invalidate()
                pollTimer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
                    Task { @MainActor in
                        await self?.pollOnce()
                    }
                }
            }
        }
    }
    
    private func handleWorkoutPolled(_ workout: PolledWorkout) {
        guard let exerciseName = workout.currentExerciseName,
              let setNumber = workout.currentSetNumber,
              let totalSets = workout.totalSets,
              let state = workout.currentState else {
            return
        }
        
        let signature = "\(exerciseName)|\(setNumber)|\(state)"
        
        // Dedup - ne baljaj UI ako se nista nije promenilo
        if signature == lastWorkoutSignature {
            return
        }
        lastWorkoutSignature = signature
        
        print("Poll update: \(exerciseName) - SET \(setNumber)/\(totalSets) [\(state)]")
        
        let row = WorkoutLiveStateRow(
            sessionLogId: workout.sessionId,
            athleteId: nil,
            currentExerciseName: exerciseName,
            currentSetNumber: setNumber,
            totalSets: totalSets,
            currentState: state,
            currentHr: workout.currentHr,
            totalCompletedSets: nil
        )
        
        onWorkoutStateChange?(row)
    }
    
    private func callPollState(token: String) async throws -> PollStateResponse {
        let url = SupabaseConfig.rpcURL(for: "watch_poll_state")
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(SupabaseConfig.anonKey)", forHTTPHeaderField: "Authorization")
        
        let body = ["p_token": token]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.init(rawValue: httpResponse.statusCode))
        }
        
        return try decoder.decode(PollStateResponse.self, from: data)
    }
}