// api/upload.js
// Ingest Apple Shortcut payload → parse → write to Mongo time-series `health_data`.
// Idempotent via a stable fingerprint stored at meta._fp.
// EXTRA: coalesce steps per local-hour (take MAX) to avoid source overlap inflation.
// NOW: logs EVERY outcome to ingest_logs (200 / 204(no samples) / 401 / 413 / 500)

import crypto from "crypto";
import clientPromise from "./lib/mongodb.js";
import { requireDecodedUser, resolveApiKey, touchKeyLastUsed } from "./lib/keys.js";
import { setCors, handleCorsPreflight } from "./lib/cors.js";
import { fromZonedTime } from "date-fns-tz";
import { parse } from "date-fns";

// ---------- small utils ----------
const safeJson = (x) => { try { return JSON.stringify(x); } catch { return String(x); } };

// ---------- parsing helpers ----------
function cleanDateString(str = "") {
  return String(str || "").replace(/\u202f/g, " ").replace(/\u00a0/g, " ");
}
function toLines(x) {
  if (Array.isArray(x)) return x.map(String);
  const s = String(x ?? "").trim();
  return s ? s.split("\n") : [];
}
const DATE_FORMATS = ["d MMM yyyy',' h:mm a", "d MMM yyyy 'at' h:mm a"];
function parseBrisbaneIso(input) {
  const s = cleanDateString(input).trim();
  if (!s) return null;
  let parsed = null;
  for (const fmt of DATE_FORMATS) {
    const t = parse(s, fmt, new Date());
    if (!isNaN(t.getTime())) { parsed = t; break; }
  }
  if (!parsed) {
    const t2 = new Date(s);
    if (!isNaN(t2.getTime())) parsed = t2;
  }
  if (!parsed) return null;
  const utc = fromZonedTime(parsed, "Australia/Brisbane");
  return isNaN(utc.getTime()) ? null : utc.toISOString();
}
// duration → minutes
function toMinutes(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const n = Number(s);
  if (!Number.isNaN(n)) return n;
  const colon = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (colon) {
    const hasSeconds = colon[3] != null;
    const h = hasSeconds ? parseInt(colon[1], 10) : 0;
    const m = hasSeconds ? parseInt(colon[2], 10) : parseInt(colon[1], 10);
    const sec = parseInt(colon[3] ?? colon[2], 10) % 60;
    return Math.round(h * 60 + m + sec / 60);
  }
  let h = 0, m = 0;
  const hr = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/i);
  const mn = s.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/i);
  if (hr) h = parseFloat(hr[1]);
  if (mn) m = parseFloat(mn[1]);
  if (h || m) return Math.round(h * 60 + m);
  const iso = s.match(/^P?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?$/i);
  if (iso) return Math.round((parseFloat(iso[1] || 0) * 60) + parseFloat(iso[2] || 0));
  return null;
}
function parseEntriesPlus(timestampsIn, valuesIn) {
  const timestamps = toLines(timestampsIn).map((ts) => parseBrisbaneIso(ts));
  const values = toLines(valuesIn).map((v) => (v === "" ? null : Number(v)));
  return timestamps
    .map((t, i) => (t ? { timestamp: t, value: values[i] } : null))
    .filter(Boolean);
}
function getSeries(raw, key) {
  const obj = raw?.[key] ?? {};
  const ts = obj["timestamps "] ?? obj["timestamps"] ?? "";
  const vals = obj.values ?? "";
  return parseEntriesPlus(ts, vals);
}
function getSleepSeries(raw) {
  const obj = raw?.sleep ?? {};
  const tsArr  = toLines(obj["timestamps "] ?? obj["timestamps"] ?? "").map((ts) => parseBrisbaneIso(ts));
  const valArr = toLines(obj.values ?? "");
  const durArr = toLines(obj.duration ?? "");
  return tsArr
    .map((t, i) => (t ? { timestamp: t, value: valArr[i] ?? null, duration: durArr[i] ?? null } : null))
    .filter(Boolean);
}
function parseHealthData(raw = {}) {
  const heart = getSeries(raw, "heart");
  const steps = getSeries(raw, "steps");
  const sleep = getSleepSeries(raw);
  const walkingSpeed            = getSeries(raw, "walkingSpeed");
  const walkingAsymmetry        = getSeries(raw, "walkingAsymmetry");
  const walkingSteadiness       = getSeries(raw, "walkingSteadiness");
  const doubleSupportTime       = getSeries(raw, "doubleSupportTime");
  const walkingStepLength       = getSeries(raw, "walkingStepLength");
  const heartRateVariability    = getSeries(raw, "heartRateVariability");
  const restingHeartRate        = getSeries(raw, "restingHeartRate");
  const walkingHeartRateAverage = getSeries(raw, "walkingHeartRateAverage");
  const activeEnergy            = getSeries(raw, "activeEnergy");
  const restingEnergy           = getSeries(raw, "restingEnergy");
  const standMinutes            = getSeries(raw, "standMinutes");
  const date = parseBrisbaneIso(String(raw?.date ?? ""));
  return {
    date, heart, steps, sleep,
    walkingSpeed, walkingAsymmetry, walkingSteadiness, doubleSupportTime, walkingStepLength,
    heartRateVariability, restingHeartRate, walkingHeartRateAverage,
    activeEnergy, restingEnergy, standMinutes,
  };
}

