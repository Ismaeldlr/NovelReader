// App.tsx
import { Routes, Route, Outlet } from "react-router-dom";
import Library from "./pages/Library";
import NovelDetail from "./pages/NovelDetail";
import Reader from "./pages/Reader";
import ChapterEditor from "./pages/ChapterEditor";
import TopBar from "./pages/TopBar";
import RandomNovel from "./pages/RandomNovel";
import Transfer from "./pages/Transfer";
import "./App.css";
import ReadingHistory from "./pages/ReadingHistory";

function AppLayout() {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

// Placeholder simple - To be deleted
function SearchPage() {
  const params = new URLSearchParams(location.search);
  const q = params.get("q") || "";
  return (
    <div className="page">
      <h1>Search</h1>
      <p className="status">Query: {q ? `"${q}"` : "(vacío)"} — próximamente.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Library />} />
        <Route path="/novel/:id" element={<NovelDetail />} />
        <Route path="/novel/:id/chapter/:chapterId" element={<Reader />} />
        <Route path="/novel/:id/editor/:chapterId" element={<ChapterEditor />} />
        <Route path="/novels" element={<div className="page">Coming soon…</div>} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/random" element={<RandomNovel />} />
        <Route path="/transfer" element={<Transfer />} />
        <Route path="/ReadingHistory" element={<ReadingHistory />} />
      </Route>
    </Routes>
  );
}
