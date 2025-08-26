// pages/RandomNovel.tsx
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { initDb } from "../db/init";

export default function RandomNovel() {
  const [msg, setMsg] = useState("Choosing a random novel…");
  const nav = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const db = await initDb();
        const rows = await db.select(
          "SELECT id FROM novels ORDER BY RANDOM() LIMIT 1;"
        );
        const id = rows?.[0]?.id;
        if (!alive) return;
        if (id) {
          nav(`/novel/${id}`, { replace: true });
        } else {
          setMsg("No novels in your library yet.");
        }
      } catch (e) {
        if (!alive) return;
        setMsg("Error picking a random novel.");
        console.error(e);
      }
    })();
    return () => { alive = false; };
  }, [nav]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>Random Novels</h1>
        <span className="status">{msg}</span>
      </header>

      {msg !== "Choosing a random novel…" && (
        <div className="empty">
          <div className="empty-art" />
          <p>{msg}</p>
          <p className="empty-sub">
            <Link to="/" className="btn btn-ghost">← Back to Library</Link>
          </p>
        </div>
      )}
    </div>
  );
}
