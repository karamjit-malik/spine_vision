import { cn } from "@/lib/utils";

export function Loader({ label = "Loading", className }) {
  return (
    <div className={cn("flex items-center gap-3 text-sm text-ash-500", className)}>
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-500 border-t-ash-300" />
      {label}
    </div>
  );
}

/** Grey skeleton block for pending panels. */
export function Skeleton({ className }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-ink-800", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}
