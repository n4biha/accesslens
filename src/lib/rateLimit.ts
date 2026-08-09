/**
 * Best-effort rate limiting for a public demo.
 *
 * State lives in the instance's memory, so this is a speed bump rather than a
 * guarantee: serverless instances do not share counters and a cold start resets
 * them. It is enough to stop one visitor hammering the analyse button and to
 * cap what a single warm instance can spend, which is the realistic risk for a
 * demo. The hard ceiling on cost is the spend limit set on the API key itself.
 */

interface Window {
  hits: number[];
}

const buckets = new Map<string, Window>();

export interface Limit {
  /** Requests allowed per window, per caller. */
  perCaller: number;
  /** Requests allowed per window across every caller this instance sees. */
  global: number;
  windowMs: number;
}

export const ANALYSIS_LIMIT: Limit = {
  perCaller: 8,
  global: 120,
  windowMs: 60 * 60 * 1000,
};

export const LIGHT_LIMIT: Limit = {
  perCaller: 20,
  global: 300,
  windowMs: 60 * 60 * 1000,
};

export function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || request.headers.get("x-real-ip") || "unknown";
}

function record(key: string, windowMs: number, limit: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((at) => now - at < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  // Keep the map from growing without bound on a long-lived instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.hits.every((at) => now - at >= windowMs)) buckets.delete(k);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export interface RateDecision {
  allowed: boolean;
  message: string;
  retryAfterSeconds: number;
}

export function checkRateLimit(request: Request, scope: string, limit: Limit): RateDecision {
  const caller = record(`${scope}:${callerKey(request)}`, limit.windowMs, limit.perCaller);
  if (!caller.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: caller.retryAfterSeconds,
      message: `You have reached the demo limit of ${limit.perCaller} analyses per hour. Try again in about ${Math.ceil(caller.retryAfterSeconds / 60)} minute(s), or run AccessLens locally with your own API key.`,
    };
  }

  const overall = record(`${scope}:__all__`, limit.windowMs, limit.global);
  if (!overall.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: overall.retryAfterSeconds,
      message:
        "This demo has hit its hourly capacity. Try again shortly, or clone the repository and run it with your own API key.",
    };
  }

  return { allowed: true, message: "", retryAfterSeconds: 0 };
}
