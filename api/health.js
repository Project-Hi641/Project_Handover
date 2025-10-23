// GET /api/health?type=&from=&to=&limit=
// Returns ONLY the caller's data (uid from Firebase token)

import clientPromise from "./lib/mongodb.js";
import { requireDecodedUser } from "./lib/keys.js";
import { setCors, handleCorsPreflight } from "./lib/cors.js";

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  setCors(req, res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET,OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await requireDecodedUser(req);  // Bearer <idToken>
    const uid = decoded.uid;

    const { type, from, to, limit } = req.query;
    const lim = Math.min(Math.max(parseInt(limit || "200", 10) || 200, 1), 1000);

    const q = { "meta.uid": uid };
    if (type) q.type = String(type);
    if (from || to) {
      q.ts = {};
      if (from) q.ts.$gte = new Date(from);
      if (to)   q.ts.$lte = new Date(to);
    }

    const client = await clientPromise;
    const db = client.db("healthkit");
    const items = await db.collection("health_data")
      .find(q)
      .sort({ ts: -1 })
      .limit(lim)
      .toArray();

    return res.status(200).json({ items });
  } catch (e) {
    const msg = e?.message || "Unauthorised";
    const code = /unauthor/i.test(msg) ? 401 : 500;
    return res.status(code).json({ error: msg });
  }
}
