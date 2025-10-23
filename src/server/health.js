import { getDb, requireAdmin } from "../../api/admin/_util.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    const db = await getDb();
    const col = db.collection("health_data");

    const { uid, type, from, to, limit = "200" } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 200, 2000);

    const filter = {};
    if (uid) filter["meta.uid"] = String(uid);
    if (type) filter.type = String(type);
    if (from || to) {
      filter.ts = {};
      if (from) filter.ts.$gte = new Date(from);
      if (to) filter.ts.$lte = new Date(to);
    }

    const items = await col.find(filter).sort({ ts: -1 }).limit(lim).toArray();
    return res.status(200).json({ count: items.length, items });
  }

  if (req.method === "POST") {
    // Ingest a new health event (useful for testing)
    const db = await getDb();
    const col = db.collection("health_data");
    const body = req.body || {};

    // minimal validation
    if (!body.meta?.uid) return res.status(400).json({ error: "meta.uid required" });
    if (!body.ts) body.ts = new Date().toISOString();

    await col.insertOne(body);
    return res.status(201).json({ ok: true });
  }

  res.setHeader("Allow", "GET,POST");
  res.status(405).json({ error: "Method not allowed" });
}
