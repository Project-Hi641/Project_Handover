// src/pages/Logout.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/Firebase";

/**
 * Robust logout that:
 *  1) Signs out from Firebase
 *  2) Tries to revoke the current ID token (best-effort)
 *  3) Purges Firebase auth caches from storage
 *  4) Clears SW caches (best-effort)
 *  5) HARD-redirects to /login to avoid any router/auth race
 */
export default function Logout() {
  const { logout } = useAuth();
  const navigate = useNavigate(); // kept for fallback, but we hard redirect

  useEffect(() => {
    (async () => {
      try {
        // 1) Revoke token (best-effort; requires recent login to get token)
        try {
          const user = auth.currentUser;
          if (user) {
            const token = await user.getIdToken(/* forceRefresh */ true).catch(() => null);
            if (token && typeof navigator?.credentials?.preventSilentAccess === "function") {
              // Not a real token revoke, but prevents some silent reauth in certain environments
              await navigator.credentials.preventSilentAccess().catch(() => {});
            }
          }
        } catch {}

        // 2) Firebase sign-out
        try { await logout(); } catch {}
        try { await auth.signOut(); } catch {}

        // 3) Purge Firebase caches in storage
        try {
          const wipe = (store) => {
            if (!store) return;
            const keys = [];
            for (let i = 0; i < store.length; i++) {
              const k = store.key(i);
              if (!k) continue;
              // Firebase web SDK prefixes
              if (k.startsWith("firebase:") || k.startsWith("FIREBASE") || k.includes("authUser")) {
                keys.push(k);
              }
            }
            keys.forEach((k) => store.removeItem(k));
          };
          wipe(window.localStorage);
          wipe(window.sessionStorage);
        } catch {}

        // 4) Try to clear SW caches (won’t throw if none)
        try {
          if (window.caches && caches.keys) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
          }
        } catch {}

        // Small tick to let onAuthStateChanged propagate
        await new Promise((r) => setTimeout(r, 30));
      } finally {
        // 5) HARD navigation to fully reset app state
        window.location.replace("/login?reason=logout");
        // Fallback if replace is blocked
        setTimeout(() => navigate("/login", { replace: true }), 150);
      }
    })();
  }, [logout, navigate]);

  return <p style={{ padding: 16 }}>Logging out…</p>;
}
