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
    let currentExerciseIdx: Int?
    let totalSets: Int
    let currentState: String
    let currentHr: Int?
    // Apsolutni kraj odmora, epoch ms (broj, može null). Double, bez ISO parsiranja.
    let restEndsAtMs: Double?

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case currentExerciseName = "current_exercise_name"
        case currentSetNumber = "current_set_number"
        case currentExerciseIdx = "current_exercise_idx"
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

// Lokalni model treninga (KORAK B): pun plan dana sa servera (watch_get_workout_plan).
// Cilj jednog seta iz watch_get_workout_plan.set_details (izvor istine, per-set).
// reps je sirov tekst (npr "8" ili "8-12"); weight/rest broj ili null.
struct PlannedSet: Codable, Equatable {
    let setNumber: Int
    let reps: String?
    let weightKg: Double?
    let restSeconds: Int?

    enum CodingKeys: String, CodingKey {
        case setNumber = "set_number"
        case reps
        case weightKg = "weight_kg"
        case restSeconds = "rest_seconds"
    }
}

struct PlanExercise: Codable, Equatable {
    let apeId: String
    let exerciseIdx: Int
    let position: Int
    let sets: Int
    let restSeconds: Int
    let repsText: String?
    let plannedReps: Int?
    let plannedWeight: Double?
    let exerciseName: String
    let doneCount: Int
    // Kardio: is_duration_based == true -> minute umesto serija. duration_minutes = cilj.
    // Optional (decodeIfPresent) da STAR kesirani plan (UserDefaults) bez ovih polja i dalje
    // dekodira (nil -> tretira se kao ne-kardio).
    let isDurationBased: Bool?
    let durationMinutes: Int?
    // Per-set ciljevi (izvor istine). Optional/prazno za stare programe pre per-set -> fallback
    // na repsText/plannedReps/plannedWeight.
    let setDetails: [PlannedSet]?

    enum CodingKeys: String, CodingKey {
        case apeId = "ape_id"
        case exerciseIdx = "exercise_idx"
        case position
        case sets
        case restSeconds = "rest_seconds"
        case repsText = "reps_text"
        case plannedReps = "planned_reps"
        case plannedWeight = "planned_weight"
        case exerciseName = "exercise_name"
        case doneCount = "done_count"
        case isDurationBased = "is_duration_based"
        case durationMinutes = "duration_minutes"
        case setDetails = "set_details"
    }
}

// Dekodira JEDNU vezbu bez bacanja greske: neispravan element -> value == nil.
// Tako jedan los unos ne obori CEO plan (inace bi lokalni plan ostao krnj i watch bi
// prerano proglasio trening gotovim posle prve vezbe).
private struct FailablePlanExercise: Decodable {
    let value: PlanExercise?
    init(from decoder: Decoder) throws {
        value = try? PlanExercise(from: decoder)
    }
}

struct WorkoutPlan: Codable {
    let success: Bool
    let sessionId: String?
    let dayId: String?
    let serverNowMs: Double?
    let complete: Bool?
    let exercises: [PlanExercise]

    enum CodingKeys: String, CodingKey {
        case success
        case sessionId = "session_id"
        case dayId = "day_id"
        case serverNowMs = "server_now_ms"
        case complete
        case exercises
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = (try? c.decode(Bool.self, forKey: .success)) ?? false
        sessionId = try? c.decode(String.self, forKey: .sessionId)
        dayId = try? c.decode(String.self, forKey: .dayId)
        serverNowMs = try? c.decode(Double.self, forKey: .serverNowMs)
        complete = try? c.decode(Bool.self, forKey: .complete)
        // LOSSY: dekodiraj vezbu-po-vezbu (FailablePlanExercise nikad ne baca, pa indeks
        // uvek napreduje -> nema beskonacne petlje). Neispravan element se preskace, a
        // SVE ispravne vezbe ostaju u planu (resava "samo prva vezba" -> preuranjen kraj).
        if var arr = try? c.nestedUnkeyedContainer(forKey: .exercises) {
            var out: [PlanExercise] = []
            while !arr.isAtEnd {
                let wrapped = try arr.decode(FailablePlanExercise.self)
                if let ex = wrapped.value { out.append(ex) }
            }
            exercises = out
        } else {
            exercises = []
        }
    }
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

// MARK: - Pokretanje treninga sa sata (watch_list_workouts / watch_start_workout)

struct WatchProgram: Codable {
    let id: String
    let name: String
    let currentDay: Int?
    // Pravi sledeci trening (isto kao telefon) - koristi se za "nastavi" isticanje.
    let nextDayNumber: Int?
    enum CodingKeys: String, CodingKey {
        case id, name
        case currentDay = "current_day"
        case nextDayNumber = "next_day_number"
    }
}

struct WatchWorkoutDay: Codable, Identifiable {
    let dayId: String
    let dayNumber: Int
    let name: String
    let exerciseCount: Int
    var id: String { dayId }
    enum CodingKeys: String, CodingKey {
        case dayId = "day_id"
        case dayNumber = "day_number"
        case name
        case exerciseCount = "exercise_count"
    }
}

struct WatchWorkoutsResponse: Codable {
    let success: Bool
    let program: WatchProgram?   // null -> nema aktivan program
    let days: [WatchWorkoutDay]
}

struct WatchStartWorkoutResponse: Codable {
    let success: Bool
    let sessionId: String?
    let error: String?
    enum CodingKeys: String, CodingKey {
        case success
        case sessionId = "session_id"
        case error
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

