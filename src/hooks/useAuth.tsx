import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/database.types";
import { WatchSync, isNativeIOS } from "@/lib/watchSync";

// Jedan pokušaj sync-a tokena Watch-u. Vraća true ako je native potvrdio uspeh.
// Tihi no-op na web/Lovable preview-u.
async function syncWatchTokenOnce(userId: string, label: string): Promise<boolean> {
  if (!isNativeIOS()) return false;
  try {
    const { data, error } = await supabase.rpc("get_or_create_watch_token");
    if (error) {
      console.error(`[WatchSync] ${label} RPC failed:`, error);
      return false;
    }
    if (!data?.success || !data?.token) {
      console.warn(`[WatchSync] ${label} RPC returned no token:`, data);
      return false;
    }
    console.log(`[WatchSync] ${label} get_or_create ok (user ${data.user_id ?? userId})`);
    const result = await WatchSync.sendTokenToWatch({
      token: data.token,
      userId: data.user_id ?? userId,
    });
    const success = (result as any)?.success === true;
    console.log(`[WatchSync] ${label} sendTokenToWatch returned:`, result, "→ ok:", success);
    return success;
  } catch (e) {
    // Watch nije upared, app nije instalirana, sesija nije reachable.
    console.warn(`[WatchSync] ${label} sendTokenToWatch failed:`, e);
    return false;
  }
}

// Retry sync sa backoff-om: 0s, 2s, 6s, 15s (četiri pokušaja u ~23s).
// Koristi se na SIGNED_IN, TOKEN_REFRESHED i cold start - kad treba
// da osiguramo da Watch dobije najnoviji token i ako je u tom trenu bio
// nedostupan (zaključan, sleep, app upravo restartovan).
async function syncWatchToken(userId: string) {
  if (!isNativeIOS()) return;
  const delays = [0, 2000, 6000, 15000];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
    const ok = await syncWatchTokenOnce(userId, `sync ${i + 1}/${delays.length}`);
    if (ok) {
      console.log(`[WatchSync] Success on attempt ${i + 1}`);
      return;
    }
  }
  console.warn("[WatchSync] All sync attempts failed - Watch may keep stale token");
}

// Lagani reset loggedOut flaga na native strani. Poziva se cim znamo da postoji
// autentifikovana sesija (cold-start sa sesijom, SIGNED_IN), NEZAVISNO od RPC-a
// i mreže. Ovaj reset NE sme da zavisi od get_or_create - drugačije zaglavljen
// loggedOut=true ostane i sat lažno traži "uloguj se". Token se šalje zasebno.
async function confirmLoggedInSafe() {
  if (!isNativeIOS()) return;
  try {
    const result = await WatchSync.confirmLoggedIn();
    console.log("[WatchSync] confirmLoggedIn reset loggedOut=false:", result);
  } catch (e) {
    console.warn("[WatchSync] confirmLoggedIn failed:", e);
  }
}

// Retry clear: 0s, 1s, 3s. Zove se SAMO iz eksplicitne signOut() funkcije,
// nikad iz onAuthStateChange SIGNED_OUT handlera (tranzitorni drop sesije /
// neuspešan refresh ne sme da lažno upali loggedOut).
async function clearWatchTokenSafe() {
  if (!isNativeIOS()) return;
  const delays = [0, 1000, 3000];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const result = await WatchSync.clearWatchToken();
      console.log(`[WatchSync] clear ${i + 1}/${delays.length} returned:`, result);
      // success=true pokriva i "skipped" (nema sata/app-a) - oba znače da
      // više nemamo šta da brišemo.
      if ((result as any)?.success === true) return;
    } catch (e) {
      console.warn(`[WatchSync] clear ${i + 1} failed:`, e);
    }
  }
  console.warn("[WatchSync] All clear attempts failed");
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Listener PRVO
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // SIGNED_OUT NE briše Watch token ovde - Supabase emituje SIGNED_OUT i na
      // neuspešan refresh i na istek sesije, pa bi clearWatchToken lažno upalio
      // loggedOut. Watch keš se briše SAMO iz eksplicitne signOut() funkcije.
      if (event === "SIGNED_OUT") {
        console.log("[WatchSync] auth event SIGNED_OUT (no clear here - only explicit signOut clears)");
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        // Autentifikovana sesija → ODMAH resetuj loggedOut flag, nezavisno od
        // RPC-a/mreže. Token ide zasebno, best-effort, ispod.
        void confirmLoggedInSafe();

        // Defer role fetch da izbegnemo deadlock u callbacku
        setTimeout(() => {
          fetchRole(newSession.user.id);
        }, 0);

        // SIGNED_IN i TOKEN_REFRESHED: sync Watch token (ne na svaki event).
        // Defer 200ms da ne blokira auth callback.
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          setTimeout(() => {
            syncWatchToken(newSession.user.id);
          }, 200);
        }
      } else {
        setRole(null);
      }
    });

    // 2. Onda postojeća sesija
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        // Cold-start sa postojećom sesijom → ODMAH resetuj loggedOut flag,
        // nezavisno od RPC-a (pokriva slučaj zaglavljenog loggedOut=true).
        void confirmLoggedInSafe();

        fetchRole(existing.user.id).finally(() => setLoading(false));
        // Cold start - sync Watch token ako je sesija vec postojala
        // (npr. korisnik vec ulogovan, app reload). Defer 500ms da se
        // WCSession aktivira pre poziva.
        setTimeout(() => {
          syncWatchToken(existing.user.id);
        }, 500);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-sync na visibility change: kad app postane vidljiv (user otvori
  // FitLink iz pozadine), pokušaj jedan sync. Pokriva slučajeve kada je
  // početni sync na SIGNED_IN propao jer je Watch bio nedostupan.
  useEffect(() => {
    if (!isNativeIOS() || !user) return;
    const userId = user.id;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        console.log("[WatchSync] App became visible - single sync attempt");
        void syncWatchTokenOnce(userId, "visibility");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user]);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    setRole((data?.role as AppRole) ?? null);
  };

  const signOut = async () => {
    // Eksplicitni logout je JEDINO mesto koje briše Watch token i pali
    // loggedOut=true. Pošalji clear PRE signOut-a da Watch dobije signal dok
    // sesija još važi (a SIGNED_OUT event više ne dira Watch keš).
    await clearWatchTokenSafe();
    await supabase.auth.signOut();
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
