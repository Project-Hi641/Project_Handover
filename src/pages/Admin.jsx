// src/pages/Admin.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Container, Row, Col, Card, Form, Button, Table, Alert,
  Dropdown, ButtonGroup, Tabs, Tab, Spinner, Badge, Carousel
} from "react-bootstrap";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea, ScatterChart, Scatter, Cell } from "recharts";
import { Link } from "react-router-dom";
import { auth } from "../services/Firebase";
import ActivityRings, { ActivityRingsLegend } from "../components/ActivityRings";
import WalkingGaitHeatmap from "../components/WalkingGaitHeatmap";
import "../css/dashboard.css";

/* ============================================================================
   Admin Dashboard
   Tabs:
   • Admin           → DB status, notifications (approvals), recent ingests, dupes tools
   • User data       → search users + inspect health data (ALL types supported)
   • User mgmt       → centralised ops: upload schedule sparkline + admin delete

   Notes:
   • Name lookups via /api/admin/users?query=<uid>&limit=1 (cached in-memory).
   • Notifications card ASSUMES backend:
       GET  /api/admin/requests                 → { signup:[], emailChange:[] }
       POST /api/admin/requests/approve         → { kind, id|uid, ... }
       POST /api/admin/requests/reject          → { kind, id|uid, reason? }
     Shape for signup item:   { id, uid, email, displayName, createdAt }
     Shape for emailChange:   { id, uid, oldEmail, newEmail, createdAt }
   • Admin delete ASSUMES backend:
       POST /api/admin/account-delete { uid }   → { ok:true }
     (Separate from user self-delete at /api/account-delete)
   ========================================================================== */

/* ---------- ALL health types (from upload.js) ---------- */
const ALL_TYPES = [
  "", // All
  "heart_rate",
  "steps",
  "sleep",
  "walking_speed",
  "walking_asymmetry",
  "walking_steadiness",
  "double_support_time",
  "walking_step_length",
  "heart_rate_variability",
  "resting_heart_rate",
  "walking_heart_rate_average",
  "active_energy",
  "resting_energy",
  "stand_minutes",
  // keep for historical/backfill if ever used:
  "blood_pressure",
];

/* ---------- Tiny sparkline (last N days) ---------- */
function Sparkline({ series = [], height = 28 }) {
  if (!series.length) return <div className="text-muted small">—</div>;
  const max = Math.max(...series, 1);
  const W = series.length * 6; // 6px / day
  const H = height;
  return (
    <svg width={W} height={H} role="img" aria-label="upload activity">
      {series.map((v, i) => {
        const h = Math.round((v / max) * (H - 2));
        const y = H - h;
        const x = i * 6 + 1;
        return <rect key={i} x={x} y={y} width={4} height={h} rx={1} />;
      })}
    </svg>
  );
}

/* ---------- Shared helpers ---------- */
async function withToken(fetcher) {
  const t = await auth.currentUser.getIdToken();
  return fetcher(t);
}

