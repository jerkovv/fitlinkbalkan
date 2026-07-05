import { Capacitor, registerPlugin } from "@capacitor/core";

// TS interfejs za nativni WatchSyncPlugin (ios/App/App/WatchSyncPlugin.swift).
// Ime "WatchSync" mora se poklapati sa CAP_PLUGIN(...) macro-om u .m fajlu.
interface WatchSyncPlugin {
  sendTokenToWatch(opts: {
    token: string;
    userId: string;
  }): Promise<{ success: boolean; reachable?: boolean }>;

  // Lagani reset loggedOut flaga na native strani, nezavisno od tokena/RPC-a.
  confirmLoggedIn(): Promise<{ success: boolean }>;

  clearWatchToken(): Promise<{ success: boolean; skipped?: boolean }>;

  isWatchPaired(): Promise<{ paired: boolean }>;

  isWatchAppInstalled(): Promise<{ installed: boolean }>;

  // WCSession nudge satu ("sync_now", bez podataka): sat na prijem ODMAH forsira poll
  // umesto da ceka 2s tick - pauza/pozicija krece na satu za <1s. Best-effort: ako sat
  // nije reachable, delivered=false i nista se ne kvari (2s poll ostaje fallback).
  nudgeSyncNow(): Promise<{ success: boolean; delivered?: boolean }>;
}

export const WatchSync = registerPlugin<WatchSyncPlugin>("WatchSync");

// Helper - true samo na pravom iOS uređaju (Capacitor native iOS bridge).
// Web/Lovable preview vraca false pa svi pozivi tiho preskacu.
export const isNativeIOS = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
