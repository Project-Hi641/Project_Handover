// api/integrations/shortcut/keys-revoke.js
// POST { id } → set revokedAt now

import clientPromise from "../../lib/mongodb.js";
import { requireDecodedUser } from "../../lib/keys.js";
import { setCors, handleCorsPreflight } from "../../lib/cors.js"; 

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return; // replies to OPTIONS 204
  setCors(req, res); // sets headers for the actual request
  const ALLOW_ORIGIN = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let decoded;
  try { decoded = await requireDecodedUser(req); }
  catch { return res.status(401).json({ error: "Unauthorised" }); }

  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "id required" });

  const client = await clientPromise;
  const db = client.db("healthkit");
  const users = db.collection("users");

  const result = await users.updateOne(
    { _id: decoded.uid, "apiKeys.id": id, "apiKeys.revokedAt": null },
    { $set: { "apiKeys.$.revokedAt": new Date() } }
  );

  return res.status(200).json({ ok: result.modifiedCount === 1 });
}
