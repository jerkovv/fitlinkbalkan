import SwiftUI
import WatchKit

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
    let onCompleteSet: () -> Void
    let onFinishWorkout: () -> Void
    
    @State private var showingFinishConfirm: Bool = false
    
    private var zone: HRZone {
        HRZone.zone(for: heartRate)
    }
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 6) {
                exerciseHeader
                heartRateDisplay
                Spacer(minLength: 4)
                targetInfo
                completeSetButton
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
        .alert("Završiti trening?", isPresented: $showingFinishConfirm) {
            Button("Otkaži", role: .cancel) { }
            Button("Da, završi", role: .destructive) {
                onFinishWorkout()
            }
        } message: {
            Text("Da li si siguran?")
        }
    }
    
    private var exerciseHeader: some View {
        VStack(spacing: 2) {
            Text("SET \(workout.currentSet) / \(workout.totalSets)")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.5)
                .foregroundColor(.textMuted)
            
            Text(workout.exerciseName)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)
        }
        .padding(.top, 2)
        .onLongPressGesture(minimumDuration: 1.0) {
            // Long-press na header = otvori finish workout dialog
            WKInterfaceDevice.current().play(.notification)
            showingFinishConfirm = true
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
                    .font(.system(size: 44, weight: .heavy, design: .rounded))
                    .foregroundColor(zone.color)
                    .contentTransition(.numericText())
                
                Text("BPM")
                    .font(.system(size: 9, weight: .bold))
                    .tracking(1.0)
                    .foregroundColor(.textMuted)
                    .offset(y: -8)
            }
            
            Text(zone.label.uppercased())
                .font(.system(size: 9, weight: .bold))
                .tracking(1.2)
                .foregroundColor(zone.color.opacity(0.9))
        }
    }
    
    private var targetInfo: some View {
        HStack(spacing: 8) {
            VStack(spacing: 0) {
                Text("\(workout.targetReps)")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("PON.")
                    .font(.system(size: 8, weight: .bold))
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
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Text("KG")
                        .font(.system(size: 8, weight: .bold))
                        .tracking(1.0)
                        .foregroundColor(.textMuted)
                } else {
                    Text("BW")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Text("TEŽINA")
                        .font(.system(size: 8, weight: .bold))
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
                    .font(.system(size: 14, weight: .semibold))
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
        onCompleteSet: { print("Set completed") },
        onFinishWorkout: { print("Finish workout") }
    )
}