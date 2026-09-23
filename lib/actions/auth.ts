"use server";

// Server Actions must live in their own file with a top-level "use server"
// directive — defining one inline inside a component (even a Server
// Component) is fragile: if that component ever gets pulled into a client
// bundle (e.g. imported by a Client Component), the build fails with
// "It is not allowed to define inline use server annotated Server Actions
// in Client Components." Keeping it here makes that whole class of bug
// structurally impossible.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // redirect() alone doesn't guarantee every cached Server Component
  // (Nav included) refetches fresh data — revalidating the whole layout
  // tree forces that, so the Nav doesn't keep showing "logged in" after
  // a successful sign-out.
  revalidatePath("/", "layout");
  redirect("/");
}