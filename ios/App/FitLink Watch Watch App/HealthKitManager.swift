import Foundation
import HealthKit
import WatchKit
import Combine

@MainActor
final class HealthKitManager: NSObject, ObservableObject {
    
    static let shared = HealthKitManager()
    
    private let healthStore = HKHealthStore()
    
    @Published var currentHeartRate: Int = 0
    // Prosecan puls i aktivne kalorije - iz live statistike workout buildera.
    // Bez nove dozvole: heartRate i activeEnergyBurned su vec u typesToRead.
    @Published var averageHeartRate: Int = 0
    @Published var maxHeartRate: Int = 0
    @Published var activeCalories: Int = 0
    @Published var isAuthorized: Bool = false
    @Published var isWorkoutActive: Bool = false
    
    private var workoutSession: HKWorkoutSession?
    private var workoutBuilder: HKLiveWorkoutBuilder?
    
    var onHeartRateUpdate: ((Int) -> Void)?
    
    // MARK: - Authorization
    
    func requestAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("HealthKit: not available on this device")
            return false
        }
        
        let typesToRead: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        ]
        
        // Share (write) dozvola: pored workout-a, i energija + puls, da bi
        // finishWorkout() upisao activeEnergyBurned i heartRate u sacuvani
        // HKWorkout (inace se trening snimi bez kalorija, pa ih sync ne pokupi).
        let typesToWrite: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKQuantityType.quantityType(forIdentifier: .heartRate)!,
        ]
        
        do {
            try await healthStore.requestAuthorization(toShare: typesToWrite, read: typesToRead)
            isAuthorized = true
            print("HealthKit: authorization granted")
            return true
        } catch {
            print("HealthKit: authorization failed: \(error.localizedDescription)")
            isAuthorized = false
            return false
        }
    }
    
    // MARK: - Start Workout Session
    
    func startWorkoutSession() {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("HealthKit: not available")
            return
        }
        
        if isWorkoutActive {
            print("HealthKit: workout session already active")
            return
        }
        
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        
        do {
            workoutSession = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            workoutBuilder = workoutSession?.associatedWorkoutBuilder()
            
            workoutBuilder?.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: configuration
            )
            
            workoutSession?.delegate = self
            workoutBuilder?.delegate = self
            
            // Reset agregata na pocetku nove sesije.
            averageHeartRate = 0
            maxHeartRate = 0
            activeCalories = 0

            let startDate = Date()
            workoutSession?.startActivity(with: startDate)
            workoutBuilder?.beginCollection(withStart: startDate) { success, error in
                if let error = error {
                    print("HealthKit: beginCollection error: \(error.localizedDescription)")
                } else {
                    print("HealthKit: workout session started successfully")
                }
            }
            
            isWorkoutActive = true
            
        } catch {
            print("HealthKit: failed to start workout session: \(error.localizedDescription)")
        }
    }
    
    // MARK: - Stop Workout Session
    
    func stopWorkoutSession() {
        guard isWorkoutActive else { return }
        
        workoutSession?.end()

        let builder = workoutBuilder
        builder?.endCollection(withEnd: Date()) { _, error in
            if let error = error {
                print("HealthKit: endCollection error: \(error.localizedDescription)")
            }

            builder?.finishWorkout { _, error in
                if let error = error {
                    print("HealthKit: finishWorkout error: \(error.localizedDescription)")
                } else {
                    print("HealthKit: workout finished")
                }
            }
        }
        
        isWorkoutActive = false
        currentHeartRate = 0
        averageHeartRate = 0
        maxHeartRate = 0
        activeCalories = 0
    }
}

// MARK: - HKWorkoutSessionDelegate

extension HealthKitManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor in
            print("HealthKit: workout session state changed: \(fromState.rawValue) -> \(toState.rawValue)")
            
            if toState == .ended {
                self.isWorkoutActive = false
                self.currentHeartRate = 0
            }
        }
    }
    
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            print("HealthKit: workout session failed: \(error.localizedDescription)")
            self.isWorkoutActive = false
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension HealthKitManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // No-op
    }
    
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType else { continue }

            if quantityType == HKObjectType.quantityType(forIdentifier: .heartRate) {
                let statistics = workoutBuilder.statistics(for: quantityType)
                let hrUnit = HKUnit.count().unitDivided(by: HKUnit.minute())

                if let mostRecent = statistics?.mostRecentQuantity() {
                    let bpm = Int(mostRecent.doubleValue(for: hrUnit))

                    // HealthKit povremeno vraća 0 kad optički sensor izgubi
                    // kontakt (pokret, znoj). Drži poslednju validnu vrednost
                    // umesto da treperi UI na praznu.
                    guard bpm > 0 else { continue }

                    // Prosek i max za ceo trening (nad agregatom sesije).
                    let avg = statistics?.averageQuantity().map { Int($0.doubleValue(for: hrUnit)) } ?? 0
                    let mx = statistics?.maximumQuantity().map { Int($0.doubleValue(for: hrUnit)) } ?? 0

                    Task { @MainActor in
                        self.currentHeartRate = bpm
                        if avg > 0 { self.averageHeartRate = avg }
                        if mx > 0 { self.maxHeartRate = mx }
                        self.onHeartRateUpdate?(bpm)
                        print("HealthKit: HR \(bpm) BPM, avg \(avg), max \(mx)")
                    }
                }
            } else if quantityType == HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
                // Aktivne kalorije: kumulativni zbir od pocetka sesije.
                let statistics = workoutBuilder.statistics(for: quantityType)
                if let sum = statistics?.sumQuantity() {
                    let kcal = Int(sum.doubleValue(for: HKUnit.kilocalorie()))
                    Task { @MainActor in
                        self.activeCalories = kcal
                    }
                }
            }
        }
    }
}
