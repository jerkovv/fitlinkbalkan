//
//  WorkoutPickerView.swift
//  FitLink Watch Watch App
//
//  Pokretanje treninga SA SATA: lista programa/dana (watch_list_workouts) i start
//  (watch_start_workout). Na uspeh okida onStarted -> parent radi poll (forceRefresh),
//  pa se preuzima postojeci tok aktivnog treninga. Bez offline sesije.
//

import SwiftUI
import WatchKit

struct WorkoutPickerView: View {
    let token: String
    /// Poziva se na uspesan start: parent zatvori sheet + forceRefresh (poll preuzme sesiju).
    let onStarted: () -> Void
    /// Slobodan trening (bez plana): na uspeh vraca session_id da parent udje u slobodan view.
    let onStartedFree: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var loading = true
    @State private var response: WatchWorkoutsResponse?
    @State private var loadFailed = false
    @State private var startingDayId: String?
    @State private var startingFree = false
    @State private var startError: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            content
        }
        .task { if response == nil { await load() } }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .scaleEffect(0.8)
                .tint(.white)
        } else if loadFailed {
            retryState(
                icon: "wifi.slash",
                text: "Nema veze sa serverom",
                action: { Task { await load() } },
                actionLabel: "Pokušaj ponovo"
            )
        } else {
            // "Slobodan trening" je UVEK na vrhu (radi i bez plana), pa lista dana ako ima
            // aktivan program, inace kratak hint.
            list(program: response?.program, days: response?.days ?? [])
        }
    }

    // MARK: - Lista

    private func list(program: WatchProgram?, days: [WatchWorkoutDay]) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if let err = startError {
                    Text(err)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.brandDestructive)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                // Slobodan trening - PRVA stavka, vizuelno odvojena (gradient okvir).
                freeWorkoutRow
                    .padding(.top, 2)

                if let program = program {
                    Text(program.name.uppercased())
                        .font(.system(size: 12, weight: .heavy))
                        .tracking(0.5)
                        .foregroundColor(.textMuted)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .padding(.top, 4)

                    ForEach(days) { day in
                        dayRow(program: program, day: day)
                    }
                } else {
                    Text("Nemate aktivan program")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.textMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 4)
                }

                Button(action: { dismiss() }) {
                    Text("Zatvori")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Slobodan trening red

    private var freeWorkoutRow: some View {
        Button(action: { Task { await startFree() } }) {
            HStack(spacing: 8) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(LinearGradient.brandGradient)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Slobodan trening")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                    Text("Bez plana - puls i kalorije")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.textMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 4)
                if startingFree {
                    ProgressView().scaleEffect(0.6).tint(.white)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.textMuted)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.brandViolet.opacity(0.14))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(LinearGradient.brandGradient, lineWidth: 1.2)
            )
        }
        .buttonStyle(.plain)
        .disabled(startingFree || startingDayId != nil)
    }

    private func dayRow(program: WatchProgram, day: WatchWorkoutDay) -> some View {
        let isNext = program.nextDayNumber == day.dayNumber
        let isStarting = startingDayId == day.dayId
        return Button(action: { Task { await start(program: program, day: day) } }) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(day.name)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text("\(day.exerciseCount) vežbi")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.textMuted)
                }
                Spacer(minLength: 4)
                if isStarting {
                    ProgressView().scaleEffect(0.6).tint(.white)
                } else if isNext {
                    Text("nastavi")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(0.4)
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(LinearGradient.brandGradient)
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isNext ? Color.brandViolet.opacity(0.18) : Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isNext ? Color.brandViolet.opacity(0.5) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(startingDayId != nil || startingFree)
    }

    // MARK: - Prazno / greska stanje

    private func retryState(icon: String, text: String, action: @escaping () -> Void, actionLabel: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(.textMuted)
            Text(text)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
            Button(action: action) {
                Text(actionLabel)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(LinearGradient.brandGradient)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
    }

    // MARK: - Mreza

    @MainActor
    private func load() async {
        loading = true
        loadFailed = false
        startError = nil
        do {
            response = try await SupabaseClient.shared.listWorkouts(token: token)
        } catch {
            loadFailed = true
        }
        loading = false
    }

    @MainActor
    private func startFree() async {
        guard !startingFree, startingDayId == nil else { return }
        startError = nil
        startingFree = true
        WKInterfaceDevice.current().play(.click)
        do {
            let resp = try await SupabaseClient.shared.startFreeWorkout(token: token)
            if resp.success, let sid = resp.sessionId {
                WKInterfaceDevice.current().play(.success)
                onStartedFree(sid)   // parent: udji u slobodan view (session postavljen kao tekuci)
            } else {
                startingFree = false
                startError = resp.error ?? "Greška pri pokretanju treninga"
            }
        } catch {
            // Mrezni neuspeh - bez offline sesije; ponudi ponovni pokusaj (tap ponovo).
            startingFree = false
            startError = "Nema veze. Probaj ponovo."
        }
    }

    @MainActor
    private func start(program: WatchProgram, day: WatchWorkoutDay) async {
        guard startingDayId == nil else { return }
        startError = nil
        startingDayId = day.dayId
        WKInterfaceDevice.current().play(.click)
        do {
            let resp = try await SupabaseClient.shared.startWorkout(
                token: token, assignedProgramId: program.id, dayId: day.dayId
            )
            if resp.success {
                WKInterfaceDevice.current().play(.success)
                onStarted()   // parent: zatvori sheet + forceRefresh (poll preuzme sesiju)
            } else {
                startingDayId = nil
                startError = resp.error ?? "Greška pri pokretanju treninga"
            }
        } catch {
            // Mrezni neuspeh - bez offline sesije; ponudi ponovni pokusaj (tap na dan).
            startingDayId = nil
            startError = "Nema veze. Probaj ponovo."
        }
    }
}
