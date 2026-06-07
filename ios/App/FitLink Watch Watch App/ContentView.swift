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
    @Environment(\.scenePhase) private var scenePhase

    // Token iz pair_token payload-a koji je iPhone poslao preko WCSession.
    // Nil = nije upareno → "Uloguj se na iPhone-u". Bez fallback-a:
    // korišćenje tuđeg keširanog tokena bi tiho prikazivalo pogrešne podatke.
    private var effectiveToken: String? {
        phoneSession.pairingToken
    }

    @State private var currentState: AppState = .idle
    @State private var isPaired: Bool = false
    @State private var isLoading: Bool = false
    @State private var connectionError: String?
    @State private var currentWorkout: ActiveWorkout = .mock
    @State private var heartRate: Int = 0
    // Sloj 0: poslednji poznati session_id iz poll-a/realtime-a. Salje se uz svaki
    // HR upis da server odrzi tacno tu sesiju zivom (keep-alive).
    @State private var currentSessionId: String? = nil
    @State private var lastServerSignature: String = ""
    @State private var lastConnectedToken: String? = nil
    // Sloj 2: apsolutni kraj odmora sa servera i offset serverskog sata.
    @State private var restEndsAt: Date? = nil
    @State private var serverClockOffset: TimeInterval = 0

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
                    onCompleteSet: handleCompleteSet,
                    onFinishWorkout: handleFinishWorkout
                )
                
            case .rest:
                RestTimerView(
                    restEndsAt: restEndsAt,
                    serverClockOffset: serverClockOffset,
                    nextExerciseName: currentWorkout.exerciseName,
                    nextSet: currentWorkout.currentSet,
                    totalSets: currentWorkout.totalSets,
                    heartRate: $heartRate,
                    onComplete: handleRestComplete,
                    onSkip: handleRestSkip,
                    onAddRest: handleAddRest
                )
                
            case .completed:
                completedView
            }
        }
        // Vidljiva build oznaka - cisto za potvrdu da sat dobija nove build-ove.
        .overlay(alignment: .bottomTrailing) {
            Text("build T10")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.white.opacity(0.55))
                .padding(.trailing, 4)
                .padding(.bottom, 2)
        }
        .task {
            lastConnectedToken = effectiveToken
            // Handshake (pull): potvrdi ko je trenutno ulogovan na telefonu.
            phoneSession.requestCurrentToken()
            await initializeConnection()
        }
        .onChange(of: scenePhase) { newPhase in
            // Kad sat postane aktivan, ponovo povuci aktuelni identitet.
            if newPhase == .active {
                phoneSession.requestCurrentToken()
            }
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
        if phoneSession.tokenIsUncertain { return .brandWarning }
        if !isPaired { return .brandWarning }
        if !realtimeClient.isConnected { return .brandWarning }
        return .brandSuccess
    }

    private var statusText: String {
        if isLoading { return "Povezivanje..." }
        if let error = connectionError { return error }
        if phoneSession.pairingToken == nil { return "Uloguj se na iPhone-u" }
        // Identitet jos nije potvrdjen handshake-om (telefon bio nedostupan) -
        // ne tvrdi "Povezano" na osnovu starog, nepotvrdjenog keša.
        if phoneSession.tokenIsUncertain { return "Provera naloga…" }
        if !isPaired { return "Nije povezano" }
        if !realtimeClient.isConnected { return "Veza prekinuta" }
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

        guard let token = effectiveToken else {
            // Nema tokena → korisnik nije ulogovan na iPhone-u (ili sync nije
            // stigao). statusText prikazuje "Uloguj se na iPhone-u".
            isPaired = false
            isLoading = false
            return
        }

        do {
            let context = try await SupabaseClient.shared.getUserContext(token: token)

            guard let context = context else {
                isPaired = false
                connectionError = "Token nevažeći"
                isLoading = false
                return
            }

            // Identitet se sada osigurava handshake-om (pull) sa telefona, koji
            // UVEK prepiše keš tokenom trenutno ulogovanog korisnika. Stara
            // mismatch-provera (pairedId vs context.userId) je uklonjena - bila
            // je strukturno mrtva jer server izvodi userId iz samog tokena, pa
            // se keširani pairedUserId i context.userId uvek poklapaju.
            isPaired = true
            print("Watch paired - user: \(context.userId)")

            if let serverWorkout = context.activeWorkout {
                print("Active workout: \(serverWorkout.currentExerciseName) [\(serverWorkout.currentState)]")
                applyServerState(
                    sessionId: serverWorkout.sessionId,
                    exerciseName: serverWorkout.currentExerciseName,
                    setNumber: serverWorkout.currentSetNumber,
                    totalSets: serverWorkout.totalSets,
                    state: serverWorkout.currentState,
                    restEndsAtMs: serverWorkout.restEndsAtMs,
                    serverNowMs: context.serverNowMs
                )
            }

            realtimeClient.onWorkoutStateChange = { row in
                handleRealtimeUpdate(row)
            }
            realtimeClient.onWorkoutDeleted = {
                // Loguje se unutar handleWorkoutDeleted samo kad stvarno deluje
                // (poziva se na svaki null poll, pa bi print ovde bio spam).
                handleWorkoutDeleted()
            }
            realtimeClient.onPollTick = {
                // Dok je identitet nesiguran (telefon bio nedostupan), retry-uj
                // handshake na svaki tick - oporavak cim telefon postane dostupan,
                // bez tranzicije scenePhase (sat moze ostati aktivan tokom treninga).
                if phoneSession.tokenIsUncertain {
                    phoneSession.requestCurrentToken()
                }
            }

            realtimeClient.setToken(token)
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
        // Idempotentno: poziva se i sa svakog null poll-a i iz HR session_ended
        // putanje. Deluje (i loguje) samo na prelazu iz treninga u neutralno.
        guard currentState != .completed && currentState != .idle else { return }
        print("No active workout (poll null / session ended) - leaving workout screen")
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
    
    private func handleRealtimeUpdate(_ row: WorkoutLiveStateRow) {
        guard let exerciseName = row.currentExerciseName,
              let setNumber = row.currentSetNumber,
              let totalSets = row.totalSets,
              let state = row.currentState else {
            print("Realtime: incomplete row, ignoring")
            return
        }
        
        // Sloj 2: dedup mora da ukljuci rest_ends_at_ms da promena tajmera
        // (npr. +30 sa telefona) ne bude tiho odbacena.
        let restKey = row.restEndsAtMs.map { String($0) } ?? "nil"
        let signature = "\(exerciseName)|\(setNumber)|\(state)|\(restKey)"
        if signature == lastServerSignature {
            return
        }
        lastServerSignature = signature

        print("Realtime update: \(exerciseName) - SET \(setNumber)/\(totalSets) [\(state)] restEndsAtMs=\(restKey)")
        applyServerState(
            sessionId: row.sessionLogId,
            exerciseName: exerciseName,
            setNumber: setNumber,
            totalSets: totalSets,
            state: state,
            restEndsAtMs: row.restEndsAtMs,
            serverNowMs: row.serverNowMs
        )
    }

    private func applyServerState(
        sessionId: String?,
        exerciseName: String,
        setNumber: Int,
        totalSets: Int,
        state: String,
        restEndsAtMs: Double?,
        serverNowMs: Double?
    ) {
        // Sloj 0: zapamti zivi session_id da HR keep-alive uvek gadja tacnu sesiju.
        if let sessionId = sessionId {
            currentSessionId = sessionId
        }

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

        // Offset serverskog sata: serverNow - Date(). Display koristi Date() + offset.
        if let serverNowMs = serverNowMs {
            let serverNow = Date(timeIntervalSince1970: serverNowMs / 1000.0)
            serverClockOffset = serverNow.timeIntervalSince(Date())
        }

        switch state {
        case "active":
            restEndsAt = nil
            currentState = .activeWorkout
            startHealthKitWorkout()

        case "rest":
            // Postavi kraj odmora na SVAKI poll (bez guarda "samo na promenu stanja"),
            // da +30 sa telefona odmah produzi tajmer na satu. null = nema tajmera.
            restEndsAt = restEndsAtMs.map { Date(timeIntervalSince1970: $0 / 1000.0) }
            currentState = .rest
            startHealthKitWorkout()

        case "completed":
            restEndsAt = nil
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
            // Engine zove server direktno; sessionId imamo iz poll-a. Bez njega
            // nema zive sesije -> preskoci (poll ce ga uskoro doneti).
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                // Sat prikazuje samo plan -> reps/weight/rpe = nil, server uzima
                // planirane vrednosti. Posle upisa, prikaz prati poll.
                try await SupabaseClient.shared.engineCompleteSet(
                    token: token, sessionId: sessionId, reps: nil, weight: nil, rpe: nil
                )
                print("Watch engine: complete_set [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                print("Watch engine: complete_set -> session ended")
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Complete set error: \(error.localizedDescription)")
            }
        }
    }

    private func handleRestComplete() {
        Task {
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                try await SupabaseClient.shared.engineSkipRest(token: token, sessionId: sessionId)
                print("Watch engine: skip_rest (auto) [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Rest complete error: \(error.localizedDescription)")
            }
        }
    }

    private func handleRestSkip() {
        WKInterfaceDevice.current().play(.click)

        Task {
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                try await SupabaseClient.shared.engineSkipRest(token: token, sessionId: sessionId)
                print("Watch engine: skip_rest [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Skip rest error: \(error.localizedDescription)")
            }
        }
    }

    private func handleFinishWorkout() {
        WKInterfaceDevice.current().play(.success)

        Task {
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                try await SupabaseClient.shared.engineFinishWorkout(token: token, sessionId: sessionId)
                print("Watch engine: finish_workout [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Finish workout error: \(error.localizedDescription)")
            }
        }
    }

    // +30 ide direktno u motor (watch_extend_rest), kao complete i skip. Server
    // doda sekunde na rest_ends_at i vrati kroz poll; sat ima optimisticki bump
    // kroz effectiveEnd. Bez watch_button_events - radi i kad telefon spava.
    private func handleAddRest(_ seconds: Int) {
        Task {
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                try await SupabaseClient.shared.engineExtendRest(
                    token: token, sessionId: sessionId, seconds: seconds
                )
                print("Watch engine: extend_rest (+\(seconds)) [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Extend rest error: \(error.localizedDescription)")
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

                // Sloj 0: salji SVAKI sample dok je workout aktivan. Svaki upis
                // ujedno odrzava sesiju zivom (keep-alive) bez budnog telefona.
                Task {
                    await sendHeartRateToServer()
                }
            }
        }
    }
    
    private func stopHealthKitWorkout() {
        healthKit.stopWorkoutSession()
        healthKit.onHeartRateUpdate = nil
        heartRate = 0
        currentSessionId = nil
    }

    private func sendHeartRateToServer() async {
        // Ako session_id jos nije poznat (nema zive sesije), samo preskoci ovaj
        // sample - bez greske. Cim poll/realtime donese session_id, slanje krene.
        guard isPaired, heartRate > 0, let token = effectiveToken,
              let sessionId = currentSessionId else { return }

        do {
            try await SupabaseClient.shared.updateHeartRate(
                token: token,
                heartRate: heartRate,
                sessionId: sessionId
            )
        } catch SupabaseError.sessionEnded {
            // Trening je zavrsen na serveru, a sat je jos slao puls (fantom).
            // Zatvori HealthKit workout, prestani slanje, napusti ekran treninga.
            print("HR update: session ended on server - closing watch workout")
            await MainActor.run { handleWorkoutDeleted() }
        } catch {
            print("HR update error: \(error.localizedDescription)")
        }
    }
}

#Preview {
    ContentView()
}