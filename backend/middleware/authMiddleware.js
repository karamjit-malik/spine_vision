import { verifyAccessToken } from "../services/authService.js";
import { ApiError } from "../utils/ApiError.js";

/** Verify the Bearer token and attach req.user = { userId, email }. */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(ApiError.unauthorized("Missing or malformed Authorization header"));
  }

  try {
    const { userId, email } = verifyAccessToken(token);
    req.user = { userId, email };
    next();
  } catch {
    next(ApiError.unauthorized("Access token is invalid or expired"));
  }
}
