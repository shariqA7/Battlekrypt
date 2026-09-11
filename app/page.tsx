import Nav from "@/components/layout/Nav";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="text-center max-w-lg">
          <p className="text-bk-muted font-sans text-[11px] tracking-[1.2px] uppercase mb-3">
            Phase 1 scaffold
          </p>
          <h1 className="font-sans font-extrabold text-3xl text-bk-heading mb-3">
            BattleKrypt is wired up
          </h1>
          <p className="font-sans text-bk-body text-sm">
            Fonts, colors, and layout are live from the real design tokens.
            Tournament listing, auth, and dashboards get built next.
          </p>
        </div>
      </main>
    </>
  );
}
