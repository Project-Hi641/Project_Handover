// src/layouts/AppLayout.jsx
import Sidebar from "../components/Sidebar";

export default function AppLayout({ children }) {
  return (
    <div className="dashboard-main">
      <Sidebar />
      <section className="dashboard-content">{children}</section>
    </div>
  );
}
