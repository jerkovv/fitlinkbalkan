import SwiftUI
import WatchKit
import Combine    // <-- DODAJ OVU LINIJU

extension HRZone {
    var color: Color {
        switch self {
        case .rest: return .gray
        case .warmup: return Color(red: 0.4, green: 0.6, blue: 0.9)
        case .fatBurn: return Color(red: 0.3, green: 0.7, blue: 1.0)
        case .cardio: return .brandSuccess
        case .anaerobic: return .brandWarning
        case .maximum: return .brandDestructive
        }
    }
}

struct ActiveWorkoutView: View {
    let workout: ActiveWorkout
    @Binding var heartRate: Int
    // Trajanje treninga: apsolutni pocetak sesije (epoch ms) + serverski clock
    // offset. Isti izvor kao zonski ekran, tacno i prezivi otkljucavanje.
    let startedAtMs: Double?
    let serverClockOffset: TimeInterval
    let onCompleteSet: () -> Void
    // Kardio (is_duration_based): zavrsetak vezbe nosi unete minute.
    let onCompleteCardio: (Int) -> Void
    let onFinishWorkout: () -> Void

    // "Završi trening" se ne vidi na glavnom ekranu - otvara se dugim pritiskom
    // (long press) bilo gde, pa potvrda da/ne, da ne dođe do slučajnog kraja.
    @State private var showFinishConfirm = false

    // Kardio stepper: minute za tekucu vezbu. cardioCrown je Double izvor za Digital Crown,
    // sinhronizovan sa cardioMinutes. cardioInitedFor: po promeni vezbe re-init iz plana
    // (ne resetuje se na obican re-render, pa korisnikovo podesavanje ostaje).
    @State private var cardioMinutes: Int = 20
    @State private var cardioCrown: Double = 20
    @State private var cardioInitedFor: String? = nil

    private func ensureCardioInit() {
        guard workout.isDurationBased else { return }
        if cardioInitedFor != workout.exerciseName {
            cardioInitedFor = workout.exerciseName
            let v = max(1, min(240, workout.durationMinutes ?? 20))
            cardioMinutes = v
            cardioCrown = Double(v)
        }
    }

    private func setCardioMinutes(_ v: Int) {
        let c = max(1, min(240, v))
        cardioMinutes = c
        cardioCrown = Double(c)
    }

    private var zone: HRZone {
        HRZone.zone(for: heartRate)
    }

    // Proteklo vreme kao H:MM:SS (zivi tajmer otkucava sekunde), uvek sa satom da
    // minuti nikad ne predju 60: 5min -> "0:05:00", 45min -> "0:45:00", 89min -> "1:29:00".
    private func durationString(_ elapsed: Int) -> String {
        let s = max(0, elapsed)
        return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
    }
    
