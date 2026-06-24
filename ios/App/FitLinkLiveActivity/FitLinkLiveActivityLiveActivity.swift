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
// Ovde su samo View-ovi i helperi. Dizajn: NISKA, zbijena crna kartica (Lyfta stil).

// MARK: - Podesive konstante (fino stelovanje gabarita; menjaj ove i rebuild)

private let laThumbSize: CGFloat = 56     // slika-mesto (kvadrat)
private let laThumbIcon: CGFloat = 24     // ikonica u slici-mestu
private let laRingSize: CGFloat = 48      // HR prsten (precnik); deli ga i Dynamic Island
private let laRingLine: CGFloat = 3       // debljina prstena
private let laBlockSpacing: CGFloat = 8   // razmak redova: head / glavni / next
private let laMainSpacing: CGFloat = 12   // razmak: slika | sredina | prsten
private let laCardPadH: CGFloat = 14      // horizontalni padding kartice
private let laCardPadV: CGFloat = 10      // vertikalni padding kartice (NIZAK)
private let laExNameSize: CGFloat = 16.5  // ime vezbe
private let laSubSize: CGFloat = 12.5     // serija/weight ispod imena
private let laCountSize: CGFloat = 23     // countdown u pauzi (NE 30)
private let laBpmSize: CGFloat = 17       // bpm u prstenu
private let laBrandSize: CGFloat = 13     // "FitLink"
private let laLiveSize: CGFloat = 10      // UZIVO/PAUZA
private let laZoneSize: CGFloat = 9       // naziv zone ispod prstena
private let laNextSize: CGFloat = 11      // SLEDECE red

// MARK: - Boje / helperi

let laViolet = Color(hue: 268.0 / 360.0, saturation: 0.80, brightness: 0.60)        // hsl(268 80% 60%)
let laVioletBright = Color(hue: 276.0 / 360.0, saturation: 0.85, brightness: 0.68)  // hsl(276 85% 68%)
let laTxtDim = Color(white: 0.66)
let laTxtFaint = Color(white: 0.46)

func hrZoneColor(_ zone: String) -> Color {
    switch zone {
    case "easy":     return Color(hue: 195.0 / 360.0, saturation: 0.75, brightness: 0.60)
    case "moderate": return Color(hue: 150.0 / 360.0, saturation: 0.62, brightness: 0.52)
    case "hard":     return Color(hue:  45.0 / 360.0, saturation: 0.90, brightness: 0.55)
    case "max":      return Color(hue:   0.0,         saturation: 0.84, brightness: 0.60)
    default:         return Color(white: 0.52) // rest / nepoznato (siva)
    }
}

func hrZoneLabelSr(_ zone: String) -> String {
    switch zone {
    case "easy":     return "LAKO"
    case "moderate": return "UMEREN"
    case "hard":     return "TEŠKO"
    case "max":      return "MAKS"
    default:         return "ODMOR"
    }
}

// Siguran opseg za odbrojavanje pauze: donja granica < gornja (inace ClosedRange pukne).
private func restCountdownRange(_ end: Date) -> ClosedRange<Date> {
    let now = Date()
    return end > now ? now...end : now...now.addingTimeInterval(1)
}

private func setOrDurationText(_ s: FitLinkLiveActivityAttributes.ContentState) -> String {
    s.isDurationBased ? "\(s.durationMinutes ?? 0) min" : "Serija \(s.setNumber)/\(s.totalSets)"
}

// MARK: - Deljeni View-ovi

// HEAD (tanak red): "FitLink" levo, tackica + UŽIVO/PAUZA desno.
struct LiveActivityHead: View {
    let isResting: Bool
    var body: some View {
        HStack(spacing: 0) {
            (Text("Fit").foregroundColor(.white)
             + Text("Link").foregroundColor(laVioletBright))
                .font(.system(size: laBrandSize, weight: .heavy))
            Spacer(minLength: 8)
            HStack(spacing: 5) {
                Circle()
                    .fill(isResting ? laViolet : Color(hue: 0.0, saturation: 0.84, brightness: 0.60))
                    .frame(width: 6, height: 6)
                Text(isResting ? "PAUZA" : "UŽIVO")
                    .font(.system(size: laLiveSize, weight: .heavy))
                    .tracking(0.6)
                    .foregroundColor(laTxtDim)
            }
        }
    }
}

