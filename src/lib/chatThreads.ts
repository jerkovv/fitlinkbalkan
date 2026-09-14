/** Red iz RPC get_chat_threads - jedan razgovor trenera sa vezbacem. */
export type ChatThreadRow = {
  athlete_id: string;
  athlete_name: string;
  last_body: string | null;
  last_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
};

/** "sad", "5m", "3h", "2d", pa datum - vreme poslednje poruke u spisku razgovora. */
export const formatRelChat = (iso: string | null) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "sad";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "2-digit" });
};
