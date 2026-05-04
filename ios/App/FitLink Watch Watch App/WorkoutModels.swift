import Foundation

struct ActiveWorkout: Codable, Equatable {
    let workoutId: String
    let exerciseName: String
    let exerciseNameEn: String
    let currentSet: Int
    let totalSets: Int
    let targetReps: Int
    let targetWeight: Double?
    let restSeconds: Int
    
    static let mock = ActiveWorkout(
        workoutId: "test-123",
        exerciseName: "Potisak sa ravne klupe",
        exerciseNameEn: "Bench Press",
        currentSet: 2,
        totalSets: 4,
        targetReps: 8,
        targetWeight: 80.0,
        restSeconds: 90
    )
}

enum HRZone: Int, CaseIterable {
    case rest = 0
    case warmup = 1
    case fatBurn = 2
    case cardio = 3
    case anaerobic = 4
    case maximum = 5
    
    var label: String {
        switch self {
        case .rest: return "Mirovanje"
        case .warmup: return "Zagrejavanje"
        case .fatBurn: return "Sagorevanje"
        case .cardio: return "Kardio"
        case .anaerobic: return "Anaerobno"
        case .maximum: return "Maksimum"
        }
    }
    
    static func zone(for hr: Int, maxHR: Int = 190) -> HRZone {
        let percent = Double(hr) / Double(maxHR)
        switch percent {
        case ..<0.5: return .rest
        case 0.5..<0.6: return .warmup
        case 0.6..<0.7: return .fatBurn
        case 0.7..<0.8: return .cardio
        case 0.8..<0.9: return .anaerobic
        default: return .maximum
        }
    }
}
