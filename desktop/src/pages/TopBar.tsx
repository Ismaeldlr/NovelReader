import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

const REVEAL_AT_Y = 100;
const HIDE_DELTA = 24;

export default function TopBar() {
  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lang, setLang] = useState<string>(() => localStorage.getItem("lang") || "en");
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("theme") || "dark");

  const lastY = useRef(0);
  const location = useLocation();
  const nav = useNavigate();

  // Apply persisted theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Persist language
  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  // Reset hide-on-scroll when route changes
  useEffect(() => {
    lastY.current = window.scrollY || 0;
    if (window.scrollY < REVEAL_AT_Y) setHidden(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const goingDown = y > lastY.current;
      if (y < REVEAL_AT_Y) setHidden(false);
      else if (goingDown && y - lastY.current > HIDE_DELTA) setHidden(true);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleSearchSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (location.pathname === "/") {
      const params = new URLSearchParams(location.search);
      if (q) params.set("q", q); else params.delete("q");
      nav({ pathname: "/", search: `?${params.toString()}` });
    } else {
      nav(`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    }
  }

  function go(path: string) {
    setSidebarOpen(false);
    nav(path);
  }

  return (
    <>
      <header className={`topbar-fixed ${hidden ? "is-hidden" : ""}`}>
        {/* Left cluster */}
        <div className="tb-left">
          <button
            className="icon-btn"
            aria-label="Menu"
            onClick={() => setSidebarOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          <button className="brand-btn" onClick={() => nav("/")}>
            <span className="brand-mark" aria-hidden>🧪</span>
            <span className="brand-text">NovelReader</span>
          </button>

          {/* Search */}
          <form className="tb-search" onSubmit={handleSearchSubmit}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit(); }}
            />
          </form>
        </div>

        {/* Right cluster */}
        <nav className="tb-right">
          <NavLink to="/" className="nav-link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 5h6v14H4zM14 5h6v14h-6z" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>Library</span>
          </NavLink>

          <NavLink to="/novels" className="nav-link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 4h10l4 4v12H5z" stroke="currentColor" strokeWidth="2" fill="none" />
              <path d="M15 4v4h4" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>Novels</span>
          </NavLink>

          <button className="icon-btn" aria-label="Notifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 17H5l1-1v-4a6 6 0 1 1 12 0v4l1 1h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </nav>
      </header>

      {/* Sidebar + overlay */}
      <div className={`drawer-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`side-drawer ${sidebarOpen ? "open" : ""}`} aria-hidden={!sidebarOpen}>
        <div className="drawer-header">
          <span className="brand-text">Menu</span>
          <button className="icon-btn" aria-label="Close" onClick={() => setSidebarOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <nav className="drawer-nav">
          <button className="drawer-link" onClick={() => go("/")}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 5h6v14H4zM14 5h6v14h-6z" stroke="currentColor" strokeWidth="2" /></svg>
            <span>Library</span>
          </button>
          <button className="drawer-link" onClick={() => go("/novels")}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M5 4h10l4 4v12H5z" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M15 4v4h4" stroke="currentColor" strokeWidth="2" /></svg>
            <span>Novels</span>
          </button>
          <button className="drawer-link" onClick={() => go("/NovelFinder")}>
            <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span>Novel Finder</span>
          </button>
          <button className="drawer-link" onClick={() => go("/ReadingHistory")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Reading History</span>
          </button>
          <button className="drawer-link" onClick={() => go("/random")}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 7h6l2 4 2-4h6M4 17h6l2-4 2 4h6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
            <span>Random Novels</span>
          </button>

    
          <button className="drawer-link" onClick={() => go("/transfer?mode=import")}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 19h16" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>Import</span>
          </button>
          <button className="drawer-link" onClick={() => go("/transfer?mode=export")}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M12 21V9m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 5h16" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>Export</span>
          </button>
        </nav>

        <div className="drawer-sep" />

        <div className="drawer-controls">
          <label className="drawer-field">
            <span>Language</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="drawer-select">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>

          <div className="theme-row">
            <button
              className={`mini-btn ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
              title="Light"
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Light
            </button>
            <button
              className={`mini-btn ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
              title="Dark"
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
              Dark
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
