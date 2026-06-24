//
//  FitLinkLiveActivityLiveActivity.swift
//  FitLinkLiveActivity
//
//  Created by Jerkov on 6/22/26.
//

import ActivityKit
import WidgetKit
import SwiftUI
import UIKit

// Podatkovni tip (FitLinkLiveActivityAttributes) je u zasebnom fajlu
// FitLinkLiveActivityAttributes.swift, deljen izmedju App targeta i ekstenzije.
// Ovde su samo View-ovi i helperi. Dizajn: NISKA, zbijena crna kartica (Lyfta stil).

// MARK: - Podesive konstante (fino stelovanje gabarita; menjaj ove i rebuild)

private let laThumbSize: CGFloat = 62     // slika-mesto (kvadrat) - Lyfta
private let laThumbIcon: CGFloat = 26     // ikonica u slici-mestu
private let laRingSize: CGFloat = 48      // HR prsten (precnik); deli ga i Dynamic Island
private let laRingLine: CGFloat = 3       // debljina prstena
private let laBlockSpacing: CGFloat = 14  // razmak head -> sadrzaj (Lyfta generozno)
private let laMainSpacing: CGFloat = 14   // razmak: slika | ime/serija
private let laCardPadH: CGFloat = 18      // horizontalni padding kartice
private let laCardPadV: CGFloat = 16      // donji padding kartice
private let laCardPadTop: CGFloat = 16    // gornji padding
private let laExNameSize: CGFloat = 14    // ime vezbe (premium, refined; duga srpska imena)
private let laSubSize: CGFloat = 12       // serija/weight ispod imena
private let laCountSize: CGFloat = 23     // countdown u pauzi
private let laBpmSize: CGFloat = 17       // bpm u prstenu
private let laBrandSize: CGFloat = 14     // "FitLink" (kao "LYFTA")
private let laLiveSize: CGFloat = 14      // vreme u head-u (kao "0:35")
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

// "Serija x/y" (ili "n min") + " · weightText" (samo snaga, ako stigne). Lyfta stil.
private func setLineText(_ s: FitLinkLiveActivityAttributes.ContentState) -> String {
    var base = setOrDurationText(s)
    if !s.isDurationBased, let w = s.weightText, !w.isEmpty {
        base += " · \(w)"
    }
    return base
}

// Stoperica treninga: broji UNAPRED od pocetka. timerInterval (showsHours:false) ->
// uvek mm:ss, uza rezervacija ("119:59"); kapirano na 2h (realan max). Pozivaoci je
// stavljaju u .frame(maxWidth:.infinity, alignment:.trailing) (lock/expanded) ili uzak
// trailing frame (compact) da broj bude SKROZ desno.
private func workoutTimerText(_ start: Date) -> Text {
    Text(timerInterval: start ... start.addingTimeInterval(60 * 60 * 2),
         pauseTime: nil, countsDown: false, showsHours: false)
}

// MARK: - Deljeni View-ovi

// (LiveActivityHead uklonjen - LAYOUT A ima jednostavan inline head: FitLink + vreme.)

// Slika-mesto: prava slika iz App Group kesa (bela pozadina, Lyfta stil) ako je
// skinuta; inace tamni violet placeholder sa ikonicom.
struct LiveActivityThumb: View {
    let imageFileName: String?
    var size: CGFloat = laThumbSize     // default = lock screen (60); Dynamic Island salje manje
    var corner: CGFloat = 13
    var iconSize: CGFloat = laThumbIcon

    var body: some View {
        if let name = imageFileName,
           let url = liveActivityThumbURL(fileName: name),
           let uiImage = UIImage(contentsOfFile: url.path) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFit()
                .padding(size > 48 ? 4 : 3)
                .frame(width: size, height: size)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: corner))
                .overlay(
                    RoundedRectangle(cornerRadius: corner)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
        } else {
            RoundedRectangle(cornerRadius: corner)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(hue: 268.0 / 360.0, saturation: 0.40, brightness: 0.30),
                            Color(hue: 255.0 / 360.0, saturation: 0.30, brightness: 0.14),
                        ],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)
                .overlay(
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: iconSize, weight: .semibold))
                        .foregroundColor(.white.opacity(0.55))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: corner)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
        }
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

// MARK: - Lock screen (LAYOUT A: cist Lyfta blok - bez prstena, bez NEXT reda)

struct LiveActivityLockScreenView: View {
    let state: FitLinkLiveActivityAttributes.ContentState
    let startedAt: Date

