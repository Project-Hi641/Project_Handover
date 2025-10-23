import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/Firebase";
import "../css/sidebar.css"; 

export default function Sidebar() {
  const { currentUser } = useAuth();
  const [u, setU] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!currentUser) return;
        const t = await auth.currentUser.getIdToken();
        const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${t}` } });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch { data = null; }
        if (Array.isArray(data)) data = data.find(d => d?._id === currentUser.uid) || null;
        if (mounted) setU(data);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [currentUser]);

  const isAdmin = u?.role === "admin";

  const displayName =
    u?.displayName?.trim() ||
    [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
    u?.email ||
    currentUser?.email ||
    "User";

  const email = u?.email || currentUser?.email || "";
  const photoURL = u?.photoURL || null;
  const initials = getInitials(displayName);

  const navItems = [
    { label: "Dashboard", to: "/dashboard" },
    { label: "Summary", to: "/summary" },
    { label: "Goals", to: "/goals" },
    { label: "Shortcut Setup", to: "/download" },
    { label: "Profile", to: "/profile" },
    { label: "Settings", to: "/settings" },
    { label: "Logout", to: "/logout" },
    ...(loading ? [] : (isAdmin ? [{ label: "Admin", to: "/admin" }] : [])),
  ];

  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-profile">
        <div className="dashboard-avatar">
          {photoURL ? (
            <img src={photoURL} alt={displayName} referrerPolicy="no-referrer" />
          ) : (
            <span aria-label="avatar" className="dashboard-avatar-fallback">
              {initials || "👤"}
            </span>
          )}
        </div>
        <div className="dashboard-username">{displayName}</div>
        <div className="dashboard-email">{email}</div>
      </div>

      <ul className="dashboard-nav">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end
              className={({ isActive }) => "dashboard-link" + (isActive ? " active" : "")}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function getInitials(name) {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || "").join("");
}
