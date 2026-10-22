// Pure rules for payout methods (no database), so they can be tested directly.
export const PAYOUT_METHODS = ["JazzCash", "Easypaisa", "Bank transfer", "PayPal", "Other"] as const;

export interface PayoutInput {
  method: string;
  payeeName: string;
  details: string;
}

const clean = (v: unknown, max: number) =>
  (typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

export function validatePayoutInput(
  body: unknown
): { data: PayoutInput } | { error: string; message: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const method = clean(b.method, 40);
  const payeeName = clean(b.payeeName, 100).replace(/\s+/g, " ");
  const details = clean(b.details, 400);

  if (!(PAYOUT_METHODS as readonly string[]).includes(method)) {
    return { error: "invalid_method", message: "Choose how you want to be paid." };
  }
  if (payeeName.length < 3 || !/\p{L}/u.test(payeeName)) {
    return { error: "invalid_name", message: "Enter the full name on the account." };
  }
  if (details.length < 5) {
    return { error: "invalid_details", message: "Enter the account number, IBAN or wallet number (at least 5 characters)." };
  }
  return { data: { method, payeeName, details } };
}

// What the person who owes the prize sees. For a minor it names the guardian, so it's
// clear the money goes to them and not to the child.
export function formatPayoutText(p: {
  payee: "self" | "guardian";
  payeeName: string;
  method: string;
  details: string;
  childName?: string;
}): string {
  const head =
    p.payee === "guardian"
      ? `Pay the PARENT/GUARDIAN${p.childName ? ` of ${p.childName}` : ""}, not the player. Account holder: ${p.payeeName}`
      : `Account holder: ${p.payeeName}`;
  return `${head}\nMethod: ${p.method}\nDetails: ${p.details}`;
}

// A guardian method belongs to a child. Once the player is an adult it no longer counts:
// they have to add their own, so the money never keeps going to a parent by accident.
export function payoutStillValid(payee: "self" | "guardian", isMinor: boolean): boolean {
  return isMinor ? payee === "guardian" : payee === "self";
}
