import { requireAdminPage } from "@/lib/admin-page";
import { listCurrencySettings } from "@/lib/services/currencies";
import { currencyName } from "@/lib/money";
import CurrencyToggle from "./CurrencyToggle";

export default async function AdminCurrenciesPage() {
  await requireAdminPage();
  const settings = await listCurrencySettings();
  const on = settings.filter((s) => s.enabled).length;

  return (
    <div className="space-y-5">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Currencies</h1>
      <p className="font-sans text-[13px] text-bk-muted">
        Choose which currencies organizers can use for entry fees and prize pools ({on} on).
        Tournaments that already use a currency keep it if you switch it off. Prize-pool tier
        floors are always checked in USD, so USD stays on.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        {settings.map((s) => (
          <CurrencyToggle key={s.code} code={s.code} name={currencyName(s.code)} enabled={s.enabled} />
        ))}
      </div>
    </div>
  );
}
