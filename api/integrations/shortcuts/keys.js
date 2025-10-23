// api/integrations/shortcut/keys.js
// GET  → list keys (no secrets)
// POST → create a key (returns id.secret ONCE)

import clientPromise from "../../lib/mongodb.js";
import { requireDecodedUser } from "../../lib/keys.js";
import { generateKeyPair } from "../../lib/keys.js";
import { setCors, handleCorsPreflight } from "../../lib/cors.js"; 

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return; // replies to OPTIONS 204
  setCors(req, res); // sets headers for the actual request
  const ALLOW_ORIGIN = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  let decoded;
  try { decoded = await requireDecodedUser(req); }
  catch { return res.status(401).json({ error: "Unauthorised" }); }

  const client = await clientPromise;
  const db = client.db("healthkit");
  const users = db.collection("users");

  if (req.method === "GET") {
    const me = await users.findOne(
      { _id: decoded.uid },
      { projection: { apiKeys: 1 } }
    );
    const items = (me?.apiKeys || []).map(k => ({
      id: k.id,
      label: k.label || null,
      createdAt: k.createdAt || null,
      lastUsedAt: k.lastUsedAt || null,
      revokedAt: k.revokedAt || null,
    }));
    return res.status(200).json({ items });
  }

  if (req.method === "POST") {
    const label = String(req.body?.label || "").trim() || null;

    const { id, secret, hash } = generateKeyPair();
    const keyDoc = { id, hash, label, createdAt: new Date(), lastUsedAt: null, revokedAt: null };

    await users.updateOne(
      { _id: decoded.uid },
      { $push: { apiKeys: keyDoc }, $setOnInsert: { _id: decoded.uid, createdAt: new Date() } },
      { upsert: true }
    );

    // Return the ONE-TIME plaintext to show/copy into the Shortcut
    return res.status(201).json({ key: `${id}.${secret}`, id, label });
  }

  res.setHeader("Allow", "GET,POST,OPTIONS");
  return res.status(405).json({ error: "Method not allowed" });
}
