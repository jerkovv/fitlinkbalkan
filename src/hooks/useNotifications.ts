import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type NotificationKind = "booking_created" | "booking_canceled" | "workout_completed" | "message";

export interface AppNotification {
  id: string;
  trainer_id: string;
  athlete_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  meta: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

const PAGE_SIZE = 50;

/**
 * Realtime notifikacije za ulogovanog trenera.
 * Vraća listu, broj nepročitanih i akcije.
 */
export const useNotifications = () => {
  const { user, role } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const enabled = !!user && role === "trainer";

  const fetchItems = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (!error && data) setItems(data as AppNotification[]);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Realtime subscription
  useEffect(() => {
    if (!enabled || !user) return;

    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `trainer_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => [payload.new as AppNotification, ...prev].slice(0, PAGE_SIZE));
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((n) => (n.id === (payload.new as any).id ? (payload.new as AppNotification) : n)),
            );
          } else if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((n) => n.id !== (payload.old as any).id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, user]);

  const unreadCount = items.filter((n) => !n.is_read).length;

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.rpc("mark_all_notifications_read");
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  return { items, loading, unreadCount, markRead, markAllRead, remove, refetch: fetchItems };
};
