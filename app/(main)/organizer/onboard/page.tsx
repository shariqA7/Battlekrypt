import { redirect } from "next/navigation";

// The old instant "become an organizer" form is replaced by the reviewed
// organization registration flow. Kept as a redirect so existing links work.
export default function OrganizerOnboardPage() {
  redirect("/organizer/register");
}
