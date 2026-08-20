import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const required = ["JWT_SECRET", "JWT_REFRESH_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

export const env = {
  port: Number(process.env.PORT ?? 5001),
  nodeEnv: process.env.NODE_ENV ?? "development",

  mongoUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017/spinevision",
  // Opt-in, not opt-out: a missing var on a hosted instance must not silently
  // boot a throwaway mongod and lose every account on the next deploy.
  useEmbeddedMongo: process.env.USE_EMBEDDED_MONGO === "true",
  embeddedMongoPort: Number(process.env.EMBEDDED_MONGO_PORT ?? 27018),
  embeddedMongoDbPath: path.resolve(
    __dirname,
    "..",
    process.env.EMBEDDED_MONGO_DBPATH ?? "./.mongo-data"
  ),

  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY ?? "15m",
  refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY ?? "7d",

  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  uploadDir: path.resolve(__dirname, "..", process.env.UPLOAD_DIR ?? "./uploads"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),

  // Resolved against backend/ so the bridges work regardless of the cwd the
  // server was started from.
  pythonPath: process.env.PYTHON_PATH
    ? path.resolve(__dirname, "..", process.env.PYTHON_PATH)
    : "python3",
  mlDir: path.resolve(__dirname, "..", process.env.ML_DIR ?? "../ml"),
  // Stage 3: run the real Python diagnostic scripts.
  mlEnabled: process.env.ML_ENABLED === "true",
  // Stage 2: generate the mask with segment.py. Off until the model ships —
  // while off, the upload must carry a mask.
  segmentationEnabled: process.env.SEGMENTATION_ENABLED === "true",
  // Relative to ML_DIR. Ultralytics names its checkpoint best.pt.
  segmentationWeights: process.env.SEGMENTATION_WEIGHTS ?? "models/best.pt",
  // The checkpoint is git-ignored, so a hosted instance has to fetch it on
  // boot. Unset locally, where the file is already on disk.
  segmentationWeightsUrl: process.env.SEGMENTATION_WEIGHTS_URL || null,

  openaiApiKey: process.env.OPENAI_API_KEY || null,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  // Any OpenAI-compatible endpoint (a credit reseller, a gateway, a local
  // server). Left unset, the SDK talks to api.openai.com.
  openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,
};
