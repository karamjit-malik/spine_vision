import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { env } from "../config/env.js";

const run = promisify(execFile);

/**
 * Diagnostic scripts, in run order. Adding a fourth or fifth condition is a
 * new entry here — no code change anywhere else.
 *
 * `prefersMask` names the contour set the script's measurement assumes:
 * "inner" is the vertebral body outline, "outer" the full vertebra including
 * posterior elements. When only a single mask exists the script falls back to
 * it, so this is a refinement rather than a requirement.
 */
export const DIAGNOSTIC_SCRIPTS = [
  {
    scriptPath: "scripts/diagnose_lordosis.py",
    conditionName: "lordosis",
    prefersMask: "outer",
  },
  {
    scriptPath: "scripts/diagnose_spondylolisthesis.py",
    conditionName: "spondylolisthesis",
    prefersMask: "inner",
  },
  {
    scriptPath: "scripts/diagnose_compression_fracture.py",
    conditionName: "compression_fracture",
    prefersMask: "inner",
  },
];

/** A script that hangs must not hold the whole pipeline open. */
const SCRIPT_TIMEOUT_MS = Number(process.env.ML_SCRIPT_TIMEOUT_MS ?? 120_000);

/**
 * Run every configured diagnostic script and collect its findings.
 * A failing script is logged and skipped so one bad model cannot sink the scan.
 *
 * @param {{
 *   imagePath: string,
 *   maskPath: string,
 *   innerMaskPath?: string,
 *   outerMaskPath?: string,
 *   outputDir: string,
 * }} options
 * @returns {Promise<Array<{condition: string, imagePath: string, severity: string,
 *   confidence?: number, metrics?: object, summary?: string, caveats?: string[]}>>}
 */
export async function runAll({
  imagePath,
  maskPath,
  innerMaskPath,
  outerMaskPath,
  outputDir,
}) {
  const results = [];

  for (const { scriptPath, conditionName } of DIAGNOSTIC_SCRIPTS) {
    const outputPath = path.join(outputDir, `${conditionName}.png`);
    const args = [
      path.resolve(env.mlDir, scriptPath),
      "--image", imagePath,
      "--mask", maskPath,
      "--output", outputPath,
    ];
    if (innerMaskPath) args.push("--mask-inner", innerMaskPath);
    if (outerMaskPath) args.push("--mask-outer", outerMaskPath);

    try {
      const { stdout, stderr } = await run(env.pythonPath, args, {
        timeout: SCRIPT_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });

      if (stderr) console.error(`[${conditionName}]`, stderr.trim());

      const parsed = parseResult(stdout);
      if (!parsed) {
        throw new Error("script produced no JSON result line");
      }

      // The overlay is what the dashboard renders — an entry without one would
      // silently fall back to the plain X-ray, which reads as a real finding.
      const overlayPath = parsed.imagePath ?? outputPath;
      if (!fs.existsSync(overlayPath)) {
        throw new Error(`overlay missing at ${overlayPath}`);
      }

      results.push({
        condition: parsed.condition ?? conditionName,
        imagePath: overlayPath,
        severity: parsed.severity ?? "normal",
        confidence: parsed.confidence,
        metrics: parsed.metrics ?? null,
        summary: parsed.summary ?? null,
        caveats: parsed.caveats ?? [],
      });
    } catch (error) {
      console.error(`[diagnosis] ${conditionName} failed:`, error.message);
    }
  }

  return results;
}

/** Scripts log to stderr and print exactly one JSON line to stdout. */
function parseResult(stdout) {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1);
  try {
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
}
