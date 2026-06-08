import SwiftUI
import WatchKit

// MARK: - Inter Tight (zonski ekran)
// Jedinstvena familija za sve velike brojke i nazive na sva cetiri stila,
// 1:1 sa HTML mockupom. Dok .ttf fajlovi nisu bundlovani u target,
// Font.custom automatski pada na sistemski SF (isti raspored, bez crash-a),
// pa je bezbedno koristiti odmah. Tezine mapirane na staticke Inter Tight rezove
// (HTML velike brojke = 800 ExtraBold).
extension Font {
    static func zoneNum(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .black:                 name = "InterTight-Black"
        case .heavy:                 name = "InterTight-ExtraBold"   // ~800, kao HTML
        case .bold:                  name = "InterTight-Bold"
        case .semibold:              name = "InterTight-SemiBold"
        case .medium:                name = "InterTight-Medium"
        default:                     name = "InterTight-Regular"
        }
        return .custom(name, size: size)
    }
}

struct ContentView: View {
    enum AppState {
        case idle
        case activeWorkout
        case rest
        case completed
    }
    
    @StateObject private var phoneSession = WatchPhoneSession.shared
    @Environment(\.scenePhase) private var scenePhase

    // Token iz pair_token payload-a koji je iPhone poslao preko WCSession.
    // Nil = nije upareno → "Uloguj se na iPhone-u". Bez fallback-a:
    // korišćenje tuđeg keširanog tokena bi tiho prikazivalo pogrešne podatke.
    private var effectiveToken: String? {
        phoneSession.pairingToken
    }

    @State private var currentState: AppState = .idle
    @State private var isPaired: Bool = false
    @State private var isLoading: Bool = false
    @State private var connectionError: String?
    @State private var currentWorkout: ActiveWorkout = .mock
    @State private var heartRate: Int = 0
    // Sloj 0: poslednji poznati session_id iz poll-a/realtime-a. Salje se uz svaki
    // HR upis da server odrzi tacno tu sesiju zivom (keep-alive).
    @State private var currentSessionId: String? = nil
    @State private var lastServerSignature: String = ""
    @State private var lastConnectedToken: String? = nil
    // Sloj 2: apsolutni kraj odmora sa servera i offset serverskog sata.
    @State private var restEndsAt: Date? = nil
    @State private var serverClockOffset: TimeInterval = 0
    // Poruka trenera: poslednji prikazani id (dedup) i tekuci banner.
    @State private var lastShownMessageId: String? = nil
    @State private var bannerMessage: TrainerMessage? = nil
    // Zone pulsa sa servera (zonski swipe ekran). Sve može null = "Zona nedostupna".
    @State private var serverHr: Int? = nil
    @State private var hrMax: Int? = nil
    @State private var hrZone: Int? = nil
    @State private var hrZoneName: String? = nil
    // Apsolutni pocetak treninga (epoch ms) - proteklo vreme na zonskom ekranu.
    @State private var workoutStartedAtMs: Double? = nil
    // Vreme u TRENUTNOJ zoni: lokalni timestamp kad se zona poslednji put
    // promenila (+ koja je to bila zona). Resetuje se na svaku promenu zone.
    // Lokalni Date() je dovoljan - merimo trajanje (delta), ne apsolutno vreme.
    @State private var zoneEnteredAt: Date? = nil
    @State private var trackedZone: Int? = nil

    // Izabrani stil zonskog ekrana (vertikalni paging gore/dole).
    // 0 Lestvica Pro, 1 Traka, 2 Prsten, 3 Tabla. NAMERNO @State (ne @AppStorage):
    // zonski ekran se UVEK otvara na Lestvici Pro (tag 0), bez da UserDefaults
    // ucita neki ranije izabran stil preko toga. Paging i dalje radi u sesiji.
    @State private var zoneStyle: Int = 0

    @StateObject private var realtimeClient = SupabaseRealtimeClient()
    @StateObject private var healthKit = HealthKitManager.shared
    
