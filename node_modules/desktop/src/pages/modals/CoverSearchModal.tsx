import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onSelect: (url: string) => void;
};

export default function CoverSearchModal({ open, initialQuery, onClose, onSelect }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    searchImages(initialQuery);
  }, [open, initialQuery]);

  async function searchImages(q: string) {
    setLoading(true);
    setImages([]);
    try {
      // Demo con Bing/Unsplash API (puedes enchufar tu backend aquí)
      // Por ahora, usamos una lista dummy de imágenes
      const dummy = [
        "https://picsum.photos/200/300",
        "https://picsum.photos/210/300",
        "https://picsum.photos/220/300",
        "https://picsum.photos/230/300"
      ];
      setImages(dummy);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="cover-modal-overlay">
      <div
        className="cover-modal"
        onClick={e => e.stopPropagation()} // Prevent overlay click from closing modal
      >
        <header>
          <h2>Buscar portada</h2>
          <button type="button" onClick={onClose}>✕</button>
        </header>

        <form onSubmit={e => { e.preventDefault(); searchImages(query); }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar imágenes..."
          />
          <button type="submit">Buscar</button>
        </form>

        {loading && <p>Buscando...</p>}

        <div className="cover-grid">
          {images.map((url, i) => (
            <button
              key={i}
              className="cover-option"
              type="button"
              onClick={() => onSelect(url)}
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
