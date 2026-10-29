// Srpski oblik imenice uz broj: 1 vezba, 2 vezbe, 5 vezbi (11 do 14 uvek trece).
export const oblik = (n: number, jedan: string, dva: string, pet: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return jedan;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return dva;
  return pet;
};

export const vezbi = (n: number) => oblik(n, "vežba", "vežbe", "vežbi");