    var body: some View {
        Group {
            switch currentState {
            case .idle:
                idleView
                
            case .activeWorkout:
                // Swipe: glavni (dense) ekran + bogat zonski ekran levo/desno.
                TabView {
                    ActiveWorkoutView(
                        workout: currentWorkout,
                        heartRate: $heartRate,
                        startedAtMs: workoutStartedAtMs,
                        serverClockOffset: serverClockOffset,
                        onCompleteSet: handleCompleteSet,
                        onFinishWorkout: handleFinishWorkout
                    )
                    heartRateZoneView
                }
                .tabViewStyle(.page)

            case .rest:
                TabView {
                    RestTimerView(
                        restEndsAt: restEndsAt,
                        serverClockOffset: serverClockOffset,
                        nextExerciseName: currentWorkout.exerciseName,
                        nextSet: currentWorkout.currentSet,
                        totalSets: currentWorkout.totalSets,
                        heartRate: $heartRate,
                        onComplete: handleRestComplete,
                        onSkip: handleRestSkip,
                        onAddRest: handleAddRest
                    )
                    heartRateZoneView
                }
                .tabViewStyle(.page)

            case .completed:
                completedView
            }
        }
        // Poruka trenera - banner preko svega, tap ili auto-hide ga sklanja.
        .overlay(alignment: .top) {
            if let banner = bannerMessage {
                trainerMessageBanner(banner)
            }
        }
        .task {
            lastConnectedToken = effectiveToken
            // Handshake (pull): potvrdi ko je trenutno ulogovan na telefonu.
            phoneSession.requestCurrentToken()
            await initializeConnection()
        }
        .onChange(of: scenePhase) { newPhase in
            // Kad sat postane aktivan, ponovo povuci aktuelni identitet.
            if newPhase == .active {
                phoneSession.requestCurrentToken()
            }
        }
        .onChange(of: phoneSession.pairingToken) { _ in
            // Token primljen sa iPhone-a (login, refresh) ili obrisan (logout).
            // Reconnect samo ako se efektivni token zaista promenio.
            let newToken = effectiveToken
            guard newToken != lastConnectedToken else { return }
            lastConnectedToken = newToken
            print("[ContentView] Token changed - reconnecting (paired: \(phoneSession.pairingToken != nil))")
            Task {
                realtimeClient.disconnect()
                await initializeConnection()
            }
        }
        .onDisappear {
            realtimeClient.disconnect()
            stopHealthKitWorkout()
        }
    }
    
    // MARK: - Idle screen
    private var idleView: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            RadialGradient(
                colors: [Color.brandViolet.opacity(0.18), Color.clear],
                center: .top,
                startRadius: 0,
                endRadius: 120
            )
            .ignoresSafeArea()
            
            VStack(spacing: 8) {
                HStack(spacing: 5) {
                    if isLoading {
                        ProgressView()
                            .scaleEffect(0.5)
                            .frame(width: 8, height: 8)
                    } else {
                        Circle()
                            .fill(statusColor)
                            .frame(width: 6, height: 6)
                    }
                    Text(statusText)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.textMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .padding(.top, 2)
                
                Spacer()
                
                VStack(spacing: 0) {
                    Text("FitLink")
                        .font(.system(size: 28, weight: .heavy))
                        .tracking(-0.7)
                        .foregroundColor(.white)
                    
                    Text("Balkan")
                        .font(.system(size: 16, weight: .bold))
                        .tracking(-0.4)
                        .foregroundStyle(LinearGradient.brandGradient)
                }
                
                Spacer()
                
                Text("Pokreni trening na iPhone-u")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.textMuted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 8)
                    .background(Color.white.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                // Build oznaka živi SAMO ovde (idle), u svom prostoru.
                buildLabel
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
        }
    }
    
    // MARK: - Completed screen
    private var completedView: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            RadialGradient(
                colors: [Color.brandSuccess.opacity(0.3), Color.clear],
                center: .center,
                startRadius: 0,
                endRadius: 150
            )
            .ignoresSafeArea()
            
