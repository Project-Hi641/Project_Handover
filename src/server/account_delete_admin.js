// src/server/account_delete_admin.js
// Admin-only delete of arbitrary user UID.
// Deletes Mongo user doc; optionally purge data (commented).
// Also deletes Firebase Auth user.
import { getDb, requireAdmin } from "../../api/admin/_util.js";
import { getAdminAuth } from "../../api/lib/firebaseAdmin.js";

export default async function handler(req, res) {
  const adminOk = await requireAdmin(req, res);
  if (!adminOk) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid required" });

    const db = await getDb();
    const usersCol = db.collection("users");

    // 1) Mongo user doc
    const r = await usersCol.deleteOne({ _id: uid });

    // 2) (Optional) Purge user data — uncomment if you want hard deletes
    // await db.collection("health_data").deleteMany({ "meta.uid": uid });
    // await db.collection("ingest_guard").deleteMany({ uid });
    // await db.collection("ingest_logs").deleteMany({ uid });

    // 3) Firebase Auth
    const adminAuth = getAdminAuth();
    await adminAuth.deleteUser(uid);

    res.status(200).json({ ok: true, dbDeleted: r.deletedCount === 1 });
  } catch (e) {
    console.error("admin account-delete error:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
