"use client";

// Shared by first-time registration ("create") and correcting a rejected
// application ("resubmit"). Registration also creates the login account when
// the visitor isn't signed in yet — the same email and password are used to
// sign in afterwards.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { describeLimits, PAID_PERKS } from "@/lib/plan-copy";
import { formatMoney } from "@/lib/money";
import {
  ORG_TYPES,
  validateOrgApplication,
  type FieldErrors,
  type OrgApplicationInput,
} from "@/lib/validation/org-application";

export type FormValues = Omit<OrgApplicationInput, "registrationNumber" | "website"> & {
  registrationNumber: string;
  website: string;
};

export const EMPTY_VALUES: FormValues = {
  orgName: "",
  orgType: "",
  description: "",
  registrationNumber: "",
  website: "",
  country: "",
  city: "",
  address: "",
  contactEmail: "",
  contactPhone: "",
  handlerName: "",
  handlerRole: "",
  handlerPhone: "",
  plan: "organizer_free",
};

const inputCls =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const labelCls =
  "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5";

function Field({
  label,
  error,
  feedback,
  children,
}: {
  label: string;
  error?: string;
  feedback?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className={labelCls}>{label}</label>
      {children}
      {feedback && (
        <p className="mt-1.5 font-sans text-[12px] text-[#EF9F27] bg-[rgba(239,159,39,0.12)] px-2.5 py-1.5">
          Admin: {feedback}
        </p>
      )}
      {error && (
        <p className="mt-1 font-sans text-[12px] text-bk-live">
          {error}
          {error.includes("already taken") && (
            <>
              {" "}If it&apos;s your brand,{" "}
              <a href="/club/claim-name" className="underline">report it</a>.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <p className="font-sans font-bold text-[13px] text-bk-heading mt-7 mb-3 pb-2 border-b border-bk-border">
      {title}
    </p>
  );
}

export interface PlanOption {
  code: string;
  name: string;
  isPaid: boolean;
  priceAmount: number | null;
  priceCurrency: string | null;
  durationDays: number;
  limits: Record<string, number | boolean | null>;
}

interface Props {
  // On-sale organizer plans, loaded from the Plan table by the page.
  plans: PlanOption[];
  mode: "create" | "resubmit";
  loggedIn: boolean;
  initialValues?: FormValues;
  // Admin's per-field comments from the last rejection.
  fieldFeedback?: Record<string, string>;
  // ISO time before which resubmitting is blocked (resubmit mode).
  retryAt?: string | null;
}

export default function OrgApplicationForm({
  mode,
  loggedIn,
  initialValues,
  fieldFeedback = {},
  retryAt,
  plans,
}: Props) {
  const router = useRouter();
  const [v, setV] = useState<FormValues>(initialValues ?? EMPTY_VALUES);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Blocked until the cooldown from the last rejection ends (the server
  // enforces this too; this just disables the button and explains why).
  const [blocked, setBlocked] = useState(
    () => mode === "resubmit" && !!retryAt && new Date(retryAt).getTime() > Date.now()
  );
  useEffect(() => {
    if (!blocked || !retryAt) return;
    const ms = new Date(retryAt).getTime() - Date.now();
    const t = setTimeout(() => setBlocked(false), Math.min(Math.max(ms, 0), 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [blocked, retryAt]);

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    setMessage(null);

    const parsed = validateOrgApplication(v);
    const localErrors: Record<string, string> = "errors" in parsed ? { ...(parsed.errors as FieldErrors) } : {};
    if (mode === "create" && !loggedIn) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) localErrors.email = "Enter a valid email.";
      if (password.length < 8) localErrors.password = "Use at least 8 characters.";
    }
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      if (mode === "resubmit") {
        const res = await fetch("/api/organizations/application", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(v),
        });
        if (!res.ok) {
          const { error } = await res.json();
          if (error.fields) setErrors(error.fields);
          setMessage({
            text:
              error.code === "too_soon"
                ? `You can resubmit after ${new Date(error.retryAt).toLocaleString()}.`
                : error.message,
            error: true,
          });
          return;
        }
        router.push("/organizer/application");
        router.refresh();
        return;
      }

      if (loggedIn) {
        const res = await fetch("/api/organizations/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(v),
        });
        if (!res.ok) {
          const { error } = await res.json();
          if (error.fields) setErrors(error.fields);
          setMessage({ text: error.message, error: true });
          return;
        }
        router.push("/organizer/application");
        router.refresh();
        return;
      }

      // Not signed in: check the name first so nobody creates an account
      // for an application that can't be accepted, then sign up.
      const avail = await fetch(`/api/organizations/name-available?name=${encodeURIComponent(v.orgName)}`);
      if (!(await avail.json()).available) {
        setErrors({ orgName: "That organization name is already taken." });
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent("/organizer/application")}`,
          // The application rides along in the account until the email is
          // confirmed, then gets created on first sign-in.
          data: { full_name: v.handlerName, org_application: v },
        },
      });
      if (error) {
        setMessage({ text: error.message, error: true });
        return;
      }
      if (data.user && data.user.identities?.length === 0) {
        setMessage({
          text: "An account with this email already exists. Sign in, then register your organization from the account menu.",
          error: true,
        });
        return;
      }
      if (data.session) {
        await fetch("/api/auth/ensure-user", { method: "POST" });
        router.push("/organizer/application");
        router.refresh();
        return;
      }
      setMessage({
        text: `We sent a confirmation link to ${email}. Click it and your application will be submitted for review.`,
        error: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const fb = (k: string) => fieldFeedback[k];

  return (
    <form onSubmit={handleSubmit} className="bg-bk-surface border border-bk-border p-6">
      {mode === "create" && !loggedIn && (
        <>
          <Section title="Login details" />
          <p className="font-sans text-[12px] text-bk-muted mb-3">
            You&apos;ll use this email and password to sign in once your organization is approved.
          </p>
          <Field label="Email" error={errors.email}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@organization.com" />
          </Field>
          <Field label="Password" error={errors.password}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" />
          </Field>
        </>
      )}

      <Section title="Organization" />
      <Field label="Organization name" error={errors.orgName} feedback={fb("orgName")}>
        <input value={v.orgName} onChange={set("orgName")} className={inputCls} placeholder="Falcon Esports" />
      </Field>
      <Field label="Type" error={errors.orgType} feedback={fb("orgType")}>
        <select value={v.orgType} onChange={set("orgType")} className={inputCls}>
          <option value="">Select…</option>
          {ORG_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="About the organization" error={errors.description} feedback={fb("description")}>
        <textarea value={v.description} onChange={set("description")} rows={4} className={`${inputCls} h-auto py-2`} placeholder="What you do, what events you run, how long you've been active" />
      </Field>
      <Field label="Registration / tax number (optional)" error={errors.registrationNumber} feedback={fb("registrationNumber")}>
        <input value={v.registrationNumber} onChange={set("registrationNumber")} className={inputCls} />
      </Field>
      <Field label="Website (optional)" error={errors.website} feedback={fb("website")}>
        <input value={v.website} onChange={set("website")} className={inputCls} placeholder="https://" />
      </Field>

      <Section title="Location & contact" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Country" error={errors.country} feedback={fb("country")}>
          <input value={v.country} onChange={set("country")} className={inputCls} />
        </Field>
        <Field label="City" error={errors.city} feedback={fb("city")}>
          <input value={v.city} onChange={set("city")} className={inputCls} />
        </Field>
      </div>
      <Field label="Address" error={errors.address} feedback={fb("address")}>
        <input value={v.address} onChange={set("address")} className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Organization email" error={errors.contactEmail} feedback={fb("contactEmail")}>
          <input type="email" value={v.contactEmail} onChange={set("contactEmail")} className={inputCls} />
        </Field>
        <Field label="Organization phone" error={errors.contactPhone} feedback={fb("contactPhone")}>
          <input value={v.contactPhone} onChange={set("contactPhone")} className={inputCls} placeholder="+92 300 1234567" />
        </Field>
      </div>

      <Section title="Person handling this account" />
      <Field label="Full name" error={errors.handlerName} feedback={fb("handlerName")}>
        <input value={v.handlerName} onChange={set("handlerName")} className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Role in the organization" error={errors.handlerRole} feedback={fb("handlerRole")}>
          <input value={v.handlerRole} onChange={set("handlerRole")} className={inputCls} placeholder="Founder, Manager…" />
        </Field>
        <Field label="Phone" error={errors.handlerPhone} feedback={fb("handlerPhone")}>
          <input value={v.handlerPhone} onChange={set("handlerPhone")} className={inputCls} />
        </Field>
      </div>

      <Section title="Plan" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        {plans.map((plan) => {
          const selected = v.plan === plan.code;
          const perks = [
            ...describeLimits("organizer", plan.limits),
            ...(plan.isPaid ? PAID_PERKS : []),
          ];
          return (
            <button
              type="button"
              key={plan.code}
              onClick={() => setV((prev) => ({ ...prev, plan: plan.code }))}
              className={`text-left p-3 border ${selected ? "border-bk-gold-light bg-bk-bg" : "border-bk-border"}`}
            >
              <span className="block font-sans font-bold text-[13px] text-bk-heading">{plan.name}</span>
              <span className="block font-mono text-[12px] text-bk-gold-light mt-0.5">
                {plan.isPaid && plan.priceAmount !== null && plan.priceCurrency
                  ? `${formatMoney(plan.priceAmount, plan.priceCurrency)} / ${plan.durationDays} days`
                  : "Free"}
              </span>
              <ul className="font-sans text-[11px] text-bk-muted mt-1.5 list-disc pl-4 space-y-0.5">
                {perks.slice(0, 4).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      {errors.plan && <p className="font-sans text-[12px] text-bk-live">{errors.plan}</p>}
      <p className="font-sans text-[11px] text-bk-muted mt-2">
        Your choice is saved with your application. Every organization starts on the free plan once approved; paid plans are bought afterwards from My plans.
      </p>

      {blocked && (
        <p className="mt-5 font-sans text-[12px] text-[#EF9F27] bg-[rgba(239,159,39,0.12)] px-3 py-2">
          You can resubmit after {new Date(retryAt as string).toLocaleString()}.
        </p>
      )}
      {message && (
        <p className={`mt-5 font-sans text-[12px] ${message.error ? "text-bk-live" : "text-bk-gold-light"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || blocked}
        className="mt-6 w-full bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : mode === "resubmit" ? "Resubmit for review" : "Submit for review"}
      </button>
    </form>
  );
}
