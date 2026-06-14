import Foundation

struct UserContextResponse: Codable {
    let userId: String
    let activeWorkout: ActiveWorkoutFromServer?
    // Epoch ms (broj), Double da decode ne pukne na decimalama. Za clock-offset.
    let serverNowMs: Double?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case activeWorkout = "active_workout"
        case serverNowMs = "server_now_ms"
    }
}

struct ActiveWorkoutFromServer: Codable {
    let sessionId: String
    let currentExerciseName: String
    let currentSetNumber: Int
    let totalSets: Int
    let currentState: String
    let currentHr: Int?
    // Apsolutni kraj odmora, epoch ms (broj, može null). Double, bez ISO parsiranja.
    let restEndsAtMs: Double?

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case currentExerciseName = "current_exercise_name"
        case currentSetNumber = "current_set_number"
        case totalSets = "total_sets"
        case currentState = "current_state"
        case currentHr = "current_hr"
        case restEndsAtMs = "rest_ends_at_ms"
    }
}

struct HRUpdateResponse: Codable {
    let success: Bool
    let error: String?
}

struct ButtonPressResponse: Codable {
    let success: Bool
    let error: String?
}

enum SupabaseError: LocalizedError {
    case invalidURL
    case invalidResponse
    case invalidToken
    case noActiveWorkout
    // Server javio da je sesija zavrsena (session_ended / no_live_session) -
    // sat treba da zatvori svoj HealthKit workout i napusti ekran treninga.
    case sessionEnded
    case decodingFailed(String)
    case networkError(String)
    case httpError(Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Neispravan URL"
        case .invalidResponse: return "Neispravan odgovor sa servera"
        case .invalidToken: return "Token nije validan ili je istekao"
        case .noActiveWorkout: return "Nema aktivnog treninga"
        case .sessionEnded: return "Sesija je završena"
        case .decodingFailed(let detail): return "Decoding error: \(detail)"
        case .networkError(let detail): return "Mrežna greška: \(detail)"
        case .httpError(let code): return "HTTP greška: \(code)"
        }
    }
}

