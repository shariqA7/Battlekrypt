// Turns an invoice-service failure ({ error, message? }) into a JSON response.
import { NextResponse } from "next/server";
import { INVOICE_ERRORS, type InvoiceErrorCode } from "@/lib/services/invoices";

export function invoiceError(result: { error: InvoiceErrorCode; message?: string }) {
  const def = INVOICE_ERRORS[result.error];
  return NextResponse.json({ error: { code: result.error, message: result.message ?? def.message } }, { status: def.status });
}

// Same idea for the payment-method service (different error codes).
export function methodError(result: { error: "validation_error" | "not_found"; message: string }) {
  return NextResponse.json({ error: { code: result.error, message: result.message } }, { status: result.error === "not_found" ? 404 : 400 });
}
