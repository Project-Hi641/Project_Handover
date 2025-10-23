// api/admin/dupes.js
import { getDb, requireAdmin } from "../../api/admin/_util.js";
import { ObjectId } from "mongodb";

function toBool(x) { return x === true || x === "true" || x === "1"; }

export default async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = await getDb();
    const col = db.collection("health_data");

    // Optional narrow date window: ?from=ISO&to=ISO (faster)
    const { from, to, limit = "2000" } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 2000, 20000);

    const match = {};
    if (from || to) {
      match.ts = {};
      if (from) match.ts.$gte = new Date(from);
      if (to)   match.ts.$lte = new Date(to);
    }

    // Group by either fingerprint or (uid,type,rounded ts, unit,value,stage)
    const pipeline = [
      Object.keys(match).length ? { $match: match } : null,
      { $project: {
          _id: 1,
          fp: { $ifNull: ["$meta._fp", "$_fp"] },
          meta_uid: "$meta.uid",
          type: 1,
          ts: 1,
          unit: 1,
          value: 1,
          stage: "$payload.stage",
        } },
      { $addFields: { tsRounded: { $dateTrunc: { date: "$ts", unit: "second" } } } },
      { $group: {
          _id: {
            fp: "$fp",
            meta_uid: "$meta_uid",
            type: "$type",
            tsRounded: "$tsRounded",
            unit: "$unit",
            value: "$value",
            stage: "$stage",
          },
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        } },
      { $match: { count: { $gt: 1 } } },
      { $limit: lim },
    ].filter(Boolean);

    const groups = await col.aggregate(pipeline).toArray();

    if (req.method === "GET") {
      // summary only
      const totalDupes = groups.reduce((acc, g) => acc + (g.count - 1), 0);
      return res.status(200).json({
        groups: groups.length,
        duplicateDocs: totalDupes,
        samples: groups.slice(0, 10).map(g => ({ key: g._id, count: g.count, ids: g.ids.slice(0, 5) })),
      });
    }

    // POST: apply deletion of duplicates (keep oldest _id)
    const { apply = false, dryRun = false } = req.body || {};
    const really = toBool(apply) && !toBool(dryRun);

    let toDelete = [];
    for (const g of groups) {
      // keep the MIN ObjectId (oldest)
      const sorted = g.ids.map(String).sort(); // ObjectId sorts lexicographically by timestamp
      const keep = sorted[0];
      const drops = sorted.slice(1);
      toDelete.push(...drops);
    }

    // Chunk deletes to avoid long transactions/timeouts
    const CHUNK = 1000;
    let deleted = 0;

    if (really) {
      for (let i = 0; i < toDelete.length; i += CHUNK) {
        const ids = toDelete.slice(i, i + CHUNK).map((s) => new ObjectId(s));
        const r = await col.deleteMany({ _id: { $in: ids } });
        deleted += r.deletedCount || 0;
      }
    }

    return res.status(200).json({
      ok: true,
      groups: groups.length,
      toDelete: toDelete.length,
      deleted: really ? deleted : 0,
      dryRun: !really,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Dupes check error" });
  }
}
