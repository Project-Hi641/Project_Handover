import React, { useEffect, useState } from "react";
import { Card, Button, Form, Alert, Spinner } from "react-bootstrap";
import { auth } from "../services/Firebase";
import { applyTheme, getSavedTheme } from "../utils/theme";

const LS_KEYS = {
  notifications: "hdt_notifications", // true | false
};

export default function Settings() {
  // Account state
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Preferences state
  const [theme, setTheme] = useState("light");        // "light" | "dark" | "cb"
  const [notifications, setNotifications] = useState(true);

  // Hydrate theme + notifications from storage on mount
  useEffect(() => {
    const savedTheme = getSavedTheme() || "light";
    setTheme(savedTheme);

    const savedNoti = localStorage.getItem(LS_KEYS.notifications);
    setNotifications(savedNoti === null ? true : savedNoti === "true");
  }, []);

  // Handlers
  const handleThemeChange = (e) => {
    const next = e.target.value; // "light" | "dark" | "cb"
    setTheme(next);
    applyTheme(next);
  };

  const handleToggleNotifications = () => {
    const next = !notifications;
    setNotifications(next);
    localStorage.setItem(LS_KEYS.notifications, String(next));
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const user = auth.currentUser;
    if (!user) {
      setError("No user is currently signed in.");
      setLoading(false);
      return;
    }

    try {
      await user.updatePassword(newPassword);
      setSuccess("Password updated successfully.");
      setNewPassword("");
    } catch (err) {
      // Firebase often requires a recent login for sensitive actions
      if (err?.code === "auth/requires-recent-login") {
        setError("Please reauthenticate (log out and log back in) before changing your password.");
      } else {
        setError(err?.message || "Failed to update password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-main">
      <section className="dashboard-content">
        <div className="container py-3">
          <h2 className="mb-3">Settings</h2>

          {/* Account */}
          <Card className="mb-3 shadow-sm">
            <Card.Body>
              <h5 className="mb-2">Account</h5>
              <p className="text-muted mb-3">Change your account password below.</p>

              {error && <Alert variant="danger" className="mb-2">{error}</Alert>}
              {success && <Alert variant="success" className="mb-2">{success}</Alert>}

              <Form onSubmit={handlePasswordChange} className="mb-3" style={{ maxWidth: 420 }}>
                <Form.Group controlId="formNewPassword" className="mb-2">
                  <Form.Label>New Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    required
                    placeholder="Enter new password"
                  />
                  <Form.Text className="text-muted">
                    Minimum 6 characters. You may be asked to sign in again for security.
                  </Form.Text>
                </Form.Group>
                <Button type="submit" disabled={loading || !newPassword}>
                  {loading ? <Spinner size="sm" animation="border" /> : "Change password"}
                </Button>
              </Form>
              {/* // delete account button temporarily removed (see profile page)
              {/* <Button variant="outline-danger" disabled>
                Delete account
              </Button> */}
            </Card.Body>
          </Card>

          {/* Preferences */}
          <Card className="mb-3 shadow-sm">
            <Card.Body>
              <h5 className="mb-2">Preferences</h5>
              <p className="text-muted mb-3">Customize how the app looks and behaves.</p>

              <Form.Group className="mb-3" controlId="pref-theme">
                <Form.Label>Theme</Form.Label>
                <Form.Select value={theme} onChange={handleThemeChange} style={{ maxWidth: 260 }}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option> {/* NEW */}
                  <option value="cb">Color-blind Friendly</option> {/* NEW */}
                  <option value="hc">High Contrast</option> {/* NEW */}
                </Form.Select>
                <Form.Text className="text-muted">
                  Color-blind mode uses a palette designed to remain distinguishable for common color-vision deficiencies.
                </Form.Text>
              </Form.Group>

              <Form.Check
                type="switch"
                id="pref-notifications"
                label="Enable notifications"
                checked={notifications}
                onChange={handleToggleNotifications}
              />
            </Card.Body>
          </Card>

          {/* Privacy & data */}
          <Card className="mb-3 shadow-sm">
            <Card.Body>
              <h5 className="mb-2">Privacy & data</h5>
              <p className="text-muted mb-3">Export or remove your data. (Coming soon)</p>
              <div className="d-flex flex-wrap gap-2">
                <Button variant="outline-secondary" disabled>
                  Download my data
                </Button>
                <Button variant="outline-danger" disabled>
                  Erase my data
                </Button>
              </div>
              <Form.Switch className="mt-3" label="Include raw payload in exports" disabled defaultChecked />
            </Card.Body>
          </Card>

          {/* Integrations */}
          <Card className="shadow-sm">
            <Card.Body>
              <h5 className="mb-2">Integrations</h5>
              <p className="text-muted mb-3">Manage iOS Shortcut API keys and automation.</p>
              <Button href="/integrations">Open integrations</Button>
            </Card.Body>
          </Card>
        </div>
      </section>
    </div>
  );
}
