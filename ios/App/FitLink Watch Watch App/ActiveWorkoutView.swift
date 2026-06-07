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
    let onFinishWorkout: () -> Void

    // "Završi trening" se ne vidi na glavnom ekranu - otvara se dugim pritiskom
    // (long press) bilo gde, pa potvrda da/ne, da ne dođe do slučajnog kraja.
    @State private var showFinishConfirm = false

    private var zone: HRZone {
        HRZone.zone(for: heartRate)
    }

    // Do 1h -> M:SS (0:45, 12:30, 59:59). Od 1h -> sati i minuti sa "h"
    // (1:05h, 2:15h), bez sekundi.
    private func durationString(_ elapsed: Int) -> String {
        if elapsed < 3600 {
            return String(format: "%d:%02d", elapsed / 60, elapsed % 60)
        }
        return String(format: "%d:%02dh", elapsed / 3600, (elapsed % 3600) / 60)
    }
    
    var body: some View {
        // Bez skrola: sve staje na jedan ekran, unutar safe zone. Black pozadina
        // ide ispod ivica, ali sadržaj poštuje safe area.
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 8) {
                exerciseHeader
                heartRateDisplay
                targetInfo
                completeSetButton
            }
            // Sadržaj prislonjen uz vrh (ispod sata), vazduh ispod primarnog
            // dugmeta - nije nabijeno na dno.
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, 10)
            // Gornji vazduh: gornji red nikad ne ulazi u zonu sistemskog sata.
            .padding(.top, 20)
            // Donji vazduh unutar safe zone.
            .padding(.bottom, 16)
        }
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
    
    private var exerciseHeader: some View {
        VStack(spacing: 2) {
            Text("SET \(workout.currentSet) / \(workout.totalSets)")
                .font(.zoneNum(10, .bold))
                .tracking(1.5)
                .monospacedDigit()
                .foregroundColor(.textMuted)

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
                Text("\(workout.targetReps)")
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

}

#Preview {
    ActiveWorkoutView(
        workout: .mock,
        heartRate: .constant(142),
        startedAtMs: Date().addingTimeInterval(-750).timeIntervalSince1970 * 1000,
        serverClockOffset: 0,
        onCompleteSet: { print("Set completed") },
        onFinishWorkout: { print("Finish workout") }
    )
}
