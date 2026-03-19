import React, { useEffect, useState } from 'react';
import { GitMerge, Plus, Trash2, Calendar, AlertCircle, Edit2, X } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';

/**
 * PipelineModule
 * Kanban board for pipeline/project management
 */
const PipelineModule = () => {
  const INITIAL_PIPELINE = {
    planning: [
      { id: 'PROJ-101', title: 'Ep 144: Future of AI', type: 'Story', priority: 'High', client: 'TechDaily', date: 'Oct 24', tags: ['Research', 'Guest'], assignees: ['AR'] },
      { id: 'PROJ-102', title: 'Ep 145: Automation Tools', type: 'Task', priority: 'Medium', client: 'TechDaily', date: 'Oct 31', tags: ['Scripting'], assignees: [] },
    ],
    booking: [
      { id: 'PROJ-103', title: 'Ep 143: Robotics', type: 'Task', priority: 'Low', client: 'TechDaily', date: 'Oct 17', tags: ['Waiting'], assignees: ['AC'] },
    ],
    production: [
      { id: 'PROJ-104', title: 'Ep 142: The AI Revolution', type: 'Bug', priority: 'High', client: 'TechDaily', date: 'Today', tags: ['Recording'], assignees: ['MS', 'JS'] },
    ],
    post: [
      { id: 'PROJ-105', title: 'Ep 141: Cyber Security', type: 'Story', priority: 'Medium', client: 'TechDaily', date: 'Oct 03', tags: ['Editing', 'Urgent'], assignees: [] },
    ]
  };

  const STORAGE_KEY = 'aio_pipeline_board_v1';
  const DEFAULT_ORDER = ['planning', 'booking', 'production', 'post'];
  const DEFAULT_TITLES = {
    planning: 'Planning',
    booking: 'Booking',
    production: 'Production',
    post: 'Post',
  };
  const [columns, setColumns] = useState(INITIAL_PIPELINE);
  const [columnOrder, setColumnOrder] = useState(DEFAULT_ORDER);
  const [columnTitles, setColumnTitles] = useState(DEFAULT_TITLES);
  const [draggedCard, setDraggedCard] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalColumn, setModalColumn] = useState('planning');
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    type: 'Task',
    priority: 'Medium',
    client: '',
    date: '',
    tags: '',
    assignees: '',
  });

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          if (parsed.columns) {
            setColumns(parsed.columns);
            setColumnOrder(parsed.columnOrder || Object.keys(parsed.columns));
            setColumnTitles(parsed.columnTitles || DEFAULT_TITLES);
          } else {
            setColumns(parsed);
            setColumnOrder(Object.keys(parsed));
            setColumnTitles(DEFAULT_TITLES);
          }
        }
      } catch {
        // ignore malformed
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      columns,
      columnOrder,
      columnTitles,
    }));
  }, [columns, columnOrder, columnTitles]);

  const PRIORITY_COLORS = {
    High: 'bg-red-900/20 text-red-400',
    Medium: 'bg-yellow-900/20 text-yellow-400',
    Low: 'bg-blue-900/20 text-blue-400'
  };

  const handleDragStart = (e, columnId, cardId) => {
    setDraggedCard({ columnId, cardId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetColumnId) => {
    e.preventDefault();
    if (!draggedCard) return;

    const { columnId, cardId } = draggedCard;

    const sourceCards = [...columns[columnId]];
    const targetCards = [...columns[targetColumnId]];

    const cardIndex = sourceCards.findIndex(card => card.id === cardId);
    if (cardIndex === -1) return;

    const [card] = sourceCards.splice(cardIndex, 1);

    setColumns({
      ...columns,
      [columnId]: sourceCards,
      [targetColumnId]: [...targetCards, card]
    });

    setDraggedCard(null);
  };

  const handleDropOnCard = (e, targetColumnId, targetIndex) => {
    e.preventDefault();
    if (!draggedCard) return;
    const { columnId, cardId } = draggedCard;

    const sourceCards = [...columns[columnId]];
    const targetCards = columnId === targetColumnId ? sourceCards : [...columns[targetColumnId]];
    const cardIndex = sourceCards.findIndex(card => card.id === cardId);
    if (cardIndex === -1) return;

    const [card] = sourceCards.splice(cardIndex, 1);
    targetCards.splice(targetIndex, 0, card);

    setColumns({
      ...columns,
      [columnId]: sourceCards,
      [targetColumnId]: targetCards,
    });
    setDraggedCard(null);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
  };

  const deleteCard = (columnId, cardId) => {
    const updated = columns[columnId].filter(card => card.id !== cardId);
    setColumns({
      ...columns,
      [columnId]: updated
    });
  };

  const openNewCard = (columnId) => {
    setEditingCard(null);
    setModalColumn(columnId);
    setFormData({
      id: `PROJ-${Math.floor(100 + Math.random() * 900)}`,
      title: '',
      type: 'Task',
      priority: 'Medium',
      client: '',
      date: '',
      tags: '',
      assignees: '',
    });
    setShowModal(true);
  };

  const openNewColumn = () => {
    setEditingColumnId('new');
    setNewColumnName('');
  };

  const saveNewColumn = () => {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    const idBase = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const columnId = idBase || `stage-${Math.floor(Math.random() * 1000)}`;
    if (columns[columnId]) return;
    setColumns({ ...columns, [columnId]: [] });
    setColumnOrder([...columnOrder, columnId]);
    setColumnTitles({ ...columnTitles, [columnId]: trimmed });
    setEditingColumnId(null);
    setNewColumnName('');
  };

  const startRenameColumn = (columnId) => {
    setEditingColumnId(columnId);
    setNewColumnName(columnTitles[columnId] || columnId);
  };

  const saveRenameColumn = () => {
    const trimmed = newColumnName.trim();
    if (!trimmed || !editingColumnId || editingColumnId === 'new') return;
    setColumnTitles({ ...columnTitles, [editingColumnId]: trimmed });
    setEditingColumnId(null);
    setNewColumnName('');
  };

  const openEditCard = (columnId, card) => {
    setEditingCard({ columnId, cardId: card.id });
    setModalColumn(columnId);
    setFormData({
      id: card.id,
      title: card.title || '',
      type: card.type || 'Task',
      priority: card.priority || 'Medium',
      client: card.client || '',
      date: card.date || '',
      tags: (card.tags || []).join(', '),
      assignees: (card.assignees || []).join(', '),
    });
    setShowModal(true);
  };

  const saveCard = () => {
    const normalized = {
      id: formData.id.trim() || `PROJ-${Math.floor(100 + Math.random() * 900)}`,
      title: formData.title.trim() || 'Untitled',
      type: formData.type,
      priority: formData.priority,
      client: formData.client.trim() || '',
      date: formData.date.trim() || '',
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      assignees: formData.assignees.split(',').map(a => a.trim()).filter(Boolean),
    };

    setColumns((prev) => {
      const updated = { ...prev };
      if (editingCard) {
        updated[editingCard.columnId] = updated[editingCard.columnId].map((card) =>
          card.id === editingCard.cardId ? { ...card, ...normalized } : card
        );
      } else {
        updated[modalColumn] = [...updated[modalColumn], normalized];
      }
      return updated;
    });
    setShowModal(false);
  };

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
      <ModuleHeader
        title="Pipeline"
        titleIcon={GitMerge}
        showTitle={false}
        showActions={true}
        actions={[
          {
            label: 'Add Stage',
            icon: Plus,
            onClick: openNewColumn,
            variant: 'secondary',
          },
        ]}
        aiAssistSlot={(
          <AIAssistButton
            onAssist={() => console.log('AI Assist: Pipeline')}
            tooltip="AI Assist"
            iconType="crosshair"
          />
        )}
      />

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-6 min-w-min">
          {columnOrder.map((columnId) => {
            const cards = columns[columnId] || [];
            return (
            <div
              key={columnId}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, columnId)}
              className="flex-shrink-0 w-80 bg-[var(--color-bg-primary)] rounded-xl p-4 border border-[var(--color-border)]"
            >
              <div className="flex items-center justify-between mb-4">
                {editingColumnId === columnId ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRenameColumn();
                        if (e.key === 'Escape') setEditingColumnId(null);
                      }}
                      className="w-40 px-2 py-1 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)]"
                      autoFocus
                    />
                    <button onClick={saveRenameColumn} className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                      Save
                    </button>
                  </div>
                ) : (
                  <h2
                    onDoubleClick={() => startRenameColumn(columnId)}
                    className="font-bold text-[var(--color-text-primary)] flex items-center gap-2 cursor-pointer"
                  >
                    {columnTitles[columnId] || columnId}
                    <span className="bg-[var(--color-hover)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded text-xs font-normal">
                    {cards.length}
                  </span>
                  </h2>
                )}
                <button
                  onClick={() => openNewCard(columnId)}
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-1"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {cards.map(card => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, columnId, card.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnCard(e, columnId, cards.findIndex(c => c.id === card.id))}
                    onDragEnd={handleDragEnd}
                    onDoubleClick={() => openEditCard(columnId, card)}
                    className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg p-4 cursor-move hover:border-[var(--color-primary)]/50 transition group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-bold text-[var(--color-accent)]">{card.id}</span>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => openEditCard(columnId, card)}
                          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => deleteCard(columnId, card.id)}
                          className="text-[var(--color-text-tertiary)] hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">{card.title}</h3>

                    <div className="space-y-2 text-xs">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                        {card.type}
                        {card.client ? ` · ${card.client}` : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${PRIORITY_COLORS[card.priority]}`}>
                          {card.priority}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
                        <Calendar size={12} />
                        <span>{card.date}</span>
                      </div>

                      <div className="flex items-center gap-1 flex-wrap">
                        {card.tags?.map(tag => (
                          <span key={tag} className="bg-[var(--color-hover)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded text-[10px]">
                            {tag}
                          </span>
                        ))}
                      </div>

                      {card.assignees?.length > 0 && (
                        <div className="flex items-center gap-1">
                          {card.assignees.map(assignee => (
                            <div
                              key={assignee}
                              className="w-6 h-6 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                            >
                              {assignee}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {cards.length === 0 && (
                  <div className="text-center py-8 text-[var(--color-text-tertiary)] border-2 border-dashed border-[var(--color-border)] rounded-lg">
                    <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Drop items here</p>
                  </div>
                )}
              </div>
            </div>
          );})}

          {editingColumnId === 'new' && (
            <div className="flex-shrink-0 w-80 bg-[var(--color-bg-primary)] rounded-xl p-4 border border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNewColumn();
                    if (e.key === 'Escape') setEditingColumnId(null);
                  }}
                  placeholder="Stage name"
                  className="flex-1 px-2 py-1 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)]"
                  autoFocus
                />
                <button onClick={saveNewColumn} className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {editingCard ? 'Edit Card' : 'New Card'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1">Title</label>
                <input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text-primary)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text-primary)]"
                  >
                    <option>Task</option>
                    <option>Story</option>
                    <option>Bug</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text-primary)]"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1">Client</label>
                <input
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text-primary)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1">Date</label>
                  <input
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1">ID</label>
                  <input
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text-primary)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1">Tags (comma)</label>
                <input
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1">Assignees (comma)</label>
                <input
                  value={formData.assignees}
                  onChange={(e) => setFormData({ ...formData, assignees: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text-primary)]"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={saveCard}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-primary)] text-[var(--color-text-on-primary)] hover:bg-[var(--color-primary-hover)]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineModule;
