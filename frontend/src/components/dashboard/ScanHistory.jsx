import { useScanHistory } from "@/hooks/useDiagnosis";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { AuthedImage } from "@/components/common/AuthedImage";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/common/Loader";
import { cn, formatDate } from "@/lib/utils";

const STATUS_LABEL = {
  complete: "Complete",
  failed: "Failed",
};

/** Past scans; clicking one loads it into the report panel. */
export function ScanHistory() {
  const { data, isLoading } = useScanHistory();
  const { activeScanId, setActiveScanId } = useDiagnosisStore();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const scans = data?.scans ?? [];

  if (!scans.length) {
    return (
      <p className="py-6 text-center text-xs text-ash-500">
        No scans yet. Upload an X-ray to begin.
      </p>
    );
  }

  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {scans.map((scan) => (
        <li key={scan.scanId}>
          <button
            onClick={() => setActiveScanId(scan.scanId)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors",
              scan.scanId === activeScanId
                ? "border-ash-500 bg-ink-800"
                : "border-ink-600 bg-ink-900 hover:border-ink-500"
            )}
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-ink-600 bg-black">
              {scan.originalUrl && (
                <AuthedImage src={scan.originalUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-ash-200">
                {scan.fileName ?? scan.scanId}
              </p>
              <p className="text-[0.7rem] text-ash-500">{formatDate(scan.createdAt)}</p>
            </div>
            <Badge>{STATUS_LABEL[scan.status] ?? "Processing"}</Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
