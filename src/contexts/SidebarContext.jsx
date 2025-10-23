import { createContext, useContext, useState, useMemo } from "react";

const SidebarCtx = createContext(null);

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo(() => ({
    collapsed,
    setCollapsed,
    toggle: () => setCollapsed(v => !v),
    open: () => setCollapsed(false),
    close: () => setCollapsed(true),
  }), [collapsed]);

  return <SidebarCtx.Provider value={value}>{children}</SidebarCtx.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarCtx);
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>");
  return ctx;
}
