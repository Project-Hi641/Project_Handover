
import React, { useEffect, useState, useCallback } from "react";
import '../css/GoalSetting.css';
import { Card, Button, Form, Spinner, Alert, Row, Col } from "react-bootstrap";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/Firebase";


// before:
// const COLORS = ["#00C49F", "#FF8042", "#E0E0E0"];

// after (status-style: ok / warn / track):
const COLORS = [
  'var(--ok, var(--bs-success))',
  'var(--warn, var(--bs-warning))',
];

// Simple engagement timeline component (localStorage-backed)
function EngagementTimeline() {
  const STORAGE_KEY = "ifb_engagement_checkins";
  const [checkins, setCheckins] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  });

  // build last 7 days array (labels and dates)
  const today = new Date();
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(today.getDate() - (6 - i)); // oldest first
    d.setHours(0,0,0,0);
    return d;
  });

  const toggleCheckin = (date) => {
    const key = date.toISOString().slice(0,10);
    const next = { ...checkins };
    if (next[key]) delete next[key];
    else next[key] = true;
    setCheckins(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const computeStreaks = (map) => {
    // current streak: count consecutive trues up to today (backwards)
    const keys = Object.keys(map).sort();
    let longest = 0;
    let current = 0;
    let running = 0;
    // build set for fast lookup
    const s = new Set(keys);
    for (let i = 6; i >= 0; i--) {
      const key = days[i].toISOString().slice(0,10);
      if (s.has(key)) {
        running += 1;
        current = running;
      } else {
        running = 0;
      }
      if (running > longest) longest = running;
    }
    // longest across this 7-day window
    return { current, longest };
  };

  const { current, longest } = computeStreaks(checkins);

  const reset = () => {
    setCheckins({});
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  return (
    <div>
      <div className="engagement-summary d-flex align-items-center justify-content-between mb-2">
        <div>
          <div className="fw-bold">Current streak: <span style={{ color: COLORS[0] }}>{current}d</span></div>
          <div className="text-muted small">Longest (7-day window): {longest}d</div>
        </div>
        <div>
          <Button size="sm" variant="outline-secondary" onClick={reset}>Reset</Button>
        </div>
      </div>
      <div className="engagement-timeline d-flex gap-2">
        {days.map((d) => {
          const key = d.toISOString().slice(0,10);
          const checked = Boolean(checkins[key]);
          const label = d.toLocaleDateString(undefined, { weekday: 'short' });
          return (
            <button
              key={key}
              className={`engagement-day btn ${checked ? 'btn-success' : 'btn-outline-secondary'}`}
              onClick={() => toggleCheckin(d)}
            >
              <div className="engagement-day-label">{label}</div>
              <div className="engagement-day-date">{d.getDate()}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function GoalSetting() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stepsGoal, setStepsGoal] = useState(70000); // default 70,000 steps/week
  const [sleepGoal, setSleepGoal] = useState(480 * 7); // default 8h/night * 7 = 3360 min/week
  const [standGoal, setStandGoal] = useState(150); // default 150 min/week
  const [activeEnergyGoal, setActiveEnergyGoal] = useState(2000); // default 2000 kJ/week
  const [actualSteps, setActualSteps] = useState(0);
  const [actualSleep, setActualSleep] = useState(0);
  const [actualStandMinutes, setActualStandMinutes] = useState(0);
  const [actualActiveEnergy, setActualActiveEnergy] = useState(0);
  const [saving, setSaving] = useState(false);
  const [goalsLoaded, setGoalsLoaded] = useState(false);

  // Fetch health data for the last 7 days
  const fetchHealthData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 6); // last 7 days

      // Fetch steps, sleep, stand_minutes and active_energy
      const [stepsRes, sleepRes, standRes, activeRes] = await Promise.all([
        fetch(`/api/health?${new URLSearchParams({ type: "steps", from: from.toISOString(), to: to.toISOString(), limit: "1000" })}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/health?${new URLSearchParams({ type: "sleep", from: from.toISOString(), to: to.toISOString(), limit: "1000" })}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/health?${new URLSearchParams({ type: "stand_minutes", from: from.toISOString(), to: to.toISOString(), limit: "1000" })}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/health?${new URLSearchParams({ type: "active_energy", from: from.toISOString(), to: to.toISOString(), limit: "1000" })}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (!stepsRes.ok || !sleepRes.ok || !standRes.ok || !activeRes.ok) throw new Error("Failed to fetch health data");
      const [stepsData, sleepData, standData, activeData] = await Promise.all([stepsRes.json(), sleepRes.json(), standRes.json(), activeRes.json()]);

      // Sum steps for the week
      const stepsTotal = (stepsData.items || []).reduce((sum, item) => sum + (Number(item.value) || 0), 0);
      setActualSteps(stepsTotal);

      // Sum sleep minutes for the week (exclude 'In bed' stage)
      const sleepTotal = (sleepData.items || []).reduce((sum, item) => {
        const mins = Number(item.value) || 0;
        const stage = item?.payload?.stage;
        if (stage && stage.toLowerCase() === "in bed") return sum;
        return sum + mins;
      }, 0);
      setActualSleep(sleepTotal);
  // Sum stand minutes (assume value is minutes)
  const standTotal = (standData.items || []).reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  setActualStandMinutes(standTotal);
  // Sum active energy (assume value is kJ)
  const activeTotal = (activeData.items || []).reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  setActualActiveEnergy(activeTotal);
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);


  // Fetch latest saved goals for user on mount
  useEffect(() => {
    const fetchGoals = async () => {
      if (!currentUser) {
        setGoalsLoaded(true);
        return;
      }
      try {
        const token = await auth.currentUser.getIdToken();
        const res = await fetch("/api/goals", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.goal) {
            if (typeof data.goal.stepsGoal === "number") setStepsGoal(data.goal.stepsGoal);
            if (typeof data.goal.sleepGoal === "number") setSleepGoal(data.goal.sleepGoal);
            if (typeof data.goal.standGoal === "number") setStandGoal(data.goal.standGoal);
            if (typeof data.goal.activeEnergyGoal === "number") setActiveEnergyGoal(data.goal.activeEnergyGoal);
          }
        }
      } catch (err) {
        // Ignore fetch errors, fallback to defaults
      } finally {
        setGoalsLoaded(true);
      }
    };
    fetchGoals();
  }, [currentUser]);

  useEffect(() => {
    if (goalsLoaded) {
      fetchHealthData();
    }
  }, [fetchHealthData, goalsLoaded]);

  // Pie chart data helpers
  const getPieData = (goal, actual) => {
    // Only show green (progress) and orange (remaining). No 'Over' segment for steps.
    if (goal > 0 && actual >= goal) {
      return [
        { name: "Progress", value: goal }
      ];
    }
    const progress = goal > 0 ? Math.min(actual, goal) : 0;
    return [
      { name: "Progress", value: progress },
      { name: "Remaining", value: Math.max(goal - progress, 0) }
    ];
  };

  // Save goals to backend
  const handleSaveGoals = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          goal: {
            stepsGoal,
            sleepGoal,
            standGoal,
            activeEnergyGoal
          }
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save goal");
      }
      // Optionally show a success message
    } catch (err) {
      setError(err.message || "Failed to save goal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-main">
      <section className="dashboard-content">
        <div className="container py-3">
          <h2 className="mb-3">Goal Setting</h2>
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" />
              <p className="mt-2 text-muted">Loading your health data...</p>
            </div>
          ) : (
            <>
              {error && <Alert variant="danger">{error}</Alert>}
              <Row className="mb-3">
                <Col md={6} className="mb-3">
                  <Card className="h-100 shadow-sm">
                    <Card.Body>
                      <h5 className="mb-2">Weekly Steps</h5>
                      <Form onSubmit={handleSaveGoals} className="mb-3 d-flex align-items-center gap-2" style={{ maxWidth: 360 }}>
                        <Form.Control
                          type="number"
                          min={0}
                          value={stepsGoal}
                          onChange={e => setStepsGoal(Number(e.target.value))}
                          placeholder="e.g. 70,000"
                        />
                        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                      </Form>
                      <div className="d-flex flex-column flex-md-row align-items-center gap-4">
                        <div style={{ width: 180, height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={getPieData(stepsGoal, actualSteps)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                startAngle={90}
                                endAngle={-270}
                                paddingAngle={2}
                              >
                                {getPieData(stepsGoal, actualSteps).map((entry, idx) => (
                                  <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <h4 className="mb-0">{actualSteps.toLocaleString()} / {stepsGoal.toLocaleString()}</h4>
                          <div className="text-muted">Steps this week</div>
                          <div className="fw-bold" style={{ color: COLORS[0] }}>{Math.round((actualSteps / stepsGoal) * 100)}% complete</div>
                          {stepsGoal > 0 && actualSteps >= stepsGoal && (
                            <div className="goal-congrats-anim mt-2">🎉 <span className="goal-congrats-text">Well done! Step goal complete!</span> 🎉</div>
                          )}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6} className="mb-3">
                  <Card className="h-100 shadow-sm">
                    <Card.Body>
                      <h5 className="mb-2">Weekly Stand Minutes</h5>
                      <Form onSubmit={handleSaveGoals} className="mb-3 d-flex align-items-center gap-2" style={{ maxWidth: 360 }}>
                        <Form.Control
                          type="number"
                          min={0}
                          value={standGoal}
                          onChange={e => setStandGoal(Number(e.target.value))}
                          placeholder="e.g. 150"
                        />
                        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                      </Form>
                      <div className="d-flex flex-column flex-md-row align-items-center gap-4">
                        <div style={{ width: 180, height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={getPieData(standGoal, actualStandMinutes)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                startAngle={90}
                                endAngle={-270}
                                paddingAngle={2}
                              >
                                {getPieData(standGoal, actualStandMinutes).map((entry, idx) => (
                                  <Cell key={`cell-stand-${idx}`} fill={COLORS[idx % COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <h4 className="mb-0">{actualStandMinutes} mins / {standGoal} mins</h4>
                          <div className="text-muted">Stand minutes this week</div>
                          <div className="fw-bold" style={{ color: COLORS[0] }}>{Math.round((actualStandMinutes / standGoal) * 100)}% complete</div>
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md={6} className="mb-3">
                  <Card className="h-100 shadow-sm">
                    <Card.Body>
                      <h5 className="mb-2">Weekly Sleep</h5>
                      <Form onSubmit={handleSaveGoals} className="mb-3 d-flex align-items-center gap-2" style={{ maxWidth: 360 }}>
                        <Form.Control
                          type="number"
                          min={0}
                          value={sleepGoal}
                          onChange={e => setSleepGoal(Number(e.target.value))}
                          placeholder="e.g. 3360 (min/week)"
                        />
                        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                      </Form>
                      <div className="d-flex flex-column flex-md-row align-items-center gap-4">
                        <div style={{ width: 180, height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={getPieData(sleepGoal, actualSleep)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                startAngle={90}
                                endAngle={-270}
                                paddingAngle={2}
                              >
                                {getPieData(sleepGoal, actualSleep).map((entry, idx) => (
                                  <Cell key={`cell-sleep-${idx}`} fill={COLORS[idx % COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <h4 className="mb-0">{Math.round(actualSleep / 60)}h / {Math.round(sleepGoal / 60)}h</h4>
                          <div className="text-muted">Sleep this week</div>
                          <div className="fw-bold" style={{ color: COLORS[0] }}>{Math.round((actualSleep / sleepGoal) * 100)}% complete</div>
                          {sleepGoal > 0 && actualSleep >= sleepGoal && (
                            <div className="goal-congrats-anim mt-2">🎉 <span className="goal-congrats-text">Well done! Sleep goal complete!</span> 🎉</div>
                          )}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6} className="mb-3">
                  <Card className="h-100 shadow-sm">
                    <Card.Body>
                      <h5 className="mb-2">Weekly Active Energy</h5>
                      <Form onSubmit={handleSaveGoals} className="mb-3 d-flex align-items-center gap-2" style={{ maxWidth: 360 }}>
                        <Form.Control
                          type="number"
                          min={0}
                          value={activeEnergyGoal}
                          onChange={e => setActiveEnergyGoal(Number(e.target.value))}
                          placeholder="e.g. 2000 (kJ/week)"
                        />
                        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                      </Form>
                      <div className="d-flex flex-column flex-md-row align-items-center gap-4">
                        <div style={{ width: 180, height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={getPieData(activeEnergyGoal, actualActiveEnergy)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                startAngle={90}
                                endAngle={-270}
                                paddingAngle={2}
                              >
                                {getPieData(activeEnergyGoal, actualActiveEnergy).map((entry, idx) => (
                                  <Cell key={`cell-active-${idx}`} fill={COLORS[idx % COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <h4 className="mb-0">{Math.round(actualActiveEnergy)} kJ / {activeEnergyGoal} kJ</h4>
                          <div className="text-muted">Active energy this week</div>
                          <div className="fw-bold" style={{ color: COLORS[0] }}>{Math.round((actualActiveEnergy / activeEnergyGoal) * 100)}% complete</div>
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
             
              <Card className="shadow-sm">
                <Card.Body>
                  <h5 className="mb-2">Engagement & Streaks (beta)</h5>
                  <p className="text-muted mb-2">Daily check-ins and streak tracking.</p>
                  <EngagementTimeline />
                </Card.Body>
              </Card>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
