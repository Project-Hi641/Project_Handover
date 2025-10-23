// api/lib/keys.js
// Helpers for per-user API keys stored in users.apiKeys[]

import crypto from "crypto";
import clientPromise from "./mongodb.js";
import { verifyIdTokenFromHeader } from "./firebaseAdmin.js";

function requireHashSecret() {
  const s = process.env.API_KEY_HASH_SECRET;
  if (!s) throw new Error("API_KEY_HASH_SECRET is missing");
  return s;
}

/** Generate a new key: returns { id, secret, hash } */
export function generateKeyPair() {
  const id = "ak_" + crypto.randomBytes(6).toString("base64url");     // short id to index on
  const secret = crypto.randomBytes(24).toString("base64url");         // show once to user
  const hash = hashSecret(secret);
  return { id, secret, hash };
}

/** HMAC-SHA256(secret, API_KEY_HASH_SECRET) -> hex */
 export function hashSecret(secret) {
  const key = requireHashSecret();
  return crypto.createHmac("sha256", key).update(secret).digest("hex");
 }

/** Parse "X-API-Key: <id>.<secret>" → {id, secret} or null */
export function parseApiKeyHeader(header) {
  if (!header) return null;
  const raw = header.trim();
  if (!raw.includes(".")) return null;
  const [id, secret] = raw.split(".", 2);
  if (!id || !secret) return null;
  return { id, secret };
}

/**
 * Resolve API key to { uid, keyRef } or null.
 * keyRef is the matched subdocument (for label/lastUsedAt).
 */
export async function resolveApiKey(headerValue) {
  const parsed = parseApiKeyHeader(headerValue);
  if (!parsed) return null;
  const { id, secret } = parsed;
  const hash = hashSecret(secret);

  const client = await clientPromise;
  const db = client.db("healthkit");
  // Find the user doc that owns this key and key is not revoked
  const user = await db.collection("users").findOne(
    { "apiKeys.id": id, "apiKeys.revokedAt": null },
    { projection: { _id: 1, apiKeys: 1 } }
  );
  if (!user) return null;

  const keyRef = (user.apiKeys || []).find(k => k.id === id && !k.revokedAt);
  if (!keyRef || keyRef.hash !== hash) return null;

  return { uid: user._id, keyRef };
}

/** Update lastUsedAt for a key (fire and forget) */
export async function touchKeyLastUsed(uid, keyId) {
  try {
    const client = await clientPromise;
    const db = client.db("healthkit");
    await db.collection("users").updateOne(
      { _id: uid, "apiKeys.id": keyId },
      { $set: { "apiKeys.$.lastUsedAt": new Date() } }
    );
  } catch { /* ignore */ }
}

/** Require a logged-in user via Firebase token; return decoded or throw */
export async function requireDecodedUser(req) {
  const authz = req.headers.authorization || "";
  if (!authz.startsWith("Bearer ")) throw new Error("Unauthorised");
  return verifyIdTokenFromHeader(authz);
}
