// components/TopBar.tsx
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

const REVEAL_AT_Y = 100;
const HIDE_DELTA = 24;

export default function TopBar() {
  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState("");
  const lastY = useRef(0);
  const location = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    lastY.current = window.scrollY || 0;
    if (window.scrollY < REVEAL_AT_Y) setHidden(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const goingDown = y > lastY.current;
      if (y < REVEAL_AT_Y) {
        setHidden(false);
      } else if (goingDown && y - lastY.current > HIDE_DELTA) {
        setHidden(true);
      }
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleSearchSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();

    // Si estamos en Library, actualizamos ?q=...
    if (location.pathname === "/") {
      const params = new URLSearchParams(location.search);
      if (q) params.set("q", q);
      else params.delete("q");
      nav({ pathname: "/", search: `?${params.toString()}` });
    } else {
      // En cualquier otra página, navegamos al placeholder
      nav(`/search${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    }
    console.log("Search for:", q);
  }

  return (
    <header className={`topbar-fixed ${hidden ? "is-hidden" : ""}`}>
      {/* Left cluster */}
      <div className="tb-left">
        <button className="icon-btn" aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <button className="brand-btn" onClick={() => nav("/")}>
          <span className="brand-mark" aria-hidden>🧪</span>
          <span className="brand-text">NovelReader</span>
        </button>

        {/* Search */}
        <form className="tb-search" onSubmit={handleSearchSubmit}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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
            <path d="M4 5h6v14H4zM14 5h6v14h-6z" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span>Library</span>
        </NavLink>

        <NavLink to="/novels" className="nav-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 4h10l4 4v12H5z" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M15 4v4h4" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span>Novels</span>
        </NavLink>

        <button className="icon-btn" aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 17H5l1-1v-4a6 6 0 1 1 12 0v4l1 1h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </nav>
    </header>
  );
}
