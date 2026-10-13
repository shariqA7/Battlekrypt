// Inline tournament search for the top bar. A plain GET form to /tournaments
// (which already reads ?search=), so it works without JavaScript.
export default function SearchBox({ className = "", id = "nav-search" }: { className?: string; id?: string }) {
  return (
    <form action="/tournaments" method="get" role="search" className={className}>
      <label htmlFor={id} className="sr-only">
        Search tournaments
      </label>
      <div className="flex items-center gap-3 h-10 px-3.5 bg-bk-surface border border-bk-border focus-within:border-bk-gold-to transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-bk-muted shrink-0">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id={id}
          name="search"
          type="search"
          placeholder="Search tournaments…"
          autoComplete="off"
          className="w-full min-w-0 bg-transparent outline-none border-0 text-bk-heading placeholder:text-bk-muted font-sans text-[14px]"
        />
      </div>
    </form>
  );
}
