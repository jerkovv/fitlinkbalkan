//
//  FitLink_WatchApp.swift
//  FitLink Watch Watch App
//
//  Created by Jerkov on 5/4/26.
//

import SwiftUI

@main
struct FitLink_Watch_Watch_AppApp: App {

    init() {
        // Aktiviraj WatchPhoneSession sto pre - iOS isporucuje POSLEDNJI
        // applicationContext odmah po aktivaciji, tako da ovo treba da
        // se desi pre nego sto ContentView pocne da koristi token.
        _ = WatchPhoneSession.shared
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