final class SupabaseClient {
    static let shared = SupabaseClient()
    
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        // false: bez veze RPC padne ODMAH (umesto da ceka ~15s) -> connectionOK brzo
        // flipuje pa se baner pojavi/sakrije za par sekundi. Offline buffer (pending
        // metrike) hvata neuspele posiljke, pa nema gubitka.
        config.waitsForConnectivity = false
        self.session = URLSession(configuration: config)
        
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }
    
    func getUserContext(token: String) async throws -> UserContextResponse? {
        let body: [String: String] = ["p_token": token]
        let data = try await callRPC(functionName: "watch_get_user_context", body: body)
        
        if data.isEmpty || isJSONNull(data) {
            return nil
        }
        
        do {
            return try decoder.decode(UserContextResponse.self, from: data)
        } catch {
            throw SupabaseError.decodingFailed(error.localizedDescription)
        }
    }
    
    @discardableResult
    func updateHeartRate(token: String, heartRate: Int, sessionId: String) async throws -> Bool {
        // Sloj 0 (HR keep-alive): server prima tri parametra i odrzava TACNO ovu
        // sesiju zivom bez 5-min uslova, pa puls stize i kad telefon spava.
        let body: [String: Any] = [
            "p_token": token,
            "p_heart_rate": heartRate,
            "p_session_id": sessionId
        ]
        let data = try await callRPC(functionName: "watch_update_workout_hr", body: body)
        
        do {
            let response = try decoder.decode(HRUpdateResponse.self, from: data)
            if !response.success, let error = response.error {
                if error == "invalid_token" {
                    throw SupabaseError.invalidToken
                }
                // Sesija je zavrsena na serveru - signal satu da zatvori workout.
                if error == "session_ended" || error == "no_live_session" {
                    throw SupabaseError.sessionEnded
                }
            }
            return response.success
        } catch let error as SupabaseError {
            throw error
        } catch {
            throw SupabaseError.decodingFailed(error.localizedDescription)
        }
    }
    
    @discardableResult
    func completeSet(token: String) async throws -> Bool {
        return try await pressButton(token: token, rpcName: "watch_press_complete_button")
    }
    
    @discardableResult
    func skipRest(token: String) async throws -> Bool {
        return try await pressButton(token: token, rpcName: "watch_press_skip_button")
    }
    
    @discardableResult
    func finishWorkout(token: String) async throws -> Bool {
        return try await pressButton(token: token, rpcName: "watch_press_finish_button")
    }
    // MARK: - Serverski motor treninga (sat zove direktno tokenom, kao watch_poll_state)
    // Ove funkcije UPISUJU stanje na serveru (sledeca pozicija / kraj), pa se sat
    // oslanja na poll da osvezi prikaz. Telefon se ne dira u ovom koraku.

    @discardableResult
    func engineSkipRest(token: String, sessionId: String) async throws -> Bool {
        let body: [String: Any] = ["p_token": token, "p_session_id": sessionId]
        return try await callEngine(rpcName: "watch_skip_rest", body: body)
    }

    @discardableResult
    func engineCompleteSet(
        token: String,
        sessionId: String,
        reps: Int? = nil,
        weight: Double? = nil,
        rpe: Double? = nil
    ) async throws -> Bool {
        // Nil parametri se IZOSTAVLJAJU -> server uzima planirane vrednosti (DEFAULT).
        var body: [String: Any] = ["p_token": token, "p_session_id": sessionId]
        if let reps = reps { body["p_reps"] = reps }
        if let weight = weight { body["p_weight"] = weight }
        if let rpe = rpe { body["p_rpe"] = rpe }
        return try await callEngine(rpcName: "watch_complete_set", body: body)
    }

    @discardableResult
    func engineFinishWorkout(
        token: String,
        sessionId: String,
        activeCalories: Int? = nil,
        hrAvg: Int? = nil,
        hrMax: Int? = nil
    ) async throws -> Bool {
        // Kalorije i puls se snimaju instant na serveru (bez HealthKit sync-a).
        // 0/nedostupno se IZOSTAVLJA -> server param ostaje null (ne lazna nula).
        // hr_series NE salje sat (telefon je izvor); DB param ostaje null (COALESCE).
        var body: [String: Any] = ["p_token": token, "p_session_id": sessionId]
        if let kcal = activeCalories, kcal > 0 { body["p_active_calories"] = kcal }
        if let avg = hrAvg, avg > 0 { body["p_hr_avg"] = avg }
        if let mx = hrMax, mx > 0 { body["p_hr_max"] = mx }
        return try await callEngine(rpcName: "watch_finish_workout", body: body)
    }

    @discardableResult
    func reportMetrics(
        token: String,
        sessionId: String,
        activeCalories: Int?,
        hrAvg: Int?,
        hrMax: Int?,
        hrSeries: [Int]? = nil
    ) async throws -> Bool {
        // Upisuje FINALNE metrike i na VEC ZAVRSENU sesiju (server radi GREATEST pa
        // kasna nula ne moze da pregazi vec upisanu vrednost). Kalorije se salju kao
        // stvarna vrednost (i 0 je validno) - ne pretvaramo 0 u nil. Nil kljuce
        // izostavljamo da ne pisemo null preko postojeceg.
        var body: [String: Any] = ["p_token": token, "p_session_id": sessionId]
        if let kcal = activeCalories { body["p_active_calories"] = kcal }
        if let avg = hrAvg { body["p_hr_avg"] = avg }
        if let mx = hrMax { body["p_hr_max"] = mx }
        if let series = hrSeries { body["p_hr_series"] = series }
        return try await callEngine(rpcName: "watch_report_metrics", body: body)
    }

    @discardableResult
    func engineExtendRest(token: String, sessionId: String, seconds: Int = 30) async throws -> Bool {
        // +30 sada ide kroz motor (server doda p_seconds na rest_ends_at samo ako je
        // current_state rest). Radi i kad telefon spava. Prikaz prati poll; sat ima
        // optimisticki bump kroz effectiveEnd. not_in_rest -> success=false (bez throw).
        let body: [String: Any] = ["p_token": token, "p_session_id": sessionId, "p_seconds": seconds]
        return try await callEngine(rpcName: "watch_extend_rest", body: body)
    }

    // Zajednicki decode za engine RPC-ove. Server vraca jsonb sa bar success/error
    // (complete_set vraca i state/position - ignorisemo ih, izvor istine je poll).
    private func callEngine(rpcName: String, body: [String: Any]) async throws -> Bool {
        let data = try await callRPC(functionName: rpcName, body: body)
        do {
            let response = try decoder.decode(ButtonPressResponse.self, from: data)
            if !response.success, let error = response.error {
                if error == "invalid_token" {
                    throw SupabaseError.invalidToken
                }
                if error == "session_ended" || error == "no_live_session" {
                    throw SupabaseError.sessionEnded
                }
            }
            return response.success
        } catch let error as SupabaseError {
            throw error
        } catch {
            throw SupabaseError.decodingFailed(error.localizedDescription)
        }
    }

    private func pressButton(token: String, rpcName: String) async throws -> Bool {
        let body: [String: String] = ["p_token": token]
        let data = try await callRPC(functionName: rpcName, body: body)
        
        do {
            let response = try decoder.decode(ButtonPressResponse.self, from: data)
            if !response.success, let error = response.error {
                if error == "invalid_token" {
                    throw SupabaseError.invalidToken
                }
            }
            return response.success
        } catch let error as SupabaseError {
            throw error
        } catch {
            throw SupabaseError.decodingFailed(error.localizedDescription)
        }
    }
    
    private func callRPC(functionName: String, body: [String: Any]) async throws -> Data {
        let url = SupabaseConfig.rpcURL(for: functionName)
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(SupabaseConfig.anonKey)", forHTTPHeaderField: "Authorization")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            throw SupabaseError.networkError("Body serialization failed")
        }
        
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let urlErr as URLError {
            // Transportne greske -> networkError (sekundarni offline signal). Eksplicitno
            // navedeni kodovi su tipicni za "nema veze"; ostali URLError su takodje transport.
            switch urlErr.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut,
                 .cannotConnectToHost, .cannotFindHost, .dataNotAllowed:
                throw SupabaseError.networkError(urlErr.localizedDescription)
            default:
                throw SupabaseError.networkError(urlErr.localizedDescription)
            }
        } catch {
            throw SupabaseError.networkError(error.localizedDescription)
        }
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SupabaseError.invalidResponse
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            if let errorString = String(data: data, encoding: .utf8) {
                print("Supabase RPC error: \(errorString)")
            }
            throw SupabaseError.httpError(httpResponse.statusCode)
        }
        
        return data
    }
    
    private func isJSONNull(_ data: Data) -> Bool {
        guard let str = String(data: data, encoding: .utf8) else { return true }
        return str.trimmingCharacters(in: .whitespacesAndNewlines) == "null"
    }
}

