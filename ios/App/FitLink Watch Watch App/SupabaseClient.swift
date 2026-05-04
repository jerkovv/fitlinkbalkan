import Foundation

struct UserContextResponse: Codable {
    let userId: String
    let activeWorkout: ActiveWorkoutFromServer?
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case activeWorkout = "active_workout"
    }
}

struct ActiveWorkoutFromServer: Codable {
    let sessionId: String
    let currentExerciseName: String
    let currentSetNumber: Int
    let totalSets: Int
    let currentState: String
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
    case decodingFailed(String)
    case networkError(String)
    case httpError(Int)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Neispravan URL"
        case .invalidResponse: return "Neispravan odgovor sa servera"
        case .invalidToken: return "Token nije validan ili je istekao"
        case .noActiveWorkout: return "Nema aktivnog treninga"
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
        config.waitsForConnectivity = true
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
    func updateHeartRate(token: String, heartRate: Int) async throws -> Bool {
        let body: [String: Any] = [
            "p_token": token,
            "p_heart_rate": heartRate
        ]
        let data = try await callRPC(functionName: "watch_update_workout_hr", body: body)
        
        do {
            let response = try decoder.decode(HRUpdateResponse.self, from: data)
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
    
    @discardableResult
    func completeSet(token: String) async throws -> Bool {
        return try await pressButton(token: token, rpcName: "watch_press_complete_button")
    }
    
    @discardableResult
    func skipRest(token: String) async throws -> Bool {
        return try await pressButton(token: token, rpcName: "watch_press_skip_button")
    }
    
    @discardableResult
    func extendRest(token: String, extraSeconds: Int = 30) async throws -> Bool {
        return try await pressButton(token: token, rpcName: "watch_press_extend_button")
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
