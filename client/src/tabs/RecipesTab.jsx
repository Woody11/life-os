import { useEffect, useState } from 'react';
import { Camera, Search as SearchIcon } from 'lucide-react';
import Toast from '../components/Toast.jsx';
import RecipeCard from '../components/recipes/RecipeCard.jsx';
import RecipeDetailModal from '../components/recipes/RecipeDetailModal.jsx';
import { useSse } from '../components/SseContext.jsx';
import { downscalePhotos } from '../lib/downscalePhoto.js';

const POLL_MS = 3000;

function AddRecipeForm({ onCreated, onToast }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [sourceBook, setSourceBook] = useState('');
  const [pageNumber, setPageNumber] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(fileList) {
    setPreparing(true);
    try {
      setFiles(await downscalePhotos(Array.from(fileList ?? [])));
    } finally {
      setPreparing(false);
    }
  }

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
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="mt-3 block w-full text-sm text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.06] file:px-3 file:py-2 file:text-sm file:text-slate-200 hover:file:bg-white/[0.1]"
      />
      {preparing ? (
        <p className="mt-2 text-xs text-slate-500">Preparing photos…</p>
      ) : files.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">{files.length} photo{files.length !== 1 ? 's' : ''} selected</p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!files.length || preparing || uploading}
          className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 transition-all hover:bg-indigo-500/20 disabled:opacity-40"
        >
          {uploading ? 'Uploading…' : 'Create recipe'}
        </button>
      </div>
    </form>
  );
}

const EMPTY_FACETS = { cuisines: [], courses: [], main_ingredients: [], dietary_tags: [] };

function FilterSelect({ label, value, onChange, options }) {
  if (!options?.length) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-xl border px-3 py-1.5 text-xs outline-none focus:border-indigo-500/50 ${
        value ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' : 'border-white/10 bg-white/[0.04] text-slate-300'
      }`}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

export default function RecipesTab() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [course, setCourse] = useState('');
  const [mainIngredient, setMainIngredient] = useState('');
  const [dietaryTag, setDietaryTag] = useState('');
  const [sort, setSort] = useState('updated');
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [selectedId, setSelectedId] = useState(null);
  const { subscribe } = useSse();

  useEffect(() => {
    fetch('/api/recipes/facets').then((r) => r.json()).then(setFacets).catch(() => {});
  }, []);

  function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (cuisine) params.set('cuisine', cuisine);
    if (course) params.set('course', course);
    if (mainIngredient) params.set('main_ingredient', mainIngredient);
    if (dietaryTag) params.set('dietary_tags', dietaryTag);
    if (sort !== 'updated') params.set('sort', sort);
    const qs = params.toString();
    return fetch(qs ? `/api/recipes?${qs}` : '/api/recipes')
      .then((r) => r.json())
      .then((d) => setRecipes(d.recipes ?? []))
      .catch(() => { if (!silent) setError('Failed to load recipes'); })
      .finally(() => { if (!silent) setLoading(false); });
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cuisine, course, mainIngredient, dietaryTag, sort]);

  // Extraction pipeline pushes here so cards flip from "Reading…" to
  // "Needs review" without a manual refresh, even if the detail modal for
  // that recipe was closed. A poll covers a dropped SSE connection.
  useEffect(() => subscribe(() => load({ silent: true }), 'recipe_extraction'), [subscribe, query, cuisine, course, mainIngredient, dietaryTag, sort]);

  useEffect(() => {
    if (!recipes.some((r) => r.extraction_status === 'processing')) return undefined;
    const t = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes, query, cuisine, course, mainIngredient, dietaryTag, sort]);

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

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
        <SearchIcon className="h-4 w-4 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, source book, or ingredient…"
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <FilterSelect label="Cuisine" value={cuisine} onChange={setCuisine} options={facets.cuisines} />
        <FilterSelect label="Course" value={course} onChange={setCourse} options={facets.courses} />
        <FilterSelect label="Main ingredient" value={mainIngredient} onChange={setMainIngredient} options={facets.main_ingredients} />
        <FilterSelect label="Dietary" value={dietaryTag} onChange={setDietaryTag} options={facets.dietary_tags} />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500/50"
        >
          <option value="updated">Recently updated</option>
          <option value="created">Recently added</option>
          <option value="title">Title A–Z</option>
        </select>
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
