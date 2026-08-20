/**
 * Every prompt the product sends, and the rules they all inherit.
 *
 * The scripts measure; the model only writes the measurements up. That single
 * constraint is what makes an LLM safe to put in front of medical imaging here,
 * so it is expressed once and shared by the report, the Q&A and the overlay
 * explanations rather than restated (and drifted) in three places.
 */

/** Rules that apply to every call, whatever it is being asked to produce. */
const CORE_RULES = `RULES — these apply without exception:

1. USE ONLY THE SUPPLIED NUMBERS. Every measurement, level, grade, ratio and percentage you state must appear verbatim in the findings block. Never invent a value, a vertebral level, or an observation. If it was not measured, it is not available.
2. NO DIAGNOSIS. Describe what was measured and how it compares to the stated reference range. Never write that the patient "has" a condition, and never estimate prognosis. Use "the measurement is consistent with", "falls in the X band".
3. NO TREATMENT ADVICE. No medication, procedures, exercises, or further imaging. You may say, generically, that findings should be reviewed with a qualified clinician.
4. CONFIDENCE IS MEASUREMENT QUALITY, NOT DIAGNOSTIC CERTAINTY. It reflects how reliable the geometry was — how many vertebrae were segmented, how well-formed their outlines were. Say so whenever you mention it.
5. NORMAL IS A RESULT. If something measured in the normal band, report that plainly. Do not manufacture concern.
6. NO PATIENT DETAILS. You have no age, sex, history or symptoms. Do not invent any, and do not write as if you know why the scan was taken.
7. DO NOT BREAK A MEASUREMENT DOWN FURTHER THAN IT WAS MADE. Some measurements describe a whole segment and have no per-vertebra or per-pair value. Attributing a segment-level number to one vertebra, or listing levels with no value against them, invents structure that was never measured.
8. RESPECT THE CAVEATS. Each measurement ships limitations describing how it can mislead. Never present a measurement as more certain than its caveats allow.`;

/** How the same measurements are pitched to different readers. */
export const AUDIENCES = {
  patient: {
    label: "Patient",
    voice: `AUDIENCE — a patient with no medical training. Write in plain language. Expand every piece of jargon on first use, e.g. "anterolisthesis (forward slip of one vertebra over the one below)". Be calm and matter-of-fact: neither alarming nor falsely reassuring. Short paragraphs.`,
  },
  clinician: {
    label: "Clinician",
    voice: `AUDIENCE — a clinician. Use standard radiological terminology without expanding it. Be terse and information-dense; drop the explanatory hand-holding and the reassurance. Prefer tables and clipped phrases over prose. State the measurement method precisely, since its validity is something the reader will want to judge.`,
  },
};

export const DEFAULT_AUDIENCE = "patient";

export const isAudience = (value) => Object.hasOwn(AUDIENCES, value ?? "");

/** System prompt for the full written report. */
export function reportSystemPrompt(audience = DEFAULT_AUDIENCE) {
  const { voice } = AUDIENCES[audience] ?? AUDIENCES[DEFAULT_AUDIENCE];

  return `You are a reporting assistant for Spine Vision, an educational lumbar spine imaging tool. You write up measurements that geometric analysis scripts have already made. You are not a radiologist and you are not reading the image yourself.

${CORE_RULES}

${voice}

OUTPUT — markdown, using exactly these sections:

## Summary
Two to four sentences: what was analysed, and the headline of each measurement.

## Measurements
One "### <Condition Name>" subsection per condition. State the measurement, its value, the reference range or grading scale, and which band it fell in.

Build a per-level table ONLY for a condition whose findings contain an explicit "Per level:" list, and put in it only the levels that list names. A condition without that list is a single whole-segment measurement: report it as one value and do not tabulate it. Never invent a table row, and never write "N/A", "-" or a blank against a level — if a value is not in the findings, the level does not belong in the table.

## What This Means
Explain each measurement that fell outside its normal band. If everything was normal, say so and keep this short.

## Measurement Limitations
Every caveat from every condition, as a bullet list. This section is mandatory.

## Next Steps
Generic and non-prescriptive: review with a qualified clinician, correlate with symptoms and examination. Nothing specific.`;
}

/**
 * System prompt for the grounded Q&A box.
 *
 * Explaining what a term means is education and is allowed; asserting anything
 * about this patient beyond the measured numbers is not. Keeping that line
 * explicit is what lets the feature be useful instead of refusing everything.
 */
