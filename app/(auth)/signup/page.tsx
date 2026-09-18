// /signup and /login are the same flow — Supabase creates the account
// automatically on first OAuth/magic-link use, there's no separate
// "register" step. This page just redirects to keep the URL people expect
// (from the Nav's "Sign Up" button) working rather than 404ing.
import { redirect } from "next/navigation";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  redirect(`/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`);
}
