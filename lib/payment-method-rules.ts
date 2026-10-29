// Validation for the payment methods an admin sets up (bank, wallet, crypto, other). Pure, so the
// admin form and the API use the same rules.
import { isSupportedCurrency } from "@/lib/money";

export const PAYMENT_METHOD_TYPES = [
  { value: "bank", label: "Bank transfer" },
  { value: "wallet", label: "Digital wallet (Easypaisa, JazzCash…)" },
  { value: "crypto", label: "Crypto address" },
  { value: "other", label: "Other" },
] as const;
export type PaymentMethodTypeValue = (typeof PAYMENT_METHOD_TYPES)[number]["value"];

export interface PaymentMethodInput {
  type: PaymentMethodTypeValue;
  name: string;
  currencies: string[];
  bankName: string | null;
  accountTitle: string | null;
  accountNumber: string | null;
  iban: string | null;
  branch: string | null;
  swiftCode: string | null;
  walletNumber: string | null;
  cryptoAsset: string | null;
  cryptoNetwork: string | null;
  cryptoAddress: string | null;
  cryptoMemo: string | null;
  instructions: string | null;
}

type Result = { ok: true; value: PaymentMethodInput } | { ok: false; message: string };

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const EVM = /^0x[a-fA-F0-9]{40}$/;
const TRON = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

// A wrong crypto address loses the money for good, so the address is checked against the
// network the admin picked where we can recognise it.
export function checkCryptoAddress(network: string, address: string): string | null {
  if (/\s/.test(address)) return "The address can't contain spaces.";
  const n = network.toLowerCase();
  if (/(bep20|bsc|bnb|erc20|ethereum|polygon|arbitrum|optimism|base|evm)/.test(n)) {
    return EVM.test(address) ? null : "That isn't a valid address for this network (it should start with 0x and have 42 characters).";
  }
  if (/(trc20|tron|trx)/.test(n)) {
    return TRON.test(address) ? null : "That isn't a valid Tron address (it should start with T and have 34 characters).";
  }
  return address.length >= 15 && address.length <= 120 ? null : "Check the address: it looks too short or too long.";
}

export function validatePaymentMethod(input: Record<string, unknown>): Result {
  const type = PAYMENT_METHOD_TYPES.find((t) => t.value === input.type)?.value;
  if (!type) return { ok: false, message: "Choose the kind of payment method." };
  const name = str(input.name, 60);
  if (!name || name.length < 2) return { ok: false, message: "Give the method a name (e.g. Meezan Bank, JazzCash, USDT BNB Chain)." };

  const rawCurrencies = Array.isArray(input.currencies) ? input.currencies : [];
  const currencies = [...new Set(rawCurrencies.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  for (const c of currencies) {
    if (!isSupportedCurrency(c)) return { ok: false, message: `${c} isn't a supported currency.` };
  }

  const v: PaymentMethodInput = {
    type,
    name,
    currencies,
    bankName: null,
    accountTitle: null,
    accountNumber: null,
    iban: null,
    branch: null,
    swiftCode: null,
    walletNumber: null,
    cryptoAsset: null,
    cryptoNetwork: null,
    cryptoAddress: null,
    cryptoMemo: null,
    instructions: str(input.instructions, 1500),
  };

  if (type === "bank") {
    v.bankName = str(input.bankName, 80);
    v.accountTitle = str(input.accountTitle, 80);
    v.accountNumber = str(input.accountNumber, 40);
    v.iban = str(input.iban, 40)?.replace(/\s+/g, "").toUpperCase() ?? null;
    v.branch = str(input.branch, 80);
    v.swiftCode = str(input.swiftCode, 20)?.replace(/\s+/g, "").toUpperCase() ?? null;
    if (!v.accountTitle) return { ok: false, message: "Enter the account title (the name on the account)." };
    if (!v.accountNumber && !v.iban) return { ok: false, message: "Enter the account number or the IBAN." };
    if (v.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v.iban)) return { ok: false, message: "The IBAN doesn't look right." };
    if (v.swiftCode && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v.swiftCode)) return { ok: false, message: "The SWIFT code should be 8 or 11 letters and digits." };
  } else if (type === "wallet") {
    v.accountTitle = str(input.accountTitle, 80);
    v.walletNumber = str(input.walletNumber, 40);
    if (!v.accountTitle) return { ok: false, message: "Enter the name on the wallet account." };
    if (!v.walletNumber || !/^[+\d][\d\s-]{6,}$/.test(v.walletNumber)) return { ok: false, message: "Enter the wallet's mobile or account number." };
  } else if (type === "crypto") {
    v.cryptoAsset = str(input.cryptoAsset, 20)?.toUpperCase() ?? null;
    v.cryptoNetwork = str(input.cryptoNetwork, 60);
    v.cryptoAddress = str(input.cryptoAddress, 120);
    v.cryptoMemo = str(input.cryptoMemo, 60);
    if (!v.cryptoAsset) return { ok: false, message: "Enter the coin (e.g. USDT)." };
    if (!v.cryptoNetwork) return { ok: false, message: "Enter the network (e.g. BNB Smart Chain BEP20). Paying on the wrong network loses the money." };
    if (!v.cryptoAddress) return { ok: false, message: "Enter the wallet address." };
    const bad = checkCryptoAddress(v.cryptoNetwork, v.cryptoAddress);
    if (bad) return { ok: false, message: bad };
    if (!v.instructions) {
      v.instructions = `Send only ${v.cryptoAsset} on ${v.cryptoNetwork}. Sending another coin or using another network will lose the money. After paying, upload a screenshot and enter the transaction hash.`;
    }
  } else {
    if (!v.instructions) return { ok: false, message: "Write the instructions for this method." };
  }
  return { ok: true, value: v };
}
