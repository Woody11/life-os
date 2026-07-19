import { useEffect, useRef, useState } from 'react';
import { X, Pencil, Trash2, Clock, Users, BookOpen, RotateCcw, TriangleAlert, Loader2 } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog.jsx';
import RecipeEditForm from './RecipeEditForm.jsx';
import PhotoStrip from './PhotoStrip.jsx';
import PhotoRail from './PhotoRail.jsx';
import { useSse } from '../SseContext.jsx';

const POLL_MS = 3000;

export default function RecipeDetailModal({ recipeId, onClose, onSaved, onDeleted, onToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { subscribe } = useSse();
  const editingTouchedRef = useRef(false);

  function load() {
    return fetch(`/api/recipes/${recipeId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        // A freshly-imported or just-extracted recipe goes straight to
        // editing so the review screen doubles as the manual-entry form —
        // but only the first time we see it, not after every re-poll.
        if (!editingTouchedRef.current && d.recipe?.extraction_status === 'review') {
          setEditing(true);
        }
        onSaved(d.recipe);
        return d;
      })
      .catch(() => { onToast('Failed to load recipe'); });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    editingTouchedRef.current = false;
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  // SSE push from the extraction pipeline, with a 3s poll fallback while
  // processing in case the SSE connection dropped.
  useEffect(() => subscribe((event) => {
    if (event?.id === recipeId) load();
  }, 'recipe_extraction'), [recipeId, subscribe]);

  useEffect(() => {
    if (data?.recipe?.extraction_status !== 'processing') return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.recipe?.extraction_status]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/extract`, { method: 'POST' });
      if (!res.ok) throw new Error('not ok');
      await load();
    } catch {
      onToast('Retry failed — please try again');
    } finally {
      setRetrying(false);
    }
  }

  function startManualEntry() {
    editingTouchedRef.current = true;
    setEditing(true);
  }

  async function handleSave(payload) {
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('not ok');
      const saved = await res.json();
      setData(saved);
      setEditing(false);
      onSaved(saved.recipe);
    } catch {
      onToast('Save failed — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('not ok');
      onDeleted(recipeId);
      onClose();
    } catch {
      onToast('Delete failed — please try again');
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm px-4 py-10 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[var(--bg-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="text-sm font-semibold text-white truncate">
            {data?.recipe?.title && data.recipe.title !== 'Untitled recipe' ? data.recipe.title : 'New recipe'}
          </h2>
          <div className="flex items-center gap-1">
            {!loading && !editing && data.recipe.extraction_status !== 'processing' && (
              <>
                <button onClick={startManualEntry} className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.06] hover:text-white" aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => setConfirmingDelete(true)} className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.06] hover:text-rose-400" aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.06] hover:text-white" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center gap-3 py-16 text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : editing ? (
            <div className="flex flex-col gap-5 md:flex-row">
              <PhotoRail photos={data.photos} />
              <div className="min-w-0 flex-1">
                <RecipeEditForm
                  recipe={data.recipe}
                  ingredients={data.ingredients}
                  steps={data.steps}
                  saving={saving}
                  onSave={handleSave}
                  onCancel={() => (data.recipe.title === 'Untitled recipe' ? onClose() : setEditing(false))}
                />
              </div>
            </div>
          ) : data.recipe.extraction_status === 'processing' ? (
            <ProcessingView photos={data.photos} />
          ) : data.recipe.extraction_status === 'failed' ? (
            <FailedView
              data={data}
              retrying={retrying}
              onRetry={handleRetry}
              onManualEntry={startManualEntry}
            />
          ) : (
            <RecipeView data={data} />
          )}
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete recipe?"
          message="This removes the recipe, its photos, ingredients and steps for good."
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function ProcessingView({ photos }) {
  return (
    <div className="space-y-5">
      <PhotoStrip photos={photos} />
      <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        <p className="text-sm">Reading the page…</p>
      </div>
    </div>
  );
}

function FailedView({ data, retrying, onRetry, onManualEntry }) {
  return (
    <div className="space-y-5">
      <PhotoStrip photos={data.photos} />
      <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <div>
          <p className="text-sm font-medium text-rose-300">Extraction failed</p>
          <p className="mt-1 text-xs text-rose-400/80">{data.recipe.extraction_error || 'Something went wrong reading this photo.'}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {retrying ? 'Retrying…' : 'Retry'}
        </button>
        <button onClick={onManualEntry} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white">
          Enter manually
        </button>
      </div>
    </div>
  );
}

function RecipeView({ data }) {
  const { recipe, ingredients, steps, photos } = data;

  return (
    <div className="space-y-5">
      <PhotoStrip photos={photos} />

      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {recipe.source_book && (
          <span className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {recipe.source_book}{recipe.page_number ? ` · p.${recipe.page_number}` : ''}</span>
        )}
        {recipe.servings && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {recipe.servings}</span>}
        {(recipe.prep_time_min || recipe.cook_time_min) && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {recipe.prep_time_min ? `${recipe.prep_time_min}m prep` : ''}{recipe.prep_time_min && recipe.cook_time_min ? ' + ' : ''}{recipe.cook_time_min ? `${recipe.cook_time_min}m cook` : ''}
          </span>
        )}
      </div>

      {(recipe.cuisine || recipe.course?.length || recipe.main_ingredient?.length || recipe.dietary_tags?.length || recipe.tags?.length) && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.cuisine && <Chip>{recipe.cuisine}</Chip>}
          {recipe.course?.map((c) => <Chip key={`course-${c}`}>{c}</Chip>)}
          {recipe.main_ingredient?.map((c) => <Chip key={`ing-${c}`}>{c}</Chip>)}
          {recipe.dietary_tags?.map((c) => <Chip key={`diet-${c}`} tone="emerald">{c}</Chip>)}
          {recipe.tags?.map((c) => <Chip key={`tag-${c}`} tone="slate">{c}</Chip>)}
        </div>
      )}

      {ingredients.length > 0 && (
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ingredients</h3>
          <ul className="space-y-1 text-sm text-slate-200">
            {ingredients.map((ing) => (
              <li key={ing.id}>
                {[ing.quantity, ing.unit, ing.ingredient].filter(Boolean).join(' ')}
                {ing.note ? <span className="text-slate-500"> — {ing.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {steps.length > 0 && (
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Steps</h3>
          <ol className="space-y-2 text-sm text-slate-200">
            {steps.map((s) => (
              <li key={s.id} className="flex gap-2">
                <span className="shrink-0 text-slate-600">{s.step_number}.</span>
                <span>{s.instruction}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section>
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Notes</h3>
          <p className="text-sm text-slate-400 whitespace-pre-wrap">{recipe.notes}</p>
        </section>
      )}

      {recipe.transcription_notes && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-300">From the original photos</p>
            <p className="mt-1 text-xs text-amber-400/80">{recipe.transcription_notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, tone = 'indigo' }) {
  const toneClass = tone === 'emerald' ? 'bg-emerald-500/15 text-emerald-300' : tone === 'slate' ? 'bg-white/[0.06] text-slate-300' : 'bg-indigo-500/15 text-indigo-300';
  return <span className={`rounded-lg px-2 py-1 text-xs ${toneClass}`}>{children}</span>;
}
