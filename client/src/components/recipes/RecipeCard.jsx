import { ImageOff, BookOpen, Loader2 } from 'lucide-react';

const STATUS_PILL = {
  processing: { label: 'Reading…', className: 'bg-indigo-500/90 text-white' },
  review: { label: 'Needs review', className: 'bg-amber-500/90 text-black' },
  failed: { label: 'Failed', className: 'bg-rose-500/90 text-white' },
};

export default function RecipeCard({ recipe, onOpen }) {
  const pill = STATUS_PILL[recipe.extraction_status];
  const untitled = recipe.title === 'Untitled recipe';

  return (
    <button
      onClick={() => onOpen(recipe.id)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] text-left transition-colors hover:border-white/10"
    >
      <div className="relative aspect-[4/3] w-full bg-black/30">
        {recipe.cover_photo ? (
          <img src={recipe.cover_photo} alt={recipe.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-700">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        {pill && (
          <span className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${pill.className}`}>
            {recipe.extraction_status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
            {pill.label}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="text-sm font-semibold text-white truncate">
          {untitled ? 'Untitled — tap to fill in' : recipe.title}
        </div>
        {recipe.source_book && (
          <div className="flex items-center gap-1 text-xs text-slate-500 truncate">
            <BookOpen className="h-3 w-3 shrink-0" /> {recipe.source_book}
          </div>
        )}
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {recipe.cuisine && <span className="rounded-lg bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">{recipe.cuisine}</span>}
          {recipe.course?.slice(0, 2).map((c) => (
            <span key={c} className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-300">{c}</span>
          ))}
        </div>
      </div>
    </button>
  );
}
