const THEME_KEY = "hdt_theme"; // "light" | "dark" | "cb" | "hc"

export function getSavedTheme() {
  return localStorage.getItem(THEME_KEY);
}

export function applyTheme(theme /* "light" | "dark" | "cb" | "hc" */) {
  const root = document.documentElement;
  // clear any previous value
  root.removeAttribute("data-theme");
  // set new one (light = no attribute)
  if (theme === "dark" || theme === "cb" || theme === "hc") {
    root.setAttribute("data-theme", theme);
  }
  localStorage.setItem(THEME_KEY, theme || "light");
}

export function initTheme() {
  const saved = getSavedTheme() || "light";
  applyTheme(saved);
  return saved;
}
