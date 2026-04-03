import React, { useEffect, useMemo, useState } from 'react';
import {
  GitMerge,
  Plus,
  Calendar,
  AlertCircle,
  Edit2,
  X,
  Mail,
  MessageCircle,
  ExternalLink,
  Building2
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { draftAiApi, getContactsApi, openThreadForContactApi, updateContactApi } from '../../services/backendApi';

const STORAGE_KEY = 'aio_pipeline_layout_v2';
const DEFAULT_COLUMNS = [
  { id: 'new', title: 'New' },
  { id: 'qualified', title: 'Qualified' },
  { id: 'discovery', title: 'Discovery' },
  { id: 'negotiating', title: 'Negotiating' },
  { id: 'closed-won', title: 'Closed Won' },
  { id: 'closed-lost', title: 'Closed Lost' }
];

const normalizeStageId = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'new';

const ownerInitials = (owner) =>
  String(owner || 'AI')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AI';

const shellPanelClass = 'rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-island-sm';
const innerPanelClass = 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';

const PipelineModule = () => {
  const { openAIAssist } = useAIAssist();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedCard, setDraggedCard] = useState(null);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [showCreateStage, setShowCreateStage] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) {
          setColumns(parsed);
        }
      } catch {}
    }
    loadContacts();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  }, [columns]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const data = await getContactsApi();
      setContacts((data || []).filter((contact) => !contact.deletedAt));
    } catch (error) {
      console.error('Error loading pipeline contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const cardsByColumn = useMemo(() => {
    const columnMap = new Map(columns.map((column) => [column.id, []]));
    const dynamicColumns = [];

    contacts.forEach((contact) => {
      const stageId = normalizeStageId(contact.pipelineStage);
      if (!columnMap.has(stageId)) {
        const title = contact.pipelineStage || 'New';
        columnMap.set(stageId, []);
        dynamicColumns.push({ id: stageId, title });
      }
      columnMap.get(stageId).push(contact);
    });

    const resolvedColumns = [...columns];
    dynamicColumns.forEach((column) => {
      if (!resolvedColumns.find((entry) => entry.id === column.id)) {
        resolvedColumns.push(column);
      }
    });

    return {
      columns: resolvedColumns,
      cards: columnMap
    };
  }, [columns, contacts]);

  const pipelineStats = useMemo(() => {
    const total = contacts.length;
    const open = contacts.filter((contact) => !['Closed Won', 'Closed Lost'].includes(contact.pipelineStage)).length;
    const highValue = contacts.filter((contact) => (contact.leadScore || 0) >= 80).length;
    const noOwner = contacts.filter((contact) => !contact.owner).length;
    return { total, open, highValue, noOwner };
  }, [contacts]);

  const toolbarStats = [
    { label: 'Deals', value: pipelineStats.open, color: 'emerald' },
    { label: 'Total', value: pipelineStats.total, color: 'slate' },
    { label: 'Signal', value: pipelineStats.highValue, color: 'emerald' },
    { label: 'Audit', value: pipelineStats.noOwner, color: 'amber' },
  ];

  const handleDragStart = (event, contactId, columnId) => {
    setDraggedCard({ contactId, columnId });
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (event, targetColumn) => {
    event.preventDefault();
    if (!draggedCard) return;
    const contact = contacts.find((entry) => entry.id === draggedCard.contactId);
    if (!contact) return;
    const nextStage = targetColumn.title;
    if (contact.pipelineStage === nextStage) {
      setDraggedCard(null);
      return;
    }
    await updateContactApi(contact.id, { pipelineStage: nextStage, updatedAt: new Date().toISOString() });
    await loadContacts();
    setDraggedCard(null);
  };

  const handleDragEnd = () => setDraggedCard(null);

  const saveNewColumn = () => {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    const id = normalizeStageId(trimmed);
    if (columns.find((column) => column.id === id)) {
      setShowCreateStage(false);
      setNewColumnName('');
      return;
    }
    setColumns((current) => [...current, { id, title: trimmed }]);
    setShowCreateStage(false);
    setNewColumnName('');
  };

  const saveRenameColumn = (columnId) => {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    setColumns((current) =>
      current.map((column) => (column.id === columnId ? { ...column, title: trimmed } : column))
    );
    setEditingColumnId(null);
    setNewColumnName('');
  };

  const startRenameColumn = (column) => {
    setEditingColumnId(column.id);
    setNewColumnName(column.title);
  };

  const openCrmRecord = (contactId) => {
    window.dispatchEvent(
      new CustomEvent('aio:navigate', {
        detail: {
          module: 'crm',
          contactId
        }
      })
    );
  };

  const openCommsThread = async (contact, channelType = 'email') => {
    const thread = await openThreadForContactApi({
      contactId: contact.id,
      channelType: channelType,
      subject: `${channelType.toUpperCase()} follow-up for ${contact.firstName} ${contact.lastName}`.trim()
    });
    window.dispatchEvent(
      new CustomEvent('aio:navigate', {
        detail: {
          module: channelType === 'sms' ? 'sms-voip' : 'chat',
          threadId: thread.id
        }
      })
    );
  };

  const runPipelineAssist = async () => {
    const highestSignal = [...contacts].sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0))[0];
    if (!highestSignal) return;
    
      try {
        const response = await draftAiApi({
        module: 'pipelines',
          surface: 'deal-card',
          field: 'next-action',
        intent: 'suggest',
        current_value: '',
        context: {
          contactName: highestSignal.name,
          contactEmail: highestSignal.email,
          dealValue: highestSignal.deal_value,
          pipelineStage: highestSignal.pipelineStage,
          leadScore: highestSignal.leadScore
        }
      });
      if (response?.suggestion) {
        await openCommsThread(highestSignal, 'email');
      }
    } catch (err) {
      console.error(err);
      await openCommsThread(highestSignal, 'email');
    }
  };

  const getColumnHighlight = (cards) => [...cards].sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0))[0] || null;

  const renderCard = (contact) => {
    const score = contact.leadScore || 0;
    const priorityTone =
      score >= 85 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' :
      score >= 65 ? 'border-sky-500/30 bg-sky-500/10 text-sky-200' :
      'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]';

    return (
      <div
        key={contact.id}
        draggable
        onDragStart={(event) => handleDragStart(event, contact.id, normalizeStageId(contact.pipelineStage))}
        onDragEnd={handleDragEnd}
        onDoubleClick={() => openCrmRecord(contact.id)}
        className="group rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 transition hover:border-[var(--color-primary)]/45 hover:shadow-island"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
              {contact.contactId || contact.id}
            </div>
            <h3 className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
              {contact.firstName} {contact.lastName}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Building2 size={12} />
              <span>{contact.company || 'Unassigned company'}</span>
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-[11px] font-bold border border-[var(--color-primary)]/20 shadow-island-sm">
            {ownerInitials(contact.owner)}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`rounded-[var(--radius-card)] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${priorityTone} shadow-island-sm`}>
            Score {score}
          </span>
          {(contact.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[10px] text-[var(--color-text-secondary)] shadow-island-sm">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--color-text-secondary)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Owner</div>
            <div className="mt-1 text-[var(--color-text-primary)]">{contact.owner || 'Unassigned'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Updated</div>
            <div className="mt-1 text-[var(--color-text-primary)]">
              {contact.updatedAt ? new Date(contact.updatedAt).toLocaleDateString() : '--'}
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
          <button
            onClick={() => openCrmRecord(contact.id)}
            className="flex-1 rounded-[var(--radius-card)] border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] shadow-island-sm transition"
          >
            <ExternalLink size={12} className="mr-1 inline" />
            CRM
          </button>
          <button
            onClick={() => openCommsThread(contact, 'email')}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] shadow-island-sm transition"
          >
            <Mail size={12} />
          </button>
          <button
            onClick={() => openCommsThread(contact, 'sms')}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] shadow-island-sm transition"
          >
            <MessageCircle size={12} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ModuleHeader
        title="Pipelines"
        showTitle={false}
        leftActions={[
          {
            label: 'Add Stage',
            icon: Plus,
            onClick: () => {
              setShowCreateStage(true);
              setEditingColumnId(null);
              setNewColumnName('');
            },
            variant: 'secondary',
          },
        ]}
        onModuleAi={runPipelineAssist}
        hasSelection={!!selectedCard}
        toolbarRightSlot={(
          <div className="flex items-center gap-2">
            {toolbarStats.map((stat) => (
              <div
                key={stat.label}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[10px] font-bold text-[var(--color-text-secondary)] shadow-island-sm"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${stat.color === 'emerald' ? 'bg-emerald-500' : stat.color === 'amber' ? 'bg-amber-500' : 'bg-[var(--color-text-tertiary)]'}`} />
                <span>{stat.label.toUpperCase()}</span>
                <span className="text-[var(--color-text-primary)]">{stat.value}</span>
              </div>
            ))}
          </div>
        )}
      />

      <div className="flex-1 min-h-0 rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden shadow-island p-2">
        <div className="h-full flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5">
        {loading ? (
          <div className={shellPanelClass + ' flex h-full items-center justify-center text-[var(--color-text-secondary)]'}>
            Loading pipeline...
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] items-start">
            {cardsByColumn.columns.map((column) => {
              const cards = cardsByColumn.cards.get(column.id) || [];
              return (
                <div
                  key={column.id}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, column)}
                  className={shellPanelClass + ' min-w-0 p-3'}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    {editingColumnId === column.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          value={newColumnName}
                          onChange={(event) => setNewColumnName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveRenameColumn(column.id);
                            if (event.key === 'Escape') setEditingColumnId(null);
                          }}
                          className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] shadow-island-sm transition"
                          autoFocus
                        />
                        <button onClick={() => saveRenameColumn(column.id)} className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                          Save
                        </button>
                      </div>
                    ) : (
                      <div>
                        <button onDoubleClick={() => startRenameColumn(column)} className="text-left">
                          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{column.title}</div>
                        </button>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{cards.length} record{cards.length === 1 ? '' : 's'}</div>
                      </div>
                    )}
                    {getColumnHighlight(cards) ? (
                      <button
                        onClick={() => setSelectedCard(getColumnHighlight(cards))}
                        className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] transition hover:border-[var(--color-primary)]/45 hover:text-[var(--color-text-primary)] shadow-island-sm"
                      >
                        Top Signal
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-2.5">
                    {cards.map(renderCard)}
                    {cards.length === 0 ? (
                      <div className="rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-8 text-center text-[var(--color-text-tertiary)]">
                        <AlertCircle size={22} className="mx-auto mb-2 opacity-60" />
                        <p className="text-xs">Drop CRM records here</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {showCreateStage ? (
              <div className={shellPanelClass + ' min-w-0 p-3'}>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">New Stage</div>
                  <input
                    value={newColumnName}
                    onChange={(event) => setNewColumnName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveNewColumn();
                      if (event.key === 'Escape') setShowCreateStage(false);
                    }}
                    placeholder="Stage name"
                    className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] shadow-island-sm transition"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowCreateStage(false)} className="flex-1 rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] shadow-island-sm transition">
                      Cancel
                    </button>
                    <button onClick={saveNewColumn} className="flex-1 rounded-[var(--radius-card)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-on-primary)] hover:bg-[var(--color-primary-hover)] shadow-island transition">
                      Add Stage
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
        </div>
      </div>

      {selectedCard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={shellPanelClass + ' w-full max-w-lg'}>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Relationship Record</div>
                <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                  {selectedCard.firstName} {selectedCard.lastName}
                </h3>
              </div>
              <button onClick={() => setSelectedCard(null)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className={innerPanelClass + ' p-4'}>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Company</div>
                  <div className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">{selectedCard.company || 'No company linked'}</div>
                </div>
                <div className={innerPanelClass + ' p-4'}>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Stage</div>
                  <div className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">{selectedCard.pipelineStage || 'New'}</div>
                </div>
              </div>
              <div className={innerPanelClass + ' p-4 text-sm text-[var(--color-text-secondary)]'}>
                <div>Email: <span className="text-[var(--color-text-primary)]">{selectedCard.email || '--'}</span></div>
                <div className="mt-2">Owner: <span className="text-[var(--color-text-primary)]">{selectedCard.owner || 'Unassigned'}</span></div>
                <div className="mt-2">Lead Score: <span className="text-[var(--color-text-primary)]">{selectedCard.leadScore || 0}</span></div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-5 py-4">
              <button onClick={() => openCrmRecord(selectedCard.id)} className="flex-1 rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] shadow-island-sm transition">
                CRM
              </button>
              <button onClick={() => openCommsThread(selectedCard, 'email')} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] shadow-island-sm transition">
                Email
              </button>
              <button onClick={() => openCommsThread(selectedCard, 'sms')} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] shadow-island-sm transition">
                SMS
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PipelineModule;
