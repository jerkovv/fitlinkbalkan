import SwiftUI
import WatchKit

struct RestTimerView: View {
    // Sloj 2: apsolutni kraj odmora sa servera + offset serverskog sata.
    // Odbrojavanje se racuna iz sata (restEndsAt - serverNow), lokalni tajmer
    // samo okida preracun svake sekunde.
    let restEndsAt: Date?
    let serverClockOffset: TimeInterval
    let nextExerciseName: String
    let nextSet: Int
    let totalSets: Int
    @Binding var heartRate: Int
    let onComplete: () -> Void
    let onSkip: () -> Void

    @State private var secondsRemaining: Int = 0
    @State private var maxSeconds: Int = 0
    @State private var timer: Timer?
    // Lokalni +30 (Sloj 2 ostaje lokalno, NE zove watch_set_rest_ends_at).
    @State private var localExtra: TimeInterval = 0
    @State private var didComplete: Bool = false

    // Ogledala ulaznih `let` vrednosti u @State. KLJUCNO: Timer closure hvata
    // `self` (struct) na .onAppear i `restEndsAt`/`serverClockOffset` kao `let`
    // ostaju zamrznuti u toj kopiji. @State se cita/pise kroz spoljni storage,
    // pa stari closure uvek vidi AKTUELNU vrednost. Bez ovoga +30 sa telefona
    // (rast restEndsAt usred odmora) ne menja prikaz - tick preracuna sa starim.
    @State private var endDate: Date? = nil
    @State private var clockOffset: TimeInterval = 0

    private func syncFromInputs() {
        endDate = restEndsAt
        clockOffset = serverClockOffset
    }

    private func serverNow() -> Date {
        Date().addingTimeInterval(clockOffset)
    }

    private func computeRemaining() -> Int {
        guard let end = endDate else { return 0 }
        let delta = end.addingTimeInterval(localExtra).timeIntervalSince(serverNow())
        return max(0, Int(delta.rounded()))
    }

    private var progress: Double {
        guard maxSeconds > 0 else { return 0 }
        return 1.0 - (Double(secondsRemaining) / Double(maxSeconds))
    }
    
    private var formattedTime: String {
        let minutes = secondsRemaining / 60
        let seconds = secondsRemaining % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
    
    private var isLastFiveSeconds: Bool {
        secondsRemaining <= 5 && secondsRemaining > 0
    }
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 0) {
                HStack {
                    Text("PAUZA")
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(2.5)
                        .foregroundColor(.textMuted)
                    
                    Spacer()
                    
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.brandDestructive)
                        Text("\(heartRate)")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                    }
                }
                .padding(.horizontal, 6)
                .padding(.top, 4)
                
                Spacer(minLength: 4)
                
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.06), lineWidth: 6)
                    
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(
                            AngularGradient(
                                colors: [.brandViolet, .brandIndigo, .brandMagenta, .brandViolet],
                                center: .center
                            ),
                            style: StrokeStyle(lineWidth: 6, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 1), value: progress)
                        .shadow(color: Color.brandViolet.opacity(0.5), radius: 6)
                    
                    Text(formattedTime)
                        .font(.system(size: 42, weight: .heavy, design: .rounded))
                        .tracking(-2)
                        .foregroundColor(isLastFiveSeconds ? .brandWarning : .white)
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.snappy, value: secondsRemaining)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                }
                .frame(width: 120, height: 120)
                
                Spacer(minLength: 3)
                
                VStack(spacing: 1) {
                    Text("SLEDI - SET \(nextSet)/\(totalSets)")
                        .font(.system(size: 8, weight: .heavy))
                        .tracking(1.5)
                        .foregroundColor(.brandViolet)
                    Text(nextExerciseName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .padding(.bottom, 4)
                
                HStack(spacing: 4) {
                    Button(action: addThirtySeconds) {
                        HStack(spacing: 2) {
                            Image(systemName: "plus")
                                .font(.system(size: 10, weight: .bold))
                            Text("30s")
                                .font(.system(size: 12, weight: .bold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                    }
                    .background(Color.white.opacity(0.08))
                    .clipShape(Capsule())
                    .foregroundColor(.white)
                    .buttonStyle(.plain)
                    
                    Button(action: skip) {
                        Text("Preskoči")
                            .font(.system(size: 12, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 7)
                    }
                    .background(Color.white.opacity(0.05))
                    .clipShape(Capsule())
                    .foregroundColor(.textMuted)
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 4)
            }
            .padding(.horizontal, 4)
        }
        .onAppear {
            syncFromInputs()
            resetBaseline()
            startTimer()
        }
        .onChange(of: restEndsAt) { _ in
            // Novi rest ili produzen rest (npr. +30 sa telefona) - preuzmi novu
            // vrednost u @State ogledalo i preracunaj. localExtra se ponistava
            // jer server sad nosi puno trajanje.
            localExtra = 0
            syncFromInputs()
            resetBaseline()
        }
        .onChange(of: serverClockOffset) { _ in
            // Osvezi offset serverskog sata da tick racuna iz aktuelne vrednosti.
            clockOffset = serverClockOffset
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
    }

    // Postavi baseline za prsten i preostalo vreme iz trenutnog sata.
    private func resetBaseline() {
        let remaining = computeRemaining()
        secondsRemaining = remaining
        maxSeconds = max(remaining, 1)
        didComplete = false
    }

    private func tick() {
        let prev = secondsRemaining
        let remaining = computeRemaining()
        secondsRemaining = remaining
        if remaining > maxSeconds {
            maxSeconds = remaining
        }

        if remaining <= 3 && remaining > 0 && remaining != prev {
            WKInterfaceDevice.current().play(.click)
        }

        // Ne okidaj zavrsetak ako jos nemamo rest_ends_at sa servera (nil != kraj odmora).
        if remaining == 0 && !didComplete && restEndsAt != nil {
            didComplete = true
            WKInterfaceDevice.current().play(.start)
            timer?.invalidate()
            timer = nil
            onComplete()
        }
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            DispatchQueue.main.async {
                tick()
            }
        }
    }

    private func addThirtySeconds() {
        // Sloj 2: lokalno produzenje, ne dira server.
        WKInterfaceDevice.current().play(.click)
        localExtra += 30
        didComplete = false
        let remaining = computeRemaining()
        secondsRemaining = remaining
        if remaining > maxSeconds {
            maxSeconds = remaining
        }
    }
    
    private func skip() {
        WKInterfaceDevice.current().play(.click)
        timer?.invalidate()
        timer = nil
        onSkip()
    }
}

#Preview {
    RestTimerView(
        restEndsAt: Date().addingTimeInterval(90),
        serverClockOffset: 0,
        nextExerciseName: "Potisak sa ravne klupe",
        nextSet: 3,
        totalSets: 4,
        heartRate: .constant(118),
        onComplete: { print("Rest complete") },
        onSkip: { print("Rest skipped") }
    )
}