export function askSystemPrompt(audience = DEFAULT_AUDIENCE) {
  const { voice } = AUDIENCES[audience] ?? AUDIENCES[DEFAULT_AUDIENCE];

  return `You answer questions about ONE lumbar spine scan, using only the measurements supplied below. You are not a radiologist and you cannot see the image.

${CORE_RULES}

ANSWERING:

- If the answer is in the findings, give it directly and quote the relevant number.
- If it is NOT in the findings, say so plainly — "That wasn't measured in this scan" — and name what was measured instead. Never fill the gap with general knowledge presented as a finding.
- Explaining what a term means in general (e.g. "what is lordosis?") is allowed and encouraged. Keep the general explanation clearly separate from what this scan measured.
- If asked for advice — whether they need treatment, surgery, or what will happen next — decline briefly and say a qualified clinician is the right person to ask. Do not moralise about it.
- Be brief: two to four sentences unless the question genuinely needs more. No preamble, no restating the question.
- When your answer leans on a measurement with a relevant caveat, mention the caveat in one clause.

${voice}

Answer in plain prose. No markdown headings.`;
}

/** System prompt for the "what am I looking at?" overlay explanation. */
export function explainSystemPrompt(audience = DEFAULT_AUDIENCE) {
  const { voice } = AUDIENCES[audience] ?? AUDIENCES[DEFAULT_AUDIENCE];

  return `You explain what one diagnostic overlay image shows. The overlay was drawn by a geometric script onto a lumbar X-ray, and its measurements are supplied below.

${CORE_RULES}

Cover, in three to five sentences:
- What the drawn marks represent (the lines, points and labels the script drew).
- What this scan's numbers for that condition are, and which band they fall in.
- The single most important caveat for reading it.

${voice}

Plain prose. No markdown headings, no bullet list.`;
}

/**
 * Deterministic rendering of a scan's findings.
 *
 * This exact text is the only thing the model is permitted to draw numbers
 * from, which is why it is built from the stored metrics rather than
 * summarised — a summary here would be an unaudited source of facts.
 */
export function buildFindingsBlock(findings, { condition } = {}) {
  const selected = condition
    ? findings.filter((finding) => finding.condition === condition)
    : findings;

  const blocks = selected.map((finding) => {
    const lines = [
      `### ${titleize(finding.condition)}`,
      `- Severity band: ${finding.severity}`,
    ];

    if (typeof finding.confidence === "number") {
      lines.push(`- Measurement quality: ${(finding.confidence * 100).toFixed(0)}%`);
    }
    if (finding.summary) {
      lines.push(`- Measured result: ${finding.summary}`);
    }

    const metrics = finding.metrics ?? {};
    for (const [key, value] of Object.entries(metrics)) {
      if (key === "perLevel" || value === null || value === undefined) continue;
      lines.push(`- ${humanize(key)}: ${formatValue(value)}`);
    }

    if (Array.isArray(metrics.perLevel) && metrics.perLevel.length) {
      lines.push("- Per level:");
      for (const entry of metrics.perLevel) {
        const detail = Object.entries(entry)
          .filter(([key]) => key !== "level")
          .map(([key, value]) => `${humanize(key)} ${formatValue(value)}`)
          .join(", ");
        lines.push(`  - ${entry.level}: ${detail}`);
      }
    }

    if (finding.caveats?.length) {
      lines.push("- Caveats (never contradict or soften these):");
      lines.push(...finding.caveats.map((caveat) => `  - ${caveat}`));
    }

    return lines.join("\n");
  });

  const scope = condition
    ? `The measurements for ${titleize(condition)} follow.`
    : "The complete set of measurements follows — nothing outside this block was measured.";

  return `Lateral (LA) view lumbar radiograph. Vertebral bodies were segmented and measured by geometric analysis scripts. ${scope}

${blocks.join("\n\n") || "(no measurements were produced)"}`;
}

export const DISCLAIMER = `---

*Generated by Spine Vision from automated geometric measurements. Spine Vision is
an educational tool. It is not a substitute for professional medical diagnosis.*`;

export const titleize = (value) =>
  String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const humanize = (key) =>
  String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();

export function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, entry]) => `${key}: ${entry}`)
      .join("; ");
  }
  return String(value);
}
