import SwiftUI
import WatchKit
import Network
import Combine

// Event-driven detekcija mreznog puta. NWPathMonitor javi ODMAH kad put nestane
// (telefon daleko + nema WiFi -> bridged put padne) ili se vrati - bez cekanja da
// RPC istekne (~15s zbog waitsForConnectivity).
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()
    @Published private(set) var isOnline: Bool = true
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "fitlink.networkMonitor")

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let ok = path.status == .satisfied
            DispatchQueue.main.async { self?.isOnline = ok }
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }
}

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

// KORAK B: rezultat lokalnog modela pozicije (ista logika kao server watch_compute_position).
struct LocalPosition {
    let complete: Bool
    let apeId: String
    let exerciseIdx: Int
    let exerciseName: String
    let setNumber: Int
    let totalSets: Int
    let restSeconds: Int
    let plannedReps: Int?
    let plannedWeight: Double?
}

struct ContentView: View {
    enum AppState {
        case idle
        case activeWorkout
        case rest
        case completed
    }
    
    @StateObject private var phoneSession = WatchPhoneSession.shared
    @StateObject private var network = NetworkMonitor.shared
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
    // Indikator veze vodjen ISHODOM RPC-a (ne poseban network monitor): stvaran
    // uspeh/neuspeh poziva je pravi signal "mogu li da posaljem akciju".
    @State private var connectionOK: Bool = true
    // Debounce-ovan prikaz banera: offline se POTVRDI tek ako izdrzi ~2.5s (da kratki
    // prekidi ne teraju baner da treperi); online sakriva baner odmah.
    @State private var offlineConfirmed: Bool = false
    // Brojac za ponistavanje zastarelih debounce Task-ova.
    @State private var offlineDebounceToken: Int = 0
    @State private var currentWorkout: ActiveWorkout = .mock
    @State private var heartRate: Int = 0

