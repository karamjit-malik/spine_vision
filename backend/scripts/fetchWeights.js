/**
 * Fetch the segmentation checkpoint if it is not already on disk.
 *
 * ml/models/*.pt is git-ignored, so a host that builds from the repo has no
 * weights. Set SEGMENTATION_WEIGHTS_URL to a GitHub Release asset (or any
 * direct link) and this pulls it once per boot into ml/models/.
 *
 * A no-op locally, where the file already exists, and a no-op when the URL is
 * unset — segmentation is simply reported as unavailable rather than crashing
 * the server, which would take the rest of the API down with it.
 */
import fs from "fs";
import path from "path";
import { env } from "../config/env.js";

const target = path.resolve(env.mlDir, env.segmentationWeights);

async function main() {
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    console.log(`[weights] present at ${target}`);
    return;
  }

  if (!env.segmentationWeightsUrl) {
    console.warn(
      `[weights] ${target} missing and SEGMENTATION_WEIGHTS_URL unset — ` +
        "segmentation will fail until one is supplied"
    );
    return;
  }

  console.log(`[weights] downloading ${env.segmentationWeightsUrl}`);
  const response = await fetch(env.segmentationWeightsUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`weights download failed: ${response.status} ${response.statusText}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Write to a temp name first so an interrupted download never leaves a
  // truncated file that looks present on the next boot.
  const partial = `${target}.partial`;
  await fs.promises.writeFile(partial, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(partial, target);

  console.log(`[weights] saved ${fs.statSync(target).size} bytes to ${target}`);
}

main().catch((error) => {
  console.error("[weights]", error.message);
  process.exit(1);
});
