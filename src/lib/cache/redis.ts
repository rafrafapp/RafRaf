import "server-only";
import { Redis } from "@upstash/redis";

// Optional read-through cache backed by Upstash Redis (reuses the rate limiter's
// UPSTASH_REDIS_REST_URL/TOKEN). INERT — a pure pass-through to the underlying
// query — until those are set, and FAIL-OPEN on any error: a cache hiccup must
// never break a request, it can only cost a DB read. Keys are namespaced under
// "rafraf:cache:" so they never collide with the "rafraf:rl" rate-limit keys.

const PREFIX = "rafraf:cache:";

let _redis: Redis | null = null;
let _init = false;

function getRedis(): Redis | null {
  if (_init) return _redis;
  _init = true;
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

export function isCacheConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

// Read-through cache: return the cached value for `key`, otherwise run `fn`, cache
// its result for `ttlSeconds`, and return it. null/undefined results are NOT cached
// (so a transient "not found" / miss never sticks). Never throws on a cache error —
// it just falls back to running `fn`. (If `fn` itself throws, that propagates, and
// nothing is cached.)
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return fn();
  const k = PREFIX + key;
  try {
    const cached = await redis.get<T>(k);
    if (cached !== null && cached !== undefined) return cached;
  } catch {
    // read error → fall through to the source of truth
  }
  const value = await fn();
  if (value !== null && value !== undefined) {
    try {
      await redis.set(k, value, { ex: ttlSeconds });
    } catch {
      // write error → value is still returned, just not cached
    }
  }
  return value;
}

// Drop one or more cache keys (best-effort). Called by the writers that own the
// data so a change is visible immediately instead of after the TTL.
export async function invalidateCache(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys.map((k) => PREFIX + k));
  } catch {
    // best-effort
  }
}

// Centralized key builders so writers and readers can't drift apart.
export const cacheKeys = {
  businessTypes: "business_types",
  merchant: (id: string) => `merchant:${id}`,
};