// MARK: - Offline buffer za metrike (Problem A: isporuka kad je sat offline na zavrsetku)

struct PendingMetrics: Codable {
    let sessionId: String
    let activeCalories: Int?
    let hrAvg: Int?
    let hrMax: Int?
    let token: String
    let createdAt: Date
}

/// Perzistentni red (UserDefaults JSON) "pending" izvestaja metrika. HealthKit
/// agregati su kompletni i kad je sat bio van veze TOKOM treninga; jedini problem je
/// ISPORUKA na zavrsetku (daleko od telefona, bez WiFi). Cuvamo payload pa flush-ujemo
/// kad se veza vrati. Pristup serijalizovan kroz privatni queue.
final class PendingReportStore {
    static let shared = PendingReportStore()
    private let key = "fitlink.pendingMetrics"
    private let defaults = UserDefaults.standard
    private let queue = DispatchQueue(label: "fitlink.pendingReportStore")

    private init() {}

    func all() -> [PendingMetrics] {
        queue.sync { loadLocked() }
    }

    func add(_ item: PendingMetrics) {
        queue.sync {
            var list = loadLocked()
            list.removeAll { $0.sessionId == item.sessionId }   // jedan pending po sesiji
            list.append(item)
            saveLocked(list)
        }
    }

    func remove(sessionId: String) {
        queue.sync {
            var list = loadLocked()
            list.removeAll { $0.sessionId == sessionId }
            saveLocked(list)
        }
    }

    private func loadLocked() -> [PendingMetrics] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([PendingMetrics].self, from: data)) ?? []
    }

    private func saveLocked(_ list: [PendingMetrics]) {
        if let data = try? JSONEncoder().encode(list) {
            defaults.set(data, forKey: key)
        }
    }
}
