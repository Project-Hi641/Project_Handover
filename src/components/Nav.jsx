// src/components/Nav.jsx 
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSidebar } from "../contexts/SidebarContext";


// simple inline icons that inherit currentColor
function IconMenu({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function IconChevronsLeft({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

export default function Nav() {
  const { currentUser } = useAuth();
  const { collapsed, toggle } = useSidebar();
  const { pathname } = useLocation();

  // show the toggle only on routes that actually have the sidebar
  const showToggle = /^\/(dashboard|summary|profile|download|settings|goals|admin|logout)/.test(pathname);

  return (
    <nav className={`topnav ${pathname === "/" ? "topnav--home" : ""}`}>
      <div className="topnav-left">
        <button
          type="button"
          onClick={toggle}
          className="nav-toggle"
          aria-label="Toggle sidebar"
          aria-pressed={collapsed}
          title={collapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {collapsed ? <IconMenu size={24} /> : <IconChevronsLeft size={24} />}
        </button>


          {currentUser ? (
          <>
           <Link to="/dashboard" className="topnav-link">Dashboard</Link>
           <Link to="/about" className="topnav-link">About Us</Link>
          <Link to="/download" className="topnav-link">Quick Setup</Link>
          </>
        ) : (
          <>
            <Link to="/dashboard" className="topnav-link">Dashboard</Link>
            <Link to="/about" className="topnav-link">About Us</Link>
          </>
        )}
      </div>

      <div className="topnav-right">
        {currentUser ? (
          <>
            <Link to="/help" className="topnav-link">Help</Link>
            <Link to="/logout" className="topnav-link">Logout</Link>
          </>
        ) : (
          <>
            <Link to="/signup" className="topnav-link">Register</Link>
            <Link to="/login" className="topnav-link">Login</Link>
          </>
        )}
      </div>
    </nav>
  );
}
