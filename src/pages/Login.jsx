import { useRef, useState, useEffect } from "react";
import { Form, Button, Alert, Modal } from "react-bootstrap";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../css/landing.css";
import NavLanding from "../components/NavLanding.jsx";

function friendlyAuthError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-email": return "That email address looks invalid.";
    case "auth/user-not-found": return "No account was found with that email.";
    case "auth/wrong-password": return "Incorrect password. Please try again.";
    case "auth/invalid-credential": return "Email or password is incorrect.";
    case "auth/user-disabled": return "This account has been disabled.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed": return "Network error. Check your connection and try again.";
    default: return err?.message || "Failed to log in.";
  }
}

export default function Login() {
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // pending approval banner (if redirected from /pending)
  const [pendingHint, setPendingHint] = useState("");
  useEffect(() => {
    if (location.state?.reason) {
      setPendingHint(location.state.reason);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Reset modal state
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(emailRef.current.value, passwordRef.current.value);
      // Gate through /auth-check to block pending accounts before any redirect.
      navigate("/auth-check", { replace: true });
    } catch (err) {
      console.error(err);
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setResetMsg("");
    setResetError("");
    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      setResetMsg("Password reset email sent. Check your inbox/spam and follow the instructions.");
      setResetEmail("");
    } catch (err) {
      setResetError(friendlyAuthError(err));
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main className="login-page has-hero">
      <NavLanding />

      <div className="login-shell">
        {/* Left hero panel */}
        <section className="hero-panel">
          <h1 className="hero-title">HealthKit<br />Data Toolkit</h1>
          <p className="hero-subtitle">Heart, fitness and sleep tracking</p>
        </section>

        {/* Login card overlay */}
        <section className="login-card">
          <h2 className="login-heading">User Login</h2>

          {pendingHint && <Alert variant="warning" className="mb-3">{pendingHint}</Alert>}
          {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

          <Form onSubmit={handleSubmit} noValidate>
            <Form.Group id="email" className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                placeholder="Enter Email Or User ID Number"
                ref={emailRef}
                required
                autoComplete="username"
                disabled={loading}
              />
            </Form.Group>

            <Form.Group id="password" className="mb-2">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter Password"
                ref={passwordRef}
                required
                autoComplete="current-password"
                disabled={loading}
              />
            </Form.Group>

            <div className="login-actions d-flex align-items-center justify-content-between mb-3">
              <Form.Check type="checkbox" label="Remember Me" />
              <Button variant="link" onClick={() => setShowReset(true)} style={{ padding: 0 }}>
                Forgot password?
              </Button>
            </div>

            <Button disabled={loading} className="w-100 btn-login" type="submit">
              {loading ? "Logging in…" : "Login"}
            </Button>
          </Form>

          <div className="w-100 text-center mt-3 text-on-dark">
            Need an account? <Link to="/signup">Sign Up</Link>
          </div>
        </section>
      </div>

      {/* Reset Password Modal */}
      <Modal
        show={showReset}
        onHide={() => { setShowReset(false); setResetMsg(""); setResetError(""); }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Reset Password</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {resetMsg && <Alert variant="success">{resetMsg}</Alert>}
          {resetError && <Alert variant="danger">{resetError}</Alert>}
          <Form onSubmit={handleReset}>
            <Form.Group className="mb-3">
              <Form.Label>Email address</Form.Label>
              <Form.Control
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                placeholder="Enter your email"
                disabled={resetLoading}
              />
            </Form.Group>
            <Button type="submit" disabled={resetLoading || !resetEmail} className="w-100">
              {resetLoading ? "Sending..." : "Send password reset email"}
            </Button>
          </Form>
        </Modal.Body>
      </Modal>
    </main>
  );
}
