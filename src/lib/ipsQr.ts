// IPS QR kod za plaćanje (NBS standard, Srbija)
// Specifikacija: https://nbs.rs/ips/qr/
//
// Format polja (separator = "|"):
//   K:PR        – fiksno (Korisnik: Plaćanje računa)
//   V:01        – verzija
//   C:1         – znakovi (1 = UTF-8 latinica)
//   R:<račun>   – broj računa primaoca (bez crtica, 18 cifara)
//   N:<naziv>   – ime/naziv primaoca (max 70)
//   I:RSD<iznos>– iznos sa valutom; decimalna zapeta (npr. RSD1500,00)
//   P:<ime>     – platilac (opciono)
//   SF:<šifra>  – šifra plaćanja (3 cifre, default 189 = ostalo)
//   S:<svrha>   – svrha uplate (max 35)
//   RO:<m><pp>  – model + poziv na broj (npr. 9712345)

import QRCode from "qrcode";

export type IpsBank = {
  recipient: string | null | undefined;
  account: string | null | undefined;
  model?: string | null;
  reference?: string | null;
  purpose?: string | null;
};

const stripAccountSeparators = (acc: string) => acc.replace(/[^0-9]/g, "");

const formatAmount = (amount: number) =>
  // NBS koristi zarez kao decimalni separator
  amount.toFixed(2).replace(".", ",");

const escape = (v: string) =>
  // | je separator, ne sme biti u vrednostima
  v.replace(/\|/g, "/").trim();

export const buildIpsPayload = (bank: IpsBank, amount: number): string | null => {
  const account = bank.account ? stripAccountSeparators(bank.account) : "";
  const recipient = bank.recipient ? escape(bank.recipient) : "";

  if (!account || !recipient || amount <= 0) return null;

  const fields: string[] = [
    "K:PR",
    "V:01",
    "C:1",
    `R:${account}`,
    `N:${recipient.slice(0, 70)}`,
    `I:RSD${formatAmount(amount)}`,
    "SF:189",
  ];

  if (bank.purpose) {
    fields.push(`S:${escape(bank.purpose).slice(0, 35)}`);
  }

  const model = (bank.model ?? "").replace(/[^0-9]/g, "");
  const ref = (bank.reference ?? "").replace(/[^0-9A-Za-z\-]/g, "");
  if (model && ref) {
    fields.push(`RO:${model}${ref}`);
  }

  return fields.join("|");
};

export const generateIpsQrDataUrl = async (
  bank: IpsBank,
  amount: number,
): Promise<string | null> => {
  const payload = buildIpsPayload(bank, amount);
  if (!payload) return null;

  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#0F0F14", light: "#FFFFFF" },
    });
  } catch {
    return null;
  }
};
