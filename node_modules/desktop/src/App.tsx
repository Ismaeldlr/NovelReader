// App.tsx
import { Routes, Route, Outlet } from "react-router-dom";
import Library from "./pages/Library";
import NovelDetail from "./pages/NovelDetail";
import Reader from "./pages/Reader";
import ChapterEditor from "./pages/ChapterEditor";
import TopBar from "./pages/TopBar"; 
import "./App.css";

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

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Library />} />
        <Route path="/novel/:id" element={<NovelDetail />} />
        <Route path="/novel/:id/chapter/:chapterId" element={<Reader />} />
        <Route path="/novel/:id/editor/:chapterId" element={<ChapterEditor />} />
        {/* placeholder route for "Novels" */}
        <Route path="/novels" element={<div style={{ padding: 24 }}>Coming soon…</div>} />
      </Route>
    </Routes>
  );
}
