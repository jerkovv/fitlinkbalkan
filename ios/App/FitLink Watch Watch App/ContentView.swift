import SwiftUI
import WatchKit

struct ContentView: View {
    enum AppState {
        case idle
        case activeWorkout
        case rest
        case completed
    }
    
    @StateObject private var phoneSession = WatchPhoneSession.shared

    // FALLBACK za development. Ukloniti pre App Store launch-a.
    // Ako pairing preko WCSession nije stigao (bug, prvi launch, dev test),
    // koristi hardcoded token za apgrejdpremium2 nalog da Watch i dalje radi.
    private var effectiveToken: String {
        phoneSession.pairingToken ?? "b57d21268a2652edc10280a4a7074d324a90832d5a48ed25"
    }

    @State private var currentState: AppState = .idle
    @State private var isPaired: Bool = false
    @State private var isLoading: Bool = false
    @State private var connectionError: String?
    @State private var currentWorkout: ActiveWorkout = .mock
    @State private var heartRate: Int = 0
    @State private var hrSendCounter: Int = 0
    @State private var lastServerSignature: String = ""
    @State private var lastConnectedToken: String? = nil

    @StateObject private var realtimeClient = SupabaseRealtimeClient()
    @StateObject private var healthKit = HealthKitManager.shared
    
    var body: some View {
        Group {
            switch currentState {
            case .idle:
                idleView
                
            case .activeWorkout:
                ActiveWorkoutView(
                    workout: currentWorkout,
                    heartRate: $heartRate,
                    onCompleteSet: handleCompleteSet
                )
                
            case .rest:
                RestTimerView(
                    totalSeconds: currentWorkout.restSeconds,
                    nextExerciseName: currentWorkout.exerciseName,
                    nextSet: currentWorkout.currentSet,
                    totalSets: currentWorkout.totalSets,
                    heartRate: $heartRate,
                    onComplete: handleRestComplete,
                    onSkip: handleRestSkip
                )
                
            case .completed:
                completedView
            }
        }
        .task {
            lastConnectedToken = effectiveToken
            await initializeConnection()
        }
        .onChange(of: phoneSession.pairingToken) { _ in
            // Token primljen sa iPhone-a (login, refresh) ili obrisan (logout).
            // Reconnect samo ako se efektivni token zaista promenio.
            let newToken = effectiveToken
            guard newToken != lastConnectedToken else { return }
            lastConnectedToken = newToken
            print("[ContentView] Token changed - reconnecting (paired: \(phoneSession.pairingToken != nil))")
            Task {
                realtimeClient.disconnect()
                await initializeConnection()
            }
        }
        .onDisappear {
            realtimeClient.disconnect()
            stopHealthKitWorkout()
        }
    }
    
    // MARK: - Idle screen
    private var idleView: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            RadialGradient(
                colors: [Color.brandViolet.opacity(0.18), Color.clear],
                center: .top,
                startRadius: 0,
                endRadius: 120
            )
            .ignoresSafeArea()
            
            VStack(spacing: 8) {
                HStack(spacing: 5) {
                    if isLoading {
                        ProgressView()
                            .scaleEffect(0.5)
                            .frame(width: 8, height: 8)
                    } else {
                        Circle()
                            .fill(statusColor)
                            .frame(width: 6, height: 6)
                    }
                    Text(statusText)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.textMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .padding(.top, 2)
                
                Spacer()
                
                VStack(spacing: 0) {
                    Text("FitLink")
                        .font(.system(size: 28, weight: .heavy))
                        .tracking(-0.7)
                        .foregroundColor(.white)
                    
                    Text("Balkan")
                        .font(.system(size: 16, weight: .bold))
                        .tracking(-0.4)
                        .foregroundStyle(LinearGradient.brandGradient)
                }
                
                Spacer()
                
                Text("Pokreni trening na iPhone-u")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.textMuted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 8)
                    .background(Color.white.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
        }
    }
    
    // MARK: - Completed screen
    private var completedView: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            RadialGradient(
                colors: [Color.brandSuccess.opacity(0.3), Color.clear],
                center: .center,
                startRadius: 0,
                endRadius: 150
            )
            .ignoresSafeArea()
            
