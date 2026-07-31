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
    if (n.kind === "booking_created" || n.kind === "booking_canceled") {
      const slotDate = n.meta?.slot_date as string | undefined;
      const path = slotDate
        ? `/trener/kalendar?date=${slotDate}`
        : "/trener/kalendar";
      return { path, label: "Otvori kalendar" };
    }
    if (n.kind === "payment_request" || n.kind === "payment_marked")
      return { path: "/trener/uplate", label: "Otvori uplate" };
    if (n.kind === "workout_completed" || n.kind === "message")
      return { path: `/trener/vezbaci/${n.athlete_id}`, label: "Otvori profil vežbača" };
    if (n.kind === "waitlist_joined") {
      const slotDate = n.meta?.slot_date as string | undefined;
      return { path: slotDate ? `/trener/kalendar?date=${slotDate}` : "/trener/kalendar", label: "Otvori kalendar" };
    }
    return null;
  }
  // athlete
  if (n.kind === "program_assigned") return { path: "/vezbac/trening", label: "Otvori program" };
  if (n.kind === "nutrition_assigned") return { path: "/vezbac/ishrana", label: "Otvori plan ishrane" };
  if (n.kind === "membership_expiring" || n.kind === "membership_expired"
      || n.kind === "membership_activated" || n.kind === "membership_rejected")
    return { path: "/vezbac/clanarina", label: "Otvori članarinu" };
  if (n.kind === "waitlist_promoted" || n.kind === "booking_canceled_by_trainer") {
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
