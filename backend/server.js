import express from "express";
import cors from "cors";
import morgan from "morgan";
import fs from "fs";
import { env } from "./config/env.js";
import { ApiError } from "./utils/ApiError.js";
import { connectDb } from "./config/db.js";
import { authRouter } from "./routes/auth.js";
import { scanRouter } from "./routes/scan.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { failInterruptedScans } from "./services/pipelineRunner.js";

/** Origins compare case-insensitively and ignore a trailing slash, because a
 * dashboard value pasted as "https://app.example.com/" is the same origin a
 * browser sends as "https://app.example.com" — and the mismatch otherwise
 * fails as an unexplained network error in the client. */
const normalizeOrigin = (value) => value.trim().replace(/\/+$/, "").toLowerCase();

/**
 * Allow every configured origin (CORS_ORIGIN accepts a comma-separated list).
 * A single "*" allows any origin: the browser still receives the requesting
 * origin reflected back rather than a literal asterisk, so credentialed
 * requests keep working. Open it only deliberately — it lets any site call the
 * API with a token it has obtained.
 * In development also allow any localhost/127.0.0.1 port, so a Vite dev server
 * that drifts to 5174 because 5173 was taken still reaches the API.
 */
function corsOrigin(origin, callback) {
  // Same-origin requests, curl and health checks send no Origin header.
  if (!origin) return callback(null, true);

  const allowed = env.corsOrigin.split(",").map(normalizeOrigin).filter(Boolean);
  if (allowed.includes("*")) return callback(null, true);
  if (allowed.includes(normalizeOrigin(origin))) return callback(null, true);

  if (env.nodeEnv !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return callback(null, true);
  }

  // Logged, because a rejected origin surfaces in the browser as a generic
  // network failure with nothing to point at.
  console.warn(`[cors] rejected origin ${origin} (allowed: ${allowed.join(", ") || "none"})`);
  return callback(ApiError.forbidden(`Origin ${origin} is not allowed by CORS`));
}

const app = express();

// Behind Render/Vercel's proxy, so req.ip is the real client rather than the
// proxy — the AI rate limiter meters per user, but this keeps logs honest.
if (env.nodeEnv === "production") app.set("trust proxy", 1);

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) =>
  res.json({ success: true, data: { status: "ok", mlEnabled: env.mlEnabled } })
);

app.use("/api/auth", authRouter);
app.use("/api/scan", scanRouter);

// uploads/ is never served statically — images go through the authenticated
// /api/scan/image route so only the owning user can read them.
app.use(notFound);
app.use(errorHandler);

async function start() {
  fs.mkdirSync(env.uploadDir, { recursive: true });
  await connectDb();
  await failInterruptedScans();
  app.listen(env.port, () =>
    console.log(`[server] listening on http://localhost:${env.port}`)
  );
}

start().catch((error) => {
  console.error("[server] failed to start", error);
  process.exit(1);
});

export { app };
