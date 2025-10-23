// src/pages/AuthCheck.jsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Spinner, Container } from "react-bootstrap";
import { auth } from "../services/Firebase";

/**
 * Post-login gate:
 *  - Approved -> /dashboard (or intended route)
 *  - Pending  -> signOut() then HARD RELOAD to /pending
 *  - No user  -> /login (only after auth state is known)
 *
 * Using onAuthStateChanged to avoid early reads of auth.currentUser.
 * Using window.location.replace(...) to fully reset router/auth state
 * so you can immediately log in as a different user without loops.
 */
export default function AuthCheck() {
  const [busy, setBusy] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let alive = true;

    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!alive) return;

      // No session -> go to login (single navigation)
      if (!user) {
        setBusy(false);
        navigate("/login", {
          replace: true,
          state: { reason: "Please sign in to continue." },
        });
        return;
      }

      try {
        // Fresh token
        const token = await user.getIdToken(true);

        // Fetch user doc
        const res = await fetch(`/api/users?id=${encodeURIComponent(user.uid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        let data = null; try { data = JSON.parse(text); } catch {}

        const isPending = (res.status === 404) || (res.ok && data && data.active === false);

        if (isPending) {
          // 1) Kill session
          try { await auth.signOut(); } catch {}
          // 2) Small tick to let Firebase broadcast the null state
          await new Promise(r => setTimeout(r, 50));
          // 3) HARD RELOAD to /pending so the app starts fresh (no loop)
          window.location.replace("/pending");
          return; // stop
        }

        // Approved → go to intended route or /dashboard
        const dest = location.state?.from?.pathname || "/dashboard";
        if (!alive) return;
        navigate(dest, { replace: true });
      } catch {
        // On error, hard sign out and go to login cleanly
        try { await auth.signOut(); } catch {}
        await new Promise(r => setTimeout(r, 50));
        window.location.replace("/login?reason=verify");
      } finally {
        if (alive) setBusy(false);
      }
    });

    return () => { alive = false; unsub(); };
  }, [navigate, location.state?.from?.pathname]);

  if (busy) {
    return (
      <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: "60vh" }}>
        <div className="d-flex align-items-center gap-2 text-muted">
          <Spinner animation="border" size="sm" />
          <span>Checking your account…</span>
        </div>
      </Container>
    );
  }
  return null;
}
