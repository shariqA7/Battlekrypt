import Link from "next/link";

// Shown instead of a page whose feature an admin has switched off.
export default function FeatureOffNotice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="flex-1 px-6 py-16 max-w-lg mx-auto w-full text-center">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-2">{title}</h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">{children}</p>
      <Link href="/" className="font-sans text-[12px] uppercase tracking-[0.8px] text-bk-gold-light underline">
        Back to home
      </Link>
    </main>
  );
}
