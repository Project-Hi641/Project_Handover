/**
 * MongoDB Connection Helper
 * -------------------------
 * - Uses MongoClient to connect to MongoDB Atlas (via MONGODB_URI in .env).
 * - Uses a cached `clientPromise` so serverless functions don't reconnect on every call.
 * - Exports the promise so other API routes can `await clientPromise` to get a db handle.
 */

import { MongoClient } from "mongodb";

// Grab connection string from environment variables
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI in environment variables");

// These vars will hold the connection across calls
let client;
let clientPromise;

// Dev mode: reuse a single client across hot reloads
if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, {
      serverApi: { version: '1', strict: true, deprecationErrors: true },
    });
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
   // Prod mode: create a new client each cold start (safe in Vercel)
  client = new MongoClient(uri, {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
  });
  clientPromise = client.connect();
}

export default clientPromise;