    var body: some View {
        // Kardio: ScrollView sa svim u vertikalnom toku (dugme ispod steppera). Snaga:
        // postojeci jednoekranski raspored. Zajednicki: long-press za kraj treninga + init.
        Group {
            if workout.isDurationBased {
                cardioBody
            } else {
                strengthBody
            }
        }
        // Kardio: init stepper iz plana na prvi prikaz i na prelaz na novu vezbu.
        .onAppear { ensureCardioInit() }
        .onChange(of: workout.exerciseName) { _ in ensureCardioInit() }
        // Dugi pritisak bilo gde otvara potvrdu za kraj treninga.
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: 0.6) {
            WKInterfaceDevice.current().play(.click)
            showFinishConfirm = true
        }
        .confirmationDialog(
            "Završi trening?",
            isPresented: $showFinishConfirm,
            titleVisibility: .visible
        ) {
            Button("Završi trening", role: .destructive) {
                WKInterfaceDevice.current().play(.success)
                onFinishWorkout()
            }
            Button("Otkaži", role: .cancel) {}
        }
    }

    // Snaga: postojeci jednoekranski raspored (bez skrola, sve unutar safe zone).
    private var strengthBody: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 8) {
                exerciseHeader
                heartRateDisplay
                targetInfo
                completeSetButton
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, 10)
            .padding(.top, 20)
            .padding(.bottom, 16)
        }
    }

    // Kardio: BEZ ScrollView-a (Digital Crown vozi stepper, ne skrol). Sadrzaj (naziv, HR,
    // stepper, "Cilj") centriran preko Spacer-a u VStack-u koji popunjava ekran; dugme "Zavrsi
    // vezbu" u safeAreaInset(.bottom) -> rezervise svoju visinu, sadrzaj se slaze IZNAD njega,
    // pa nema ni preklapanja ni secenja. Sve staje na jedan ekran.
    private var cardioBody: some View {
        VStack(spacing: 6) {
            Spacer(minLength: 0)

            Text(workout.exerciseName)
                .font(.zoneNum(15, .bold))
                .foregroundColor(.white)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)

            cardioHrBadge

            cardioMinutesControl

            if let target = workout.durationMinutes {
                Text("Cilj: \(target) min")
                    .font(.zoneNum(11, .semibold))
                    .foregroundColor(.textMuted)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 8)
        .background(Color.black.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            cardioFinishButton
                .padding(.horizontal)
                .padding(.bottom, 2)
        }
    }

    private var exerciseHeader: some View {
        VStack(spacing: 2) {
            // Kardio: bez "SET X / Y" (prikazuje se samo naziv vezbe).
            if !workout.isDurationBased {
                Text("SET \(workout.currentSet) / \(workout.totalSets)")
                    .font(.zoneNum(10, .bold))
                    .tracking(1.5)
                    .monospacedDigit()
                    .foregroundColor(.textMuted)
            }

            Text(workout.exerciseName)
                .font(.zoneNum(14, .bold))
                .foregroundColor(.white)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)

            workoutTimer
        }
        .padding(.top, 2)
    }

    // Diskretno trajanje treninga ispod naziva vezbe. Tika svake sekunde,
    // racuna se iz servernog pocetka + clock offset (prezivi otkljucavanje).
    private var workoutTimer: some View {
        Group {
            if let startMs = startedAtMs {
                TimelineView(.periodic(from: .now, by: 1.0)) { _ in
                    let serverNowSec = Date().timeIntervalSince1970 + serverClockOffset
                    let elapsed = Int(max(0, serverNowSec - startMs / 1000.0))
                    HStack(spacing: 3) {
                        Image(systemName: "stopwatch")
                            .font(.system(size: 8, weight: .bold))
                        Text(durationString(elapsed))
                            .font(.zoneNum(11, .bold))
                            .monospacedDigit()
                    }
                    .foregroundColor(.textMuted)
                }
            }
        }
    }
    
    private var heartRateDisplay: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(zone.color)
                    .scaleEffect(heartRate > 0 ? 1.0 : 0.8)
                    .animation(
                        .easeInOut(duration: 0.5)
                        .repeatForever(autoreverses: true),
                        value: heartRate
                    )
                
                Text("\(heartRate)")
                    .font(.zoneNum(44, .heavy))
                    .monospacedDigit()
                    .foregroundColor(zone.color)
                    .contentTransition(.numericText())

                Text("BPM")
                    .font(.zoneNum(9, .bold))
                    .tracking(1.0)
                    .foregroundColor(.textMuted)
                    .offset(y: -8)
            }

            Text(zone.label.uppercased())
                .font(.zoneNum(9, .bold))
                .tracking(1.2)
                .foregroundColor(zone.color.opacity(0.9))
        }
    }
    
    private var targetInfo: some View {
        HStack(spacing: 8) {
            VStack(spacing: 0) {
                Text(workout.targetRepsText ?? "\(workout.targetReps)")
                    .font(.zoneNum(16, .bold))
                    .monospacedDigit()
                    .foregroundColor(.white)
                Text("PON.")
                    .font(.zoneNum(8, .bold))
                    .tracking(1.0)
                    .foregroundColor(.textMuted)
            }
            .frame(maxWidth: .infinity)
            
            Rectangle()
                .fill(Color.hairline)
                .frame(width: 1, height: 24)
            
            VStack(spacing: 0) {
                if let weight = workout.targetWeight {
                    Text("\(Int(weight))")
                        .font(.zoneNum(16, .bold))
                        .monospacedDigit()
                        .foregroundColor(.white)
                    Text("KG")
                        .font(.zoneNum(8, .bold))
                        .tracking(1.0)
                        .foregroundColor(.textMuted)
                } else {
                    Text("BW")
                        .font(.zoneNum(14, .bold))
                        .foregroundColor(.white)
                    Text("TEŽINA")
                        .font(.zoneNum(8, .bold))
                        .tracking(1.0)
                        .foregroundColor(.textMuted)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.surfaceCard)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.hairline, lineWidth: 1)
                )
        )
    }
    
    private var completeSetButton: some View {
        Button(action: {
            WKInterfaceDevice.current().play(.success)
            onCompleteSet()
        }) {
            HStack(spacing: 5) {
                Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .bold))
                Text("Završio set")
                    .font(.zoneNum(14, .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
        }
        .background(LinearGradient.brandGradient)
        .clipShape(Capsule())
        .foregroundColor(.white)
        .buttonStyle(.plain)
        .shadow(color: Color.brandViolet.opacity(0.4), radius: 6, y: 3)
    }

    // MARK: - Kardio (na minute)

    // Sitan HR badge (zadrzan, ne zatrpava ekran).
    private var cardioHrBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: "heart.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(zone.color)
            Text("\(heartRate)")
                .font(.zoneNum(13, .bold))
                .monospacedDigit()
                .foregroundColor(zone.color)
            Text("BPM")
                .font(.zoneNum(8, .bold))
                .tracking(0.6)
                .foregroundColor(.textMuted)
        }
    }

    // VELIKI broj minuta u centru + "min", flankiran sitnim minus/plus (korak 1, opseg 1-240).
    // Ceo red je focusable -> Digital Crown menja vrednost (sinhronizovan preko cardioCrown).
    // cardioMinutes je PRIKAZANA i POSLATA vrednost (sto korisnik vidi, to se salje).
    private var cardioMinutesControl: some View {
        HStack(spacing: 8) {
            Button(action: {
                WKInterfaceDevice.current().play(.click)
                setCardioMinutes(cardioMinutes - 1)
            }) {
                Image(systemName: "minus")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .background(Color.surfaceCard)
            .clipShape(Circle())
            .foregroundColor(.white)
            .disabled(cardioMinutes <= 1)

            HStack(alignment: .lastTextBaseline, spacing: 3) {
                Text("\(cardioMinutes)")
                    .font(.zoneNum(50, .heavy))
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentTransition(.numericText())
                Text("min")
                    .font(.zoneNum(13, .bold))
                    .foregroundColor(.textMuted)
            }
            .frame(minWidth: 86)

            Button(action: {
                WKInterfaceDevice.current().play(.click)
                setCardioMinutes(cardioMinutes + 1)
            }) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .background(Color.surfaceCard)
            .clipShape(Circle())
            .foregroundColor(.white)
            .disabled(cardioMinutes >= 240)
        }
        .focusable(true)
        .digitalCrownRotation(
            $cardioCrown,
            from: 1,
            through: 240,
            by: 1,
            sensitivity: .low,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
        .onChange(of: cardioCrown) { newVal in
            let v = min(240, max(1, Int(newVal.rounded())))
            if v != cardioMinutes { cardioMinutes = v }
        }
    }

    // Puna sirina, .borderedProminent. Stoji ISPOD steppera u vertikalnom toku (horizontalni
    // razmak nosi roditeljski VStack), salje TRENUTNU prikazanu vrednost (ne init).
    private var cardioFinishButton: some View {
        Button(action: {
            WKInterfaceDevice.current().play(.success)
            onCompleteCardio(cardioMinutes)
        }) {
            Text("Završi vežbu")
                .font(.zoneNum(15, .semibold))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.brandViolet)
    }

}

#Preview {
    ActiveWorkoutView(
        workout: .mock,
        heartRate: .constant(142),
        startedAtMs: Date().addingTimeInterval(-750).timeIntervalSince1970 * 1000,
        serverClockOffset: 0,
        onCompleteSet: { print("Set completed") },
        onCompleteCardio: { print("Cardio completed: \($0) min") },
        onFinishWorkout: { print("Finish workout") }
    )
}
