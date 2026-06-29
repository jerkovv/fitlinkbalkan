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

    // Akumulirani HR uzorci za zone vezbanja: niz parova [t, hr] (t = cele sekunde od
    // pocetka treninga, hr ceo broj). Punjen u didCollect (throttle ~2s), poslat na kraju.
    private(set) var hrSamples: [[Int]] = []
    private var workoutStartDate: Date?
    private var lastHRSampleAt: Date?

    var onHeartRateUpdate: ((Int) -> Void)?
    // Periodicni keep-alive (svakih 5s dok je sesija aktivna, uklj. rest). Nezavisan od HK
    // HR uzoraka (koji u mirovanju cute 15-30s). ContentView ovde salje poslednji HR serveru.
    var onKeepAlive: (() -> Void)?
    private var keepAliveTimer: Timer?
    private var keepAliveGeneration = 0   // generation guard: samo tekuca generacija sme da tika
    
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
            hrSamples = []
            lastHRSampleAt = nil

            let startDate = Date()
            workoutStartDate = startDate
            workoutSession?.startActivity(with: startDate)
            workoutBuilder?.beginCollection(withStart: startDate) { success, error in
                if let error = error {
                    print("HealthKit: beginCollection error: \(error.localizedDescription)")
                } else {
                    print("HealthKit: workout session started successfully")
                }
            }
            
            isWorkoutActive = true

            // Periodicni keep-alive (5s) dok je sesija aktivna - nezavisan od HK uzoraka,
            // pa watch_last_hr_at ostaje svez i tokom mirovanja (rest).
            startKeepAliveTimer()

        } catch {
            print("HealthKit: failed to start workout session: \(error.localizedDescription)")
        }
    }

    private func startKeepAliveTimer() {
        keepAliveGeneration += 1
        let gen = keepAliveGeneration
        keepAliveTimer?.invalidate()
        keepAliveTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            // Timer closure je nonisolated; skoci na main actor (klasa je @MainActor).
            Task { @MainActor in
                // Generation guard: zakasneli/stari tajmer ne sme da tika za novu sesiju.
                guard HealthKitManager.shared.keepAliveGeneration == gen else { return }
                HealthKitManager.shared.onKeepAlive?()
            }
        }
    }

    private func stopKeepAliveTimer() {
        keepAliveTimer?.invalidate()
        keepAliveTimer = nil
    }

    // SINHRONI lifecycle stop: ugasi keep-alive + deaktiviraj ODMAH (PRE async finalize), da
    // nova sesija odmah moze da startuje HK i da je zakasneli finalize ne pregazi.
    func endLifecycleSync() {
        keepAliveGeneration += 1   // ponisti tekucu generaciju (stari tajmer vise ne tika)
        stopKeepAliveTimer()
        isWorkoutActive = false
    }
    
    // MARK: - Stop Workout Session
    
    func stopWorkoutSession() {
        guard isWorkoutActive else { return }

        stopKeepAliveTimer()
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

    // MARK: - Finalize (graceful)

    /// Zatvori sesiju, SACEKAJ endCollection da builder finalizuje statistiku, pa
    /// procitaj FINALNE agregate (kalorije + HR) i tek onda resetuj. Resava kratke
    /// treninge gde se aktivna energija sumira tek na endCollection (citanje pre toga
    /// vrati 0). Int(...rounded()) da 0.6 kcal ne padne na 0.
    /// Race-safe: builder ref se nil-uje sinhrono pre await, pa paralelni poziv
    /// (auto-finish + rucni finish istovremeno) ne finalizuje dvaput.
    func finalizeAndStop() async -> (calories: Int, hrAvg: Int, hrMax: Int, series: [[Int]]) {
        guard let builder = workoutBuilder else {
            // Vec finalizovano (ili nikad pokrenuto) -> vrati zadnje poznate vrednosti.
            return (activeCalories, averageHeartRate, maxHeartRate, hrSamples)
        }
        workoutBuilder = nil
        let session = workoutSession
        workoutSession = nil

        // NE diramo keepAliveTimer/isWorkoutActive ovde (lifecycle se gasi SINHRONO u
        // endLifecycleSync iz handleWorkoutDeleted) - inace bi zakasneli async finalize ugasio
        // tajmer NOVE sesije (bug 2). finalizeAndStop radi samo HK finalize + citanje metrika.
        if let session = session {
            session.end()
        }

        let endDate = Date()
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            builder.endCollection(withEnd: endDate) { _, _ in cont.resume() }
        }

        let hrUnit = HKUnit.count().unitDivided(by: HKUnit.minute())
        let energyStats = builder.statistics(for: HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!)
        let hrStats = builder.statistics(for: HKQuantityType.quantityType(forIdentifier: .heartRate)!)

        let kcal: Int
        if let sum = energyStats?.sumQuantity() {
            kcal = Int(sum.doubleValue(for: HKUnit.kilocalorie()).rounded())
        } else {
            kcal = activeCalories
        }
        let avg: Int
        if let q = hrStats?.averageQuantity() {
            avg = Int(q.doubleValue(for: hrUnit).rounded())
        } else {
            avg = averageHeartRate
        }
        let mx: Int
        if let q = hrStats?.maximumQuantity() {
            mx = Int(q.doubleValue(for: hrUnit).rounded())
        } else {
            mx = maxHeartRate
        }

        // Snimi HKWorkout u Health (kao i ranije). Fire-and-forget.
        builder.finishWorkout { _, error in
            if let error = error {
                print("HealthKit: finishWorkout error: \(error.localizedDescription)")
            } else {
                print("HealthKit: workout finished (finalize)")
            }
        }

        // Snimi seriju PRE reseta pa je vrati za slanje (zone na rezimeu).
        let series = hrSamples

        // Resetuj samo agregate (lifecycle: isWorkoutActive je vec sinhrono ugasen).
        currentHeartRate = 0
        averageHeartRate = 0
        maxHeartRate = 0
        activeCalories = 0
        hrSamples = []
        lastHRSampleAt = nil
        workoutStartDate = nil

        print("HealthKit: finalize -> kcal=\(kcal), hrAvg=\(avg), hrMax=\(mx), hrSamples=\(series.count)")
        return (kcal, avg, mx, series)
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
                        // Akumuliraj uzorak za zone: najvise jedan na ~2s, par [t, hr].
                        if let start = self.workoutStartDate {
                            let now = Date()
                            if self.lastHRSampleAt == nil || now.timeIntervalSince(self.lastHRSampleAt!) >= 2 {
                                self.lastHRSampleAt = now
                                let t = max(0, Int(now.timeIntervalSince(start)))
                                self.hrSamples.append([t, bpm])
                            }
                        }
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
