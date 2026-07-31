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
import { getActionTarget, getPushFallbackPath } from "@/lib/notificationTarget";
import type { NotificationKind } from "@/hooks/useNotifications";

const isNativeIOS = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

// Poslednji APNs token ovog uredjaja - cuva se i u localStorage da bi odjava
// (koja moze doci posle reload-a) znala koji red da obrise.
const TOKEN_KEY = "fitlink.apnsToken";

let listenersBound = false;
let currentUserId: string | null = null;

// Tap na push mora da navigira kroz React Router, a ovaj fajl je van React
// stabla. AuthProvider (montiran unutar <BrowserRouter>) registruje ovde svoj
// navigate preko setPushNavigateHandler. Ako tap stigne pre registracije
// (hladan start), path cekamo u pendingPushPath i flush-ujemo cim se javi.
type PushNavigateHandler = (path: string) => void;
let navigateHandler: PushNavigateHandler | null = null;
let pendingPushPath: string | null = null;

export function setPushNavigateHandler(fn: PushNavigateHandler | null) {
  navigateHandler = fn;
  if (fn && pendingPushPath) {
    const path = pendingPushPath;
    pendingPushPath = null;
    fn(path);
  }
}

function navigateFromPush(path: string) {
  if (navigateHandler) navigateHandler(path);
  else pendingPushPath = path;
}

// Ista upit-logika kao fetchRole u useAuth.tsx, ovde ponovljena jer ovaj fajl
// namerno nema React/context zavisnost.
async function resolveCurrentRole(): Promise<"trainer" | "athlete" | null> {
  if (!currentUserId) return null;
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUserId)
      .maybeSingle();
    const role = (data as any)?.role;
    return role === "trainer" || role === "athlete" ? role : null;
  } catch {
    return null;
  }
}

// Puno kind-svesno rutiranje preko getActionTarget (isto sto NotificationDetail.tsx
// radi in-app), sad kad send-push prosledjuje notification_id/kind/recipient_role/
// athlete_id pored meta. Fallback (getPushFallbackPath) ostaje za: (a) stariji
// push poslat pre ove izmene (nema kind-a), (b) getActionTarget ipak vrati
// nepotpun target - endsWith proverа ispod je samo jeftina odbrana za slucaj
// greske u payload-u (npr. athlete_id prazan string), vise NIJE ocekivano
// ponasanje za workout_completed/message otkad athlete_id stize normalno.
async function resolvePushTapPath(data: Record<string, unknown> | null): Promise<string> {
  const recipientRoleFromPayload =
    data?.recipient_role === "trainer" || data?.recipient_role === "athlete"
      ? (data.recipient_role as "trainer" | "athlete")
      : null;
  const role = recipientRoleFromPayload ?? (await resolveCurrentRole());

  const kind = typeof data?.kind === "string" ? (data.kind as NotificationKind) : null;
  if (kind && role) {
    const target = getActionTarget({
      kind,
      recipient_role: role,
      athlete_id: typeof data?.athlete_id === "string" ? data.athlete_id : "",
      meta: (data ?? {}) as Record<string, unknown>,
    });
    if (target && !target.path.endsWith("/trener/vezbaci/")) {
      console.log(`[Push] tap resolved via getActionTarget -> ${target.path}`);
      return target.path;
    }
  }

  const fallback = getPushFallbackPath(role, data);
  console.log(`[Push] tap fallback -> ${fallback} (role=${role}, kind=${kind ?? "missing"})`);
  return fallback;
}

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

  // Tap na push (background ili cold start preko notifikacije). notification.data
  // nosi ono sto je stiglo pored aps u APNs payload-u - vidi resolvePushTapPath.
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = (action?.notification?.data ?? null) as Record<string, unknown> | null;
    console.log("[Push] tap action, data:", JSON.stringify(data));
    void resolvePushTapPath(data).then(navigateFromPush);
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
