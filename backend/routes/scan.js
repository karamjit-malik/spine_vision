import { Router } from "express";
import * as scanController from "../controllers/scanController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { uploadScanFiles } from "../middleware/upload.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  askBodySchema,
  explainParamsSchema,
  historyQuerySchema,
  imageParamsSchema,
  scanIdSchema,
} from "../validators/scanValidator.js";

export const scanRouter = Router();

scanRouter.use(requireAuth);

scanRouter.post("/upload", uploadScanFiles, scanController.uploadScan);
scanRouter.get("/history", validate(historyQuerySchema, "query"), scanController.getHistory);
scanRouter.get("/image/:scanId/:filename", validate(imageParamsSchema, "params"), scanController.getImage);
scanRouter.get("/:id/status", validate(scanIdSchema, "params"), scanController.getStatus);
scanRouter.get("/:id/result", validate(scanIdSchema, "params"), scanController.getResult);

// Every route below spends API credits, so each is metered per user.
const llmLimit = rateLimit({ windowMs: 60_000, max: 12, name: "AI requests" });

scanRouter.get("/:id/report", llmLimit, validate(scanIdSchema, "params"), scanController.getReport);
scanRouter.post(
  "/:id/ask",
  llmLimit,
  validate(scanIdSchema, "params"),
  validate(askBodySchema),
  scanController.askScan
);
scanRouter.get(
  "/:id/explain/:condition",
  llmLimit,
  validate(explainParamsSchema, "params"),
  scanController.explainCondition
);
