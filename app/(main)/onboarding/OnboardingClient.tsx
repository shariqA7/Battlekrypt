"use client";

// Thin wrapper around the same ProfileForm used by /dashboard/profile —
// same fields, same validation, same API route (PATCH /api/players/me).
// The only differences here are onboarding-appropriate copy and a redirect
// back to wherever the person was headed, instead of an in-place "Saved!"
// message. Keeping one form implementation means a field added to the
// profile page automatically shows up here too.
import { useRouter, useSearchParams } from "next/navigation";
import ProfileForm from "../(player)/dashboard/profile/ProfileForm";

interface OnboardingClientProps {
  email: string;
  initialAvatarUrl: string;
  initialFirstName: string;
  initialLastName: string;
  initialMobileNumber: string;
  initialRegion: string;
  initialCountry: string;
  initialCity: string;
  initialAge?: number;
  initialGender: string;
  initialHobbies: string;
  initialFavoriteGames: string[];
}

export default function OnboardingClient(props: OnboardingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  return (
    <ProfileForm
      {...props}
      submitLabel="Save and continue"
      onSaved={() => router.push(redirectTo)}
    />
  );
}
