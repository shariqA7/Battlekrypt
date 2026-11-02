import { requireAdminPage } from "@/lib/admin-page";
import { getInvoiceSettings, listPaymentMethods } from "@/lib/services/payment-methods";
import BillingSettings from "./BillingSettings";
import { getGatewayInfo } from "@/lib/services/nowpayments";
import { getChannelsView } from "@/lib/services/payment-channels";
import PaymentChannels from "./PaymentChannels";
import PaymentMethodsManager, { type MethodData } from "./PaymentMethodsManager";

export default async function SettingsBillingPage() {
  await requireAdminPage("payments");
  const [settings, methods, gateway, channels] = await Promise.all([getInvoiceSettings(), listPaymentMethods(), getGatewayInfo(), getChannelsView()]);
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
      <PaymentChannels channels={channels} webhookUrl={gateway.webhookUrl} />
      <BillingSettings initial={settings} />
      <PaymentMethodsManager methods={data} />
    </div>
  );
}
