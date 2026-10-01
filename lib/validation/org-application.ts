
export const ORG_TYPES = [
  "Esports organization",
  "Gaming community",
  "Company / brand",
  "Educational institution",
  "Individual organizer",
] as const;

export interface OrgApplicationInput {
  orgName: string;
  orgType: string;
  description: string;
  registrationNumber: string | null;
  website: string | null;
  country: string;
  city: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  handlerName: string;
  handlerRole: string;
  handlerPhone: string;
  // Plan code the applicant picked (checked against the Plan table on submit).
  plan: string;
}

export type FieldErrors = Partial<Record<keyof OrgApplicationInput, string>>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Returns either the cleaned input or a per-field error map (so the form can
// point at exactly what's wrong).
export function validateOrgApplication(
  body: unknown
): { data: OrgApplicationInput } | { errors: FieldErrors } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const orgName = str(b.orgName);
  if (orgName.length < 2 || orgName.length > 60)
    errors.orgName = "Enter the organization name (2–60 characters).";

  const orgType = str(b.orgType);
  if (!(ORG_TYPES as readonly string[]).includes(orgType))
    errors.orgType = "Choose the type of organization.";

  const description = str(b.description);
  if (description.length < 20 || description.length > 1000)
    errors.description = "Describe the organization in 20–1000 characters.";

  const website = str(b.website);
  if (website && !/^https?:\/\/\S+\.\S+/i.test(website))
    errors.website = "Website must start with http:// or https://";

  const country = str(b.country);
  if (!country) errors.country = "Country is required.";
  const city = str(b.city);
  if (!city) errors.city = "City is required.";
  const address = str(b.address);
  if (address.length < 5) errors.address = "Enter the organization's address.";

  const contactEmail = str(b.contactEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    errors.contactEmail = "Enter a valid contact email.";

  const phoneOk = (p: string) => /^\+?[0-9 ()-]{7,20}$/.test(p);
  const contactPhone = str(b.contactPhone);
  if (!phoneOk(contactPhone)) errors.contactPhone = "Enter a valid phone number.";

  const handlerName = str(b.handlerName);
  if (handlerName.length < 2) errors.handlerName = "Enter the name of the person handling this account.";
  const handlerRole = str(b.handlerRole);
  if (!handlerRole) errors.handlerRole = "Enter their role in the organization.";
  const handlerPhone = str(b.handlerPhone);
  if (!phoneOk(handlerPhone)) errors.handlerPhone = "Enter a valid phone number.";

  const plan = str(b.plan);
  if (!/^[a-z0-9_]{3,40}$/.test(plan)) errors.plan = "Choose a plan.";

  if (Object.keys(errors).length) return { errors };

  return {
    data: {
      orgName,
      orgType,
      description,
      registrationNumber: str(b.registrationNumber) || null,
      website: website || null,
      country,
      city,
      address,
      contactEmail,
      contactPhone,
      handlerName,
      handlerRole,
      handlerPhone,
      plan,
    },
  };
}
