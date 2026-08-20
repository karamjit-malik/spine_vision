import { cn } from "@/lib/utils";

/**
 * @param {{ variant?: "primary" | "ghost" | "subtle", className?: string }} props
 */
export function Button({ variant = "primary", className, children, ...props }) {
  const variants = {
    primary: "btn-primary",
    ghost: "btn-ghost",
    subtle: "btn bg-ink-700 text-ash-200 hover:bg-ink-600",
  };
  return (
    <button className={cn(variants[variant], className)} {...props}>
      {children}
    </button>
  );
}
