import {
  AlarmClock,
  Apple,
  CalendarClock,
  ClipboardList,
  Dumbbell,
  MessageCircle,
  Radio,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type OblastZakljucanja = {
  ikona: LucideIcon;
  naslov: string;
  /** Sta ostaje treneru i bez pretplate. */
  tekst: string;
  /** Sta se tacno otkljucava. */
  stavke: string[];
};

// Isti tekstovi stoje i u aplikacijama (TrenerPretplata na iOS-u i Androidu).
export const OBLASTI = {
  opste: {
    ikona: Sparkles,
    naslov: "Otključaj FitLink",
    tekst: "Sve tvoje podatke i dalje vidiš. Izmene se otključavaju uz aktivnu pretplatu.",
    stavke: ["Programi, ishrana i snimci vežbi", "Termini, članarine i uplate", "Praćenje vežbača uživo"],
  },
  programi: {
    ikona: ClipboardList,
    naslov: "Programi su uz pretplatu",
    tekst: "Tvoji programi ostaju sačuvani i možeš da ih pregledaš.",
    stavke: ["Pravljenje i izmena programa", "Dodela programa vežbačima", "Tipovi serija i superseti"],
  },
  ishrana: {
    ikona: Apple,
    naslov: "Planovi ishrane su uz pretplatu",
    tekst: "Tvoji planovi ostaju sačuvani i možeš da ih pregledaš.",
    stavke: ["Pravljenje i izmena planova", "Dodela plana vežbaču", "Namirnice u gramima i na komad"],
  },
  biblioteka: {
    ikona: Dumbbell,
    naslov: "Snimci vežbi su uz pretplatu",
    tekst: "Vežbu, mišiće i uputstvo i dalje vidiš.",
    stavke: ["Snimci svih vežbi", "Dodavanje svojih vežbi", "Omiljene vežbe"],
  },
  raspored: {
    ikona: CalendarClock,
    naslov: "Raspored je uz pretplatu",
    tekst: "Termini i rezervacije ostaju sačuvani.",
    stavke: ["Dodavanje i izmena termina", "Upis klijenata i gostiju", "Otkazivanje i vraćanje termina"],
  },
  naplata: {
    ikona: Wallet,
    naslov: "Naplata je uz pretplatu",
    tekst: "Uplate i članarine ostaju sačuvane.",
    stavke: ["Potvrda uplata", "Članarine i paketi", "Označavanje plaćenog"],
  },
  vezbaci: {
    ikona: Users,
    naslov: "Vođenje vežbača je uz pretplatu",
    tekst: "Svi vežbači i njihovi podaci ostaju sačuvani.",
    stavke: ["Pozivanje novih vežbača", "Izmena podataka i merenja", "Dodela programa i ishrane"],
  },
  uzivo: {
    ikona: Radio,
    naslov: "Trening uživo je uz pretplatu",
    tekst: "Istorija treninga tvojih vežbača ostaje sačuvana.",
    stavke: ["Izmene treninga uživo", "Upis serija i težina", "Poruke vežbaču tokom treninga"],
  },
  poruke: {
    ikona: MessageCircle,
    naslov: "Poruke su uz pretplatu",
    tekst: "Svi razgovori ostaju sačuvani.",
    stavke: ["Slanje poruka vežbačima", "Obaveštenja svima", "Javi se vežbačima"],
  },
  podsetnici: {
    ikona: AlarmClock,
    naslov: "Podsetnici su uz pretplatu",
    tekst: "Tvoja podešavanja ostaju sačuvana.",
    stavke: ["Podsetnici pred termin", "Jutarnji i večernji pregled", "Podsetnici za klijente"],
  },
  profil: {
    ikona: UserRound,
    naslov: "Izmena profila je uz pretplatu",
    tekst: "Tvoj profil ostaje sačuvan.",
    stavke: ["Podaci i javna stranica", "Podaci za uplatu", "Pravila otkazivanja"],
  },
} satisfies Record<string, OblastZakljucanja>;

// Redosled je bitan: plan unutar profila vezbaca pripada programima ili ishrani.
const PUTANJE: [RegExp, OblastZakljucanja][] = [
  [/^\/trener\/vezbaci\/[^/]+\/program/, OBLASTI.programi],
  [/^\/trener\/vezbaci\/[^/]+\/ishrana/, OBLASTI.ishrana],
  [/^\/trener\/vezbac\/[^/]+\/live/, OBLASTI.uzivo],
  [/^\/trener\/uzivo/, OBLASTI.uzivo],
  [/^\/trener\/vezbaci/, OBLASTI.vezbaci],
  [/^\/trener\/programi/, OBLASTI.programi],
  [/^\/trener\/ishrana/, OBLASTI.ishrana],
  [/^\/trener\/biblioteka/, OBLASTI.biblioteka],
  [/^\/trener\/(kalendar|termini)/, OBLASTI.raspored],
  [/^\/trener\/(finansije|uplate|paketi)/, OBLASTI.naplata],
  [/^\/trener\/(chat|javi-se|notifikacije)/, OBLASTI.poruke],
  [/^\/trener\/(podsetnici|podesavanja-obavestenja)/, OBLASTI.podsetnici],
  [/^\/trener\/profil/, OBLASTI.profil],
];

export const oblastZaPutanju = (putanja: string): OblastZakljucanja =>
  PUTANJE.find(([re]) => re.test(putanja))?.[1] ?? OBLASTI.opste;
