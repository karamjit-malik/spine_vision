import { ApiError } from "../utils/ApiError.js";

/**
 * Per-user fixed-window limiter for the endpoints that cost money.
 *
 * In-memory, so it resets on restart and does not span instances — enough for a
 * single-server deployment, and the point here is to stop one person burning
 * the API credits by holding down a button, not to be a security control.
 */
export function rateLimit({ windowMs = 60_000, max = 15, name = "requests" } = {}) {
  const hits = new Map();

  // Windows are only cleared when their owner comes back, so sweep the stale
  // ones rather than growing a map entry per user forever.
  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  };
  const timer = setInterval(sweep, windowMs);
  timer.unref?.();

  return (req, _res, next) => {
    const key = String(req.user?.userId ?? req.ip);
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const seconds = Math.ceil((entry.resetAt - now) / 1000);
      return next(
        ApiError.tooManyRequests(
          `Too many ${name} — wait ${seconds}s. This limit exists to protect the API credits.`
        )
      );
    }

    entry.count += 1;
    next();
  };
}
