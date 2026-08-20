import { env } from "../../config/env.js";

/**
 * Thin wrapper over the OpenAI-compatible API.
 *
 * `OPENAI_BASE_URL` lets this point at any compatible endpoint — a credit
 * reseller, a gateway, a local server — so the provider is a config change
 * rather than a code change.
 */

let cached = null;

export const llmConfigured = () => Boolean(env.openaiApiKey);

async function client() {
  if (cached) return cached;

  const { default: OpenAI } = await import("openai");
  cached = new OpenAI({
    apiKey: env.openaiApiKey,
    baseURL: env.openaiBaseUrl,
    // A hung request must not hold a scan or a question open indefinitely.
    timeout: Number(process.env.LLM_TIMEOUT_MS ?? 60_000),
    maxRetries: 1,
  });
  return cached;
}

/**
 * One completion, returned whole.
 * @returns {Promise<string|null>} null when the model returned nothing usable
 */
export async function chat({ system, user, temperature = 0.2, maxTokens }) {
  const openai = await client();
  const response = await openai.chat.completions.create({
    model: env.openaiModel,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || null;
}

/**
 * One completion, yielded token by token.
 *
 * Callers accumulate the pieces themselves — the caller both streams to the
 * client and persists the finished text, and this way it needs only one pass.
 * @returns {AsyncGenerator<string>}
 */
export async function* chatStream({ system, user, temperature = 0.2, maxTokens }) {
  const openai = await client();
  const stream = await openai.chat.completions.create({
    model: env.openaiModel,
    temperature,
    stream: true,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  for await (const chunk of stream) {
    const piece = chunk.choices?.[0]?.delta?.content;
    if (piece) yield piece;
  }
}
