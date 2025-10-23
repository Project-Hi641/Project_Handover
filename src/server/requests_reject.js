// src/server/requests_reject.js
// Marks pending request as rejected with optional reason.
// If rejecting "account_delete", re-enables the user in Firebase.
import { getDb, requireAdmin } from "../../api/admin/_util.js";
import { ObjectId } from "mongodb";
import { getAdminAuth } from "../../api/lib/firebaseAdmin.js";

function safeObjectId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

export default async function handler(req, res) {
  const adminOk = await requireAdmin(req, res);
  if (!adminOk) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { kind, id, uid, reason = "" } = req.body || {};
    if (!kind) return res.status(400).json({ error: "kind required" });

    const db = await getDb();
    const reqCol = db.collection("requests");

    let q = { status: "pending" };
    if (id) {
      const _id = safeObjectId(id);
      if (!_id) return res.status(400).json({ error: "invalid id" });
      q._id = _id;
    }
    if (uid) q.uid = String(uid);
    if (kind === "signup") q.type = "signup";
    if (kind === "emailChange" || kind === "email_change") q.type = "email_change";
    if (kind === "accountDelete" || kind === "account_delete") q.type = "account_delete";

    const r = await reqCol.updateOne(q, {
      $set: { status: "rejected", reason: reason || null, resolvedAt: new Date() }
    });

    if (!r.matchedCount) return res.status(404).json({ error: "Request not found or not pending" });

    // If rejecting account_delete → re-enable the user in Firebase
    if (q.type === "account_delete") {
      try {
        const adminAuth = getAdminAuth();
        let targetUid = uid;
        if (!targetUid && q._id) {
          const doc = await reqCol.findOne({ _id: q._id });
          targetUid = doc?.uid;
        }
        if (targetUid) await adminAuth.updateUser(targetUid, { disabled: false });
      } catch (e) {
        console.error("re-enable on reject failed:", e);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("requests reject error:", e);
    return res.status(500).json({ error: e.message || "Reject failed" });
  }
}
