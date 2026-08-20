import { DISCLAIMER } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Required medical disclaimer — shown on every page. */
export function Disclaimer({ className }) {
  return (
    <p className={cn("text-center text-[0.7rem] leading-relaxed text-ash-500", className)}>
      {DISCLAIMER}
    </p>
  );
}
