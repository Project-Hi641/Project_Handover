// api/account-delete.js
import clientPromise from "./lib/mongodb.js";
import { getAdminAuth } from "./lib/firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authz = req.headers.authorization || "";
    if (!authz.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    // Verify ID token and get uid
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(authz.slice(7));
    const uid = decoded.uid;

    // 1) Delete from Mongo
    const client = await clientPromise;
    const db = client.db("healthkit");
    const users = db.collection("users");
    const result = await users.deleteOne({ _id: uid });


    // 2) Delete from Firebase Auth (Admin)
    await adminAuth.deleteUser(uid);

    return res.status(200).json({ ok: true, dbDeleted: result.deletedCount === 1 });
  } catch (e) {
    console.error("account-delete error:", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
