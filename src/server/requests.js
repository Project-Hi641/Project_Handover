// src/server/requests.js
// Lists/creates approval requests.
// - GET  : Admins see all pending; non-admins only see their own (by uid/type).
// - POST : Any authenticated user can create a request for their own uid.
// Types supported: "signup" | "email_change" | "account_delete"
// Side effect: creating "account_delete" will DISABLE the Firebase user immediately.

import { getDb, requireAdmin } from "../../api/admin/_util.js";
import { getAdminAuth } from "../../api/lib/firebaseAdmin.js";
import { ObjectId } from "mongodb";

// Verify the caller's ID token → returns uid or null
async function getCallerUid(req) {
  try {
    const authz = req.headers.authorization || "";
    if (!authz.startsWith("Bearer ")) return null;
    const token = authz.slice(7);
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded?.uid || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // We branch by method:
  // - GET : admins → all pending; non-admins → only their own (for banners).
  // - POST: authenticated user → can create request for self only.

  if (req.method === "GET") {
    // Try admin first (silent so non-admins don’t get auto 403)
    const isAdmin = await requireAdmin(req, res, { silent: true });
    try {
      const db = await getDb();
      const col = db.collection("requests");
      const { uid = "", type = "" } = req.query;

      if (isAdmin) {
        // Admin view
        const q = { status: "pending" };
        if (uid) q.uid = String(uid);
        if (type) q.type = type;

        const docs = await col.find(q).sort({ createdAt: -1 }).limit(500).toArray();

        // Bulk attach names for nicer UI
        const uids = [...new Set(docs.map(d => d.uid).filter(Boolean))];
        const usersById = uids.length
          ? Object.fromEntries(
              (await db.collection("users")
                .find({ _id: { $in: uids } }, { projection: { displayName: 1, firstName: 1, lastName: 1 } })
                .toArray()
              ).map(u => [u._id, u])
            )
          : {};

        const signup = [];
        const emailChange = [];
        const accountDelete = [];
        for (const d of docs) {
          const name =
            usersById[d.uid]?.displayName ||
            [usersById[d.uid]?.firstName, usersById[d.uid]?.lastName].filter(Boolean).join(" ") ||
            d.displayName || "";

          if (d.type === "signup") {
            signup.push({
              id: String(d._id),
              uid: d.uid || null,
              email: d.email || "",
              displayName: name,
              firstName: d.firstName || "",
              lastName: d.lastName || "",
              createdAt: d.createdAt || new Date(),
            });
          } else if (d.type === "email_change") {
            emailChange.push({
              id: String(d._id),
              uid: d.uid || null,
              oldEmail: d.oldEmail || "",
              newEmail: d.newEmail || "",
              displayName: name,
              createdAt: d.createdAt || new Date(),
            });
          } else if (d.type === "account_delete") {
            accountDelete.push({
              id: String(d._id),
              uid: d.uid || null,
              reason: d.reason || "",
              displayName: name,
              createdAt: d.createdAt || new Date(),
            });
          }
        }
        return res.status(200).json({ signup, emailChange, accountDelete });
      }

      // Non-admin GET: only allow caller to see their own pending entries (banner use)
      const callerUid = await getCallerUid(req);
      if (!callerUid) return res.status(401).json({ error: "Unauthorised" });

      const filter = { status: "pending", uid: callerUid };
      if (type) filter.type = type;

      const docs = await col.find(filter).sort({ createdAt: -1 }).limit(50).toArray();
      // Minimal payload for non-admins
      return res.status(200).json(
        docs.map((d) => ({
          id: String(d._id),
          type: d.type,
          uid: d.uid,
          oldEmail: d.oldEmail || null,
          newEmail: d.newEmail || null,
          reason: d.reason || null,
          createdAt: d.createdAt,
          status: d.status,
        }))
      );
    } catch (e) {
      console.error("requests GET error:", e);
      return res.status(500).json({ error: e.message || "Failed to load requests" });
    }
  }

  if (req.method === "POST") {
    // Authenticated user can create request (for their own uid only)
    try {
      const callerUid = await getCallerUid(req);
      if (!callerUid) return res.status(401).json({ error: "Unauthorised" });

      const body = req.body || {};
      const type = body.type;
      if (!type) return res.status(400).json({ error: "type required" });

      const db = await getDb();
      const col = db.collection("requests");

      // Only allow creating a request for self
      if (!body.uid || body.uid !== callerUid) {
        return res.status(403).json({ error: "Cannot create requests for a different uid" });
      }

      // Prevent duplicate pending of same type
      const existing = await col.findOne({ uid: body.uid, type, status: "pending" });
      if (existing) {
        return res.status(200).json({ ok: true, duplicate: true, id: String(existing._id) });
      }

      const doc = {
        type,               // "signup" | "email_change" | "account_delete"
        uid: body.uid,
        status: "pending",
        createdAt: new Date(body.createdAt || Date.now()),
      };

      if (type === "signup") {
        doc.email = body.email || "";
        doc.displayName = body.displayName || "";
        doc.firstName = body.firstName || "";
        doc.lastName = body.lastName || "";
      } else if (type === "email_change") {
        doc.oldEmail = body.oldEmail || "";
        doc.newEmail = (body.newEmail || "").toLowerCase();
        if (!doc.newEmail) return res.status(400).json({ error: "newEmail required" });
      } else if (type === "account_delete") {
        doc.reason = body.reason || "";
      } else {
        return res.status(400).json({ error: "Unsupported type" });
      }

      const r = await col.insertOne(doc);

      // Side-effect for account_delete: disable the user immediately so they’re logged out
      if (type === "account_delete") {
        try {
          const adminAuth = getAdminAuth();
          await adminAuth.updateUser(body.uid, { disabled: true });
        } catch (e) {
          console.error("disable on account_delete request failed:", e);
        }
      }

      return res.status(201).json({ ok: true, id: String(r.insertedId) });
    } catch (e) {
      console.error("requests POST error:", e);
      return res.status(500).json({ error: e.message || "Create request failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