    // KORAK B: pun plan dana (vezbe + done_count) za lokalni model treninga.
    func getWorkoutPlan(token: String, sessionId: String) async throws -> WorkoutPlan? {
        let body: [String: Any] = ["p_token": token, "p_session_id": sessionId]
        let data = try await callRPC(functionName: "watch_get_workout_plan", body: body)
        if data.isEmpty || isJSONNull(data) { return nil }
        do {
            return try decoder.decode(WorkoutPlan.self, from: data)
        } catch {
            throw SupabaseError.decodingFailed(error.localizedDescription)
        }
    }

    // Lista programa/dana za pokretanje treninga SA SATA. Mrezni neuspeh baca (picker
    // prikaze "pokusaj ponovo"); ne pravi se nista offline.
    func listWorkouts(token: String) async throws -> WatchWorkoutsResponse {
        let body: [String: String] = ["p_token": token]
        let data = try await callRPC(functionName: "watch_list_workouts", body: body)
        do {
            return try decoder.decode(WatchWorkoutsResponse.self, from: data)
        } catch {
            throw SupabaseError.decodingFailed(error.localizedDescription)
        }
    }

    // Pokrece sesiju na serveru. Na success sat NE gradi stanje rucno - oslanja se na
    // poll (forceRefresh) da preuzme novu sesiju kroz postojeci tok aktivnog treninga.
    func startWorkout(token: String, assignedProgramId: String, dayId: String) async throws -> WatchStartWorkoutResponse {
        let body: [String: Any] = [
            "p_token": token,
            "p_assigned_program_id": assignedProgramId,
            "p_day_id": dayId,
        ]
        let data = try await callRPC(functionName: "watch_start_workout", body: body)
        do {
            return try decoder.decode(WatchStartWorkoutResponse.self, from: data)
        } catch {
            throw SupabaseError.decodingFailed(error.localizedDescription)
        }
    }

