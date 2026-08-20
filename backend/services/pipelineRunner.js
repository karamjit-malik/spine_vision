import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { Scan } from "../models/Scan.js";
import { generateReport } from "./llmReportService.js";

/**
 * Orchestrates stages 2–4 as a fire-and-forget background job.
 *
 * Stage 2 has two sources. Until the segmentation model ships, the user uploads
 * the mask with the X-ray and this stage is a no-op; once SEGMENTATION_ENABLED
 * is on, segment.py produces it instead. Either way the mask is on disk as
 * mask.json next to the image, which is what the diagnostic scripts read.
 *
 * ML_ENABLED=false runs stage 3 on stubbed output so the frontend's polling,
 * stepper and report rendering can be exercised without Python.
 */
/**
 * Fail any scan left mid-pipeline by a process restart.
 *
 * The pipeline is fire-and-forget and lives only in this process's memory, so a
 * restart — a crash, a redeploy, nodemon reloading — leaves its scan sitting at
 * whatever stage it had reached, polling forever with no job behind it. Nothing
 * would ever move it again, so it is failed at boot with a reason the user can
 * act on. Called once from server.js, after the DB connects.
 */
export async function failInterruptedScans() {
  const { modifiedCount } = await Scan.updateMany(
    { status: { $in: ["uploaded", "segmenting", "diagnosing", "generating_report"] } },
    {
      status: "failed",
      failureReason: "The server restarted while this scan was being processed. Upload it again.",
    }
  );

  if (modifiedCount) {
    console.log(`[pipeline] failed ${modifiedCount} scan(s) interrupted by a restart`);
  }
  return modifiedCount;
}

export async function run(scanId) {
  try {
    const scan = await Scan.findById(scanId).lean();

    await setStatus(scanId, "segmenting");
    if (scan.maskSource === "user") {
      // The mask came with the upload, so stage 2 has nothing to do. The status
      // still passes through "segmenting" so the stepper reads the same either
      // way, and swaps to real segmentation with no frontend change.
      console.log(`[pipeline] scan ${scanId} using the mask supplied with the upload`);
    } else if (env.segmentationEnabled) {
      await Scan.findByIdAndUpdate(scanId, { maskJson: await runSegmentation(scanId) });
    } else {
      throw new Error(
        "Automatic segmentation is not available yet — upload a mask JSON with the X-ray"
      );
    }

    await setStatus(scanId, "diagnosing");
    const heatmaps = env.mlEnabled
      ? await runDiagnostics(scanId)
      : await stubDiagnostics();
    await Scan.findByIdAndUpdate(scanId, { heatmaps });

    await setStatus(scanId, "generating_report");
    const scanned = await Scan.findById(scanId).lean();
    const reportMarkdown = await generateReport(scanned);

    // Also stored under its audience so /report?audience=patient is a cache
    // hit rather than a second paid generation of the report just written.
    await Scan.findByIdAndUpdate(scanId, {
      reportMarkdown,
      "reports.patient": reportMarkdown,
      status: "complete",
    });
    console.log(`[pipeline] scan ${scanId} complete`);
  } catch (error) {
    console.error(`[pipeline] scan ${scanId} failed`, error);
    await Scan.findByIdAndUpdate(scanId, {
      status: "failed",
      failureReason: error.message,
    }).catch(() => {});
  }
}

async function setStatus(scanId, status) {
  await Scan.findByIdAndUpdate(scanId, { status });
  console.log(`[pipeline] scan ${scanId} → ${status}`);
}

/* ------------------------------------------------------------------ *
 * Real ML hooks — implemented once ml/ contains the model and scripts.
 * ------------------------------------------------------------------ */

async function runSegmentation(scanId) {
  const { runSegmentation: bridge } = await import("./segmentationBridge.js");
  const scan = await Scan.findById(scanId).lean();
  return bridge({
    imagePath: scan.originalPath,
    outputPath: path.join(path.dirname(scan.originalPath), "mask.json"),
  });
}

async function runDiagnostics(scanId) {
  const { runAll } = await import("./diagnosisBridge.js");
  const scan = await Scan.findById(scanId).lean();
  const dir = path.dirname(scan.originalPath);

  // Some scripts measure the vertebral body outline and others the full
  // vertebra. If segmentation produced both contour sets, hand them over; each
  // script falls back to mask.json when its preferred one is absent.
  const optional = (name) => {
    const candidate = path.join(dir, name);
    return fs.existsSync(candidate) ? candidate : undefined;
  };

  return runAll({
    imagePath: scan.originalPath,
    maskPath: path.join(dir, "mask.json"),
    innerMaskPath: optional("mask.inner.json"),
    outerMaskPath: optional("mask.outer.json"),
    outputDir: dir,
  });
}

/* ------------------------------------------------------------------ *
 * Stubs — stand in for the Python layer while it is being built.
 * ------------------------------------------------------------------ */

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stubSegmentation() {
  await delay(2500);
  return {
    vertebrae: ["L1", "L2", "L3", "L4", "L5"].map((label, i) => {
      const top = 0.16 + i * 0.13;
      const drift = i * 0.012;
      return {
        label,
        polygon: [
          [0.4 + drift, top],
          [0.6 + drift, top + 0.008],
          [0.61 + drift, top + 0.095],
          [0.41 + drift, top + 0.088],
        ],
      };
    }),
    stub: true,
  };
}

async function stubDiagnostics() {
  await delay(3000);
  // Same shape the Python scripts emit, so the report prompt and the dashboard
  // exercise their real code paths. imagePath "" makes the API fall back to the
  // original X-ray for the tile.
  return [
    {
      condition: "lordosis",
      imagePath: "",
      severity: "mild",
      confidence: 0.88,
      metrics: {
        measurement: "Sagittal curvature index (stubbed)",
        units: "degrees",
        lordosisAngleDeg: 28.4,
        referenceRangeDeg: "35-65",
        levels: ["L1", "L2", "L3", "L4", "L5"],
      },
      summary:
        "Stubbed run: a sagittal curvature index of 28.4 degrees across L1-L5, " +
        "below the typical adult range of 35-65 degrees.",
      caveats: ["Placeholder output — ML_ENABLED is false, no measurement was made."],
    },
    {
      condition: "spondylolisthesis",
      imagePath: "",
      severity: "mild",
      confidence: 0.79,
      metrics: {
        measurement: "Centroid slip as a percentage of vertebral body width (stubbed)",
        units: "percent of vertebral body width",
        worstLevel: "L4-L5",
        worstSlipPercent: 14.2,
        worstGrade: "G1",
      },
      summary:
        "Stubbed run: a 14.2% anterior centroid offset at L4-L5, Meyerding G1.",
      caveats: ["Placeholder output — ML_ENABLED is false, no measurement was made."],
    },
    {
      condition: "compression_fracture",
      imagePath: "",
      severity: "normal",
      confidence: 0.81,
      metrics: {
        measurement: "Anterior/posterior vertebral body height ratio (stubbed)",
        units: "ratio",
        worstLevel: "L3",
        worstHeightRatio: 0.94,
      },
      summary:
        "Stubbed run: all five bodies above a 0.90 height ratio, lowest 0.94 at L3.",
      caveats: ["Placeholder output — ML_ENABLED is false, no measurement was made."],
    },
  ];
}
