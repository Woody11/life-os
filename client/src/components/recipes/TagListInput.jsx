import { useState } from 'react';
import { X } from 'lucide-react';

// Small chip-list editor shared by course/main_ingredient/dietary_tags/tags —
// all four are JSON string arrays with identical add/remove UX.
export default function TagListInput({ label, placeholder, values, onChange }) {
  const [draft, setDraft] = useState('');

  function commit() {
    const value = draft.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft('');
  }

  function remove(value) {
    onChange(values.filter((v) => v !== value));
  }

  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/15 px-2 py-1 text-xs text-indigo-300">
            {v}
            <button type="button" onClick={() => remove(v)} className="text-indigo-400 hover:text-indigo-200">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-1 text-sm text-white placeholder-slate-600 outline-none"
        />
      </div>
    </div>
  );
}
