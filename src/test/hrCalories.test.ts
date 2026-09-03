import { describe, it, expect } from "vitest";
import { kcalPerMinute, createCalorieMeter } from "@/lib/wearable/hrCalories";

// Racun se ne moze isprobati rukom na treningu - broj koji ispadne je jedina
// provera, pa formula stoji pod testom.
const sada = new Date("2026-09-03T20:00:00Z");
const musko = { birthYear: 1990, gender: "male", weightKg: 80 };
const zensko = { birthYear: 1990, gender: "female", weightKg: 60 };

describe("kcalPerMinute (Keytel)", () => {
  it("racuna za muskarca", () => {
    // (-55.0969 + 0.6309*140 + 0.1988*80 + 0.2017*36) / 4.184 = 56.3943 / 4.184
    expect(kcalPerMinute(140, musko, sada)).toBeCloseTo(13.48, 1);
  });

  it("racuna za zenu", () => {
    // (-20.4022 + 0.4472*140 - 0.1263*60 + 0.074*36) / 4.184 = 37.2918 / 4.184
    expect(kcalPerMinute(140, zensko, sada)).toBeCloseTo(8.91, 1);
  });

  it("nikad ne vraca negativnu potrosnju", () => {
    expect(kcalPerMinute(40, musko, sada)).toBe(0);
  });

  it("bez tezine ili godine nema procene", () => {
    expect(kcalPerMinute(140, { ...musko, weightKg: null }, sada)).toBeNull();
    expect(kcalPerMinute(140, { ...musko, birthYear: null }, sada)).toBeNull();
  });
});

describe("createCalorieMeter", () => {
  it("sabira po proteklom vremenu, ne po broju uzoraka", () => {
    const gust = createCalorieMeter(musko);
    const redak = createCalorieMeter(musko);
    const t0 = 1_000_000;

    // isti minut, jedan meri na 1s a drugi na 10s
    for (let i = 0; i <= 60; i += 1) gust.add(140, t0 + i * 1000);
    for (let i = 0; i <= 60; i += 10) redak.add(140, t0 + i * 1000);

    expect(gust.total).toBeCloseTo(redak.total, 2);
  });

  it("ne racuna dugu rupu celom duzinom", () => {
    const m = createCalorieMeter(musko);
    const t0 = 1_000_000;
    m.add(140, t0);
    m.add(140, t0 + 10 * 60 * 1000); // deset minuta tisine
    // najvise 30s se prizna
    expect(m.total).toBeLessThan(kcalPerMinute(140, musko, sada)! * 0.6);
  });

  it("bez profila vraca null i ne sabira", () => {
    const m = createCalorieMeter({ birthYear: null, gender: null, weightKg: null });
    expect(m.add(140)).toBeNull();
    expect(m.total).toBe(0);
  });
});
