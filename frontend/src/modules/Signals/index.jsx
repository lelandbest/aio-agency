import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, MessageSquare, Zap, X, 
  BarChart3, Activity, Brain, Target, Send, 
  Save, Grid3x3, RefreshCw, FileText
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';
import { assistAiApi, getAiRunsApi, getCommsSnapshotApi, getContactsApi } from '../../services/backendApi';

const PulseCard = ({ title, value, icon: Icon, color = 'purple', live = false }) => {
  const colorClass = {
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
    sky: 'text-sky-400',
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
  }[color] || 'text-purple-400';

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--color-bg-tertiary)]/50 rounded-lg border border-[var(--color-border)]">
      <div className={`${colorClass}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">{title}</p>
        <p className="text-lg font-bold text-[var(--color-text-primary)]">{value}</p>
      </div>
      {live && (
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Live" />
      )}
    </div>
  );
};

const PulseBand = ({ stats, loading }) => {
  const [timestamp, setTimestamp] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTimestamp(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-sky-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Pulse</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-[var(--color-bg-tertiary)] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-sky-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Pulse</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-[var(--color-text-tertiary)]">
          <RefreshCw size={10} />
          <span>Updated {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PulseCard title="Contacts" value={stats.contacts} icon={Users} color="purple" live={false} />
        <PulseCard title="Pipeline" value={stats.pipeline} icon={Target} color="green" live={true} />
        <PulseCard title="Threads" value={stats.comms} icon={MessageSquare} color="sky" live={true} />
        <PulseCard title="AI Runs" value={stats.aiRuns} icon={Brain} color="cyan" live={false} />
      </div>
    </div>
  );
};

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

const ActivityTimeline = ({ activities }) => {
  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
      <h3 className="text-sm font-bold text-gray-400 mb-4">Recent Signals</h3>
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
          <p className="text-sm text-gray-500">No recent signals</p>
        )}
      </div>
    </div>
  );
};

const SignalsModule = () => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [visibleComponents, setVisibleComponents] = useState({
    stats: true,
    charts: true,
    timeline: true,
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
        module: 'signals',
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
    const loadSignalsData = async () => {
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
            title: 'AI Activity',
            description: `${aiRuns.length} runs this session`,
            time: new Date(aiRuns[0]?.created_at).toLocaleTimeString(),
            color: 'bg-cyan-500'
          });
        }
        
        if (threads.length) {
          recentActivities.push({
            title: 'Conversations',
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
        console.error('Signals load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSignalsData();
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

  const quickActions = [
    { id: 'new-contact', label: 'New Contact', icon: Users },
    { id: 'send-msg', label: 'Send Message', icon: Send },
    { id: 'new-deal', label: 'New Deal', icon: Target },
    { id: 'brain-seed', label: 'Seed Brain', icon: Brain },
    { id: 'new-form', label: 'Create Form', icon: FileText },
    { id: 'new-flow', label: 'Create Flow', icon: Zap },
  ];

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {quickActions.map(action => (
            <button
              key={action.id}
              onClick={() => handleQuickAction(action.id)}
              className="w-8 h-8 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center transition"
              title={action.label}
            >
              <action.icon size={16} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => console.log('Export')}
            className="px-3 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)] rounded-lg text-sm font-medium flex items-center gap-2 transition"
          >
            <BarChart3 size={14} />
            Export
          </button>
          <AIAssistButton
            onAssist={runDashboardAssist}
            tooltip="Generate AI Insights"
            iconType="crosshair"
          />
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className="w-8 h-8 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center transition"
            title={isEditMode ? 'Done' : 'Customize'}
          >
            {isEditMode ? <Save size={16} /> : <Grid3x3 size={16} />}
          </button>
        </div>
      </div>

      <PulseBand stats={stats} loading={loading} />

      {insight && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Key Signals & Charts */}
            <div>
              {visibleComponents.charts && chartData.pipeline.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-4">Key Signals</h2>
                  <div className="space-y-4">
                    <BarChart 
                      title="Funnel Movement" 
                      data={chartData.pipeline} 
                      color="var(--color-primary)" 
                    />
                    <LineChart 
                      title="AI Activity" 
                      data={chartData.aiActivity.length ? chartData.aiActivity : [{ label: 'Mon', value: 0 }, { label: 'Tue', value: 0 }, { label: 'Wed', value: 0 }, { label: 'Thu', value: 0 }, { label: 'Fri', value: 0 }]} 
                      color="#06b6d4" 
                    />
                  </div>
                </div>
              )}

            </div>

            {/* Right Column - Recent Activity */}
            <div>
              {visibleComponents.timeline && (
                <div className="mb-6">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-4">Recent Activity</h2>
                  <ActivityTimeline activities={activities} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalsModule;
