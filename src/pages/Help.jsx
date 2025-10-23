import React from "react";
import { Card, Accordion, Table, Badge, Button } from "react-bootstrap";
import { Link } from "react-router-dom";


export default function Help() {
  return (
    <div className="container py-3">
      <h2 className="mb-3">Help & Support</h2>

      <Card className="mb-3 shadow-sm">
        <Card.Body>
          <h5 className="mb-2">Quick start</h5>
          <ol className="mb-0">
            <li>Connect data on <Link to="/download">Manage Integrations</Link>.</li>
            <li>See trends on <Link to="/dashboard">Dashboard</Link>.</li>
            <li>Set goals on <Link to="/goal-setting">Goal Setting</Link>.</li>
            <li>Adjust theme & preferences in <Link to="/settings">Settings</Link>.</li>
          </ol>
        </Card.Body>
      </Card>

      <Accordion alwaysOpen className="mb-3">
        <Accordion.Item eventKey="nav">
          <Accordion.Header>Navigation</Accordion.Header>
          <Accordion.Body>
            Use the sidebar/top bar to move between:
            <ul className="mb-0">
              <li><Link to="/dashboard">Dashboard</Link> — steps, heart zones, sleep.</li>
              <li><Link to="/summary">Summary</Link> — detailed breakdowns.</li>
              <li><Link to="/goal-setting">Goal Setting</Link> — weekly targets.</li>
              <li><Link to="/download">Manage Integrations</Link> — data sources.</li>
              <li><Link to="/settings">Settings</Link> — theme, notifications, privacy.</li>
              <li><Link to="/admin">Admin</Link> — admin tools (if enabled).</li>
            </ul>
          </Accordion.Body>
        </Accordion.Item>

        <Accordion.Item eventKey="accessibility">
          <Accordion.Header>Accessibility & tips</Accordion.Header>
          <Accordion.Body>
            <ul className="mb-2">
              <li>
                Theme: choose <Badge bg="secondary">Light</Badge>, <Badge bg="secondary">Dark</Badge>,
                <Badge bg="secondary">High Contrast</Badge> or <Badge bg="secondary">Color-blind Friendly</Badge> in <Link to="/settings">Settings</Link>.
              </li>
              <li>Voice assistant: enable on the Dashboard to have buttons and summaries read aloud.</li>
              <li>Charts: tooltips adapt to theme; color-blind mode uses a deuteranomaly-safe palette.</li>
            </ul>
            Need something else? <a href="mailto:support@example.com">Contact support</a>.
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>

      <Card className="shadow-sm">
        <Card.Body>
          <h5 className="mb-2">Still stuck?</h5>
          <p className="mb-0">
            Send us details and a screenshot at <a href="mailto:support@example.com">support@example.com</a>.
          </p>
        </Card.Body>
      </Card>
    </div>
  );
}
