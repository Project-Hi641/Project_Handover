// api/goals.js
// Save user goal to MongoDB with user _id (uid)
import clientPromise from "./lib/mongodb.js";
import { requireDecodedUser } from "./lib/keys.js";
import { setCors, handleCorsPreflight } from "./lib/cors.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  // Authenticate user
  let uid = null;
  try {
    const decoded = await requireDecodedUser(req);
    uid = decoded.uid;
  } catch (authErr) {
    console.error("[GOALS] Auth error:", authErr);
    return res.status(401).json({ error: "Unauthorised" });
  }

  const client = await clientPromise;
  const db = client.db("healthkit");
  const goalsCol = db.collection("user_goals");

  if (req.method === "POST") {
    try {
      console.log("[GOALS] Incoming request body:", req.body);
      const { goal } = req.body;
      console.log("[GOALS] Parsed goal:", goal);
      if (!goal) {
        console.error("[GOALS] Missing goal data");
        return res.status(400).json({ error: "Missing goal data" });
      }
      // Delete all previous goals for this user
      await goalsCol.deleteMany({ uid });
      // Insert new goal
      const doc = { uid, goal, createdAt: new Date() };
      console.log("[GOALS] Inserting doc:", doc);
      const result = await goalsCol.insertOne(doc);
      console.log("[GOALS] Insert result:", result);
      return res.status(200).json({ ok: true, _id: result.insertedId });
    } catch (e) {
      console.error("[GOALS] Goal save error:", e);
      return res.status(500).json({ ok: false, error: e.message || "Server error" });
    }
  } else if (req.method === "GET") {
    try {
      // Find the latest goal for this user
      const latest = await goalsCol.find({ uid }).sort({ createdAt: -1 }).limit(1).toArray();
      if (!latest.length) return res.status(404).json({ error: "No goal found" });
      return res.status(200).json({ ok: true, goal: latest[0].goal });
    } catch (e) {
      console.error("[GOALS] Goal fetch error:", e);
      return res.status(500).json({ ok: false, error: e.message || "Server error" });
    }
  } else {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
}

