import SwiftUI
import WatchKit

struct RestTimerView: View {
    let totalSeconds: Int
    let nextExerciseName: String
    let nextSet: Int
    let totalSets: Int
    @Binding var heartRate: Int
    let onComplete: () -> Void
    let onSkip: () -> Void
    
    @State private var secondsRemaining: Int = 0
    @State private var maxSeconds: Int = 0
    @State private var timer: Timer?
    @State private var hasStarted: Bool = false
    
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
            if !hasStarted {
                secondsRemaining = totalSeconds
                maxSeconds = totalSeconds
                hasStarted = true
                startTimer()
            }
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
    }
    
    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            DispatchQueue.main.async {
                if secondsRemaining > 0 {
                    secondsRemaining -= 1
                    
                    if secondsRemaining <= 3 && secondsRemaining > 0 {
                        WKInterfaceDevice.current().play(.click)
                    }
                    
                    if secondsRemaining == 0 {
                        WKInterfaceDevice.current().play(.start)
                        timer?.invalidate()
                        timer = nil
                        onComplete()
                    }
                }
            }
        }
    }
    
    private func addThirtySeconds() {
        WKInterfaceDevice.current().play(.click)
        secondsRemaining += 30
        if secondsRemaining > maxSeconds {
            maxSeconds = secondsRemaining
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
        totalSeconds: 90,
        nextExerciseName: "Potisak sa ravne klupe",
        nextSet: 3,
        totalSets: 4,
        heartRate: .constant(118),
        onComplete: { print("Rest complete") },
        onSkip: { print("Rest skipped") }
    )
}
