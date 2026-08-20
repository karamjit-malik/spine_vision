import fs from "fs";
import path from "path";
import { env } from "../config/env.js";

/** uploads/{userId}/{scanId}/ — created on demand. */
export function scanDir(userId, scanId) {
  const dir = path.join(env.uploadDir, String(userId), String(scanId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Guard against traversal before serving anything out of uploads/. */
export function isInsideUploads(candidate) {
  const resolved = path.resolve(candidate);
  return resolved.startsWith(path.resolve(env.uploadDir) + path.sep);
}

export function extensionOf(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext || ".png";
}
