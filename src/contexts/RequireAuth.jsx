// src/contexts/RequireAuth.jsx
import { useAuth } from "./AuthContext";
import { Navigate, useLocation } from "react-router-dom";

/**
 * Minimal guard:
 * - If Firebase has a user, allow.
 * - If not, send to /login.
 * - NO 'active' / approval checks here (handled by /pending UX).
 */
export default function RequireAuth({ children }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // While Firebase auth state is resolving, render nothing (prevents flicker).
  if (loading) return null;

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
