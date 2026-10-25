/**
 * Best-effort in-memory rate limiting. Serverless instances each keep their
 * own table, so this is a brake rather than a fortress — but it stops naive
 * brute-force scripts dead and costs nothing to run.
 */
const hits = new Map<string, { count: number; resetAt: number; lockedUntil: number }>();

export interface LimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * @param key      bucket key, e.g. "login:1.2.3.4"
 * @param limit    allowed attempts per window
 * @param windowMs sliding window
 * @param lockMs   lockout once the limit is exceeded
 */
export function check(key: string, limit: number, windowMs: number, lockMs: number): LimitResult {
  const now = Date.now();
  const entry = hits.get(key);

  if (entry && entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs, lockedUntil: 0 });
    return { allowed: true, retryAfterSec: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    entry.lockedUntil = now + lockMs;
    entry.count = 0;
    entry.resetAt = now + windowMs;
    return { allowed: false, retryAfterSec: Math.ceil(lockMs / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Clear a bucket after a success (login). */
export function reset(key: string): void {
  hits.delete(key);
}

/** Keep the map from growing forever on long-lived instances. */
export function sweep(maxEntries = 5000): void {
  if (hits.size <= maxEntries) return;
  const now = Date.now();
  for (const [k, v] of hits) {
    if (v.resetAt < now && v.lockedUntil < now) hits.delete(k);
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
