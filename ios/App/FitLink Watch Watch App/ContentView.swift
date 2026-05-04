import SwiftUI
import WatchKit

struct ContentView: View {
    enum AppState {
        case idle
        case activeWorkout
        case rest
        case completed
    }
    
    // PRIVREMENO: hardcoded token za testiranje
    private let pairingToken = "b57d21268a2652edc10280a4a7074d324a90832d5a48ed25"
    
    @State private var currentState: AppState = .idle
    @State private var isPaired: Bool = false
    @State private var isLoading: Bool = false
    @State private var connectionError: String?
    @State private var currentWorkout: ActiveWorkout = .mock
    @State private var heartRate: Int = 0
    @State private var hrTimer: Timer?
    @State private var hrSendCounter: Int = 0
    @State private var lastServerSignature: String = ""
    
    @StateObject private var realtimeClient = SupabaseRealtimeClient()
    
    var body: some View {
        Group {
            switch currentState {
            case .idle:
                idleView
                
            case .activeWorkout:
               ActiveWorkoutView(
    workout: currentWorkout,
    heartRate: $heartRate,
    onCompleteSet: handleCompleteSet,
    onFinishWorkout: handleFinishWorkout
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
            await initializeConnection()
        }
        .onDisappear {
            realtimeClient.disconnect()
            stopMockHRSimulation()
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
        if !isPaired { return "Nije povezano" }
        if !realtimeClient.isConnected { return "Veza prekinuta" }
        return "Povezano"
    }
    
    // MARK: - Init connection
    
    private func initializeConnection() async {
        isLoading = true
        connectionError = nil
        
        do {
            let context = try await SupabaseClient.shared.getUserContext(token: pairingToken)
            
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
            
            // Postavi token pre connect-a (polling klijent koristi token za svaki request)
            realtimeClient.setToken(pairingToken)
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
        // Trening je obrisan iz baze (verovatno završen) - prikaži "Bravo!" screen
        // ako već nismo u completed state-u
        if currentState != .completed && currentState != .idle {
            stopMockHRSimulation()
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
            startMockHRSimulation()
            
        case "rest":
            currentState = .rest
            startMockHRSimulation()
            
        case "completed":
            stopMockHRSimulation()
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
    private func handleFinishWorkout() {
        WKInterfaceDevice.current().play(.success)
        
        Task {
            do {
                try await SupabaseClient.shared.finishWorkout(token: pairingToken)
                print("Watch button: finish_workout sent to iPhone")
            } catch {
                print("Finish workout error: \(error.localizedDescription)")
            }
        }
    }
    private func handleCompleteSet() {
        WKInterfaceDevice.current().play(.success)
        
        Task {
            do {
                try await SupabaseClient.shared.completeSet(token: pairingToken)
                print("Watch button: complete_set sent to iPhone")
            } catch {
                print("Complete set error: \(error.localizedDescription)")
            }
        }
    }
    
    private func handleRestComplete() {
        Task {
            do {
                try await SupabaseClient.shared.skipRest(token: pairingToken)
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
                try await SupabaseClient.shared.skipRest(token: pairingToken)
                print("Watch button: skip_rest sent to iPhone")
            } catch {
                print("Skip rest error: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Mock HR simulator
    
    private func startMockHRSimulation() {
        hrTimer?.invalidate()
        hrSendCounter = 0
        
        hrTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            DispatchQueue.main.async {
                if currentState == .rest {
                    heartRate = Int.random(in: 90...115)
                } else if currentState == .activeWorkout {
                    heartRate = Int.random(in: 125...155)
                }
                
                hrSendCounter += 1
                if hrSendCounter >= 5 && heartRate > 0 {
                    hrSendCounter = 0
                    Task {
                        await sendHeartRateToServer()
                    }
                }
            }
        }
    }
    
    private func stopMockHRSimulation() {
        hrTimer?.invalidate()
        hrTimer = nil
        heartRate = 0
        hrSendCounter = 0
    }
    
    private func sendHeartRateToServer() async {
        guard isPaired, heartRate > 0 else { return }
        
        do {
            try await SupabaseClient.shared.updateHeartRate(
                token: pairingToken,
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