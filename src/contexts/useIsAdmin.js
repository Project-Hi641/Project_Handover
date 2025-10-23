import { useEffect, useState } from "react";
import { auth } from "../services/Firebase";

/**
 * Returns true if the current user's MongoDB user doc has role === "admin".
 * We fetch /api/users (which returns the caller's doc when authorised).
 */
export default function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          if (mounted) setIsAdmin(false);
          return;
        }
        const t = await user.getIdToken();
        const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${t}` } });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch { data = null; }

        if (!res.ok || !data?._id) {
          if (mounted) setIsAdmin(false);
          return;
        }
        if (mounted) setIsAdmin(data.role === "admin");
      } catch {
        if (mounted) setIsAdmin(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return isAdmin;
}
