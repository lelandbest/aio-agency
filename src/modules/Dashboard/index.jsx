import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, MessageSquare, Zap, Plus, X, Eye, EyeOff, 
  BarChart3, LineChart as LineChartIcon, Activity, Clock, Mail, Play, 
  Square, Settings, Edit2, Save, Grid3x3, Trash2
} from 'lucide-react';

// ============ SIMPLE CHART COMPONENTS ============
const BarChart = ({ title, data, color = '#a855f7' }) => {
  const maxValue = Math.max(...data.map(d => d.value));
  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
      <h3 className="text-sm font-bold text-[var(--color-text-secondary)] mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-[var(--color-text-secondary)]">{item.label}</span>
              <span className="text-sm font-bold text-[var(--color-text-primary)]">{item.value}</span>
            </div>
            <div className="w-full bg-[var(--color-bg-tertiary)] rounded h-2 overflow-hidden">
              <div 
                style={{ width: `${(item.value / maxValue) * 100}%`, backgroundColor: color }}
                className="h-full transition-all"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LineChart = ({ title, data, color = '#06b6d4' }) => {
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;
  
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: 100 - ((d.value - minValue) / range) * 100,
  }));

  const svgPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
      <h3 className="text-sm font-bold text-[var(--color-text-secondary)] mb-4">{title}</h3>
      <svg width="100%" height="120" viewBox="0 0 100 120" className="mb-2">
        <polyline
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
};

// ============ STAT CARD ============
const StatCard = ({ title, value, change, icon: Icon, color = 'purple' }) => {
  const colorClass = {
    purple: 'bg-purple-500/20 text-purple-400',
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-green-500/20 text-green-400',
    pink: 'bg-pink-500/20 text-pink-400',
  }[color];

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs text-[var(--color-text-secondary)] font-medium">{title}</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">{value}</p>
        </div>
        <div className={`p-2 rounded ${colorClass}`}>
          <Icon size={20} />
        </div>
      </div>
      {change && (
        <div className={`text-xs flex items-center gap-1 ${change > 0 ? 'text-green-400' : 'text-red-400'}`}>
          <TrendingUp size={12} />
          {change > 0 ? '+' : ''}{change}% from last week
        </div>
      )}
    </div>
  );
};

// ============ ACTIVITY TIMELINE ============
const ActivityTimeline = ({ activities }) => {
  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
      <h3 className="text-sm font-bold text-gray-400 mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full ${activity.color}`} />
              {i < activities.length - 1 && <div className="w-0.5 h-6 bg-[#27272A] my-1" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{activity.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{activity.description}</p>
              <p className="text-xs text-gray-600 mt-1">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ QUICK ACTIONS ============
const QuickActions = ({ onAction, onCustomize, customActions }) => {
  const defaultActions = [
    { id: 'send-msg', label: 'Send Message', icon: MessageSquare, color: 'bg-blue-600' },
    { id: 'start-flow', label: 'Start Workflow', icon: Play, color: 'bg-green-600' },
    { id: 'stop-flow', label: 'Stop Workflow', icon: Square, color: 'bg-red-600' },
    { id: 'add-contact', label: 'New Contact', icon: Users, color: 'bg-purple-600' },
  ];

  // Combine default and custom actions
  const allActions = [...defaultActions, ...customActions];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {allActions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => onAction?.(action.id)}
            className={`${action.color} hover:opacity-90 text-white rounded font-medium flex flex-col items-center justify-center gap-0.5 transition w-[25px] h-[25px] p-0 text-[8px] leading-none`}
            title={action.label}
          >
            <Icon size={12} />
          </button>
        );
      })}
      <button
        onClick={onCustomize}
        className="flex items-center justify-center w-[25px] h-[25px] rounded bg-[#27272A] hover:bg-[#333] text-gray-400 hover:text-gray-200 transition"
        title="Customize quick actions"
      >
        <Settings size={12} />
      </button>
    </div>
  );
};

