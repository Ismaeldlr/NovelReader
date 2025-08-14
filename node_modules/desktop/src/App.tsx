import { Routes, Route } from "react-router-dom";
import Library from "./pages/Library";
import NovelDetail from "./pages/NovelDetail";
import Reader from "./pages/Reader";
import ChapterEditor from "./pages/ChapterEditor";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/novel/:id" element={<NovelDetail />} />
      <Route path="/novel/:id/chapter/:chapterId" element={<Reader />} />
      <Route path="/novel/:id/editor/:chapterId" element={<ChapterEditor />} />
    </Routes>
  );
}
