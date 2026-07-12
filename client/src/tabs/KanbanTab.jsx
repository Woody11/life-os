import { useCallback, useEffect, useState } from 'react';
import { useSse } from '../components/SseContext.jsx';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Toast from '../components/Toast.jsx';

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

function SectionSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 py-8 text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation modal — shown when moving a card to an agent-assigned stage
// ---------------------------------------------------------------------------

function ConfirmModal({ card, targetStage, agent, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1526] p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Dispatch {agent}?</h3>
        <p className="mt-3 text-sm text-slate-300">
          Moving{' '}
          <span className="font-medium text-white">"{card.title}"</span>{' '}
          to <span className="font-medium text-indigo-400">{targetStage}</span> will automatically
          dispatch <span className="font-medium text-emerald-400">{agent}</span> to action this stage.
        </p>
        <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.04] p-3 text-xs text-slate-400">
          {agent} will receive a task prompt based on the card title and description.
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
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
  const [title, setTitle]   = useState('');
  const [desc, setDesc]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1526] p-6 shadow-2xl">
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
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none transition-colors"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="Description (optional)…"
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none transition-colors"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || !title.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add card'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card detail panel
// ---------------------------------------------------------------------------

function CardDetail({ card, onClose, onDelete, onUpdateCard, pipeline }) {
  const [log, setLog]               = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const [notes, setNotes]           = useState(card.notes ?? '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved]   = useState(false);

  useEffect(() => {
    fetch(`/api/kanban/${card.id}/log`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setLog(j.log ?? []))
      .catch(() => {})
      .finally(() => setLogLoading(false));
  }, [card.id]);

  async function handleNotesBlur() {
    if (notes === (card.notes ?? '')) return;
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/kanban/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      onUpdateCard?.(json.card);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch {
      // Silent failure — the textarea keeps the user's unsaved value so they
      // can retry on the next blur without losing what they typed.
    } finally {
      setNotesSaving(false);
    }
  }

  function relTime(iso) {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1526] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/[0.06] p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {card.domain.toUpperCase()} · {card.stage}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">{card.title}</h3>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-slate-500 transition-colors hover:text-white">
            ×
          </button>
        </div>

        <div className="max-h-96 space-y-4 overflow-y-auto p-5">
          {card.description && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Description</p>
              <p className="text-sm text-slate-300">{card.description}</p>
            </div>
          )}

          {card.agent_pending === 1 && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-indigo-300">
              Agent dispatch pending for this stage
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Notes</p>
              {notesSaving && <span className="text-xs text-slate-500">Saving…</span>}
              {!notesSaving && notesSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              rows={3}
              placeholder="Add notes…"
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Activity</p>
            {logLoading && <p className="text-xs text-slate-500">Loading…</p>}
            {!logLoading && log.length === 0 && (
              <p className="text-xs text-slate-500">No activity yet.</p>
            )}
            <div className="space-y-2">
              {log.map((entry) => (
                <div key={entry.id} className="flex gap-2 text-xs">
                  <span className="shrink-0 text-slate-600">{relTime(entry.created_at)}</span>
                  <span className="font-medium text-slate-400">{entry.agent}</span>
                  <span className="text-slate-400">{entry.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] p-4">
          <button
            onClick={() => onDelete(card.id)}
            className="text-xs text-red-400 transition-colors hover:text-red-300"
          >
            Delete card
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm text-slate-200 transition-colors hover:bg-white/[0.08]"
          >
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

function KanbanBoard({ domain, pipeline, cards, onMoveCard, onCardClick, onAddCard, onDeleteCard }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          {domain === 'mbs' ? 'Macro Bricks Studio' : 'SMSF'}
        </h2>
        <button
          onClick={() => onAddCard(domain)}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-white"
        >
          + Add card
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {pipeline.stages.map((stage) => {
          const stageCards = cards.filter((c) => c.stage === stage);
          const agentName  = pipeline.agents[stage];
          return (
            <KanbanColumn
              key={stage}
              domain={domain}
              stage={stage}
              agentName={agentName}
              stageCards={stageCards}
              pipeline={pipeline}
              onCardClick={onCardClick}
              onMoveCard={onMoveCard}
              onDeleteCard={onDeleteCard}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single droppable stage column
// ---------------------------------------------------------------------------

function KanbanColumn({ domain, stage, agentName, stageCards, pipeline, onCardClick, onMoveCard, onDeleteCard }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${domain}-${stage}`,
    data: { domain, stage },
  });

  return (
    <div className="w-48 min-w-48 shrink-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {stage}
        </span>
        {agentName && (
          <span className="text-xs text-indigo-400">{agentName}</span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-16 space-y-2 rounded-xl border p-2 transition-colors ${
          isOver ? 'border-indigo-500/40 bg-indigo-500/[0.06]' : 'border-white/[0.04] bg-black/20'
        }`}
      >
        {stageCards.map((card) => (
          <KanbanCardTile
            key={card.id}
            card={card}
            pipeline={pipeline}
            onClick={() => onCardClick(card)}
            onMove={(targetStage) => onMoveCard(card, targetStage)}
            onDelete={onDeleteCard}
          />
        ))}
        {stageCards.length === 0 && (
          <p className="py-3 text-center text-xs text-slate-700">—</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual card tile
// ---------------------------------------------------------------------------

function KanbanCardTile({ card, pipeline, onClick, onMove, onDelete, isOverlay = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const currentIdx = pipeline.stages.indexOf(card.stage);
  const canMoveBack = currentIdx > 0;
  const canMoveFwd  = currentIdx < pipeline.stages.length - 1;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
    disabled: isOverlay,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging && !isOverlay ? 0.4 : undefined,
    cursor: isOverlay ? 'grabbing' : 'grab',
  };

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : listeners)}
      {...(isOverlay ? {} : attributes)}
      className={`group relative rounded-lg border border-white/[0.07] bg-white/[0.04] p-2.5 shadow-sm transition-colors hover:border-white/10 hover:bg-white/[0.06] ${
        isOverlay ? 'rotate-2 shadow-2xl' : ''
      }`}
    >
      {card.agent_pending === 1 && (
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-indigo-400"
          title="Agent dispatch pending"
        />
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
        className="absolute right-1 top-0.5 hidden h-4 w-4 items-center justify-center rounded text-xs leading-none text-slate-500 opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-red-400 group-hover:flex group-hover:opacity-100"
        title="Delete card"
      >
        ×
      </button>

      <p
        className="cursor-pointer pr-3 text-xs font-medium text-slate-100 transition-colors hover:text-white"
        onClick={onClick}
      >
        {card.title}
      </p>

      <div className="mt-2 flex items-center gap-1">
        {canMoveBack && (
          <button
            onClick={() => onMove(pipeline.stages[currentIdx - 1])}
            className="rounded px-1.5 py-0.5 text-xs text-slate-600 transition-colors hover:bg-white/[0.08] hover:text-slate-300"
            title={`Move back to ${pipeline.stages[currentIdx - 1]}`}
          >
            ←
          </button>
        )}
        {canMoveFwd && (
          <button
            onClick={() => onMove(pipeline.stages[currentIdx + 1])}
            className="rounded px-1.5 py-0.5 text-xs text-slate-600 transition-colors hover:bg-white/[0.08] hover:text-slate-300"
            title={`Move to ${pipeline.stages[currentIdx + 1]}`}
          >
            →
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          className="ml-auto rounded px-1 py-0.5 text-xs text-slate-600 transition-colors hover:bg-white/[0.08] hover:text-slate-300"
          title="Move to stage"
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-xl border border-white/10 bg-[#0d1526] py-1 shadow-xl">
          {pipeline.stages.map((s) => (
            <button
              key={s}
              onClick={() => { setMenuOpen(false); onMove(s); }}
              disabled={s === card.stage}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-white/[0.06] disabled:cursor-default disabled:text-slate-600"
            >
              {s}
              {pipeline.agents[s] && (
                <span className="ml-1 text-indigo-400">({pipeline.agents[s]})</span>
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

  const [confirmPending, setConfirmPending] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [addDomain, setAddDomain]           = useState(null);
  const [detailCard, setDetailCard]         = useState(null);
  const [toast, setToast]                   = useState(null);
  const [activeCard, setActiveCard]         = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

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

  // Real-time updates via shared SSE connection.
  const { subscribe } = useSse();
  useEffect(() => {
    const unsub = subscribe((data) => {
      const { id, stage } = data ?? {};
      if (id != null && stage != null) {
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)));
      }
    }, 'kanban_updated');
    return unsub;
  }, [subscribe]);

  function handleDragStart(event) {
    setActiveCard(event.active.data.current?.card ?? null);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;
    const card = active.data.current?.card;
    const { domain: targetDomain, stage: targetStage } = over.data.current ?? {};
    if (!card || !targetStage) return;
    if (targetDomain && targetDomain !== card.domain) return;
    if (targetStage === card.stage) return;
    handleMoveRequest(card, targetStage);
  }

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
    } catch {
      setToast('Failed — please try again');
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
    } catch {
      setToast('Failed — please try again');
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
      const res = await fetch(`/api/kanban/${cardId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      setDetailCard(null);
    } catch {
      setToast('Failed — please try again');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-indigo-400">Boards</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Kanban</h1>
        </div>
        <SectionSpinner label="Loading boards…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-indigo-400">Boards</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Kanban</h1>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-indigo-400">Boards</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Kanban</h1>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-6">
          {pipelines && Object.entries(pipelines).map(([domain, pipeline]) => (
            <div key={domain} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <KanbanBoard
                domain={domain}
                pipeline={pipeline}
                cards={cards.filter((c) => c.domain === domain)}
                onMoveCard={handleMoveRequest}
                onCardClick={setDetailCard}
                onAddCard={setAddDomain}
                onDeleteCard={handleDelete}
              />
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeCard && (
            <KanbanCardTile card={activeCard} pipeline={pipelines[activeCard.domain]} isOverlay />
          )}
        </DragOverlay>
      </DndContext>

      <Toast message={toast} onClose={() => setToast(null)} />

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

      {addDomain && (
        <AddCardModal
          domain={addDomain}
          onAdd={handleCardAdded}
          onCancel={() => setAddDomain(null)}
        />
      )}

      {detailCard && (
        <CardDetail
          card={detailCard}
          pipeline={pipelines[detailCard.domain]}
          onClose={() => setDetailCard(null)}
          onDelete={handleDelete}
          onUpdateCard={(updated) => {
            setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setDetailCard(updated);
          }}
        />
      )}
    </div>
  );
}
