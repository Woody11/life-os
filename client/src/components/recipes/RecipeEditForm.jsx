import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import TagListInput from './TagListInput.jsx';

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none';
const labelClass = 'mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500';

function Field({ label, children }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

export default function RecipeEditForm({ recipe, ingredients, steps, saving, onSave, onCancel }) {
  const [title, setTitle] = useState(recipe.title === 'Untitled recipe' ? '' : recipe.title);
  const [sourceBook, setSourceBook] = useState(recipe.source_book || '');
  const [pageNumber, setPageNumber] = useState(recipe.page_number || '');
  const [servings, setServings] = useState(recipe.servings || '');
  const [prepTime, setPrepTime] = useState(recipe.prep_time_min ?? '');
  const [cookTime, setCookTime] = useState(recipe.cook_time_min ?? '');
  const [cuisine, setCuisine] = useState(recipe.cuisine || '');
  const [course, setCourse] = useState(recipe.course || []);
  const [mainIngredient, setMainIngredient] = useState(recipe.main_ingredient || []);
  const [dietaryTags, setDietaryTags] = useState(recipe.dietary_tags || []);
  const [tags, setTags] = useState(recipe.tags || []);
  const [notes, setNotes] = useState(recipe.notes || '');
  const [ingredientRows, setIngredientRows] = useState(
    ingredients.length ? ingredients.map((i) => ({ ingredient: i.ingredient, quantity: i.quantity || '', unit: i.unit || '', note: i.note || '' })) : [{ ingredient: '', quantity: '', unit: '', note: '' }],
  );
  const [stepRows, setStepRows] = useState(
    steps.length ? steps.map((s) => s.instruction) : [''],
  );

  function updateIngredient(index, field, value) {
    setIngredientRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function updateStep(index, value) {
    setStepRows((rows) => rows.map((row, i) => (i === index ? value : row)));
  }

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      source_book: sourceBook,
      page_number: pageNumber,
      servings,
      prep_time_min: prepTime === '' ? null : Number(prepTime),
      cook_time_min: cookTime === '' ? null : Number(cookTime),
      cuisine,
      course,
      main_ingredient: mainIngredient,
      dietary_tags: dietaryTags,
      tags,
      notes,
      ingredients: ingredientRows.filter((r) => r.ingredient.trim()),
      steps: stepRows.filter((s) => s.trim()),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recipe title" required className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Source book"><input value={sourceBook} onChange={(e) => setSourceBook(e.target.value)} className={inputClass} /></Field>
        <Field label="Page"><input value={pageNumber} onChange={(e) => setPageNumber(e.target.value)} className={inputClass} /></Field>
        <Field label="Servings"><input value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" className={inputClass} /></Field>
        <Field label="Cuisine"><input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Thai" className={inputClass} /></Field>
        <Field label="Prep (min)"><input type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} className={inputClass} /></Field>
        <Field label="Cook (min)"><input type="number" min="0" value={cookTime} onChange={(e) => setCookTime(e.target.value)} className={inputClass} /></Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TagListInput label="Course" placeholder="dinner, side…" values={course} onChange={setCourse} />
        <TagListInput label="Main ingredient" placeholder="chicken…" values={mainIngredient} onChange={setMainIngredient} />
        <TagListInput label="Dietary tags" placeholder="vegetarian…" values={dietaryTags} onChange={setDietaryTags} />
        <TagListInput label="Tags" placeholder="quick, freezer-friendly…" values={tags} onChange={setTags} />
      </div>

      <Field label="Ingredients">
        <div className="space-y-2">
          {ingredientRows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_5rem_1fr_auto] items-center gap-2">
              <input value={row.ingredient} onChange={(e) => updateIngredient(i, 'ingredient', e.target.value)} placeholder="ingredient" className={inputClass} />
              <input value={row.quantity} onChange={(e) => updateIngredient(i, 'quantity', e.target.value)} placeholder="qty" className={inputClass} />
              <input value={row.unit} onChange={(e) => updateIngredient(i, 'unit', e.target.value)} placeholder="unit" className={inputClass} />
              <input value={row.note} onChange={(e) => updateIngredient(i, 'note', e.target.value)} placeholder="note" className={inputClass} />
              <button
                type="button"
                onClick={() => setIngredientRows((rows) => rows.filter((_, idx) => idx !== i))}
                className="rounded-lg p-2 text-slate-600 hover:text-rose-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIngredientRows((rows) => [...rows, { ingredient: '', quantity: '', unit: '', note: '' }])}
          className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
        >
          <Plus className="h-3.5 w-3.5" /> Add ingredient
        </button>
      </Field>

      <Field label="Steps">
        <div className="space-y-2">
          {stepRows.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-xs text-slate-600">{i + 1}.</span>
              <textarea
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                rows={2}
                placeholder="Instruction…"
                className={`${inputClass} resize-none`}
              />
              <button
                type="button"
                onClick={() => setStepRows((rows) => rows.filter((_, idx) => idx !== i))}
                className="mt-2 rounded-lg p-1 text-slate-600 hover:text-rose-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStepRows((rows) => [...rows, ''])}
          className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
        >
          <Plus className="h-3.5 w-3.5" /> Add step
        </button>
      </Field>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Woody's notes…" className={`${inputClass} resize-none`} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || saving}
          className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 transition-all hover:bg-indigo-500/20 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </form>
  );
}
