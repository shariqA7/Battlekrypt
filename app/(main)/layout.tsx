import Nav from "@/components/layout/Nav";

// Every route except (auth) lives under this group, so Nav shows
// everywhere except the login/signup pages — which want a fully
// immersive, nav-free split-screen layout instead.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
    </>
  );
}
