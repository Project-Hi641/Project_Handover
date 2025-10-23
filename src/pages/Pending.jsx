import { useEffect } from "react";
import { Card, Button, Alert } from "react-bootstrap";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { auth } from "../services/Firebase";

export default function Pending() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    async function gate() {
      // If approved user somehow lands here, bounce to dashboard.
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          const res = await fetch(`/api/users?id=${encodeURIComponent(currentUser.uid)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.active !== false) {
              if (!cancelled) navigate("/dashboard", { replace: true });
              return;
            }
          }
        } catch {}
        // Pending or unknown: ensure signed out so they can’t access authed routes.
        try { await auth.signOut(); } catch {}
      }
    }
    gate();
    return () => { cancelled = true; };
  }, [currentUser]);

  return (
    <div className="container py-4">
      <Card className="shadow-sm">
        <Card.Body>
          <h2 className="mb-2">Account pending approval</h2>
          {location.state?.reason && <Alert variant="info">{location.state.reason}</Alert>}
          <p>
            Thanks for signing up. An admin needs to approve your account before you can use the app.
            We’ll notify you after approval.
          </p>
          <div className="d-flex gap-2">
            <Button onClick={() => navigate("/login", { replace: true })}>Back to login</Button>
            <Button variant="outline-secondary" onClick={() => navigate("/", { replace: true })}>
              Home
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