// ============ CUSTOM ACTIONS ============
const CustomActionsPanel = ({ customActions, onAdd, onRemove }) => {
  const [actionName, setActionName] = useState('');
  const [actionDescription, setActionDescription] = useState('');

  const handleAdd = () => {
    if (actionName.trim()) {
      onAdd?.({ name: actionName, description: actionDescription, id: Date.now() });
      setActionName('');
      setActionDescription('');
    }
  };

  return (
    <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4">
      <h3 className="text-sm font-bold text-gray-400 mb-4">Custom Quick Actions</h3>
      <div className="space-y-2 mb-4">
        <input
          type="text"
          value={actionName}
          onChange={(e) => setActionName(e.target.value)}
          placeholder="Action name"
          className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-sm text-white focus:border-purple-500"
        />
        <input
          type="text"
          value={actionDescription}
          onChange={(e) => setActionDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-sm text-white focus:border-purple-500"
        />
        <button
          onClick={handleAdd}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded text-sm font-medium"
        >
          Add Action
        </button>
      </div>
      <div className="space-y-2">
        {customActions?.map(action => (
          <div key={action.id} className="bg-[#0F0F11] p-2 rounded flex justify-between items-center">
            <div>
              <p className="text-sm text-white">{action.name}</p>
              {action.description && <p className="text-xs text-gray-500">{action.description}</p>}
            </div>
            <button
              onClick={() => onRemove?.(action.id)}
              className="text-gray-500 hover:text-red-500 transition"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ MAIN DASHBOARD MODULE ============
const DashboardModule = () => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [visibleComponents, setVisibleComponents] = useState({
    stats: true,
    charts: true,
    timeline: true,
    quickActions: true,
    customActions: false,
  });
  const [customActions, setCustomActions] = useState([
    { id: 1, name: 'Export Report', icon: BarChart3, color: 'bg-orange-600', description: 'Generate monthly report' },
  ]);

  const [activityData] = useState([
    { title: 'New contact created', description: 'John Smith was added to your CRM', time: '2 hours ago', color: 'bg-blue-500' },
    { title: 'Workflow completed', description: 'Welcome sequence for 5 new contacts', time: '4 hours ago', color: 'bg-green-500' },
    { title: 'Message sent', description: '150 emails sent successfully', time: '6 hours ago', color: 'bg-purple-500' },
    { title: 'Form submitted', description: '3 new form responses received', time: '8 hours ago', color: 'bg-pink-500' },
  ]);

  const [statData] = useState([
    { title: 'Total Contacts', value: '2,458', change: 12, icon: Users, color: 'purple' },
    { title: 'Active Workflows', value: '18', change: 5, icon: Zap, color: 'blue' },
    { title: 'Messages Sent', value: '12,543', change: 28, icon: MessageSquare, color: 'green' },
    { title: 'Conversion Rate', value: '3.2%', change: -2, icon: TrendingUp, color: 'pink' },
  ]);

  const [chartData] = useState({
    activities: [
      { label: 'Mon', value: 120 },
      { label: 'Tue', value: 190 },
      { label: 'Wed', value: 150 },
      { label: 'Thu', value: 220 },
      { label: 'Fri', value: 200 },
      { label: 'Sat', value: 250 },
      { label: 'Sun', value: 210 },
    ],
    conversions: [
      { label: 'Week 1', value: 45 },
      { label: 'Week 2', value: 52 },
      { label: 'Week 3', value: 48 },
      { label: 'Week 4', value: 61 },
    ],
  });

  const toggleComponent = (component) => {
    setVisibleComponents(prev => ({
      ...prev,
      [component]: !prev[component]
    }));
  };

  const handleQuickAction = (actionId) => {
    console.log('Quick action clicked:', actionId);
    // Add your action logic here
  };

  const handleAddCustomAction = (action) => {
    setCustomActions([...customActions, action]);
  };

  const handleRemoveCustomAction = (id) => {
    setCustomActions(customActions.filter(a => a.id !== id));
  };

  return (
    <div className="h-full bg-[#0F0F11] rounded-xl border border-[#27272A] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#27272A] bg-[#050505] p-4 flex justify-between items-center gap-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity size={24} className="text-purple-500" />
          Dashboard
        </h1>
        
        {/* Quick Actions Bar - Center */}
        <div className="flex-1 flex justify-center">
          {visibleComponents.quickActions && (
            <QuickActions 
              onAction={handleQuickAction}
              onCustomize={() => setShowCustomizePanel(!showCustomizePanel)}
              customActions={customActions}
            />
          )}
        </div>

        {/* Export Report and Edit Button - Right */}
        <div className="flex gap-2">
          <button
            onClick={() => console.log('Export report')}
            className="px-3 py-1 rounded text-sm font-medium flex items-center gap-1 bg-[#27272A] hover:bg-[#333] text-gray-300 transition"
            title="Export Report"
          >
            <BarChart3 size={16} /> Export
          </button>
          {isEditMode && (
            <select 
              onChange={(e) => e.target.value && toggleComponent(e.target.value)}
              className="bg-[#18181B] border border-[#27272A] text-white text-sm px-3 py-1 rounded focus:border-purple-500"
            >
              <option value="">+ Add Component</option>
              <option value="stats">Stats Cards</option>
              <option value="charts">Charts</option>
              <option value="timeline">Activity Timeline</option>
              <option value="quickActions">Quick Actions</option>
              <option value="customActions">Custom Actions</option>
            </select>
          )}
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-1 ${
              isEditMode 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-[#27272A] hover:bg-[#333] text-gray-300'
            }`}
          >
            {isEditMode ? (
              <>
                <Save size={16} /> Save
              </>
            ) : (
              <>
                <Edit2 size={16} /> Edit
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* Customize Panel */}
          {showCustomizePanel && visibleComponents.quickActions && (
            <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-400">Customize Quick Actions</h3>
                <button
                  onClick={() => setShowCustomizePanel(false)}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <X size={16} />
                </button>
              </div>
              <CustomActionsPanel
                customActions={customActions}
                onAdd={handleAddCustomAction}
                onRemove={handleRemoveCustomAction}
              />
            </div>
          )}

          {/* Stats */}
          {visibleComponents.stats && (
            <div>
              {isEditMode && (
                <button
                  onClick={() => toggleComponent('stats')}
                  className="mb-2 text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded hover:bg-red-600/30 flex items-center gap-1"
                >
                  <X size={12} /> Remove
                </button>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statData.map((stat, i) => (
                  <StatCard key={i} {...stat} />
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          {visibleComponents.charts && (
            <div>
              {isEditMode && (
                <button
                  onClick={() => toggleComponent('charts')}
                  className="mb-2 text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded hover:bg-red-600/30 flex items-center gap-1"
                >
                  <X size={12} /> Remove
                </button>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LineChart title="Activity Trend" data={chartData.activities} />
                <BarChart title="Weekly Conversions" data={chartData.conversions} color="#f97316" />
              </div>
            </div>
          )}

          {/* Timeline */}
          {visibleComponents.timeline && (
            <div>
              {isEditMode && (
                <button
                  onClick={() => toggleComponent('timeline')}
                  className="mb-2 text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded hover:bg-red-600/30 flex items-center gap-1"
                >
                  <X size={12} /> Remove
                </button>
              )}
              <ActivityTimeline activities={activityData} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default DashboardModule;
