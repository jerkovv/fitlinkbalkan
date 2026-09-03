import { describe, it, expect } from "vitest";
import { parseHeartRate, parseHrReading } from "@/lib/wearable/bleHeartRate";

/**
 * 0x2A37 se ne moze isprobati u pregledacu - traka je jedini izvor tih bajtova.
 * Zato bar oblik poruke stoji pod testom: pogresno procitan fleg daje puls od
 * nekoliko hiljada ili nulu, a to bi se videlo tek na treningu.
 */
const dv = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe("parseHeartRate (GATT 0x2A37)", () => {
  it("cita bpm iz jednog bajta kad je bit 0 ugasen", () => {
    expect(parseHeartRate(dv(0x00, 72))).toBe(72);
  });

  it("cita bpm iz dva bajta (little endian) kad je bit 0 upaljen", () => {
    // 0x00A2 = 162
    expect(parseHeartRate(dv(0x01, 0xa2, 0x00))).toBe(162);
  });

  it("ne meša ostale flegove sa formatom (npr. kontakt sa kožom, energija)", () => {
    // flags 0x16: bit 0 = 0 (uint8), kontakt podrzan I detektovan, uz energiju
    expect(parseHeartRate(dv(0x16, 131, 0x10, 0x00))).toBe(131);
  });

  it("odbacuje ocitavanje kad traka javlja da NEMA kontakt sa kozom", () => {
    // flags 0x04: kontakt podrzan (bit 2), ali nije detektovan (bit 1 ugasen).
    // Broj uz to nije merenje - odatle "nasumicni" otkucaji dok traka nije na telu.
    const bez = parseHrReading(dv(0x04, 143));
    expect(bez.contact).toBe(false);
    expect(bez.bpm).toBeNull();

    const sa = parseHrReading(dv(0x06, 143));
    expect(sa.contact).toBe(true);
    expect(sa.bpm).toBe(143);
  });

  it("traka koja ne ume da javi kontakt ostaje bez ocene (contact null)", () => {
    const r = parseHrReading(dv(0x00, 72));
    expect(r.contact).toBeNull();
    expect(r.bpm).toBe(72);
    expect(r.raw).toBe("00 48");
  });

  it("odbacuje vrednosti van ljudskog opsega i prazne poruke", () => {
    expect(parseHeartRate(dv(0x00, 0))).toBeNull();
    expect(parseHeartRate(dv(0x01, 0xff, 0xff))).toBeNull();
    expect(parseHeartRate(dv(0x00))).toBeNull();
  });
});
