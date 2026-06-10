import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Sliding-window rate limiting (Layer 2). Inert (allows everything) until
// UPSTASH_REDIS_REST_URL/TOKEN are set, and fail-open if the limiter errors —
// never block legitimate traffic on an infra hiccup. All windows are 1 minute;
// the only knob is the per-minute limit, so limiters are cached by that number.

let _redis: Redis | null = null;
let _redisInit = false;

function getRedis(): Redis | null {
  if (_redisInit) return _redis;
  _redisInit = true;
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

const _limiters = new Map<number, Ratelimit>();

function getLimiter(limit: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  let limiter = _limiters.get(limit);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, "1 m"),
      prefix: "rafraf:rl",
      analytics: false,
    });
    _limiters.set(limit, limiter);
  }
  return limiter;
}

export function isRateLimitConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

export type RateResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

// Rate-limit an identifier to `limit` requests/minute. Defaults to 20/min (the
// public-API-surface + login IP limit used by middleware). Fail-open.
export async function rateLimit(
  identifier: string,
  limit = 20,
): Promise<RateResult> {
  const limiter = getLimiter(limit);
  if (!limiter) return { success: true, limit, remaining: limit, reset: 0 };
  try {
    const r = await limiter.limit(identifier);
    return {
      success: r.success,
      limit: r.limit,
      remaining: r.remaining,
      reset: r.reset,
    };
  } catch {
    return { success: true, limit, remaining: limit, reset: 0 };
  }
}

// Per-plan API limits (requests/minute), keyed by API key id so each key gets its
// own budget regardless of source IP.
const API_PLAN_LIMITS: Record<string, number> = {
  free: 60,
  basic: 300,
  smart: 1000,
};

export async function apiRateLimit(
  keyId: string,
  plan: string,
): Promise<RateResult> {
  const limit = API_PLAN_LIMITS[plan] ?? API_PLAN_LIMITS.free;
  return rateLimit(`api:${keyId}`, limit);
}
