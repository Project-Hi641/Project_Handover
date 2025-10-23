// src/pages/Download.jsx
// This is Apple Shorcut page
import { useEffect, useState } from "react";
import { Card, Button, Form, Table, Alert, Modal, InputGroup } from "react-bootstrap";
import QRCode from "qrcode";
import { useAuth } from "../contexts/AuthContext";

export default function Integrations() {
  const { currentUser } = useAuth();
  const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN || window.location.origin;

  const API_BASE = import.meta.env.VITE_API_BASE || "";
  const KEYS_URL = `${API_BASE}/api/integrations/shortcuts/keys`;
  const REVOKE_URL = `${API_BASE}/api/integrations/shortcuts/keys-revoke`;
  const UPLOAD_URL = `${API_BASE}/api/upload`;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const [plainKey, setPlainKey] = useState(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!currentUser) {
      setItems([]);
      setLoading(false);
      return;
    }
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  async function withToken(fetcher) {
    if (!currentUser) throw new Error("Not logged in");
    const t = await currentUser.getIdToken();
    return fetcher(t);
  }

  async function loadKeys() {
    setLoading(true);
    setErr("");
    try {
      const data = await withToken(async (t) => {
        const res = await fetch(KEYS_URL, { headers: { Authorization: `Bearer ${t}` } });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `GET ${res.status}`);
        return body;
      });
      setItems(data.items || []);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateKey(e) {
    e.preventDefault();
    setErr("");
    setCreating(true);
    try {
      const data = await withToken(async (t) => {
        const res = await fetch(KEYS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: JSON.stringify({ label: label.trim() || null }),
        });
        const text = await res.text();
        let body; try { body = JSON.parse(text); } catch { body = null; }
        if (!res.ok) throw new Error(body?.error || `POST ${res.status}`);
        return body; // { key, id, label }
      });

      setPlainKey(data.key);
      setShowKeyModal(true);
      setLabel("");

      const setupUrl = `${APP_ORIGIN}/shortcut-setup#${encodeURIComponent(data.key)}`;
      const url = await QRCode.toDataURL(setupUrl, { margin: 1, scale: 6 });
      setQrDataUrl(url);

      // (Optional) If you want the QR to encode raw upload info instead, swap to:
      // const qrText = `URL: ${UPLOAD_URL}\nHeader: X-API-Key: ${data.key}\nContent-Type: application/json`;
      // const url = await QRCode.toDataURL(qrText, { margin: 1, scale: 6 });

      loadKeys();
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id) {
    if (!window.confirm("Revoke this key? It will stop working immediately.")) return;
    setErr("");
    try {
      const ok = await withToken(async (t) => {
        const res = await fetch(REVOKE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: JSON.stringify({ id }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `POST ${res.status}`);
        return body.ok;
      });
      if (!ok) throw new Error("Revoke failed");
      loadKeys();
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to revoke key");
    }
  }

  function copy(text) {
    navigator.clipboard.writeText(text).then(
      () => alert("Copied"),
      () => alert("Copy failed")
    );
  }

  if (!currentUser) {
    return <div className="container py-3 text-muted">Please log in to manage integrations.</div>;
  }

  return (
    <div className="dashboard-main">{/* ⬅️ layout host */}
      <section className="dashboard-content">
        <div className="container py-3">
          <h2 className="mb-3">Integrations — Apple Shortcut</h2>
          {err && <Alert variant="danger">{err}</Alert>}

          <Card className="mb-3">
            <Card.Body>
              <h5 className="mb-2">Create a new API key</h5>
              <p className="text-muted mb-2">
                Generate a device-specific key to paste into the Apple Shortcut. You’ll see the plaintext key <strong>once</strong>.
              </p>
              <Form onSubmit={onCreateKey} className="d-flex gap-2" style={{ maxWidth: 520 }}>
                <Form.Control
                  placeholder="Device label (e.g. iPhone 14 Pro)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Generate key"}
                </Button>
              </Form>
            </Card.Body>
          </Card>

          <Card>
            <Card.Body>
              <h5 className="mb-3">Your keys</h5>
              {loading ? (
                <div className="text-muted">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-muted">No keys yet.</div>
              ) : (
                <Table size="sm" hover>
                  <thead>
                    <tr>
                      <th>Key ID</th>
                      <th>Label</th>
                      <th>Created</th>
                      <th>Last used</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((k) => (
                      <tr key={k.id}>
                        <td style={{ fontFamily: "monospace" }}>{k.id}</td>
                        <td>{k.label || "—"}</td>
                        <td>{k.createdAt ? new Date(k.createdAt).toLocaleString() : "—"}</td>
                        <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}</td>
                        <td>{k.revokedAt ? "Revoked" : "Active"}</td>
                        <td className="text-end">
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => onRevoke(k.id)}
                            disabled={Boolean(k.revokedAt)}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}

              <hr />
              <h6>Shortcut setup (on your iPhone)</h6>
              <ol className="mb-0">
                <li>Open the Shortcuts app.</li>
                <li>Paste your API key into the Shortcut input bubble.</li>
              </ol>
            </Card.Body>
          </Card>

          <Modal show={showKeyModal} onHide={() => setShowKeyModal(false)} centered>
            <Modal.Header closeButton><Modal.Title>New API key</Modal.Title></Modal.Header>
            <Modal.Body>
              <Alert variant="warning" className="mb-3">
                This key is shown <strong>once</strong>. Copy it now and paste into your Shortcut.
              </Alert>
              <Form.Label>Plaintext key</Form.Label>
              <InputGroup className="mb-3">
                <Form.Control value={plainKey || ""} readOnly style={{ fontFamily: "monospace" }} />
                <Button onClick={() => copy(plainKey || "")}>Copy</Button>
              </InputGroup>
              <Form.Label>QR code (scan with your phone)</Form.Label>
              <div className="d-flex justify-content-center">
                {qrDataUrl ? <img src={qrDataUrl} alt="QR" style={{ width: 220, height: 220 }} /> : <div className="text-muted">Generating…</div>}
              </div>
              <div className="mt-3 small text-muted">
                Scan the QR with your phone to open the setup page and install the Shortcut.
              </div>
            </Modal.Body>
            <Modal.Footer><Button variant="secondary" onClick={() => setShowKeyModal(false)}>Close</Button></Modal.Footer>
          </Modal>
        </div>
      </section>
    </div>
  );
}
