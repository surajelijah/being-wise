import { randomUUID } from "node:crypto";
import { redis, notConfigured, rateLimited, readJson } from "../lib/db.js";

const MAX_LIST = 500;

export default async function handler(req, res) {
  if (!redis) return notConfigured(res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const ids = await redis.zrange("questions:new", 0, MAX_LIST - 1, { rev: true });
    if (!ids.length) return res.json([]);
    const p = redis.pipeline();
    ids.forEach((id) => { p.hgetall(`q:${id}`); p.zscore("questions:votes", id); });
    const out = await p.exec();
    const rows = ids.map((id, i) => {
      const q = out[i * 2];
      if (!q) return null;
      return { id, text: q.text, name: q.name || null, created_at: q.created_at, votes: Number(out[i * 2 + 1] || 0) };
    }).filter(Boolean);
    return res.json(rows);
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const text = String(body.text || "").trim();
    const name = String(body.name || "").trim();
    if (text.length < 3 || text.length > 500) return res.status(400).json({ error: "Question must be 3–500 characters." });
    if (name.length > 60) return res.status(400).json({ error: "Name must be 60 characters or fewer." });
    if (await rateLimited(req, "ask", 5, 600)) return res.status(429).json({ error: "Too many questions. Please wait a few minutes." });

    // The asker's own vote counts as the first vote.
    const voterId = /^[0-9a-f-]{36}$/i.test(body.voterId || "") ? body.voterId : null;
    const id = randomUUID();
    const created_at = new Date().toISOString();
    const tx = redis.multi()
      .hset(`q:${id}`, { text, name, created_at })
      .zadd("questions:new", { score: Date.now(), member: id })
      .zadd("questions:votes", { score: 1, member: id });
    if (voterId) tx.sadd(`voters:${id}`, voterId);
    await tx.exec();
    return res.status(201).json({ id, votes: 1 });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end();
}
