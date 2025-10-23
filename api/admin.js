// /api/admin.js  (the ONLY file in /api)
import dupes from "../src/server/dupes.js";
import health from "../src/server/health.js";
import ingestLogs from "../src/server/ingest_logs.js";
import ping from "../src/server/ping.js";
import potentialDupes from "../src/server/potential_dupes.js";
import status from "../src/server/status.js";
import users from "../src/server/users.js";
import requests from "../src/server/requests.js";                // GET (list) + POST (create)
import requestsApprove from "../src/server/requests_approve.js"; // POST
import requestsReject from "../src/server/requests_reject.js";   // POST
import accountDeleteAdmin from "../src/server/account_delete_admin.js"; // POST

const table = {
  dupes,
  health,
  "ingest-logs": ingestLogs,
  ping,
  "potential-dupes": potentialDupes,
  status,
  users,
  requests,             // GET / POST
  "requests-approve": requestsApprove, // POST
  "requests-reject": requestsReject,   // POST
  "account-delete": accountDeleteAdmin // POST (admin-only)
};

export default async function handler(req, res) {
  try {
    const action = String(req.query.action || "");
    const fn = table[action];
    if (!fn) {
      return res
        .status(404)
        .json({ error: `Unknown action: ${action}`, allowed: Object.keys(table) });
    }
    return await fn(req, res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
