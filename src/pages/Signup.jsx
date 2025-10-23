import { useRef, useState, useEffect } from "react";
import { Form, Button, Alert } from "react-bootstrap";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../services/Firebase";
import NavRegister from "../components/NavRegister.jsx";
import "../css/landing.css";

function friendlySignupError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/email-already-in-use": return "There’s already an account with that email.";
    case "auth/invalid-email": return "That email address looks invalid.";
    case "auth/weak-password": return "Please choose a stronger password.";
    case "auth/network-request-failed": return "Network error. Check your connection and try again.";
    default: return err?.message || "Failed to create an account.";
  }
}

/**
 * Admin approval flow:
 * - Create Firebase user
 * - Set displayName
 * - POST pending request
 * - Sign out immediately and route to /pending
 */
export default function Signup() {
  const fnameRef = useRef();
  const lnameRef = useRef();
  const emailRef = useRef();
  const passwordRef = useRef();
  const passwordConfirmRef = useRef();

  const { signup } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Preload register bg (optional smoother first paint)
  useEffect(() => {
    const bg = new Image();
    bg.src = new URL("../assets/RegisterPage.jpg", import.meta.url).toString();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    const first = fnameRef.current.value.trim();
    const last = lnameRef.current.value.trim();
    const email = emailRef.current.value.trim().toLowerCase();
    const password = passwordRef.current.value;
    const confirm = passwordConfirmRef.current.value;

    if (!first || !last) return setError("Please enter your first and last name.");
    if (password !== confirm) return setError("Passwords do not match.");

    try {
      setError("");
      setLoading(true);

      // 1) Create Firebase auth user
      const cred = await signup(email, password);
      const user = cred.user;

      // 2) Set displayName
      const displayName = `${first} ${last}`.trim();
      if (auth.currentUser) {
        await auth.currentUser.updateProfile({ displayName });
      }

      // 3) Pending approval request
      const idToken = await user.getIdToken();
      const resp = await fetch("/api/admin?action=requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          type: "signup",
          uid: user.uid,
          email: user.email,
          displayName,
          firstName: first,
          lastName: last,
          createdAt: new Date().toISOString(),
          status: "pending",
        }),
      });

      const text = await resp.text();
      let body; try { body = JSON.parse(text); } catch { body = {}; }
      if (!resp.ok) throw new Error(body?.error || `Request failed (${resp.status})`);

      // 4) Logout immediately and show /pending
      try { await auth.signOut(); } catch {}
      navigate("/pending", { replace: true });
    } catch (err) {
      console.error(err);
      setError(friendlySignupError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="register-page">
      <NavRegister />
      <div className="register-shell">
        <section className="register-card">
          <h2 className="register-heading">Create Your Account</h2>

          {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

          <Form onSubmit={handleSubmit} noValidate>
            <Form.Group className="mb-3" controlId="firstName">
              <Form.Label>First Name</Form.Label>
              <Form.Control type="text" ref={fnameRef} required disabled={loading} autoComplete="given-name" />
            </Form.Group>

            <Form.Group className="mb-3" controlId="lastName">
              <Form.Label>Last Name</Form.Label>
              <Form.Control type="text" ref={lnameRef} required disabled={loading} autoComplete="family-name" />
            </Form.Group>

            <Form.Group className="mb-3" controlId="email">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" ref={emailRef} required disabled={loading} autoComplete="email" />
            </Form.Group>

            <Form.Group className="mb-3" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control type="password" ref={passwordRef} required disabled={loading} autoComplete="new-password" />
            </Form.Group>

            <Form.Group className="mb-4" controlId="passwordConfirm">
              <Form.Label>Confirm Password</Form.Label>
              <Form.Control type="password" ref={passwordConfirmRef} required disabled={loading} autoComplete="new-password" />
            </Form.Group>

            <Button disabled={loading} className="w-100 btn-register" type="submit">
              {loading ? "Creating…" : "Register"}
            </Button>
          </Form>

          <div className="text-center mt-3 text-on-dark">
            Already have an account? <Link to="/login">Login</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
