/**
 * Firebase Admin initialiser for server-side token verification.
 * - Requires env var FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON)
 * - Used by API routes to verify Authorization: Bearer <idToken>
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getAuth as _getAuth } from "firebase-admin/auth";


let app;
export function getFirebaseApp() {
  if (getApps().length) return getApp();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  const credentials = cert(JSON.parse(json));
  return initializeApp({ credential: credentials });
}

export function getAdminAuth() {
  const appInstance = app ?? (app = getFirebaseApp());
  return _getAuth(appInstance);
}

/** Verify a Firebase ID token and return the decoded claims or throw. */
export async function verifyIdTokenFromHeader(authorization) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const idToken = authorization.slice(7);
  const adminAuth = getAdminAuth();
  // Verifies signature, issuer, audience, expiry etc.
  return adminAuth.verifyIdToken(idToken);
}
