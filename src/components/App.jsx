// src/app/App.jsx
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Container } from "react-bootstrap";

import { AuthProvider } from "../contexts/AuthContext";
import RequireAuth from "../contexts/RequireAuth";
import RedirectIfAuth from "../contexts/RedirectIfAuth";

import Header from "./Header";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import Dashboard from "../pages/Dashboard";
import Profile from "../pages/Profile";
import Summary from "../pages/Summary";
import Download from "../pages/Download";
import Logout from "../pages/Logout";
import Admin from "../pages/Admin";
import ShortcutSetup from "../pages/ShortcutSetup";
import AutomationSetup from "../pages/AutomationSetup";
import Settings from "../pages/Settings";
import GoalSetting from "../pages/GoalSetting";
import Pending from "../pages/Pending";
import AboutUs from "../pages/AboutUs";
import AuthCheck from "../pages/Auth_Check";
import Sidebar from "../components/Sidebar";
import Help from "../pages/Help";
import { SidebarProvider, useSidebar } from "../contexts/SidebarContext";
import "../css/App.css";
import "../css/sidebar.css";

/** Auth screens (no sidebar) */
function CenteredAuthLayout() {
  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: "100vh" }}>
      <div className="w-100" style={{ maxWidth: 400 }}>
        <Outlet />
      </div>
    </Container>
  );
}

/** Top-level layout that always shows the Header. */
function PageLayout() {
  return (
    <>
      <Header />
      <Outlet />
    </>
  );
}

/** Authenticated app shell — consumes sidebar state from context */
function AppShell() {
  const { collapsed } = useSidebar();
  return (
    <div className={`dashboard-main ${collapsed ? "sb-collapsed" : ""}`}>
      <Sidebar />
      <section className="dashboard-content">
        <Outlet />
      </section>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SidebarProvider>
          <Routes>
              <Route path="/" element={<Home />} />
            <Route element={<PageLayout />}>
              {/* Public routes */}
              <Route path="/shortcut-setup" element={<ShortcutSetup />} />
              <Route path="/automation-setup" element={<AutomationSetup />} />
              <Route path="/about" element={<AboutUs />} />

              {/* Auth routes (no sidebar) */}
              <Route element={<CenteredAuthLayout />}>
                <Route
                  path="/login"
                  element={<RedirectIfAuth><Login /></RedirectIfAuth>}
                />
                <Route
                  path="/signup"
                  element={<RedirectIfAuth><Signup /></RedirectIfAuth>}
                />
                <Route path="/auth-check" element={<AuthCheck />} /> {/* approval gate */}
                <Route path="/pending" element={<Pending />} />
              </Route>

              {/* Signed-in routes (persistent sidebar) */}
              <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/summary" element={<Summary />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/download" element={<Download />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/goals" element={<GoalSetting />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/logout" element={<Logout />} />
                <Route path="/help" element={<Help />} />
              </Route>

              {/* 404 */}
              <Route path="*" element={<p style={{ padding: 16 }}>Page not found</p>} />
            </Route>
          </Routes>
        </SidebarProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
