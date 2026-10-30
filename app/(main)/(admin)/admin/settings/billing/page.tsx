import { requireAdminPage } from "@/lib/admin-page";
import { getInvoiceSettings, listPaymentMethods } from "@/lib/services/payment-methods";
import BillingSettings from "./BillingSettings";
import PaymentMethodsManager, { type MethodData } from "./PaymentMethodsManager";

export default async function SettingsBillingPage() {
  await requireAdminPage("payments");
  const [settings, methods] = await Promise.all([getInvoiceSettings(), listPaymentMethods()]);
  const data: MethodData[] = methods.map((m) => ({
    id: m.id,
    type: m.type,
    name: m.name,
    currencies: m.currencies,
    bankName: m.bankName,
    accountTitle: m.accountTitle,
    accountNumber: m.accountNumber,
    iban: m.iban,
    branch: m.branch,
    swiftCode: m.swiftCode,
    walletNumber: m.walletNumber,
    cryptoAsset: m.cryptoAsset,
    cryptoNetwork: m.cryptoNetwork,
    cryptoAddress: m.cryptoAddress,
    cryptoMemo: m.cryptoMemo,
    instructions: m.instructions,
    isActive: m.isActive,
  }));
  return (
    <div className="space-y-8">
      <BillingSettings initial={settings} />
      <PaymentMethodsManager methods={data} />
    </div>
  );
}
