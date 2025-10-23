// AuthContext.jsx
// Centralised auth state using Firebase Auth (compat/v8 style API).
// Exposes `currentUser`, `loading`, and simple helpers (signup/login/logout).

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../services/Firebase"; // initialised Firebase Auth (compat)

const AuthContext = createContext();

/** Hook used across the app to read auth state. */
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  // IMPORTANT: start as `null` (unknown/unauthenticated). `{}` is truthy and
  // will fool route guards.
  const [currentUser, setCurrentUser] = useState(null);

  // While Firebase is figuring out the session, keep `loading=true`.
  const [loading, setLoading] = useState(true);

  // Thin wrappers around Firebase Auth methods (compat API).
  function signup(email, password) {
    return auth.createUserWithEmailAndPassword(email, password);
  }
  function login(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  }
  function logout() {
    return auth.signOut();
  }
  function resetPassword(email) {
    return auth.sendPasswordResetEmail(email, {
      url: "https://healthkit-data-toolkit.vercel.app/dashboard"
    });
  }

  // Subscribe once to Firebase auth state; when it fires the first time, we
  // know if there's a logged-in user or not, then flip off `loading`.
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user ?? null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = { currentUser, loading, signup, login, logout, resetPassword };

  // Option: while loading, you can render a spinner/skeleton here instead of
  // the children. Keeping children renders is fine if your route guards also
  // check `loading`.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
