// src/components/NavLanding.jsx
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function NavLanding() {
  const { currentUser } = useAuth();

  return (
    <nav className="nav-landing">
      <div className="nav-landing__inner">
        <div className="nav-landing__left">
          <ul className="nav-landing__links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/dashboard">Dashboard</Link></li>
            <li><Link to="/about">About Us</Link></li>
          </ul>
        </div>

        <div className="nav-landing__right">
            <ul className="nav-landing__links">
                <li><Link to="/signup">Register</Link></li>
            </ul>
        </div>
      </div>
    </nav>
  );
}
