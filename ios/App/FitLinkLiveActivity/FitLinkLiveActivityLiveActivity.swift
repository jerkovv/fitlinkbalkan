//
//  FitLinkLiveActivityLiveActivity.swift
//  FitLinkLiveActivity
//
//  Created by Jerkov on 6/22/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

// Podatkovni tip (FitLinkLiveActivityAttributes) je premesten u zaseban fajl
// FitLinkLiveActivityAttributes.swift, deljen izmedju App targeta (manager/plugin)
// i ove ekstenzije (prikaz). Ovde ostaju samo View-ovi i helperi.

// MARK: - Boje / helperi (dele ih lock screen i Dynamic Island)

// Violet brend akcenat hsl(268 80% 56%) -> HSB aproksimacija.
let liveActivityAccent = Color(hue: 268.0 / 360.0, saturation: 0.80, brightness: 0.56)

// hrZone string -> Color. HSL vrednosti iz specifikacije, mapirane na HSB
// (Color(hue:saturation:brightness:)) kao priblizan ekvivalent. Jedno mesto,
// dele ga lock screen i Dynamic Island.
func hrZoneColor(_ zone: String) -> Color {
    switch zone {
    case "easy":     return Color(hue: 195.0 / 360.0, saturation: 0.70, brightness: 0.60)
    case "moderate": return Color(hue: 150.0 / 360.0, saturation: 0.60, brightness: 0.50)
    case "hard":     return Color(hue:  45.0 / 360.0, saturation: 0.90, brightness: 0.55)
    case "max":      return Color(hue:   0.0,         saturation: 0.80, brightness: 0.55)
    default:         return Color(hue: 220.0 / 360.0, saturation: 0.12, brightness: 0.60) // rest / nepoznato
    }
}

// Siguran opseg za odbrojavanje pauze: donja granica < gornja (inace ClosedRange pukne).
private func restCountdownRange(_ end: Date) -> ClosedRange<Date> {
    let now = Date()
    return end > now ? now...end : now...now.addingTimeInterval(1)
}

// "Serija x/y" ili "n min" (nezavisno od pauze) - za Dynamic Island leading.
private func setOrDurationText(_ s: FitLinkLiveActivityAttributes.ContentState) -> String {
    s.isDurationBased ? "\(s.durationMinutes ?? 0) min" : "Serija \(s.setNumber)/\(s.totalSets)"
}

// MARK: - Deljeni mali View-ovi

// Srce u boji zone + bpm (ili "--"). Lock screen desno i Dynamic Island expanded trailing.
struct LiveActivityHRBadge: View {
    let heartRate: Int?
    let hrZone: String
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "heart.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(hrZoneColor(hrZone))
            Text(heartRate.map { "\($0)" } ?? "--")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(.white)
        }
    }
}

// Veliki red: odbrojavanje pauze / kardio minuti / serija. Lock screen.
struct LiveActivityMainMetric: View {
    let state: FitLinkLiveActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(metricLabel)
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.5)
                .foregroundColor(liveActivityAccent)
            metricValue
        }
    }

    private var metricLabel: String {
        if state.isResting { return "PAUZA" }
        if state.isDurationBased { return "KARDIO" }
        return "SERIJA"
    }

    @ViewBuilder private var metricValue: some View {
        if state.isResting, let end = state.restEndsAt {
            Text(timerInterval: restCountdownRange(end), countsDown: true)
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(.white)
        } else if state.isDurationBased {
            Text("\(state.durationMinutes ?? 0) min")
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        } else {
            Text("\(state.setNumber)/\(state.totalSets)")
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(.white)
        }
    }
}

// Ceo lock screen / banner: naslov + vezba + glavna metrika levo, puls desno.
struct LiveActivityLockScreenView: View {
    let state: FitLinkLiveActivityAttributes.ContentState

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 5) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(liveActivityAccent)
                    Text("Trening uživo")
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(0.5)
                        .foregroundColor(liveActivityAccent)
                }
                Text(state.exerciseName)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                LiveActivityMainMetric(state: state)
                    .padding(.top, 2)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                LiveActivityHRBadge(heartRate: state.heartRate, hrZone: state.hrZone)
                Text("BPM")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Widget (Live Activity konfiguracija + Dynamic Island)

struct FitLinkLiveActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FitLinkLiveActivityAttributes.self) { context in
            // Lock screen / banner
            LiveActivityLockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(Color.white)

        } dynamicIsland: { context in
            let state = context.state
            let zoneColor = hrZoneColor(state.hrZone)
            return DynamicIsland {
                // Expanded
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(state.exerciseName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Text(setOrDurationText(state))
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundColor(liveActivityAccent)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    LiveActivityHRBadge(heartRate: state.heartRate, hrZone: state.hrZone)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if state.isResting, let end = state.restEndsAt {
                        HStack(spacing: 6) {
                            Image(systemName: "pause.circle.fill")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(liveActivityAccent)
                            Text("Pauza")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white.opacity(0.8))
                            Spacer()
                            Text(timerInterval: restCountdownRange(end), countsDown: true)
                                .font(.system(size: 16, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .multilineTextAlignment(.trailing)
                                .foregroundColor(.white)
                                .frame(maxWidth: 70, alignment: .trailing)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "heart.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(zoneColor)
            } compactTrailing: {
                Text(state.heartRate.map { "\($0)" } ?? "--")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: "heart.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(zoneColor)
            }
            .keylineTint(liveActivityAccent)
        }
    }
}