    var body: some View {
        VStack(alignment: .leading, spacing: laBlockSpacing) {
            // HEAD: FitLink levo, vreme treninga SKROZ desno (Spacer gura; .frame(maxWidth:.infinity)
            // forsira da se red rasiri preko cele sirine pa Spacer ima sta da rastegne).
            HStack(spacing: 8) {
                (Text("Fit").foregroundColor(.white)
                 + Text("Link").foregroundColor(laVioletBright))
                    .font(.system(size: laBrandSize, weight: .heavy))
                    .layoutPriority(1)
                // maxWidth:.infinity + trailing -> vreme popuni preostalo i ide SKROZ desno.
                workoutTimerText(startedAt)
                    .font(.system(size: laLiveSize, weight: .semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.trailing)
                    .foregroundColor(laTxtDim)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }

            // BODY: slika levo + ime/serija. Bez HR prstena, bez NEXT reda.
            HStack(alignment: .center, spacing: laMainSpacing) {
                LiveActivityThumb(imageFileName: state.imageFileName)
                VStack(alignment: .leading, spacing: 4) {
                    Text(state.exerciseName)
                        .font(.system(size: laExNameSize, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                        .fixedSize(horizontal: false, vertical: true)
                    subtitle
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, laCardPadH)
        .padding(.top, laCardPadTop)
        .padding(.bottom, laCardPadV)
    }

    // Ispod imena: "Serija s/t" (ili "n min"); u pauzi "Pauza · countdown".
    @ViewBuilder private var subtitle: some View {
        if state.isResting, let end = state.restEndsAt {
            HStack(spacing: 5) {
                Text("Pauza")
                    .font(.system(size: laSubSize, weight: .bold))
                    .foregroundColor(laVioletBright)
                Text("·")
                    .font(.system(size: laSubSize, weight: .bold))
                    .foregroundColor(laTxtFaint)
                Text(timerInterval: restCountdownRange(end), countsDown: true)
                    .font(.system(size: laSubSize, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.white)
            }
            .lineLimit(1)
        } else {
            Text(setLineText(state))
                .font(.system(size: laSubSize, weight: .medium))
                .foregroundColor(laTxtDim)
                .lineLimit(1)
        }
    }
}

// MARK: - Widget (Live Activity konfiguracija + Dynamic Island)

struct FitLinkLiveActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FitLinkLiveActivityAttributes.self) { context in
            // Lock screen / banner - crna kartica (tamni tint; sistem daje chrome).
            LiveActivityLockScreenView(state: context.state, startedAt: context.attributes.workoutStartedAt)
                .activityBackgroundTint(Color(white: 0.06))
                .activitySystemActionForegroundColor(Color.white)

        } dynamicIsland: { context in
            let state = context.state
            let isRest = state.isResting
            let startedAt = context.attributes.workoutStartedAt
            let heartColor = state.heartRate != nil ? hrZoneColor(state.hrZone) : Color(white: 0.50)
            let bpmText = state.heartRate.map { "\($0)" } ?? "--"
            return DynamicIsland {
                // EXPANDED (kad se klikne pilula) = LYFTA kartica:
                // gore levo brend, gore desno vreme, dole slika + ime + serija.
                DynamicIslandExpandedRegion(.leading) {
                    (Text("Fit").foregroundColor(.white)
                     + Text("Link").foregroundColor(laVioletBright))
                        .font(.system(size: 15, weight: .heavy))
                        .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    // Premium margina od ivice ostrva (ne skroz uz rub, da se "0:12" ne sece).
                    workoutTimerText(startedAt)
                        .font(.system(size: 14, weight: .semibold))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .multilineTextAlignment(.trailing)
                        .foregroundColor(laTxtDim)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.trailing, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 12) {
                        LiveActivityThumb(imageFileName: state.imageFileName, size: 50, corner: 11, iconSize: 22)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(state.exerciseName)
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.white)
                                .lineLimit(2)
                                .minimumScaleFactor(0.85)
                            if isRest, let end = state.restEndsAt {
                                HStack(spacing: 5) {
                                    Text("Pauza")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(laVioletBright)
                                    Text("·")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(laTxtFaint)
                                    Text(timerInterval: restCountdownRange(end), countsDown: true)
                                        .font(.system(size: 14, weight: .bold, design: .rounded))
                                        .monospacedDigit()
                                        .foregroundColor(.white)
                                }
                                .lineLimit(1)
                            } else {
                                Text(setLineText(state))
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(laTxtDim)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                        if state.watchConnected {
                            VStack(alignment: .trailing, spacing: 0) {
                                HStack(spacing: 3) {
                                    Image(systemName: "heart.fill")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(heartColor)
                                    Text(bpmText)
                                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                                        .monospacedDigit()
                                        .foregroundColor(.white)
                                }
                                Text(hrZoneLabelSr(state.hrZone))
                                    .font(.system(size: 9, weight: .heavy))
                                    .foregroundColor(heartColor)
                            }
                        }
                    }
                    .padding(.top, 2)
                }
            } compactLeading: {
                // Brend usko (hugguje), manji font -> pilula kraca, premium kao LYFTA.
                (Text("Fit").foregroundColor(.white)
                 + Text("Link").foregroundColor(laVioletBright))
                    .font(.system(size: 11, weight: .heavy))
                    .lineLimit(1)
                    .fixedSize()
            } compactTrailing: {
                // Uzak okvir + trailing align + mm:ss (sekunde su uvek krajnje desno u
                // rezervaciji) -> vreme SKROZ do desne ivice pilule, kratka pilula.
                workoutTimerText(startedAt)
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 42, alignment: .trailing)
            } minimal: {
                // Brend znak (umesto srca).
                Text("F")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(laVioletBright)
            }
            .keylineTint(laViolet)
        }
    }
}
