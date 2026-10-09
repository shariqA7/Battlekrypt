export interface InstitutionInput {
  institutionId: string;
  studentId: string | null;
  acknowledged: boolean;
}

export type InstitutionFieldErrors = Partial<Record<keyof InstitutionInput, string>>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validateInstitution(
  body: unknown
): { data: InstitutionInput } | { errors: InstitutionFieldErrors } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: InstitutionFieldErrors = {};

  const institutionId = str(b.institutionId);
  if (!institutionId) errors.institutionId = "Choose your institute.";

  const studentId = str(b.studentId);
  if (studentId.length > 40) errors.studentId = "Student ID is too long.";

  if (Object.keys(errors).length) return { errors };
  return { data: { institutionId, studentId: studentId || null, acknowledged: b.acknowledged === true } };
}
