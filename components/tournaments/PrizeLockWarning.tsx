// Shown wherever an organizer sets or edits a prize pool.
export default function PrizeLockWarning({ className = "mt-3" }: { className?: string }) {
  return (
    <p className={`bg-bk-amber/[0.12] text-bk-amber font-sans text-[12px] px-3 py-2 ${className}`}>
      <strong>The prize pool can&apos;t be changed later.</strong> Once the first player registers, the pool, how it is split
      by place and the special awards are locked. Any change then needs admin approval, and every registered player is
      told. Check the numbers before you publish.
    </p>
  );
}
