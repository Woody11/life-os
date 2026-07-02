import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

function Card({ children, className = '' }) {
  return <div className={`rounded-lg bg-slate-800 p-4 ${className}`}>{children}</div>;
}

function SectionSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 py-8 text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation modal — shown when moving a card to an agent-assigned stage
// ---------------------------------------------------------------------------

function ConfirmModal({ card, targetStage, agent, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-slate-800 p-6 shadow-2xl border border-slate-700">
        <h3 className="text-lg font-semibold text-white">Dispatch {agent}?</h3>
        <p className="mt-3 text-sm text-slate-300">
          Moving{' '}
          <span className="font-medium text-white">"{card.title}"</span>{' '}
          to <span className="font-medium text-sky-400">{targetStage}</span> will automatically
          dispatch <span className="font-medium text-emerald-400">{agent}</span> to action this stage.
        </p>
        <div className="mt-4 rounded-md bg-slate-900 p-3 text-xs text-slate-400">
          {agent} will receive a task prompt based on the card title and description.
        </div>
        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Dispatching…' : `Confirm & dispatch ${agent}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add card modal
// ---------------------------------------------------------------------------

function AddCardModal({ domain, onAdd, onCancel }) {
  const [title, setTitle]  = useState('');
  const [desc, setDesc]    = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]  = useState(null);

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, title: title.trim(), description: desc.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      onAdd(json.card);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-slate-800 p-6 shadow-2xl border border-slate-700">
        <h3 className="text-lg font-semibold text-white">
          Add card — {domain.toUpperCase()}
        </h3>
        <div className="mt-4 space-y-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Card title…"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="Description (optional)…"
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="mt-4 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || !title.trim()}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Adding…' : 'Add card'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card detail panel (inline, shown when card is clicked)
// ---------------------------------------------------------------------------

function CardDetail({ card, onClose, onDelete, pipeline }) {
  const [log, setLog]       = useState([]);
  const [logLoading, setLogLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/kanban/${card.id}/log`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setLog(j.log ?? []))
      .catch(() => {})
      .finally(() => setLogLoading(false));
  }, [card.id]);

  function relTime(iso) {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-slate-800 border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-slate-700">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {card.domain.toUpperCase()} · {card.stage}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">{card.title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
          {card.description && (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Description</p>
              <p className="text-sm text-slate-300">{card.description}</p>
            </div>
          )}

          {card.agent_pending === 1 && (
            <div className="rounded-md border border-sky-800 bg-sky-950/60 p-3 text-xs text-sky-300">
              Agent dispatch pending for this stage
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Activity</p>
            {logLoading && <p className="text-xs text-slate-500">Loading…</p>}
            {!logLoading && log.length === 0 && <p className="text-xs text-slate-500">No activity yet.</p>}
            <div className="space-y-2">
              {log.map((entry) => (
                <div key={entry.id} className="flex gap-2 text-xs">
                  <span className="text-slate-500 shrink-0">{relTime(entry.created_at)}</span>
                  <span className="font-medium text-slate-400">{entry.agent}</span>
                  <span className="text-slate-400">{entry.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-4 border-t border-slate-700">
          <button
            onClick={() => onDelete(card.id)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete card
          </button>
          <button onClick={onClose} className="rounded-md bg-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-600">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single Kanban board (one domain)
// ---------------------------------------------------------------------------

function KanbanBoard({ domain, pipeline, cards, onMoveCard, onCardClick, onAddCard }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-white">
          {domain === 'mbs' ? 'Macro Bricks Studio' : 'SMSF'}
        </h2>
        <button
          onClick={() => onAddCard(domain)}
          className="rounded-md bg-slate-700 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-600 transition-colors"
        >
          + Add card
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {pipeline.stages.map((stage) => {
          const stageCards = cards.filter((c) => c.stage === stage);
          const agentName  = pipeline.agents[stage];
          return (
            <div key={stage} className="min-w-48 w-48 shrink-0">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  {stage}
                </span>
                {agentName && (
                  <span className="text-xs text-sky-500">{agentName}</span>
                )}
              </div>

              <div className="space-y-2 min-h-16 rounded-lg bg-slate-900/50 p-2">
                {stageCards.map((card) => (
                  <KanbanCardTile
                    key={card.id}
                    card={card}
                    pipeline={pipeline}
                    onClick={() => onCardClick(card)}
                    onMove={(targetStage) => onMoveCard(card, targetStage)}
                  />
                ))}
                {stageCards.length === 0 && (
                  <p className="text-center text-xs text-slate-600 py-3">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual card tile
// ---------------------------------------------------------------------------

function KanbanCardTile({ card, pipeline, onClick, onMove }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const currentIdx = pipeline.stages.indexOf(card.stage);
  const canMoveBack = currentIdx > 0;
  const canMoveFwd  = currentIdx < pipeline.stages.length - 1;

  return (
    <div className="relative rounded-md bg-slate-800 border border-slate-700 p-2.5 shadow-sm hover:border-slate-500 transition-colors">
      {card.agent_pending === 1 && (
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-sky-400 animate-pulse" title="Agent dispatch pending" />
      )}

      <p
        className="text-xs font-medium text-slate-100 pr-3 cursor-pointer hover:text-white"
        onClick={onClick}
      >
        {card.title}
      </p>

      <div className="mt-2 flex items-center gap-1">
        {canMoveBack && (
          <button
            onClick={() => onMove(pipeline.stages[currentIdx - 1])}
            className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300 transition-colors"
            title={`Move back to ${pipeline.stages[currentIdx - 1]}`}
          >
            ←
          </button>
        )}
        {canMoveFwd && (
          <button
            onClick={() => onMove(pipeline.stages[currentIdx + 1])}
            className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300 transition-colors"
            title={`Move to ${pipeline.stages[currentIdx + 1]}`}
          >
            →
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          className="ml-auto rounded px-1 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
          title="Move to stage"
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-md border border-slate-700 bg-slate-800 py-1 shadow-xl">
          {pipeline.stages.map((s) => (
            <button
              key={s}
              onClick={() => { setMenuOpen(false); onMove(s); }}
              disabled={s === card.stage}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-700 disabled:text-slate-600 disabled:cursor-default"
            >
              {s}
              {pipeline.agents[s] && (
                <span className="ml-1 text-sky-500">({pipeline.agents[s]})</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export default function KanbanTab() {
  const [pipelines, setPipelines] = useState(null);
  const [cards, setCards]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // Modal state
  const [confirmPending, setConfirmPending] = useState(null); // { card, targetStage, agent }
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [addDomain, setAddDomain]           = useState(null); // 'mbs' | 'smsf' | null
  const [detailCard, setDetailCard]         = useState(null);

  const load = useCallback(async () => {
    try {
      const [plRes, cardRes] = await Promise.all([
        fetch('/api/kanban/pipelines'),
        fetch('/api/kanban'),
      ]);
      if (!plRes.ok || !cardRes.ok) throw new Error('Failed to load kanban data');
      const [pl, cr] = await Promise.all([plRes.json(), cardRes.json()]);
      setPipelines(pl.pipelines);
      setCards(cr.cards ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleMoveRequest(card, targetStage) {
    if (targetStage === card.stage) return;
    const agent = pipelines[card.domain]?.agents[targetStage] ?? null;
    if (agent) {
      setConfirmPending({ card, targetStage, agent });
    } else {
      executeMove(card, targetStage);
    }
  }

  async function executeMove(card, targetStage) {
    try {
      const res = await fetch(`/api/kanban/${card.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCards((prev) => prev.map((c) => (c.id === card.id ? json.card : c)));
    } catch (err) {
      alert(`Move failed: ${err.message}`);
    }
  }

  async function handleConfirm() {
    const { card, targetStage } = confirmPending;
    setConfirmLoading(true);
    try {
      const res = await fetch(`/api/kanban/${card.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCards((prev) => prev.map((c) => (c.id === card.id ? json.card : c)));
      setConfirmPending(null);
    } catch (err) {
      alert(`Move failed: ${err.message}`);
    } finally {
      setConfirmLoading(false);
    }
  }

  function handleCardAdded(newCard) {
    setCards((prev) => [newCard, ...prev]);
    setAddDomain(null);
  }

  async function handleDelete(cardId) {
    if (!confirm('Delete this card?')) return;
    try {
      await fetch(`/api/kanban/${cardId}`, { method: 'DELETE' });
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      setDetailCard(null);
    } catch {
      alert('Delete failed');
    }
  }

  if (loading) return (
    <div className="mx-auto max-w-7xl p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Kanban</h1>
      <SectionSpinner label="Loading boards…" />
    </div>
  );

  if (error) return (
    <div className="mx-auto max-w-7xl p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Kanban</h1>
      <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-300">{error}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Kanban</h1>

      <div className="space-y-8">
        {pipelines && Object.entries(pipelines).map(([domain, pipeline]) => (
          <div key={domain} className="rounded-lg bg-slate-800/50 border border-slate-700 p-5">
            <KanbanBoard
              domain={domain}
              pipeline={pipeline}
              cards={cards.filter((c) => c.domain === domain)}
              onMoveCard={handleMoveRequest}
              onCardClick={setDetailCard}
              onAddCard={setAddDomain}
            />
          </div>
        ))}
      </div>

      {/* Confirmation modal */}
      {confirmPending && (
        <ConfirmModal
          card={confirmPending.card}
          targetStage={confirmPending.targetStage}
          agent={confirmPending.agent}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmPending(null)}
          loading={confirmLoading}
        />
      )}

      {/* Add card modal */}
      {addDomain && (
        <AddCardModal
          domain={addDomain}
          onAdd={handleCardAdded}
          onCancel={() => setAddDomain(null)}
        />
      )}

      {/* Card detail panel */}
      {detailCard && (
        <CardDetail
          card={detailCard}
          pipeline={pipelines[detailCard.domain]}
          onClose={() => setDetailCard(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
