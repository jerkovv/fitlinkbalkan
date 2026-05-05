import { Capacitor, registerPlugin } from "@capacitor/core";

// TS interfejs za nativni WatchSyncPlugin (ios/App/App/WatchSyncPlugin.swift).
// Ime "WatchSync" mora se poklapati sa CAP_PLUGIN(...) macro-om u .m fajlu.
interface WatchSyncPlugin {
  sendTokenToWatch(opts: {
    token: string;
    userId: string;
  }): Promise<{ success: boolean; reachable?: boolean }>;

  clearWatchToken(): Promise<{ success: boolean; skipped?: boolean }>;

  isWatchPaired(): Promise<{ paired: boolean }>;

  isWatchAppInstalled(): Promise<{ installed: boolean }>;
}

export const WatchSync = registerPlugin<WatchSyncPlugin>("WatchSync");

// Helper - true samo na pravom iOS uređaju (Capacitor native iOS bridge).
// Web/Lovable preview vraca false pa svi pozivi tiho preskacu.
export const isNativeIOS = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
