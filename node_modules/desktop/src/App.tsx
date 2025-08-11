import { Routes, Route } from "react-router-dom";
import Library from "./pages/Library";
import NovelDetail from "./pages/NovelDetail";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/novel/:id" element={<NovelDetail />} />
    </Routes>
  );
}
