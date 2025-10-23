// src/pages/ShortcutSetup.jsx
import { useMemo } from "react";
import { Card, Button, Alert, Form, InputGroup, Container } from "react-bootstrap";
import "./../css/shortcut-setup.css";

export default function ShortcutSetup() {
  const SHORTCUT_TEMPLATE_URL = import.meta.env.VITE_SHORTCUT_TEMPLATE_URL || "";

  const apiKey = useMemo(() => {
    const raw = (window.location.hash || "").replace(/^#/, "");
    try { return decodeURIComponent(raw); } catch { return raw; }
  }, []);

  const installLink = useMemo(() => {
    // Just use the iCloud link; iOS will open Shortcuts
    return SHORTCUT_TEMPLATE_URL || "";
  }, [SHORTCUT_TEMPLATE_URL]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey || "");
      alert("API key copied to clipboard");
    } catch {
      alert("Copy failed. Long-press the key and copy manually.");
    }
  };

  const install = () => {
    window.location.assign(installLink); // keep back button working
  };


  return (
    <Container fluid className="shortcut-wrap">
      <div className="shortcut-max">
        <Card className="shortcut-card shadow-sm">
          <Card.Body className="p-3">
            <h1 className="h4 fw-semibold mb-3 text-center">Connect your Shortcut</h1>

            {!apiKey && (
              <Alert variant="warning" className="mb-3">
                No API key found in the URL. Please re-scan the QR from the website.
              </Alert>
            )}

            <div className="mb-3">
              <div className="text-muted small mb-1">Your API key</div>
              <InputGroup>
                <Form.Control readOnly value={apiKey || "—"} className="key-input" aria-label="API key" />
                <Button onClick={copy} disabled={!apiKey} variant="secondary">Copy</Button>
              </InputGroup>
              <div className="form-text">The key is in the URL hash, so it never hits server logs.</div>
            </div>

            <ol className="small ps-3 mb-0">
              <li>Tap <strong>Copy</strong>.</li>
              <li>Tap <strong>Install Shortcut</strong> → <strong>Add Shortcut</strong>.</li>
              <li>On first run, paste the key into the <code>X-API-Key</code> header.</li>
            </ol>
          </Card.Body>
        </Card>
      </div>

      {/* Fixed, full-width CTA for phones */}
      <div className="cta-fixed">
        <div className="d-grid gap-2">
          <Button size="lg" onClick={copy} disabled={!apiKey}>Copy API key</Button>
          <Button size="lg" variant="primary" onClick={install}>Install Shortcut</Button>
        </div>
      </div>
    </Container>
  );
}
