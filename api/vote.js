import { redis, notConfigured, rateLimited, readJson } from "../lib/db.js";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  if (!redis) return notConfigured(res);
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }

  const { id, voterId } = await readJson(req);
  if (!UUID.test(id || "") || !UUID.test(voterId || "")) return res.status(400).json({ error: "Invalid vote." });
  if (await rateLimited(req, "vote", 60, 600)) return res.status(429).json({ error: "Too many votes. Please wait a few minutes." });
  if (!(await redis.exists(`q:${id}`))) return res.status(404).json({ error: "Question not found." });

  // One vote per browser per question.
  const added = await redis.sadd(`voters:${id}`, voterId);
  const votes = added ? await redis.zincrby("questions:votes", 1, id) : await redis.zscore("questions:votes", id);
  return res.json({ votes: Number(votes), alreadyVoted: !added });
}
