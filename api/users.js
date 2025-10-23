/**
 * USERS API (Vercel Serverless, MongoDB, secured)
 * -----------------------------------------------
 * Collection: healthkit.users
 * Primary Key: `_id` (string) == Firebase `uid`
 *
 * Routes:
 *  - GET    /api/users
 *      • /api/users?id=<uid>     → fetch single user by UID (defaults to token uid if id missing)
 *      • /api/users?email=<e>    → list users by email (rare)
 *      • /api/users?limit=50     → list recent users (auth required)
 *  - POST   /api/users           → upsert current user (uid from verified token)
 *  - PATCH  /api/users?id=<uid>  → update current user (must match token uid)
 *  - DELETE /api/users?id=<uid>  → delete current user (must match token uid)
 *
 * Security:
 *  - We VERIFY Firebase ID tokens on all routes here.
 *  - We IGNORE any `uid` from the request body; we trust only the token’s uid.
 *  - Add role checks later (custom claims) if you need admin capabilities.
 */
/**
 * USERS API (MongoDB + Firebase token, with dev-friendly public GET)
 * -----------------------------------------------------------------
 * Env toggle:
 *   - PUBLIC_USERS_GET=true  → allow GET without auth (dev/preview)
 *   - (unset / false)        → GET requires auth (prod)
 *
 * PK: `_id` (string) == Firebase `uid`
 */

import clientPromise from "./lib/mongodb.js";
import { verifyIdTokenFromHeader } from "./lib/firebaseAdmin.js";

// Read once at module load. Set in Vercel → Environment Variables.
const PUBLIC_USERS_GET = process.env.PUBLIC_USERS_GET === "true";

/** Coerce a positive int from query, with a ceiling. */
function parseLimit(value, fallback = 50, max = 200) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Pick only allowed keys from an object. */
function pick(obj, allowed) {
  const out = {};
  for (const k of allowed) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db("healthkit");
  const usersCol = db.collection("users");

  // Decide auth policy: public GET (dev) or secured (prod)
  let decoded = null;
  const authz = req.headers.authorization || "";

  if (req.method === "GET" && PUBLIC_USERS_GET) {
    // Dev mode: allow GET without a token; if a token is present, decode it.
    if (authz.startsWith("Bearer ")) {
      try { decoded = await verifyIdTokenFromHeader(authz); } catch { /* ignore */ }
    }
  } else {
    // All other routes (and GET in prod) require a valid Firebase ID token
    try {
      decoded = await verifyIdTokenFromHeader(authz);
    } catch (e) {
      return res.status(401).json({ error: e.message || "Unauthorised" });
    }
  }

  try {
    switch (req.method) {
      /**
       * READ (GET)
       * ----------
       * - If id provided → fetch that user
       * - Else:
       *    • Dev (PUBLIC_USERS_GET=true): list users (limited & projected)
       *    • Prod: fetch "me" using token uid (or list with auth)
       */
      case "GET": {
      const { id, email } = req.query;

      // If a token is present, prefer returning *my* doc when no id is supplied
      if (!id && decoded?.uid) {
        const me = await usersCol.findOne({ _id: decoded.uid });
        if (!me) return res.status(404).json({ error: "User not found" });
        return res.status(200).json(me);
      }

      // Single by UID (PK) if id provided
      if (id) {
        const uid = String(id);
        const user = await usersCol.findOne({ _id: uid });
        if (!user) return res.status(404).json({ error: "User not found" });
        return res.status(200).json(user);
      }

      // No token or no id → dev-only list (when PUBLIC_USERS_GET=true)
      if (PUBLIC_USERS_GET) {
        const limit = parseLimit(req.query.limit, 25, 50);
        const filter = {};
        if (email) filter.email = String(email).toLowerCase().trim();

        const projection = { _id: 1, email: 1, displayName: 1, role: 1, updatedAt: 1 };
        const docs = await usersCol
          .find(filter, { projection })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .toArray();

        return res.status(200).json(docs);
      }

      // Prod fallback if somehow we got here
      return res.status(400).json({ error: "id required" });
      }

      /**
       * CREATE/UPSERT (POST)
       * --------------------
       * Body: { email: string, role?: "user"|"admin", displayName?: string, photoURL?: string }
       * Uses uid from verified token; ignores any uid in body.
       */
      case "POST": {
      const {
        email,
        role = "user",
        displayName = null,
        photoURL = null,
        // extra fields from signup / first-time profile
        firstName = null,
        lastName = null,
        address = null,
        dob = null,
        gender = null,
        phone = null,
        notes = null,
      } = req.body || {};

      if (!email) return res.status(400).json({ error: "email required" });

      const now = new Date();
      const uid = decoded.uid;
      const normEmail = String(email).toLowerCase().trim();

      const filter = { _id: uid };
      const update = {
        $setOnInsert: { _id: uid, createdAt: now },
        $set: {
          email: normEmail,
          role,
          displayName,
          photoURL,
          firstName,
          lastName,
          address,
          dob,
          gender,
          phone,
          notes,
          updatedAt: now,
        },
      };

      await usersCol.updateOne(filter, update, { upsert: true });
      const doc = await usersCol.findOne(filter);
      return res.status(201).json(doc);

      }

      /**
       * UPDATE (PATCH)
       * --------------
       * Query:  ?id=<uid>  (must match token uid unless you add admin logic)
       * Body:   { email?, role?, displayName?, photoURL? }
       */
      case "PATCH": {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id (uid) required" });
        if (decoded.uid !== String(id)) return res.status(403).json({ error: "Forbidden" });

        const allowed = [
          "email", "role", "displayName", "photoURL",
          "firstName", "lastName", "address", "dob", "gender", "phone", "notes"
        ];
        const updateInput = pick(req.body || {}, allowed);
        if (!Object.keys(updateInput).length) {
          return res.status(400).json({ error: "Nothing to update" });
        }
        if (updateInput.email) {
          updateInput.email = String(updateInput.email).toLowerCase().trim();
        }

        const now = new Date();
        await usersCol.updateOne(
          { _id: String(id) },
          { $setOnInsert: { _id: String(id), createdAt: now }, $set: { ...updateInput, updatedAt: now } },
          { upsert: true }
        );

        // Always fetch the canonical doc to return JSON
        const doc = await usersCol.findOne({ _id: String(id) });
        if (!doc) return res.status(404).json({ error: "User not found" });
        return res.status(200).json(doc);
      }


      /**
       * DELETE
       * ------
       * Query: ?id=<uid> (must match token uid)
       */
      case "DELETE": {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "id (uid) required" });
        if (decoded.uid !== String(id)) return res.status(403).json({ error: "Forbidden" });

        const result = await usersCol.deleteOne({ _id: String(id) });
        return res.status(200).json({ ok: result.deletedCount === 1 });
      }

      default: {
        res.setHeader("Allow", "GET,POST,PATCH,DELETE");
        return res.status(405).json({ error: "Method not allowed" });
      }
    }
  } catch (err) {
    console.error("API /users error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
