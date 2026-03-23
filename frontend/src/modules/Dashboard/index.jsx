import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Users, MessageSquare, Zap, Plus, X, Eye, EyeOff, 
  BarChart3, LineChart as LineChartIcon, Activity, Clock, Mail, Play, 
  Square, Settings, Edit2, Save, Grid3x3, Trash2, Brain, Target, Send, FileText
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';
import { assistAiApi, getAiRunsApi, getCommsSnapshotApi, getContactsApi } from '../../services/backendApi';

const BarChart = ({ title, data, color = 'var(--color-primary)' }) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);
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

const LineChart = ({ title, data, color = 'var(--color-accent)' }) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const minValue = Math.min(...data.map(d => d.value), 0);
  const range = maxValue - minValue || 1;
  
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1 || 1)) * 100,
    y: 100 - ((d.value - minValue) / range) * 100,
  }));

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
      <h3 className="text-sm font-bold text-[var(--color-text-secondary)] mb-4">{title}</h3>
      <svg width="100%" height="120" viewBox="0 0 100 120" className="mb-2" preserveAspectRatio="none">
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

const StatCard = ({ title, value, change, icon: Icon, color = 'purple', subtitle }) => {
  const colorClass = {
    purple: 'bg-purple-500/20 text-purple-400',
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-green-500/20 text-green-400',
    pink: 'bg-pink-500/20 text-pink-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
    amber: 'bg-amber-500/20 text-amber-400',
  }[color] || 'bg-purple-500/20 text-purple-400';

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs text-[var(--color-text-secondary)] font-medium">{title}</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">{value}</p>
          {subtitle && <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded ${colorClass}`}>
          <Icon size={20} />
        </div>
      </div>
      {change !== undefined && (
        <div className={`text-xs flex items-center gap-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          <TrendingUp size={12} className={change < 0 ? 'rotate-180' : ''} />
          {change > 0 ? '+' : ''}{change}% from last week
        </div>
      )}
    </div>
  );
};

const ActivityTimeline = ({ activities }) => {
  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
      <h3 className="text-sm font-bold text-gray-400 mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities?.length ? activities.map((activity, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full ${activity.color || 'bg-sky-500'}`} />
              {i < activities.length - 1 && <div className="w-0.5 h-6 bg-[var(--color-hover)] my-1" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{activity.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{activity.description}</p>
              <p className="text-xs text-gray-600 mt-1">{activity.time}</p>
            </div>
          </div>
        )) : (
          <p className="text-sm text-gray-500">No recent activity</p>
        )}
      </div>
    </div>
  );
};

