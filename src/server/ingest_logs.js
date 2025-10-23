// api/admin/ingest-logs.js
import { getDb, requireAdmin } from "../../api/admin/_util.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const db = await getDb();
  const col = db.collection("ingest_logs");

  const {
    uid = "",
    hasError = "",
    from = "",
    to = "",
    limit = "50",
    skip = "0",
  } = req.query;

  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const sk  = Math.max(parseInt(skip, 10) || 0, 0);

  const q = {};
  if (uid) q.uid = uid;
  if (hasError === "true") q.error = { $ne: null };
  if (hasError === "false") q.error = null;
  if (from || to) {
    q.ts = {};
    if (from) q.ts.$gte = new Date(from);
    if (to)   q.ts.$lte = new Date(to);
  }

  const items = await col.find(q).sort({ ts: -1 }).skip(sk).limit(lim).toArray();
  const total = await col.countDocuments(q);
  res.status(200).json({ total, items });
}
