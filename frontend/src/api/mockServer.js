/**
 * Prototype backend.
 *
 * Mirrors the REST contract in CLAUDE.md section 6 entirely in the browser so the
 * UI can be demoed before Express exists. Every function here has a one-to-one
 * counterpart in api/auth.js and api/diagnosis.js. This file is only reached
 * when VITE_USE_MOCK is explicitly "true"; otherwise those modules hit the real
 * server and nothing here is loaded.
 */
import { PIPELINE_STAGES } from "@/lib/constants";
import { titleize } from "@/lib/utils";

const LATENCY = 450;
const STORAGE_KEY = "spine-vision-mock-scans";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const id = () => Math.random().toString(16).slice(2, 10);

/** Scans live in memory; object URLs cannot survive a reload. */
const scans = new Map();

function restoreCount() {
  try {
    return Number(sessionStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Mirrors what the Python diagnostic scripts emit, including their caveats. */
const CONDITIONS = [
  {
    condition: "lordosis",
    severity: "mild",
    confidence: 0.88,
    summary:
      "A quadratic fitted to the 5 vertebral centroids (L1-L5) gives a sagittal " +
      "curvature index of 28.4 degrees, against a typical adult lumbar range of " +
      "35-65 degrees. This falls in the mild band.",
    metrics: {
      measurement: "Sagittal curvature index",
      units: "degrees",
      lordosisAngleDeg: 28.4,
      referenceRangeDeg: "35-65",
    },
    caveats: ["Mock data — no measurement was made."],
  },
  {
    condition: "spondylolisthesis",
    severity: "mild",
    confidence: 0.79,
    summary:
      "1 of 4 adjacent pairs measured above the 5% slip threshold: L4-L5 14.2% " +
      "(G1, anterolisthesis).",
    metrics: {
      measurement: "Centroid slip as a percentage of vertebral body width",
      units: "percent of vertebral body width",
      worstLevel: "L4-L5",
      worstSlipPercent: 14.2,
      worstGrade: "G1",
      perLevel: [
        { level: "L1-L2", slipPercent: 1.2, meyerdingGrade: "Normal" },
        { level: "L2-L3", slipPercent: 2.8, meyerdingGrade: "Normal" },
        { level: "L3-L4", slipPercent: 4.1, meyerdingGrade: "Normal" },
        { level: "L4-L5", slipPercent: 14.2, meyerdingGrade: "G1" },
      ],
    },
    caveats: ["Mock data — no measurement was made."],
  },
  {
    condition: "compression_fracture",
    severity: "normal",
    confidence: 0.81,
    summary:
      "All 5 measured vertebral bodies had an anterior/posterior height ratio " +
      "above 0.90. The lowest was 0.94 at L3, within the normal band.",
    metrics: {
      measurement: "Anterior/posterior vertebral body height ratio",
      units: "ratio",
      worstLevel: "L3",
      worstHeightRatio: 0.94,
    },
    caveats: ["Mock data — no measurement was made."],
  },
];

/**
 * Mirrors backend/services/llmReportService.js templateReport(): the same
 * sections, rendered from the same measured values. Nothing here may state a
 * finding the metrics above do not contain, and nothing may recommend treatment
 * — see CLAUDE.md section 15.
 */
function buildReport(heatmaps) {
  const rows = heatmaps
    .map(
      (h) =>
        `| ${titleize(h.condition)} | ${h.severity} | ${(h.confidence * 100).toFixed(0)}% |`
    )
    .join("\n");

  const abnormal = heatmaps.filter((h) => h.severity !== "normal");
  const headline = abnormal.length
    ? `${abnormal.length} of ${heatmaps.length} measurements fell outside their normal band: ` +
      `${abnormal.map((h) => `${titleize(h.condition)} (${h.severity})`).join(", ")}.`
    : `All ${heatmaps.length} measurements fell within their normal bands.`;

  const sections = heatmaps
    .map((h) => {
      const lines = [`### ${titleize(h.condition)}`, "", h.summary, ""];
      const perLevel = h.metrics?.perLevel;
      if (perLevel?.length) {
        const columns = Object.keys(perLevel[0]);
        lines.push(
          `| ${columns.map(humanize).join(" | ")} |`,
          `| ${columns.map(() => "---").join(" | ")} |`,
          ...perLevel.map((row) => `| ${columns.map((c) => row[c]).join(" | ")} |`),
          ""
        );
      }
      return lines.join("\n");
    })
    .join("\n");

  const caveats = heatmaps
    .flatMap((h) => (h.caveats ?? []).map((c) => `- **${titleize(h.condition)}** — ${c}`))
    .join("\n");

  return `## Summary

A lateral (LA) view lumbar radiograph was processed by the Spine Vision pipeline.
The segmented vertebral bodies were measured by ${heatmaps.length} geometric
diagnostic scripts. ${headline}

| Condition | Band | Measurement quality |
| --- | --- | --- |
${rows}

Measurement quality reflects how reliable the geometry was — how many vertebrae
were segmented and how well-formed their outlines were. It is **not** the
probability that a condition is present.

## Measurements

${sections}
## Measurement Limitations

${caveats}

## Next Steps

These are automated measurements, not a diagnosis. Review them with a qualified
clinician, who can correlate them against symptoms and physical examination.

---

*Mock backend — VITE_USE_MOCK is true, so these are fixed sample values, not a
real analysis. Spine Vision is an educational tool. It is not a substitute for
professional medical diagnosis.*`;
}

const humanize = (key) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

/** Walk a scan through the pipeline stages on a timer, as the real runner would. */
function runPipeline(scan) {
  const stages = PIPELINE_STAGES.map((s) => s.status).filter((s) => s !== "uploaded");
  let step = 0;

  const advance = () => {
    if (step >= stages.length) {
      scan.heatmaps = CONDITIONS.map((c) => ({ ...c, imageUrl: scan.originalUrl }));
      scan.reportMarkdown = buildReport(scan.heatmaps);
      scan.status = "complete";
      return;
    }
    scan.status = stages[step++];
    setTimeout(advance, 2600);
  };

  setTimeout(advance, 1500);
}

/** Read the uploaded mask so the overlay reflects the real file, not a stub. */
async function readMaskJson(mask) {
  try {
    return JSON.parse(await mask.text());
  } catch {
    return MOCK_MASK;
  }
}

const MOCK_AI_LATENCY = 700;

export const mockApi = {
  async getReport(scanId, audience) {
    await wait(MOCK_AI_LATENCY);
    const scan = scans.get(scanId);
    const markdown = buildReport(scan?.heatmaps ?? []);
    return {
      audience,
      cached: false,
      markdown:
        audience === "clinician"
          ? markdown.replace("## Summary", "## Summary\n\n*Clinician view (mock).*")
          : markdown,
    };
  },

  async askScan(scanId, question) {
    await wait(MOCK_AI_LATENCY);
    return {
      answer:
        `Mock answer to "${question}". With VITE_USE_MOCK=true no model is called — ` +
        "run against the real backend with an LLM key to get grounded answers.",
      grounded: false,
    };
  },

  async explainCondition(scanId, condition) {
    await wait(MOCK_AI_LATENCY);
    return {
      condition,
      cached: false,
      explanation:
        `Mock explanation of the ${condition.replace(/_/g, " ")} overlay. ` +
        "No model is called in mock mode.",
    };
  },

  async register({ name, email }) {
    await wait(LATENCY);
    return { user: { _id: id(), name, email } };
  },

  async login({ email, password }) {
    await wait(LATENCY);
    if (!password || password.length < 8) {
      const err = new Error("Invalid email or password");
      err.response = { status: 401, data: { message: "Invalid email or password" } };
      throw err;
    }
    return {
      access_token: `mock.access.${id()}`,
      refresh_token: `mock.refresh.${id()}`,
      user: { _id: id(), name: email.split("@")[0], email },
    };
  },

  async uploadXray(file, mask) {
    await wait(LATENCY);
    // Mirrors the real backend, which rejects an upload with no mask while
    // automatic segmentation is unavailable.
    if (!mask) {
      const error = new Error("A segmentation mask is required");
      error.response = {
        data: {
          message:
            "A segmentation mask is required. Automatic mask generation is " +
            "coming soon — for now, upload the mask JSON alongside the X-ray.",
        },
      };
      throw error;
    }
    const scanId = id();
    const scan = {
      scanId,
      status: "uploaded",
      originalUrl: URL.createObjectURL(file),
      fileName: file.name,
      maskJson: await readMaskJson(mask),
      maskSource: "user",
      maskName: mask.name,
      heatmaps: [],
      reportMarkdown: null,
      createdAt: new Date().toISOString(),
    };
    scans.set(scanId, scan);
    try {
      sessionStorage.setItem(STORAGE_KEY, String(restoreCount() + 1));
    } catch {
      /* private mode — history simply stays in memory */
    }
    runPipeline(scan);
    return { scanId, status: "uploaded" };
  },

  async getScanStatus(scanId) {
    await wait(120);
    const scan = scans.get(scanId);
    if (!scan) throw new Error("Scan not found");
    return { scanId, status: scan.status, currentStep: scan.status };
  },

  async getScanResult(scanId) {
    await wait(200);
    const scan = scans.get(scanId);
    if (!scan) throw new Error("Scan not found");
    return { ...scan };
  },

  async getScanHistory() {
    await wait(200);
    const list = [...scans.values()]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(({ scanId, status, createdAt, originalUrl, fileName }) => ({
        scanId,
        status,
        createdAt,
        originalUrl,
        fileName,
      }));
    return { scans: list, total: list.length, page: 1 };
  },
};

/** Five stacked vertebra polygons in normalised (0–1) image space. */
const MOCK_MASK = {
  vertebrae: ["L1", "L2", "L3", "L4", "L5"].map((label, i) => {
    const top = 0.16 + i * 0.13;
    const drift = i * 0.012;
    return {
      label,
      polygon: [
        [0.40 + drift, top],
        [0.60 + drift, top + 0.008],
        [0.61 + drift, top + 0.095],
        [0.41 + drift, top + 0.088],
      ],
    };
  }),
};
