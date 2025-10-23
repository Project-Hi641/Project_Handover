// src/server/requests_approve.js
// Approves "signup" | "email_change" | "account_delete" and ALWAYS returns JSON.
import { getDb, requireAdmin } from "../../api/admin/_util.js";
import { getAdminAuth } from "../../api/lib/firebaseAdmin.js";
import { ObjectId } from "mongodb";

function safeObjectId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

export default async function handler(req, res) {
  const adminOk = await requireAdmin(req, res);
  if (!adminOk) return; // requireAdmin already responded

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { kind, id, uid } = req.body || {};
    if (!kind) return res.status(400).json({ error: "kind required" });

    const db = await getDb();
    const reqCol = db.collection("requests");
    const users  = db.collection("users");
    const adminAuth = getAdminAuth();

    // Load the pending request
    let q = { status: "pending" };
    if (id) {
      const _id = safeObjectId(id);
      if (!_id) return res.status(400).json({ error: "invalid id" });
      q._id = _id;
    } else if (uid) {
      q.uid = String(uid);
      q.type =
        kind === "signup" ? "signup" :
        kind === "emailChange" || kind === "email_change" ? "email_change" :
        kind === "accountDelete" || kind === "account_delete" ? "account_delete" :
        kind;
    } else {
      return res.status(400).json({ error: "id or uid required" });
    }

    const reqDoc = await reqCol.findOne(q);
    if (!reqDoc) return res.status(404).json({ error: "Request not found or not pending" });

    if (reqDoc.type === "signup" && (kind === "signup" || kind === "Signup")) {
      // Ensure/activate user doc
      const existing = await users.findOne({ _id: reqDoc.uid });
      if (!existing) {
        await users.insertOne({
          _id: reqDoc.uid,
          email: reqDoc.email || "",
          displayName: reqDoc.displayName || "",
          firstName: reqDoc.firstName || "",
          lastName:  reqDoc.lastName  || "",
          role: "user",
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        await users.updateOne(
          { _id: reqDoc.uid },
          { $set: { active: true, updatedAt: new Date() }, $setOnInsert: { role: "user" } },
        );
      }

      await reqCol.updateOne({ _id: reqDoc._id }, { $set: { status: "approved", resolvedAt: new Date() } });
      return res.status(200).json({ ok: true, kind: "signup", uid: reqDoc.uid });

    } else if (reqDoc.type === "email_change" && (kind === "emailChange" || kind === "email_change")) {
      const targetUid = reqDoc.uid;
      const newEmail  = (reqDoc.newEmail || "").toLowerCase();
      if (!targetUid || !newEmail) return res.status(400).json({ error: "Malformed email_change request" });

      // 1) Firebase auth email
      await adminAuth.updateUser(targetUid, { email: newEmail });

      // 2) Mongo users
      await users.updateOne(
        { _id: targetUid },
        { $set: { email: newEmail, updatedAt: new Date() } }
      );

      // 3) Mark request done
      await reqCol.updateOne({ _id: reqDoc._id }, { $set: { status: "approved", resolvedAt: new Date() } });

      return res.status(200).json({ ok: true, kind: "email_change", uid: targetUid, newEmail });

    } else if (reqDoc.type === "account_delete" && (kind === "accountDelete" || kind === "account_delete")) {
      const targetUid = reqDoc.uid;
      if (!targetUid) return res.status(400).json({ error: "Malformed account_delete request" });

      // 1) Delete Mongo user
      await users.deleteOne({ _id: targetUid });

      // 2) (Optional) purge user data — uncomment if you want hard deletes
      // const db2 = await getDb();
      // await db2.collection("health_data").deleteMany({ "meta.uid": targetUid });
      // await db2.collection("ingest_guard").deleteMany({ uid: targetUid });
      // await db2.collection("ingest_logs").deleteMany({ uid: targetUid });

      // 3) Delete Firebase Auth user (even if already disabled)
      await adminAuth.deleteUser(targetUid);

      await reqCol.updateOne({ _id: reqDoc._id }, { $set: { status: "approved", resolvedAt: new Date() } });
      return res.status(200).json({ ok: true, kind: "account_delete", uid: targetUid });
    }

    return res.status(400).json({ error: "kind does not match request type" });
  } catch (e) {
    console.error("requests approve error:", e);
    return res.status(500).json({ error: e.message || "Approve failed" });
  }
}
