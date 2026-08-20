import multer from "multer";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { extensionOf, scanDir } from "../utils/fileUtils.js";

const ALLOWED_IMAGE = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/dicom",
  "application/octet-stream",
]);

// Browsers are inconsistent about .json — some send application/json, some
// text/plain, some nothing at all — so the extension is checked as well.
const ALLOWED_MASK = new Set([
  "application/json",
  "text/json",
  "text/plain",
  "application/octet-stream",
]);

/**
 * Files land in uploads/{userId}/{scanId}/ as original.{ext} and mask.json.
 * The scanId is minted here so the path is known before the Scan document is
 * created, and only once — both files share the same directory.
 */
const storage = multer.diskStorage({
  destination(req, _file, cb) {
    if (!req.scanId) req.scanId = new mongoose.Types.ObjectId();
    try {
      cb(null, scanDir(req.user.userId, req.scanId));
    } catch (error) {
      cb(error);
    }
  },
  filename(_req, file, cb) {
    cb(null, file.fieldname === "mask" ? "mask.json" : `original${extensionOf(file.originalname)}`);
  },
});

/**
 * Accepts the X-ray and, alongside it, the segmentation mask the user supplies.
 * The mask is a separate field rather than a second image because automatic
 * segmentation is not available yet — see pipelineRunner.
 */
export const uploadScanFiles = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes },
  fileFilter(_req, file, cb) {
    if (file.fieldname === "mask") {
      const looksJson = file.originalname.toLowerCase().endsWith(".json");
      if (!looksJson || !ALLOWED_MASK.has(file.mimetype)) {
        return cb(ApiError.badRequest("The mask must be a .json file"));
      }
      return cb(null, true);
    }

    if (!ALLOWED_IMAGE.has(file.mimetype)) {
      return cb(ApiError.badRequest("Unsupported file type — use PNG, JPG or DICOM"));
    }
    cb(null, true);
  },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "mask", maxCount: 1 },
]);