            VStack(spacing: 12) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 50, weight: .bold))
                    .foregroundColor(.brandSuccess)
                    .shadow(color: Color.brandSuccess.opacity(0.6), radius: 12)
                
                VStack(spacing: 2) {
                    Text("Bravo!")
                        .font(.system(size: 24, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundColor(.white)
                    
                    Text("Trening završen")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.textMuted)
                }
            }
        }
    }
    
    // MARK: - Zonski ekran (HR zone, FitLink stil)

    private let zoneNames = ["Zagrevanje", "Lagano", "Umereno", "Naporno", "Maksimalno"]

    // FitLink rampa: 1 indigo, 2 violet, 3 magenta, 4 amber, 5 crvena.
    // Kraljevska ljubicasta kao nit brenda, crvena samo na maksimumu.
    private func zoneColor(_ z: Int) -> Color {
        switch z {
        case 1: return .brandIndigo
        case 2: return .brandViolet
        case 3: return .brandMagenta
        case 4: return .brandWarning
        case 5: return .brandDestructive
        default: return .brandViolet
        }
    }

    // HR za prikaz: serverski current_hr (iz kog je zona izvedena), pa lokalni puls.
    private var zoneDisplayHr: Int? {
        if let s = serverHr, s > 0 { return s }
        if heartRate > 0 { return heartRate }
        return nil
    }

    // Raspon otkucaja po zoni iz hr_max. Pragovi 0.60/0.70/0.80/0.90.
    private func zoneRangeLabel(_ z: Int, hrMax: Int) -> String {
        let t60 = Int((Double(hrMax) * 0.60).rounded())
        let t70 = Int((Double(hrMax) * 0.70).rounded())
        let t80 = Int((Double(hrMax) * 0.80).rounded())
        let t90 = Int((Double(hrMax) * 0.90).rounded())
        switch z {
        case 1: return "do \(t60)"
        case 2: return "\(t60)-\(t70)"
        case 3: return "\(t70)-\(t80)"
        case 4: return "\(t80)-\(t90)"
        case 5: return "\(t90)+"
        default: return ""
        }
    }

    // Zonski ekran = cetiri stila izmedju kojih se bira vertikalnim listanjem
    // (gore/dole). Spoljni horizontalni TabView ostaje (glavni <-> zonski);
    // ovde je unutrasnji vertikalni paging kroz stilove. Izbor se pamti u
    // @AppStorage. Default je Lestvica Pro (tag 2).
    private var heartRateZoneView: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let zone = hrZone, let maxHr = hrMax, let hr = zoneDisplayHr {
                TabView(selection: $zoneStyle) {
                    zoneStyleLestvica(zone: zone, hr: hr, maxHr: maxHr).tag(0)
                    zoneStyleTraka(zone: zone, hr: hr, maxHr: maxHr).tag(1)
                    zoneStylePrsten(zone: zone, hr: hr, maxHr: maxHr).tag(2)
                    zoneStyleTabla(zone: zone, hr: hr, maxHr: maxHr).tag(3)
                }
                .tabViewStyle(.verticalPage)
            } else {
                zoneUnavailableView
            }
        }
    }

    // Nema podataka - diskretno, bez laznih brojeva (isto za sve stilove).
    private var zoneUnavailableView: some View {
        VStack(spacing: 6) {
            Image(systemName: "heart.slash")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.textMuted)
            Text("Zona nedostupna")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.textMuted)
        }
        .padding(.horizontal, 8)
    }

    // MARK: - Zonski stilovi (zajednicki pomocnici)

    // Proteklo vreme treninga iz servernog pocetka + clock offset.
    private func workoutElapsed(_ now: Date) -> Int {
        guard let startMs = workoutStartedAtMs else { return 0 }
        let serverNowSec = now.timeIntervalSince1970 + serverClockOffset
        return Int(max(0, serverNowSec - startMs / 1000.0))
    }

    private func elapsedString(_ elapsed: Int) -> String {
        if elapsed < 3600 {
            return String(format: "%d:%02d", elapsed / 60, elapsed % 60)
        }
        return String(format: "%d:%02dh", elapsed / 3600, (elapsed % 3600) / 60)
    }

    // Prosecan puls iz HealthKit-a (0 dok se ne skupi dovoljno) -> "—".
    private var avgHrText: String {
        healthKit.averageHeartRate > 0 ? "\(healthKit.averageHeartRate)" : "—"
    }

    // Trajanje boravka u TRENUTNOJ zoni (resetuje se na promenu zone u poll-u).
    private var timeInZoneString: String {
        guard let enteredAt = zoneEnteredAt else { return "0:00" }
        let elapsed = Int(max(0, Date().timeIntervalSince(enteredAt)))
        return String(format: "%d:%02d", elapsed / 60, elapsed % 60)
    }

    // MARK: - Stil 1: Traka

    private func zoneStyleTraka(zone: Int, hr: Int, maxHr: Int) -> some View {
        let accent = zoneColor(zone)
        return VStack(spacing: 10) {
            // Proteklo vreme krupno na vrhu, levo poravnato.
            TimelineView(.periodic(from: .now, by: 1.0)) { ctx in
                Text(elapsedString(workoutElapsed(ctx.date)))
                    .font(.zoneNum(27, .heavy))
                    .tracking(-0.5)
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Horizontalna traka zona: aktivna ~2x sira i nosi labelu.
            GeometryReader { geo in
                let gap: CGFloat = 4
                let unit = max(8, (geo.size.width - gap * 4) / 5.9)
                HStack(spacing: gap) {
                    ForEach(1...5, id: \.self) { z in
                        let on = z == zone
                        ZStack {
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(zoneColor(z).opacity(on ? 1.0 : 0.30))
                            if on {
                                Text("ZONA \(z)")
                                    .font(.zoneNum(10, .heavy))
                                    .tracking(0.3)
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                        }
                        .frame(width: on ? unit * 1.9 : unit)
                        // Mekan glow samo na aktivnom segmentu (premium, ne ostar).
                        .shadow(color: on ? zoneColor(z).opacity(0.55) : .clear, radius: 10, y: 1)
                        // Strelica nadole ispod aktivnog segmenta (kao u HTML-u).
                        .overlay(alignment: .bottom) {
                            if on {
                                Image(systemName: "arrowtriangle.down.fill")
                                    .font(.system(size: 7))
                                    .foregroundColor(zoneColor(z))
                                    .offset(y: 10)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 24)

            // Tri reda: puls (♥), aktivne kalorije, prosek. Levo poravnato,
            // jedan ispod drugog (HTML .rows gap 8).
            VStack(alignment: .leading, spacing: 8) {
                trakaRow(value: "\(hr)", unit: "BPM", trailing: .heart(accent))
                trakaRow(value: "\(healthKit.activeCalories)", unit: "KCAL", trailing: .label("Aktivne"))
                trakaRow(value: avgHrText, unit: "BPM", trailing: .label("Prosek"))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 6)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.horizontal, 12)
        .padding(.top, 20)
        .padding(.bottom, 14)
    }

    private enum TrakaTrailing {
        case heart(Color)
        case label(String)
    }

    private func trakaRow(value: String, unit: String, trailing: TrakaTrailing) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            // Broj i jedinica tesno grupisani levo (broj + razmak 5 + KCAL/BPM).
            Text(value)
                .font(.zoneNum(22, .heavy))
                .tracking(-0.5)
                .foregroundColor(.white)
                .monospacedDigit()
            Text(unit)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.textMuted)
                .padding(.leading, 5)
            switch trailing {
            case .heart(let c):
                // Srce odmah uz BPM (levo grupisano), ostatak reda prazan.
                Image(systemName: "heart.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(c)
                    .padding(.leading, 4)
                Spacer(minLength: 0)
            case .label(let text):
                // Sitna opisna oznaka poravnata uz desnu ivicu (HTML margin-left:auto).
                Spacer(minLength: 8)
                Text(text.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .tracking(0.8)
                    .foregroundColor(.textMuted)
                    .lineLimit(1)
            }
        }
    }

    // MARK: - Stil 2: Prsten

    private func zoneStylePrsten(zone: Int, hr: Int, maxHr: Int) -> some View {
        let accent = zoneColor(zone)
        let frac = min(1.0, max(0.05, Double(hr) / Double(maxHr)))
        return VStack(spacing: 0) {
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.08), lineWidth: 10)
                Circle()
                    .trim(from: 0, to: frac)
                    .stroke(accent, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: accent.opacity(0.5), radius: 6)
                VStack(spacing: 0) {
                    Text("\(hr)")
                        .font(.zoneNum(34, .heavy))
                        .tracking(-1)
                        .monospacedDigit()
                        .foregroundColor(.white)
                        .contentTransition(.numericText())
                    Text("BPM")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.0)
                        .foregroundColor(.textMuted)
                    Text("ZONA \(zone)")
                        .font(.zoneNum(13, .heavy))
                        .foregroundColor(accent)
                        .padding(.top, 5)
                }
            }
            .frame(width: 104, height: 104)

            // Garantovan vazduh izmedju prstena i donjeg reda: minLength cuva
            // razmak i kad je ekran tesan, pa se red nikad ne prelama preko
            // prstena. Visak slacka i dalje gura red nize (premium osecaj).
            Spacer(minLength: 22)

            // Tri brojke ispod: kalorije, vreme, prosek. Vece i citljivije.
            HStack(alignment: .top, spacing: 10) {
                prstenStat(value: "\(healthKit.activeCalories)", label: "kcal")
                prstenStat(value: nil, label: "vreme")
                prstenStat(value: avgHrText, label: "prosek")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.horizontal, 10)
        .padding(.top, 14)
        .padding(.bottom, 18)
    }

    // Jedna brojka + labela (Prsten footer). value == nil -> proteklo vreme (tika).
    private func prstenStat(value: String?, label: String) -> some View {
        VStack(spacing: 2) {
            Group {
                if let value = value {
                    Text(value)
                } else {
                    TimelineView(.periodic(from: .now, by: 1.0)) { ctx in
                        Text(elapsedString(workoutElapsed(ctx.date)))
                    }
                }
            }
            .font(.zoneNum(22, .heavy))
            .tracking(-0.5)
            .foregroundColor(.white)
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            Text(label.uppercased())
                .font(.system(size: 8, weight: .semibold))
                .tracking(0.6)
                .foregroundColor(.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Stil 3: Lestvica Pro (default)

    private func zoneStyleLestvica(zone: Int, hr: Int, maxHr: Int) -> some View {
        VStack(spacing: 8) {
            // Gornji red smiren: samo puls levo. Vreme treninga je sklonjeno iz
            // gornjeg desnog ugla da se ne sudara sa sistemskim satom (vreme i
            // dalje postoji na ostalim stilovima i na glavnom ekranu).
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(hr)")
                    .font(.zoneNum(24, .heavy))
                    .tracking(-0.5)
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .contentTransition(.numericText())
                    .animation(.snappy, value: hr)
                Text("BPM")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.textMuted)
                Spacer(minLength: 0)
            }

            // Lestvica: aktivna zona istaknuta i veca, ostale niske sa tickom.
            VStack(spacing: 4) {
                ForEach((1...5).reversed(), id: \.self) { z in
                    zoneRow(z: z, isCurrent: z == zone, hrMax: maxHr)
                }
            }

            // Donji red sa linijom: DVE brojke preko sirine - levo aktivne kcal,
            // desno vreme treninga. Vise prostora -> vece, jace cifre. Vreme je
            // ovde (a ne u gornjem desnom uglu) da se ne sudara sa sistemskim satom.
            HStack(alignment: .top, spacing: 10) {
                lestvicaFootCol(value: "\(healthKit.activeCalories)", label: "aktivne kcal", align: .leading)
                lestvicaFootCol(value: nil, label: "vreme", align: .trailing)
            }
            .padding(.horizontal, 6)
            .padding(.top, 10)
            .overlay(alignment: .top) {
                Rectangle().fill(Color.hairline).frame(height: 1)
            }

            // Sav visak praznog prostora ide na DNO - sadrzaj ostaje grupisan uz
            // vrh, odmah ispod sistemskog sata, kao u HTML-u.
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.horizontal, 10)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    // Jedna kolona donjeg reda Lestvice. Samo dve kolone -> vise prostora pa
    // vece, jace cifre. align: .leading za kcal (levo), .trailing za vreme
    // (desno), tako da brojke sednu uz svoje ivice unutar safe zone.
    private func lestvicaFootCol(value: String?, label: String, align: HorizontalAlignment) -> some View {
        VStack(alignment: align, spacing: 3) {
            Group {
                if let value = value {
                    Text(value)
                } else {
                    TimelineView(.periodic(from: .now, by: 1.0)) { ctx in
                        Text(elapsedString(workoutElapsed(ctx.date)))
                    }
                }
            }
            .font(.zoneNum(26, .heavy))
            .tracking(-0.5)
            .foregroundColor(.white)
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            Text(label.uppercased())
                .font(.system(size: 8, weight: .semibold))
                .tracking(0.8)
                .foregroundColor(.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: align == .leading ? .leading : .trailing)
    }

    // MARK: - Stil 4: Tabla

    private func zoneStyleTabla(zone: Int, hr: Int, maxHr: Int) -> some View {
        let accent = zoneColor(zone)
        let nameIdx = min(max(zone, 1), 5) - 1
        return VStack(spacing: 9) {
            // Tanka traka zona.
            HStack(spacing: 3) {
                ForEach(1...5, id: \.self) { z in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(zoneColor(z).opacity(z == zone ? 1.0 : 0.3))
                        .frame(height: 7)
                        .shadow(color: z == zone ? zoneColor(z).opacity(0.6) : .clear, radius: 5)
                }
            }

            HStack(spacing: 5) {
                Text("ZONA \(zone)")
                    .foregroundColor(accent)
                Text("· \(hrZoneName ?? zoneNames[nameIdx])")
                    .foregroundColor(.textMuted)
                Spacer()
            }
            .font(.zoneNum(12, .heavy))
            .lineLimit(1)
            .minimumScaleFactor(0.8)

            // 2x2 kartice: Puls, Aktivne, Trening, U zoni. Akcent-bar = brand
            // violet na istaknute dve kartice (kao u HTML-u); zona je u traci gore.
            // Dosledni razmaci 6pt u oba pravca (mreza diše ujednaceno).
            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    tablaCard(value: "\(hr)", unit: "BPM", label: "Puls", accent: .brandViolet)
                    tablaCard(value: "\(healthKit.activeCalories)", unit: "KCAL", label: "Aktivne", accent: .brandViolet)
                }
                HStack(spacing: 6) {
                    tablaCardTicking(label: "Trening") { elapsedString(workoutElapsed($0)) }
                    tablaCardTicking(label: "U zoni") { _ in timeInZoneString }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.horizontal, 8)
        .padding(.top, 22)
        .padding(.bottom, 12)
    }

    private func tablaCard(value: String, unit: String?, label: String, accent: Color?) -> some View {
        tablaCardShell(accent: accent, label: label) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.zoneNum(32, .heavy))
                    .tracking(-0.5)
                    .foregroundColor(.white)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let unit = unit {
                    Text(unit)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.textMuted)
                }
            }
        }
    }

    // Kartica sa vrednoscu koja tika svake sekunde (Trening, U zoni).
    private func tablaCardTicking(label: String, value: @escaping (Date) -> String) -> some View {
        tablaCardShell(accent: nil, label: label) {
            TimelineView(.periodic(from: .now, by: 1.0)) { ctx in
                Text(value(ctx.date))
                    .font(.zoneNum(32, .heavy))
                    .tracking(-0.5)
                    .foregroundColor(.white)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
        }
    }

    // Zajednicki okvir kartice: vrednost gore, labela dole, opcioni levi akcenat.
    private func tablaCardShell<Content: View>(
        accent: Color?,
        label: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            content()
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.8)
                .foregroundColor(.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 13)
                    .fill(Color.surfaceCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: 13)
                            .stroke(Color.hairline, lineWidth: 1)
                    )
                if let accent = accent {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(accent)
                        .frame(width: 3)
                        .padding(.vertical, 8)
                }
            }
        )
    }

    // Sitna, prigušena build oznaka - SAMO na idle ekranu, nikad na radnim.
    private var buildLabel: some View {
        Text("build T33")
            .font(.system(size: 9, weight: .semibold))
            .foregroundColor(.white.opacity(0.3))
    }

    // Jedan red lestvice (koristi ga stil Lestvica Pro). Aktivna zona je veca,
    // popunjena gradijentom u boji zone, sa glow-om; ostale niske sa tickom.
    private func zoneRow(z: Int, isCurrent: Bool, hrMax: Int) -> some View {
        let color = zoneColor(z)
        return HStack(spacing: 9) {
            if !isCurrent {
                // Tick u boji zone (samo na neaktivnim redovima).
                RoundedRectangle(cornerRadius: 2)
                    .fill(color.opacity(0.75))
                    .frame(width: 4, height: 14)
            }

            Text("Zona \(z)")
                .font(.zoneNum(isCurrent ? 15 : 12, isCurrent ? .heavy : .bold))
                .foregroundColor(isCurrent ? .white : .white.opacity(0.55))
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 4)

            Text(zoneRangeLabel(z, hrMax: hrMax))
                .font(.zoneNum(isCurrent ? 12 : 11, isCurrent ? .bold : .semibold))
                .foregroundColor(isCurrent ? .white.opacity(0.85) : .textMuted)
                .monospacedDigit()
        }
        .padding(.horizontal, isCurrent ? 11 : 4)
        .frame(maxWidth: .infinity)
        .frame(height: isCurrent ? 32 : 20)
        .background(
            Group {
                if isCurrent {
                    RoundedRectangle(cornerRadius: 11)
                        .fill(LinearGradient(
                            colors: [color, color.opacity(0.55)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ))
                        .shadow(color: color.opacity(0.5), radius: 9)
                }
            }
        )
        .opacity(isCurrent ? 1 : 0.55)
    }

    // MARK: - Computed

    private var statusColor: Color {
        if phoneSession.tokenIsUncertain { return .brandWarning }
        if !isPaired { return .brandWarning }
        if !realtimeClient.isConnected { return .brandWarning }
        return .brandSuccess
    }

    private var statusText: String {
        if isLoading { return "Povezivanje..." }
        if let error = connectionError { return error }
        if phoneSession.pairingToken == nil { return "Uloguj se na iPhone-u" }
        // Identitet jos nije potvrdjen handshake-om (telefon bio nedostupan) -
        // ne tvrdi "Povezano" na osnovu starog, nepotvrdjenog keša.
        if phoneSession.tokenIsUncertain { return "Provera naloga…" }
        if !isPaired { return "Nije povezano" }
        if !realtimeClient.isConnected { return "Veza prekinuta" }
        return "Povezano"
    }
    
    // MARK: - Init connection
    
    private func initializeConnection() async {
        isLoading = true
        connectionError = nil

        // Zatraži HealthKit dozvolu odmah na pokretanju
        if !healthKit.isAuthorized {
            _ = await healthKit.requestAuthorization()
        }

        guard let token = effectiveToken else {
            // Nema tokena → korisnik nije ulogovan na iPhone-u (ili sync nije
            // stigao). statusText prikazuje "Uloguj se na iPhone-u".
            isPaired = false
            isLoading = false
            return
        }

        do {
            let context = try await SupabaseClient.shared.getUserContext(token: token)

            guard let context = context else {
                isPaired = false
                connectionError = "Token nevažeći"
                isLoading = false
                return
            }

            // Identitet se sada osigurava handshake-om (pull) sa telefona, koji
            // UVEK prepiše keš tokenom trenutno ulogovanog korisnika. Stara
            // mismatch-provera (pairedId vs context.userId) je uklonjena - bila
            // je strukturno mrtva jer server izvodi userId iz samog tokena, pa
            // se keširani pairedUserId i context.userId uvek poklapaju.
            isPaired = true
            print("Watch paired - user: \(context.userId)")

            if let serverWorkout = context.activeWorkout {
                print("Active workout: \(serverWorkout.currentExerciseName) [\(serverWorkout.currentState)]")
                applyServerState(
                    sessionId: serverWorkout.sessionId,
                    exerciseName: serverWorkout.currentExerciseName,
                    setNumber: serverWorkout.currentSetNumber,
                    totalSets: serverWorkout.totalSets,
                    state: serverWorkout.currentState,
                    restEndsAtMs: serverWorkout.restEndsAtMs,
                    serverNowMs: context.serverNowMs
                )
            }

            realtimeClient.onWorkoutStateChange = { row in
                handleRealtimeUpdate(row)
            }
            realtimeClient.onWorkoutDeleted = {
                // Loguje se unutar handleWorkoutDeleted samo kad stvarno deluje
                // (poziva se na svaki null poll, pa bi print ovde bio spam).
                handleWorkoutDeleted()
            }
            realtimeClient.onPollTick = {
                // Dok je identitet nesiguran (telefon bio nedostupan), retry-uj
                // handshake na svaki tick - oporavak cim telefon postane dostupan,
                // bez tranzicije scenePhase (sat moze ostati aktivan tokom treninga).
                if phoneSession.tokenIsUncertain {
                    phoneSession.requestCurrentToken()
                }
            }
            realtimeClient.onTrainerMessage = { message in
                handleTrainerMessage(message)
            }
            realtimeClient.onHeartRateZone = { info in
                serverHr = info.currentHr
                hrMax = info.hrMax
                hrZone = info.zone
                hrZoneName = info.zoneName
                workoutStartedAtMs = info.startedAtMs
                // Vreme u zoni: kad se zona promeni (ili prvi put stigne), resetuj
                // sat. Tako gornji red pokazuje koliko si u TRENUTNOJ zoni.
                if info.zone != trackedZone {
                    trackedZone = info.zone
                    zoneEnteredAt = info.zone != nil ? Date() : nil
                }
            }

            realtimeClient.setToken(token)
            realtimeClient.connect(userId: context.userId)

        } catch {
            isPaired = false
            connectionError = "Greška konekcije"
            print("Connection error: \(error.localizedDescription)")
        }

        isLoading = false
    }
    
    // MARK: - Realtime sync
    
    private func handleWorkoutDeleted() {
        // Idempotentno: poziva se i sa svakog null poll-a i iz HR session_ended
        // putanje. Deluje (i loguje) samo na prelazu iz treninga u neutralno.
        guard currentState != .completed && currentState != .idle else { return }
        print("No active workout (poll null / session ended) - leaving workout screen")
        stopHealthKitWorkout()
        WKInterfaceDevice.current().play(.success)
        currentState = .completed

        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if currentState == .completed {
                currentState = .idle
                currentWorkout = .mock
                lastServerSignature = ""
            }
        }
    }
    
    private func handleRealtimeUpdate(_ row: WorkoutLiveStateRow) {
        guard let exerciseName = row.currentExerciseName,
              let setNumber = row.currentSetNumber,
              let totalSets = row.totalSets,
              let state = row.currentState else {
            print("Realtime: incomplete row, ignoring")
            return
        }
        
        // Sloj 2: dedup mora da ukljuci rest_ends_at_ms da promena tajmera
        // (npr. +30 sa telefona) ne bude tiho odbacena.
        let restKey = row.restEndsAtMs.map { String($0) } ?? "nil"
        let signature = "\(exerciseName)|\(setNumber)|\(state)|\(restKey)"
        if signature == lastServerSignature {
            return
        }
        lastServerSignature = signature

        print("Realtime update: \(exerciseName) - SET \(setNumber)/\(totalSets) [\(state)] restEndsAtMs=\(restKey)")
        applyServerState(
            sessionId: row.sessionLogId,
            exerciseName: exerciseName,
            setNumber: setNumber,
            totalSets: totalSets,
            state: state,
            restEndsAtMs: row.restEndsAtMs,
            serverNowMs: row.serverNowMs
        )
    }

    private func applyServerState(
        sessionId: String?,
        exerciseName: String,
        setNumber: Int,
        totalSets: Int,
        state: String,
        restEndsAtMs: Double?,
        serverNowMs: Double?
    ) {
        // Sloj 0: zapamti zivi session_id da HR keep-alive uvek gadja tacnu sesiju.
        if let sessionId = sessionId {
            currentSessionId = sessionId
        }

        currentWorkout = ActiveWorkout(
            workoutId: currentWorkout.workoutId,
            exerciseName: exerciseName,
            exerciseNameEn: exerciseName,
            currentSet: setNumber,
            totalSets: totalSets,
            targetReps: 10,
            targetWeight: nil,
            restSeconds: 90
        )

        // Offset serverskog sata: serverNow - Date(). Display koristi Date() + offset.
        if let serverNowMs = serverNowMs {
            let serverNow = Date(timeIntervalSince1970: serverNowMs / 1000.0)
            serverClockOffset = serverNow.timeIntervalSince(Date())
        }

        switch state {
        case "active":
            restEndsAt = nil
            currentState = .activeWorkout
            startHealthKitWorkout()

        case "rest":
            // Postavi kraj odmora na SVAKI poll (bez guarda "samo na promenu stanja"),
            // da +30 sa telefona odmah produzi tajmer na satu. null = nema tajmera.
            restEndsAt = restEndsAtMs.map { Date(timeIntervalSince1970: $0 / 1000.0) }
            currentState = .rest
            startHealthKitWorkout()

        case "completed":
            restEndsAt = nil
            stopHealthKitWorkout()
            WKInterfaceDevice.current().play(.success)
            currentState = .completed
            
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if currentState == .completed {
                    currentState = .idle
                    currentWorkout = .mock
                    lastServerSignature = ""
                }
            }
            
        default:
            break
        }
    }
    
    // MARK: - Watch akcije
    
    private func handleCompleteSet() {
        WKInterfaceDevice.current().play(.success)

        Task {
            // Engine zove server direktno; sessionId imamo iz poll-a. Bez njega
            // nema zive sesije -> preskoci (poll ce ga uskoro doneti).
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                // Sat prikazuje samo plan -> reps/weight/rpe = nil, server uzima
                // planirane vrednosti. Posle upisa, prikaz prati poll.
                try await SupabaseClient.shared.engineCompleteSet(
                    token: token, sessionId: sessionId, reps: nil, weight: nil, rpe: nil
                )
                print("Watch engine: complete_set [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                print("Watch engine: complete_set -> session ended")
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Complete set error: \(error.localizedDescription)")
            }
        }
    }

    private func handleRestComplete() {
        Task {
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                try await SupabaseClient.shared.engineSkipRest(token: token, sessionId: sessionId)
                print("Watch engine: skip_rest (auto) [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Rest complete error: \(error.localizedDescription)")
            }
        }
    }

    private func handleRestSkip() {
        WKInterfaceDevice.current().play(.click)

        Task {
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                try await SupabaseClient.shared.engineSkipRest(token: token, sessionId: sessionId)
                print("Watch engine: skip_rest [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Skip rest error: \(error.localizedDescription)")
            }
        }
    }

    private func handleFinishWorkout() {
        WKInterfaceDevice.current().play(.success)

        // Procitaj HealthKit agregate DOK je sesija jos ziva (stopWorkoutSession
        // ih resetuje na 0). 0 -> nil, da se ne salje lazna nula.
        let kcal = healthKit.activeCalories
        let hrAvg = healthKit.averageHeartRate
        let hrMax = healthKit.maxHeartRate

        Task {
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                try await SupabaseClient.shared.engineFinishWorkout(
                    token: token,
                    sessionId: sessionId,
                    activeCalories: kcal > 0 ? kcal : nil,
                    hrAvg: hrAvg > 0 ? hrAvg : nil,
                    hrMax: hrMax > 0 ? hrMax : nil
                )
                print("Watch engine: finish_workout [session \(sessionId)] kcal=\(kcal) hrAvg=\(hrAvg) hrMax=\(hrMax)")
            } catch SupabaseError.sessionEnded {
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Finish workout error: \(error.localizedDescription)")
            }
        }
    }

    // +30 ide direktno u motor (watch_extend_rest), kao complete i skip. Server
    // doda sekunde na rest_ends_at i vrati kroz poll; sat ima optimisticki bump
    // kroz effectiveEnd. Bez watch_button_events - radi i kad telefon spava.
    private func handleAddRest(_ seconds: Int) {
        Task {
            guard let token = effectiveToken, let sessionId = currentSessionId else { return }
            do {
                try await SupabaseClient.shared.engineExtendRest(
                    token: token, sessionId: sessionId, seconds: seconds
                )
                print("Watch engine: extend_rest (+\(seconds)) [session \(sessionId)]")
            } catch SupabaseError.sessionEnded {
                await MainActor.run { handleWorkoutDeleted() }
            } catch {
                print("Extend rest error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Poruka trenera

    private func handleTrainerMessage(_ message: TrainerMessage) {
        // Dedup po id: vibriraj i prikazi SAMO novu poruku. Ista poruka koja se
        // ponavlja kroz poll (poslednje 2 min) ne okida ponovnu vibraciju.
        guard message.id != lastShownMessageId else { return }
        lastShownMessageId = message.id

        WKInterfaceDevice.current().play(.notification)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            bannerMessage = message
        }

        // Auto-sakrij posle par sekundi, osim ako je u medjuvremenu stigla nova.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if bannerMessage?.id == message.id {
                withAnimation { bannerMessage = nil }
            }
        }
    }

    @ViewBuilder
    private func trainerMessageBanner(_ message: TrainerMessage) -> some View {
        let accent = trainerMessageColor(message.messageType)
        HStack(spacing: 8) {
            Image(systemName: "message.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(accent)
            Text(message.message)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(3)
                .minimumScaleFactor(0.75)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.black.opacity(0.88))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(accent.opacity(0.6), lineWidth: 1.5)
                )
        )
        .shadow(color: accent.opacity(0.4), radius: 8)
        .padding(.horizontal, 5)
        .padding(.top, 2)
        .transition(.move(edge: .top).combined(with: .opacity))
        .onTapGesture {
            withAnimation { bannerMessage = nil }
        }
    }

    // encouragement -> zeleno, warning -> narandzasto, ostalo (text) -> neutralno.
    private func trainerMessageColor(_ type: String?) -> Color {
        switch type {
        case "encouragement": return .brandSuccess
        case "warning": return .brandWarning
        default: return .brandViolet
        }
    }

    // MARK: - HealthKit

    private func startHealthKitWorkout() {
        guard !healthKit.isWorkoutActive else { return }
        
        Task {
            // Ako nema dozvole, pokušaj ponovo
            if !healthKit.isAuthorized {
                let granted = await healthKit.requestAuthorization()
                if !granted {
                    print("HealthKit dozvola odbijena")
                    return
                }
            }
            
            // Pokreni workout session - HR ce se automatski citati
            healthKit.startWorkoutSession()
            
            // Listener za HR update-ove
            healthKit.onHeartRateUpdate = { bpm in
                heartRate = bpm

                // Sloj 0: salji SVAKI sample dok je workout aktivan. Svaki upis
                // ujedno odrzava sesiju zivom (keep-alive) bez budnog telefona.
                Task {
                    await sendHeartRateToServer()
                }
            }
        }
    }
    
    private func stopHealthKitWorkout() {
        healthKit.stopWorkoutSession()
        healthKit.onHeartRateUpdate = nil
        heartRate = 0
        currentSessionId = nil
    }

    private func sendHeartRateToServer() async {
        // Ako session_id jos nije poznat (nema zive sesije), samo preskoci ovaj
        // sample - bez greske. Cim poll/realtime donese session_id, slanje krene.
        guard isPaired, heartRate > 0, let token = effectiveToken,
              let sessionId = currentSessionId else { return }

        do {
            try await SupabaseClient.shared.updateHeartRate(
                token: token,
                heartRate: heartRate,
                sessionId: sessionId
            )
        } catch SupabaseError.sessionEnded {
            // Trening je zavrsen na serveru, a sat je jos slao puls (fantom).
            // Zatvori HealthKit workout, prestani slanje, napusti ekran treninga.
            print("HR update: session ended on server - closing watch workout")
            await MainActor.run { handleWorkoutDeleted() }
        } catch {
            print("HR update error: \(error.localizedDescription)")
        }
    }
}

#Preview {
    ContentView()
}