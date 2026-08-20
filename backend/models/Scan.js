import mongoose from "mongoose";

const heatmapSchema = new mongoose.Schema(
  {
    condition: { type: String, required: true },
    imagePath: { type: String, required: true },
    severity: {
      type: String,
      enum: ["normal", "mild", "moderate", "severe"],
      default: "normal",
    },
    confidence: { type: Number, min: 0, max: 1 },
    // Structured measurements from the diagnostic script, and the plain-language
    // sentences the report prompt is built from. Mixed because each condition
    // measures something different — a slip percentage is not a height ratio.
    metrics: { type: mongoose.Schema.Types.Mixed, default: null },
    summary: { type: String, default: null },
    caveats: { type: [String], default: [] },
  },
  { _id: false }
);

const scanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "uploaded",
        "segmenting",
        "diagnosing",
        "generating_report",
        "complete",
        "failed",
      ],
      default: "uploaded",
    },
    originalPath: { type: String, required: true },
    originalName: { type: String },
    maskJson: { type: mongoose.Schema.Types.Mixed },
    // "user" while automatic segmentation is unavailable; "model" once
    // segment.py produces the mask.
    maskSource: { type: String, enum: ["user", "model"], default: "model" },
    maskName: { type: String, default: null },
    heatmaps: [heatmapSchema],
    reportMarkdown: { type: String, default: null },
    // Report variants keyed by audience ("patient", "clinician"), and overlay
    // explanations keyed by condition. Cached because each one is a paid call —
    // toggling back and forth must not re-bill.
    reports: { type: mongoose.Schema.Types.Mixed, default: {} },
    explanations: { type: mongoose.Schema.Types.Mixed, default: {} },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

export const Scan = mongoose.model("Scan", scanSchema);
