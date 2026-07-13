export function createRateLimiter({ limit = Number(process.env.LLM_RATE_LIMIT_PER_MINUTE || 20), windowMs = 60_000 } = {}) {
  const buckets = new Map();

  return {
    consume(key) {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        const next = { count: 1, resetAt: now + windowMs };
        buckets.set(key, next);
        return result(true, next, limit, now);
      }
      if (bucket.count >= limit) return result(false, bucket, limit, now);
      bucket.count += 1;
      return result(true, bucket, limit, now);
    }
  };
}

function result(allowed, bucket, limit, now) {
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}
