import { cn } from "@/lib/utils";
import { SEVERITY_STYLES } from "@/lib/constants";

/** Severity or status pill. */
export function Badge({ children, severity, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.12em]",
        severity ? SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.normal : "border-ink-500 text-ash-400",
        className
      )}
    >
      {children}
    </span>
  );
}
