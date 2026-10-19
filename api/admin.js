import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { redis, notConfigured, rateLimited, readJson } from "../lib/db.js";

// Leaders-only actions, authorized by the x-admin-key header.
// The passcode is the ADMIN_KEY env var until a leader changes it on the
// Leaders page; after that only the hashed passcode stored in Redis works.
// To reset a forgotten passcode, delete the "admin:passcode" key in Upstash
// and ADMIN_KEY applies again.
const PASS_KEY = "admin:passcode";

function safeEqual(a, b) {
  return a.length === b.length && timingSafeEqual(a, b);
}

function hash(passcode, salt = randomBytes(16)) {
  return salt.toString("hex") + ":" + scryptSync(passcode, salt, 32).toString("hex");
}

async function authorized(req) {
  const given = String(req.headers["x-admin-key"] || "");
  if (!given) return false;
  const stored = await redis.get(PASS_KEY);
  if (stored) {
    const [salt, digest] = String(stored).split(":");
    return safeEqual(scryptSync(given, Buffer.from(salt, "hex"), 32), Buffer.from(digest, "hex"));
  }
  const expected = process.env.ADMIN_KEY || "";
  return Boolean(expected) && safeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (!redis) return notConfigured(res);
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!process.env.ADMIN_KEY && !(await redis.exists(PASS_KEY))) {
    return res.status(503).json({ error: "Leader passcode has not been set up yet." });
  }

  if (!(await authorized(req))) {
    // Slow down passcode guessing.
    if (await rateLimited(req, "admin-fail", 10, 900)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    return res.status(401).json({ error: "Incorrect passcode." });
  }

  const { action, id, newPasscode } = await readJson(req);

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

  if (action === "change-passcode") {
    const next = String(newPasscode || "");
    if (next.length < 8 || next.length > 200) return res.status(400).json({ error: "New passcode must be at least 8 characters." });
    await redis.set(PASS_KEY, hash(next));
    return res.json({ changed: true });
  }

  return res.status(400).json({ error: "Unknown action." });
}
