import { useAuth } from "./AuthContext";
import { Navigate, useLocation } from "react-router-dom";

/**
 * If authenticated, send to /auth-check (approval gate) instead of dashboard.
 * This prevents any flicker or accidental access by pending accounts.
 */
export default function RedirectIfAuth({ children }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (currentUser) {
    return <Navigate to="/auth-check" replace state={{ from: location.state?.from }} />;
  }
  return children;
}
