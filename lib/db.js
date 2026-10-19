import { Redis } from "@upstash/redis";

// Vercel's Upstash integration may expose either naming scheme.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

export function notConfigured(res) {
  return res.status(503).json({ error: "Database not connected yet." });
}

export function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}

// Allow `limit` actions per `windowSec` per IP for a given action name.
export async function rateLimited(req, action, limit, windowSec) {
  const key = `rl:${action}:${clientIp(req)}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, windowSec);
  return n > limit;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}
