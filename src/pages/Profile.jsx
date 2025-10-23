// src/pages/Profile.jsx
import { useEffect, useState } from "react";
import { Card, Form, Button, Alert, Spinner } from "react-bootstrap";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/Firebase";
import { useNavigate } from "react-router-dom";

/**
 * Profile with admin-approved email changes:
 * - Email input is editable.
 * - If user changes email, we create a *pending* email_change request
 *   via /api/admin/requests and show a "pending approval" banner.
 * - For now, we *try* to query pending requests for this uid to persist the banner across reloads.
 *   If backend denies for non-admins (403), we simply don’t show the persisted banner and rely on
 *   the post-submit flag (still a good UX).
 * - Other fields PATCH as usual to /api/users.
 */
export default function Profile() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingEmailChange, setPendingEmailChange] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError("");
        if (!currentUser) return;
        const token = await auth.currentUser.getIdToken();
        const uid = auth.currentUser.uid;

        // Load (or create) profile doc
        let res = await fetch(`/api/users?id=${encodeURIComponent(uid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 404) {
          // Create baseline doc
          const displayName = currentUser.displayName || "";
          const email = currentUser.email || "";
          const post = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email, displayName, role: "user" }),
          });
          if (!post.ok) {
            const body = await post.json().catch(() => ({}));
            throw new Error(body?.error || `POST ${post.status}`);
          }
          res = await fetch(`/api/users?id=${encodeURIComponent(uid)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `GET ${res.status}`);

        const doc = {
          _id: data._id,
          email: data.email || currentUser.email || "",
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          displayName: data.displayName || `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim(),
          address: data.address || "",
          dob: toInputDate(data.dob),
          gender: data.gender || "",
          phone: data.phone || "",
          notes: data.notes || "",
        };
        if (mounted) setInfo(doc);

        // Attempt to see if there's a pending email_change for this uid (non-admin may get 403; ignore)
        try {
          const rq = await fetch(`/api/admin/requests?uid=${encodeURIComponent(uid)}&type=email_change`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (rq.ok) {
            const body = await rq.json();
            // Accept either {emailChange:[...]} shape or array[…]
            const list = Array.isArray(body) ? body : (body?.emailChange || body?.items || []);
            if (mounted && list && list.length > 0) setPendingEmailChange(true);
          }
        } catch {}
      } catch (e) {
        console.error(e);
        if (mounted) setError(e.message || "Failed to load profile");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [currentUser]);

  if (!currentUser) {
    return <Alert variant="warning" className="m-3">You need to sign in to edit your profile.</Alert>;
  }

  if (loading) {
    return (
      <div className="container py-3">
        <Card className="shadow-sm">
          <Card.Body className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" /> Loading…
          </Card.Body>
        </Card>
      </div>
    );
  }

  function onChange(e) {
    const { name, value } = e.target;
    setInfo((p) => ({ ...p, [name]: value }));
  }

  async function onSave() {
    setError(""); setSaving(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const uid = auth.currentUser.uid;

      // If email has changed, create a *pending* email change request (don’t PATCH email directly).
      if (info.email && info.email.toLowerCase() !== (currentUser.email || "").toLowerCase()) {
        const resp = await fetch("/api/admin/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: "email_change",
            uid,
            oldEmail: currentUser.email,
            newEmail: info.email.trim().toLowerCase(),
            createdAt: new Date().toISOString(),
            status: "pending",
          }),
        });
        const data = await resp.json().catch(()=> ({}));
        if (!resp.ok) throw new Error(data?.error || `Email change request failed (${resp.status})`);
        setPendingEmailChange(true);
        alert("Email change submitted for admin approval.");
      }

      // PATCH all *other* fields to /api/users (leave email as current value in DB)
      const payload = {
        email: undefined, // do not patch email here
        displayName: info.displayName?.trim() || `${info.firstName} ${info.lastName}`.trim(),
        firstName: info.firstName?.trim(),
        lastName: info.lastName?.trim(),
        address: info.address?.trim(),
        dob: info.dob || null,
        gender: info.gender || "",
        phone: info.phone?.trim(),
        notes: info.notes?.trim(),
      };
      const res = await fetch(`/api/users?id=${encodeURIComponent(info._id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `PATCH ${res.status}`);

      // reflect any non-email changes in UI
      setInfo((p) => ({ ...p, ...body, email: info.email }));
      alert("Saved!");
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete your account permanently? You’ll be signed out immediately while an admin reviews it.")) return;

    setError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const uid   = auth.currentUser.uid;

      // (Optional) collect a reason from the user
      const reason = prompt("Optional: briefly tell us why you’re deleting (press Cancel to skip)") || "";

      // Create a pending account_delete request (your /api/admin.js dispatcher)
      const resp = await fetch("/api/admin?action=requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "account_delete",
          uid,
          reason,
          createdAt: new Date().toISOString(),
          status: "pending",
        }),
      });

      // Robust parse to avoid “Unexpected end of JSON”
      const txt = await resp.text();
      let data; try { data = JSON.parse(txt); } catch { data = null; }

      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || `Delete request failed (${resp.status})`);
      }

      // Server disables the Firebase user on request creation; sign out locally too
      await auth.signOut();
      alert("Your delete request was submitted. You’ve been signed out while an admin reviews it.");
      navigate("/", { replace: true });
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to submit delete request");
    }
  }


  return (
    <div className="container py-3">
      <Card className="shadow-sm">
        <Card.Body>
          <h2 className="mb-3">Edit Profile</h2>
          {error && <Alert variant="danger">{error}</Alert>}
          {pendingEmailChange && (
            <Alert variant="warning" className="mb-3">
              Your email change is pending admin approval. You’ll be notified once processed.
            </Alert>
          )}

          {/* Inputs only, no <form> */}
          <Form.Group className="mb-2">
            <Form.Label>First name</Form.Label>
            <Form.Control name="firstName" value={info.firstName} onChange={onChange} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Last name</Form.Label>
            <Form.Control name="lastName" value={info.lastName} onChange={onChange} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Display name</Form.Label>
            <Form.Control name="displayName" value={info.displayName} onChange={onChange} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Address</Form.Label>
            <Form.Control name="address" value={info.address} onChange={onChange} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Date of birth</Form.Label>
            <Form.Control type="date" name="dob" value={info.dob || ""} onChange={onChange} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Gender</Form.Label>
            <Form.Select name="gender" value={info.gender} onChange={onChange}>
              <option value="">— Select —</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="nonbinary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
              <option value="other">Other</option>
            </Form.Select>
          </Form.Group>

          {/* Email: editable → creates pending request on save if changed */}
          <Form.Group className="mb-2">
            <Form.Label>Email</Form.Label>
            <Form.Control
              type="email"
              name="email"
              value={info.email}
              onChange={onChange}
              disabled={pendingEmailChange} // lock while pending to avoid repeated requests
            />
            {pendingEmailChange && (
              <Form.Text className="text-warning">Email change pending admin approval.</Form.Text>
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Phone</Form.Label>
            <Form.Control name="phone" value={info.phone} onChange={onChange} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Notes</Form.Label>
            <Form.Control as="textarea" rows={3} name="notes" value={info.notes} onChange={onChange} />
          </Form.Group>

          <div className="d-flex gap-2">
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="outline-danger" onClick={onDelete}>
              Delete account
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

function toInputDate(value) {
  if (!value) return "";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch { return ""; }
}