const QuickActionButton = ({ id, label, icon: Icon, color, onClick }) => (
  <button
    onClick={() => onClick?.(id)}
    className={`${color} hover:opacity-90 text-white rounded-lg font-bold flex flex-col items-center justify-center gap-1 transition p-3 text-[11px] uppercase tracking-wider`}
    title={label}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const DashboardModule = () => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [visibleComponents, setVisibleComponents] = useState({
    stats: true,
    charts: true,
    timeline: true,
    quickActions: true,
  });
  const [customActions, setCustomActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState('');
  
  const [stats, setStats] = useState({
    contacts: 0,
    pipeline: 0,
    comms: 0,
    aiRuns: 0,
  });

  const [chartData, setChartData] = useState({
    pipeline: [],
    aiActivity: [],
  });

  const [activities, setActivities] = useState([]);

  const runDashboardAssist = async () => {
    try {
      const response = await assistAiApi({
        module: 'dashboard',
        surface: 'insights',
        field: 'summary',
        intent: 'analyze',
        current_value: '',
        context: {
          stats: stats,
          pipelineStages: chartData.pipeline,
        }
      });
      if (response?.suggestion) {
        setInsight(response.suggestion);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const [contactsRes, commsRes, aiRunsRes] = await Promise.all([
          getContactsApi().catch(() => []),
          getCommsSnapshotApi().catch(() => ({ threads: [] })),
          getAiRunsApi(20).catch(() => []),
        ]);

        const contacts = contactsRes || [];
        const threads = commsRes?.threads || commsRes?.allThreads || [];
        const aiRuns = aiRunsRes || [];

        const pipelineStages = {};
        contacts.forEach(c => {
          const stage = c.pipeline_stage || 'New';
          pipelineStages[stage] = (pipelineStages[stage] || 0) + 1;
        });

        const aiByDay = {};
        const now = new Date();
        aiRuns.forEach(run => {
          const d = new Date(run.created_at);
          const key = d.toLocaleDateString('en-US', { weekday: 'short' });
          aiByDay[key] = (aiByDay[key] || 0) + 1;
        });

        const aiActivity = Object.entries(aiByDay).map(([label, value]) => ({ label, value }));

        setStats({
          contacts: contacts.length,
          pipeline: contacts.filter(c => c.pipeline_stage && !['Closed Won', 'Closed Lost'].includes(c.pipeline_stage)).length,
          comms: threads.length,
          aiRuns: aiRuns.length,
        });

        setChartData({
          pipeline: Object.entries(pipelineStages).map(([label, value]) => ({ label, value })),
          aiActivity,
        });

        const recentActivities = [];
        
        if (aiRuns.length) {
          recentActivities.push({
            title: 'AI Assist',
            description: `${aiRuns.length} AI runs this session`,
            time: new Date(aiRuns[0]?.created_at).toLocaleTimeString(),
            color: 'bg-cyan-500'
          });
        }
        
        if (threads.length) {
          recentActivities.push({
            title: 'Comms',
            description: `${threads.filter(t => t.status === 'active').length} active threads`,
            time: 'Now',
            color: 'bg-sky-500'
          });
        }

        if (contacts.length) {
          recentActivities.push({
            title: 'CRM',
            description: `${contacts.length} contacts loaded`,
            time: 'Loaded',
            color: 'bg-purple-500'
          });
        }

        setActivities(recentActivities);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const toggleComponent = (component) => {
    setVisibleComponents(prev => ({
      ...prev,
      [component]: !prev[component]
    }));
  };

  const handleQuickAction = async (actionId) => {
    console.log('Quick action:', actionId);
  };

  const handleAddCustomAction = (action) => {
    setCustomActions([...customActions, action]);
  };

  const handleRemoveCustomAction = (id) => {
    setCustomActions(customActions.filter(a => a.id !== id));
  };

  const quickActions = [
    { id: 'new-contact', label: 'Contact', icon: Users, color: 'bg-purple-600 hover:bg-purple-500' },
    { id: 'send-msg', label: 'Message', icon: Send, color: 'bg-sky-600 hover:bg-sky-500' },
    { id: 'new-deal', label: 'Deal', icon: Target, color: 'bg-green-600 hover:bg-green-500' },
    { id: 'brain-seed', label: 'Brain', icon: Brain, color: 'bg-cyan-600 hover:bg-cyan-500' },
  ];

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
      <ModuleHeader
        title="Command Center"
        titleIcon={Activity}
        showTitle={false}
        actions={[
          {
            label: 'Export',
            icon: BarChart3,
            onClick: () => console.log('Export'),
            variant: 'secondary'
          },
        ]}
        showActions={true}
        aiAssistSlot={
          <div className="flex items-center gap-3">
            <AIAssistButton
              onAssist={runDashboardAssist}
              tooltip="Generate AI Insights"
              iconType="crosshair"
            />
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className="p-2 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)]"
              title={isEditMode ? 'Done' : 'Customize'}
            >
              {isEditMode ? <Save size={18} /> : <Grid3x3 size={18} />}
            </button>
          </div>
        }
      />

      {insight && (
        <div className="mx-4 mt-2 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-cyan-200">{insight}</p>
            <button onClick={() => setInsight('')} className="text-cyan-400 hover:text-cyan-200">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
        {isEditMode && (
          <div className="mb-4 flex gap-2 flex-wrap">
            {Object.entries(visibleComponents).map(([key, visible]) => (
              <button
                key={key}
                onClick={() => toggleComponent(key)}
                className={`px-3 py-1 rounded text-xs font-bold uppercase ${visible ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
              >
                {key}: {visible ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
          </div>
        ) : (
          <>
            {visibleComponents.stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard 
                  title="Contacts" 
                  value={stats.contacts} 
                  icon={Users} 
                  color="purple"
                  subtitle="Total in CRM"
                />
                <StatCard 
                  title="Pipeline" 
                  value={stats.pipeline} 
                  icon={Target} 
                  color="green"
                  subtitle="Open deals"
                />
                <StatCard 
                  title="Conversations" 
                  value={stats.comms} 
                  icon={MessageSquare} 
                  color="sky"
                  subtitle="Active threads"
                />
                <StatCard 
                  title="AI Activity" 
                  value={stats.aiRuns} 
                  icon={Brain} 
                  color="cyan"
                  subtitle="Runs this session"
                />
              </div>
            )}

            {visibleComponents.quickActions && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Quick Commands</h3>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {quickActions.map(action => (
                    <QuickActionButton
                      key={action.id}
                      {...action}
                      onClick={handleQuickAction}
                    />
                  ))}
                </div>
              </div>
            )}

            {visibleComponents.charts && chartData.pipeline.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <BarChart 
                  title="Pipeline Stages" 
                  data={chartData.pipeline} 
                  color="var(--color-primary)" 
                />
                <LineChart 
                  title="AI Activity" 
                  data={chartData.aiActivity.length ? chartData.aiActivity : [{ label: 'Mon', value: 0 }, { label: 'Tue', value: 0 }, { label: 'Wed', value: 0 }, { label: 'Thu', value: 0 }, { label: 'Fri', value: 0 }]} 
                  color="#06b6d4" 
                />
              </div>
            )}

            {visibleComponents.timeline && (
              <div className="mb-6">
                <ActivityTimeline activities={activities} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardModule;
