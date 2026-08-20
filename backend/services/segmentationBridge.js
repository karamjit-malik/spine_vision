import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { env } from "../config/env.js";

const run = promisify(execFile);

/**
 * Default segmentation model. Passed as a config object rather than hardcoded
 * so a second .pth can be added without touching this module.
 */
export const DEFAULT_MODEL = {
  script: "segment.py",
  // Ultralytics writes its checkpoint as best.pt. SEGMENTATION_WEIGHTS
  // overrides it so swapping in a retrained model is config, not code.
  weights: env.segmentationWeights,
};

/**
 * Spawn the Python segmentation entry script and return the parsed mask.
 * @param {{ imagePath: string, outputPath: string, model?: typeof DEFAULT_MODEL }} options
 */
export async function runSegmentation({ imagePath, outputPath, model = DEFAULT_MODEL }) {
  const scriptPath = path.resolve(env.mlDir, model.script);

  const { stdout, stderr } = await run(
    env.pythonPath,
    [
      scriptPath,
      "--image",
      imagePath,
      "--output",
      outputPath,
      "--weights",
      path.resolve(env.mlDir, model.weights),
    ],
    {
      // Loading torch and the weights dominates the runtime; inference itself
      // is quick. A hung model must not hold the scan open indefinitely.
      timeout: Number(process.env.SEGMENTATION_TIMEOUT_MS ?? 180_000),
      maxBuffer: 8 * 1024 * 1024,
    }
  );

  if (stderr) console.error("[segment.py]", stderr.trim());

  // The script prints JSON on stdout; the mask file is the source of truth.
  const summary = parseJsonLine(stdout);
  const maskPath = summary?.maskPath ?? outputPath;
  return JSON.parse(await fs.readFile(maskPath, "utf8"));
}

function parseJsonLine(stdout) {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1);
  try {
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
}