    // KORAK B - lokalni model treninga (plan + doneCount po vezbi). Prazno = nema plana
    // -> fallback na server-driven prikaz (kao do sad). Server ostaje autoritet (sync).
    @State private var planExercises: [PlanExercise] = []
    @State private var doneCounts: [String: Int] = [:]
    @State private var planSessionId: String? = nil
    // KORAK C: guard da replay reda set-akcija ide jedan-po-jedan (FIFO), bez paralele.
    @State private var isFlushingActions = false
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
                        workout: displayedWorkout,
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
                        nextExerciseName: displayedWorkout.exerciseName,
                        nextSet: displayedWorkout.currentSet,
                        totalSets: displayedWorkout.totalSets,
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
        // Banneri na vrhu: offline (perzistentan dok traje nema-veze) + poruka trenera.
        .overlay(alignment: .top) {
            VStack(spacing: 4) {
                if showOfflineBanner {
                    offlineBanner
                }
                if let banner = bannerMessage {
                    trainerMessageBanner(banner)
                }
            }
        }
        .task {
            // Perzistentni flush-pump okida flushQueue dok god ima baferovanih akcija.
            FlushPump.shared.onTick = { flushQueue() }
            lastConnectedToken = effectiveToken
            // Handshake (pull): potvrdi ko je trenutno ulogovan na telefonu.
            phoneSession.requestCurrentToken()
            await initializeConnection()
            // Isporuci eventualne offline metrike (Problem A) i set-akcije (KORAK C) sa
            // proslog treninga - ukljucujuci osirotele redove stare sesije.
            await flushPendingMetrics()
            flushQueue()
        }
        .onChange(of: scenePhase) { newPhase in
            // Kad sat postane aktivan, ponovo povuci aktuelni identitet.
            if newPhase == .active {
                phoneSession.requestCurrentToken()
                // Povratak u prvi plan = vezbac obicno blizu telefona, veza obnovljena.
                Task { await flushPendingMetrics() }
                flushQueue()   // KORAK C: odsviraj baferovane set-akcije
            }
        }
        .onChange(of: network.isOnline) { online in
            // NWPath se NE koristi za baner (nepouzdan na watchOS), samo kao OKIDAC na reconnect.
            if online {
                // ODMAH forsiraj poll (reset interval na 2s) + identitet -> brzo uskladi poziciju.
                realtimeClient.forceRefresh()
                phoneSession.requestCurrentToken()
                Task { await flushPendingMetrics() }
                flushQueue()
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

    // FIKSNA kotva za tajmer: klijentski trenutak koji odgovara pocetku sesije
    // (server start umanjen za clock offset). TimelineView .periodic se kaci na NJU,
    // ne na .now - inace bi se schedule re-fazirao na svaki re-render (HR/poll) pa bi
    // tikovi padali na nepravilne ofsete (sekunda ubrza/uspori). Sa fiksnom kotvom
    // tikovi padaju tacno na granicu elapsed-sekunde i cadence je ravnomeran.
    private var workoutTickAnchor: Date {
        guard let startMs = workoutStartedAtMs else { return .now }
        return Date(timeIntervalSince1970: startMs / 1000.0 - serverClockOffset)
    }

    // MARK: - Indikator veze (vodjen ishodom RPC-a)

    private func setConnectionOK(_ ok: Bool) {
        guard connectionOK != ok else { return }
        connectionOK = ok
        offlineDebounceToken &+= 1   // ponisti svaki pending debounce
        if ok {
            // Online -> sakrij baner ODMAH.
            withAnimation(.easeInOut(duration: 0.25)) { offlineConfirmed = false }
        } else {
            // Offline -> potvrdi tek ako stanje izdrzi ~2.5s (debounce protiv treperenja).
            let myToken = offlineDebounceToken
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                guard myToken == offlineDebounceToken, !connectionOK else { return }
                withAnimation(.easeInOut(duration: 0.25)) { offlineConfirmed = true }
            }
        }
    }
    // Uspeh poziva -> online.
    private func noteRpcSuccess() { setConnectionOK(true) }
    // networkError (nema interneta / timeout) -> offline. Bilo koji ODGOVOR sa servera
    // (sessionEnded/httpError/invalidToken/decoding) znaci da je server dosegnut -> online.
    private func noteRpcError(_ error: Error) {
        if let e = error as? SupabaseError, case .networkError(let detail) = e {
            setConnectionOK(false)
        } else {
            setConnectionOK(true)
        }
    }

    // Banner samo na ekranu treninga (active/rest). JEDINI pouzdan signal je ISHOD RPC-a
    // (connectionOK): NWPathMonitor na watchOS nepouzdano vidi bridged put (prijavi
    // .unsatisfied iako RPC-ovi rade), a WCSession.isReachable zna da slaze (sat na WiFi,
    // telefon daleko -> reachable false a sve radi). Zato baner pali samo stvaran neuspeh RPC-a.
    private var showOfflineBanner: Bool {
        offlineConfirmed && !connectionOK && (currentState == .activeWorkout || currentState == .rest)
    }

    private var offlineBanner: some View {
        HStack(spacing: 6) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.brandWarning)
            Text("Nema veze. Priblizi se telefonu ili proveri internet.")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.85))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.brandWarning.opacity(0.6), lineWidth: 1)
                )
        )
        .padding(.horizontal, 5)
        .padding(.top, 2)
        .transition(.move(edge: .top).combined(with: .opacity))
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
    // Racuna se iz TICK date-a (ne iz Date()) da bude uskladjeno sa workoutTickAnchor
    // cadence-om - inace prikaz trza (sekunda se prelama van granice tika).
    private func timeInZoneString(_ now: Date) -> String {
        guard let enteredAt = zoneEnteredAt else { return "0:00" }
        let elapsed = Int(max(0, now.timeIntervalSince(enteredAt)))
        return String(format: "%d:%02d", elapsed / 60, elapsed % 60)
    }

    // MARK: - Stil 1: Traka

    private func zoneStyleTraka(zone: Int, hr: Int, maxHr: Int) -> some View {
        let accent = zoneColor(zone)
        return VStack(spacing: 10) {
            // Proteklo vreme krupno na vrhu, levo poravnato.
            TimelineView(.periodic(from: workoutTickAnchor, by: 1.0)) { ctx in
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
                    TimelineView(.periodic(from: workoutTickAnchor, by: 1.0)) { ctx in
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
                    TimelineView(.periodic(from: workoutTickAnchor, by: 1.0)) { ctx in
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
            .fixedSize(horizontal: true, vertical: false)   // ne trunkuj zadnju cifru
            Text(label.uppercased())
                .font(.system(size: 8, weight: .semibold))
                .tracking(0.8)
                .foregroundColor(.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: align == .leading ? .leading : .trailing)
        // Malo razmaka od ivice ekrana da broj ne dodiruje/seče zakrivljenu ivicu.
        .padding(align == .leading ? .leading : .trailing, 4)
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
                    tablaCardTicking(label: "U zoni") { timeInZoneString($0) }
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
            TimelineView(.periodic(from: workoutTickAnchor, by: 1.0)) { ctx in
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
            noteRpcSuccess()   // server dosegnut

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
                    exerciseIdx: serverWorkout.currentExerciseIdx,
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
            noteRpcError(error)
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

        // Auto-finish (poslednja serija / server zavrsio): finalizuj HealthKit i upisi
        // metrike PRE reseta - inace se kalorije gube jer ova putanja ne ide kroz
        // handleFinishWorkout. Token/session uhvaceni sad jer cleanup ispod ih nil-uje.
        // HK sesiju gasi finalizeAndStop (NE stopHealthKitWorkout) da agregati ne budu
        // resetovani pre citanja.
        // BUG 2 fix: sinhrono ugasi keep-alive + isWorkoutActive ODMAH (PRE async finalize),
        // da nova sesija odmah moze da startuje HK i da je zakasneli finalize ne pregazi.
        healthKit.endLifecycleSync()

        let token = effectiveToken
        let sessionId = currentSessionId
        Task { await finalizeAndReport(token: token, sessionId: sessionId) }

        healthKit.onHeartRateUpdate = nil
        healthKit.onKeepAlive = nil
        heartRate = 0
        currentSessionId = nil

        // Osiroteli red stare sesije (offline akcije) - flush-uj SVE redove (bug 1).
        flushQueue()

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
            exerciseIdx: row.currentExerciseIdx,
            totalSets: totalSets,
            state: state,
            restEndsAtMs: row.restEndsAtMs,
            serverNowMs: row.serverNowMs
        )
    }

    // MARK: - KORAK B: lokalni model treninga (server ostaje autoritet)

    // Ista logika kao server watch_compute_position: prva vezba (po exercise_idx/position)
    // gde doneCount < sets; set_number = doneCount + 1; ako su sve done -> complete.
    private func computeLocalPosition() -> LocalPosition? {
        guard !planExercises.isEmpty else { return nil }
        let ordered = planExercises.sorted {
            ($0.exerciseIdx, $0.position) < ($1.exerciseIdx, $1.position)
        }
        for ex in ordered {
            let done = doneCounts[ex.apeId] ?? ex.doneCount
            if done < ex.sets {
                return LocalPosition(
                    complete: false,
                    apeId: ex.apeId,
                    exerciseIdx: ex.exerciseIdx,
                    exerciseName: ex.exerciseName,
                    setNumber: done + 1,
                    totalSets: ex.sets,
                    restSeconds: ex.restSeconds,
                    plannedReps: ex.plannedReps,
                    plannedWeight: ex.plannedWeight
                )
            }
        }
        return LocalPosition(complete: true, apeId: "", exerciseIdx: 0, exerciseName: "",
                             setNumber: 0, totalSets: 0, restSeconds: 0,
                             plannedReps: nil, plannedWeight: nil)
    }

    // Pozicija koju UI prikazuje. Renderuje iz LOKALNOG modela SAMO kad se slaze sa serverom
    // (isti naziv vezbe + set) - garancija da je ponasanje identicno kao sad. Inace fallback
    // na server-driven currentWorkout. (Korak C ce dozvoliti da lokalni vodi pre servera.)
    // KORAK C: lokalni model je IZVOR prikaza (optimisticki advance pomera UI odmah).
    // Sinhronizuje se sa serverom kad je red prazan -> online nema razlike. Nema plana
    // (SOLO/offline bez kesa) -> server-driven fallback.
    private var displayedWorkout: ActiveWorkout {
        if let pos = computeLocalPosition(), !pos.complete {
            return ActiveWorkout(
                workoutId: currentWorkout.workoutId,
                exerciseName: pos.exerciseName,
                exerciseNameEn: pos.exerciseName,
                currentSet: pos.setNumber,
                totalSets: pos.totalSets,
                targetReps: pos.plannedReps ?? currentWorkout.targetReps,
                targetWeight: pos.plannedWeight ?? currentWorkout.targetWeight,
                restSeconds: pos.restSeconds > 0 ? pos.restSeconds : currentWorkout.restSeconds
            )
        }
        return currentWorkout
    }

    // Ucitaj plan jednom po sesiji. Offline / nema RPC-a -> probaj iz UserDefaults; ako ni to
    // -> ostani server-driven (planExercises prazno). Ne rusi.
    private func loadWorkoutPlanIfNeeded(_ sessionId: String) {
        if planSessionId == sessionId { return }
        planSessionId = sessionId   // jednom po sesiji (i na neuspeh -> server-driven fallback)
        guard let token = effectiveToken else { return }
        Task {
            do {
                if let plan = try await SupabaseClient.shared.getWorkoutPlan(token: token, sessionId: sessionId) {
                    await MainActor.run { applyPlan(plan, sessionId: sessionId) }
                    return
                }
            } catch {
                print("Watch plan load error: \(error.localizedDescription)")
            }
            await MainActor.run { loadPersistedPlan(sessionId) }
        }
    }

    private func applyPlan(_ plan: WorkoutPlan, sessionId: String) {
        planExercises = plan.exercises
        var counts: [String: Int] = [:]
        for ex in plan.exercises { counts[ex.apeId] = ex.doneCount }
        doneCounts = counts
        planSessionId = sessionId
        // Uskladi sa trenutnom serverskom pozicijom (ako je vec stigla preko realtime-a).
        syncLocalToServer(exerciseName: currentWorkout.exerciseName, setNumber: currentWorkout.currentSet)
        persistPlan()
        print("Watch plan loaded: \(plan.exercises.count) vezbi [session \(sessionId)]")
    }

    private func loadPersistedPlan(_ sessionId: String) {
        guard let p = WorkoutPlanStore.shared.load(sessionId: sessionId) else { return }
        planExercises = p.exercises
        doneCounts = p.doneCounts
        planSessionId = sessionId
        print("Watch plan iz kesa: \(p.exercises.count) vezbi [session \(sessionId)]")
    }

    private func persistPlan() {
        guard let sid = planSessionId, !planExercises.isEmpty else { return }
        WorkoutPlanStore.shared.save(PersistedPlan(sessionId: sid, exercises: planExercises, doneCounts: doneCounts))
    }

    // SERVER JE AUTORITET: izvedi doneCount-ove iz serverove pozicije (linearno: vezbe pre
    // trenutne = pune, trenutna = setNumber-1, posle = 0). Ako naziv nije u planu, ne diraj
    // (displayedWorkout tada padne na server-driven prikaz).
    private func syncLocalToServer(exerciseName: String, setNumber: Int) {
        guard !planExercises.isEmpty else { return }
        let ordered = planExercises.sorted {
            ($0.exerciseIdx, $0.position) < ($1.exerciseIdx, $1.position)
        }
        guard let i = ordered.firstIndex(where: { $0.exerciseName == exerciseName }) else { return }
        var counts: [String: Int] = [:]
        for (j, ex) in ordered.enumerated() {
            if j < i { counts[ex.apeId] = ex.sets }
            else if j == i { counts[ex.apeId] = max(0, setNumber - 1) }
            else { counts[ex.apeId] = 0 }
        }
        if counts != doneCounts {
            doneCounts = counts
            persistPlan()
        }
    }

    // KORAK C: replay reda set-akcija STRIKTNO FIFO, jedna po jedna (cekaj uspeh pre sledece),
    // da server-racunate-pozicije padnu tacno. Mrezna greska -> zadrzi + retry; ostalo -> ukloni
    // (da se red ne zaglavi). ON CONFLICT DO NOTHING na serveru pokriva slucajne duple.
    // KORAK C: flush SVIH perzistovanih redova (tekuca + OSIROTELE stare sesije posle offline
    // zavrsetka), svaki po SVOM sessionId, STRIKTNO FIFO, jedna po jedna. Tako se stara sesija
    // finalizuje na serveru i kad si vec presao na nov trening (bug 1).
    private func flushQueue() {
        // Perzistentni pump: dok god ima neki neprazan red, retrira ~3s NEZAVISNO od toga da
        // li je trening aktivan (keep-alive stane na kraju treninga). Idempotentno + sam staje
        // kad se redovi isprazne. Svaki enqueue zove flushQueue -> ovde se pump (re)startuje.
        FlushPump.shared.start()
        if isFlushingActions { return }
        let sids = PendingActionStore.shared.allSessionIds()
        guard !sids.isEmpty else { return }
        isFlushingActions = true
        Task {
            outer: for sid in sids {
                while true {
                    let pending = PendingActionStore.shared.all(sessionId: sid)
                    guard let action = pending.first else { break }
                    let remove = await sendAction(action)
                    if remove {
                        PendingActionStore.shared.remove(sessionId: sid, id: action.id)
                    } else {
                        break outer   // mrezna greska -> stani sve, retry na sledeci okidac
                    }
                }
            }
            await MainActor.run { isFlushingActions = false }
        }
    }

    // Posalji JEDNU akciju. true = ukloni iz reda; false = zadrzi (samo mrezna greska).
    private func sendAction(_ action: PendingAction) async -> Bool {
        guard let token = effectiveToken else { return false }   // bez tokena -> zadrzi
        do {
            switch action.type {
            case .completeSet:
                _ = try await SupabaseClient.shared.engineCompleteSet(
                    token: token, sessionId: action.sessionId,
                    reps: action.reps, weight: action.weight, rpe: action.rpe)
            case .finish:
                _ = try await SupabaseClient.shared.engineFinishWorkout(
                    token: token, sessionId: action.sessionId)
            }
            noteRpcSuccess()
            print("[queue] poslato \(action.type.rawValue) [\(action.id.prefix(8))]")
            return true   // server dosegnut (i benigni success=false) -> ukloni
        } catch SupabaseError.networkError(_) {
            noteRpcError(SupabaseError.networkError("flush"))
            return false  // mrezna -> zadrzi + retry
        } catch {
            // session_ended (vec finalizovano) / invalid_token / http / decoding -> ukloni (ne zaglavi)
            print("[queue] drop \(action.type.rawValue) na gresci: \(error.localizedDescription)")
            return true
        }
    }

    private func applyServerState(
        sessionId: String?,
        exerciseName: String,
        setNumber: Int,
        exerciseIdx: Int?,
        totalSets: Int,
        state: String,
        restEndsAtMs: Double?,
        serverNowMs: Double?
    ) {
        // Sloj 0: zapamti zivi session_id da HR keep-alive uvek gadja tacnu sesiju.
        if let sessionId = sessionId {
            if currentSessionId != sessionId {
                // NOVA sesija: resetuj connection (ne nasledi "nema veze" iz proslog offline
                // perioda - bug 2) i ocisti stari lokalni model (nov plan se ucitava).
                setConnectionOK(true)
                planExercises = []
                doneCounts = [:]
                planSessionId = nil
            }
            currentSessionId = sessionId
            loadWorkoutPlanIfNeeded(sessionId)   // KORAK B: ucitaj lokalni plan jednom po sesiji
        }

        // KORAK C reconciliation: DOK red NIJE prazan, lokalni model je autoritet. Ako je server
        // pozicija IZA lokalne (jos nije obradio nase akcije) -> ignorisi (ne vuci UI unazad).
        if let sid = sessionId ?? currentSessionId, !PendingActionStore.shared.isEmpty(sessionId: sid) {
            let serverIdx = exerciseIdx ?? planExercises.first(where: { $0.exerciseName == exerciseName })?.exerciseIdx
            if let local = computeLocalPosition(), !local.complete, let sIdx = serverIdx {
                if (sIdx, setNumber) < (local.exerciseIdx, local.setNumber) {
                    if let serverNowMs = serverNowMs {
                        serverClockOffset = Date(timeIntervalSince1970: serverNowMs / 1000.0).timeIntervalSince(Date())
                    }
                    return   // server jos nije stigao; lokalni vozi
                }
            }
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

        // KORAK B: server pomera lokalni model (uskladi doneCount-ove sa serverskom pozicijom).
        syncLocalToServer(exerciseName: exerciseName, setNumber: setNumber)

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
            // Phone-driven auto-finish: ista putanja kao poll null -> finalizuj HealthKit
            // i upisi metrike (kalorije/HR), pa pređi u completed/idle.
            restEndsAt = nil
            handleWorkoutDeleted()

        default:
            break
        }
    }
    
    // MARK: - Watch akcije
    
    // KORAK C: OPTIMISTICKI advance - UI predje ODMAH, akcija se baferuje i odsvira na vezi.
    private func handleCompleteSet() {
        WKInterfaceDevice.current().play(.success)
        guard let sessionId = currentSessionId else { return }
        guard let pos = computeLocalPosition(), !pos.complete else {
            // Nema lokalnog plana (offline bez kesa / jos se ucitava) -> stari server-driven put.
            Task {
                guard let token = effectiveToken else { return }
                do {
                    _ = try await SupabaseClient.shared.engineCompleteSet(token: token, sessionId: sessionId, reps: nil, weight: nil, rpe: nil)
                    noteRpcSuccess()
                } catch SupabaseError.sessionEnded {
                    noteRpcSuccess(); await MainActor.run { handleWorkoutDeleted() }
                } catch { noteRpcError(error) }
            }
            return
        }

        // 1) Lokalni model ODMAH napreduje (ubelezi seriju za trenutnu vezbu).
        doneCounts[pos.apeId] = (doneCounts[pos.apeId] ?? 0) + 1
        persistPlan()

        // 2) Enqueue complete_set (server racuna poziciju iz done-count-a; reps/weight = planirani).
        PendingActionStore.shared.enqueue(PendingAction(
            id: UUID().uuidString, type: .completeSet, sessionId: sessionId,
            reps: pos.plannedReps, weight: pos.plannedWeight, rpe: nil, createdAt: Date()))

        // 3) Optimisticki UI: rest (ima jos serija) ili lokalno completed (poslednja serija).
        if let next = computeLocalPosition(), !next.complete {
            restEndsAt = Date().addingTimeInterval(Double(max(pos.restSeconds, 1)))
            currentState = .rest
            flushQueue()
        } else {
            // Poslednja serija: server auto-finalizuje preko complete_set. Posalji PRE reseta.
            flushQueue()
            handleWorkoutDeleted()   // lokalno completed + finalizuj/buffer metrike + cleanup
        }
    }

    private func handleRestComplete() {
        // Odmor istekao -> optimisticki na aktivnu sledecu seriju (vec u doneCounts).
        restEndsAt = nil
        currentState = .activeWorkout
        // Tranzitorno (server ne treba za rezultat) -> fire-and-forget, NIJE u replay redu.
        guard let token = effectiveToken, let sessionId = currentSessionId else { return }
        Task {
            do { _ = try await SupabaseClient.shared.engineSkipRest(token: token, sessionId: sessionId); noteRpcSuccess() }
            catch SupabaseError.sessionEnded { noteRpcSuccess() }
            catch { noteRpcError(error) }
        }
    }

    private func handleRestSkip() {
        WKInterfaceDevice.current().play(.click)
        restEndsAt = nil
        currentState = .activeWorkout
        guard let token = effectiveToken, let sessionId = currentSessionId else { return }
        Task {
            do { _ = try await SupabaseClient.shared.engineSkipRest(token: token, sessionId: sessionId); noteRpcSuccess() }
            catch SupabaseError.sessionEnded { noteRpcSuccess() }
            catch { noteRpcError(error) }
        }
    }

    // Finalizuj HealthKit (endCollection pa procitaj FINALNE agregate) i upisi metrike
    // preko watch_report_metrics. Koristi se na auto-finish putanji; server GREATEST
    // stiti od kasne nule / duplikata. Token i sessionId se hvataju PRE reseta.
    private func finalizeAndReport(token: String?, sessionId: String?) async {
        let m = await healthKit.finalizeAndStop()
        guard let token = token, let sessionId = sessionId else { return }
        // Ne salji 0 kao metriku (gazilo bi prave vrednosti). Ako su sve tri 0 -> ne enqueue.
        guard m.calories > 0 || m.hrAvg > 0 || m.hrMax > 0 else { return }
        // Perzistiraj pa flush: ako je sat offline na zavrsetku, ostaje za kasnije (Problem A).
        PendingReportStore.shared.add(PendingMetrics(
            sessionId: sessionId,
            activeCalories: m.calories > 0 ? m.calories : nil,
            hrAvg: m.hrAvg > 0 ? m.hrAvg : nil,
            hrMax: m.hrMax > 0 ? m.hrMax : nil,
            token: token,
            createdAt: Date()
        ))
        await flushPendingMetrics()
        schedulePendingRetry()
    }

    // MARK: - Offline buffer flush (Problem A)

    /// Posalji sve "pending" metrike. Uspeh -> obrisi iz store-a; offline -> ostavi.
    /// Payload stariji od 7 dana se odbacuje (token verovatno istekao, nema svrhe).
    private func flushPendingMetrics() async {
        let pending = PendingReportStore.shared.all()
        guard !pending.isEmpty else { return }
        let now = Date()
        for item in pending {
            if now.timeIntervalSince(item.createdAt) > 7 * 24 * 3600 {
                PendingReportStore.shared.remove(sessionId: item.sessionId)
                continue
            }
            if await trySendPending(item) {
                PendingReportStore.shared.remove(sessionId: item.sessionId)
            }
        }
    }

    /// Pokusaj isporuke jednog payload-a. Sacuvani token prvo; na invalid_token probaj
    /// trenutni effectiveToken. Mrezna greska -> false (ostaje za sledeci flush).
    /// success ili session_not_found (permanentno) -> true (skloni iz reda).
    private func trySendPending(_ item: PendingMetrics) async -> Bool {
        do {
            _ = try await SupabaseClient.shared.reportMetrics(
                token: item.token, sessionId: item.sessionId,
                activeCalories: item.activeCalories, hrAvg: item.hrAvg, hrMax: item.hrMax, hrSeries: nil)
            return true
        } catch SupabaseError.invalidToken {
            guard let current = effectiveToken, current != item.token else { return false }
            do {
                _ = try await SupabaseClient.shared.reportMetrics(
                    token: current, sessionId: item.sessionId,
                    activeCalories: item.activeCalories, hrAvg: item.hrAvg, hrMax: item.hrMax, hrSeries: nil)
                return true
            } catch {
                return false
            }
        } catch {
            return false
        }
    }

    /// Kratak backoff posle enqueue: uhvati povratak veze u prvih par minuta dok je app aktivan.
    private func schedulePendingRetry() {
        for delay in [UInt64(5), UInt64(15), UInt64(30)] {
            Task {
                try? await Task.sleep(nanoseconds: delay * 1_000_000_000)
                await flushPendingMetrics()
            }
        }
    }

    // KORAK C: rucni prevremeni zavrsetak - optimisticki lokalno completed + enqueue finish
    // (replay POSLEDNJI). Metrike (kalorije/HR) idu kroz handleWorkoutDeleted -> finalizeAndReport.
    private func handleFinishWorkout() {
        WKInterfaceDevice.current().play(.success)
        guard let sessionId = currentSessionId else { return }
        PendingActionStore.shared.enqueue(PendingAction(
            id: UUID().uuidString, type: .finish, sessionId: sessionId,
            reps: nil, weight: nil, rpe: nil, createdAt: Date()))
        flushQueue()             // posalji finish (server finalizuje) PRE reseta
        handleWorkoutDeleted()   // lokalno completed + finalizuj/buffer metrike + cleanup
    }

    // +30/+60 odmor: optimisticki produzi lokalni odmor; server fire-and-forget (tranzitorno,
    // NIJE u replay redu - odmor je UI/timing, server ga ne treba za rezultat).
    private func handleAddRest(_ seconds: Int) {
        if let end = restEndsAt { restEndsAt = end.addingTimeInterval(Double(seconds)) }
        guard let token = effectiveToken, let sessionId = currentSessionId else { return }
        Task {
            do { _ = try await SupabaseClient.shared.engineExtendRest(token: token, sessionId: sessionId, seconds: seconds); noteRpcSuccess() }
            catch SupabaseError.sessionEnded { noteRpcSuccess() }
            catch { noteRpcError(error) }
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
        if healthKit.isWorkoutActive {
            return
        }
        
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
            
            // Listener za HR update-ove (azurira lokalni prikaz; salje i odmah - bezopasno).
            healthKit.onHeartRateUpdate = { bpm in
                heartRate = bpm
                Task { await sendHeartRateToServer() }
            }

            // OBAVEZAN keep-alive: periodicni tajmer (5s) salje POSLEDNJI HR serveru i
            // tokom mirovanja (rest), kad HK ne emituje uzorke -> watch_last_hr_at svez.
            // Ujedno periodicni (5s) okidac za replay baferovanih set-akcija (KORAK C).
            healthKit.onKeepAlive = {
                Task { await sendHeartRateToServer() }
                flushQueue()
            }
        }
    }

    private func stopHealthKitWorkout() {
        healthKit.stopWorkoutSession()
        healthKit.onHeartRateUpdate = nil
        healthKit.onKeepAlive = nil
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
            noteRpcSuccess()
        } catch SupabaseError.sessionEnded {
            // Trening je zavrsen na serveru, a sat je jos slao puls (fantom).
            // Zatvori HealthKit workout, prestani slanje, napusti ekran treninga.
            noteRpcSuccess()   // server dosegnut -> online
            print("HR update: session ended on server - closing watch workout")
            await MainActor.run { handleWorkoutDeleted() }
        } catch {
            noteRpcError(error)
            print("HR update error: \(error.localizedDescription)")
        }
    }
}

#Preview {
    ContentView()
}