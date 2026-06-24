//
//  FitLinkLiveActivityLiveActivity.swift
//  FitLinkLiveActivity
//
//  Created by Jerkov on 6/22/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

// Podatkovni tip (FitLinkLiveActivityAttributes) je u zasebnom fajlu
// FitLinkLiveActivityAttributes.swift, deljen izmedju App targeta i ekstenzije.
// Ovde su samo View-ovi i helperi.

// MARK: - Boje / helperi (dele ih lock screen i Dynamic Island)

// Violet brend akcenat hsl(268 80% 56%) -> HSB aproksimacija.
let liveActivityAccent = Color(hue: 268.0 / 360.0, saturation: 0.80, brightness: 0.56)

// hrZone string -> Color. HSL vrednosti iz specifikacije, mapirane na HSB.
func hrZoneColor(_ zone: String) -> Color {
    switch zone {
    case "easy":     return Color(hue: 195.0 / 360.0, saturation: 0.70, brightness: 0.60)
    case "moderate": return Color(hue: 150.0 / 360.0, saturation: 0.60, brightness: 0.50)
    case "hard":     return Color(hue:  45.0 / 360.0, saturation: 0.90, brightness: 0.55)
    case "max":      return Color(hue:   0.0,         saturation: 0.80, brightness: 0.55)
    default:         return Color(hue: 220.0 / 360.0, saturation: 0.12, brightness: 0.60) // rest / nepoznato
    }
}

// hrZone string -> srpski naziv zone (label ispod pulsa).
func hrZoneLabelSr(_ zone: String) -> String {
    switch zone {
    case "easy":     return "LAKO"
    case "moderate": return "UMEREN"
    case "hard":     return "TEŠKO"
    case "max":      return "MAKS"
    default:         return "ODMOR" // rest / nepoznato
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

// MARK: - Deljeni View-ovi

// HEAD: FitLink logo + brend levo, "UŽIVO"/"PAUZA" indikator desno.
struct LiveActivityHead: View {
    let isResting: Bool
    var body: some View {
        HStack {
            HStack(spacing: 6) {
                Text("F")
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .frame(width: 20, height: 20)
                    .background(RoundedRectangle(cornerRadius: 6).fill(liveActivityAccent))
                (Text("Fit").foregroundColor(.white) + Text("Link").foregroundColor(liveActivityAccent))
                    .font(.system(size: 14, weight: .heavy))
            }
            Spacer()
            HStack(spacing: 5) {
                // Puls tackica (LA ne podrzava trajnu animaciju -> staticna).
                Circle()
                    .fill(isResting ? liveActivityAccent : Color(hue: 0.0, saturation: 0.78, brightness: 0.62))
                    .frame(width: 7, height: 7)
                Text(isResting ? "PAUZA" : "UŽIVO")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.2)
                    .foregroundColor(.white.opacity(0.7))
            }
        }
    }
}

// Placeholder thumbnail (bez slike sa neta) - zaobljeni kvadrat sa ikonicom.
struct LiveActivityThumb: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(Color.white.opacity(0.08))
            .frame(width: 54, height: 54)
            .overlay(
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(liveActivityAccent)
            )
    }
}

// Puls prsten: krug u boji zone + bpm/"--" + srpski naziv zone. Siv kad nema pulsa.
struct LiveActivityHRRing: View {
    let heartRate: Int?
    let hrZone: String
    var body: some View {
        let color = heartRate != nil
            ? hrZoneColor(hrZone)
            : Color(hue: 220.0 / 360.0, saturation: 0.12, brightness: 0.60)
        VStack(spacing: 3) {
            ZStack {
                Circle()
                    .stroke(color, lineWidth: 3)
                    .frame(width: 48, height: 48)
                VStack(spacing: -1) {
                    Text(heartRate.map { "\($0)" } ?? "--")
                        .font(.system(size: 18, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(.white)
                    Text("BPM")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundColor(.white.opacity(0.5))
                }
            }
            Text(hrZoneLabelSr(hrZone))
                .font(.system(size: 8, weight: .heavy))
                .tracking(0.5)
                .foregroundColor(color)
        }
    }
}

// MARK: - Lock screen

struct LiveActivityLockScreenView: View {
    let state: FitLinkLiveActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 10) {
            LiveActivityHead(isResting: state.isResting)

            HStack(alignment: .top, spacing: 12) {
                LiveActivityThumb()
                middle
                    .frame(maxWidth: .infinity, alignment: .leading)
                LiveActivityHRRing(heartRate: state.heartRate, hrZone: state.hrZone)
            }

            nextRow
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // Sredina: SADA + ime vezbe (2 reda) + serija/kg ILI pauza countdown.
    @ViewBuilder private var middle: some View {
        if state.isResting {
            VStack(alignment: .leading, spacing: 2) {
                Text("PAUZA DO SLEDEĆE SERIJE")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.0)
                    .foregroundColor(liveActivityAccent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if let end = state.restEndsAt {
                    Text(timerInterval: restCountdownRange(end), countsDown: true)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(.white)
                }
                Text("Sledeće: serija \(state.setNumber)/\(state.totalSets)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                    .lineLimit(1)
            }
        } else {
            VStack(alignment: .leading, spacing: 3) {
                Text("SADA")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.5)
                    .foregroundColor(liveActivityAccent)
                Text(state.exerciseName)
                    .font(.system(size: 19, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                    .lineLimit(1)
            }
        }
    }

    private var subtitle: String {
        var base = state.isDurationBased
            ? "\(state.durationMinutes ?? 0) min"
            : "Serija \(state.setNumber)/\(state.totalSets)"
        if let w = state.weightText, !w.isEmpty {
            base += " · \(w)"
        }
        return base
    }

    // SLEDEĆE red (samo ako ima sledece vezbe).
    @ViewBuilder private var nextRow: some View {
        if let next = state.nextExerciseName, !next.isEmpty {
            VStack(spacing: 7) {
                Rectangle()
                    .fill(Color.white.opacity(0.08))
                    .frame(height: 1)
                HStack(spacing: 6) {
                    Text("SLEDEĆE")
                        .font(.system(size: 8, weight: .heavy))
                        .tracking(1.0)
                        .foregroundColor(liveActivityAccent)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(liveActivityAccent.opacity(0.16)))
                    Text(next + (state.nextInfo.map { " · \($0)" } ?? ""))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                }
            }
        }
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
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        Text(setOrDurationText(state))
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundColor(liveActivityAccent)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    LiveActivityHRRing(heartRate: state.heartRate, hrZone: state.hrZone)
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
