import type { AppRole } from "@/lib/database.types";

// Pocetna ruta po ulozi u MOBILNOJ aplikaciji. null = uloga nema dom ovde (admin/nepoznato) -
// pozivaoci tada prikazuju UnsupportedAccount umesto navigacije. Bez ovoga admin upada u
// beskonacnu petlju: ternar trener/vezbac ga salje na /vezbac, koji ga ne prima, pa opet...
export function roleHome(role: AppRole | null | undefined): "/trener" | "/vezbac" | null {
  if (role === "trainer") return "/trener";
  if (role === "athlete") return "/vezbac";
  return null;
}
