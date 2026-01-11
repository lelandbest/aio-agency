import React, { useState } from 'react';
import { GitMerge, Plus, Trash2, Calendar, AlertCircle } from 'lucide-react';

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

  const [columns, setColumns] = useState(INITIAL_PIPELINE);
  const [draggedCard, setDraggedCard] = useState(null);

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
    if (columnId === targetColumnId) return;

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

  return (
    <div className="h-full bg-[#0F0F11] rounded-xl border border-[#27272A] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[#27272A] bg-[#050505] flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <GitMerge size={20} className="text-purple-500" />
          Pipeline
        </h1>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-6 min-w-min">
          {Object.entries(columns).map(([columnId, cards]) => (
            <div
              key={columnId}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, columnId)}
              className="flex-shrink-0 w-80 bg-[#0A0A0A] rounded-xl p-4 border border-[#27272A]"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white capitalize flex items-center gap-2">
                  {columnId}
                  <span className="bg-[#27272A] text-gray-300 px-2 py-0.5 rounded text-xs font-normal">
                    {cards.length}
                  </span>
                </h2>
                <button className="text-gray-500 hover:text-white p-1">
                  <Plus size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {cards.map(card => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, columnId, card.id)}
                    onDragEnd={handleDragEnd}
                    className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 cursor-move hover:border-purple-500/50 transition group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-bold text-purple-400">{card.id}</span>
                      <button
                        onClick={() => deleteCard(columnId, card.id)}
                        className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <h3 className="text-sm font-semibold text-white mb-2">{card.title}</h3>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${PRIORITY_COLORS[card.priority]}`}>
                          {card.priority}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-gray-500">
                        <Calendar size={12} />
                        <span>{card.date}</span>
                      </div>

                      <div className="flex items-center gap-1 flex-wrap">
                        {card.tags?.map(tag => (
                          <span key={tag} className="bg-[#27272A] text-gray-300 px-2 py-0.5 rounded text-[10px]">
                            {tag}
                          </span>
                        ))}
                      </div>

                      {card.assignees?.length > 0 && (
                        <div className="flex items-center gap-1">
                          {card.assignees.map(assignee => (
                            <div
                              key={assignee}
                              className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
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
                  <div className="text-center py-8 text-gray-600 border-2 border-dashed border-[#27272A] rounded-lg">
                    <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Drop items here</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PipelineModule;