    @discardableResult
    func updateHeartRate(token: String, heartRate: Int, sessionId: String, activeCalories: Int? = nil) async throws -> Bool {
        // Sloj 0 (HR keep-alive): server prima tri parametra i odrzava TACNO ovu
        // sesiju zivom bez 5-min uslova, pa puls stize i kad telefon spava.
        // p_active_calories (4. opcioni): kumulativne aktivne kcal sa HealthKita, da ih
        // trener vidi uzivo. Nil se IZOSTAVLJA -> server NULL = "ne diraj" (ne pise 0 preko).
        var body: [String: Any] = [
            "p_token": token,
            "p_heart_rate": heartRate,
            "p_session_id": sessionId
        ]
        if let kcal = activeCalories { body["p_active_calories"] = kcal }
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
        rpe: Double? = nil,
        durationMinutes: Int? = nil
    ) async throws -> Bool {
        // Nil parametri se IZOSTAVLJAJU -> server uzima planirane vrednosti (DEFAULT NULL).
        // Kardio: prosledi se SAMO p_duration_minutes (reps/weight/rpe ostaju nil -> izostaju).
        var body: [String: Any] = ["p_token": token, "p_session_id": sessionId]
        if let reps = reps { body["p_reps"] = reps }
        if let weight = weight { body["p_weight"] = weight }
        if let rpe = rpe { body["p_rpe"] = rpe }
        if let durationMinutes = durationMinutes { body["p_duration_minutes"] = durationMinutes }
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
        hrSeries: [[Int]]? = nil
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
    // Niz parova [t, hr] (t = sekundi od pocetka, hr ceo broj). Stari perzistirani
    // zapisi bez ovog kljuca se dekoduju kao nil (Codable decodeIfPresent).
    let hrSeries: [[Int]]?
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

// MARK: - Perzistencija plana treninga (KORAK B: lokalni model prezivi restart usred treninga)

struct PersistedPlan: Codable {
    let sessionId: String
    let exercises: [PlanExercise]
    let doneCounts: [String: Int]
}

final class WorkoutPlanStore {
    static let shared = WorkoutPlanStore()
    private let defaults = UserDefaults.standard
    private init() {}
    private func key(_ sid: String) -> String { "fitlink.plan.\(sid)" }

    func save(_ plan: PersistedPlan) {
        if let data = try? JSONEncoder().encode(plan) {
            defaults.set(data, forKey: key(plan.sessionId))
        }
    }

    func load(sessionId: String) -> PersistedPlan? {
        guard let data = defaults.data(forKey: key(sessionId)) else { return nil }
        return try? JSONDecoder().decode(PersistedPlan.self, from: data)
    }
}

// MARK: - KORAK C: red set-akcija (perzistovan, FIFO, replay na reconnect)

struct PendingAction: Codable, Equatable {
    enum ActionType: String, Codable { case completeSet = "complete_set"; case finish }
    let id: String
    let type: ActionType
    let sessionId: String
    let reps: Int?
    let weight: Double?
    let rpe: Double?
    // Kardio: ako je postavljeno, replay salje p_duration_minutes (a reps/weight/rpe su nil).
    // Optional -> star perzistovan red (bez ovog kljuca) i dalje dekodira (decodeIfPresent -> nil).
    var durationMinutes: Int? = nil
    let createdAt: Date
    // NAPOMENA: NE cuvamo set_number/exercise_idx - server racuna poziciju iz done-count-a;
    // FIFO replay garantuje da svaka akcija padne na tacnu sledecu poziciju.
}

final class PendingActionStore {
    static let shared = PendingActionStore()
    private let defaults = UserDefaults.standard
    private let queue = DispatchQueue(label: "fitlink.pendingActionStore")
    private init() {}
    private func key(_ sid: String) -> String { "fitlink.actions.\(sid)" }

    func all(sessionId: String) -> [PendingAction] {
        queue.sync { loadLocked(sessionId) }
    }

    func enqueue(_ action: PendingAction) {
        queue.sync {
            var list = loadLocked(action.sessionId)
            list.append(action)            // FIFO: dodaj na kraj
            saveLocked(action.sessionId, list)
        }
    }

    func remove(sessionId: String, id: String) {
        queue.sync {
            var list = loadLocked(sessionId)
            list.removeAll { $0.id == id }
            saveLocked(sessionId, list)
        }
    }

    func isEmpty(sessionId: String) -> Bool {
        queue.sync { loadLocked(sessionId).isEmpty }
    }

    // Svi sessionId-evi sa NEPRAZNIM redom (za flush osirotelih redova prethodnih sesija).
    func allSessionIds() -> [String] {
        queue.sync {
            let prefix = "fitlink.actions."
            return defaults.dictionaryRepresentation().keys
                .filter { $0.hasPrefix(prefix) }
                .map { String($0.dropFirst(prefix.count)) }
                .filter { !loadLocked($0).isEmpty }
        }
    }

    private func loadLocked(_ sid: String) -> [PendingAction] {
        guard let data = defaults.data(forKey: key(sid)) else { return [] }
        return (try? JSONDecoder().decode([PendingAction].self, from: data)) ?? []
    }
    private func saveLocked(_ sid: String, _ list: [PendingAction]) {
        if let data = try? JSONEncoder().encode(list) {
            defaults.set(data, forKey: key(sid))
        }
    }
}

/// Perzistentni flush-pump: dok god ima neki NEPRAZAN red akcija (PendingActionStore), okida
/// onTick (~3s) NEZAVISNO od toga da li je trening aktivan. Kad su svi redovi prazni -> STAJE
/// (stedi bateriju); ponovo krece na enqueue / app start. Resava 20s visenje posle offline
/// zavrsetka: keep-alive tajmer stane na kraju treninga, pa flush vise ne zavisi samo od
/// NWPath online okidaca (koji kasni zbog Bluetooth bridging-a).
@MainActor
final class FlushPump {
    static let shared = FlushPump()
    private init() {}

    var onTick: (() -> Void)?
    private var timer: Timer?
    private let interval: TimeInterval = 3.0

    /// Pokreni pump ako vec ne radi I ako ima sta da se flush-uje. Idempotentno.
    func start() {
        guard timer == nil else { return }
        guard !PendingActionStore.shared.allSessionIds().isEmpty else { return }
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            // Timer closure je nonisolated; skoci na main actor (klasa je @MainActor).
            Task { @MainActor in FlushPump.shared.tick() }
        }
    }

    private func tick() {
        // Kad su svi redovi prazni -> stani (stedi bateriju); ponovo krece na enqueue.
        guard !PendingActionStore.shared.allSessionIds().isEmpty else {
            stop()
            return
        }
        onTick?()
    }

    func stop() {
        guard timer != nil else { return }
        timer?.invalidate()
        timer = nil
    }
}
