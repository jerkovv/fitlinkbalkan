import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type ChatMessage = {
  id: string;
  trainer_id: string;
  athlete_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

interface UseChatArgs {
  trainerId: string | null;
  athleteId: string | null;
}

/**
 * 1-na-1 chat između trenera i vežbača.
 * - Učitava istoriju
 * - Realtime subscription na nove poruke u threadu
 * - send(body) → insert
 * - markRead() → poziva mark_thread_read RPC
 */
export const useChat = ({ trainerId, athleteId }: UseChatArgs) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial fetch
  useEffect(() => {
    let alive = true;
    if (!trainerId || !athleteId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("trainer_id", trainerId)
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (!alive) return;
      if (!error && data) setMessages(data as ChatMessage[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [trainerId, athleteId]);

  // Realtime
  useEffect(() => {
    if (!trainerId || !athleteId) return;
    const channel = supabase
      .channel(`chat:${trainerId}:${athleteId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `athlete_id=eq.${athleteId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          if (m.trainer_id !== trainerId) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `athlete_id=eq.${athleteId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          if (m.trainer_id !== trainerId) return;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        },
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [trainerId, athleteId]);

  const send = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!text || !trainerId || !athleteId || !user) return { error: "no-input" as const };
      setSending(true);
      const { error } = await supabase.from("messages").insert({
        trainer_id: trainerId,
        athlete_id: athleteId,
        sender_id: user.id,
        body: text,
      } as any);
      setSending(false);
      return { error: error?.message ?? null };
    },
    [trainerId, athleteId, user],
  );

  const markRead = useCallback(async () => {
    if (!athleteId) return;
    await supabase.rpc("mark_thread_read", { p_athlete_id: athleteId } as any);
  }, [athleteId]);

  return { messages, loading, sending, send, markRead };
};
