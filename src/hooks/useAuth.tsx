import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/database.types";
import { WatchSync, isNativeIOS } from "@/lib/watchSync";

// Salje pairing token Apple Watch-u preko nativnog WatchSync plugin-a.
// Tihi no-op na web/Lovable preview-u i kad Watch nije upared.
async function syncWatchToken(userId: string) {
  if (!isNativeIOS()) return;

  console.log("[WatchSync] Calling get_or_create_watch_token RPC...");
  try {
    const { data, error } = await supabase.rpc("get_or_create_watch_token");
    if (error) {
      console.error("[WatchSync] RPC failed:", error);
      return;
    }
    if (!data?.success || !data?.token) {
      console.warn("[WatchSync] RPC returned no token:", data);
      return;
    }
    console.log("[WatchSync] Got token, calling native sendTokenToWatch...");
    const result = await WatchSync.sendTokenToWatch({
      token: data.token,
      userId: data.user_id ?? userId,
    });
    console.log("[WatchSync] Native returned:", result);
  } catch (e) {
    // Watch nije upared, app nije instalirana - ne smatrati greskom.
    console.warn("[WatchSync] sendTokenToWatch failed (Watch may not be paired):", e);
  }
}

async function clearWatchTokenSafe() {
  if (!isNativeIOS()) return;
  console.log("[WatchSync] Sending clear_token to Watch...");
  try {
    const result = await WatchSync.clearWatchToken();
    console.log("[WatchSync] Clear returned:", result);
  } catch (e) {
    console.warn("[WatchSync] clearWatchToken failed:", e);
  }
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
      // SIGNED_OUT: prvo posalji clear_token Watch-u, pa tek onda resetuj state.
      // Tako Watch dobije signal pre nego sto cele sesije nestane.
      if (event === "SIGNED_OUT") {
        await clearWatchTokenSafe();
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
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

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    setRole((data?.role as AppRole) ?? null);
  };

  const signOut = async () => {
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
