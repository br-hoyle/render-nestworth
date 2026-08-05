export function Spinner({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className + " animate-spin text-nw-mint"} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2z" />
    </svg>
  );
}

// Centers a spinner within whatever container it's dropped into — the standard "this
// section is loading" placeholder used across pages/panels instead of a bare "Loading…" string.
export function LoadingBlock({ className = "py-10" }: { className?: string }) {
  return (
    <div className={"flex items-center justify-center " + className}>
      <Spinner />
    </div>
  );
}
