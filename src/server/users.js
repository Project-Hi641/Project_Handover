import { getDb, requireAdmin } from "../../api/admin/_util.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const db = await getDb();
  const col = db.collection("users");

  const { query = "", limit = "25", skip = "0" } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 25, 200);
  const sk = Math.max(parseInt(skip, 10) || 0, 0);

  const q = query.trim();
  const filter = q
    ? {
        $or: [
          { email: new RegExp(q, "i") },
          { displayName: new RegExp(q, "i") },
          { firstName: new RegExp(q, "i") },
          { lastName: new RegExp(q, "i") },
          { _id: q } // exact uid match
        ]
      }
    : {};

  const docs = await col.find(filter).sort({ updatedAt: -1 }).skip(sk).limit(lim).toArray();
  const total = await col.countDocuments(filter);
  res.status(200).json({ total, items: docs });
}
