import { env } from "../config/env.js";

export function notFound(req, res) {
  res.status(404).json({ success: false, message: `No route for ${req.method} ${req.originalUrl}` });
}

/* eslint-disable no-unused-vars */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode ?? 500;

  if (statusCode >= 500) console.error("[error]", err);

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && env.nodeEnv === "production"
      ? "Something went wrong"
      : err.message,
  });
}
