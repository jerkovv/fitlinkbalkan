// APNs push registracija (iOS, Capacitor).
//
// Pri logovanju / startu (kad je korisnik ulogovan) trazimo dozvolu i
// registrujemo se za remote notifikacije. Kad APNs vrati device token, upisemo
// ga u device_push_tokens (user_id = trenutni korisnik, platform 'ios'),
// upsert na token (jedinstven indeks na token). Isti kod za trenera i vezbaca.
//
// Na odjavu brisemo token OVOG uredjaja (po vrednosti) dok sesija jos vazi, da
// se posle odjave push ne salje na tudji nalog na istom telefonu.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";

const isNativeIOS = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

// Poslednji APNs token ovog uredjaja - cuva se i u localStorage da bi odjava
// (koja moze doci posle reload-a) znala koji red da obrise.
const TOKEN_KEY = "fitlink.apnsToken";

let listenersBound = false;
let currentUserId: string | null = null;

async function upsertToken(token: string) {
  if (!currentUserId) return;
  try {
    const { error } = await supabase
      .from("device_push_tokens")
      .upsert(
        {
          user_id: currentUserId,
          token,
          platform: "ios",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      );
    if (error) {
      console.error("[Push] upsert token failed:", error);
      return;
    }
    localStorage.setItem(TOKEN_KEY, token);
    console.log("[Push] APNs token saved");
  } catch (e) {
    console.error("[Push] upsert token threw:", e);
  }
}

// Listeneri se vezuju samo jednom za ceo zivot app-a (token moze stici i
// asinhrono, posle register()). VAZNO: vezuju se PRE register() i await-uju se,
// inace se token event moze propustiti.
async function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;
  console.log("[Push] binding registration listeners (once)");

  await PushNotifications.addListener("registration", (t) => {
    console.log(`[Push] registration event - APNs token received (…${t.value.slice(-6)})`);
    void upsertToken(t.value);
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("[Push] registrationError event:", JSON.stringify(err));
  });
}

// Zatrazi dozvolu i registruj se. Bezbedno za pozivanje vise puta - register()
// je idempotentan, a upsert samo osvezi postojeci red.
export async function registerPushNotifications(userId: string) {
  const native = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  console.log(
    `[Push] registerPushNotifications called (userId=${userId}, native=${native}, platform=${platform})`,
  );
  if (!isNativeIOS()) {
    console.log("[Push] not native iOS - skipping (web/preview no-op)");
    return;
  }
  currentUserId = userId;
  try {
    // Listeneri PRE register() i await-ovani.
    await bindListeners();
    console.log("[Push] listeners bound, checking permissions...");

    let perm = await PushNotifications.checkPermissions();
    console.log("[Push] checkPermissions ->", perm.receive);
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      console.log("[Push] requesting permission (system dialog should appear)...");
      perm = await PushNotifications.requestPermissions();
      console.log("[Push] requestPermissions ->", perm.receive);
    }
    if (perm.receive !== "granted") {
      console.log("[Push] permission not granted:", perm.receive);
      return;
    }

    console.log("[Push] permission granted, calling register()...");
    await PushNotifications.register();
    console.log("[Push] register() called - waiting for registration event with token");
  } catch (e) {
    console.error("[Push] registerPushNotifications failed:", e);
  }
}

// Odjava: obrisi token ovog uredjaja. Zvati PRE supabase.auth.signOut() da
// sesija jos vazi (RLS delete je dozvoljen samo za sopstvene redove).
export async function clearPushToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  currentUserId = null;
  if (!isNativeIOS() || !token) return;
  try {
    const { error } = await supabase
      .from("device_push_tokens")
      .delete()
      .eq("token", token);
    if (error) {
      console.error("[Push] clear token failed:", error);
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
    console.log("[Push] token cleared on logout");
  } catch (e) {
    console.error("[Push] clearPushToken threw:", e);
  }
}
