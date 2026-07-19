import { useEffect, useState } from 'react';
import { X, Pencil, Trash2, Clock, Users, BookOpen } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog.jsx';
import RecipeEditForm from './RecipeEditForm.jsx';

export default function RecipeDetailModal({ recipeId, onClose, onSaved, onDeleted, onToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/recipes/${recipeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // A freshly-imported recipe with no title yet goes straight to editing.
        setEditing(d.recipe?.extraction_status === 'review');
      })
      .catch(() => { if (!cancelled) onToast('Failed to load recipe'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recipeId]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
            {!loading && !editing && (
              <>
                <button onClick={() => setEditing(true)} className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.06] hover:text-white" aria-label="Edit">
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
            <RecipeEditForm
              recipe={data.recipe}
              ingredients={data.ingredients}
              steps={data.steps}
              saving={saving}
              onSave={handleSave}
              onCancel={() => (data.recipe.title === 'Untitled recipe' ? onClose() : setEditing(false))}
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

function RecipeView({ data }) {
  const { recipe, ingredients, steps, photos } = data;

  return (
    <div className="space-y-5">
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p) => (
            <img key={p.id} src={p.url} alt={p.original_name || 'recipe photo'} className="h-40 w-40 shrink-0 rounded-xl border border-white/10 object-cover" />
          ))}
        </div>
      )}

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
    </div>
  );
}

function Chip({ children, tone = 'indigo' }) {
  const toneClass = tone === 'emerald' ? 'bg-emerald-500/15 text-emerald-300' : tone === 'slate' ? 'bg-white/[0.06] text-slate-300' : 'bg-indigo-500/15 text-indigo-300';
  return <span className={`rounded-lg px-2 py-1 text-xs ${toneClass}`}>{children}</span>;
}
