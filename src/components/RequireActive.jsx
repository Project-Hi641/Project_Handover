import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { auth } from "../services/Firebase";

export default function RequireActive() {
  const [state, setState] = useState({ loading: true, allowed: false, pending: false });
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) { if (alive) setState({ loading: false, allowed: false, pending: false }); return; }
        const token = await user.getIdToken();

        // Light touch check: ask server if user is active by hitting a minimal endpoint
        // Use /api/users?id=uid (which now uses requireActiveUser server side)
        const r = await fetch(`/api/users?id=${encodeURIComponent(user.uid)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (r.status === 403) { // pending
          if (alive) setState({ loading: false, allowed: false, pending: true });
          return;
        }
        if (!r.ok) { // treat other failures as not allowed (forces login)
          if (alive) setState({ loading: false, allowed: false, pending: false });
          return;
        }
        // OK means active
        if (alive) setState({ loading: false, allowed: true, pending: false });
      } catch {
        if (alive) setState({ loading: false, allowed: false, pending: false });
      }
    })();
    return () => { alive = false; };
  }, [loc.pathname]);

  if (state.loading) return null; // or a global spinner

  if (!auth.currentUser) return <Navigate to="/login" replace />;
  if (state.pending)     return <Navigate to="/pending" replace />;

  return <Outlet />;
}
