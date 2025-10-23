// src/pages/Summary.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Container, Row, Col, Card, Form, Button, Table, Alert,
  Dropdown, ButtonGroup, Tabs, Tab, Spinner
} from "react-bootstrap";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ReferenceArea, ReferenceLine
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/Firebase"; // compat
import useIsAdmin from "../contexts/useIsAdmin";
import ActivityRings, { ActivityRingsLegend } from "../components/ActivityRings";
import WalkingGaitHeatmap from "../components/WalkingGaitHeatmap";
import HypnogramPopup from "../components/HypnogramPopup";
import "../css/dashboard.css";
import "../css/summary.css";

/**
 * Summary (user view with tabs)
 * - Table: filters/presets/sorting + client-side pagination
 * - Steps: daily totals (blue)
 * - Heart: daily avg BPM (pink/red)
 * - Sleep: minutes by stage; excludes “In bed”; custom colors per stage
 *
 * Backend: GET /api/health?type=...&from=ISO&to=ISO&limit=...
 * Auth: Authorization: Bearer <idToken>
 */
const HEALTH_URL = "/api/health";

/** ---- Colors ---- */
const COLOR_STEPS = "#4f75ff";    // blue
const COLOR_HEART = "#ff4d6d";    // pink/red
// Moving average guide colors (to match admin dashboard screenshot)
const COLOR_AVG_7  = "#2eae71";    // green
const COLOR_AVG_21 = "#f0c419";    // yellow
const COLOR_AVG_90 = "#8e7cc3";    // purple
const STAGE_COLORS = {
  Awake: "#ffa94d",               // orange
  REM: "#60a5fa",                 // light blue
  Core: "#2563eb",                // darker blue
  Deep: "#a78bfa",                // soft purple
};

