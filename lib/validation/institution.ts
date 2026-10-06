export interface InstitutionInput {
  institutionName: string;
  studentId: string | null;
  idImagePath: string;
}

export type InstitutionFieldErrors = Partial<Record<keyof InstitutionInput, string>>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// `userId` is needed because ID images are stored under "<userId>/…" — a
// player can only point their submission at a file in their own folder.
export function validateInstitution(
  body: unknown,
  userId: string
): { data: InstitutionInput } | { errors: InstitutionFieldErrors } {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: InstitutionFieldErrors = {};

  const institutionName = str(b.institutionName);
  if (institutionName.length < 2 || institutionName.length > 120) {
    errors.institutionName = "Enter your school, college or university name (2–120 characters).";
  }

  const studentId = str(b.studentId);
  if (studentId.length > 40) errors.studentId = "Student ID is too long.";

  const idImagePath = str(b.idImagePath);
  if (!idImagePath || !idImagePath.startsWith(`${userId}/`) || idImagePath.includes("..")) {
    errors.idImagePath = "Upload a photo of your student ID.";
  }

  if (Object.keys(errors).length) return { errors };
  return { data: { institutionName, studentId: studentId || null, idImagePath } };
}
