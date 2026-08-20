/** Pipeline stages, in the order the backend reports them. */
export const PIPELINE_STAGES = [
  { status: "uploaded", label: "Upload" },
  { status: "segmenting", label: "Segment" },
  { status: "diagnosing", label: "Diagnose" },
  { status: "generating_report", label: "Report" },
];

export const TERMINAL_STATUSES = ["complete", "failed"];

export const SEVERITY_STYLES = {
  normal: "border-ink-500 text-ash-400",
  mild: "border-ash-500 text-ash-300",
  moderate: "border-ash-400 text-ash-200",
  severe: "border-ash-200 text-ash-100",
};

export const ACCEPTED_FILES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "application/dicom": [".dcm", ".dicom"],
};

export const ACCEPTED_MASK_FILES = {
  "application/json": [".json"],
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Whether the server can produce the mask itself (ml/segment.py). When true the
 * normal path is X-ray only; the mask upload moves behind the developer switch.
 * The backend gates this independently via SEGMENTATION_ENABLED, so flipping
 * only this would not bypass it.
 */
export const SEGMENTATION_AVAILABLE = true;

export const DISCLAIMER =
  "Spine Vision is an educational tool. It is not a substitute for professional medical diagnosis.";

/**
 * Prototype mode is opt-in: only an explicit VITE_USE_MOCK=true serves the fake
 * auth + pipeline in api/mockServer.js. A missing or malformed .env must fall
 * through to the real backend — defaulting the other way let mock auth accept
 * any 8-character password without anyone noticing.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