// ---------- idempotency helpers ----------
function roundTs(ts, granularity = "second") {
  const d = new Date(ts);
  const t = d.getTime();
  switch (granularity) {
    case "minute": return new Date(Math.floor(t / 60000) * 60000).toISOString();
    case "second":
    default:       return new Date(Math.floor(t / 1000) * 1000).toISOString();
  }
}
function normNumber(x) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}
function fingerprint(doc) {
  const base = {
    uid: doc?.meta?.uid ?? null,
    type: doc?.type ?? null,
    unit: doc?.unit ?? null,
    device: doc?.meta?.device ?? null,
  };
  const tsRounded = roundTs(
    doc.ts,
    doc.type === "steps" ? "minute"
      : doc.type === "sleep" ? "minute"
      : "second"
  );
  const fpObj = { ...base, ts: tsRounded, value: normNumber(doc?.value) };
  if (doc.type === "sleep") fpObj.stage = doc?.payload?.stage ?? null;
  const s = JSON.stringify(fpObj);
  return crypto.createHash("sha256").update(s).digest("hex");
}

// ---- bucketing helper (AEST only; QLD has no DST) ----
function minuteBucketISO(tsISO, minutes = 60 /* local minutes */) {
  const UTC_MS = new Date(tsISO).getTime();
  const OFFSET_MS = 10 * 60 * 60 * 1000; // AEST (UTC+10), no DST in Queensland
  const localMs   = UTC_MS + OFFSET_MS;
  const slotMs    = Math.max(1, Math.floor(minutes)) * 60 * 1000;
  const bucketLocalMs = Math.floor(localMs / slotMs) * slotMs;
  const bucketUtcMs   = bucketLocalMs - OFFSET_MS;
  return new Date(bucketUtcMs).toISOString();
}