/* UID → Name resolver with cache */
function useNameResolver() {
  const cacheRef = useRef({});
  async function resolve(uid) {
    if (!uid) return "";
    if (cacheRef.current[uid]) return cacheRef.current[uid];
    const name = await withToken(async (t) => {
      const qs = new URLSearchParams({ query: uid, limit: "1" });
      const r = await fetch(`/api/admin/users?${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error || `GET ${r.status}`);
      const u = b?.items?.[0];
      return u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "";
    });
    cacheRef.current[uid] = name;
    return name;
  }
  function Name({ uid }) {
    const [name, setName] = useState(cacheRef.current[uid] || "");
    useEffect(() => {
      let cancel = false;
      if (!uid) return;
      (async () => { try { const n = await resolve(uid); if (!cancel) setName(n); } catch {} })();
      return () => { cancel = true; };
    }, [uid]);
    if (!uid) return <>—</>;
    return <>{name ? <>{name} <span className="text-muted">({uid})</span></> : <span style={{ fontFamily: "monospace" }}>{uid}</span>}</>;
  }
  return { Name, resolveName: resolve };
}

export default function Admin() {
  const [active, setActive] = useState("admin");
  return (
    <div className="dashboard-main">
      <section className="dashboard-content">
        <Container fluid className="py-3">
          <Tabs activeKey={active} onSelect={(k)=>setActive(k)} className="mb-3">
            <Tab eventKey="admin" title="Admin"><AdminTab /></Tab>
            <Tab eventKey="users" title="User data"><UserDataTab /></Tab>
            <Tab eventKey="mgmt" title="User mgmt"><UsersMgmtTab /></Tab>
          </Tabs>
        </Container>
      </section>
    </div>
  );
}

/* ============================== Admin tab ============================== */
function AdminTab() {
  const { Name } = useNameResolver();

  const [status, setStatus] = useState(null);
  const [err, setErr] = useState("");

  // notifications (approvals)
  const [reqs, setReqs] = useState({ signup: [], emailChange: [], accountDelete: [] });
  const [reqBusy, setReqBusy] = useState(false);
  const [reqErr, setReqErr] = useState("");

  // exact dupes
  const [dupeInfo, setDupeInfo] = useState(null);
  const [dupeBusy, setDupeBusy] = useState(false);

  // logs view
  const [showFailsOnly, setShowFailsOnly] = useState(false);

  /* ----- status ----- */
async function refreshStatus() {
  setErr("");
  try {
    const data = await withToken(async (t) => {
      const r = await fetch("/api/admin?action=status", { headers: { Authorization: `Bearer ${t}` } });
      const text = await r.text();
      let b; try { b = JSON.parse(text); } catch { b = {}; }
      if (!r.ok) throw new Error(b?.error || `GET ${r.status}`);
      return b;
    });
    setStatus(data);
  } catch (e) {
    setErr(e.message);
  }
}
useEffect(() => { refreshStatus(); }, []);

/* ----- notifications (approvals) ----- */
async function loadRequests() {
  setReqErr("");
  setReqBusy(true);
  try {
    const data = await withToken(async (t) => {
      const r = await fetch("/api/admin?action=requests", { headers: { Authorization: `Bearer ${t}` } });
      const text = await r.text();
      let b; try { b = JSON.parse(text); } catch { b = {}; }
      if (!r.ok) throw new Error(b?.error || `GET ${r.status}`);
      return b;
    });
    setReqs({
    signup: data.signup || [],
    emailChange: data.emailChange || [],
    accountDelete: data.accountDelete || [],   
   });
  } catch (e) {
    setReqErr(e.message);
  } finally {
    setReqBusy(false);
  }
}

async function approve(kind, payload) {
  setReqBusy(true);
  try {
    await withToken(async (t) => {
      const r = await fetch("/api/admin?action=requests-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ kind, ...payload }),
      });
      const text = await r.text();
      let b; try { b = JSON.parse(text); } catch { b = {}; }
      if (!r.ok || !b.ok) throw new Error(b?.error || `POST ${r.status}`);
    });
    await loadRequests();
  } catch (e) {
    alert(`Approve failed: ${e.message}`);
  } finally {
    setReqBusy(false);
  }
}

async function reject(kind, payload) {
  const reason = prompt("Optional reason?");
  setReqBusy(true);
  try {
    await withToken(async (t) => {
      const r = await fetch("/api/admin?action=requests-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ kind, ...payload, reason }),
      });
      const text = await r.text();
      let b; try { b = JSON.parse(text); } catch { b = {}; }
      if (!r.ok || !b.ok) throw new Error(b?.error || `POST ${r.status}`);
    });
    await loadRequests();
  } catch (e) {
    alert(`Reject failed: ${e.message}`);
  } finally {
    setReqBusy(false);
  }
}
useEffect(() => { loadRequests(); }, []);

  /* ----- exact dupes (by fingerprint) ----- */
  async function scanDupes() {
    setDupeBusy(true); setErr("");
    try {
      const data = await withToken(async (t) => {
        const r = await fetch("/api/admin/dupes", { headers: { Authorization: `Bearer ${t}` } });
        const b = await r.json(); if (!r.ok) throw new Error(b?.error || `GET ${r.status}`); return b;
      });
      setDupeInfo(data);
    } catch (e) { setErr(e.message); }
    finally { setDupeBusy(false); }
  }
  async function cleanDupes() {
    if (!confirm("Remove duplicate rows now? This keeps the oldest document per duplicate group.")) return;
    setDupeBusy(true); setErr("");
    try {
      const data = await withToken(async (t) => {
        const r = await fetch("/api/admin/dupes", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: JSON.stringify({ apply: true }),
        });
        const b = await r.json(); if (!r.ok) throw new Error(b?.error || `POST ${r.status}`); return b;
      });
      setDupeInfo(data);
      alert(`Deleted ${data.deleted} duplicate docs`);
    } catch (e) { setErr(e.message); }
    finally { setDupeBusy(false); }
  }


  const recent = useMemo(() => {
    const arr = status?.recentLogs || [];
    const filtered = showFailsOnly ? arr.filter(l => !l.ok) : arr;
    // newest → oldest by timestamp
    return [...filtered].sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [status?.recentLogs, showFailsOnly]);


  return (
    <Row className="g-3">
      {/* DB Status */}
      <Col md={6}>
        <Card className="shadow-sm">
          <Card.Body>
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h4 className="mb-0">Database connectivity</h4>
              <Button variant="outline-secondary" size="sm" onClick={refreshStatus}>Refresh</Button>
            </div>
            {err && <Alert variant="danger">{err}</Alert>}
            {!status ? (
              <div className="text-muted"><Spinner animation="border" size="sm" /> Loading…</div>
            ) : (
              <>
                <div className="mb-2 small text-muted">Server time: {new Date(status.now).toLocaleString()}</div>
                <Table size="sm" bordered className="mb-2">
                  <tbody>
                    <tr><th>health_data</th><td>{status.counts.health_data.toLocaleString()}</td></tr>
                    <tr><th>ingest_guard</th><td>{status.counts.ingest_guard.toLocaleString()}</td></tr>
                    <tr><th>logs (ok/24h)</th><td>{status.counts.logs_24h_ok}</td></tr>
                    <tr><th>logs (fail/24h)</th><td>{status.counts.logs_24h_fail}</td></tr>
                    <tr>
                      <th>last ingest</th>
                      <td>
                        {status.lastIngest ? (
                          <>
                            {new Date(status.lastIngest.ts).toLocaleString()} — {status.lastIngest.type} —{" "}
                            <Name uid={status.lastIngest?.meta?.uid} />
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  </tbody>
                </Table>
              </>
            )}
          </Card.Body>
        </Card>
      </Col>

      {/* Notifications (approvals) */}
      <Col md={6}>
        <Card className="shadow-sm">
          <Card.Body>
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h4 className="mb-0">Notifications (approvals)</h4>
              <div className="d-flex align-items-center gap-2">
                <Badge bg="primary" title="Signups">{reqs.signup.length}</Badge>
                <Badge bg="warning" title="Email changes">{reqs.emailChange.length}</Badge>
                <Badge bg="danger"  title="Account deletions">{reqs.accountDelete?.length || 0}</Badge>
                <Button size="sm" variant="outline-secondary" onClick={loadRequests} disabled={reqBusy}>
                  {reqBusy ? "Loading…" : "Refresh"}
                </Button>
              </div>
            </div>

            {reqErr && <Alert variant="danger" className="mb-2">{reqErr}</Alert>}

            {!reqs.signup.length && !reqs.emailChange.length && !(reqs.accountDelete?.length) ? (
              <div className="text-muted">No pending requests.</div>
            ) : (
              <>
                {/* Signups */}
                {reqs.signup.length > 0 && (
                  <>
                    <div className="fw-bold mb-1">New user signups</div>
                    <div className="border rounded-3 p-2 mb-2" style={{ maxHeight: 160, overflow: "auto" }}>
                      <Table size="sm" hover className="mb-0 align-middle">
                        <thead><tr><th>When</th><th>User</th><th>Email</th><th>Actions</th></tr></thead>
                        <tbody>
                          {reqs.signup.map(s => (
                            <tr key={s.id}>
                              <td>{new Date(s.createdAt).toLocaleString()}</td>
                              <td>
                                {s.displayName ? (
                                  <>
                                    <strong>{s.displayName}</strong>
                                    <div className="text-muted small" style={{ fontFamily: "monospace" }}>{s.uid}</div>
                                  </>
                                ) : (
                                  <span style={{ fontFamily: "monospace" }}>{s.uid}</span>
                                )}
                              </td>
                              <td>{s.email}</td>
                              <td className="d-flex gap-2">
                                <Button size="sm" variant="success" onClick={() => approve("signup", { id: s.id, uid: s.uid })}>Approve</Button>
                                <Button size="sm" variant="outline-danger" onClick={() => reject("signup", { id: s.id, uid: s.uid })}>Reject</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </>
                )}

                {/* Email change */}
                {reqs.emailChange.length > 0 && (
                  <>
                    <div className="fw-bold mb-1">Email change requests</div>
                    <div className="border rounded-3 p-2 mb-2" style={{ maxHeight: 160, overflow: "auto" }}>
                      <Table size="sm" hover className="mb-0 align-middle">
                        <thead><tr><th>When</th><th>User</th><th>Old → New</th><th>Actions</th></tr></thead>
                        <tbody>
                          {reqs.emailChange.map(c => (
                            <tr key={c.id}>
                              <td>{new Date(c.createdAt).toLocaleString()}</td>
                              <td>
                                {c.displayName ? (
                                  <>
                                    <strong>{c.displayName}</strong>
                                    <div className="text-muted small" style={{ fontFamily: "monospace" }}>{c.uid}</div>
                                  </>
                                ) : (
                                  <span style={{ fontFamily: "monospace" }}>{c.uid}</span>
                                )}
                              </td>
                              <td><code className="small">{c.oldEmail}</code> → <code className="small">{c.newEmail}</code></td>
                              <td className="d-flex gap-2">
                                <Button size="sm" variant="success" onClick={() => approve("emailChange", { id: c.id, uid: c.uid })}>Approve</Button>
                                <Button size="sm" variant="outline-danger" onClick={() => reject("emailChange", { id: c.id, uid: c.uid })}>Reject</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </>
                )}

                {/* Account deletion */}
                {(reqs.accountDelete?.length || 0) > 0 && (
                  <>
                    <div className="fw-bold mb-1">Account deletions</div>
                    <div className="border rounded-3 p-2" style={{ maxHeight: 160, overflow: "auto" }}>
                      <Table size="sm" hover className="mb-0 align-middle">
                        <thead><tr><th>When</th><th>User</th><th>Reason</th><th>Actions</th></tr></thead>
                        <tbody>
                          {reqs.accountDelete.map(d => (
                            <tr key={d.id}>
                              <td>{new Date(d.createdAt).toLocaleString()}</td>
                              <td>
                                {d.displayName ? (
                                  <>
                                    <strong>{d.displayName}</strong>
                                    <div className="text-muted small" style={{ fontFamily:"monospace" }}>{d.uid}</div>
                                  </>
                                ) : (
                                  <span style={{ fontFamily:"monospace" }}>{d.uid}</span>
                                )}
                              </td>
                              <td><code className="small">{d.reason || "—"}</code></td>
                              <td className="d-flex gap-2">
                                <Button size="sm" variant="success"
                                  onClick={() => approve("accountDelete", { id: d.id, uid: d.uid })}
                                  disabled={reqBusy}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="outline-danger"
                                  onClick={() => reject("accountDelete", { id: d.id, uid: d.uid })}
                                  disabled={reqBusy}>
                                  Reject
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </>
                )}
              </>
            )}
          </Card.Body>
        </Card>
      </Col>


      {/* Recent ingest notifications */}
      <Col md={12}>
        <Card className="shadow-sm">
          <Card.Body>
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h4 className="mb-0">Recent ingest notifications</h4>
              <div className="d-flex align-items-center gap-2">
                <Badge bg="secondary" title="Total recent logs">{status?.recentLogs?.length || 0}</Badge>
                <Badge bg="danger" title="Failures in last 24h">{status?.counts?.logs_24h_fail ?? 0}</Badge>
                <Form.Check type="switch" id="toggle-fails-only" label="Show failures only"
                  checked={showFailsOnly} onChange={(e)=>setShowFailsOnly(e.target.checked)} />
              </div>
            </div>
            {!status?.recentLogs?.length ? (
              <div className="text-muted">No recent logs.</div>
            ) : (
              <div className="border rounded-3 p-2" style={{ maxHeight: 320, overflow: "auto" }}>
                <Table size="sm" hover className="mb-0 align-middle">
                  <thead>
                    <tr><th>Time</th><th>UID</th><th>Status</th><th>Inserted</th><th>byType / error</th></tr>
                  </thead>
                  <tbody>
                    {recent.map((l) => (
                      <tr key={l._id} className={!l.ok ? "table-danger" : undefined}>
                        <td>{new Date(l.at).toLocaleString()}</td>
                        <td><Name uid={l.uid} /></td>
                        <td>{l.ok ? <Badge bg="success">OK</Badge> : <Badge bg="danger">Fail</Badge>}</td>
                        <td>{l.inserted ?? "—"}</td>
                        <td>
                          {l.ok ? (
                            <code className="small">{l.byType ? JSON.stringify(l.byType) : "—"}</code>
                          ) : (
                            <code className="small text-danger">
                              {typeof l.error === "string" ? l.error : JSON.stringify(l.error ?? "unknown error")}
                            </code>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card.Body>
        </Card>
      </Col>

      {/* Exact duplicates */}
      <Col md={12}>
        <Card className="shadow-sm">
          <Card.Body>
            <div className="d-flex align-items-center justify-content-between">
              <h4 className="mb-0">Duplicate data (exact, by fingerprint)</h4>
              <div className="d-flex gap-2">
                <Button size="sm" variant="outline-secondary" onClick={scanDupes} disabled={dupeBusy}>
                  {dupeBusy ? "Scanning…" : "Scan"}
                </Button>
                <Button size="sm" variant="outline-danger" onClick={cleanDupes} disabled={dupeBusy}>
                  {dupeBusy ? "Cleaning…" : "Delete duplicates"}
                </Button>
              </div>
            </div>
            <div className="mt-2">
              {dupeInfo ? (
                <>
                  <div className="mb-2">
                    Groups: <b>{dupeInfo.groups}</b>, To delete: <b>{dupeInfo.toDelete ?? dupeInfo.duplicateDocs ?? 0}</b>
                    {dupeInfo.deleted != null && <> — Deleted: <b>{dupeInfo.deleted}</b></>}
                    {dupeInfo.dryRun && <Badge bg="warning" className="ms-2">dry run</Badge>}
                  </div>
                  {dupeInfo.samples?.length > 0 && (
                    <pre className="small bg-light p-2 rounded" style={{ maxHeight: 240, overflow: "auto" }}>
                      {JSON.stringify(dupeInfo.samples, null, 2)}
                    </pre>
                  )}
                </>
              ) : (
                <div className="text-muted">Click “Scan” to see duplicate summary.</div>
              )}
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}

/* ============================== User Data tab ============================== */
function UserDataTab() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState({ total: 0, items: [] });
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(25);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState(null);
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [events, setEvents] = useState([]);
  const [sortKey, setSortKey] = useState("time_desc");

  const canPrevUsers = skip > 0;
  const canNextUsers = skip + limit < users.total;

  function stageOf(e) { return e?.payload?.stage ?? ""; }
  function formatMinutes(m){ if(m==null||Number.isNaN(m))return ""; const mins=Math.round(Number(m)); const h=Math.floor(mins/60); const r=mins%60; return h?`${h}h ${r}m`:`${r}m`; }
  function prettyValue(e){
    if(e?.type==="sleep") return typeof e.value==="number"?formatMinutes(e.value):"";
    if(e?.type==="blood_pressure"&&e?.payload) return `${e.payload.systolic}/${e.payload.diastolic}`;
    if(typeof e?.value==="number"||typeof e?.value==="string") return e.value;
    return JSON.stringify(e?.value ?? e?.payload ?? "");
  }
  function cmp(a,b){return a<b?-1:a>b?1:0;}

  const sortedEvents = useMemo(() => {
    const arr=[...events];
    const byTime=(a,b)=>cmp(new Date(a.ts).getTime(), new Date(b.ts).getTime());
    const numVal=(e)=>(typeof e.value==="number"?e.value:Number.NEGATIVE_INFINITY);
    const byValue=(a,b)=>cmp(numVal(a), numVal(b));
    const byType=(a,b)=>cmp(a.type||"", b.type||"");
    const byStage=(a,b)=>cmp(stageOf(a), stageOf(b));
    switch (sortKey){
      case "time_asc": arr.sort(byTime); break;
      case "time_desc": arr.sort((a,b)=>-byTime(a,b)); break;
      case "value_asc": arr.sort(byValue); break;
      case "value_desc": arr.sort((a,b)=>-byValue(a,b)); break;
      case "type_asc": arr.sort(byType); break;
      case "type_desc": arr.sort((a,b)=>-byType(a,b)); break;
      case "stage_asc": arr.sort(byStage); break;
      case "stage_desc": arr.sort((a,b)=>-byStage(a,b)); break;
      default: break;
    }
    return arr;
  }, [events, sortKey]);

  async function loadUsers(){
    try{
      setErr("");
      const token=await auth.currentUser.getIdToken();
      const p=new URLSearchParams({query:q, limit:String(limit), skip:String(skip)});
      const res=await fetch(`/api/admin/users?${p}`, { headers:{ Authorization:`Bearer ${token}` }});
      const data=await res.json();
      if(!res.ok) throw new Error(data?.error||`GET ${res.status}`);
      setUsers(data);
    }catch(e){ setErr(e.message); }
  }
  async function loadHealth(uid){
    if(!uid) return setEvents([]);
    try{
      setErr("");
      const token=await auth.currentUser.getIdToken();
      const p=new URLSearchParams({
        uid,
        ...(type?{type}:{ }),
        ...(from?{from:new Date(from).toISOString()}:{ }),
        ...(to?{to:new Date(to+"T23:59:59").toISOString()}:{ }),
        limit:"500",
      });
      const res=await fetch(`/api/admin/health?${p}`, { headers:{ Authorization:`Bearer ${token}` }});
      const data=await res.json();
      if(!res.ok) throw new Error(data?.error||`GET ${res.status}`);
      setEvents(data.items);
    }catch(e){ setErr(e.message); }
  }
  useEffect(()=>{ loadUsers(); /* eslint-disable-next-line */ }, [skip, limit]);

  function setPreset(days){
    if(!selected) return;
    if(days==="all"){ setFrom(""); setTo(""); loadHealth(selected._id); return; }
    if(days==="month"){
      const now=new Date(); const first=new Date(now.getFullYear(), now.getMonth(), 1);
      const last=new Date(now.getFullYear(), now.getMonth()+1, 0);
      setFrom(first.toISOString().slice(0,10)); setTo(last.toISOString().slice(0,10)); loadHealth(selected._id); return;
    }
    if(days==="year"){
      const now=new Date(); const first=new Date(now.getFullYear(),0,1); const last=new Date(now.getFullYear(),11,31);
      setFrom(first.toISOString().slice(0,10)); setTo(last.toISOString().slice(0,10)); loadHealth(selected._id); return;
    }
    const end=new Date(); const start=new Date(); start.setDate(end.getDate()-(typeof days==="number"?days:7)+1);
    setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); loadHealth(selected._id);
  }

  function exportCsv(rows){
    const header=["ts","uid","type","value_minutes","stage","unit","source"];
    const lines=[header.join(",")];
    for(const r of rows){
      const minutes = r?.type==="sleep" && typeof r.value==="number" ? r.value : r?.value ?? "";
      const row=[
        new Date(r.ts).toISOString(),
        r?.meta?.uid ?? "",
        r?.type ?? "",
        minutes,
        r?.payload?.stage ?? "",
        r?.unit ?? "",
        r?.meta?.source ?? "",
      ].map(s=>`"${String(s).replace(/"/g,'""')}"`);
      lines.push(row.join(","));
    }
    const blob=new Blob([lines.join("\n")], { type:"text/csv" });
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download="health_data.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const selectedName = selected
    ? (selected.displayName || [selected.firstName, selected.lastName].filter(Boolean).join(" ") || "—")
    : null;

  return (
    <Row className="g-3">
      {/* Users list */}
      <Col md={6}>
        <Card className="shadow-sm">
          <Card.Body className="p-3">
            <h3 className="mb-3">Users</h3>
            {err && <Alert variant="danger">{err}</Alert>}
            <div className="d-flex gap-2 mb-3">
              <Form.Control value={q} onChange={e=>setQ(e.target.value)} placeholder="Search email / name / uid" />
              <Button onClick={()=>{ setSkip(0); loadUsers(); }}>Search</Button>
            </div>
            <div className="d-flex align-items-center gap-2 mb-3">
              <Form.Select value={limit} onChange={e=>{ setLimit(Number(e.target.value)); setSkip(0); }} style={{ maxWidth:160 }}>
                {[10,25,50,100].map(n=><option key={n} value={n}>{n} / page</option>)}
              </Form.Select>
              <Button disabled={!canPrevUsers} onClick={()=>setSkip(Math.max(skip - limit, 0))}>Prev</Button>
              <Button disabled={!canNextUsers} onClick={()=>setSkip(skip + limit)}>Next</Button>
              <div className="ms-auto text-muted small">
                {users.total ? `${skip+1}-${Math.min(skip+limit, users.total)} of ${users.total}` : "0-0 of 0"}
              </div>
            </div>
            <div className="border rounded-3 p-2">
              <Table responsive size="sm" hover className="mb-0 align-middle">
                <thead><tr><th>Name</th><th>UID</th><th>Email</th><th>Updated</th></tr></thead>
                <tbody>
                  {users.items.map(u=>{
                    const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ");
                    return (
                      <tr key={u._id}
                          onClick={()=>{ setSelected(u); setFrom(""); setTo(""); setType(""); setSortKey("time_desc"); loadHealth(u._id); }}
                          style={{ cursor:"pointer" }}>
                        <td>{name || "—"}</td>
                        <td style={{ fontFamily:"monospace" }}>{u._id}</td>
                        <td>{u.email}</td>
                        <td>{u.updatedAt ? new Date(u.updatedAt).toLocaleString() : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      </Col>

      {/* Health data */}
      <Col md={6}>
        <Card className="shadow-sm">
          <Card.Body className="p-3">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h3 className="mb-0">
                Health Data{" "}
                {selected ? (
                  <small className="text-muted">
                    <span className="ms-1">{selectedName} · {selected._id}</span>
                  </small>
                ) : null}
              </h3>
              <Form.Select value={sortKey} onChange={e=>setSortKey(e.target.value)} size="sm" style={{ minWidth:190 }}>
                <option value="time_desc">Time (newest → oldest)</option>
                <option value="time_asc">Time (oldest → newest)</option>
                <option value="value_desc">Value (high → low)</option>
                <option value="value_asc">Value (low → high)</option>
                <option value="type_asc">Type (A → Z)</option>
                <option value="type_desc">Type (Z → A)</option>
                <option value="stage_asc">Stage (A → Z)</option>
                <option value="stage_desc">Stage (Z → A)</option>
              </Form.Select>
            </div>

            {!selected && <p className="text-muted">Select a user on the left.</p>}

            {selected && (
              <>
                <div className="d-flex flex-wrap gap-2 mb-2">
                  <Form.Select value={type} onChange={e=>setType(e.target.value)} style={{ maxWidth:260 }}>
                    {ALL_TYPES.map(t => <option key={t || "all"} value={t}>{t ? t : "All types"}</option>)}
                  </Form.Select>
                  <Form.Control type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ maxWidth:160 }} />
                  <Form.Control type="date" value={to} onChange={e=>setTo(e.target.value)} style={{ maxWidth:160 }} />
                  <Button onClick={()=>loadHealth(selected._id)}>Apply</Button>

                  <Dropdown as={ButtonGroup}>
                    <Button variant="outline-secondary">Presets</Button>
                    <Dropdown.Toggle split variant="outline-secondary" />
                    <Dropdown.Menu>
                      <Dropdown.Item onClick={()=>setPreset(7)}>Last 7 days</Dropdown.Item>
                      <Dropdown.Item onClick={()=>setPreset(28)}>Last 28 days</Dropdown.Item>
                      <Dropdown.Item onClick={()=>setPreset("month")}>This month</Dropdown.Item>
                      <Dropdown.Item onClick={()=>setPreset("year")}>This year</Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item onClick={()=>setPreset("all")}>All</Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>

                  <Button variant="outline-secondary" onClick={()=>exportCsv(sortedEvents)} disabled={!sortedEvents.length} className="ms-auto">
                    Export CSV
                  </Button>
                </div>

                <div className="border rounded-3 p-2">
                  <Table responsive size="sm" hover className="mb-0 align-middle">
                    <thead><tr><th>Time</th><th>Type</th><th>Value</th><th>Stage</th><th>Unit</th><th>Source</th></tr></thead>
                    <tbody>
                      {sortedEvents.map((e, idx)=>(
                        <tr key={e._id || `${e.meta?.uid}-${e.ts}-${e.type}-${idx}`}>
                          <td>{new Date(e.ts).toLocaleString()}</td>
                          <td>{e.type}</td>
                          <td>{prettyValue(e)}</td>
                          <td>{e?.payload?.stage ?? ""}</td>
                          <td>{e.unit || ""}</td>
                          <td>{e.meta?.source || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </>
            )}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}

/* ============================== User mgmt tab ============================== */
function UsersMgmtTab() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState({ total: 0, items: [] });
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [days, setDays] = useState(30);
  const [schedules, setSchedules] = useState({}); // uid -> array[days] counts
  const [loadingUid, setLoadingUid] = useState(null);

  async function loadUsers(){
    try{
      setErr(""); setBusy(true);
      const token=await auth.currentUser.getIdToken();
      const p=new URLSearchParams({query:q, limit:String(limit), skip:String(skip)});
      const res=await fetch(`/api/admin/users?${p}`, { headers:{ Authorization:`Bearer ${token}` }});
      const data=await res.json();
      if(!res.ok) throw new Error(data?.error||`GET ${res.status}`);
      setUsers(data);
    }catch(e){ setErr(e.message); }
    finally { setBusy(false); }
  }
  useEffect(()=>{ loadUsers(); /* eslint-disable-next-line */ }, [skip, limit]);

  async function loadSchedule(uid){
    setLoadingUid(uid);
    try{
      await withToken(async (t)=>{
        const end = new Date();
        const start = new Date(); start.setDate(end.getDate() - days);
        const qs = new URLSearchParams({
          uid,
          from: start.toISOString(),
          to: end.toISOString(),
          limit: String(2000),
          skip: "0",
        });
        const r = await fetch(`/api/admin/ingest-logs?${qs}`, { headers: { Authorization: `Bearer ${t}` } });
        const b = await r.json(); if (!r.ok) throw new Error(b?.error || `GET ${r.status}`);
        const counts = new Array(days).fill(0);
        for (const it of b.items || []) {
          const idx = Math.floor((new Date(it.ts) - start) / (24*60*60*1000));
          if (idx >= 0 && idx < days) counts[idx] += 1;
        }
        setSchedules((p)=>({ ...p, [uid]: counts }));
      });
    }catch(e){ alert(`Failed to load schedule: ${e.message}`); }
    finally{ setLoadingUid(null); }
  }

  async function deleteUser(uid) {
    if (!uid) return;
    if (!confirm(`Delete user ${uid}? This is permanent.`)) return;
    try {
      await withToken(async (t) => {
        const r = await fetch(`/api/admin/account-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: JSON.stringify({ uid }),
        });
        const b = await r.json().catch(()=> ({}));
        if (!r.ok || b?.ok === false) throw new Error(b?.error || `POST ${r.status}`);
      });
      alert("User deleted.");
      loadUsers();
    } catch (e) {
      alert(`Delete failed: ${e.message}\n(Ensure backend implements POST /api/admin/account-delete { uid })`);
    }
  }

  const canPrev = skip > 0;
  const canNext = skip + limit < users.total;

  return (
    <Row className="g-3">
      <Col md={12}>
        <Card className="shadow-sm">
          <Card.Body>
            <div className="d-flex align-items-center gap-2 mb-3">
              <h3 className="mb-0">User management</h3>
              <div className="ms-auto d-flex gap-2">
                <Form.Control value={q} onChange={e=>setQ(e.target.value)} placeholder="Search email / name / uid" style={{ maxWidth: 320 }} />
                <Button onClick={()=>{ setSkip(0); loadUsers(); }} disabled={busy}>{busy ? "Loading…" : "Search"}</Button>
                <Form.Select value={limit} onChange={e=>{ setLimit(Number(e.target.value)); setSkip(0); }} style={{ maxWidth:120 }}>
                  {[10,20,50,100].map(n=><option key={n} value={n}>{n} / page</option>)}
                </Form.Select>
              </div>
            </div>
            {err && <Alert variant="danger">{err}</Alert>}

            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="text-muted small">Sparkline window:</div>
              <Form.Select value={days} onChange={e=>setDays(Number(e.target.value))} style={{ maxWidth:140 }}>
                {[14,30,60,90].map(n => <option key={n} value={n}>Last {n} days</option>)}
              </Form.Select>
            </div>

            <div className="border rounded-3 p-2">
              <Table responsive size="sm" hover className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Name (UID)</th>
                    <th>Email</th>
                    <th className="text-center">Upload schedule</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.items.map(u => (
                    <tr key={u._id}>
                      <td>
                        <div><strong>{u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</strong></div>
                        <div className="text-muted small" style={{ fontFamily: "monospace" }}>{u._id}</div>
                      </td>
                      <td>{u.email}</td>
                      <td className="text-center">
                        <div className="d-flex align-items-center justify-content-center gap-2">
                          <div><Sparkline series={schedules[u._id]} /></div>
                          <Button size="sm" variant="outline-secondary" onClick={()=>loadSchedule(u._id)} disabled={loadingUid === u._id}>
                            {loadingUid === u._id ? "Loading…" : "Load"}
                          </Button>
                        </div>
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <Button size="sm" variant="outline-danger" onClick={()=>deleteUser(u._id)}>Delete user</Button>
                          {/* Future: Impersonate, Rotate API key, Disable user, Export data */}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="d-flex align-items-center gap-2 mt-2">
              <Button disabled={!canPrev} onClick={()=>setSkip(Math.max(skip - limit, 0))}>Prev</Button>
              <Button disabled={!canNext} onClick={()=>setSkip(skip + limit)}>Next</Button>
              <div className="ms-auto text-muted small">
                {users.total ? `${skip+1}-${Math.min(skip+limit, users.total)} of ${users.total}` : "0-0 of 0"}
              </div>
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
