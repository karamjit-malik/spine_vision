import { Check } from "lucide-react";
import { PIPELINE_STAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Pipeline progress: completed steps show a check, the active step pulses,
 * pending steps stay dim.
 * @param {{ status?: string }} props
 */
export function DiagnosisStepper({ status = "uploaded" }) {
  const failed = status === "failed";
  const complete = status === "complete";
  const activeIndex = complete
    ? PIPELINE_STAGES.length
    : PIPELINE_STAGES.findIndex((stage) => stage.status === status);

  return (
    <ol className="flex items-center gap-2" aria-label="Pipeline progress">
      {PIPELINE_STAGES.map((stage, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex && !failed;

        return (
          <li key={stage.status} className="flex flex-1 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.65rem]",
                  done && "border-ash-300 bg-ash-300 text-black",
                  active && "border-ash-300 text-ash-100 animate-pulse-ring",
                  !done && !active && "border-ink-600 text-ash-500",
                  failed && index === activeIndex && "border-ash-200 text-ash-100"
                )}
              >
                {done ? <Check size={12} /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  done || active ? "text-ash-200" : "text-ash-500"
                )}
              >
                {stage.label}
              </span>
            </div>
            {index < PIPELINE_STAGES.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1",
                  done ? "bg-ash-500" : "bg-ink-600"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
