// src/pages/Home.jsx
import React from "react";
import { Link } from "react-router-dom";
import NavLanding from "../components/NavLanding.jsx";
import "../css/landing.css";

export default function Home() {
  return (
    <main className="login-page is-centered is-home">
      <NavLanding />
      <div className="login-shell">
        <section className="login-card" style={{ textAlign: "center" }}>
          <h1 className="hero-title" style={{ marginBottom: 6 }}>HealthKit<br />Data Toolkit</h1>
          <p className="hero-subtitle" style={{ marginBottom: 18 }}>
            Heart, fitness and sleep tracking
          </p>

          <h2 className="login-heading" style={{ marginTop: 8, marginBottom: 14 }}>Welcome</h2>
            <p className="force-white" style={{ marginBottom: 18 }}>
              Get started by creating an account or logging in.
            </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link to="/signup" className="btn-login">Register</Link>
            <Link to="/login"  className="btn-login">Login</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
