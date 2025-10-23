// api/admin/ping.js
import { getDb, requireAdmin } from "../../api/admin/_util.js";

export default async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  try {
    const db = await getDb();
    // Simple ping (also returns cluster time)
    const admin = db.admin ? db.admin() : null;
    if (admin && admin.ping) await admin.ping();
    return res.status(200).json({ ok: true, now: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Ping failed" });
  }
}
