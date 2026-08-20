import { useEffect, useMemo, useState } from "react";
import { Play, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { useUploadScan } from "@/hooks/useDiagnosis";
import { formatBytes } from "@/lib/utils";

/**
 * Thumbnail + metadata for the staged X-ray, with the action that starts the run.
 *
 * Normally that is Proceed: the server segments the X-ray and analyses it. In
 * developer mode a mask must be staged instead, and the button waits for it —
 * the backend applies the same rule, so this only mirrors it.
 */
export function UploadPreview() {
  const { pendingFile, pendingMask, clearPendingFile, devMode } = useDiagnosisStore();
  const upload = useUploadScan();
  const [thumb, setThumb] = useState(null);

  const isImage = useMemo(
    () => pendingFile?.type?.startsWith("image/"),
    [pendingFile]
  );

  useEffect(() => {
    if (!pendingFile || !isImage) return setThumb(null);
    const url = URL.createObjectURL(pendingFile);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile, isImage]);

  if (!pendingFile) return null;

  return (
    <div className="animate-fade-up space-y-3 rounded-xl border border-ink-600 bg-ink-850 p-3">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-600 bg-black">
          {thumb ? (
            <img src={thumb} alt={pendingFile.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[0.65rem] text-ash-500">
              DICOM
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ash-100">{pendingFile.name}</p>
          <p className="text-xs text-ash-500">{formatBytes(pendingFile.size)}</p>
        </div>

        <button
          onClick={clearPendingFile}
          aria-label="Remove file"
          className="text-ash-500 hover:text-ash-100"
        >
          <X size={15} />
        </button>
      </div>

      <Button
        className="w-full"
        disabled={upload.isPending || (devMode && !pendingMask)}
        onClick={() => upload.mutate({ file: pendingFile, mask: devMode ? pendingMask : null })}
      >
        {devMode ? <Play size={14} /> : <Sparkles size={14} />}
        {upload.isPending ? "Uploading…" : devMode ? "Analyze" : "Proceed"}
      </Button>

      {devMode && !pendingMask && (
        <p className="text-center text-[0.7rem] text-ash-500">
          Add the segmentation mask to run the analysis.
        </p>
      )}
    </div>
  );
}
