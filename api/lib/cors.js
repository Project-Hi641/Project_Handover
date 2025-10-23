// api/lib/cors.js

// Decides which origin to allow and sets CORS headers for this response
export function setCors(req, res) {
  const requestOrigin = req.headers.origin || "";
  const allowed = (process.env.CORS_ORIGINS ||
    "http://localhost:5173,https://healthkit-data-toolkit.vercel.app"
  )
    .split(",")
    .map(s => s.trim());

  const allowOrigin = allowed.includes(requestOrigin) ? requestOrigin : allowed[0];

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
}

// Handles OPTIONS preflight. Returns true if it fully handled the request.
export function handleCorsPreflight(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