// Slika-mesto (prava slika kasnije): tamni violet gradijent + ikonica.
struct LiveActivityThumb: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 13)
            .fill(
                LinearGradient(
                    colors: [
                        Color(hue: 268.0 / 360.0, saturation: 0.40, brightness: 0.30),
                        Color(hue: 255.0 / 360.0, saturation: 0.30, brightness: 0.14),
                    ],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            .frame(width: laThumbSize, height: laThumbSize)
            .overlay(
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.system(size: laThumbIcon, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 13)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
    }
}

// Puls prsten: border u boji zone + bpm/"--" + "BPM"; ispod naziv zone SR. Siv kad nema pulsa.
struct LiveActivityHRRing: View {
    let heartRate: Int?
    let hrZone: String
    var body: some View {
        let color = heartRate != nil ? hrZoneColor(hrZone) : Color(white: 0.40)
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .stroke(color, lineWidth: laRingLine)
                    .frame(width: laRingSize, height: laRingSize)
                VStack(spacing: 0) {
                    Text(heartRate.map { "\($0)" } ?? "--")
                        .font(.system(size: laBpmSize, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(.white)
                    Text("BPM")
                        .font(.system(size: 7, weight: .bold))
                        .tracking(0.3)
                        .foregroundColor(laTxtFaint)
                }
            }
            Text(hrZoneLabelSr(hrZone))
                .font(.system(size: laZoneSize, weight: .heavy))
                .tracking(0.3)
                .foregroundColor(color)
        }
    }
}

// MARK: - Lock screen (NISKA crna kartica, bez vertikalnog razvlacenja)

struct LiveActivityLockScreenView: View {
    let state: FitLinkLiveActivityAttributes.ContentState

    var body: some View {
        // VStack hugguje sadrzaj po visini (nema Spacer-a ni maxHeight) -> niska kartica.
        VStack(alignment: .leading, spacing: laBlockSpacing) {
            LiveActivityHead(isResting: state.isResting)

            HStack(alignment: .center, spacing: laMainSpacing) {
                LiveActivityThumb()
                middle
                    .frame(maxWidth: .infinity, alignment: .leading)
                LiveActivityHRRing(heartRate: state.heartRate, hrZone: state.hrZone)
            }

            nextRow
        }
        .padding(.horizontal, laCardPadH)
        .padding(.vertical, laCardPadV)
    }

    // Sredina: ime + serija (aktivno) ILI sledece + countdown (pauza). Ista (niska) visina.
    @ViewBuilder private var middle: some View {
        if state.isResting {
            // ISTA (niska) visina kao aktivno: 3 reda teksta, BEZ Spacer-a / maxHeight /
            // fixedSize. (Stari .fixedSize() na timerInterval tekstu je razvlacio karticu.)
            // Countdown je iste velicine kao ime vezbe u aktivnom, da se visina poklopi.
            VStack(alignment: .leading, spacing: 3) {
                Text("PAUZA")
                    .font(.system(size: laSubSize, weight: .heavy))
                    .tracking(0.5)
                    .foregroundColor(laVioletBright)
                    .lineLimit(1)
                if let end = state.restEndsAt {
                    Text(timerInterval: restCountdownRange(end), countsDown: true)
                        .font(.system(size: laExNameSize, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(.white)
                        .lineLimit(1)
                }
                Text("Sledeće: \(state.nextExerciseName ?? state.exerciseName) serija \(state.setNumber)/\(state.totalSets)")
                    .font(.system(size: laNextSize, weight: .semibold))
                    .foregroundColor(laTxtDim)
                    .lineLimit(1)
            }
        } else {
            VStack(alignment: .leading, spacing: 3) {
                Text(state.exerciseName)
                    .font(.system(size: laExNameSize, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true)
                exSub
            }
        }
    }

    // "Serija s/t" (violet) + " · weightText" (dim) ili "n min" za kardio.
    @ViewBuilder private var exSub: some View {
        let primary = state.isDurationBased
            ? "\(state.durationMinutes ?? 0) min"
            : "Serija \(state.setNumber)/\(state.totalSets)"
        if let w = state.weightText, !w.isEmpty {
            (Text(primary).font(.system(size: laSubSize, weight: .bold)).foregroundColor(laVioletBright)
             + Text(" · \(w)").font(.system(size: laSubSize, weight: .medium)).foregroundColor(laTxtDim))
                .lineLimit(1)
        } else {
            Text(primary)
                .font(.system(size: laSubSize, weight: .bold))
                .foregroundColor(laVioletBright)
                .lineLimit(1)
        }
    }

    // SLEDEĆE red - tanak, samo aktivno i ako ima sledece vezbe.
    @ViewBuilder private var nextRow: some View {
        if !state.isResting, let next = state.nextExerciseName, !next.isEmpty {
            HStack(spacing: 6) {
                Text("SLEDEĆE")
                    .font(.system(size: 8, weight: .heavy))
                    .tracking(0.8)
                    .foregroundColor(laViolet)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 4).fill(laViolet.opacity(0.16)))
                Text(next + (state.nextInfo.map { " · \($0)" } ?? ""))
                    .font(.system(size: laNextSize, weight: .medium))
                    .foregroundColor(laTxtDim)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 0)
            }
            .overlay(alignment: .top) {
                Rectangle().fill(Color.white.opacity(0.09)).frame(height: 1).offset(y: -laBlockSpacing / 2)
            }
        }
    }
}

// MARK: - Widget (Live Activity konfiguracija + Dynamic Island)

struct FitLinkLiveActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FitLinkLiveActivityAttributes.self) { context in
            // Lock screen / banner - crna kartica (tamni tint; sistem daje chrome).
            LiveActivityLockScreenView(state: context.state)
                .activityBackgroundTint(Color(white: 0.06))
                .activitySystemActionForegroundColor(Color.white)

        } dynamicIsland: { context in
            let state = context.state
            let isRest = state.isResting
            let heartColor = state.heartRate != nil ? hrZoneColor(state.hrZone) : Color(white: 0.50)
            let bpmText = state.heartRate.map { "\($0)" } ?? "--"
            return DynamicIsland {
                // EXPANDED (kad se rasiri na dodir)
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(state.exerciseName)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Text(setOrDurationText(state))
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundColor(laVioletBright)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if isRest, let end = state.restEndsAt {
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(timerInterval: restCountdownRange(end), countsDown: true)
                                .font(.system(size: 18, weight: .heavy, design: .rounded))
                                .monospacedDigit()
                                .multilineTextAlignment(.trailing)
                                .foregroundColor(laVioletBright)
                                .frame(maxWidth: 86, alignment: .trailing)
                            Text("PAUZA")
                                .font(.system(size: 9, weight: .heavy))
                                .tracking(0.5)
                                .foregroundColor(laTxtDim)
                        }
                    } else {
                        VStack(alignment: .trailing, spacing: 0) {
                            HStack(spacing: 3) {
                                Image(systemName: "heart.fill")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(heartColor)
                                Text(bpmText)
                                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundColor(.white)
                            }
                            Text(hrZoneLabelSr(state.hrZone))
                                .font(.system(size: 9, weight: .heavy))
                                .tracking(0.5)
                                .foregroundColor(heartColor)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if isRest {
                        Text("Sledeće: serija \(state.setNumber)/\(state.totalSets)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(laTxtDim)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else if let next = state.nextExerciseName, !next.isEmpty {
                        HStack(spacing: 5) {
                            Text("SLEDEĆE")
                                .font(.system(size: 8, weight: .heavy))
                                .tracking(0.6)
                                .foregroundColor(laViolet)
                            Text(next + (state.nextInfo.map { " · \($0)" } ?? ""))
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(laTxtDim)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                    }
                }
            } compactLeading: {
                if isRest {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(laViolet)
                } else {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(heartColor)
                }
            } compactTrailing: {
                if isRest, let end = state.restEndsAt {
                    Text(timerInterval: restCountdownRange(end), countsDown: true)
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(laVioletBright)
                } else {
                    Text(bpmText)
                        .font(.system(size: 14, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(heartColor)
                }
            } minimal: {
                Image(systemName: isRest ? "pause.fill" : "heart.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(isRest ? laViolet : heartColor)
            }
            .keylineTint(laViolet)
        }
    }
}
