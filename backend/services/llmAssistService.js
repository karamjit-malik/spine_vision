import { chat, llmConfigured } from "./llm/client.js";
import {
  DEFAULT_AUDIENCE,
  askSystemPrompt,
  buildFindingsBlock,
  explainSystemPrompt,
  titleize,
} from "./llm/prompts.js";
import { ApiError } from "../utils/ApiError.js";

/** A question longer than this is not a question about a scan. */
const MAX_QUESTION_CHARS = 500;

/**
 * Answer a question about one scan, grounded in its measurements.
 *
 * The model sees the same findings block the report is built from and nothing
 * else, so it cannot answer from the image or from general knowledge dressed up
 * as a finding. Questions it cannot ground are answered with "that wasn't
 * measured", which is the honest response and keeps the feature trustworthy.
 */
export async function answerQuestion(scan, question, { audience = DEFAULT_AUDIENCE } = {}) {
  const text = String(question ?? "").trim();
  if (!text) throw ApiError.badRequest("Ask a question first");
  if (text.length > MAX_QUESTION_CHARS) {
    throw ApiError.badRequest(`Keep the question under ${MAX_QUESTION_CHARS} characters`);
  }

  const findings = scan.heatmaps ?? [];
  if (!findings.length) {
    return {
      answer:
        "This scan produced no measurements, so there is nothing to answer from. " +
        "Try re-uploading the X-ray with its mask.",
      grounded: false,
    };
  }

  if (!llmConfigured()) {
    throw ApiError.serviceUnavailable(
      "Answering questions needs an LLM key. Set OPENAI_API_KEY on the server."
    );
  }

  const answer = await chat({
    system: askSystemPrompt(audience),
    user: `${buildFindingsBlock(findings)}\n\nQUESTION: ${text}`,
    temperature: 0.1,
    maxTokens: 400,
  });

  if (!answer) throw ApiError.serviceUnavailable("The model returned an empty answer");
  return { answer, grounded: true };
}

/**
 * Explain what one diagnostic overlay is showing.
 *
 * Scoped to a single condition's measurements so the explanation stays about
 * the picture in front of the user rather than drifting into the whole scan.
 */
export async function explainOverlay(scan, condition, { audience = DEFAULT_AUDIENCE } = {}) {
  const findings = scan.heatmaps ?? [];
  const finding = findings.find((entry) => entry.condition === condition);
  if (!finding) throw ApiError.notFound(`No ${titleize(condition)} finding on this scan`);

  if (!llmConfigured()) {
    throw ApiError.serviceUnavailable(
      "Overlay explanations need an LLM key. Set OPENAI_API_KEY on the server."
    );
  }

  const explanation = await chat({
    system: explainSystemPrompt(audience),
    user: buildFindingsBlock(findings, { condition }),
    temperature: 0.2,
    maxTokens: 350,
  });

  if (!explanation) throw ApiError.serviceUnavailable("The model returned an empty explanation");
  return { explanation };
}
