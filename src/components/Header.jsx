import Nav from "./Nav";
import { useLocation } from "react-router-dom";

// the header
export default function Header() {
  const location = useLocation();
  const hideNav = location.pathname === "/signup" || location.pathname === "/login";

  if (hideNav) return null;

  return (
    <header>
      <Nav />
    </header>
  );
}
