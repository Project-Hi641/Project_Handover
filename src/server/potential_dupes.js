// src/server/potential_dupes.js
export default async function scanPotentialDupes(db, query) {
  const col = db.collection("health_data");

  const {
    uid = "",
    type = "",
    from = "",
    to = "",
    windowSec = "30",
    valueTol = "1",
    limit = "200",
    sample = "3",
    minCount = "2",
  } = query;

  const winSec  = Math.max(parseInt(windowSec, 10) || 30, 1);
  const valTol  = Math.max(parseFloat(valueTol) || 1, 0.000001);
  const lim     = Math.min(parseInt(limit, 10) || 200, 2000);
  const sam     = Math.min(parseInt(sample, 10) || 3, 10);
  const minDup  = Math.max(parseInt(minCount, 10) || 2, 2);

  const match = {};
  if (uid)  match["meta.uid"] = String(uid);
  if (type) match.type = String(type);

  if (from || to) {
    match.ts = {};
    if (from) match.ts.$gte = new Date(from);
    if (to)   match.ts.$lte = new Date(to);
  } else if (!uid && !type) {
    const end = new Date();
    const start = new Date(); start.setDate(end.getDate() - 7);
    match.ts = { $gte: start, $lte: end };
  }

  const windowMs = winSec * 1000;

  const pipeline = [
    { $match: match },
    { $sort: { ts: -1 } },
    { $addFields: {
        _bucketStartLong: {
          $subtract: [{ $toLong: "$ts" }, { $mod: [{ $toLong: "$ts" }, windowMs] }]
        },
        _valueBucket: {
          $cond: [{ $eq: ["$type", "sleep"] }, null, { $floor: { $divide: ["$value", valTol] } }]
        }
    }},
    { $group: {
        _id: {
          uid: "$meta.uid",
          type: "$type",
          bucketStart: "$_bucketStartLong",
          key: { $cond: [{ $eq: ["$type", "sleep"] }, { $ifNull: ["$payload.stage", ""] }, "$_valueBucket"] }
        },
        count: { $sum: 1 },
        examples: {
          $push: {
            _id: "$_id", ts: "$ts", type: "$type", value: "$value", unit: "$unit",
            stage: "$payload.stage", uid: "$meta.uid", source: "$meta.source", device: "$meta.device"
          }
        }
    }},
    { $match: { count: { $gte: minDup } } },
    { $sort: { count: -1, "_id.bucketStart": -1 } },
    { $limit: lim },
    { $project: {
        _id: 0,
        uid: "$_id.uid",
        type: "$_id.type",
        key: "$_id.key",
        bucketStart: { $toDate: "$_id.bucketStart" },
        bucketEnd:   { $toDate: { $add: ["$_id.bucketStart", windowMs] } },
        count: 1,
        examples: { $slice: ["$examples", sam] }
    }},
  ];

  const groups = await col.aggregate(pipeline, { allowDiskUse: true }).toArray();
  const totalDupDocs = groups.reduce((acc, g) => acc + g.count, 0);

  return {
    params: { uid, type, from, to, windowSec: winSec, valueTol: valTol },
    groups: groups.length,
    duplicateDocs: totalDupDocs,
    items: groups,
  };
}

export async function deletePotentialDupes(db, body) {
  const col = db.collection("health_data");
  const { deleteGroups, valueTol = 1, dryRun = false } = body || {};
  if (!Array.isArray(deleteGroups) || deleteGroups.length === 0) {
    throw new Error("deleteGroups array required");
  }

  const valTol = Math.max(Number(valueTol) || 1, 0.000001);
  let deleted = 0;
  let wouldDelete = 0;

  for (const g of deleteGroups) {
    const { uid, type, bucketStart, bucketEnd, key } = g || {};
    if (!uid || !type || !bucketStart || !bucketEnd) continue;

    const base = { "meta.uid": String(uid), type: String(type), ts: { $gte: new Date(bucketStart), $lt: new Date(bucketEnd) } };
    let filter;

    if (type === "sleep") {
      filter = { ...base, "payload.stage": key ?? "" };
    } else {
      if (key === null || key === "null") {
        filter = { ...base, value: null };
      } else {
        const bucketKey = Number(key);
        filter = {
          ...base,
          value: { $ne: null },
          $expr: {
            $eq: [
              { $multiply: [{ $round: [{ $divide: ["$value", valTol] }, 0] }, valTol] },
              bucketKey
            ]
          }
        };
      }
    }

    if (dryRun) {
      const n = await col.countDocuments(filter);
      wouldDelete += n;
    } else {
      const r = await col.deleteMany(filter);
      deleted += r.deletedCount || 0;
    }
  }

  return dryRun ? { ok: true, wouldDelete } : { ok: true, deleted };
}
