import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getApplicationForUser } from "@/lib/services/org-applications";
import OrgApplicationForm, { type FormValues } from "@/components/organizer/OrgApplicationForm";

import { listPlans } from "@/lib/services/plan-requests";
const FIELD_LABELS: Record<string, string> = {
  orgName: "Organization name",
  orgType: "Type",
  description: "About the organization",
  registrationNumber: "Registration / tax number",
  website: "Website",
  country: "Country",
  city: "City",
  address: "Address",
  contactEmail: "Organization email",
  contactPhone: "Organization phone",
  handlerName: "Handler name",
  handlerRole: "Handler role",
  handlerPhone: "Handler phone",
  plan: "Plan",
};

export default async function OrganizationApplicationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/application");

  const app = await getApplicationForUser(user.id);
  if (!app) redirect("/organizer/register");
  if (app.status === "approved") redirect("/organizer/dashboard");

  if (app.status === "pending") {
    return (
      <main className="flex-1 px-6 py-16 max-w-xl mx-auto w-full">
        <div className="bg-bk-surface border border-bk-border p-6">
          <span className="inline-block bg-bk-amber/[0.12] text-bk-amber font-sans text-[11px] uppercase tracking-[0.8px] px-2.5 py-1 mb-4">
            Under review
          </span>
          <h1 className="font-sans font-extrabold text-xl text-bk-heading mb-2">
            {app.orgName}
          </h1>
          <p className="font-sans text-bk-body text-[13px] leading-relaxed">
            Your request is under review. Organizer features stay locked until an
            admin approves it. Once approved, sign in with the same email and
            password and your dashboard will open.
          </p>
          <p className="font-sans text-bk-muted text-[12px] mt-4">
            Submitted {app.submittedAt.toLocaleString()} · Plan: {app.plan}
            {app.attemptCount > 1 ? ` · Attempt ${app.attemptCount}` : ""}
          </p>
        </div>
      </main>
    );
  }

  // Rejected: show what to fix, then the editable form.
  const feedback = (app.fieldFeedback ?? {}) as Record<string, string>;
  const values: FormValues = {
    orgName: app.orgName,
    orgType: app.orgType,
    description: app.description,
    registrationNumber: app.registrationNumber ?? "",
    website: app.website ?? "",
    country: app.country,
    city: app.city,
    address: app.address,
    contactEmail: app.contactEmail,
    contactPhone: app.contactPhone,
    handlerName: app.handlerName,
    handlerRole: app.handlerRole,
    handlerPhone: app.handlerPhone,
    plan: app.plan,
  };

  return (
    <main className="flex-1 px-6 py-12 max-w-xl mx-auto w-full">
      <div className="bg-bk-surface border border-bk-live/40 p-6 mb-6">
        <span className="inline-block bg-bk-live-bg text-bk-live font-sans text-[11px] uppercase tracking-[0.8px] px-2.5 py-1 mb-4">
          Not approved
        </span>
        <h1 className="font-sans font-extrabold text-xl text-bk-heading mb-2">
          Your request needs changes
        </h1>
        {app.rejectionNote && (
          <p className="font-sans text-bk-body text-[13px] leading-relaxed mb-3">
            {app.rejectionNote}
          </p>
        )}
        {Object.keys(feedback).length > 0 && (
          <ul className="font-sans text-[13px] text-bk-body list-disc pl-5 space-y-1 mb-3">
            {Object.entries(feedback).map(([field, text]) => (
              <li key={field}>
                <span className="text-bk-heading font-medium">{FIELD_LABELS[field] ?? field}:</span> {text}
              </li>
            ))}
          </ul>
        )}
        <p className="font-sans text-bk-muted text-[12px]">
          Fix the points below and resubmit. Rejection {app.rejectionCount} of your
          application — the wait before resubmitting is 2 hours after the first,
          24 hours after the second, and 7 days after any later one.
        </p>
      </div>

      <OrgApplicationForm
        mode="resubmit"
        loggedIn
        initialValues={values}
        fieldFeedback={feedback}
        retryAt={app.nextResubmitAt?.toISOString() ?? null}
        plans={await listPlans({ audience: "organizer", activeOnly: true })}
      />
    </main>
  );
}
