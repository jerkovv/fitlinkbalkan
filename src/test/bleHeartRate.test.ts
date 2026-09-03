import { describe, it, expect } from "vitest";
import { parseHeartRate } from "@/lib/wearable/bleHeartRate";

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
    // flags 0x16: bit 0 = 0 (uint8), uz upaljene bitove za kontakt i utrosenu energiju
    expect(parseHeartRate(dv(0x16, 131, 0x10, 0x00))).toBe(131);
  });

  it("odbacuje vrednosti van ljudskog opsega i prazne poruke", () => {
    expect(parseHeartRate(dv(0x00, 0))).toBeNull();
    expect(parseHeartRate(dv(0x01, 0xff, 0xff))).toBeNull();
    expect(parseHeartRate(dv(0x00))).toBeNull();
  });
});
