//
//  TrainerLiveActivityWidget.swift
//  FitLinkLiveActivity
//
//  Trenerov Live Activity prikaz: lista aktivnih vezbaca (top 3 po pulsu + "i jos N").
//  Isti crni Lyfta stil kao atletina kartica; reuse helpera (hrZoneColor, laViolet...)
//  iz FitLinkLiveActivityLiveActivity.swift (isti ekstenzijin modul, internal).
//

import ActivityKit
import WidgetKit
import SwiftUI

// Suptilan "UZIVO" indikator (zamena za tajmer kod trenera): soft zelena tackica + labela.
struct TrainerLiveBadge: View {
    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(Color(red: 0.20, green: 0.78, blue: 0.35))
                .frame(width: 6, height: 6)
            Text("UZIVO")
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(laTxtDim)
        }
        .fixedSize()
    }
}

// MARK: - Red jednog vezbaca

struct TrainerAthleteRow: View {
    let athlete: TrainerAthlete
    var colWidth: CGFloat = 62    // fiksna sirina HR/KCAL kolona (DI salje uze)
    var valueSize: CGFloat = 16   // font brojeva (DI salje manje)

    var body: some View {
        // .center: tackica vertikalno centrirana sa imenom (NE .firstTextBaseline).
        HStack(alignment: .center, spacing: 10) {
            // Tackica zone: fixedSize da je layout nikad ne skuplja/lomi u novi red.
            Circle()
                .fill(athlete.hr != nil ? hrZoneColor(athlete.zone) : Color(white: 0.40))
                .frame(width: 8, height: 8)
                .fixedSize()
            // layoutPriority(1): ime uzme prostor i SKRATI se umesto da gura tackicu.
            Text(athlete.name)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(1)
            Spacer(minLength: 8)

            // HR kolona (puls belo i primaran; "pauza" u odmoru). Fiksna sirina -> poravnanje.
            Group {
                if athlete.isResting {
                    Text("pauza")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(laVioletBright)
                } else if let hr = athlete.hr {
                    HStack(spacing: 3) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(laTxtFaint)
                        Text("\(hr)")
                            .font(.system(size: valueSize, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                    }
                } else {
                    Color.clear.frame(width: colWidth)
                }
            }
            .frame(width: colWidth, alignment: .trailing)

            // KCAL kolona (dim, sekundarna). Placeholder iste sirine kad nema -> kolone poravnate.
            Group {
                if let cal = athlete.cal, cal > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(laTxtFaint)
                        Text("\(cal)")
                            .font(.system(size: valueSize, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(laTxtDim)
                    }
                } else {
                    Color.clear.frame(width: colWidth)
                }
            }
            .frame(width: colWidth, alignment: .trailing)
        }
    }
}

// MARK: - Lock screen kartica

struct TrainerLockScreenView: View {
    let state: TrainerLiveActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // HEAD: FitLink levo, "UZIVO" indikator desno (umesto tajmera).
            HStack(spacing: 8) {
                (Text("Fit").foregroundColor(.white)
                 + Text("Link").foregroundColor(laVioletBright))
                    .font(.system(size: 14, weight: .heavy))
                    .layoutPriority(1)
                Spacer(minLength: 8)
                TrainerLiveBadge()
                    .padding(.trailing, 2)
            }

            // Podnaslov: TRENER + broj aktivnih.
            Text("TRENER · \(state.activeCount) aktivnih")
                .font(.system(size: 10, weight: .heavy))
                .tracking(0.4)
                .foregroundColor(laTxtFaint)

            if state.activeCount == 0 {
                Text("Nema aktivnih vežbača")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(laTxtDim)
                    .padding(.top, 2)
            } else {
                VStack(spacing: 8) {
                    ForEach(state.athletes, id: \.self) { a in
                        TrainerAthleteRow(athlete: a)
                    }
                }
                if state.moreCount > 0 {
                    Text("i još \(state.moreCount)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(laTxtFaint)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 16)
    }
}

// MARK: - Widget (Live Activity konfiguracija + Dynamic Island)

struct TrainerLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrainerLiveActivityAttributes.self) { context in
            // Lock screen / banner - crna kartica.
            TrainerLockScreenView(state: context.state)
                .activityBackgroundTint(Color(white: 0.06))
                .activitySystemActionForegroundColor(Color.white)

        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                // Leading: kratak brend (staje bez secenja; pun naslov ide u .bottom).
                DynamicIslandExpandedRegion(.leading) {
                    (Text("Fit").foregroundColor(.white)
                     + Text("Link").foregroundColor(laVioletBright))
                        .font(.system(size: 15, weight: .heavy))
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.leading, 8)   // DI safe zona (uza od lock screena)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TrainerLiveBadge()
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.trailing, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // Pun naslov u .bottom (puna sirina -> "N aktivnih" se NE sece) + sadrzaj.
                    VStack(alignment: .leading, spacing: 9) {
                        Text("TRENER · \(state.activeCount) aktivnih")
                            .font(.system(size: 10, weight: .heavy))
                            .tracking(0.4)
                            .foregroundColor(laTxtFaint)

                        if state.activeCount == 0 {
                            Text("Nema aktivnih vežbača")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(laTxtDim)
                        } else {
                            VStack(spacing: 8) {
                                ForEach(state.athletes, id: \.self) { a in
                                    // Uze kolone + manji font u DI (62+62 zna da bude tesno).
                                    TrainerAthleteRow(athlete: a, colWidth: 54, valueSize: 15)
                                }
                            }
                            if state.moreCount > 0 {
                                Text("i još \(state.moreCount)")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(laTxtFaint)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 6)
                    .padding(.horizontal, 10)   // DI safe zona: tackica levo i kcal desno ne udaraju u zaobljenu ivicu
                    .padding(.bottom, 4)
                }
            } compactLeading: {
                (Text("Fit").foregroundColor(.white)
                 + Text("Link").foregroundColor(laVioletBright))
                    .font(.system(size: 11, weight: .heavy))
                    .lineLimit(1)
                    .fixedSize()
            } compactTrailing: {
                // Broj aktivnih vezbaca.
                Text("\(state.activeCount)")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(laVioletBright)
            } minimal: {
                Text("\(state.activeCount)")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(laVioletBright)
            }
            .keylineTint(laViolet)
        }
    }
}
