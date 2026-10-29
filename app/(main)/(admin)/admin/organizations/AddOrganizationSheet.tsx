"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SideSheet from "@/components/admin/SideSheet";
import SearchPicker from "@/components/admin/SearchPicker";
import DurationPicker, { DEFAULT_DURATION, toPlanDuration, type DurationChoice } from "@/components/admin/DurationPicker";
import FileUpload from "@/components/ui/FileUpload";
import Avatar from "@/components/ui/Avatar";
import { buttonClass } from "@/components/ui/Button";
import { DOC_LABEL, ID_BUCKET, type DocType } from "@/lib/identity";
import type { UserHit, INSTITUTE_KINDS } from "@/lib/services/admin-organizations";
import type { getUserForOrganizer } from "@/lib/services/admin-organizations";

export type PlanCardData = { code: string; name: string; isPaid: boolean; price: string | null; days: number; deposit: string | null; perks: string[] };
export type StarterRules = { maxEntryFeeUsd: number; maxPrizeUsd: number; maxPaidEntrants: number; graduationEvents: number };
type UserDetail = NonNullable<Awaited<ReturnType<typeof getUserForOrganizer>>>;
type Kind = (typeof INSTITUTE_KINDS)[number];

const KIND_LABEL: Record<Kind, string> = { school: "School", college: "College", university: "University", academy: "Academy", other: "Other" };
const STEPS = ["Details", "Identity (KYC)", "Plan & limits"];

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[40px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1 mt-4";

function Field({ name, children, hint }: { name: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className={label}>{name}</label>
      {children}
      {hint && <p className="font-sans text-[11px] text-bk-muted mt-1">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, name }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-flow-col auto-cols-fr gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[40px] px-3 font-sans text-[13px] border transition-colors ${value === o.value ? "border-bk-gold-light text-bk-gold-light font-bold bg-bk-surface-hover" : "border-bk-border text-bk-body hover:border-bk-border-nav"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function UploadSlot({ name, done, children }: { name: string; done: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-sans text-[12px] text-bk-heading mb-1.5 flex items-center gap-2">
        {name}
        {done && <span className="text-bk-teal text-[11px] font-bold">✓ uploaded</span>}
      </p>
      {children}
    </div>
  );
}

const blankOrg = { name: "", country: "", city: "", address: "", orgType: "", registrationNumber: "", website: "", contactEmail: "", contactPhone: "", bio: "" };
const blankKyc = { docType: "nic" as DocType, fullName: "", documentNumber: "", address: "", front: "", back: "", selfie: "", checked: false };

export default function AddOrganizationSheet({ plans, starter }: { plans: PlanCardData[]; starter: StarterRules }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [type, setType] = useState<"organization" | "institute">("organization");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [user, setUser] = useState<UserDetail | null>(null);
  const [person, setPerson] = useState({ name: "", email: "", phone: "" });
  const [userId, setUserId] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState(false);
  const [org, setOrg] = useState(blankOrg);
  const [kind, setKind] = useState<Kind | "">("");
  const [instVerified, setInstVerified] = useState(false);
  const [proof, setProof] = useState("");
  const [doKyc, setDoKyc] = useState(false);
  const [kyc, setKyc] = useState(blankKyc);
  const [planCode, setPlanCode] = useState(plans.find((p) => !p.isPaid)?.code ?? "");
  const [duration, setDuration] = useState<DurationChoice>(DEFAULT_DURATION);
  const [lift, setLift] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; emailNote: string } | null>(null);

  const isInst = type === "institute";
  const kycRequired = isInst;
  const kycActive = kycRequired || doKyc;
  const plan = plans.find((p) => p.code === planCode);
  const dirty = step > 0 || user !== null || person.name !== "" || person.email !== "" || org.name !== "";

  function reset() {
    setStep(0);
    setType("organization");
    setMode("existing");
    setUser(null);
    setPerson({ name: "", email: "", phone: "" });
    setUserId(null);
    setNewAccount(false);
    setOrg(blankOrg);
    setKind("");
    setInstVerified(false);
    setProof("");
    setDoKyc(false);
    setKyc(blankKyc);
    setPlanCode(plans.find((p) => !p.isPaid)?.code ?? "");
    setDuration(DEFAULT_DURATION);
    setLift(false);
    setError(null);
    setDone(null);
  }

  function close() {
    if (!done && dirty && !confirm("Discard what you have entered?")) return;
    setOpen(false);
    reset();
  }

  // Fill the form from an existing account. Only empty fields are filled, so nothing typed is lost.
  async function pickUser(hit: UserHit) {
    setError(null);
    const res = await fetch(`/api/admin/organizations/user-search/${hit.id}`);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Couldn't load that account.");
    const u = (await res.json()) as UserDetail;
    setUser(u);
    setUserId(u.id);
    setPerson({ name: u.name, email: u.email, phone: u.phone ?? u.profile?.mobileNumber ?? "" });
    const a = u.application;
    setOrg((o) => ({
      ...o,
      name: o.name || a?.orgName || "",
      country: o.country || a?.country || u.profile?.country || "",
      city: o.city || a?.city || u.profile?.city || "",
      address: o.address || a?.address || "",
      orgType: o.orgType || a?.orgType || "",
      registrationNumber: o.registrationNumber || a?.registrationNumber || "",
      website: o.website || a?.website || "",
      contactEmail: o.contactEmail || a?.contactEmail || u.email,
      contactPhone: o.contactPhone || a?.contactPhone || u.phone || u.profile?.mobileNumber || "",
      bio: o.bio || a?.description || "",
    }));
    setKyc((k) => ({ ...k, fullName: k.fullName || [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(" ") || u.name }));
  }

  function clearUser() {
    setUser(null);
    setUserId(null);
    setPerson({ name: "", email: "", phone: "" });
  }

  async function next() {
    setError(null);
    if (step === 0) {
      if (org.name.trim().length < 2) return setError("Enter the organization name (at least 2 characters).");
      if (isInst) {
        if (!kind) return setError("Choose the kind of institute.");
        if (!org.registrationNumber.trim()) return setError("Enter the institute's registration or affiliation number.");
        if (org.address.trim().length < 8) return setError("Enter the institute's address.");
      }
      if (mode === "existing") {
        if (!user) return setError("Search and choose the account first.");
        if (user.organization) return setError("That account already has an organization.");
      } else if (!userId) {
        setBusy(true);
        const res = await fetch("/api/admin/organizations/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(person),
        });
        setBusy(false);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return setError(body.error?.message ?? "Couldn't create the account.");
        setUserId(body.userId);
        setNewAccount(body.created === true);
        setKyc((k) => ({ ...k, fullName: k.fullName || person.name }));
        setOrg((o) => ({ ...o, contactEmail: o.contactEmail || person.email, contactPhone: o.contactPhone || person.phone }));
      }
    }
    if (step === 1 && kycActive) {
      const needsBack = kyc.docType === "nic";
      if (kyc.fullName.trim().length < 3 || kyc.documentNumber.trim().length < 6) return setError("Enter the full name and document number exactly as on the document.");
      if (kyc.address.trim().length < 8) return setError("Enter the person's full home address.");
      if (!kyc.front || !kyc.selfie || (needsBack && !kyc.back)) return setError("Upload every photo, including the selfie.");
      if (isInst && !proof) return setError("Upload the institute's registration or affiliation document.");
      if (!kyc.checked) return setError("Confirm that you checked the documents and that the person is 18 or older.");
    }
    setStep((s) => s + 1);
  }

  async function submit() {
    if (!userId) return;
    if (plan?.isPaid && duration.choice === "permanent" && !confirm("Give this plan with no expiry date?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        type,
        orgName: org.name,
        country: org.country,
        city: org.city,
        address: org.address,
        orgType: org.orgType,
        registrationNumber: org.registrationNumber,
        website: org.website,
        contactEmail: org.contactEmail,
        contactPhone: org.contactPhone,
        bio: org.bio,
        institute: isInst ? { kind, verified: instVerified, proofPath: proof } : undefined,
        kyc: kycActive
          ? { docType: kyc.docType, fullName: kyc.fullName, documentNumber: kyc.documentNumber, address: kyc.address, frontPath: kyc.front, backPath: kyc.docType === "nic" ? kyc.back : null, selfiePath: kyc.selfie, checked: kyc.checked }
          : undefined,
        planCode: plan?.isPaid ? plan.code : undefined,
        duration: plan?.isPaid ? toPlanDuration(duration) : undefined,
        liftLimits: lift,
        sendSetupEmail: newAccount,
      }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error?.message ?? "Something went wrong.");
    setDone({
      id: body.organizerId,
      emailNote: newAccount ? (body.setupEmailSent ? `An email to choose a password was sent to ${person.email}.` : `The email to choose a password could not be sent to ${person.email}. Ask them to use “Forgot password”.`) : "",
    });
    router.refresh();
  }

  const footer = done ? (
    <div className="flex justify-end">
      <button type="button" onClick={() => router.push(`/admin/organizations/${done.id}`)} className={buttonClass("primary", "md")}>
        Open {isInst ? "institute" : "organization"}
      </button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => (step === 0 ? close() : setStep(step - 1))} disabled={busy} className={buttonClass("outline", "md")}>
        {step === 0 ? "Cancel" : "Back"}
      </button>
      {step < 2 ? (
        <button type="button" onClick={next} disabled={busy} className={buttonClass("primary", "md")}>
          {busy ? "Please wait…" : "Next"}
        </button>
      ) : (
        <button type="button" onClick={submit} disabled={busy || !planCode} className={buttonClass("primary", "md")}>
          {busy ? "Adding…" : `Add ${isInst ? "institute" : "organization"}`}
        </button>
      )}
    </div>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "md")}>
        + Add organization
      </button>
      <SideSheet open={open} onClose={close} title={done ? "Added" : `Add ${isInst ? "an institute" : "an organization"}`} subtitle={done ? undefined : `Step ${step + 1} of 3 · ${STEPS[step]}`} footer={footer}>
        {done ? (
          <div className="space-y-2 font-sans text-[13px] text-bk-body">
            <p className="text-bk-teal font-bold text-[15px]">{org.name} was added.</p>
            {done.emailNote && <p>{done.emailNote}</p>}
            <p>Open it to see the details, the identity check and the plan.</p>
          </div>
        ) : (
          <div>
            <ol className="flex gap-1.5 mb-2" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} className={`flex-1 h-1 ${i <= step ? "bg-bk-gold-light" : "bg-bk-border"}`} aria-current={i === step ? "step" : undefined} title={s} />
              ))}
            </ol>

            {step === 0 && (
              <div>
                <Field name="Type">
                  <Segmented name="Type" value={type} onChange={setType} options={[{ value: "organization", label: "Organization" }, { value: "institute", label: "Institute (stricter checks)" }]} />
                </Field>

                <Field name="Organizer's account">
                  <Segmented
                    name="Account"
                    value={mode}
                    onChange={(m) => {
                      if (userId && newAccount) return;
                      setMode(m);
                      clearUser();
                    }}
                    options={[{ value: "existing", label: "Has an account" }, { value: "new", label: "No account yet" }]}
                  />
                </Field>

                {mode === "existing" ? (
                  <div className="mt-3">
                    {user ? (
                      <div className="border border-bk-border bg-bk-surface p-3">
                        <div className="flex items-start gap-3">
                          <Avatar src={user.avatarUrl} name={user.name} size={44} />
                          <div className="min-w-0 flex-1">
                            <p className="font-sans font-bold text-[14px] text-bk-heading truncate">{user.name}</p>
                            <p className="font-sans text-[12px] text-bk-muted truncate">{user.email}</p>
                          </div>
                          <button type="button" onClick={clearUser} className="font-sans text-[11px] uppercase text-bk-gold-light underline">
                            Change
                          </button>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 font-sans text-[12px]">
                          {[
                            ["Phone", user.phone ?? user.profile?.mobileNumber],
                            ["Username", user.profile?.username],
                            ["Country", user.profile?.country],
                            ["City", user.profile?.city],
                            ["Age", user.profile?.age],
                            ["Gender", user.profile?.gender],
                            ["Account since", new Date(user.joinedAt).toLocaleDateString("en-GB")],
                            ["Approval", user.kycStatus],
                          ].map(([k, v]) => (
                            <div key={String(k)} className="min-w-0">
                              <dt className="text-bk-muted">{k}</dt>
                              <dd className="text-bk-heading truncate">{v === null || v === undefined || v === "" ? "—" : String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                        {user.application && <p className="font-sans text-[11px] text-bk-gold-light mt-2">Their application ({user.application.status}) filled in the details below.</p>}
                        {user.activeBan && <p className="font-sans text-[12px] text-bk-live mt-2">This account is banned: {user.activeBan.reason}</p>}
                        {user.organization && <p className="font-sans text-[12px] text-bk-live mt-2">Already has the organization “{user.organization.orgName}”.</p>}
                      </div>
                    ) : (
                      <SearchPicker<UserHit>
                        endpoint="/api/admin/organizations/user-search"
                        label="Find an account"
                        placeholder="Search by name, email or phone"
                        onPick={pickUser}
                        isDisabled={(u) => Boolean(u.organization)}
                        emptyText="No account matches. Choose “No account yet” to add the person."
                        renderItem={(u) => (
                          <span className="flex items-center gap-2.5">
                            <Avatar src={u.avatarUrl} name={u.name} size={32} />
                            <span className="min-w-0">
                              <span className="block font-sans text-[13px] text-bk-heading truncate">{u.name}</span>
                              <span className="block font-sans text-[11px] text-bk-muted truncate">
                                {u.email}
                                {u.organization && <span className="text-bk-live"> · already has “{u.organization}”</span>}
                              </span>
                            </span>
                          </span>
                        )}
                      />
                    )}
                  </div>
                ) : (
                  <div>
                    <Field name="Full name">
                      <input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} disabled={Boolean(userId)} maxLength={80} className={input} />
                    </Field>
                    <Field name="Email">
                      <input type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} disabled={Boolean(userId)} className={input} />
                    </Field>
                    <Field name="Phone (optional)">
                      <input value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} disabled={Boolean(userId)} className={input} />
                    </Field>
                    <p className="font-sans text-[11px] text-bk-muted mt-2">
                      {userId ? "The account is ready." : "Pressing Next creates their account (if the email isn’t registered yet). They get an email to choose a password once you add the organization."}
                    </p>
                  </div>
                )}

                <p className="font-sans font-bold text-[13px] text-bk-heading mt-6 pt-4 border-t border-bk-border">{isInst ? "Institute details" : "Organization details"}</p>
                <Field name={isInst ? "Institute name" : "Organization name"}>
                  <input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} maxLength={60} className={input} />
                </Field>
                {isInst ? (
                  <Field name="Kind of institute">
                    <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={input}>
                      <option value="">Choose…</option>
                      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field name="Kind of organization (optional)">
                    <input value={org.orgType} onChange={(e) => setOrg({ ...org, orgType: e.target.value })} placeholder="e.g. Esports company, Community" className={input} />
                  </Field>
                )}
                <Field name={isInst ? "Registration / affiliation number" : "Registration number (optional)"}>
                  <input value={org.registrationNumber} onChange={(e) => setOrg({ ...org, registrationNumber: e.target.value })} className={input} />
                </Field>
                <div className="grid sm:grid-cols-2 gap-x-3">
                  <Field name="Country (optional)">
                    <input value={org.country} onChange={(e) => setOrg({ ...org, country: e.target.value })} placeholder="e.g. Pakistan" className={input} />
                  </Field>
                  <Field name="City (optional)">
                    <input value={org.city} onChange={(e) => setOrg({ ...org, city: e.target.value })} className={input} />
                  </Field>
                </div>
                <Field name={isInst ? "Address" : "Address (optional)"}>
                  <input value={org.address} onChange={(e) => setOrg({ ...org, address: e.target.value })} className={input} />
                </Field>
                <div className="grid sm:grid-cols-2 gap-x-3">
                  <Field name="Contact email (optional)">
                    <input type="email" value={org.contactEmail} onChange={(e) => setOrg({ ...org, contactEmail: e.target.value })} className={input} />
                  </Field>
                  <Field name="Contact phone (optional)">
                    <input value={org.contactPhone} onChange={(e) => setOrg({ ...org, contactPhone: e.target.value })} className={input} />
                  </Field>
                </div>
                <Field name="Website (optional)">
                  <input value={org.website} onChange={(e) => setOrg({ ...org, website: e.target.value })} placeholder="https://" className={input} />
                </Field>
                <Field name="About (optional)">
                  <textarea value={org.bio} onChange={(e) => setOrg({ ...org, bio: e.target.value })} rows={3} maxLength={1000} className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2" />
                </Field>
              </div>
            )}

            {step === 1 && userId && (
              <div>
                {kycRequired ? (
                  <p className="font-sans text-[12px] text-bk-body mt-3">An institute needs the identity check of the person who runs it, and a photo of its registration or affiliation document. Check the originals before you continue.</p>
                ) : (
                  <label className="flex items-start gap-2 font-sans text-[13px] text-bk-body mt-3 cursor-pointer">
                    <input type="checkbox" checked={doKyc} onChange={(e) => setDoKyc(e.target.checked)} className="mt-0.5" />
                    <span>
                      Do the identity check now
                      <span className="block text-[12px] text-bk-muted">Optional. If you skip it, the organizer can verify themselves later from their dashboard, and the starter limits stay until they do.</span>
                    </span>
                  </label>
                )}

                {kycActive && (
                  <div>
                    <Field name="Document">
                      <Segmented name="Document" value={kyc.docType} onChange={(d) => setKyc({ ...kyc, docType: d })} options={[{ value: "nic", label: DOC_LABEL.nic }, { value: "passport", label: DOC_LABEL.passport }]} />
                    </Field>
                    <Field name="Full name (as on the document)">
                      <input value={kyc.fullName} onChange={(e) => setKyc({ ...kyc, fullName: e.target.value })} maxLength={120} className={input} />
                    </Field>
                    <Field name={kyc.docType === "nic" ? "NIC number" : "Passport number"}>
                      <input value={kyc.documentNumber} onChange={(e) => setKyc({ ...kyc, documentNumber: e.target.value })} maxLength={30} autoComplete="off" className={`${input} font-mono`} />
                    </Field>
                    <Field name="Home address">
                      <textarea value={kyc.address} onChange={(e) => setKyc({ ...kyc, address: e.target.value })} rows={2} maxLength={250} placeholder="Street, area, city" className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2" />
                    </Field>
                    <p className={label}>Photos</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <UploadSlot name={kyc.docType === "nic" ? "Front of the card" : "Photo page"} done={Boolean(kyc.front)}>
                        <FileUpload bucket={ID_BUCKET} pathPrefix={userId} isPrivate onUploaded={(p) => setKyc((k) => ({ ...k, front: p }))} label="Choose a photo" />
                      </UploadSlot>
                      {kyc.docType === "nic" && (
                        <UploadSlot name="Back of the card" done={Boolean(kyc.back)}>
                          <FileUpload bucket={ID_BUCKET} pathPrefix={userId} isPrivate onUploaded={(p) => setKyc((k) => ({ ...k, back: p }))} label="Choose a photo" />
                        </UploadSlot>
                      )}
                      <UploadSlot name="Selfie holding the document" done={Boolean(kyc.selfie)}>
                        <FileUpload bucket={ID_BUCKET} pathPrefix={userId} isPrivate onUploaded={(p) => setKyc((k) => ({ ...k, selfie: p }))} label="Choose a photo" />
                      </UploadSlot>
                      {isInst && (
                        <UploadSlot name="Registration / affiliation document" done={Boolean(proof)}>
                          <FileUpload bucket={ID_BUCKET} pathPrefix={userId} isPrivate onUploaded={setProof} label="Choose a photo" />
                        </UploadSlot>
                      )}
                    </div>
                    <label className="flex items-start gap-2 font-sans text-[12px] text-bk-body mt-5 cursor-pointer">
                      <input type="checkbox" checked={kyc.checked} onChange={(e) => setKyc({ ...kyc, checked: e.target.checked })} className="mt-0.5" />
                      I checked the documents against the details above, and the person is 18 or older.
                    </label>
                    {isInst && (
                      <label className="flex items-start gap-2 font-sans text-[12px] text-bk-body mt-3 cursor-pointer">
                        <input type="checkbox" checked={instVerified} onChange={(e) => setInstVerified(e.target.checked)} className="mt-0.5" />
                        Mark the institute as verified now. Players can then pick it, and it can host institution-only tournaments.
                      </label>
                    )}
                    <p className="font-sans text-[11px] text-bk-muted mt-3">Photos go to a private store. Every time an admin opens one it is logged, and they are deleted automatically after the retention period.</p>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div>
                <p className="font-sans font-bold text-[13px] text-bk-heading mt-4">Choose a plan</p>
                <p className="font-sans text-[12px] text-bk-muted">Given free of charge: no payment is recorded and no security deposit is collected.</p>
                <div className="grid gap-3 mt-3" role="radiogroup" aria-label="Plan">
                  {plans.map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      role="radio"
                      aria-checked={planCode === p.code}
                      onClick={() => setPlanCode(p.code)}
                      className={`text-left p-4 border transition-colors ${planCode === p.code ? "border-bk-gold-light bg-bk-surface-hover" : "border-bk-border bg-bk-surface hover:border-bk-border-nav"}`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-sans font-bold text-[15px] text-bk-heading">{p.name}</span>
                        <span className="font-mono text-[14px] text-bk-gold-light">{p.isPaid ? `${p.price ?? "—"} / ${p.days} days` : "Free"}</span>
                      </span>
                      {p.deposit && <span className="block font-sans text-[11px] text-bk-muted mt-0.5">Refundable security deposit: {p.deposit}</span>}
                      <ul className="mt-2 space-y-1">
                        {p.perks.map((perk) => (
                          <li key={perk} className="font-sans text-[12px] text-bk-body flex gap-2">
                            <span className="text-bk-teal" aria-hidden="true">✓</span>
                            {perk}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
                {plan?.isPaid && (
                  <div className="mt-3">
                    <p className="font-sans text-[11px] text-bk-muted mb-1">How long should it last?</p>
                    <DurationPicker value={duration} onChange={setDuration} />
                  </div>
                )}

                <div className="mt-6 border border-bk-border bg-bk-surface p-3">
                  <label className="flex items-start gap-2 font-sans text-[13px] text-bk-heading cursor-pointer">
                    <input type="checkbox" checked={lift} onChange={(e) => setLift(e.target.checked)} className="mt-0.5" />
                    <span>
                      Lift the new-organizer starter limits
                      <span className="block text-[12px] text-bk-muted">For organizers you already trust.</span>
                    </span>
                  </label>
                  <details className="mt-2">
                    <summary className="font-sans text-[12px] text-bk-gold-light cursor-pointer">What are the starter limits?</summary>
                    <div className="font-sans text-[12px] text-bk-body mt-2 space-y-2">
                      <p>A new organizer’s paid or prized events are capped until they have built a track record:</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        <li>Entry fee up to ${starter.maxEntryFeeUsd}</li>
                        <li>Prize pool up to ${starter.maxPrizeUsd}</li>
                        <li>Up to {starter.maxPaidEntrants} paid entrants</li>
                      </ul>
                      <p>The limits lift on their own after {starter.graduationEvents} prize tournaments where every winner confirmed they were paid, or once the organizer’s identity is verified{kycActive ? " (you are doing that in step 2)" : ""}.</p>
                      <p>Lifting them now skips that wait. It does <strong>not</strong> skip the payout hold: an organizer who hasn’t paid winners still can’t publish new paid events. Every change is written to the admin log.</p>
                    </div>
                  </details>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-6 pt-4 border-t border-bk-border font-sans text-[12px]">
                  {[
                    ["Adding", `${org.name} (${isInst ? `institute${kind ? `, ${KIND_LABEL[kind as Kind].toLowerCase()}` : ""}` : "organization"})`],
                    ["Owner", person.name ? `${person.name} · ${person.email}` : "—"],
                    ["Identity check", kycActive ? "Done by you" : "Skipped"],
                    ["Plan", plan ? plan.name : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-bk-muted">{k}</dt>
                      <dd className="text-bk-heading break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {error && (
              <p role="alert" className="text-bk-live text-[12px] font-sans mt-4">
                {error}
              </p>
            )}
          </div>
        )}
      </SideSheet>
    </>
  );
}
