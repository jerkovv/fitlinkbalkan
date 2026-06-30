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

    @Environment(\.dismiss) private var dismiss

    @State private var loading = true
    @State private var response: WatchWorkoutsResponse?
    @State private var loadFailed = false
    @State private var startingDayId: String?
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
        } else if let program = response?.program {
            list(program: program, days: response?.days ?? [])
        } else {
            // program == null -> nema aktivan program
            retryState(
                icon: "calendar.badge.exclamationmark",
                text: "Nemate aktivan program",
                action: { dismiss() },
                actionLabel: "Zatvori"
            )
        }
    }

    // MARK: - Lista

    private func list(program: WatchProgram, days: [WatchWorkoutDay]) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(program.name.uppercased())
                    .font(.system(size: 12, weight: .heavy))
                    .tracking(0.5)
                    .foregroundColor(.textMuted)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 2)

                if let err = startError {
                    Text(err)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.brandDestructive)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                ForEach(days) { day in
                    dayRow(program: program, day: day)
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

    private func dayRow(program: WatchProgram, day: WatchWorkoutDay) -> some View {
        let isCurrent = program.currentDay == day.dayNumber
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
                } else if isCurrent {
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
            .background(isCurrent ? Color.brandViolet.opacity(0.18) : Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isCurrent ? Color.brandViolet.opacity(0.5) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(startingDayId != nil)
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
