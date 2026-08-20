import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Check, Code2, FileJson, Sparkles, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_FILES, ACCEPTED_MASK_FILES, MAX_FILE_BYTES } from "@/lib/constants";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { cn, formatBytes } from "@/lib/utils";

const SUPPORTED_FORMATS = ["PNG", "JPG", "DICOM"];

const ANALYSIS_STEPS = [
  "Lumbar lordosis",
  "Vertebral slip",
  "Compression fracture",
];

/** Drag-and-drop targets for the X-ray and its segmentation mask. */
export function UploadZone() {
  const {
    pendingFile,
    pendingMask,
    setPendingFile,
    setPendingMask,
    clearPendingMask,
    devMode,
    toggleDevMode,
  } = useDiagnosisStore();

  const onDropImage = useCallback(
    (accepted, rejected) => {
      if (rejected.length) {
        const reason = rejected[0].errors[0];
        toast.error(
          reason.code === "file-too-large"
            ? `File exceeds ${formatBytes(MAX_FILE_BYTES)}`
            : "Unsupported file type — use PNG, JPG or DICOM"
        );
        return;
      }
      if (accepted[0]) setPendingFile(accepted[0]);
    },
    [setPendingFile]
  );

  const onDropMask = useCallback(
    (accepted, rejected) => {
      if (rejected.length) {
        toast.error("The mask must be a .json file");
        return;
      }
      if (accepted[0]) setPendingMask(accepted[0]);
    },
    [setPendingMask]
  );

  const image = useDropzone({
    onDrop: onDropImage,
    accept: ACCEPTED_FILES,
    maxSize: MAX_FILE_BYTES,
    multiple: false,
  });

  const mask = useDropzone({
    onDrop: onDropMask,
    accept: ACCEPTED_MASK_FILES,
    maxSize: MAX_FILE_BYTES,
    multiple: false,
  });

  return (
    <div className="space-y-4">
      {/* Step 1 — the radiograph */}
      <section className="space-y-2">
        <StepLabel index={1} done={Boolean(pendingFile)}>
          Lumbar X-ray
        </StepLabel>

        <div
          {...image.getRootProps()}
          role="button"
          tabIndex={0}
          aria-label="Upload a lumbar X-ray image"
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
            image.isDragActive
              ? "border-ash-300 bg-ink-800"
              : "border-ink-600 bg-ink-900 hover:border-ink-500 hover:bg-ink-850"
          )}
        >
          <input {...image.getInputProps()} />
          <UploadCloud size={22} className="text-ash-500" />
          <p className="text-sm font-medium text-ash-100">
            {image.isDragActive ? "Release to attach" : "Upload Lumbar X-Ray"}
          </p>
          <p className="text-xs text-ash-400">
            Drag &amp; drop your lateral view radiograph
          </p>
          <p className="text-[0.7rem] text-ash-500">or click to browse</p>
        </div>
      </section>

      {/* Step 2 — the mask. Normally the model makes it; the developer switch
          replaces that with a file of your own. The two are exclusive: an
          uploaded mask is used as-is and segmentation never runs. */}
      <section className="space-y-2">
        <StepLabel index={2} done={devMode ? Boolean(pendingMask) : Boolean(pendingFile)}>
          Segmentation mask
        </StepLabel>

        {devMode ? (
          <>
            {pendingMask ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-850 px-3 py-2.5">
                <FileJson size={16} className="shrink-0 text-ash-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-ash-100">{pendingMask.name}</p>
                  <p className="text-[0.7rem] text-ash-500">{formatBytes(pendingMask.size)}</p>
                </div>
                <button
                  onClick={clearPendingMask}
                  aria-label="Remove mask"
                  className="shrink-0 text-ash-500 hover:text-ash-100"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div
                {...mask.getRootProps()}
                role="button"
                tabIndex={0}
                aria-label="Upload the segmentation mask JSON"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
                  mask.isDragActive
                    ? "border-ash-300 bg-ink-800"
                    : "border-ink-600 bg-ink-900 hover:border-ink-500 hover:bg-ink-850"
                )}
              >
                <input {...mask.getInputProps()} />
                <FileJson size={18} className="text-ash-500" />
                <p className="text-xs font-medium text-ash-100">Upload mask JSON</p>
                <p className="text-[0.7rem] text-ash-500">
                  COCO annotations or vertebra polygons
                </p>
              </div>
            )}
            <p className="text-[0.7rem] leading-snug text-ash-500">
              Automatic segmentation is skipped. The mask you upload is used
              exactly as given.
            </p>
          </>
        ) : (
          <div className="flex items-start gap-2.5 rounded-xl border border-ink-600 bg-ink-850 px-3 py-3">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-ash-400" />
            <div className="space-y-0.5">
              <p className="text-xs text-ash-200">Generated automatically</p>
              <p className="text-[0.7rem] leading-snug text-ash-500">
                The model outlines L1&ndash;L5 from your X-ray when you press
                Proceed. This adds a few seconds.
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-3 border-t border-ink-600 pt-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-[0.7rem] uppercase tracking-[0.14em] text-ash-500">
            Supported
          </p>
          <ul className="space-y-1">
            {SUPPORTED_FORMATS.map((format) => (
              <li
                key={format}
                className="flex items-center gap-1.5 text-xs text-ash-300"
              >
                <Check size={12} className="shrink-0 text-ash-500" />
                {format}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <p className="text-[0.7rem] uppercase tracking-[0.14em] text-ash-500">
            Maximum size
          </p>
          <p className="text-xs text-ash-300">{formatBytes(MAX_FILE_BYTES)}</p>
        </div>
      </div>

      <div className="border-t border-ink-600 pt-3">
        <button
          type="button"
          onClick={toggleDevMode}
          aria-pressed={devMode}
          className={cn(
            "flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.14em] transition-colors",
            devMode ? "text-ash-300" : "text-ash-500 hover:text-ash-300"
          )}
        >
          <Code2 size={12} className="shrink-0" />
          Developer only
          <span
            className={cn(
              "ml-1 rounded border px-1.5 py-0.5 text-[0.6rem] normal-case tracking-normal",
              devMode
                ? "border-ash-500 text-ash-200"
                : "border-ink-600 text-ash-500"
            )}
          >
            {devMode ? "manual mask" : "off"}
          </span>
        </button>
      </div>

      <div className="space-y-1.5 border-t border-ink-600 pt-3">
        <p className="text-[0.7rem] uppercase tracking-[0.14em] text-ash-500">
          AI will analyze
        </p>
        <ul className="grid gap-1">
          {ANALYSIS_STEPS.map((step) => (
            <li
              key={step}
              className="flex items-center gap-1.5 text-xs text-ash-300"
            >
              <span
                aria-hidden
                className="h-1 w-1 shrink-0 rounded-full bg-ash-500"
              />
              {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Numbered step heading that ticks over once its file is staged. */
function StepLabel({ index, done, children }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[0.6rem]",
          done ? "border-ash-300 text-ash-100" : "border-ink-500 text-ash-500"
        )}
      >
        {done ? <Check size={9} /> : index}
      </span>
      <p className="text-[0.7rem] uppercase tracking-[0.14em] text-ash-500">
        {children}
      </p>
    </div>
  );
}