            VStack(spacing: 12) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 50, weight: .bold))
                    .foregroundColor(.brandSuccess)
                    .shadow(color: Color.brandSuccess.opacity(0.6), radius: 12)
                
                VStack(spacing: 2) {
                    Text("Bravo!")
                        .font(.system(size: 24, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundColor(.white)
                    
                    Text("Trening završen")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.textMuted)
                }
            }
        }
    }
    
    // MARK: - Computed
    
    private var statusColor: Color {
        if !isPaired { return .brandWarning }
        if !realtimeClient.isConnected { return .brandWarning }
        return .brandSuccess
    }
    
    private var statusText: String {
        if isLoading { return "Povezivanje..." }
        if let error = connectionError { return error }
        if !isPaired {
            // Bez pravog tokena i bez fallback-a (kad fallback bude uklonjen u prod)
            if phoneSession.pairingToken == nil && effectiveToken.isEmpty {
                return "Uloguj se na iPhone-u"
            }
            return "Nije povezano"
        }
        if !realtimeClient.isConnected { return "Veza prekinuta" }
        // Paired i konektovano - ali koristimo fallback token (dev)
        if phoneSession.pairingToken == nil {
            return "Dev mode"
        }
        return "Povezano"
    }
    
    // MARK: - Init connection
    
    private func initializeConnection() async {
        isLoading = true
        connectionError = nil
        
        // Zatraži HealthKit dozvolu odmah na pokretanju
        if !healthKit.isAuthorized {
            _ = await healthKit.requestAuthorization()
        }
        
        do {
            let context = try await SupabaseClient.shared.getUserContext(token: effectiveToken)
            
            guard let context = context else {
                isPaired = false
                connectionError = "Token nevažeći"
                isLoading = false
                return
            }
            
            isPaired = true
            print("Watch paired - user: \(context.userId)")
            
            if let serverWorkout = context.activeWorkout {
                print("Active workout: \(serverWorkout.currentExerciseName) [\(serverWorkout.currentState)]")
                applyServerState(
                    exerciseName: serverWorkout.currentExerciseName,
                    setNumber: serverWorkout.currentSetNumber,
                    totalSets: serverWorkout.totalSets,
                    state: serverWorkout.currentState
                )
            }
            
            realtimeClient.onWorkoutStateChange = { row in
                handleRealtimeUpdate(row)
            }
            realtimeClient.onWorkoutDeleted = {
                print("Workout deleted from server - showing completed screen")
                handleWorkoutDeleted()
            }
            
            realtimeClient.setToken(effectiveToken)
            realtimeClient.connect(userId: context.userId)
            
        } catch {
            isPaired = false
            connectionError = "Greška konekcije"
            print("Connection error: \(error.localizedDescription)")
        }
        
        isLoading = false
    }
    
    // MARK: - Realtime sync
    
    private func handleWorkoutDeleted() {
        if currentState != .completed && currentState != .idle {
            stopHealthKitWorkout()
            WKInterfaceDevice.current().play(.success)
            currentState = .completed
            
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if currentState == .completed {
                    currentState = .idle
                    currentWorkout = .mock
                    lastServerSignature = ""
                }
            }
        }
    }
    
    private func handleRealtimeUpdate(_ row: WorkoutLiveStateRow) {
        guard let exerciseName = row.currentExerciseName,
              let setNumber = row.currentSetNumber,
              let totalSets = row.totalSets,
              let state = row.currentState else {
            print("Realtime: incomplete row, ignoring")
            return
        }
        
        let signature = "\(exerciseName)|\(setNumber)|\(state)"
        if signature == lastServerSignature {
            return
        }
        lastServerSignature = signature
        
        print("Realtime update: \(exerciseName) - SET \(setNumber)/\(totalSets) [\(state)]")
        applyServerState(
            exerciseName: exerciseName,
            setNumber: setNumber,
            totalSets: totalSets,
            state: state
        )
    }
    
    private func applyServerState(
        exerciseName: String,
        setNumber: Int,
        totalSets: Int,
        state: String
    ) {
        currentWorkout = ActiveWorkout(
            workoutId: currentWorkout.workoutId,
            exerciseName: exerciseName,
            exerciseNameEn: exerciseName,
            currentSet: setNumber,
            totalSets: totalSets,
            targetReps: 10,
            targetWeight: nil,
            restSeconds: 90
        )
        
        switch state {
        case "active":
            currentState = .activeWorkout
            startHealthKitWorkout()
            
        case "rest":
            currentState = .rest
            startHealthKitWorkout()
            
        case "completed":
            stopHealthKitWorkout()
            WKInterfaceDevice.current().play(.success)
            currentState = .completed
            
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if currentState == .completed {
                    currentState = .idle
                    currentWorkout = .mock
                    lastServerSignature = ""
                }
            }
            
        default:
            break
        }
    }
    
    // MARK: - Watch akcije
    
    private func handleCompleteSet() {
        WKInterfaceDevice.current().play(.success)
        
        Task {
            do {
                try await SupabaseClient.shared.completeSet(token: effectiveToken)
                print("Watch button: complete_set sent to iPhone")
            } catch {
                print("Complete set error: \(error.localizedDescription)")
            }
        }
    }
    
    private func handleRestComplete() {
        Task {
            do {
                try await SupabaseClient.shared.skipRest(token: effectiveToken)
                print("Watch button: skip_rest (auto) sent to iPhone")
            } catch {
                print("Rest complete error: \(error.localizedDescription)")
            }
        }
    }
    
    private func handleRestSkip() {
        WKInterfaceDevice.current().play(.click)
        
        Task {
            do {
                try await SupabaseClient.shared.skipRest(token: effectiveToken)
                print("Watch button: skip_rest sent to iPhone")
            } catch {
                print("Skip rest error: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - HealthKit
    
    private func startHealthKitWorkout() {
        guard !healthKit.isWorkoutActive else { return }
        
        Task {
            // Ako nema dozvole, pokušaj ponovo
            if !healthKit.isAuthorized {
                let granted = await healthKit.requestAuthorization()
                if !granted {
                    print("HealthKit dozvola odbijena")
                    return
                }
            }
            
            // Pokreni workout session - HR ce se automatski citati
            healthKit.startWorkoutSession()
            
            // Listener za HR update-ove
            healthKit.onHeartRateUpdate = { bpm in
                heartRate = bpm
                
                // Salji u bazu svake 5 update-a (~5 sekundi)
                hrSendCounter += 1
                if hrSendCounter >= 5 {
                    hrSendCounter = 0
                    Task {
                        await sendHeartRateToServer()
                    }
                }
            }
        }
    }
    
    private func stopHealthKitWorkout() {
        healthKit.stopWorkoutSession()
        healthKit.onHeartRateUpdate = nil
        heartRate = 0
        hrSendCounter = 0
    }
    
    private func sendHeartRateToServer() async {
        guard isPaired, heartRate > 0 else { return }
        
        do {
            try await SupabaseClient.shared.updateHeartRate(
                token: effectiveToken,
                heartRate: heartRate
            )
        } catch {
            print("HR update error: \(error.localizedDescription)")
        }
    }
}

#Preview {
    ContentView()
}