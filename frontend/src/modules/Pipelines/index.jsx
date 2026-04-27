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
  Building2,
  Trash2
} from 'lucide-react';
import { BrainIcon, Crosshair, CommandSurfaceIcon } from '../../components/ui/icons';
import { openGlobalOverlay } from '../../components/GlobalOverlay';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useSystemConfirm } from '../../hooks/useSystemConfirm';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';
import { draftAiApi, openThreadForContactApi, updateContactApi, toSnakeCase } from '../../services/backendApi';
import { ContactsService } from '../../services/contacts.service';

const STORAGE_KEY = 'aio_pipelines_layout_v2';
const BOARDS_STORAGE_KEY = 'aio_pipelines_boards_v1';

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

const PipelinesModule = () => {
  const { openAIAssist, toggleAIAssist } = useAIAssist();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedCard, setDraggedCard] = useState(null);
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [showCreateStage, setShowCreateStage] = useState(false);

  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardType, setNewBoardType] = useState('Sales');
  const { confirm: systemConfirm, modalState, setPromptValue } = useSystemConfirm();

  const loadBoards = () => {
    const savedBoards = window.localStorage.getItem(BOARDS_STORAGE_KEY);
    if (savedBoards) {
      try {
        const parsed = JSON.parse(savedBoards);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch {}
    }
    const legacyLayout = window.localStorage.getItem(STORAGE_KEY);
    let legacyStages = DEFAULT_COLUMNS;
    if (legacyLayout) {
      try { legacyStages = JSON.parse(legacyLayout) || DEFAULT_COLUMNS; } catch {}
    }
    return [{
      id: 'default',
      name: 'Main Pipelines',
      type: 'Sales',
      stages: legacyStages,
      cards: []
    }];
  };

  const [boards, setBoards] = useState(loadBoards);
  const [activeBoardId, setActiveBoardId] = useState(() => {
    return window.localStorage.getItem('aio_active_board_v1') || 'default';
  });

  const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId) || boards[0], [boards, activeBoardId]);

  useEffect(() => {
    window.localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(boards));
    window.localStorage.setItem('aio_active_board_v1', activeBoardId);
  }, [boards, activeBoardId]);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const data = await ContactsService.fetchContacts();
      setContacts((data || []).filter((contact) => !contact.deletedAt));
    } catch (error) {
      console.error('Error loading pipeline contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const cardsByColumn = useMemo(() => {
    const columnMap = new Map((activeBoard.stages || []).map((column) => [column.id, []]));
    const dynamicColumns = [];

    contacts.forEach((contact) => {
      const memberships = contact?.customFields?.pipelineMemberships || [];
      const membership = memberships.find((m) => m.boardId === activeBoard.id);

      let stageId;
      if (membership) {
        stageId = normalizeStageId(membership.stageId);
      } else if (activeBoard.id === 'default' && contact.pipelineStage) {
        // BACKWARD COMPAT: Existing contacts with a pipelineStage are visible on the Main Pipeline
        stageId = normalizeStageId(contact.pipelineStage);
      } else {
        // ZERO-DRIFT STRICT: If not explicitly assigned, do not show in this pipeline
        return;
      }

      if (columnMap.has(stageId)) {
        columnMap.get(stageId).push(contact);
      } else if (activeBoard.id === 'default' && stageId) {
        const title = (membership?.stageId || contact.pipelineStage || 'New');
        columnMap.set(stageId, [contact]);
        dynamicColumns.push({ id: stageId, title });
      }
    });

    const resolvedColumns = [...(activeBoard.stages || [])];
    if (activeBoard.id === 'default') {
      dynamicColumns.forEach((column) => {
        if (!resolvedColumns.find((entry) => entry.id === column.id)) {
          resolvedColumns.push(column);
        }
      });
    }

    return {
      columns: resolvedColumns,
      cards: columnMap
    };
  }, [activeBoard, contacts]);

  const pipelineStats = useMemo(() => {
    const boardCards = Array.from(cardsByColumn.cards.values()).flat();
    const total = boardCards.length;
    const open = boardCards.filter((contact) => {
      const memberships = contact?.customFields?.pipelineMemberships || [];
      const membership = memberships.find(m => m.boardId === activeBoard.id);
      const stage = membership?.stageId || (activeBoard.id === 'default' ? contact.pipelineStage : '');
      return !['Closed Won', 'Closed Lost'].includes(stage || '');
    }).length;
    const highValue = boardCards.filter((contact) => (contact.leadScore || 0) >= 80).length;
    const noOwner = boardCards.filter((contact) => !contact.owner).length;
    return { total, open, highValue, noOwner };
  }, [cardsByColumn]);

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

    const memberships = contact?.customFields?.pipelineMemberships || [];
    const nextMemberships = memberships.filter(m => m.boardId !== activeBoard.id);
    nextMemberships.push({ boardId: activeBoard.id, stageId: targetColumn.id });

    const updates = {
      customFields: {
        ...(contact.customFields || {}),
        pipeline_memberships: toSnakeCase(nextMemberships)
      },
      updatedAt: new Date().toISOString()
    };

    // Keep legacy field in sync if it's the default board
    if (activeBoard.id === 'default') {
      updates.pipelineStage = targetColumn.title;
    }

    await updateContactApi(contact.id, updates);
    await loadContacts();
    setDraggedCard(null);
  };

  const handleDragEnd = () => setDraggedCard(null);

  const saveNewColumn = () => {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    const id = normalizeStageId(trimmed);
    if (activeBoard.stages.find((column) => column.id === id)) {
      setShowCreateStage(false);
      setNewColumnName('');
      return;
    }
    setBoards(prev => prev.map(b => b.id === activeBoard.id ? { ...b, stages: [...b.stages, { id, title: trimmed }] } : b));
    setShowCreateStage(false);
    setNewColumnName('');
  };

  const saveRenameColumn = (columnId) => {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    setBoards(prev => prev.map(b => b.id === activeBoard.id ? {
      ...b,
      stages: b.stages.map(col => col.id === columnId ? { ...col, title: trimmed } : col)
    } : b));
    setEditingColumnId(null);
    setNewColumnName('');
  };

  const handleDeleteStage = async (columnId) => {
    const stage = activeBoard.stages.find(s => s.id === columnId);
    if (!stage) return;
    
    const isConfirmed = await systemConfirm({
      title: 'Delete Stage',
      message: `Permanently delete stage "${stage.title}"? Records in this stage will be visible in the audit cluster until re-assigned.`,
      confirmText: 'Delete Stage',
      variant: 'danger'
    });

    if (isConfirmed) {
      setBoards(prev => prev.map(b => b.id === activeBoard.id ? {
          ...b,
          stages: b.stages.filter(col => col.id !== columnId)
        } : b));
    }
  };

  const handleDeleteContact = async (contactId) => {
    const isConfirmed = await systemConfirm({
      title: 'Remove Record',
      message: 'Permanently remove this record from the pipeline? This action cannot be undone.',
      confirmText: 'Remove Record',
      variant: 'danger'
    });

    if (isConfirmed) {
      // Optimistic update
      setContacts(prev => prev.filter(c => c.id !== contactId));
      
      try {
        await updateContactApi(contactId, { deletedAt: new Date().toISOString() });
      } catch (error) {
        console.error('Error deleting contact:', error);
        await loadContacts(); // Rollback if failed
      }
    }
  };
  
  const handleDeleteBoard = async () => {
    if (activeBoardId === 'default') {
      await systemConfirm({
        title: 'System Access Denied',
        message: 'Main Pipeline is a protected system resource and cannot be eradicated.',
        confirmText: 'Understood',
        variant: 'info'
      });
      return;
    }

    const isConfirmed = await systemConfirm({
      title: 'Delete Pipeline',
      message: `FORCE DELETE PIPELINE: "${activeBoard.name}"? All stage configurations will be lost. This cannot be undone.`,
      confirmText: 'Delete Pipeline',
      variant: 'danger'
    });

    if (isConfirmed) {
      const nextBoards = boards.filter(b => b.id !== activeBoardId);
      setBoards(nextBoards);
      setActiveBoardId('default');
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handleCreateBoard = () => {
    if (!newBoardName.trim()) return;
    let initialStages = [];
    if (newBoardType === 'Sales') {
      initialStages = [
        { id: 'new', title: 'New' },
        { id: 'qualified', title: 'Qualified' },
        { id: 'discovery', title: 'Discovery' },
        { id: 'negotiating', title: 'Negotiating' },
        { id: 'closed-won', title: 'Closed Won' },
        { id: 'closed-lost', title: 'Closed Lost' }
      ];
    } else if (newBoardType === 'Task') {
      initialStages = [
        { id: 'new', title: 'New' },
        { id: 'queued', title: 'Queued' },
        { id: 'in-progress', title: 'In Progress' },
        { id: 'review', title: 'Review' },
        { id: 'complete', title: 'Complete' }
      ];
    } else if (newBoardType === 'Build') {
      initialStages = [
        { id: 'concept', title: 'Concept' },
        { id: 'active', title: 'Active' },
        { id: 'integrating', title: 'Integrating' },
        { id: 'testing', title: 'Testing' },
        { id: 'live', title: 'Live' }
      ];
    } else {
      initialStages = [
        { id: 'new', title: 'New' }
      ];
    }
    const newBoard = {
      id: 'board_' + Date.now(),
      name: newBoardName.trim(),
      type: newBoardType,
      stages: initialStages,
      cards: []
    };
    setBoards(prev => [...prev, newBoard]);
    setActiveBoardId(newBoard.id);
    setShowCreateBoard(false);
    setNewBoardName('');
    setNewBoardType('Sales');
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
          module: channelType === 'sms' ? 'sms_voip' : 'comms',
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteContact(contact.id);
            }}
            className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/5 px-2.5 py-1.5 text-[11px] font-medium text-red-500 hover:bg-red-500/15 shadow-island-sm transition"
            title="Delete Record"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="module-root-standard bg-[#000]">
      {/* ABSOLUTE TOOLBAR CONTRACT — ZONE RECONSTRUCTION */}
      <div className="module-toolbar">
        {/* LEFT ZONE: MODULE ACTIONS ONLY */}
        <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
          <button
            onClick={() => {
              setShowCreateStage(true);
              setEditingColumnId(null);
              setNewColumnName('');
            }}
            className="btn-toolbar-lead px-3 py-1.5 text-[10px]"
          >
            <Plus size={12} />
            <span className="font-bold uppercase tracking-[0.14em]">ADD STAGE</span>
          </button>
        </div>

        {/* CENTER ZONE: STATUS ONLY */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
          {toolbarStats.map((stat) => (
            <div
              key={stat.label}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[9px] font-bold text-[var(--color-text-secondary)] shadow-island-sm h-7 pointer-events-auto"
            >
              <div className={`w-1 h-1 rounded-full ${stat.color === 'emerald' ? 'bg-emerald-500' : stat.color === 'amber' ? 'bg-amber-500' : 'bg-[var(--color-text-tertiary)]'}`} />
              <span>{stat.label.toUpperCase()}</span>
              <span className="text-[var(--color-text-primary)]">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* RIGHT ZONE: GLOBAL CONTROLS ONLY */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <select
              value={activeBoardId}
              onChange={(e) => setActiveBoardId(e.target.value)}
              className="aio-select !w-auto min-w-[120px] !h-8 !text-[10px] !font-bold !bg-[var(--color-bg-primary)]"
            >
              {boards.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowCreateBoard(true)}
              className="p-1.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] transition"
              title="New Board"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteBoard();
              }}
              disabled={activeBoardId === 'default'}
              className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40 text-red-500 transition disabled:opacity-20"
              title="Delete Pipeline"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div className="module-toolbar-utility">
            <button
              onClick={() => toggleAIAssist({ mode: 'brain' })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"
              title="Brain (Global KB)"
            >
              <BrainIcon size={15} />
            </button>
            <button
              onClick={() => toggleAIAssist({ mode: 'help', context: { module: 'pipelines' } })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"
              title="Crosshair (Module AI)"
            >
              <Crosshair size={15} />
            </button>
            <button
              onClick={() => openGlobalOverlay()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"
              title="Composer"
            >
              <CommandSurfaceIcon size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="module-content-stage px-2 pb-2">
        <div className="h-full flex-1 overflow-y-auto overflow-x-hidden">
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
                    className={shellPanelClass + ' min-w-0 p-3 relative'}
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleDeleteStage(column.id);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-all z-[100] pointer-events-auto"
                      title="Delete Stage"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="mb-3 flex items-center justify-between gap-2 pr-8">
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

      {showCreateBoard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={shellPanelClass + ' w-full max-w-sm'}>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h3 className="text-sm font-semibold tracking-wider text-[var(--color-text-primary)] uppercase">Create New Board</h3>
              <button onClick={() => setShowCreateBoard(false)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Board Name</label>
                <input
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="e.g. Q3 Roadmap"
                  className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Pipeline Type</label>
                <select
                  value={newBoardType}
                  onChange={(e) => setNewBoardType(e.target.value)}
                  className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition"
                >
                  <option value="Sales">Sales</option>
                  <option value="Task">Task</option>
                  <option value="Build">Build</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-5 py-4">
              <button onClick={() => setShowCreateBoard(false)} className="flex-1 rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] shadow-island-sm transition">
                Cancel
              </button>
              <button 
                onClick={handleCreateBoard}
                disabled={!newBoardName.trim()}
                className="flex-1 rounded-[var(--radius-card)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-on-primary)] hover:bg-[var(--color-primary-hover)] shadow-island transition disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SystemConfirmModal
        isOpen={modalState.isOpen}
        onClose={modalState.onClose}
        onConfirm={() => modalState.onConfirm(modalState.promptValue)}
        title={modalState.title}
        message={modalState.message}
        variant={modalState.variant}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        showPrompt={modalState.showPrompt}
        promptValue={modalState.promptValue}
        onPromptChange={setPromptValue}
      />
    </div>
  );
};

export default PipelinesModule;