// ---------- build docs ----------
function buildDocs(cleaned, uid) {
  const docs = [];
  const pushDoc = (d) => { d.meta._fp = fingerprint(d); docs.push(d); };
  for (const h of cleaned.heart || []) {
    if (!h.timestamp) continue;
    pushDoc({ ts: new Date(h.timestamp), type: "heart_rate", value: typeof h.value === "number" ? h.value : null, unit: "bpm", meta: { uid, source: "shortcut", device: null }, payload: null });
  }
  for (const s of cleaned.steps || []) {
    if (!s.timestamp) continue;
    pushDoc({ ts: new Date(s.timestamp), type: "steps", value: typeof s.value === "number" ? s.value : null, unit: "count", meta: { uid, source: "shortcut", device: null }, payload: null });
  }
  for (const sl of cleaned.sleep || []) {
    if (!sl.timestamp) continue;
    let minutes = toMinutes(sl.value);
    let stage = null;
    if (minutes == null && typeof sl.value === "string") stage = sl.value;
    if (minutes == null) minutes = toMinutes(sl.duration);
    const payload = (stage || sl.duration != null)
      ? { ...(stage ? { stage } : {}), ...(sl.duration != null ? { duration_str: String(sl.duration) } : {}) }
      : null;
    pushDoc({ ts: new Date(sl.timestamp), type: "sleep", value: minutes, unit: "min", meta: { uid, source: "shortcut", device: null }, payload });
  }
  const extras = [
    ["walkingSpeed", "walking_speed", "km/h"],
    ["walkingAsymmetry", "walking_asymmetry", "%"],
    ["walkingSteadiness", "walking_steadiness", "%"],
    ["doubleSupportTime", "double_support_time", "%"],
    ["walkingStepLength", "walking_step_length", "cm"],
    ["heartRateVariability", "heart_rate_variability", "ms"],
    ["restingHeartRate", "resting_heart_rate", "bpm"],
    ["walkingHeartRateAverage", "walking_heart_rate_average", "bpm"],
    ["activeEnergy", "active_energy", "kJ"],
    ["restingEnergy", "resting_energy", "kJ"],
    ["standMinutes", "stand_minutes", "mins"],
  ];
  for (const [key, type, unit] of extras) {
    for (const it of cleaned[key] || []) {
      if (!it.timestamp) continue;
      pushDoc({ ts: new Date(it.timestamp), type, value: Number(it.value) ?? null, unit, meta: { uid, source: "shortcut", device: null }, payload: null });
    }
  }
  return docs.filter((d) => d.ts instanceof Date && !Number.isNaN(d.ts.getTime()));
}

// ---------- steps coalescing ----------
function coalesceStepsByBucket(docs) {
  const BUCKET_MIN = Number(process.env.COALESCE_STEPS_MIN || 60);
  const steps = [], others = [];
  for (const d of docs) (d?.type === "steps" && d?.ts && d?.value != null ? steps : others).push(d);
  if (!steps.length) return docs;
  const buckets = new Map(); // key -> doc
  for (const d of steps) {
    const bucketISO = minuteBucketISO(d.ts, BUCKET_MIN);
    const key = `${d.meta?.uid || ""}|${bucketISO}|${d.unit || ""}`;
    const prev = buckets.get(key);
    if (!prev || (Number(d.value) > Number(prev.value))) {
      const canon = { ...d, ts: new Date(bucketISO) };
      buckets.set(key, canon);
    }
  }
  const coalesced = [];
  for (const v of buckets.values()) {
    v.meta = v.meta || {};
    v.meta._fp = fingerprint(v); // recompute fp after changing ts
    coalesced.push(v);
  }
  const out = [...others, ...coalesced];
  out.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return out;
}

// ---------- API config (bumped so handler runs and can log 413) ----------
export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

