import "./App.css";
import { useEffect, useRef, useState } from "react";
import { initDb } from "./db/init";

export default function App() {
  const [novels, setNovels] = useState<{ id: number; title: string; author: string }[]>([]);
  const [msg, setMsg] = useState("starting…");
  const did = useRef(false);

  useEffect(() => {
    if (did.current) return; // prevent second StrictMode run
    did.current = true;

    (async () => {
      const db = await initDb();
  
      const rows = await db.select("SELECT id, title, author FROM novels;");
      setNovels(rows);
      setMsg(`DB OK. novels count = ${rows.length}`);
    })().catch(e => setMsg("DB error: " + String(e)));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h3>{msg}</h3>
      {novels.length > 0 && (
        <table border={1} cellPadding="4" style={{ borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Author</th>
            </tr>
          </thead>
          <tbody>
            {novels.map(novel => (
              <tr key={novel.id}>
                <td>{novel.id}</td>
                <td>{novel.title}</td>
                <td>{novel.author}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
