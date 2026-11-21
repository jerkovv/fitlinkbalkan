// Deljena logika za odredjivanje cilja navigacije notifikacije.
//
// Koriste je dva pozivaoca:
//  - NotificationDetail.tsx (tap unutar app-a): ima ceo red iz baze
//    (kind, recipient_role, athlete_id, meta) -> getActionTarget ispod.
//  - push tap handler (pushNotifications.ts): APNs payload nosi title/body
//    (iz aps.alert) + notification_id/kind/recipient_role/athlete_id +
//    spljosten notifications.meta - vidi supabase/functions/send-push/index.ts.
//    To je dovoljno da se pozove ISTI getActionTarget za sve kind-ove.
//    getPushFallbackPath ispod je fallback SAMO za: kind nedostaje (stariji
//    push poslat pre ove izmene) ili getActionTarget ipak vrati nepotpun
//    target (npr. greska u payload-u) - koristi ono sto sigurno postoji:
//    slot_date (svi booking/waitlist kind-ovi) + rola korisnika.

import type { AppNotification } from "@/hooks/useNotifications";

export interface NotificationActionTarget {
  path: string;
  label: string;
}

export const getActionTarget = (
  n: Pick<AppNotification, "kind" | "recipient_role" | "athlete_id" | "meta">,
): NotificationActionTarget | null => {
  if (n.recipient_role === "trainer") {
    // Isti ciljevi kao `radnja` u TrenerNotifikacije.swift. Podsetnici i pretplata
    // stizu iz baze, ali nisu u NotificationKind, pa se porede kao tekst.
    const kind: string = n.kind;
    if (
      kind === "booking_created" || kind === "booking_canceled" || kind === "waitlist_joined"
      || kind === "session_reminder" || kind === "day_digest" || kind === "tomorrow_digest"
    ) {
      const slotDate = n.meta?.slot_date as string | undefined;
      return { path: slotDate ? `/trener/kalendar?date=${slotDate}` : "/trener/kalendar", label: "Otvori kalendar" };
    }
    if (kind === "payment_request" || kind === "payment_marked")
      return { path: "/trener/uplate", label: "Otvori uplate" };
    if (kind === "fitlink_sub_expiring" || kind === "fitlink_sub_expired")
      return { path: "/trener/profil", label: "Otvori pretplatu" };
    // Bez vezbaca nema cilja: push tada ide na getPushFallbackPath.
    if (!n.athlete_id) return null;
    if (kind === "message")
      return { path: `/trener/chat/${n.athlete_id}`, label: "Otvori poruke" };
    return { path: `/trener/vezbaci/${n.athlete_id}`, label: "Otvori profil vežbača" };
  }
  // athlete
  // Podsetnik "Jos treniras?": vodi pravo na trening, da moze odmah da ga ugasi.
  if (n.kind === "workout_forgotten") return { path: "/vezbac/trening", label: "Otvori trening" };
  if (n.kind === "program_assigned") return { path: "/vezbac/trening", label: "Otvori program" };
  if (n.kind === "nutrition_assigned") return { path: "/vezbac/ishrana", label: "Otvori plan ishrane" };
  if (n.kind === "message_from_trainer") return { path: "/vezbac/chat", label: "Otvori chat" };
  if (n.kind === "membership_expiring" || n.kind === "membership_expired"
      || n.kind === "membership_activated" || n.kind === "membership_rejected")
    return { path: "/vezbac/clanarina", label: "Otvori članarinu" };
  if (n.kind === "waitlist_promoted" || n.kind === "booking_canceled_by_trainer"
      || n.kind === "booking_added_by_trainer") {
    const slotDate = n.meta?.slot_date as string | undefined;
    return { path: slotDate ? `/vezbac/rezervacija?date=${slotDate}` : "/vezbac/rezervacija", label: "Otvori zakazivanje" };
  }
  return null;
};

// Push tap fallback (vidi objasnjenje iznad zasto ne moze getActionTarget).
// slot_date -> isti dan u kalendaru (trener) / rezervaciji (vezbac), sto je
// tacan cilj za SVAKI booking/waitlist kind bez obzira koji je tacno, jer svi
// vode na isti "taj dan" ekran. Bez slot_date-a (svi ostali kind-ovi, meta je
// '{}') nemamo cime da razlikujemo kind, pa vodimo na listu notifikacija gde
// korisnik moze da tapne konkretnu i dobije pun, tacan target iz getActionTarget.
export const getPushFallbackPath = (
  role: "trainer" | "athlete" | null,
  data: Record<string, unknown> | null | undefined,
): string => {
  const slotDate = typeof data?.slot_date === "string" ? data.slot_date : undefined;
  if (role === "trainer") {
    return slotDate ? `/trener/kalendar?date=${slotDate}` : "/trener/notifikacije";
  }
  if (role === "athlete") {
    return slotDate ? `/vezbac/rezervacija?date=${slotDate}` : "/vezbac/notifikacije";
  }
  // Rola jos nepoznata (npr. tap stigao pre nego sto se auth ucitao na hladnom
  // startu) -> "/" sam preusmerava na tacan dom cim se rola ucita (Index.tsx).
  return "/";
};