// ---------- handler ----------
export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  setCors(req, res);

  const t0 = Date.now();
  const ALLOW_ORIGIN = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // helper: write a log row (best-effort)
  async function logIngest({
    uid = null, ok = false, status = null, error = null,
    attempted = null, inserted = 0, byType = null, durationMs = null, source = "shortcut"
  }) {
    try {
      const client = await clientPromise;
      const db = client.db("healthkit");
      const logsCol = db.collection("ingest_logs");
      await logsCol.createIndex({ ts: -1 }).catch(() => {});
      await logsCol.createIndex({ uid: 1, ts: -1 }).catch(() => {});
      await logsCol.createIndex({ error: 1, ts: -1 }).catch(() => {});
      await logsCol.insertOne({
        ts: new Date(), uid, source, ok, status,
        attempted, inserted, byType, durationMs,
        error: error ? (typeof error === "string" ? error : safeJson(error)) : null,
      });
    } catch { /* swallow */ }
  }

  let uid = null, keyInfo = null;
  try { const decoded = await requireDecodedUser(req); uid = decoded?.uid || null; } catch {}
  if (!uid) {
    const apiKeyHeader = req.headers["x-api-key"];
    if (apiKeyHeader) { keyInfo = await resolveApiKey(apiKeyHeader).catch(() => null); uid = keyInfo?.uid ?? null; }
  }
  if (!uid) {
    await logIngest({ uid: null, ok: false, status: 401, error: "Unauthorised", durationMs: Date.now() - t0 });
    return res.status(401).json({ error: "Unauthorised" });
  }

  try {
    // Parse
    const cleaned = parseHealthData(req.body);

    // Fan-out
    let docs = buildDocs(cleaned, uid);
    // Coalesce steps per local bucket BEFORE dedupe+insert
    docs = coalesceStepsByBucket(docs);

    // Safety guard
    const MAX_DOCS = 500000; // max per upload 
    if (docs.length > MAX_DOCS) {
      const msg = `Payload too large (${docs.length}). Please split into smaller daily batches.`;
      await logIngest({
        uid, ok: false, status: 413, error: msg,
        attempted: docs.length, inserted: 0,
        byType: docs.reduce((a, d) => ((a[d.type] = (a[d.type] || 0) + 1), a), {}),
        durationMs: Date.now() - t0,
      });
      return res.status(413).json({ ok: false, error: msg });
    }

    if (!docs.length) {
      await logIngest({ uid, ok: true, status: 204, error: null, attempted: 0, inserted: 0, byType: {}, durationMs: Date.now() - t0 });
      return res.status(200).json({ ok: true, inserted: 0, byType: {}, note: "No samples" });
    }

    const client = await clientPromise;
    const db = client.db("healthkit");
    const dataCol  = db.collection("health_data");
    const guardCol = db.collection("ingest_guard");

    // Indexes
    await guardCol.createIndex({ _fp: 1 }, { unique: true, name: "uniq_guard_fp" }).catch(() => {});
    await guardCol.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }).catch(() => {});
    await dataCol.createIndex({ "meta._fp": 1 }, { name: "fp_lookup" }).catch(() => {});

    // Chunked insert with guard
    const CHUNK = 800;
    let inserted = 0;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const chunk = docs.slice(i, i + CHUNK);
      const claims = chunk.map(d => ({ _fp: d.meta._fp, uid: d.meta.uid, createdAt: new Date() }));
      const newlyClaimedIndexes = new Set();
      try {
        const r = await guardCol.insertMany(claims, { ordered: false });
        if (r?.insertedIds) for (const k of Object.keys(r.insertedIds)) newlyClaimedIndexes.add(Number(k));
      } catch (e) {
        const r = e?.result;
        if (r?.insertedIds) for (const k of Object.keys(r.insertedIds)) newlyClaimedIndexes.add(Number(k));
        else if (e?.code !== 11000) throw e;
      }
      const toInsert = chunk.filter((_, idx) => newlyClaimedIndexes.has(idx));
      if (toInsert.length) {
        const r = await dataCol.insertMany(toInsert, { ordered: false });
        inserted += r.insertedCount ?? (r.insertedIds ? Object.keys(r.insertedIds).length : 0);
      }
    }

    if (keyInfo?.keyRef?.id) touchKeyLastUsed(uid, keyInfo.keyRef.id);

    const byType = docs.reduce((acc, d) => ((acc[d.type] = (acc[d.type] || 0) + 1), acc), {});
    await logIngest({
      uid, ok: true, status: 200, error: null,
      attempted: docs.length, inserted, byType, durationMs: Date.now() - t0,
    });

    return res.status(200).json({ ok: true, attempted: docs.length, inserted, byType });
  } catch (e) {
    console.error("Upload ingest error:", e);
    await logIngest({
      uid, ok: false, status: 500, error: e?.message || String(e),
      attempted: null, inserted: 0, byType: null, durationMs: Date.now() - t0,
    });
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}
