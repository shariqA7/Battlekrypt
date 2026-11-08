"use client";

// Hands the admin-set default images (avatar, organizer/club logo) to client
// components such as Avatar and InitialTile without each page having to pass them.
import { createContext, useContext } from "react";
import { EMPTY_BRANDING, type Branding } from "@/lib/services/branding";

const BrandingContext = createContext<Branding>(EMPTY_BRANDING);

export function BrandingProvider({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
