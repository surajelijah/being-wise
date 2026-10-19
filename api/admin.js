import { timingSafeEqual } from "node:crypto";
import { redis, notConfigured, rateLimited, readJson } from "../lib/db.js";

// Leaders-only actions. Requires the x-admin-key header to match the ADMIN_KEY env var.
function authorized(req) {
  const expected = process.env.ADMIN_KEY || "";
  const given = String(req.headers["x-admin-key"] || "");
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (!redis) return notConfigured(res);
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!process.env.ADMIN_KEY) return res.status(503).json({ error: "Leader passcode has not been set up yet." });

  if (!authorized(req)) {
    // Slow down passcode guessing.
    if (await rateLimited(req, "admin-fail", 10, 900)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    return res.status(401).json({ error: "Incorrect passcode." });
  }

  const { action, id } = await readJson(req);

  if (action === "check") return res.json({ ok: true });

  if (action === "delete") {
    if (!/^[0-9a-f-]{36}$/i.test(id || "")) return res.status(400).json({ error: "Invalid question." });
    await redis.multi()
      .del(`q:${id}`, `voters:${id}`)
      .zrem("questions:new", id)
      .zrem("questions:votes", id)
      .exec();
    return res.json({ deleted: id });
  }

  return res.status(400).json({ error: "Unknown action." });
}
