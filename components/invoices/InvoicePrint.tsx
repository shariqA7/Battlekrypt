import { formatMoney } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/invoice-math";
import type { InvoicePrintData } from "@/lib/services/invoice-print";

const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const n = (v: { toString(): string }) => Number(v.toString());

// A paper-style invoice: always black on white, whatever the site theme, and the only thing that
// prints (see the @media print rules). A paid invoice is also the receipt.
export default function InvoicePrint({ data }: { data: InvoicePrintData }) {
  const { invoice: i, status, settings, methods } = data;
  const m = (v: { toString(): string }) => formatMoney(n(v), i.currency);
  const paid = i.status === "paid";
  const stamp = status === "paid" ? "PAID" : status === "waived" ? "WAIVED" : status === "cancelled" ? "CANCELLED" : status === "overdue" ? "OVERDUE" : null;
  const issuerLines = settings.invoiceIssuerDetails.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #invoice-print { position: absolute; left: 0; top: 0; width: 100%; margin: 0 !important; border: 0 !important; box-shadow: none !important; }
        }
      `}</style>
      <div id="invoice-print" style={{ background: "#fff", color: "#1c1a14", fontFamily: "Arial, Helvetica, sans-serif", maxWidth: 780, margin: "0 auto", padding: 40, border: "1px solid #ddd", fontSize: 14, lineHeight: 1.45 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{settings.invoiceIssuerName}</div>
            {issuerLines.map((l, k) => <div key={k} style={{ color: "#555", fontSize: 13 }}>{l}</div>)}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>{paid ? "RECEIPT" : "INVOICE"}</div>
            <div style={{ fontFamily: "monospace", fontSize: 15 }}>{i.number}</div>
            {stamp && (
              <div style={{ display: "inline-block", marginTop: 6, border: "2px solid #1c1a14", padding: "2px 10px", fontWeight: 700, letterSpacing: 1, fontSize: 13 }}>{stamp}</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 24 }}>
          <div>
            <div style={{ color: "#777", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Billed to</div>
            <div style={{ fontWeight: 700 }}>{i.organizer.orgName}</div>
            <div style={{ color: "#555", fontSize: 13 }}>{i.organizer.user.displayName}</div>
            <div style={{ color: "#555", fontSize: 13 }}>{i.organizer.user.email}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            <div><span style={{ color: "#777" }}>Issued: </span>{d(i.issuedAt)}</div>
            <div><span style={{ color: "#777" }}>Due: </span>{i.dueDate ? d(i.dueDate) : "On receipt"}</div>
            {paid && i.paidAt && <div><span style={{ color: "#777" }}>Paid: </span>{d(i.paidAt)}</div>}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #1c1a14", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
              <th style={{ padding: "6px 0" }}>Description</th>
              <th style={{ padding: "6px 0", textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {i.lines.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #e5e2d8" }}>
                <td style={{ padding: "8px 0" }}>
                  {l.description}
                  {l.refundable && <div style={{ color: "#777", fontSize: 12 }}>Refundable: held for you and returned later.</div>}
                </td>
                <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace" }}>
                  {l.waived ? (<><span style={{ textDecoration: "line-through", color: "#777", marginRight: 8 }}>{m(l.unitAmount)}</span>Waived</>) : m(l.amount)}
                </td>
              </tr>
            ))}
            {n(i.taxAmount) > 0 && (
              <tr style={{ borderBottom: "1px solid #e5e2d8" }}>
                <td style={{ padding: "8px 0", color: "#555" }}>{i.taxLabel} ({i.taxRate.toString()}% of the plan fee after any discount)</td>
                <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace" }}>{m(i.taxAmount)}</td>
              </tr>
            )}
            {n(i.gatewayFee) > 0 && (
              <tr style={{ borderBottom: "1px solid #e5e2d8" }}>
                <td style={{ padding: "8px 0", color: "#555" }}>Payment processing fee</td>
                <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace" }}>{m(i.gatewayFee)}</td>
              </tr>
            )}
            <tr>
              <td style={{ padding: "12px 0", fontWeight: 700, fontSize: 16 }}>Total{paid ? " paid" : " due"}</td>
              <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 700, fontSize: 16, fontFamily: "monospace" }}>{m(i.total)}</td>
            </tr>
          </tbody>
        </table>

        {i.note && <p style={{ color: "#555", fontSize: 13 }}>{i.note}</p>}

        {paid && (
          <div style={{ marginTop: 18, padding: 12, border: "1px solid #ddd", fontSize: 13 }}>
            <strong>Payment received</strong>
            {i.paidAt ? ` on ${d(i.paidAt)}` : ""}
            {i.paidMethodName ? ` via ${i.paidMethodName}` : ""}
            {i.paidReference ? ` · reference ${i.paidReference}` : ""}.
          </div>
        )}
        {i.status === "waived" && i.waivedNote && (
          <div style={{ marginTop: 18, padding: 12, border: "1px solid #ddd", fontSize: 13 }}><strong>Waived:</strong> {i.waivedNote}</div>
        )}

        {(i.status === "unpaid" || i.status === "proof_submitted") && methods.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>How to pay</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
              Send exactly {m(i.total)} using one of these, then upload a screenshot on the invoice page. Pay only to the details shown here.
            </div>
            {methods.map((p) => (
              <div key={p.id} style={{ border: "1px solid #ddd", padding: 10, marginBottom: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                {p.type === "bank" && (
                  <div style={{ fontFamily: "monospace" }}>
                    {[p.bankName, p.accountTitle, p.accountNumber && `Account ${p.accountNumber}`, p.iban && `IBAN ${p.iban}`, p.branch && `Branch ${p.branch}`, p.swiftCode && `SWIFT ${p.swiftCode}`].filter(Boolean).join(" · ")}
                  </div>
                )}
                {p.type === "wallet" && <div style={{ fontFamily: "monospace" }}>{[p.accountTitle, p.walletNumber].filter(Boolean).join(" · ")}</div>}
                {p.type === "crypto" && (
                  <div style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                    {[p.cryptoAsset, p.cryptoNetwork, p.cryptoAddress, p.cryptoMemo && `Memo ${p.cryptoMemo}`].filter(Boolean).join(" · ")}
                  </div>
                )}
                {p.instructions && <div style={{ color: "#555", whiteSpace: "pre-wrap" }}>{p.instructions}</div>}
              </div>
            ))}
          </div>
        )}

        {settings.invoiceFooterNote && <p style={{ marginTop: 26, color: "#555", fontSize: 13, textAlign: "center" }}>{settings.invoiceFooterNote}</p>}
        <p style={{ marginTop: settings.invoiceFooterNote ? 4 : 26, color: "#999", fontSize: 11, textAlign: "center" }}>
          {STATUS_LABEL[status]} · generated {d(new Date())}
        </p>
      </div>
    </>
  );
}
