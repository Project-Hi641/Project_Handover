// src/pages/AutomationSetup.jsx
import { useEffect, useMemo, useState } from "react";
import { Container, Card, Button, Alert, Form } from "react-bootstrap";
import "../css/automation-setup.css";

import C1 from "../assets/automation/Capture1.JPG";
import C2 from "../assets/automation/Capture2.JPG";
import C3 from "../assets/automation/Capture3.JPG";
import C4 from "../assets/automation/Capture4.JPG";
import C5 from "../assets/automation/Capture5.JPG";

const IMAGE_STEPS = [
  { id: "open",   title: "Open Shortcuts → Automation",                       src: C1 },
  { id: "create", title: "New Personal Automation …",                         src: C2 },
  { id: "pick",   title: "Choose “Time of Day”",                              src: C3 },
  { id: "ask",    title: "Set 12:00pm • Repeat: Daily • Run Immediately",     src: C4 },
  { id: "done",   title: "Add Action → Run Shortcut → Pick your Shortcut",    src: C5 },
];

// Tuning for image size and swipe sensitivity
const MAX_IMG_W   = 420; // ~iPhone-ish width
const SWIPE_MIN_PX = 40; // min horizontal swipe distance to trigger

export default function AutomationSetup() {
  const qp = new URLSearchParams(window.location.search);
  const shortcutName = (qp.get("name") || "Record Health Data (draft)").trim();
  const timeStr = (qp.get("time") || "12:00").trim(); // HH:mm (24h)

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const timePretty = useMemo(() => {
    try {
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date(); d.setHours(h, m, 0, 0);
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch { return "12:00 pm"; }
  }, [timeStr]);

  // Checklist state (persisted per-shortcut)
  const storageKey = useMemo(() => `autoSetup:${shortcutName}`, [shortcutName]);
  const [steps, setSteps] = useState(() =>
    Object.fromEntries(IMAGE_STEPS.map(s => [s.id, false]))
  );

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setSteps((prev) => ({ ...prev, ...JSON.parse(saved) })); } catch {}
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(steps));
  }, [storageKey, steps]);

  // Stepper state
  const [idx, setIdx] = useState(0);
  const next = () => setIdx(i => Math.min(i + 1, IMAGE_STEPS.length - 1));
  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const goTo = (i) => setIdx(i);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft")  prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Touch swipe nav
  const [touchStartX, setTouchStartX] = useState(null);
  function handleTouchStart(e) {
    setTouchStartX(e.changedTouches?.[0]?.clientX ?? null);
  }
  function handleTouchEnd(e) {
    if (touchStartX == null) return;
    const dx = (e.changedTouches?.[0]?.clientX ?? 0) - touchStartX;
    if (Math.abs(dx) >= SWIPE_MIN_PX) {
      if (dx < 0) next(); else prev();
    }
    setTouchStartX(null);
  }

  // Deep links to Shortcuts
  const deepLinks = {
    app: "shortcuts://",
    open: `shortcuts://open-shortcut?name=${encodeURIComponent(shortcutName)}`,
    run:  `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`,
  };

  const toggle = (id) => setSteps(s => ({ ...s, [id]: !s[id] }));

  return (
    <Container fluid className="auto-setup-wrap">
      <div className="auto-setup-max">
        <Card className="shadow-sm">
          <Card.Body className="p-3 p-md-4">
            <h1 className="h4 fw-semibold mb-2 text-center">Daily Automation</h1>
            <p className="text-center text-muted mb-3">
              Set <b>{shortcutName}</b> to run every day at <b>{timePretty}</b>.
            </p>

            {!isIOS && (
              <Alert variant="warning" className="mb-3">
                Open this page on your iPhone to finish setup.
              </Alert>
            )}

            <div className="d-grid gap-2 mb-3">
              <Button size="lg" href={deepLinks.app}>Open Shortcuts</Button>
              <Button size="lg" variant="outline-primary" href={deepLinks.open}>
                Open “{shortcutName}”
              </Button>
              <Button size="lg" variant="outline-secondary" href={deepLinks.run}>
                Test run now
              </Button>
            </div>

            <hr className="my-3" />

            {/* Checklist */}
            <ol className="ps-3 mb-0 small">
              <li className="mb-2">
                Open the <b>Shortcuts</b> app → go to <b>Automation</b> → tap <b>New Personal Automation</b>.
                <Form.Check
                  className="mt-1"
                  type="checkbox"
                  label="Opened Automation"
                  checked={steps.open}
                  onChange={() => { toggle("open"); goTo(1); }}
                />
              </li>
              <li className="mb-2">
                Choose <b>Time of Day</b>.
                <Form.Check
                  className="mt-1"
                  type="checkbox"
                  label="Selected Time of Day"
                  checked={steps.create}
                  onChange={() => { toggle("create"); goTo(2); }}
                />
              </li>
              <li className="mb-2">
                Set the time to <b>{timePretty}</b> → set <b>Repeat</b> to <b>Daily</b> → tap <b>Next</b>.
                <Form.Check
                  className="mt-1"
                  type="checkbox"
                  label="Time set & Daily repeat"
                  checked={steps.ask}
                  onChange={() => { toggle("ask"); goTo(3); }}
                />
              </li>
              <li className="mb-2">
                Tap <b>Add Action</b> → <b>Run Shortcut</b> → pick <b>{shortcutName}</b>.
                <Form.Check
                  className="mt-1"
                  type="checkbox"
                  label={`"${shortcutName}" selected`}
                  checked={steps.pick}
                  onChange={() => { toggle("pick"); goTo(4); }}
                />
              </li>
              <li className="mb-2">
                Review and tap <b>Done</b>.
                <Form.Check
                  className="mt-1"
                  type="checkbox"
                  label="Automation saved"
                  checked={steps.done}
                  onChange={() => { toggle("done"); goTo(4); }}
                />
              </li>
            </ol>
          </Card.Body>
        </Card>

        <div className="auto-setup-help small text-muted mt-3">
          Tip: if the test run fails, open the Shortcut, confirm the <code>X-API-Key</code> header and try again.
        </div>
      </div>

      {/* --- Image Stepper (below everything) --- */}
      <div className="mt-4 auto-stepper-shell" style={{ display: "grid", placeItems: "center" }}>
        <div
          style={{ width: "100%", maxWidth: MAX_IMG_W }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="mb-2 fw-semibold">
            {idx + 1}. {IMAGE_STEPS[idx].title}
          </div>

          <div className="border rounded-3 overflow-hidden mb-3 auto-stepper-frame">
            <img
              src={IMAGE_STEPS[idx].src}
              alt={IMAGE_STEPS[idx].title}
              loading="lazy"
              className="auto-stepper-img"
            />
          </div>

          <div className="d-flex align-items-center justify-content-between">
            <Button
              variant="outline-secondary"
              onClick={prev}
              disabled={idx === 0}
              className="px-3 py-2"
              style={{ minWidth: 96 }}
            >
              ← Prev
            </Button>

            <div className="d-flex align-items-center gap-2">
              {IMAGE_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className="auto-stepper-dot"
                  style={{ opacity: i === idx ? 1 : 0.45 }}
                />
              ))}
            </div>

            <Button
              variant="outline-secondary"
              onClick={next}
              disabled={idx === IMAGE_STEPS.length - 1}
              className="px-3 py-2"
              style={{ minWidth: 96 }}
            >
              Next →
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
