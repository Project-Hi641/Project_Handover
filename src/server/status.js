// api/admin/status.js
import { getDb, requireAdmin } from "../../api/admin/_util.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  try {
    const db = await getDb();
    const dataCol  = db.collection("health_data");
    const guardCol = db.collection("ingest_guard");
    const logsCol  = db.collection("ingest_logs");

    // index (no-op if already exists)
    await logsCol.createIndex({ ts: -1 }).catch(() => {});

    const now = new Date();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [hd, ig, ok24, fail24] = await Promise.all([
      dataCol.estimatedDocumentCount(),
      guardCol.estimatedDocumentCount(),
      logsCol.countDocuments({ error: null, ts: { $gte: dayAgo } }),
      logsCol.countDocuments({ error: { $ne: null }, ts: { $gte: dayAgo } }),
    ]);

    // last ingest doc (any type)
    const lastIngest = await dataCol
      .find({}, { projection: { ts: 1, type: 1, meta: 1 } })
      .sort({ ts: -1 })
      .limit(1)
      .next();

    // recent logs (normalize to your UI shape)
    const recent = await logsCol
      .find({}, { projection: { ts: 1, uid: 1, attempted: 1, inserted: 1, byType: 1, error: 1 } })
      .sort({ ts: -1 })
      .limit(50)
      .toArray();

    const recentLogs = recent.map(r => ({
      _id: r._id,
      at: r.ts,
      uid: r.uid || null,
      ok: !r.error,
      inserted: r.inserted ?? null,
      byType: r.byType ?? null,
      error: r.error ?? null,
    }));

    return res.status(200).json({
      now: now.toISOString(),
      counts: {
        health_data: hd,
        ingest_guard: ig,
        logs_24h_ok: ok24,
        logs_24h_fail: fail24,
      },
      lastIngest: lastIngest || null,
      recentLogs,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "status failed" });
  }
}