export default function Summary() {
  const { currentUser } = useAuth();
  const isAdmin = useIsAdmin();

  // Shared date window across tabs
  const [from, setFrom] = useState(() => isoDateNDaysAgo(28));
  const [to, setTo] = useState(() => isoDateNDaysAgo(0));
  const [err, setErr] = useState("");

  // Admin user selection
  const [adminSelectedUid, setAdminSelectedUid] = useState("");
  const [users, setUsers] = useState({ total: 0, items: [] });
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Activity rings animation state
  const [activityRingsAnimate, setActivityRingsAnimate] = useState(false);

  // Function to trigger activity rings animation
  const triggerActivityRingsAnimation = useCallback(() => {
    setActivityRingsAnimate(false);
    setTimeout(() => {
      setActivityRingsAnimate(true);
    }, 100);
  }, []);

  // ---------- TABLE (Admin-like) ----------
  const [tableType, setTableType] = useState(""); // "", heart_rate, steps, sleep, blood_pressure
  const [events, setEvents] = useState([]);
  const [sortKey, setSortKey] = useState("time_desc");
  const [loadingTable, setLoadingTable] = useState(false);

  // pagination (client-side)
  const [pageSize, setPageSize] = useState(50);          // 50 | 100 | 200 | 500 | 1000
  const [pageIndex, setPageIndex] = useState(0);         // 0-based

  // ---------- STEPS ----------
  const [stepsEvents, setStepsEvents] = useState([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

  // ---------- HEART ----------
  const [heartEvents, setHeartEvents] = useState([]);
  const [loadingHeart, setLoadingHeart] = useState(false);

  // ---------- SLEEP ----------
  const [sleepEvents, setSleepEvents] = useState([]);
  const [loadingSleep, setLoadingSleep] = useState(false);

  // ---------- DASHBOARD VISUALIZATIONS (Admin only) ----------
  const [restingHeartRateData, setRestingHeartRateData] = useState([]);
  const [standMinutesData, setStandMinutesData] = useState([]);
  const [hrvData, setHrvData] = useState([]);
  const [restingEnergyData, setRestingEnergyData] = useState([]);
  const [activeEnergyData, setActiveEnergyData] = useState([]);
  const [walkingAsymmetryData, setWalkingAsymmetryData] = useState([]);
  const [walkingSpeedData, setWalkingSpeedData] = useState([]);
  const [doubleSupportTimeData, setDoubleSupportTimeData] = useState([]);
  const [walkingStepLengthData, setWalkingStepLengthData] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [showHypnogramPopup, setShowHypnogramPopup] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [maxAllTimeRestingHR, setMaxAllTimeRestingHR] = useState(null);

  // Admin user search function
  const searchUsers = useCallback(async (query = "") => {
    if (!isAdmin) return;
    try {
      setLoadingUsers(true);
      const token = await auth.currentUser.getIdToken();
      const p = new URLSearchParams({ query, limit: "100" });
      const res = await fetch(`/api/admin/users?${p}`, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `GET ${res.status}`);
      setUsers(data);
    } catch (e) {
      console.error("Error searching users:", e);
      setUsers({ total: 0, items: [] });
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin]);

  // Load users on mount if admin
  useEffect(() => {
    if (isAdmin) {
      searchUsers();
    }
  }, [isAdmin, searchUsers]);

  // --- shared fetcher hitting /api/health for *this user* or *selected user* (if admin) ---
  const fetchHealth = useCallback(
    async (type) => {
      if (!currentUser) return { items: [] };
      const token = await auth.currentUser.getIdToken();
      
      // Determine which user's data to fetch
      const targetUid = isAdmin && adminSelectedUid ? adminSelectedUid : currentUser.uid;
      
      const p = new URLSearchParams({
        ...(type ? { type } : {}),
        from: new Date(from + "T00:00:00").toISOString(),
        to: new Date(to + "T23:59:59").toISOString(),
        // We fetch a generous chunk and paginate in the UI for now.
        limit: "10000",
      });

      // Use admin endpoint if viewing another user's data
      const url = isAdmin && adminSelectedUid ? `/api/admin/health?uid=${targetUid}&${p}` : `${HEALTH_URL}?${p}`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error("Bad JSON from /api/health"); }
      if (!res.ok) throw new Error(data?.error || `GET ${res.status}`);
      return data;
    },
    [currentUser, from, to, isAdmin, adminSelectedUid]
  );

  // ---- loaders per tab ----
  async function loadTable() {
    try {
      setErr(""); setLoadingTable(true);
      const data = await fetchHealth(tableType || "");
      setEvents(Array.isArray(data.items) ? data.items : []);
      setPageIndex(0); // reset to first page when data changes
    } catch (e) {
      console.error(e); setErr(e.message || "Failed to load"); setEvents([]);
    } finally {
      setLoadingTable(false);
    }
  }
  async function loadSteps() {
    try {
      setErr(""); setLoadingSteps(true);
      const data = await fetchHealth("steps");
      setStepsEvents(data.items || []);
    } catch (e) {
      console.error(e); setErr(e.message || "Failed to load steps"); setStepsEvents([]);
    } finally { setLoadingSteps(false); }
  }
  async function loadHeart() {
    try {
      setErr(""); setLoadingHeart(true);
      const data = await fetchHealth("heart_rate");
      setHeartEvents(data.items || []);
    } catch (e) {
      console.error(e); setErr(e.message || "Failed to load heart rate"); setHeartEvents([]);
    } finally { setLoadingHeart(false); }
  }
  async function loadSleep() {
    try {
      setErr(""); setLoadingSleep(true);
      const data = await fetchHealth("sleep");
      setSleepEvents(data.items || []);
    } catch (e) {
      console.error(e); setErr(e.message || "Failed to load sleep"); setSleepEvents([]);
    } finally { setLoadingSleep(false); }
  }

  // Dashboard data fetching functions (Admin only)
  const fetchUserProfile = useCallback(async (uid) => {
    if (!isAdmin) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const r = await fetch(`/api/users?id=${encodeURIComponent(uid)}`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (r.ok) setUserProfile(await r.json());
    } catch {}
  }, [isAdmin]);

  // Filter walking gait data to only include days with actual walking gait data (no zero values)
  const filterWalkingGaitDataFromLoaded = (allData) => {
    const walkingGaitTypes = [
      'walking_asymmetry',
      'walking_speed',
      'double_support_time',
      'walking_step_length'
    ];
    
    // First, identify dates that have valid (non-zero) walking gait data
    const validDates = new Set();
    
    walkingGaitTypes.forEach(type => {
      const dataArray = allData[type] || [];
      dataArray.forEach(item => {
        const value = typeof item.value === "number" ? item.value : Number(item.value);
        // Only include dates that have non-zero values (exclude days with 0 values)
        if (!Number.isNaN(value) && value > 0) {
          const date = new Date(item.ts).toISOString().slice(0, 10);
          validDates.add(date);
        }
      });
    });
    
    // Sort valid dates and take most recent ones (up to 21 days)
    const sortedValidDates = Array.from(validDates).sort().reverse().slice(0, 21);
    
    // Filter each walking gait data type to only include data from valid dates
    const filterDataByValidDates = (dataArray) => {
      return dataArray.filter(item => {
        const date = new Date(item.ts).toISOString().slice(0, 10);
        return sortedValidDates.includes(date);
      });
    };
    
    return {
      walking_asymmetry: filterDataByValidDates(allData.walking_asymmetry || []),
      walking_speed: filterDataByValidDates(allData.walking_speed || []),
      double_support_time: filterDataByValidDates(allData.double_support_time || []),
      walking_step_length: filterDataByValidDates(allData.walking_step_length || [])
    };
  };

  async function loadDashboardData() {
    if (!isAdmin || !adminSelectedUid) return;
    try {
      setErr(""); setLoadingDashboard(true);
      const token = await auth.currentUser.getIdToken();
      const toDate = new Date(to + "T23:59:59");
      // Always use the most recent 21 days within the selected range
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - 20); // 21 days total (including end date)
      
      const endpoints = [
        ["resting_heart_rate", setRestingHeartRateData],
        ["stand_minutes", setStandMinutesData],
        ["heart_rate_variability", setHrvData],
        ["resting_energy", setRestingEnergyData],
        ["active_energy", setActiveEnergyData],
        ["walking_asymmetry", setWalkingAsymmetryData],
        ["walking_speed", setWalkingSpeedData],
        ["double_support_time", setDoubleSupportTimeData],
        ["walking_step_length", setWalkingStepLengthData],
      ];
      
      // Load all data first
      const allData = {};
      await Promise.all(endpoints.map(async ([type, setter]) => {
        const p = new URLSearchParams({ 
          uid: adminSelectedUid,
          type, 
          from: fromDate.toISOString(), 
          to: toDate.toISOString(), 
          limit: "1000" 
        });
        const r = await fetch(`/api/admin/health?${p}`, { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        const j = await r.json(); 
        allData[type] = j.items || [];
        setter(j.items || []);
      }));

      // Fetch all-time resting heart rate to derive the rest zone threshold (highest daily resting HR across all data)
      try {
        const pAll = new URLSearchParams({
          uid: adminSelectedUid,
          type: "resting_heart_rate",
          limit: "2000"
        });
        const rAll = await fetch(`/api/admin/health?${pAll}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const jAll = await rAll.json();
        const vals = (jAll.items || []).map(it => Number(it.value)).filter(v => Number.isFinite(v));
        const maxResting = vals.length ? Math.max(...vals) : null;
        setMaxAllTimeRestingHR(maxResting);
      } catch {
        setMaxAllTimeRestingHR(null);
      }
      
      // Filter walking gait data to only include days with actual walking gait data
      const filteredWalkingGaitData = filterWalkingGaitDataFromLoaded(allData);
      
      // Set the filtered walking gait data
      setWalkingAsymmetryData(filteredWalkingGaitData.walking_asymmetry);
      setWalkingSpeedData(filteredWalkingGaitData.walking_speed);
      setDoubleSupportTimeData(filteredWalkingGaitData.double_support_time);
      setWalkingStepLengthData(filteredWalkingGaitData.walking_step_length);
      
      await fetchUserProfile(adminSelectedUid);
    } catch (e) {
      setErr(e.message || "Failed to load dashboard data");
    } finally {
      setLoadingDashboard(false);
    }
  }

  // Default: last 7 days & load table
  useEffect(() => {
    if (!currentUser) return;
    setPreset(7, false);
    const t = setTimeout(loadTable, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // ----- table helpers -----
  function stageOf(e) { return e?.payload?.stage ?? ""; }
  function formatMinutes(m) {
    if (m == null || Number.isNaN(m)) return "";
    const mins = Math.round(Number(m));
    const h = Math.floor(mins / 60);
    const r = mins % 60;
    return h ? `${h}h ${r}m` : `${r}m`;
  }
  function prettyValue(e) {
    if (e?.type === "sleep") return typeof e.value === "number" ? formatMinutes(e.value) : "";
    if (e?.type === "blood_pressure" && e?.payload) return `${e.payload.systolic}/${e.payload.diastolic}`;
    if (typeof e?.value === "number" || typeof e?.value === "string") return e.value;
    return JSON.stringify(e?.value ?? e?.payload ?? "");
  }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  const sortedEvents = useMemo(() => {
    const arr = [...events];
    const byTime  = (a, b) => cmp(new Date(a.ts).getTime(), new Date(b.ts).getTime());
    const numVal  = (e) => (typeof e.value === "number" ? e.value : Number.NEGATIVE_INFINITY);
    const byValue = (a, b) => cmp(numVal(a), numVal(b));
    const byType  = (a, b) => cmp(a.type || "", b.type || "");
    const byStage = (a, b) => cmp(stageOf(a), stageOf(b));
    switch (sortKey) {
      case "time_asc":   arr.sort(byTime); break;
      case "time_desc":  arr.sort((a,b) => -byTime(a,b)); break;
      case "value_asc":  arr.sort(byValue); break;
      case "value_desc": arr.sort((a,b) => -byValue(a,b)); break;
      case "type_asc":   arr.sort(byType); break;
      case "type_desc":  arr.sort((a,b) => -byType(a,b)); break;
      case "stage_asc":  arr.sort(byStage); break;
      case "stage_desc": arr.sort((a,b) => -byStage(a,b)); break;
      default: break;
    }
    return arr;
  }, [events, sortKey]);

  // client-side pagination slices
  const pageCount = Math.max(1, Math.ceil(sortedEvents.length / pageSize));
  const clampedPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = useMemo(() => {
    const start = clampedPage * pageSize;
    return sortedEvents.slice(start, start + pageSize);
  }, [sortedEvents, clampedPage, pageSize]);
  const showingFrom = sortedEvents.length ? clampedPage * pageSize + 1 : 0;
  const showingTo = Math.min((clampedPage + 1) * pageSize, sortedEvents.length);

  // reset page if pageSize changes or we re-sort
  useEffect(() => { setPageIndex(0); }, [pageSize, sortKey, tableType, from, to]);

  // ----- steps chart data -----
  const stepsDaily = useMemo(() => {
    const days = enumerateDays(from, to);
    const map = Object.fromEntries(days.map(d => [d, 0]));
    for (const ev of stepsEvents) {
      const v = typeof ev.value === "number" ? ev.value : Number(ev.value);
      if (!Number.isNaN(v)) {
        const k = new Date(ev.ts).toISOString().slice(0, 10);
        map[k] = (map[k] ?? 0) + v;
      }
    }
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
      .map(([date, steps]) => ({ date, steps, label: ddMMM(date) }));
  }, [stepsEvents, from, to]);

  const stepsStats = useMemo(() => {
    if (!stepsDaily.length) return { total: 0, avg: 0, best: null };
    const total = stepsDaily.reduce((s, d) => s + (d.steps || 0), 0);
    const days = stepsDaily.length;
    const avg = Math.round(total / (days || 1));
    const best = stepsDaily.reduce((m, d) => (d.steps > (m?.steps || 0) ? d : m), null);
    return { total, avg, best };
  }, [stepsDaily]);

  // ----- heart chart data -----
  const heartDaily = useMemo(() => {
    const agg = {}; // { yyyy-mm-dd: { sum, n } }
    for (const ev of heartEvents) {
      const v = typeof ev.value === "number" ? ev.value : Number(ev.value);
      if (!Number.isNaN(v)) {
        const k = new Date(ev.ts).toISOString().slice(0, 10);
        if (!agg[k]) agg[k] = { sum: 0, n: 0 };
        agg[k].sum += v; agg[k].n += 1;
      }
    }
    return Object.entries(agg).sort(([a],[b]) => a.localeCompare(b))
      .map(([date, { sum, n }]) => ({ date, bpm: Math.round(sum / n), label: ddMMM(date) }));
  }, [heartEvents]);

  // ----- sleep stacked chart data (exclude "In bed") -----
  const sleepDaily = useMemo(() => {
    const byDay = {};
    const addStage = (s) => {
      const canon = canonicalStage(s);
      if (canon === "In bed") return null;          // exclude from graph
      return canon;
    };

    for (const ev of sleepEvents) {
      const mins = typeof ev.value === "number" ? ev.value : Number(ev.value);
      if (!Number.isNaN(mins)) {
        const k = new Date(ev.ts).toISOString().slice(0, 10);
        const stage = addStage(ev?.payload?.stage);
        if (stage) {
          byDay[k] ??= {};
          byDay[k][stage] = (byDay[k][stage] ?? 0) + mins;
        }
      }
    }

    // Order stages explicitly for consistent stacks/legend
    const stageOrder = ["Awake", "REM", "Core", "Deep"];
    const days = enumerateDays(from, to);
    const rows = days.map(d => {
      const base = { date: d, label: ddMMM(d) };
      for (const s of stageOrder) base[s] = byDay[d]?.[s] ?? 0;
      return base;
    });
    return { rows, stages: stageOrder };
  }, [sleepEvents, from, to]);

  // ----- presets shared by all tabs -----
  function setPreset(kind, apply = true) {
    const today = isoDateNDaysAgo(0);
    if (kind === 7 || kind === 28 || kind === 90) {
      setFrom(isoDateNDaysAgo(kind - 1));
      setTo(today);
      if (apply) loadTable();
      return;
    }
    if (kind === "month") {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
      const last  = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
      setFrom(first); setTo(last);
      if (apply) loadTable();
      return;
    }
    if (kind === "all") {
      setFrom(isoDateNDaysAgo(180)); setTo(today);
      if (apply) loadTable();
      return;
    }
  }

  // ----- CSV for table -----
  function exportCsv(rows) {
    const header = ["ts","type","value","stage","unit","source"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const row = [
        new Date(r.ts).toISOString(),
        r?.type ?? "",
        r?.type === "sleep" && typeof r.value === "number" ? r.value : (r?.value ?? ""),
        r?.type === "sleep" ? (canonicalStage(r?.payload?.stage) ?? "") : "",
        r?.unit ?? "",
        r?.meta?.source ?? "",
      ].map((s) => `"${String(s).replace(/"/g, '""')}"`);
      lines.push(row.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "my_health_data.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // Load dashboard data when admin selects a user or changes date range
  useEffect(() => {
    if (isAdmin && adminSelectedUid) {
      loadDashboardData();
    }
  }, [adminSelectedUid, isAdmin, from, to]);

  // Get selected user info for display
  const selectedUser = adminSelectedUid ? users.items.find(u => u._id === adminSelectedUid) : null;
  const selectedUserName = selectedUser 
    ? (selectedUser.displayName || [selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(" ") || selectedUser.email || selectedUser._id)
    : null;

  // Process data for dashboard visualizations
  const dashboardStepsDaily = useMemo(() => {
    if (!isAdmin || !adminSelectedUid) return [];
    const days = [];
    const map = {};
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
      const k = d.toISOString().slice(0, 10);
      days.push(k);
      map[k] = 0;
    }
    
    for (const ev of stepsEvents) {
      const v = Number(ev.value);
      if (!Number.isNaN(v)) {
        const k = new Date(ev.ts).toISOString().slice(0, 10);
        if (map[k] != null) map[k] += v;
      }
    }
    
    return days.map(d => ({
      date: d,
      label: new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" }),
      steps: map[d] || 0
    }));
  }, [stepsEvents, isAdmin, adminSelectedUid]);

  const dashboardHeartDaily = useMemo(() => {
    if (!isAdmin || !adminSelectedUid) return [];
    const agg = {};
    for (const ev of heartEvents) {
      const v = typeof ev.value === "number" ? ev.value : Number(ev.value);
      if (!Number.isNaN(v)) {
        const k = new Date(ev.ts).toISOString().slice(0, 10);
        if (!agg[k]) agg[k] = { sum: 0, n: 0 };
        agg[k].sum += v; agg[k].n += 1;
      }
    }
    return Object.entries(agg).sort(([a],[b]) => a.localeCompare(b))
      .map(([date, { sum, n }]) => ({ date, bpm: Math.round(sum / n), label: ddMMM(date) }));
  }, [heartEvents, isAdmin, adminSelectedUid]);

  // ---- Admin dashboard: Heart rate zones over time ----
  const heartChartData = useMemo(() => {
    if (!isAdmin || !adminSelectedUid) return [];

    // Fetch heart rate data from health data table using applied date range
    const heartRateFromTable = events.filter(e => e.type === "heart_rate");

    // Prepare heart rate by day from health data table to find average daily values
    const processedHeartRate = {};
    for (const h of heartRateFromTable) {
      const v = typeof h.value === "number" ? h.value : Number(h.value);
      if (!Number.isFinite(v)) continue;
      const date = new Date(h.ts).toISOString().slice(0, 10);
      if (!processedHeartRate[date]) processedHeartRate[date] = { sum: 0, n: 0, min: Infinity, max: 0 };
      const row = processedHeartRate[date];
      row.sum += v; row.n += 1; row.min = Math.min(row.min, v); row.max = Math.max(row.max, v);
    }
    Object.keys(processedHeartRate).forEach(d => {
      const row = processedHeartRate[d];
      row.avg = Math.round(row.sum / (row.n || 1));
      row.min = row.min === Infinity ? row.avg : row.min;
    });

    // Find days with heart rate data within the applied date range
    const allDates = enumerateDays(from, to);
    const daysWithHeartRateData = allDates.filter(date => {
      return processedHeartRate[date] && processedHeartRate[date].n > 0;
    });

    // Calculate the number of days in the applied date range
    const daysDiff = Math.ceil((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
    
    // Handle 7 day date range logic:
    // - If date range is 0-7 days: show all days with heart rate data in the range
    // - If date range is more than 7 days: show only the 7 most recent days with heart rate data
    let selectedDays;
    if (daysDiff > 7) {
      selectedDays = daysWithHeartRateData
        .sort((a, b) => b.localeCompare(a)) // Sort by date (most recent first)
        .slice(0, 7); // Take the first 7 days
    } else {
      // For ranges 0-7 days, show all days with heart rate data (chronologically sorted)
      selectedDays = daysWithHeartRateData
        .sort((a, b) => a.localeCompare(b)); // Sort chronologically for smaller ranges
    }

    // If no days with heart rate data found, return empty array
    if (selectedDays.length === 0) {
      return [];
    }
    const overallAvgHeartRate = (() => {
      const avgs = Object.values(processedHeartRate).map(d => d.avg);
      return avgs.length ? Math.round(avgs.reduce((s, v) => s + v, 0) / avgs.length) : 75;
    })();
    const averageDailyHeartRate = (() => {
      const avgs = Object.values(processedHeartRate).map(d => d.avg);
      return avgs.length ? Math.round(avgs.reduce((s, v) => s + v, 0) / avgs.length) : overallAvgHeartRate;
    })();

    // Compute ALL-TIME zone statistics from ALL heart rate data for this user
    const allTimeZoneStats = { rest: [], light: [], moderate: [], hard: [] };
    const maxHR = userProfile?.dob ? 220 - calculateAge(userProfile.dob) : 155;
    
    // Use 50% max heart rate as rest zone threshold for older adults
    const restZoneEnd = Math.round(maxHR * 0.50);
    const lightZoneStart = restZoneEnd;
    const lightZoneEnd = Math.round(maxHR * 0.65);
    const moderateZoneEnd = Math.round(maxHR * 0.75);
    const hardZoneEnd = Math.round(maxHR * 0.95);

    // Process ALL heart rate data to compute all-time zone statistics
    for (const h of heartRateFromTable) {
      const v = typeof h.value === "number" ? h.value : Number(h.value);
      if (!Number.isFinite(v)) continue;
      
      // Categorize by zones using all-time thresholds
      if (v < restZoneEnd) {
        allTimeZoneStats.rest.push(v);
      } else if (v >= lightZoneStart && v <= lightZoneEnd) {
        allTimeZoneStats.light.push(v);
      } else if (v > lightZoneEnd && v <= moderateZoneEnd) {
        allTimeZoneStats.moderate.push(v);
      } else if (v > moderateZoneEnd && v <= hardZoneEnd) {
        allTimeZoneStats.hard.push(v);
      }
    }

    // Compute all-time min/max/avg for each zone
    const allTimeRestingMin = allTimeZoneStats.rest.length ? Math.round(Math.min(...allTimeZoneStats.rest)) : null;
    const allTimeRestingMax = allTimeZoneStats.rest.length ? Math.round(Math.max(...allTimeZoneStats.rest)) : null;
    const allTimeRestingAvg = allTimeZoneStats.rest.length ? Math.round(allTimeZoneStats.rest.reduce((s,v)=>s+v,0) / allTimeZoneStats.rest.length) : null;
    
    const allTimeLightMin = allTimeZoneStats.light.length ? Math.round(Math.min(...allTimeZoneStats.light)) : null;
    const allTimeLightMax = allTimeZoneStats.light.length ? Math.round(Math.max(...allTimeZoneStats.light)) : null;
    const allTimeLightAvg = allTimeZoneStats.light.length ? Math.round(allTimeZoneStats.light.reduce((s,v)=>s+v,0) / allTimeZoneStats.light.length) : null;
    
    const allTimeModerateMin = allTimeZoneStats.moderate.length ? Math.round(Math.min(...allTimeZoneStats.moderate)) : null;
    const allTimeModerateMax = allTimeZoneStats.moderate.length ? Math.round(Math.max(...allTimeZoneStats.moderate)) : null;
    const allTimeModerateAvg = allTimeZoneStats.moderate.length ? Math.round(allTimeZoneStats.moderate.reduce((s,v)=>s+v,0) / allTimeZoneStats.moderate.length) : null;
    
    const allTimeHardMin = allTimeZoneStats.hard.length ? Math.round(Math.min(...allTimeZoneStats.hard)) : null;
    const allTimeHardMax = allTimeZoneStats.hard.length ? Math.round(Math.max(...allTimeZoneStats.hard)) : null;
    const allTimeHardAvg = allTimeZoneStats.hard.length ? Math.round(allTimeZoneStats.hard.reduce((s,v)=>s+v,0) / allTimeZoneStats.hard.length) : null;

    // Compute daily resting HR stats from resting_heart_rate data for the selected range
    const processedRestingByDay = {};
    for (const r of restingHeartRateData) {
      const v = typeof r.value === "number" ? r.value : Number(r.value);
      if (!Number.isFinite(v)) continue;
      const date = new Date(r.ts).toISOString().slice(0, 10);
      if (!processedRestingByDay[date]) processedRestingByDay[date] = { sum: 0, n: 0 };
      processedRestingByDay[date].sum += v; processedRestingByDay[date].n += 1;
    }
    const restingDailyAverages = (selectedDays || []).map(d => {
      const row = processedRestingByDay[d];
      return row && row.n > 0 ? Math.round(row.sum / row.n) : null;
    }).filter(v => v != null);
    const restingDailyMin = restingDailyAverages.length ? Math.min(...restingDailyAverages) : null;
    const restingDailyMax = restingDailyAverages.length ? Math.max(...restingDailyAverages) : null;
    const restingDailyAvg = restingDailyAverages.length ? Math.round(restingDailyAverages.reduce((s,v)=>s+v,0) / restingDailyAverages.length) : null;

    const daily = {};
    for (const h of heartRateFromTable) {
      const v = typeof h.value === "number" ? h.value : Number(h.value);
      if (!Number.isFinite(v)) continue;
      const date = new Date(h.ts).toISOString().slice(0, 10);
      
      // Only process days that are in our selected days
      if (!selectedDays.includes(date)) continue;
      
      const restAverage = processedHeartRate[date]?.avg ?? overallAvgHeartRate;
      const ensure = () => (daily[date] ||= { overall: { sum:0,n:0,max:0,min:Infinity }, rest:{sum:0,n:0,max:0,min:Infinity}, light:{sum:0,n:0,max:0,min:Infinity}, moderate:{sum:0,n:0,max:0,min:Infinity}, hard:{sum:0,n:0,max:0,min:Infinity}, restingHR: restAverage });
      ensure();
      daily[date].overall.sum += v; daily[date].overall.n += 1; daily[date].overall.max = Math.max(daily[date].overall.max, v); daily[date].overall.min = Math.min(daily[date].overall.min, v);
      if (v < restZoneEnd) { const z = daily[date].rest; z.sum += v; z.n += 1; z.max = Math.max(z.max, v); z.min = Math.min(z.min, v); }
      else if (v >= lightZoneStart && v <= lightZoneEnd) { const z = daily[date].light; z.sum += v; z.n += 1; z.max = Math.max(z.max, v); z.min = Math.min(z.min, v); }
      else if (v > lightZoneEnd && v <= moderateZoneEnd) { const z = daily[date].moderate; z.sum += v; z.n += 1; z.max = Math.max(z.max, v); z.min = Math.min(z.min, v); }
      else if (v > moderateZoneEnd && v <= hardZoneEnd) { const z = daily[date].hard; z.sum += v; z.n += 1; z.max = Math.max(z.max, v); z.min = Math.min(z.min, v); }
    }

    const rows = Object.entries(daily).map(([date, z]) => ({
      date,
      label: new Date(date).toLocaleDateString([], { month: "short", day: "numeric" }),
      overall: z.overall.n ? Math.round(z.overall.sum / z.overall.n) : 0,
      rest: z.rest.n ? Math.round(z.rest.sum / z.rest.n) : 0,
      light: z.light.n ? Math.round(z.light.sum / z.light.n) : 0,
      moderate: z.moderate.n ? Math.round(z.moderate.sum / z.moderate.n) : 0,
      hard: z.hard.n ? Math.round(z.hard.sum / z.hard.n) : 0,
      restingHR: z.restingHR
    })).sort((a,b)=>a.date.localeCompare(b.date));

    rows.zoneThresholds = {
      averageDailyHeartRate,
      lightZoneStart,
      lightZoneEnd,
      moderateZoneEnd,
      hardZoneEnd,
      maxHR,
      restZoneEnd, // Now set to 50% max HR for older adults
      restingDailyMin,
      restingDailyMax,
      restingDailyAvg,
      // All-time zone statistics
      allTimeRestingMin,
      allTimeRestingMax,
      allTimeRestingAvg,
      allTimeLightMin,
      allTimeLightMax,
      allTimeLightAvg,
      allTimeModerateMin,
      allTimeModerateMax,
      allTimeModerateAvg,
      allTimeHardMin,
      allTimeHardMax,
      allTimeHardAvg
    };
    return rows;
  }, [isAdmin, adminSelectedUid, events, userProfile, from, to, restingHeartRateData, maxAllTimeRestingHR]);

  const heartZoneStats = useMemo(() => {
    const zones = { rest: {avg:0,max:0,min:0,count:0}, light:{avg:0,max:0,min:0,count:0}, moderate:{avg:0,max:0,min:0,count:0}, hard:{avg:0,max:0,min:0,count:0} };
    const keys = Object.keys(zones);
    if (!heartChartData.length || !heartChartData.zoneThresholds) return zones;
    
    const thresholds = heartChartData.zoneThresholds;
    
    // Use all-time zone statistics instead of selected period data
    zones.rest = {
      avg: thresholds.allTimeRestingAvg || 0,
      max: thresholds.allTimeRestingMax || 0,
      min: thresholds.allTimeRestingMin || 0,
      count: thresholds.allTimeRestingAvg ? 1 : 0 // Indicate data exists
    };
    
    zones.light = {
      avg: thresholds.allTimeLightAvg || 0,
      max: thresholds.allTimeLightMax || 0,
      min: thresholds.allTimeLightMin || 0,
      count: thresholds.allTimeLightAvg ? 1 : 0
    };
    
    zones.moderate = {
      avg: thresholds.allTimeModerateAvg || 0,
      max: thresholds.allTimeModerateMax || 0,
      min: thresholds.allTimeModerateMin || 0,
      count: thresholds.allTimeModerateAvg ? 1 : 0
    };
    
    zones.hard = {
      avg: thresholds.allTimeHardAvg || 0,
      max: thresholds.allTimeHardMax || 0,
      min: thresholds.allTimeHardMin || 0,
      count: thresholds.allTimeHardAvg ? 1 : 0
    };
    
    return zones;
  }, [heartChartData]);

  const ZONE_COLORS = { rest: "#2ea0d6", light: "#2ecc71", moderate: "#f1c40f", hard: "#e67e22" };

  const dashboardSleepDaily = useMemo(() => {
    if (!isAdmin || !adminSelectedUid) return { rows: [], stages: [] };
    const byDay = {};
    const addStage = (s) => {
      const canon = canonicalStage(s);
      if (canon === "In bed") return null;
      return canon;
    };

    // Use sleep data from health data table with applied date range
    const sleepFromTable = events.filter(e => e.type === "sleep");

    for (const ev of sleepFromTable) {
      const mins = typeof ev.value === "number" ? ev.value : Number(ev.value);
      if (!Number.isNaN(mins)) {
        const k = new Date(ev.ts).toISOString().slice(0, 10);
        const stage = addStage(ev?.payload?.stage);
        if (stage) {
          byDay[k] ??= {};
          byDay[k][stage] = (byDay[k][stage] ?? 0) + mins;
        }
      }
    }

    // Find days with sleep data within the applied date range
    const allDates = enumerateDays(from, to);
    const daysWithSleepData = allDates.filter(date => {
      const totalSleep = (byDay[date]?.Awake || 0) + (byDay[date]?.REM || 0) + (byDay[date]?.Core || 0) + (byDay[date]?.Deep || 0);
      return totalSleep > 0;
    });

    // Calculate the number of days in the applied date range
    const daysDiff = Math.ceil((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
    
    // If date range is more than 7 days, show only the 7 most recent days with sleep data
    // Otherwise, show all days with sleep data in the range (up to 7 days)
    let selectedDays;
    if (daysDiff > 7) {
      selectedDays = daysWithSleepData
        .sort((a, b) => b.localeCompare(a)) // Sort by date (most recent first)
        .slice(0, 7); // Take the first 7 days
    } else {
      selectedDays = daysWithSleepData
        .sort((a, b) => a.localeCompare(b)); // Sort chronologically for smaller ranges
    }

    const stageOrder = ["Awake", "REM", "Core", "Deep"];
    const rows = selectedDays.map(d => {
      const base = { date: d, label: ddMMM(d) };
      for (const s of stageOrder) base[s] = byDay[d]?.[s] ?? 0;
      return base;
    });
    
    return { rows, stages: stageOrder };
  }, [events, from, to, isAdmin, adminSelectedUid]);

  // ---- Admin dashboard: Sleep stats (hours + percentages)
  const dashboardSleepStats = useMemo(() => {
    const rows = dashboardSleepDaily.rows || [];
    if (!rows.length) {
      return {
        totalHours: 0,
        averageHours: 0,
        daysWithData: 0,
        stageAvgHours: { REM: 0, Core: 0, Deep: 0, Awake: 0 },
        stagePercents: { REM: 0, Core: 0, Deep: 0, Awake: 0 },
      };
    }
    const sumStages = (r) => (r.REM || 0) + (r.Core || 0) + (r.Deep || 0) + (r.Awake || 0);
    const perDayTotalsMin = rows.map(sumStages);
    const daysWithData = perDayTotalsMin.filter((m) => m > 0).length || rows.length;
    const totalMinutes = perDayTotalsMin.reduce((s, m) => s + m, 0);
    const averageMinutes = totalMinutes / (daysWithData || 1);
    const stageTotalsMin = {
      REM: rows.reduce((s, r) => s + (r.REM || 0), 0),
      Core: rows.reduce((s, r) => s + (r.Core || 0), 0),
      Deep: rows.reduce((s, r) => s + (r.Deep || 0), 0),
      Awake: rows.reduce((s, r) => s + (r.Awake || 0), 0),
    };
    const round1 = (n) => Math.round(n * 10) / 10;
    const toHours = (m) => round1(m / 60);
    const avgHours = round1(averageMinutes / 60);
    const stageAvgHours = {
      REM: round1((stageTotalsMin.REM / (daysWithData || 1)) / 60),
      Core: round1((stageTotalsMin.Core / (daysWithData || 1)) / 60),
      Deep: round1((stageTotalsMin.Deep / (daysWithData || 1)) / 60),
      Awake: round1((stageTotalsMin.Awake / (daysWithData || 1)) / 60),
    };
    const pct = (part) => (avgHours > 0 ? Math.round((part / avgHours) * 100) : 0);
    const stagePercents = {
      REM: pct(stageAvgHours.REM),
      Core: pct(stageAvgHours.Core),
      Deep: pct(stageAvgHours.Deep),
      Awake: pct(stageAvgHours.Awake),
    };
    return {
      totalHours: toHours(totalMinutes),
      averageHours: avgHours,
      daysWithData,
      stageAvgHours,
      stagePercents,
    };
  }, [dashboardSleepDaily]);

  // Sleep insights state
  const [sleepInsightTab, setSleepInsightTab] = useState("deep");

  // Dynamic summary data calculation based on most recent days with activity data
  const sevenDaySummaryData = useMemo(() => {
    if (!isAdmin || !adminSelectedUid) return null;
    
    // Calculate date range from table filters
    const fromDate = new Date(from + "T00:00:00");
    const toDate = new Date(to + "T23:59:59");
    
    // Generate all dates in the selected range
    const allDates = [];
    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + 86400000)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
    
    // Find all days with activity data
    const daysWithActivityData = allDates.map(date => {
      // Calculate stand hours for this date
      const standHours = standMinutesData
        .filter(item => new Date(item.ts).toISOString().slice(0, 10) === date)
        .reduce((hours, item) => {
          const hour = new Date(item.ts).getHours();
          return hours.add(hour);
        }, new Set()).size;

      const standMinutes = standMinutesData
        .filter(item => new Date(item.ts).toISOString().slice(0, 10) === date)
        .reduce((sum, item) => sum + (Number(item.value) || 0), 0);
      
      // Calculate HRV for this date
      const hrvValues = hrvData
        .filter(item => new Date(item.ts).toISOString().slice(0, 10) === date)
        .map(item => Number(item.value))
        .filter(val => !isNaN(val));
      const avgHRV = hrvValues.length > 0 ? Math.round(hrvValues.reduce((sum, val) => sum + val, 0) / hrvValues.length) : 0;
      const maxHRV = hrvValues.length > 0 ? Math.max(...hrvValues) : 0;

      // Calculate energy for this date
      const totalEnergy = [...restingEnergyData, ...activeEnergyData]
        .filter(item => new Date(item.ts).toISOString().slice(0, 10) === date)
        .reduce((sum, item) => sum + (Number(item.value) || 0), 0);

      return {
        date,
        standHours,
        standMinutes,
        avgHRV,
        maxHRV,
        totalEnergy,
        hasActivityData: standHours > 0 || avgHRV > 0 || totalEnergy > 0
      };
    }).filter(day => day.hasActivityData); // Only days with activity data
    
    // Sort by date (most recent first) and take the 7 most recent
    const mostRecentDays = daysWithActivityData
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 7);
    
    if (mostRecentDays.length === 0) {
      return null; // No activity data found
    }
    
    // Calculate averages and totals for the most recent days
    const avgStandHours = mostRecentDays.reduce((sum, day) => sum + day.standHours, 0) / mostRecentDays.length;
    const avgStandMinutes = mostRecentDays.reduce((sum, day) => sum + day.standMinutes, 0) / mostRecentDays.length;
    const avgMinPerHour = avgStandMinutes / 24; // Assuming 24-hour day
    
    const avgHRV = mostRecentDays.reduce((sum, day) => sum + day.avgHRV, 0) / mostRecentDays.length;
    const highestHRV = Math.max(...mostRecentDays.map(day => day.maxHRV));
    
    const avgEnergy = mostRecentDays.reduce((sum, day) => sum + day.totalEnergy, 0) / mostRecentDays.length;
    const totalEnergyPeriod = mostRecentDays.reduce((sum, day) => sum + day.totalEnergy, 0);
    
    // Get the date range of the most recent days
    const sortedDates = mostRecentDays.map(day => day.date).sort();
    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];
    
    return {
      dateRange: { 
        from: earliestDate, 
        to: latestDate, 
        daysWithData: mostRecentDays.length,
        totalDaysInRange: allDates.length
      },
      standHours: {
        dailyAvg: avgStandHours,
        avgTotalPerDay: Math.round(avgStandMinutes),
        avgMinPerHour: Math.round(avgMinPerHour * 10) / 10,
        target: "120+ min/day, 10+ min/hour (12 hourly intervals = 12 hr)"
      },
      hrv: {
        periodAvg: Math.round(avgHRV),
        highest: highestHRV,
        normalRange: "40-60 ms for older adults"
      },
      energy: {
        periodAvg: Math.round(avgEnergy),
        totalPeriod: Math.round(totalEnergyPeriod),
        description: "Active + Resting Energy"
      }
    };
  }, [isAdmin, adminSelectedUid, standMinutesData, hrvData, restingEnergyData, activeEnergyData, from, to]);


  // Activity rings data based on most recent days with activity data
  const activityRingsData = useMemo(() => {
    if (!isAdmin || !adminSelectedUid) return [];
    
    // Calculate date range from table filters
    const fromDate = new Date(from + "T00:00:00");
    const toDate = new Date(to + "T23:59:59");
    
    // Generate all dates in the selected range
    const allDates = [];
    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + 86400000)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
    
    // Find all days with activity data using health data table
    const daysWithActivityData = allDates.map(date => {
      // Calculate stand hours for this date from health data table
      const standMinutesFromTable = events.filter(e => e.type === "stand_minutes" && new Date(e.ts).toISOString().slice(0, 10) === date);
      const standHours = standMinutesFromTable
        .reduce((hours, item) => {
          const hour = new Date(item.ts).getHours();
          return hours.add(hour);
        }, new Set()).size;

      // Calculate average HRV for this date from health data table
      const hrvFromTable = events.filter(e => e.type === "heart_rate_variability" && new Date(e.ts).toISOString().slice(0, 10) === date);
      const hrvValues = hrvFromTable
        .map(item => Number(item.value))
        .filter(val => !isNaN(val));
      const avgHRV = hrvValues.length > 0 ? Math.round(hrvValues.reduce((sum, val) => sum + val, 0) / hrvValues.length) : 0;

      // Calculate total energy for this date from health data table
      const energyFromTable = events.filter(e => (e.type === "resting_energy" || e.type === "active_energy") && new Date(e.ts).toISOString().slice(0, 10) === date);
      const totalEnergy = energyFromTable
        .reduce((sum, item) => sum + (Number(item.value) || 0), 0);

      return {
        date,
        standHours,
        hrv: avgHRV,
        totalEnergy: Math.round(totalEnergy),
        hasActivityData: standHours > 0 || avgHRV > 0 || totalEnergy > 0
      };
    }).filter(day => day.hasActivityData); // Only days with activity data
    
    // Calculate the number of days in the applied date range
    const daysDiff = Math.ceil((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
    
    // If date range is more than 7 days, show only the 7 most recent days with activity data
    // Otherwise, show all days with activity data in the range (up to 7 days)
    let selectedDays;
    if (daysDiff > 7) {
      selectedDays = daysWithActivityData
        .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort by date (most recent first)
        .slice(0, 7); // Take the first 7 days
    } else {
      selectedDays = daysWithActivityData
        .sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort chronologically for smaller ranges
    }

    return selectedDays.map(day => ({
      date: day.date,
      label: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      standHours: day.standHours,
      hrv: day.hrv,
      totalEnergy: day.totalEnergy,
      // Ring progress calculations (0-1) - Updated based on 7-day summary targets
      standProgress: Math.min(day.standHours / 12, 1), // Target: 12 hours (from screenshot)
      hrvProgress: Math.min(day.hrv / 60, 1), // Target: 60ms (highest from screenshot)
      energyProgress: Math.min(day.totalEnergy / 8838, 1) // Target: 8838kJ (7-day average from screenshot)
    }));
  }, [isAdmin, adminSelectedUid, events, from, to]);

  // ---- Admin dashboard: enrich steps with rolling averages + stats ----
  const dashboardStepsWithAvg = useMemo(() => {
    if (!dashboardStepsDaily.length) return [];

    const windows = [7, 21, 90];
    const sums = new Array(dashboardStepsDaily.length).fill(0);
    const out = dashboardStepsDaily.map(d => ({ ...d }));

    // prefix sums for O(1) range sum
    const prefix = [0];
    for (let i = 0; i < dashboardStepsDaily.length; i++) {
      prefix[i + 1] = prefix[i] + (dashboardStepsDaily[i].steps || 0);
    }

    const avgAt = (endIdx, window) => {
      const startIdx = Math.max(0, endIdx - window + 1);
      const count = endIdx - startIdx + 1;
      const sum = prefix[endIdx + 1] - prefix[startIdx];
      return Math.round(sum / count);
    };

    for (let i = 0; i < out.length; i++) {
      out[i].ma7  = avgAt(i, 7);
      out[i].ma21 = avgAt(i, 21);
      out[i].ma90 = avgAt(i, 90);
    }
    return out;
  }, [dashboardStepsDaily]);

  const dashboardStepsStats = useMemo(() => {
    if (!dashboardStepsDaily.length) return { total: 0, avg: 0, best: null };
    const total = dashboardStepsDaily.reduce((s, d) => s + (d.steps || 0), 0);
    const days = dashboardStepsDaily.length;
    const avg = Math.round(total / (days || 1));
    const best = dashboardStepsDaily.reduce((m, d) => (d.steps > (m?.steps || 0) ? d : m), null);
    return { total, avg, best };
  }, [dashboardStepsDaily]);

  return (
    <Container fluid className="py-3">
      <style jsx>{`
        .admin-dashboard-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .admin-dashboard-card .card-header {
          background: rgba(255,255,255,0.1);
          border-bottom: 1px solid rgba(255,255,255,0.2);
        }
        .admin-dashboard-card .btn-outline-light:hover {
          background: rgba(255,255,255,0.2);
          border-color: rgba(255,255,255,0.3);
        }
        .activity-ring {
          width: 80px;
          height: 80px;
          position: relative;
        }
        .activity-ring svg {
          width: 100%;
          height: 100%;
        }
        .activity-ring-label {
          font-size: 0.75rem;
          font-weight: 600;
          margin-top: 0.5rem;
        }
        .activity-ring-value {
          font-size: 0.875rem;
          font-weight: 500;
          margin-top: 0.25rem;
        }
        .activity-rings-container {
          display: flex;
          gap: 1rem;
          overflow-x: auto;
          padding: 1rem 0;
        }
        .activity-ring-item {
          flex-shrink: 0;
          text-align: center;
          min-width: 100px;
          transition: transform 0.3s ease-in-out;
        }
        .activity-ring-item:hover {
          transform: translateY(-5px);
        }
        .activity-rings-container .activity-ring {
          transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .activity-rings-container .activity-ring:hover {
          transform: scale(1.05);
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes progressFill {
          0% { width: 0%; }
          100% { width: var(--target-width); }
        }
        @keyframes fadeInUp {
          0% { 
            opacity: 0; 
            transform: translateY(20px); 
          }
          100% { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
        .walking-heatmap {
          width: 100%;
          height: 200px;
        }
        .hour-labels-row {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          height: 30px;
        }
        .day-label-spacer {
          width: 50px;
          flex-shrink: 0;
        }
        .heatmap-container {
          display: flex;
          height: calc(100% - 38px);
        }
        .day-labels-column {
          display: grid;
          grid-template-rows: repeat(7, 1fr);
          width: 50px;
          flex-shrink: 0;
          padding-right: 8px;
          gap: 2px;
        }
        .day-label {
          font-size: 10px;
          font-weight: 600;
          text-align: right;
          color: #666;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .heatmap-grid {
          display: grid;
          grid-template-columns: repeat(18, 1fr);
          grid-template-rows: repeat(7, 1fr);
          gap: 2px;
          flex: 1;
          height: 100%;
        }
        .heatmap-cell {
          border-radius: 50%;
          width: 12px;
          height: 12px;
          cursor: pointer;
          transition: transform 0.2s ease;
          justify-self: center;
          align-self: center;
        }
        .heatmap-cell:hover {
          transform: scale(1.2);
          z-index: 10;
          position: relative;
        }
        .hour-label {
          font-size: 9px;
          text-align: center;
          color: #666;
          transform: rotate(-45deg);
          transform-origin: center;
          flex: 1;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
      {err && <Alert variant="danger" className="mb-3">{err}</Alert>}

      {/* Admin User Selection */}
      {isAdmin && (
        <Card className="border-info bg-light mb-4">
          <Card.Body>
            <h5 className="mb-3 text-info">🔍 Admin: Select User to View Summary Data</h5>
            <Row className="g-3">
              <Col md={8}>
                <Form.Group>
                  <Form.Label className="fw-bold">Search Users</Form.Label>
                  <div className="d-flex gap-2">
                    <Form.Control 
                      placeholder="Search by name, email, or UID"
                      onChange={(e) => {
                        const query = e.target.value;
                        if (query.length > 2) {
                          searchUsers(query);
                        } else if (query.length === 0) {
                          searchUsers("");
                        }
                      }}
                    />
                    <Button 
                      variant="outline-secondary" 
                      onClick={() => searchUsers("")}
                      disabled={loadingUsers}
                    >
                      {loadingUsers ? "Loading..." : "Refresh"}
                    </Button>
                  </div>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="fw-bold">Select User UID</Form.Label>
                  <Form.Select 
                    value={adminSelectedUid}
                    onChange={(e) => setAdminSelectedUid(e.target.value)}
                    disabled={users.items.length === 0}
                  >
                    <option value="">-- View My Own Data --</option>
                    {users.items.map(u => {
                      const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown";
                      return (
                        <option key={u._id} value={u._id}>
                          {name} • {u.email}
                        </option>
                      );
                    })}
                  </Form.Select>
                  {selectedUserName && (
                    <Form.Text className="text-success fw-bold">
                      ✓ Viewing: {selectedUserName}
                    </Form.Text>
                  )}
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      {/* User Dashboard Access Instructions */}
      {isAdmin && (
        <Card className="border-primary mb-4">
          <Card.Body>
            <h6 className="mb-3 text-primary">📋 Steps to Access User Dashboards</h6>
            <div className="small">
              <ol className="mb-0">
                <li className="mb-2">
                  <strong>Select the user UID</strong> from the dropdown menu or find the user UID using the search filter above
                </li>
                <li className="mb-2">
                  <strong>Select the date range/period</strong> for the health data table to apply towards visualisations (best option is to filter for 7 days, especially if the user has been uploading data consistently i.e. ideally on a daily basis)
                </li>
                <li className="mb-2">
                  <strong>Click "Apply" button</strong> to update health data table
                </li>
                <li className="mb-0">
                  <strong>Navigate to the Dashboard tab</strong> on the Summary page
                </li>
              </ol>
            </div>
          </Card.Body>
        </Card>
      )}

      <Tabs
        defaultActiveKey="table"
        id="summary-tabs"
        onSelect={(k) => {
          if (k === "steps" && stepsEvents.length === 0) loadSteps();
          if (k === "heart" && heartEvents.length === 0) loadHeart();
          if (k === "sleep" && sleepEvents.length === 0) loadSleep();
          if (k === "dashboard" && isAdmin && adminSelectedUid) {
            loadSteps();
            loadHeart();
            loadSleep();
            loadDashboardData();
          }
        }}
      >
        {/* -------- TABLE TAB -------- */}
        <Tab eventKey="table" title="Table">
          <Card className="shadow-sm mt-2">
            <Card.Body className="p-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h3 className="mb-0">
                  {isAdmin && selectedUserName ? `${selectedUserName}'s Health Data` : "My Health Data"}
                  {isAdmin && selectedUserName && (
                    <small className="text-muted ms-2">(UID: {adminSelectedUid})</small>
                  )}
                </h3>
                <Form.Select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  size="sm"
                  style={{ minWidth: 190 }}
                  title="Sort"
                >
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

              {/* Filters */}
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Form.Select value={tableType} onChange={(e) => setTableType(e.target.value)} style={{ maxWidth: 220 }}>
                  <option value="">All types</option>
                  <option value="steps">Steps</option>
                  <option value="sleep">Sleep</option>
                  <option value="stand_minutes">Standing</option>
                  <option value="heart_rate">Heart Rate</option>
                  <option value="resting_heart_rate">Heart Rate - Resting</option>
                  <option value="walking_heart_rate_average">Heart Rate - Walking Average</option>
                  <option value="heart_rate_variability">Heart Rate Variability</option>
                  <option value="walking_asymmetry">Walking Asymmetry</option>
                  <option value="walking_steadiness">Walking Steadiness</option>
                  <option value="walking_speed">Walking Speed</option>
                  <option value="walking_step_length">Walking Step Length</option>
                  <option value="double_support_time">Double Support Time</option>
                  <option value="active_energy">Active Energy kJ</option>
                  <option value="resting_energy">Resting Energy kJ</option>
                  {/* <option value="blood_pressure">Blood Pressure (beta)</option> */}

                </Form.Select>

                <Form.Control type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 160 }} />
                <Form.Control type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 160 }} />

                <Button onClick={loadTable} disabled={loadingTable}>
                  {loadingTable ? "Loading…" : "Apply"}
                </Button>

                <Dropdown as={ButtonGroup}>
                  <Button variant="outline-secondary">Presets</Button>
                  <Dropdown.Toggle split variant="outline-secondary" />
                  <Dropdown.Menu>
                    <Dropdown.Item onClick={() => setPreset(7)}>Last 7 days</Dropdown.Item>
                    <Dropdown.Item onClick={() => setPreset(28)}>Last 28 days</Dropdown.Item>
                    <Dropdown.Item onClick={() => setPreset(90)}>Last 90 days</Dropdown.Item>
                    <Dropdown.Item onClick={() => setPreset("month")}>This month</Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={() => setPreset("all")}>All (last ~6 mo)</Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>

                <Button
                  variant="outline-secondary"
                  onClick={() => exportCsv(sortedEvents)}
                  disabled={!sortedEvents.length}
                  className="ms-auto"
                >
                  Export CSV
                </Button>
              </div>

              {/* Table */}
              <div className="border rounded-3 p-2">
                <Table responsive size="sm" hover className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Value</th>
                      <th>Stage</th>
                      <th>Unit</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((e, idx) => (
                      <tr key={e._id || `${e.ts}-${e.type}-${idx}`}>
                        <td>{new Date(e.ts).toLocaleString()}</td>
                        <td>{e.type}</td>
                        <td>{prettyValue(e)}</td>
                        <td>{canonicalStage(e?.payload?.stage) ?? ""}</td>
                        <td>{e.unit || ""}</td>
                        <td>{e.meta?.source || ""}</td>
                      </tr>
                    ))}
                    {!sortedEvents.length && !loadingTable && (
                      <tr><td colSpan={6} className="text-muted text-center">No data in this range.</td></tr>
                    )}
                  </tbody>
                </Table>

                {/* Pagination controls */}
                <div className="d-flex align-items-center gap-2 mt-2">
                  <Form.Select
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                    style={{ width: 140 }}
                    size="sm"
                    title="Rows per page"
                  >
                    {[50,100,200,500,1000].map(n => <option key={n} value={n}>{n} / page</option>)}
                  </Form.Select>

                  <div className="ms-2 small text-muted">
                    {showingFrom}-{showingTo} of {sortedEvents.length}
                  </div>

                  <div className="ms-auto d-flex gap-1">
                    <Button
                      variant="outline-secondary" size="sm"
                      disabled={clampedPage === 0}
                      onClick={() => setPageIndex(0)}
                    >⏮</Button>
                    <Button
                      variant="outline-secondary" size="sm"
                      disabled={clampedPage === 0}
                      onClick={() => setPageIndex(p => Math.max(0, p - 1))}
                    >Prev</Button>
                    <div className="px-2 small d-flex align-items-center">
                      Page {clampedPage + 1} / {pageCount}
                    </div>
                    <Button
                      variant="outline-secondary" size="sm"
                      disabled={clampedPage >= pageCount - 1}
                      onClick={() => setPageIndex(p => Math.min(pageCount - 1, p + 1))}
                    >Next</Button>
                    <Button
                      variant="outline-secondary" size="sm"
                      disabled={clampedPage >= pageCount - 1}
                      onClick={() => setPageIndex(pageCount - 1)}
                    >⏭</Button>
                  </div>
                </div>

                {loadingTable && (
                  <div className="py-3 text-center"><Spinner animation="border" size="sm" /> Loading…</div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* -------- STEPS TAB -------- */}
        <Tab eventKey="steps" title="Steps">
          <MetricTabHeader
            title="Steps — Daily totals"
            onRefresh={loadSteps}
            loading={loadingSteps}
            from={from} to={to}
            setFrom={setFrom} setTo={setTo}
            setPreset={setPreset}
          />
          <Row className="g-3">
            <Col lg={8}>
              <Card className="shadow-sm">
                <Card.Body className="p-3">
                  <div style={{ width: "100%", height: 320 }}>
                    <ResponsiveContainer>
                      <BarChart data={stepsDaily} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => [v, "steps"]} />
                        <Bar dataKey="steps" fill={COLOR_STEPS} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={4}>
              <Card className="shadow-sm">
                <Card.Body className="p-3">
                  <h5 className="mb-3">At a glance</h5>
                  <Stat label="Total steps" value={formatNum(stepsStats.total)} />
                  <Stat label="Daily average" value={formatNum(stepsStats.avg)} />
                  <Stat label="Best day" value={stepsStats.best ? `${formatNum(stepsStats.best.steps)} (${stepsStats.best.date})` : "—"} />
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        {/* -------- HEART TAB -------- */}
        <Tab eventKey="heart" title="Heart">
          <MetricTabHeader
            title="Heart rate — Daily average (bpm)"
            onRefresh={loadHeart}
            loading={loadingHeart}
            from={from} to={to}
            setFrom={setFrom} setTo={setTo}
            setPreset={setPreset}
          />
          <Card className="shadow-sm">
            <Card.Body className="p-3">
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={heartDaily} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => [v, "bpm"]} />
                    <Line type="monotone" dataKey="bpm" dot={{ r: 3 }} strokeWidth={2} stroke={COLOR_HEART} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* -------- SLEEP TAB -------- */}
        <Tab eventKey="sleep" title="Sleep">
          <MetricTabHeader
            title="Sleep — Minutes by stage (per day)"
            onRefresh={loadSleep}
            loading={loadingSleep}
            from={from} to={to}
            setFrom={setFrom} setTo={setTo}
            setPreset={setPreset}
          />
          <Card className="shadow-sm">
            <Card.Body className="p-3">
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart data={sleepDaily.rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    {sleepDaily.stages.map((s) => (
                      <Bar
                        key={s}
                        dataKey={s}
                        stackId="sleep"
                        fill={STAGE_COLORS[s] || "#999"}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-muted small mt-2">
                Bars show total stage minutes per day. “In bed” is excluded.
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* -------- DASHBOARD TAB (Admin only) -------- */}
        {isAdmin && (
          <Tab eventKey="dashboard" title="Dashboard">
            {!adminSelectedUid ? (
              <Card className="shadow-sm mt-2">
                <Card.Body className="p-4 text-center">
                  <h4 className="text-muted">Select a user above to view their dashboard visualizations</h4>
                  <p className="text-muted">Choose a user from the dropdown menu to see their health dashboard.</p>
                </Card.Body>
              </Card>
            ) : (
              <div className="mt-2">
                <Card className="shadow-sm mb-3">
                  <Card.Header className="bg-primary text-white">
                    <h4 className="mb-0">
                      📊 Dashboard Visualizations for: {selectedUserName}
                    </h4>
                    <small>UID: {adminSelectedUid}</small>
                  </Card.Header>
                  <Card.Body>
                    <Tabs defaultActiveKey="steps" id="dashboard-sub-tabs">
                      {/* Steps Over Time */}
                      <Tab eventKey="steps" title="Steps Over Time">
                        <div className="mt-2">
                          <Row className="g-3">
                            <Col lg={8}>
                              <Card className="shadow-sm">
                          <Card.Header>
                            <div className="d-flex justify-content-between align-items-center">
                              <h5 className="mb-0">Steps — Daily totals</h5>
                              <Button size="sm" variant="outline-secondary" onClick={loadSteps} disabled={loadingSteps}>
                                {loadingSteps ? "Loading…" : "Refresh"}
                              </Button>
                            </div>
                          </Card.Header>
                          <Card.Body>
                                  <div style={{ width: "100%", height: 420 }}>
                              <ResponsiveContainer>
                                      <LineChart data={dashboardStepsWithAvg} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                                  <YAxis tick={{ fontSize: 12 }} />
                                        <Tooltip 
                                          formatter={(value, name) => [`${formatNum(value)} steps`, name]}
                                          labelFormatter={(label) => label}
                                        />
                                        <Legend />
                                        <Line type="monotone" dataKey="ma21" name="21-Day Average (Build a Habit)" stroke={COLOR_AVG_21} strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="ma7"  name="7-Day Average (Current Trend)" stroke={COLOR_AVG_7} strokeDasharray="4 4" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="ma90" name="90-Day Average (Habits become Permanent)" stroke={COLOR_AVG_90} strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="steps" name="Daily Steps" stroke={COLOR_STEPS} strokeWidth={3} dot={{ r: 3 }} />
                                      </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </Card.Body>
                        </Card>
                            </Col>
                            <Col lg={4}>
                              <Card className="shadow-sm">
                                <Card.Body className="p-3">
                                  <h5 className="mb-3">At a glance</h5>
                                  <Stat label="Total steps" value={formatNum(dashboardStepsStats.total)} />
                                  <Stat label="Daily average" value={formatNum(dashboardStepsStats.avg)} />
                                  <Stat label="Best day" value={dashboardStepsStats.best ? `${formatNum(dashboardStepsStats.best.steps)} (${dashboardStepsStats.best.date})` : "—"} />
                                </Card.Body>
                              </Card>
                            </Col>
                          </Row>
                        </div>

                        {/* Insights moved to Heart tab */}
                      </Tab>

                      {/* Heart Rate Over Time */}
                      <Tab eventKey="heart" title="Heart Rate Over Time">
                        <div className="mt-2">
                          <Row className="g-3">
                            <Col lg={8}>
                              <Card className="shadow-sm">
                          <Card.Header>
                            <div className="d-flex justify-content-between align-items-center">
                                    <h5 className="mb-0">Heart Rate Zones Over Time</h5>
                                    <Button size="sm" variant="outline-secondary" onClick={() => { loadHeart(); loadDashboardData(); }} disabled={loadingHeart || loadingDashboard}>
                                      {(loadingHeart || loadingDashboard) ? "Loading…" : "Refresh"}
                              </Button>
                            </div>
                            <small className="text-muted">Shows most recent 7 days within selected date period</small>
                          </Card.Header>
                          <Card.Body>
                                  {heartChartData.zoneThresholds && (
                                    <div className="small mb-2">
                                      <div className="text-success mb-1">
                                        ✓ Max HR: {heartChartData.zoneThresholds.maxHR ?? 155} BPM • Rest Zone: ≤{heartChartData.zoneThresholds.restZoneEnd ?? 78} BPM • (50% Max Heart Rate)
                                      </div>
                                      <div className="text-warning mb-1">
                                        ⚠️ Hard Activity Zone: ≤{heartChartData.zoneThresholds.hardZoneEnd ?? 147} BPM • (95% Max Heart Rate)
                                      </div>
                                      <div className="text-danger">
                                        🚨 Danger Zone: &gt;147 BPM • (&gt;95% Max Heart Rate - Not Recommended for Older Adults)
                                      </div>
                                    </div>
                                  )}
                                  <div style={{ width: "100%", height: 420 }}>
                              <ResponsiveContainer>
                                      <LineChart data={heartChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                                  <YAxis tick={{ fontSize: 12 }} />
                                        {heartChartData.zoneThresholds && (
                                          <>
                                            <ReferenceArea y1={0} y2={heartChartData.zoneThresholds.restZoneEnd} fill="#b3e5fc" fillOpacity={0.25} />
                                            <ReferenceArea y1={heartChartData.zoneThresholds.lightZoneStart} y2={heartChartData.zoneThresholds.lightZoneEnd} fill="#e8f5e9" fillOpacity={0.5} />
                                            <ReferenceArea y1={heartChartData.zoneThresholds.lightZoneEnd} y2={heartChartData.zoneThresholds.moderateZoneEnd} fill="#fff8e1" fillOpacity={0.6} />
                                            <ReferenceArea y1={heartChartData.zoneThresholds.moderateZoneEnd} y2={heartChartData.zoneThresholds.hardZoneEnd} fill="#e67e22" fillOpacity={0.3} />
                                            <ReferenceArea y1={heartChartData.zoneThresholds.hardZoneEnd} y2={heartChartData.zoneThresholds.maxHR} fill="#ff6b35" fillOpacity={0.2} />
                                            <ReferenceArea y1={147} y2={155} fill="#dc3545" fillOpacity={0.3} />
                                            <ReferenceLine y={heartChartData.zoneThresholds.restZoneEnd} stroke="#64b5f6" strokeDasharray="3 3" label={{ value: `Rest Zone (≤${heartChartData.zoneThresholds.restZoneEnd} BPM - 50% Max HR)`, position: 'insideTopLeft', fill: '#1e88e5', fontSize: 12 }} />
                                            <ReferenceLine y={heartChartData.zoneThresholds.lightZoneEnd} stroke="#9ccc65" strokeDasharray="3 3" label={{ value: 'Light (≤65% max)', position: 'insideTopLeft', fill: '#2e7d32', fontSize: 12 }} />
                                            <ReferenceLine y={heartChartData.zoneThresholds.moderateZoneEnd} stroke="#fdd835" strokeDasharray="3 3" label={{ value: 'Moderate (65–75%)', position: 'insideTopLeft', fill: '#ef6c00', fontSize: 12 }} />
                                            <ReferenceLine y={heartChartData.zoneThresholds.hardZoneEnd} stroke="#ff6b35" strokeWidth={3} strokeDasharray="5 5" label={{ value: `Hard Activity Zone (≤${heartChartData.zoneThresholds.hardZoneEnd} BPM - 95% Max HR)`, position: 'insideTopRight', fill: '#ff6b35', fontSize: 12, fontWeight: 'bold' }} />
                                            <ReferenceLine y={147} stroke="#dc3545" strokeWidth={4} strokeDasharray="8 4" label={{ value: `DANGER ZONE (&gt;147 BPM - &gt;95% Max HR)`, position: 'insideTopRight', fill: '#dc3545', fontSize: 13, fontWeight: 'bold' }} />
                                          </>
                                        )}
                                        <Tooltip 
                                          content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                              const zones = heartChartData.zoneThresholds || {};
                                              return (
                                                <div className="bg-white p-3 border rounded shadow-sm" style={{ minWidth: 280 }}>
                                                  <div className="small">
                                                    <div className="fw-bold mb-2">Date: {label}</div>
                                                    {payload.map((entry, index) => {
                                                      const zoneNames = { rest: "Rest Zone", light: "Light Activity", moderate: "Moderate Activity", hard: "Hard Activity" };
                                                      const zoneName = zoneNames[entry.dataKey] || entry.dataKey;
                                                      return (
                                                        <div key={index} className="mb-1">
                                                          <span style={{ color: entry.color, fontSize: '1.2em' }}>●</span> {zoneName}: <strong>{entry.value} bpm</strong>
                                                        </div>
                                                      );
                                                    })}
                                                    <div className="mt-2 pt-2 border-top">
                                                      <div className="small fw-bold mb-1">Zone Thresholds:</div>
                                                      <div className="small">Rest Zone: ≤{zones.restZoneEnd} BPM (50% max)</div>
                                                      <div className="small">Light Zone: ≤{zones.lightZoneEnd} BPM (65% max)</div>
                                                      <div className="small">Moderate Zone: ≤{zones.moderateZoneEnd} BPM (75% max)</div>
                                                      <div className="small text-warning">Hard Zone: ≤{zones.hardZoneEnd} BPM (95% max)</div>
                                                      <div className="small text-danger">Danger Zone: &gt;147 BPM (&gt;95% max)</div>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            }
                                            return null;
                                          }}
                                        />
                                        <Legend />
                                        <Line type="monotone" dataKey="hard" name="Hard" stroke={ZONE_COLORS.hard} strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="moderate" name="Moderate Activity" stroke={ZONE_COLORS.moderate} strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="light" name="Light Activity" stroke={ZONE_COLORS.light} strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="rest" name="Rest Zone" stroke={ZONE_COLORS.rest} strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </Card.Body>
                        </Card>
                            </Col>
                            <Col lg={4}>
                              <Card className="shadow-sm">
                                <Card.Body className="p-3">
                                  <h5 className="mb-3">Zone Statistics (All-Time Data)</h5>
                                  <div className="mb-2"><span className="me-2" style={{ display:'inline-block', width:10, height:10, background: ZONE_COLORS.rest }} /> <strong>Resting Heart Rate Zone</strong> {`(≤ ${heartChartData.zoneThresholds?.restZoneEnd || 78} BPM - 50% Max Heart Rate)`}</div>
                                  <Stat label="Lowest (All-Time):" value={`${heartZoneStats.rest.min || 0} bpm`} />
                                  <Stat label="Highest (All-Time):" value={`${heartZoneStats.rest.max || 0} bpm`} />
                                  <Stat label="Average (All-Time):" value={`${heartZoneStats.rest.avg || 0} bpm`} />
                                  <hr />
                                  <div className="mb-2"><span className="me-2" style={{ display:'inline-block', width:10, height:10, background: ZONE_COLORS.light }} /> <strong>Light Activity</strong> • 65% Max</div>
                                  <Stat label="Highest (All-Time):" value={`${heartZoneStats.light.max || 0} bpm`} />
                                  <Stat label="Lowest (All-Time):" value={`${heartZoneStats.light.min || 0} bpm`} />
                                  <Stat label="Average (All-Time):" value={`${heartZoneStats.light.avg || 0} bpm`} />
                                  <hr />
                                  <div className="mb-2"><span className="me-2" style={{ display:'inline-block', width:10, height:10, background: ZONE_COLORS.moderate }} /> <strong>Moderate Activity</strong> • 75% Max</div>
                                  <Stat label="Highest (All-Time):" value={`${heartZoneStats.moderate.max || 0} bpm`} />
                                  <Stat label="Lowest (All-Time):" value={`${heartZoneStats.moderate.min || 0} bpm`} />
                                  <Stat label="Average (All-Time):" value={`${heartZoneStats.moderate.avg || 0} bpm`} />
                                  <hr />
                                  <div className="mb-2"><span className="me-2" style={{ display:'inline-block', width:10, height:10, background: ZONE_COLORS.hard }} /> <strong>Hard Activity</strong> • 95% Max</div>
                                  <Stat label="Highest (All-Time):" value={`${heartZoneStats.hard.max || 0} bpm`} />
                                  <Stat label="Lowest (All-Time):" value={`${heartZoneStats.hard.min || 0} bpm`} />
                                  <Stat label="Average (All-Time):" value={`${heartZoneStats.hard.avg || 0} bpm`} />
                                </Card.Body>
                              </Card>
                            </Col>
                          </Row>
                          {/* Heart Rate Insights */}
                          <div className="mt-4">
                            <div className="d-flex align-items-center mb-2">
                              <h5 className="mb-0 me-2">Heart Rate Insights</h5>
                              <span className="badge bg-danger">Danger {`>`}95%</span>
                            </div>
                            <Row className="g-3">
                              <Col md={4}>
                                <Card className="shadow-sm h-100">
                                  <Card.Body>
                                    <div className="mb-2">🏃‍♂️ <strong>Cardio Guidance</strong></div>
                                    <div>Aim for at least 150 minutes of moderate-intensity cardio per week, or at least 75 minutes of hard-intensity cardio per week</div>
                                  </Card.Body>
                                </Card>
                              </Col>
                              <Col md={4}>
                                <Card className="shadow-sm h-100">
                                  <Card.Body>
                                    <div className="mb-2">🏃‍♂️ <strong>Cardio Guidance</strong></div>
                                    <div>Start with brisk walking for 10 minutes at a time, or try marching on the spot with high knees during TV ad breaks</div>
                                  </Card.Body>
                                </Card>
                              </Col>
                              <Col md={4}>
                                <Card className="shadow-sm h-100">
                                  <Card.Body>
                                    <div className="mb-2">🏃‍♂️ <strong>Cardio Guidance</strong></div>
                                    <div>To gauge intensity, you should be able to talk while moving</div>
                                  </Card.Body>
                                </Card>
                              </Col>
                            </Row>
                            <Row className="g-3 mt-2">
                              <Col md={6}>
                                <Card className="shadow-sm border-danger">
                                  <Card.Body>
                                    <div className="mb-2">⛔ <strong>Very High Exercise Intensity</strong></div>
                                    <div>
                                      Exercise intensity above 95% is generally not recommended for older adults (risk of cardiac overuse injuries and other cardiovascular problems)
                                    </div>
                                  </Card.Body>
                                </Card>
                              </Col>
                            </Row>
                          </div>
                        </div>
                      </Tab>

                      {/* Sleep Over Time */}
                      <Tab eventKey="sleep" title="Sleep Over Time">
                        <div className="mt-2">
                          <Row className="g-3">
                            <Col lg={8}>
                              <Card className="shadow-sm">
                          <Card.Header>
                            <div className="d-flex justify-content-between align-items-center">
                                    <h5 className="mb-0">Sleep Stages Over Time</h5>
                              <Button size="sm" variant="outline-secondary" onClick={loadSleep} disabled={loadingSleep}>
                                {loadingSleep ? "Loading…" : "Refresh"}
                              </Button>
                            </div>
                            <small className="text-muted">Shows most recent 7 days within selected date period</small>
                          </Card.Header>
                          <Card.Body>
                                  <div className="text-muted small mb-2">
                                    Sleep stage breakdown in hours per day (excluding "In bed")
                                  </div>
                                  <div style={{ width: "100%", height: 420 }}>
                              <ResponsiveContainer>
                                <BarChart data={dashboardSleepDaily.rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v/60}h`} />
                                        <Tooltip formatter={(v, name) => [`${Math.round((v/60)*10)/10}h`, name]} />
                                  <Legend />
                                  {dashboardSleepDaily.stages.map((s) => (
                                    <Bar
                                      key={s}
                                      dataKey={s}
                                      stackId="sleep"
                                      fill={STAGE_COLORS[s] || "#999"}
                                    />
                                  ))}
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                                </Card.Body>
                              </Card>
                            </Col>
                            <Col lg={4}>
                              <Card className="shadow-sm">
                                <Card.Body className="p-3">
                                  <h6 className="text-uppercase text-muted">Total Sleep</h6>
                                  <div className="display-6 fw-bold">{dashboardSleepStats.totalHours}h</div>
                                  <div className="text-muted">(excluding "In bed")</div>
                                </Card.Body>
                              </Card>
                              <Card className="shadow-sm mt-3">
                                <Card.Body className="p-3">
                                  <h6 className="text-uppercase text-muted">Average Sleep</h6>
                                  <div className="display-6 fw-bold">{dashboardSleepStats.averageHours}h</div>
                                  <div className="text-muted">Per night</div>
                                </Card.Body>
                              </Card>
                              <Card className="shadow-sm mt-3">
                                <Card.Body className="p-3">
                                  <h6 className="text-uppercase text-muted">Stage Averages</h6>
                                  <div className="mb-1"><strong>REM:</strong> {dashboardSleepStats.stageAvgHours.REM}h ({dashboardSleepStats.stagePercents.REM}%)</div>
                                  <div className="mb-1"><strong>Core:</strong> {dashboardSleepStats.stageAvgHours.Core}h ({dashboardSleepStats.stagePercents.Core}%)</div>
                                  <div className="mb-1"><strong>Deep:</strong> {dashboardSleepStats.stageAvgHours.Deep}h ({dashboardSleepStats.stagePercents.Deep}%)</div>
                                  <div className="mb-1"><strong>Awake:</strong> {dashboardSleepStats.stageAvgHours.Awake}h ({dashboardSleepStats.stagePercents.Awake}%)</div>
                                </Card.Body>
                              </Card>
                            </Col>
                          </Row>

                          {/* Sleep Insights */}
                          <div className="mt-4">
                            <div className="d-flex align-items-center mb-3">
                              <h5 className="mb-0 me-3">Sleep Insights</h5>
                              <div className="btn-group" role="group">
                                <button
                                  type="button"
                                  className={`btn btn-sm ${sleepInsightTab === "deep" ? "btn-warning text-white" : "btn-outline-secondary"}`}
                                  onClick={() => setSleepInsightTab("deep")}
                                >
                                  Deep Sleep
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${sleepInsightTab === "tips" ? "btn-success text-white" : "btn-outline-secondary"}`}
                                  onClick={() => setSleepInsightTab("tips")}
                                >
                                  Tips
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${sleepInsightTab === "insights" ? "btn-primary text-white" : "btn-outline-secondary"}`}
                                  onClick={() => setSleepInsightTab("insights")}
                                >
                                  Sleep Insights
                                </button>
                              </div>
                            </div>

                            <Row className="g-3">
                              {sleepInsightTab === "deep" && (
                                <>
                                  <Col md={6}>
                                    <Card className="shadow-sm h-100">
                                      <Card.Body>
                                        <div className="d-flex align-items-start">
                                          <div className="me-3 fs-4">🧠</div>
                                          <div>
                                            <h6 className="fw-bold text-uppercase mb-2">Deep Sleep (13-23%)</h6>
                                            <p className="text-muted mb-0">
                                              Deep sleep is crucial for tissue and bone repair, immune function, and cognitive health. 
                                              Low deep sleep % is linked to higher risk of cognitive decline.
                                            </p>
                                          </div>
                            </div>
                          </Card.Body>
                        </Card>
                                  </Col>
                                </>
                              )}

                              {sleepInsightTab === "tips" && (
                                <>
                                  <Col md={12}>
                                    <Card className="shadow-sm mb-3">
                                      <Card.Body>
                                        <div className="d-flex align-items-start">
                                          <div className="me-3 fs-4">🌙</div>
                                          <div>
                                            <h6 className="fw-bold text-uppercase mb-2">Better Sleep Tips</h6>
                                            <p className="text-muted mb-0">
                                              Establish consistency with bedtime and wakeup time, create a bedtime routine to minimise stimulation e.g. reading a book for relaxation, 
                                              and consider your daily habits including physical activity and diet e.g. no more than 1 cup of coffee and no more than 1 alcoholic drink per day.
                                            </p>
                                          </div>
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>
                                  <Col md={12}>
                                    <Card className="shadow-sm">
                                      <Card.Body>
                                        <div className="d-flex align-items-start">
                                          <div className="me-3 fs-4">💤</div>
                                          <div>
                                            <h6 className="fw-bold text-uppercase mb-2">Sleep Optimisation Tips</h6>
                                            <p className="text-muted mb-0">
                                              Maintain a cool, dark bedroom environment. Avoid screens ideally 1 hour before bedtime. 
                                              Try to limit caffeine intake after 2 PM. Exercise regularly but not too close to bedtime.
                                            </p>
                                          </div>
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>
                                </>
                              )}

                              {sleepInsightTab === "insights" && (
                                <Col md={12}>
                                  <Card className="shadow-sm">
                                    <Card.Body>
                                      <div className="d-flex align-items-center justify-content-between">
                                        <div className="d-flex align-items-center">
                                          <div className="me-3 fs-4">📊</div>
                                          <div>
                                            <h6 className="fw-bold text-uppercase mb-0">Sleep Pattern Analysis</h6>
                                          </div>
                                        </div>
                                        <Button
                                          variant="primary"
                                          size="sm"
                                          onClick={() => setShowHypnogramPopup(true)}
                                          className="ms-3"
                                        >
                                          📈 Hypnogram Breakdown
                                        </Button>
                                      </div>
                                    </Card.Body>
                                  </Card>
                                </Col>
                              )}
                            </Row>
                          </div>
                        </div>
                      </Tab>

                      {/* Activity Rings */}
                      <Tab eventKey="activity" title="Activity Rings" onEnter={triggerActivityRingsAnimation}>
                          <div className="mt-2">
                          {/* Dynamic Summary Cards */}
                          {sevenDaySummaryData && (
                            <Card className="shadow-sm mb-4">
                              <Card.Header className="bg-light">
                                <div className="d-flex justify-content-between align-items-center">
                                  <h5 className="mb-0">
                                    ACTIVITY RINGS SUMMARY
                                  </h5>
                                  <small className="text-muted">
                                    Shows most recent 7 days within selected date period
                                    <br />
                                    {sevenDaySummaryData.dateRange.daysWithData} days with activity data
                                  </small>
                                </div>
                              </Card.Header>
                              <Card.Body>
                                <Row className="g-3">
                                  {/* Stand Hours Card */}
                                  <Col md={4}>
                                    <Card className="h-100 border-0 shadow-sm">
                                      <Card.Body className="p-3">
                                        <div className="d-flex align-items-center mb-2">
                                          <div className="rounded-circle me-2" style={{ width: '12px', height: '12px', backgroundColor: '#007AFF' }}></div>
                                          <h6 className="mb-0 fw-bold text-uppercase">STAND HOURS</h6>
                                        </div>
                                        <div className="mb-2">
                                          <div className="d-flex align-items-center">
                                            <span className="me-2">Daily Stand Hours:</span>
                                            <span className="fw-bold">{sevenDaySummaryData.standHours.dailyAvg.toFixed(1)} / 12 hr</span>
                                            <i className="fas fa-arrow-down text-danger ms-1"></i>
                                          </div>
                                        </div>
                                        <div className="mb-1">
                                          <span className="text-muted">Avg Total/Day:</span>
                                          <span className="fw-bold ms-1">{sevenDaySummaryData.standHours.avgTotalPerDay} min</span>
                                        </div>
                                        <div className="mb-2">
                                          <span className="text-muted">Avg Min/Hour:</span>
                                          <span className="fw-bold ms-1">{sevenDaySummaryData.standHours.avgMinPerHour} min</span>
                                        </div>
                                        <div className="small text-muted">
                                          <strong>Target:</strong> {sevenDaySummaryData.standHours.target}
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>

                                  {/* Heart Rate Variability Card */}
                                  <Col md={4}>
                                    <Card className="h-100 border-0 shadow-sm">
                                      <Card.Body className="p-3">
                                        <div className="d-flex align-items-center mb-2">
                                          <div className="rounded-circle me-2" style={{ width: '12px', height: '12px', backgroundColor: '#FF3B30' }}></div>
                                          <h6 className="mb-0 fw-bold text-uppercase">HEART RATE VARIABILITY</h6>
                                        </div>
                                        <div className="mb-2">
                                          <div className="d-flex align-items-center">
                                            <span className="me-2">{sevenDaySummaryData.dateRange.daysWithData}-Day Average:</span>
                                            <span className="fw-bold">{sevenDaySummaryData.hrv.periodAvg} ms</span>
                                            <i className="fas fa-check text-success ms-1"></i>
                                          </div>
                                        </div>
                                        <div className="mb-2">
                                          <span className="text-muted">Highest:</span>
                                          <span className="fw-bold ms-1">{Math.round(sevenDaySummaryData.hrv.highest)} ms</span>
                                        </div>
                                        <div className="small text-muted">
                                          <strong>Normal Range:</strong> {sevenDaySummaryData.hrv.normalRange}
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>

                                  {/* Total Energy Expenditure Card */}
                                  <Col md={4}>
                                    <Card className="h-100 border-0 shadow-sm">
                                      <Card.Body className="p-3">
                                        <div className="d-flex align-items-center mb-2">
                                          <div className="rounded-circle me-2" style={{ width: '12px', height: '12px', backgroundColor: '#34C759' }}></div>
                                          <h6 className="mb-0 fw-bold text-uppercase">TOTAL ENERGY EXPENDITURE</h6>
                                        </div>
                                        <div className="mb-2">
                                          <span className="text-muted">{sevenDaySummaryData.dateRange.daysWithData}-Day Average:</span>
                                          <span className="fw-bold ms-1">{sevenDaySummaryData.energy.periodAvg} kJ</span>
                                        </div>
                                        <div className="mb-2">
                                          <span className="text-muted">Total ({sevenDaySummaryData.dateRange.daysWithData} days):</span>
                                          <span className="fw-bold ms-1">{sevenDaySummaryData.energy.totalPeriod} kJ</span>
                                        </div>
                                        <div className="small text-muted">
                                          {sevenDaySummaryData.energy.description}
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>
                                </Row>
                              </Card.Body>
                            </Card>
                          )}

                          {/* No Activity Data Message */}
                          {!sevenDaySummaryData && (
                            <Card className="shadow-sm mb-4">
                              <Card.Body className="text-center py-4">
                                <div className="text-muted mb-2">
                                  <i className="fas fa-chart-line fa-2x"></i>
                                </div>
                                <h5 className="text-muted">No Activity Data Found</h5>
                                <p className="text-muted mb-0">
                                  No activity data (stand hours, HRV, or energy) found in the selected date range.
                                  <br />
                                  Current range: {new Date(from).toLocaleDateString()} - {new Date(to).toLocaleDateString()}
                                  <br />
                                  Please select a different date range or ensure the user has activity data.
                                </p>
                              </Card.Body>
                            </Card>
                          )}

                          {/* Activity Rings Chart */}
                          <Card className="shadow-sm">
                          <Card.Header>
                            <div className="d-flex justify-content-between align-items-center">
                                <div>
                                  <h5 className="mb-0">Daily Activity Rings</h5>
                                  <small className="text-muted">
                                    Apple Watch style activity rings
                                    {sevenDaySummaryData && (
                                      <span className="ms-2">
                                        <br />
                                        {sevenDaySummaryData.dateRange.daysWithData} days with activity data
                                      </span>
                                    )}
                                  </small>
                                </div>
                              <Button size="sm" variant="outline-secondary" onClick={() => { loadDashboardData(); triggerActivityRingsAnimation(); }} disabled={loadingDashboard}>
                                {loadingDashboard ? "Loading…" : "Refresh"}
                              </Button>
                            </div>
                          </Card.Header>
                          <Card.Body>
                              {loadingDashboard ? (
                                <div className="text-center py-5">
                                  <div className="d-flex justify-content-center align-items-center gap-3">
                                    <Spinner animation="border" role="status" />
                                    <span className="text-muted">Loading activity rings...</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="d-flex align-items-center gap-3 overflow-auto pb-3">
                                <div className="d-flex gap-4">
                                  {activityRingsData.map((day, i) => (
                                    <div 
                                      key={i} 
                                      className="text-center"
                                      style={{
                                        animation: `fadeInUp 0.6s ease-out ${i * 0.1}s both`
                                      }}
                                    >
                                      <div className="mb-2">
                                        <ActivityRings
                                          key={`rings-${day.date}-${activityRingsAnimate}`}
                                          standMinutes={day.standHours}
                                          standGoal={12}
                                          hrv={day.hrv}
                                          hrvPercent={day.hrvProgress * 100}
                                          hrvRange={[40, 60]}
                                          totalEnergy={day.totalEnergy}
                                          totalEnergyGoal={7500}
                                          size={120}
                                        />
                                      </div>
                                      <div className="small fw-bold">{day.label}</div>
                                      <div className="mt-2">
                                        <ActivityRingsLegend
                                          standMinutes={day.standHours}
                                          standGoal={12}
                                          hrv={day.hrv}
                                          hrvRange={[40, 60]}
                                          totalEnergy={day.totalEnergy}
                                          totalEnergyGoal={7500}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              )}
                          </Card.Body>
                        </Card>

                          {/* Standing Activity Insights */}
                          <Card className="shadow-sm mt-4">
                            <Card.Header className="bg-light">
                              <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">STANDING ACTIVITY INSIGHTS</h5>
                                <span className="badge bg-warning text-dark px-3 py-2 rounded-pill">
                                  NEEDS IMPROVEMENT
                                </span>
                              </div>
                            </Card.Header>
                            <Card.Body>
                              <Row className="g-4">
                                {/* Health Risks Card */}
                                <Col md={4}>
                                  <Card className="h-100 border-0 shadow-sm">
                                    <Card.Body>
                                      <div className="d-flex align-items-start mb-3">
                                        <div className="me-3">
                                          <div className="rounded-circle d-flex align-items-center justify-content-center" 
                                               style={{ width: '48px', height: '48px', backgroundColor: '#FFC107' }}>
                                            <i className="fas fa-exclamation-triangle text-dark" style={{ fontSize: '20px' }}></i>
                                          </div>
                                        </div>
                                        <div>
                                          <h6 className="mb-2 fw-bold text-uppercase">HEALTH RISKS OF PROLONGED SITTING</h6>
                                        </div>
                                      </div>
                                      <p className="text-muted mb-0">
                                        Prolonged sitting can contribute to the development of type 2 diabetes and weight gain, higher blood pressure, increased risk of cardiovascular disease and stroke, decreased energy levels and productivity.
                                      </p>
                                    </Card.Body>
                                  </Card>
                                </Col>

                                {/* Hourly Movement Goal Card */}
                                <Col md={4}>
                                  <Card className="h-100 border-0 shadow-sm">
                                    <Card.Body>
                                      <div className="d-flex align-items-start mb-3">
                                        <div className="me-3">
                                          <div className="rounded-circle d-flex align-items-center justify-content-center" 
                                               style={{ width: '48px', height: '48px', backgroundColor: '#E91E63' }}>
                                            <i className="fas fa-clock text-white" style={{ fontSize: '20px' }}></i>
                                          </div>
                                        </div>
                                        <div>
                                          <h6 className="mb-2 fw-bold text-uppercase">HOURLY MOVEMENT GOAL</h6>
                                        </div>
                                      </div>
                                      <p className="text-muted mb-0">
                                        Aim to stand and move for at least 10 minutes every hour.
                                      </p>
                                    </Card.Body>
                                  </Card>
                                </Col>

                                {/* Simple Activities Card */}
                                <Col md={4}>
                                  <Card className="h-100 border-0 shadow-sm">
                                    <Card.Body>
                                      <div className="d-flex align-items-start mb-3">
                                        <div className="me-3">
                                          <div className="rounded-circle d-flex align-items-center justify-content-center" 
                                               style={{ width: '48px', height: '48px', backgroundColor: '#FFC107' }}>
                                            <i className="fas fa-lightbulb text-dark" style={{ fontSize: '20px' }}></i>
                                          </div>
                                        </div>
                                        <div>
                                          <h6 className="mb-2 fw-bold text-uppercase">SIMPLE ACTIVITIES</h6>
                                        </div>
                                      </div>
                                      <p className="text-muted mb-0">
                                        Get some water, stretch, take a short walk inside or around your home.
                                      </p>
                                    </Card.Body>
                                  </Card>
                                </Col>
                              </Row>
                            </Card.Body>
                          </Card>

                          {/* HRV Insights */}
                          <Card className="shadow-sm mt-4">
                            <Card.Header className="bg-light">
                              <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">HRV INSIGHTS</h5>
                                <span className="badge bg-primary text-white px-3 py-2 rounded-pill">
                                  NORMAL
                                </span>
                              </div>
                            </Card.Header>
                            <Card.Body>
                              <Row className="g-4">
                                {/* Healthy HRV Range Card */}
                                <Col md={6}>
                                  <Card className="h-100 border-0 shadow-sm">
                                    <Card.Body>
                                      <div className="d-flex align-items-start mb-3">
                                        <div className="me-3">
                                          <div className="rounded d-flex align-items-center justify-content-center" 
                                               style={{ width: '48px', height: '48px', backgroundColor: '#28A745' }}>
                                            <i className="fas fa-check text-white" style={{ fontSize: '20px' }}></i>
                                          </div>
                                        </div>
                                        <div>
                                          <h6 className="mb-2 fw-bold text-uppercase">HEALTHY HRV RANGE</h6>
                                        </div>
                                      </div>
                                      <p className="text-muted mb-0">
                                        A sign of robust cardiovascular health and nervous system balance.
                                      </p>
                                    </Card.Body>
                                  </Card>
                                </Col>

                                {/* Keep It Up Card */}
                                <Col md={6}>
                                  <Card className="h-100 border-0 shadow-sm">
                                    <Card.Body>
                                      <div className="d-flex align-items-start mb-3">
                                        <div className="me-3">
                                          <div className="rounded-circle d-flex align-items-center justify-content-center" 
                                               style={{ width: '48px', height: '48px', backgroundColor: '#E91E63' }}>
                                            <i className="fas fa-bullseye text-white" style={{ fontSize: '20px' }}></i>
                                          </div>
                                        </div>
                                        <div>
                                          <h6 className="mb-2 fw-bold text-uppercase">KEEP IT UP</h6>
                                        </div>
                                      </div>
                                      <p className="text-muted mb-0">
                                        Continue incorporating practices that promote high HRV such as regular physical activity, stress management techniques, and mindfulness.
                                      </p>
                                    </Card.Body>
                                  </Card>
                                </Col>
                              </Row>
                            </Card.Body>
                          </Card>
                        </div>
                      </Tab>

                      {/* Walking Gait Analysis */}
                      <Tab eventKey="walking" title="Walking Gait Analysis">
                        <div className="mt-2">

                          {/* Walking Gait Analysis Heatmaps */}
                          <Card className="shadow-sm">
                            <Card.Header>
                              <div className="d-flex justify-content-between align-items-center">
                                <div>
                                  <h5 className="mb-0">Walking Gait Analysis - Hourly Heatmaps</h5>
                                  <small className="text-muted">Most recent 21 days with valid walking gait data (excluding days with zero values) - Asymmetry, Speed, Double Support Time, and Step Length per hour</small>
                                </div>
                                <Button size="sm" variant="outline-secondary" onClick={loadDashboardData} disabled={loadingDashboard}>
                                  <i className="fas fa-sync-alt me-1"></i>Refresh
                                </Button>
                              </div>
                            </Card.Header>
                            <Card.Body>
                              <WalkingGaitHeatmap
                                walkingAsymmetryData={walkingAsymmetryData}
                                walkingSpeedData={walkingSpeedData}
                                doubleSupportTimeData={doubleSupportTimeData}
                                walkingStepLengthData={walkingStepLengthData}
                                stepsData={stepsEvents}
                                dateRange={21}
                              />
                            </Card.Body>
                          </Card>
                        </div>
                      </Tab>
                    </Tabs>
                  </Card.Body>
                </Card>
                <HypnogramPopup
                  show={showHypnogramPopup}
                  onHide={() => setShowHypnogramPopup(false)}
                  sleepData={sleepEvents}
                  dateRange={7}
                />
              </div>
            )}
          </Tab>
        )}
      </Tabs>
    </Container>
  );
}

/* ---------- Small components & utils ---------- */

function MetricTabHeader({ title, onRefresh, loading, from, to, setFrom, setTo, setPreset }) {
  return (
    <Card className="shadow-sm mb-3 mt-2">
      <Card.Body className="p-3">
        <div className="d-flex align-items-center justify-content-between">
          <h3 className="mb-0">{title}</h3>
          <Button size="sm" variant="outline-secondary" onClick={onRefresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-end mt-2">
          <div>
            <Form.Label className="mb-1">From</Form.Label>
            <Form.Control type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Form.Label className="mb-1">To</Form.Label>
            <Form.Control type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Dropdown as={ButtonGroup}>
            <Button variant="outline-secondary">Presets</Button>
            <Dropdown.Toggle split variant="outline-secondary" />
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => setPreset(7)}>Last 7 days</Dropdown.Item>
              <Dropdown.Item onClick={() => setPreset(28)}>Last 28 days</Dropdown.Item>
              <Dropdown.Item onClick={() => setPreset(90)}>Last 90 days</Dropdown.Item>
              <Dropdown.Item onClick={() => setPreset("month")}>This month</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={() => setPreset("all")}>All (last ~6 mo)</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </Card.Body>
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-2 border rounded-3 d-flex justify-content-between">
      <span className="text-muted">{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ---- utils ----
function isoDateNDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function enumerateDays(from, to) {
  const out = [];
  const a = new Date(from + "T00:00:00");
  const b = new Date(to +   "T00:00:00");
  for (let d = a; d <= b; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0,10));
  }
  return out;
}
function ddMMM(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function formatNum(n) { return (n ?? 0).toLocaleString(); }

function calculateAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/** Canonicalize a sleep stage label and normalize edge cases. */
function canonicalStage(s) {
  if (!s) return "";
  const t = String(s).trim();
  const lc = t.toLowerCase();
  if (lc === "in bed" || lc === "inbed" || lc === "in-bed") return "In bed";
  // Map common stage aliases
  if (lc === "light") return "Core";
  if (lc === "core") return "Core";
  if (lc === "deep") return "Deep";
  if (lc === "rem") return "REM";
  if (lc === "awake") return "Awake";
  // fallback to capitalized
  return t.charAt(0).toUpperCase() + t.slice(1);
}
