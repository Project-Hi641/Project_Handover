// _util.jsx //
import clientPromise from "../lib/mongodb.js";
import { verifyIdTokenFromHeader } from "../lib/firebaseAdmin.js";

export async function getDb() {
  const client = await clientPromise;
  return client.db("healthkit");
}

/**
 * Verify Firebase ID token, then check Mongo users.role === "admin".
 * If OK, returns { decoded, userDoc }. If not, sends 401/403 and returns null.
 */
export async function requireAdmin(req, res) {
  try {
    const authz = req.headers.authorization || "";
    if (!authz.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorised" });
      return null;
    }
    const decoded = await verifyIdTokenFromHeader(authz);
    const db = await getDb();
    const userDoc = await db
      .collection("users")
      .findOne({ _id: decoded.uid }, { projection: { role: 1 } });
    if (userDoc?.role === "admin") {
      return { decoded, userDoc };
    }
    res.status(403).json({ error: "Forbidden" });
    return null;
  } catch (e) {
    res.status(401).json({ error: "Unauthorised" });
    return null;
  }
}

/**
 * Verify Firebase ID token and ensure the user is ACTIVE.
 * - Active definition: users doc exists and active !== false
 * - Returns { uid, user, token } on success
 * - On failure: 401 (no/invalid token) or 403 (pending/inactive)
 *
 * Pass { silent: true } to avoid sending a response; function returns null instead.
 */
export async function requireActiveUser(req, res, opts = {}) {
  try {
    const authz = req.headers.authorization || "";
    if (!authz.startsWith("Bearer ")) {
      if (opts.silent) return null;
      res.status(401).json({ error: "Unauthorised" });
      return null;
    }
    const decoded = await verifyIdTokenFromHeader(authz);
    const uid = decoded.uid;

    const db = await getDb();
    const userDoc = await db
      .collection("users")
      .findOne(
        { _id: uid },
        { projection: { _id: 1, role: 1, active: 1, displayName: 1, email: 1 } }
      );

    // If no user doc OR explicitly inactive => treat as pending/inactive
    if (!userDoc || userDoc.active === false) {
      if (opts.silent) return null;
      res.status(403).json({ error: "Account pending approval" });
      return null;
    }

    return { uid, user: userDoc, token: decoded };
  } catch (e) {
    if (opts.silent) return null;
    res.status(401).json({ error: "Unauthorised" });
    return null;
  }
}
