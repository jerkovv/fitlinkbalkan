import SwiftUI
import WatchKit

struct RestTimerView: View {
    // Apsolutni kraj odmora sa servera + offset serverskog sata (ZIVI prop-ovi).
    let restEndsAt: Date?
    let serverClockOffset: TimeInterval
    let nextExerciseName: String
    let nextSet: Int
    let totalSets: Int
    @Binding var heartRate: Int
    let onComplete: () -> Void
    let onSkip: () -> Void
    // +30 ide direktno u motor (watch_extend_rest), kao complete i skip.
    let onAddRest: (Int) -> Void

    // ARHITEKTURA (bez kasnjenja od jednog ciklusa):
    // - `now` je jedini "klok" koji tajmer kuca svake sekunde. Tajmer NE cita
    //   prop-ove (da ne zamrzne stari restEndsAt u closure-u), samo postavlja now.
    // - `secondsRemaining` se racuna u TELU view-a iz ZIVOG prop-a restEndsAt i
    //   now. Kad poll donese novi restEndsAt, telo se odmah preracuna sa svezom
    //   vrednoscu - prikaz skoci istog rendera, bez ogledala punjenog kroz onChange.
    // - Optimisticki watch +30 ide kroz `optimisticEndDate`; prikaz koristi
    //   max(restEndsAt, optimisticEndDate). Cim server dostigne/premasi tu
    //   vrednost, max() vraca serversku - pa nema ni +60 ni kasnjenja, nezavisno
    //   od toga kad se optimisticEndDate ocisti (cisti se poredjenjem vrednosti).
    @State private var now: Date = Date()
    @State private var optimisticEndDate: Date? = nil
    @State private var maxSeconds: Int = 1
    @State private var didComplete: Bool = false
    @State private var timer: Timer?

    // Efektivni kraj = kasniji od serverskog i optimistickog (watch +30).
    private var effectiveEnd: Date? {
        switch (restEndsAt, optimisticEndDate) {
        case let (s?, o?): return max(s, o)
        case let (s?, nil): return s
        case let (nil, o?): return o
        case (nil, nil): return nil
        }
    }

    private func serverNow() -> Date {
        now.addingTimeInterval(serverClockOffset)
    }

    // Racuna se iz ZIVOG prop-a restEndsAt (+ optimistic) i now. Uvek svez.
    // round (.toNearestOrAwayFromZero), ne ceil(.up): mala latencija/clock-offset
    // rezidua cini da prvi interval bude npr 30.00x s -> ceil bi pokazao 31 za pauzu
    // od 30. round pogadja postavljenu vrednost (30); tick je 1s pa se interval smanjuje
    // tacno za 1 -> odbrojavanje 30,29,...,1,0 bez preskoka i bez dupliranja, a kroz 0
    // prolazi pa onComplete (newValue==0 && oldValue>0) okine. Isto pravilo kao na telefonu.
    private var secondsRemaining: Int {
        guard let end = effectiveEnd else { return 0 }
        return max(0, Int(end.timeIntervalSince(serverNow()).rounded()))
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
            maxSeconds = max(secondsRemaining, 1)
            didComplete = false
            startTimer()
        }
        // Svaka promena izracunatog secondsRemaining (svake sekunde, ili ODMAH kad
        // novi restEndsAt stigne kroz poll) -> ovde su SVI prop-ovi svezi.
        .onChange(of: secondsRemaining) { oldValue, newValue in
            let inMs = restEndsAt.map { String($0.timeIntervalSince1970) } ?? "nil"
            let optMs = optimisticEndDate.map { String($0.timeIntervalSince1970) } ?? "nil"
            print("RT tick restEndsAt=\(inMs) offset=\(serverClockOffset) optimistic=\(optMs) remaining=\(newValue)")

            // Prsten raste, nikad ne skace unazad.
            if newValue > maxSeconds { maxSeconds = newValue }

            // Haptika u poslednje 3s.
            if newValue <= 3 && newValue > 0 {
                WKInterfaceDevice.current().play(.click)
            }

            // Zavrsetak odmora - okini jednom. (nil effectiveEnd != kraj odmora)
            if newValue == 0 && oldValue > 0 && !didComplete && effectiveEnd != nil {
                didComplete = true
                WKInterfaceDevice.current().play(.start)
                onComplete()
            }
        }
        // Cim serverski restEndsAt dostigne/premasi optimisticki, ocisti optimistic
        // (POREDJENJEM VREDNOSTI, ne zavisi od onChange tajminga - max() i ovako
        // vec vraca tacnu vrednost, ovo je samo higijena).
        .onChange(of: restEndsAt) { _, newValue in
            let inMs = newValue.map { String($0.timeIntervalSince1970) } ?? "nil"
            let effMs = effectiveEnd.map { String($0.timeIntervalSince1970) } ?? "nil"
            let optMs = optimisticEndDate.map { String($0.timeIntervalSince1970) } ?? "nil"
            print("RT onChange restEndsAt=\(inMs) effectiveEnd=\(effMs) optimistic=\(optMs)")

            if let opt = optimisticEndDate, let s = newValue, s >= opt {
                print("RT optimisticEndDate reset na nil (server \(s.timeIntervalSince1970) >= optimistic \(opt.timeIntervalSince1970))")
                optimisticEndDate = nil
            }
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
    }

    private func startTimer() {
        timer?.invalidate()
        // Tajmer SAMO kuca `now`. Ne cita prop-ove -> nema zamrznutog restEndsAt.
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            DispatchQueue.main.async {
                now = Date()
            }
        }
    }

    private func addThirtySeconds() {
        WKInterfaceDevice.current().play(.click)
        // Optimisticki kraj = trenutni efektivni kraj + 30. Prikaz odmah skoci.
        // Konvergencija: kad server (restEndsAt) dostigne ovu vrednost kroz poll,
        // max(restEndsAt, optimisticEndDate) vraca serversku -> tacno +30, nikad +60.
        let base = effectiveEnd ?? serverNow()
        let newOptimistic = base.addingTimeInterval(30)
        optimisticEndDate = newOptimistic
        didComplete = false
        print("RT optimisticEndDate set na \(newOptimistic.timeIntervalSince1970) [addThirtySeconds]")

        // Posalji na telefon: telefon upise novi rest_ends_at = stari + 30.
        print("RT onAddRest(30) -> salje extend na telefon")
        onAddRest(30)
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
        onSkip: { print("Rest skipped") },
        onAddRest: { s in print("Add rest \(s)") }
    )
}
