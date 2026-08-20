import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Labelled text input with inline error text. */
export const Input = forwardRef(function Input(
  { label, error, className, ...props },
  ref
) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-ash-500">
          {label}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={Boolean(error)}
        className={cn("field", error && "border-ash-400", className)}
        {...props}
      />
      {error && <span className="block text-xs text-ash-400">{error}</span>}
    </label>
  );
});
