const buckets = new Map();

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function rateLimit(req, key, limit, windowMs) {
  const now = Date.now();
  const bucketKey = `${key}:${clientIp(req)}`;
  const current = buckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= 5000 && !buckets.has(bucketKey)) {
      for (const [entryKey, value] of buckets) {
        if (value.resetAt <= now || buckets.size >= 5000) buckets.delete(entryKey);
        if (buckets.size < 5000) break;
      }
    }
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  current.count += 1;
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

function enforceRateLimit(req, res, key, limit, windowMs) {
  const result = rateLimit(req, key, limit, windowMs);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) {
    res.setHeader("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
    res.status(429).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }));
    return false;
  }
  return true;
}

function enforceJsonRequest(req, res, maxBytes = 16 * 1024) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const contentLength = Number(req.headers["content-length"] || 0);
  if (!contentType.startsWith("application/json")) {
    res.status(415).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "application/json 요청만 지원합니다." }));
    return false;
  }
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    res.status(413).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "요청 본문이 너무 큽니다." }));
    return false;
  }
  return true;
}

function enforceSameOrigin(req, res) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    res.status(403).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "교차 출처 요청은 허용되지 않습니다." }));
    return false;
  }
  const origin = String(req.headers.origin || "");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (origin) {
    try {
      if (new URL(origin).host !== host) throw new Error("origin mismatch");
    } catch {
      res.status(403).setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ message: "요청 출처가 올바르지 않습니다." }));
      return false;
    }
  }
  return true;
}

function safeString(value, maxLength) {
  const result = String(value || "").trim();
  if (!result || result.length > maxLength || /[<>\u0000-\u001f]/.test(result)) return null;
  return result;
}

module.exports = {
  enforceJsonRequest,
  enforceRateLimit,
  enforceSameOrigin,
  safeString,
};
