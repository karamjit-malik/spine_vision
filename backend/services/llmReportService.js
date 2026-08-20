import { env } from "../config/env.js";
import { chat, chatStream, llmConfigured } from "./llm/client.js";
import {
  DEFAULT_AUDIENCE,
  DISCLAIMER,
  buildFindingsBlock,
  formatValue,
  humanize,
  reportSystemPrompt,
  titleize,
} from "./llm/prompts.js";

/**
 * Turn a scan's measurements into a written report.
 *
 * The diagnostic scripts do the measuring; this only writes them up. The model
 * is handed the numbers, the grading scale each was read against, and each
 * script's own caveats, and is constrained to those — see llm/prompts.js.
 *
 * Without an OPENAI_API_KEY, templateReport() renders the same sections from
 * the same values, so the dashboard always has a real, number-accurate report.
 */
export async function generateReport(scan, { audience = DEFAULT_AUDIENCE } = {}) {
  const findings = scan.heatmaps ?? [];
  if (!findings.length) return noFindingsReport();
  if (!llmConfigured()) return templateReport(findings);

  try {
    const markdown = await chat({
      system: reportSystemPrompt(audience),
      user: await buildUserContent(findings),
    });
    return markdown ? `${markdown}\n\n${DISCLAIMER}` : templateReport(findings);
  } catch (error) {
    console.error("[llm] report generation failed, using template", error.message);
    return templateReport(findings);
  }
}

/**
 * The same report, yielded in pieces so the panel can fill in as it arrives.
 *
 * Falls back to emitting the template in one piece, so a caller can stream
 * unconditionally without caring whether a key is configured.
 * @returns {AsyncGenerator<string>}
 */
export async function* streamReport(scan, { audience = DEFAULT_AUDIENCE } = {}) {
  const findings = scan.heatmaps ?? [];
  if (!findings.length) return yield noFindingsReport();
  if (!llmConfigured()) return yield templateReport(findings);

  let produced = false;
  try {
    const stream = chatStream({
      system: reportSystemPrompt(audience),
      user: await buildUserContent(findings),
    });
    for await (const piece of stream) {
      produced = true;
      yield piece;
    }
    if (produced) yield `\n\n${DISCLAIMER}`;
  } catch (error) {
    console.error("[llm] report stream failed", error.message);
    // Mid-stream failures leave a half-written report on screen; the caller
    // replaces it wholesale with what this yields.
    if (!produced) yield templateReport(findings);
    else throw error;
  }
}

/**
 * The user turn: the findings block, optionally alongside the overlay images.
 *
 * Images are off by default. The guard rails rest on the model reasoning from
 * measured numbers rather than from pixels, and showing it the X-ray invites it
 * to observe things nothing measured. LLM_INCLUDE_IMAGES=true attaches them for
 * a deliberately experimental multimodal run.
 */
async function buildUserContent(findings) {
  const text = buildFindingsBlock(findings);
  if (process.env.LLM_INCLUDE_IMAGES !== "true") return text;

  const fs = await import("fs/promises");
  const parts = [{ type: "text", text }];
  for (const finding of findings) {
    if (!finding.imagePath) continue;
    try {
      const buffer = await fs.readFile(finding.imagePath);
      parts.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${buffer.toString("base64")}`, detail: "low" },
      });
    } catch (error) {
      console.error("[llm] could not attach overlay", finding.imagePath, error.message);
    }
  }
  return parts;
}

/* ------------------------------------------------------------------ *
 * Template fallback — same findings, no API key
 * ------------------------------------------------------------------ */

export function templateReport(findings) {
  const abnormal = findings.filter((finding) => finding.severity !== "normal");

  const rows = findings
    .map(
      (finding) =>
        `| ${titleize(finding.condition)} | ${finding.severity} | ` +
        `${((finding.confidence ?? 0) * 100).toFixed(0)}% |`
    )
    .join("\n");

  const sections = findings
    .map((finding) => {
      const lines = [`### ${titleize(finding.condition)}`, ""];
      if (finding.summary) lines.push(finding.summary, "");

      const perLevel = finding.metrics?.perLevel;
      if (Array.isArray(perLevel) && perLevel.length) {
        const columns = Object.keys(perLevel[0]);
        lines.push(
          `| ${columns.map(humanize).join(" | ")} |`,
          `| ${columns.map(() => "---").join(" | ")} |`,
          ...perLevel.map(
            (entry) => `| ${columns.map((key) => formatValue(entry[key])).join(" | ")} |`
          ),
          ""
        );
      }

      if (finding.metrics?.gradingScale) {
        lines.push(`Grading scale: ${formatValue(finding.metrics.gradingScale)}`, "");
      }
      return lines.join("\n");
    })
    .join("\n");

  const caveats = findings
    .flatMap((finding) =>
      (finding.caveats ?? []).map((caveat) => `- **${titleize(finding.condition)}** — ${caveat}`)
    )
    .join("\n");

  const headline = abnormal.length
    ? `${abnormal.length} of ${findings.length} measurements fell outside their normal band: ` +
      `${abnormal.map((f) => `${titleize(f.condition)} (${f.severity})`).join(", ")}.`
    : `All ${findings.length} measurements fell within their normal bands.`;

  return `## Summary

A lateral (LA) view lumbar radiograph was processed by the Spine Vision pipeline.
The segmented vertebral bodies were measured by ${findings.length} geometric
diagnostic script${findings.length === 1 ? "" : "s"}. ${headline}

| Condition | Band | Measurement quality |
| --- | --- | --- |
${rows}

Measurement quality reflects how reliable the geometry was — how many vertebrae
were segmented and how well-formed their outlines were. It is **not** the
probability that a condition is present.

## Measurements

${sections}
## Measurement Limitations

${caveats || "- No caveats were reported."}

## Next Steps

These are automated measurements, not a diagnosis. Review them with a qualified
clinician, who can correlate them against symptoms and physical examination.

*No LLM key configured — this report was rendered directly from the measured
values.*

${DISCLAIMER}`;
}

function noFindingsReport() {
  return `## Summary

No diagnostic measurements were produced for this scan. This usually means the
segmentation did not yield enough vertebrae for the scripts to measure, or every
script failed. There is nothing to report.

## Next Steps

Try re-uploading a clear lateral (LA) view lumbar radiograph with its mask.

${DISCLAIMER}`;
}

export { buildFindingsBlock };
