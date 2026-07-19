import { useEffect, useState } from 'react';
import { Camera, Search as SearchIcon } from 'lucide-react';
import Toast from '../components/Toast.jsx';
import RecipeCard from '../components/recipes/RecipeCard.jsx';
import RecipeDetailModal from '../components/recipes/RecipeDetailModal.jsx';

function AddRecipeForm({ onCreated, onToast }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [sourceBook, setSourceBook] = useState('');
  const [pageNumber, setPageNumber] = useState('');
  const [uploading, setUploading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!files.length) return;
    setUploading(true);
    try {
      const body = new FormData();
      files.forEach((f) => body.append('photos', f));
      if (sourceBook.trim()) body.append('source_book', sourceBook.trim());
      if (pageNumber.trim()) body.append('page_number', pageNumber.trim());
      const res = await fetch('/api/recipes', { method: 'POST', body });
      if (!res.ok) throw new Error('not ok');
      const { recipe } = await res.json();
      onCreated(recipe);
      setFiles([]);
      setSourceBook('');
      setPageNumber('');
      setOpen(false);
    } catch {
      onToast('Upload failed — please try again');
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 transition-all hover:bg-indigo-500/20"
      >
        <Camera className="h-4 w-4" /> Add recipe from photos
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <input
          value={sourceBook}
          onChange={(e) => setSourceBook(e.target.value)}
          placeholder="Source book (optional)"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none"
        />
        <input
          value={pageNumber}
          onChange={(e) => setPageNumber(e.target.value)}
          placeholder="Page (optional)"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none"
        />
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="mt-3 block w-full text-sm text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.06] file:px-3 file:py-2 file:text-sm file:text-slate-200 hover:file:bg-white/[0.1]"
      />
      {files.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">{files.length} photo{files.length !== 1 ? 's' : ''} selected</p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!files.length || uploading}
          className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 transition-all hover:bg-indigo-500/20 disabled:opacity-40"
        >
          {uploading ? 'Uploading…' : 'Create recipe'}
        </button>
      </div>
    </form>
  );
}

export default function RecipesTab() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  function load(q) {
    setLoading(true);
    const url = q?.trim() ? `/api/recipes?q=${encodeURIComponent(q.trim())}` : '/api/recipes';
    fetch(url)
      .then((r) => r.json())
      .then((d) => setRecipes(d.recipes ?? []))
      .catch(() => setError('Failed to load recipes'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleCreated(recipe) {
    setRecipes((prev) => [recipe, ...prev]);
    setSelectedId(recipe.id);
  }

  function handleSaved(recipe) {
    setRecipes((prev) => prev.map((r) => (r.id === recipe.id ? { ...r, ...recipe } : r)));
  }

  function handleDeleted(id) {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Recipes</h1>
          {!loading && <p className="mt-1 text-sm text-slate-500">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>}
        </div>
        <AddRecipeForm onCreated={handleCreated} onToast={setToast} />
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
        <SearchIcon className="h-4 w-4 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or source book…"
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-16 text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : error ? (
        <p className="py-16 text-center text-sm text-rose-400">{error}</p>
      ) : recipes.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-600">No recipes yet — add one from a photo above.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} onOpen={setSelectedId} />
          ))}
        </div>
      )}

      {selectedId && (
        <RecipeDetailModal
          recipeId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onToast={setToast}
        />
      )}

      <Toast message={toast} type="error" onClose={() => setToast(null)} />
    </div>
  );
}
