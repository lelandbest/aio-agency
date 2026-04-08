import React, { useState, useEffect, useMemo } from 'react';
import { Phone, RadioTower, Clock3, MessageSquare, Users, Activity, Plus, ArrowLeft, ArrowRight, Settings, Zap, Send, User, X, PhoneCall, PhoneOff, History, Mic, Layers, Settings2, Search, Building2, Tag, FolderOpen } from 'lucide-react';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import { useAIAssist } from '../../contexts/AIAssistContext';

const playMilSimTone = () => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const now = ctx.currentTime;
  
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.connect(clickGain);
  clickGain.connect(ctx.destination);
  clickOsc.frequency.setValueAtTime(1200, now);
  clickOsc.frequency.exponentialRampToValueAtTime(800, now + 0.015);
  clickGain.gain.setValueAtTime(0.25, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  clickOsc.start(now);
  clickOsc.stop(now + 0.02);
  
  const bodyOsc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  bodyOsc.connect(bodyGain);
  bodyGain.connect(ctx.destination);
  bodyOsc.type = 'square';
  bodyOsc.frequency.setValueAtTime(320, now);
  bodyGain.gain.setValueAtTime(0.08, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
  bodyOsc.start(now);
  bodyOsc.stop(now + 0.035);
  
  const noise = ctx.createBufferSource();
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.3;
  }
  noise.buffer = noiseBuffer;
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 2000;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
  noise.start(now);
};

import {
  getCommsOverviewApi,
  getPhoneNumbersApi,
  createPhoneNumberApi,
  updatePhoneNumberApi,
  deletePhoneNumberApi,
  getSmsPlansApi,
  createSmsPlanApi,
  updateSmsPlanApi,
  getExtensionsApi,
  createExtensionApi,
  getRingGroupsApi,
  createRingGroupApi,
  getCallSessionsApi,
  getSmsThreadsApi,
  getSmsThreadApi,
  getSmsMessagesApi,
  sendSmsApi,
  getPhoneNumbersApi as getNumbers,
  getContactsWithPhoneApi,
  startOutboundCallApi,
  endCallSessionApi,
  getCallSessionApi,
  getCommsRoutesApi
} from '../../services/backendApi';

const panelClass = 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5';
const statCardClass = 'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4';
const inputClass = 'w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] text-sm focus:border-[var(--color-primary)] focus:outline-none';
const buttonClass = 'px-4 py-2 rounded-lg font-medium text-sm transition-all';

const CommsOverview = ({ onNavigate }) => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    try {
      const data = await getCommsOverviewApi();
      setOverview(data);
    } catch (e) {
      console.error('Failed to load comms overview:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-[var(--color-text-tertiary)]">Loading...</div>;
  }

  const statusColor = overview?.provider_status === 'connected' ? 'bg-emerald-500/20 text-emerald-300' : 
                      overview?.provider_status === 'stub' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-slate-500/20 text-slate-300';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={statCardClass}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Active Numbers</div>
          <div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{overview?.active_numbers || 0}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">SMS Enabled</div>
          <div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{overview?.sms_enabled_count || 0}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Calls Enabled</div>
          <div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{overview?.calls_enabled_count || 0}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Extensions</div>
          <div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{overview?.active_extensions || 0}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className={panelClass}>
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl bg-[var(--color-bg-secondary)] p-2 text-[var(--color-primary)]">
              <RadioTower size={18} />
            </div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">Provider Status</div>
          </div>
          <div className={`inline-flex px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}>
            {overview?.provider_status || 'unknown'}
          </div>
          <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
            {overview?.provider_status === 'stub' ? 'Running on simulated transport' : 'Provider connection status'}
          </p>
        </div>

        <div className={panelClass}>
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl bg-[var(--color-bg-secondary)] p-2 text-amber-300">
              <Activity size={18} />
            </div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">Recent Activity</div>
          </div>
          <div className="text-2xl font-bold text-[var(--color-text-primary)]">{overview?.recent_threads_count || 0}</div>
          <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">SMS threads (7 days)</div>
          <div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{overview?.recent_calls_count || 0}</div>
          <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">calls (7 days)</div>
        </div>

        <div className={panelClass}>
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl bg-[var(--color-bg-secondary)] p-2 text-sky-300">
              <Zap size={18} />
            </div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">Quick Actions</div>
          </div>
          <div className="space-y-2">
            <button onClick={() => onNavigate('phone-numbers')} className="w-full text-left px-3 py-2 rounded-lg text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition">
              + Add Phone Number
            </button>
            <button onClick={() => onNavigate('sms-plans')} className="w-full text-left px-3 py-2 rounded-lg text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition">
              + Create SMS Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PhoneNumbersPage = ({ onBack }) => {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ number: '', displayLabel: '', owner: '' });

  useEffect(() => {
    loadNumbers();
  }, []);

  const loadNumbers = async () => {
    try {
      const data = await getPhoneNumbersApi();
      setNumbers(data);
    } catch (e) {
      console.error('Failed to load phone numbers:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createPhoneNumberApi(formData);
      setFormData({ number: '', displayLabel: '', owner: '' });
      setShowForm(false);
      loadNumbers();
    } catch (e) {
      console.error('Failed to create phone number:', e);
    }
  };

  const handleToggleSms = async (num) => {
    try {
      await updatePhoneNumberApi(num.id, { smsEnabled: !num.smsEnabled });
      loadNumbers();
    } catch (e) {
      console.error('Failed to update:', e);
    }
  };

  const handleToggleCalls = async (num) => {
    try {
      await updatePhoneNumberApi(num.id, { callsEnabled: !num.callsEnabled });
      loadNumbers();
    } catch (e) {
      console.error('Failed to update:', e);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this phone number?')) return;
    try {
      await deletePhoneNumberApi(id);
      loadNumbers();
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  if (loading) return <div className="p-6 text-[var(--color-text-tertiary)]">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)]">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Phone Numbers</h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">Manage assigned numbers for SMS and calling</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className={`${buttonClass} bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]`}>
          + Add Number
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className={`${panelClass} max-w-md`}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">Phone Number</label>
              <input value={formData.number} onChange={(e) => setFormData({...formData, number: e.target.value})} className={inputClass} placeholder="+1234567890" required />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">Display Label</label>
              <input value={formData.displayLabel} onChange={(e) => setFormData({...formData, displayLabel: e.target.value})} className={inputClass} placeholder="Main Line" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">Owner</label>
              <input value={formData.owner} onChange={(e) => setFormData({...formData, owner: e.target.value})} className={inputClass} placeholder="User or team name" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className={`${buttonClass} bg-[var(--color-primary)] text-[var(--color-on-primary)]`}>Save</button>
              <button type="button" onClick={() => setShowForm(false)} className={`${buttonClass} bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]`}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {numbers.length === 0 ? (
        <div className={`${panelClass} text-center text-[var(--color-text-tertiary)]`}>No phone numbers yet. Add one to get started.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Number</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Label</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">SMS</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Calls</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((num) => (
                <tr key={num.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-hover)]">
                  <td className="py-3 px-4 font-mono text-[var(--color-text-primary)]">{num.number}</td>
                  <td className="py-3 px-4 text-[var(--color-text-secondary)]">{num.displayLabel || '-'}</td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleToggleSms(num)} className={`px-2 py-1 rounded text-[10px] font-medium ${num.smsEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                      {num.smsEnabled ? 'ENABLED' : 'OFF'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleToggleCalls(num)} className={`px-2 py-1 rounded text-[10px] font-medium ${num.callsEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                      {num.callsEnabled ? 'ENABLED' : 'OFF'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleDelete(num.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const SmsPlansPage = ({ onBack }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', brandName: '', campaignType: '' });

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await getSmsPlansApi();
      setPlans(data);
    } catch (e) {
      console.error('Failed to load SMS plans:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createSmsPlanApi(formData);
      setFormData({ name: '', brandName: '', campaignType: '' });
      setShowForm(false);
      loadPlans();
    } catch (e) {
      console.error('Failed to create SMS plan:', e);
    }
  };

  const statusColor = (status) => {
    if (status === 'approved') return 'bg-emerald-500/20 text-emerald-300';
    if (status === 'pending') return 'bg-amber-500/20 text-amber-300';
    if (status === 'rejected') return 'bg-red-500/20 text-red-300';
    return 'bg-slate-500/20 text-slate-400';
  };

  if (loading) return <div className="p-6 text-[var(--color-text-tertiary)]">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)]">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">SMS Plans & Registration</h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">Brand registration and campaign management</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className={`${buttonClass} bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]`}>
          + Create Plan
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className={`${panelClass} max-w-md`}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">Plan Name</label>
              <input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className={inputClass} placeholder="Marketing Campaign" required />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">Brand Name</label>
              <input value={formData.brandName} onChange={(e) => setFormData({...formData, brandName: e.target.value})} className={inputClass} placeholder="Your Company" required />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">Campaign Type</label>
              <input value={formData.campaignType} onChange={(e) => setFormData({...formData, campaignType: e.target.value})} className={inputClass} placeholder="Promotional, Transactional, etc." />
            </div>
            <div className="flex gap-2">
              <button type="submit" className={`${buttonClass} bg-[var(--color-primary)] text-[var(--color-on-primary)]`}>Save</button>
              <button type="button" onClick={() => setShowForm(false)} className={`${buttonClass} bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]`}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {plans.length === 0 ? (
        <div className={`${panelClass} text-center text-[var(--color-text-tertiary)]`}>No SMS plans yet. Create one to get started.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className={panelClass}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-[var(--color-text-primary)]">{plan.name}</h3>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{plan.brandName}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase ${statusColor(plan.registrationStatus)}`}>
                  {plan.registrationStatus || 'pending'}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="text-xs text-[var(--color-primary)] hover:underline">Edit</button>
                <span className="text-[var(--color-text-tertiary)]">|</span>
                <button className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">View Details</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SmsInboxPage = ({ onBack }) => {
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [composeData, setComposeData] = useState({ phoneNumber: '', body: '' });
  const [sending, setSending] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [showNewThread, setShowNewThread] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [threadsData, numbersData, contactsData] = await Promise.all([
        getSmsThreadsApi(100),
        getNumbers(),
        getContactsWithPhoneApi()
      ]);
      setThreads(threadsData);
      setPhoneNumbers(numbersData.filter(n => n.smsEnabled));
      setContacts(contactsData);
    } catch (e) {
      console.error('Failed to load inbox:', e);
    } finally {
      setLoading(false);
    }
  };

  const selectThread = async (thread) => {
    setSelectedThread(thread);
    try {
      const msgs = await getSmsMessagesApi(thread.id);
      setMessages(msgs);
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  };

  const handleSend = async () => {
    if (!composeData.phoneNumber || !composeData.body) return;
    setSending(true);
    try {
      const result = await sendSmsApi({
        phoneNumber: composeData.phoneNumber,
        body: composeData.body,
        fromNumber: phoneNumbers[0]?.number
      });
      if (result.success) {
        setComposeData({ phoneNumber: '', body: '' });
        setShowCompose(false);
        setShowNewThread(false);
        await loadData();
        if (result.thread_id) {
          selectThread({ id: result.thread_id, subject: `SMS with ${composeData.phoneNumber}` });
        }
      } else {
        alert(result.error || 'Failed to send');
      }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 600;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getThreadPreview = (thread) => {
    const recent = threads.find(t => t.id === thread.id);
    return recent?.lastMessageAt ? formatTime(recent.lastMessageAt) : '';
  };

  const statusBadge = (thread) => {
    if (thread.status === 'closed') return 'bg-slate-500/20 text-slate-400';
    if (thread.status === 'archived') return 'bg-amber-500/20 text-amber-400';
    return 'bg-emerald-500/20 text-emerald-300';
  };

  if (loading) return <div className="p-6 text-[var(--color-text-tertiary)]">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)]">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">SMS Inbox</h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">Internal SMS messaging</p>
          </div>
        </div>
        <button onClick={() => setShowNewThread(true)} className={`${buttonClass} bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]`}>
          + New Thread
        </button>
      </div>

      {showNewThread && (
        <div className={`${panelClass} border-amber-500/30`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--color-text-primary)]">New SMS</h3>
            <button onClick={() => setShowNewThread(false)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">To (Phone Number)</label>
              <input 
                value={composeData.phoneNumber} 
                onChange={(e) => setComposeData({...composeData, phoneNumber: e.target.value})} 
                className={inputClass} 
                placeholder="+1234567890" 
              />
              {contacts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {contacts.slice(0, 5).map(c => (
                    <button 
                      key={c.id} 
                      onClick={() => setComposeData({...composeData, phoneNumber: c.phone || ''})}
                      className="px-2 py-1 text-[10px] bg-[var(--color-bg-secondary)] rounded hover:bg-[var(--color-hover)]"
                    >
                      {c.firstName} {c.lastName}: {c.phone}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">Message</label>
              <textarea 
                value={composeData.body} 
                onChange={(e) => setComposeData({...composeData, body: e.target.value})} 
                className={inputClass + ' h-24 resize-none'} 
                placeholder="Type your message..."
              />
            </div>
            {phoneNumbers.length > 0 && (
              <div className="text-xs text-[var(--color-text-tertiary)]">
                From: <span className="font-mono">{phoneNumbers[0].number}</span>
                <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">Simulated</span>
              </div>
            )}
            <button onClick={handleSend} disabled={sending || !composeData.phoneNumber || !composeData.body} className={`${buttonClass} bg-[var(--color-primary)] text-[var(--color-on-primary)] disabled:opacity-50`}>
              {sending ? 'Sending...' : 'Send (Simulated)'}
            </button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 min-h-[500px]">
        <div className={`${panelClass} overflow-hidden flex flex-col`}>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Threads</h3>
          <div className="flex-1 overflow-y-auto space-y-2">
            {threads.length === 0 ? (
              <div className="text-center text-[var(--color-text-tertiary)] py-8 text-sm">No threads yet</div>
            ) : (
              threads.map(thread => (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread)}
                  className={`w-full text-left p-3 rounded-lg border transition ${selectedThread?.id === thread.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-[var(--color-text-primary)]">{thread.subject || thread.id.slice(0, 12)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${statusBadge(thread)}`}>{thread.status || 'open'}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                    {thread.messageCount || 0} messages
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={`${panelClass} md:col-span-2 flex flex-col`}>
          {selectedThread ? (
            <>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--color-border)]">
                <h3 className="font-semibold text-[var(--color-text-primary)]">{selectedThread.subject || 'Thread'}</h3>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">Thread ID: {selectedThread.id.slice(0, 16)}...</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg p-3 ${msg.direction === 'outbound' ? 'bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/30' : 'bg-[var(--color-bg-secondary)] border border-[var(--color-border)]'}`}>
                      <div className="text-xs text-[var(--color-text-tertiary)] mb-1">
                        {msg.direction === 'outbound' ? '→ You sent' : '← Received'}
                      </div>
                      <p className="text-sm text-[var(--color-text-primary)]">{msg.body}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">{formatTime(msg.createdAt)}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded ${msg.deliveryStatus === 'sent' || msg.deliveryStatus === 'simulated' ? 'bg-amber-500/20 text-amber-300' : msg.deliveryStatus === 'delivered' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                          {msg.deliveryStatus || 'pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-center text-[var(--color-text-tertiary)] py-8 text-sm">No messages in this thread</div>
                )}
              </div>
              <div className="border-t border-[var(--color-border)] pt-4">
                <div className="flex gap-2">
                  <input 
                    value={composeData.body} 
                    onChange={(e) => setComposeData({...composeData, body: e.target.value})}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    className={inputClass + ' flex-1'} 
                    placeholder="Type a reply..."
                    disabled={sending}
                  />
                  <button 
                    onClick={handleSend} 
                    disabled={sending || !composeData.body}
                    className={`${buttonClass} bg-[var(--color-primary)] text-[var(--color-on-primary)] disabled:opacity-50`}
                  >
                    <Send size={16} />
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-[var(--color-text-tertiary)] flex items-center gap-2">
                  <span>Using: {phoneNumbers[0]?.number || 'No number configured'}</span>
                  <span className="bg-amber-500/20 text-amber-300 px-1 rounded">Simulated</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--color-text-tertiary)]">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
                <p>Select a thread to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DialerPage = ({ onBack }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [callState, setCallState] = useState('idle');
  const [activeCall, setActiveCall] = useState(null);
  const [routes, setRoutes] = useState({ extensions: [], ringGroups: [], phoneNumbers: [] });
  const [contacts, setContacts] = useState([]);
  const [showContactList, setShowContactList] = useState(false);

  useEffect(() => {
    loadRoutes();
  }, []);

  const loadRoutes = async () => {
    try {
      const [routesData, contactsData, numbersData] = await Promise.all([
        getCommsRoutesApi(),
        getContactsWithPhoneApi(),
        getNumbers()
      ]);
      setRoutes(routesData);
      setContacts(contactsData);
      const enabledNumbers = (numbersData || []).filter(n => n.callsEnabled);
      if (enabledNumbers.length > 0) {
        setFromNumber(enabledNumbers[0].number);
      }
    } catch (e) {
      console.error('Failed to load routes:', e);
    }
  };

  const handleDial = async () => {
    if (!phoneNumber || callState !== 'idle') return;
    setCallState('simulated_ringing');
    try {
      const result = await startOutboundCallApi({
        phoneNumber: phoneNumber,
        fromNumber: fromNumber,
        contactId: contacts.find(c => c.phone === phoneNumber)?.id
      });
      setActiveCall(result);
      
      setTimeout(() => {
        setCallState('simulated_connected');
      }, 2000);
    } catch (e) {
      console.error('Call failed:', e);
      setCallState('failed_stub');
    }
  };

  const handleEndCall = async () => {
    if (!activeCall) return;
    try {
      await endCallSessionApi(activeCall.id, {
        disposition: callState === 'simulated_connected' ? 'completed' : 'no_answer',
        durationSeconds: activeCall.durationSeconds || 30
      });
    } catch (e) {
      console.error('Failed to end call:', e);
    }
    setCallState('ended');
    setTimeout(() => {
      setCallState('idle');
      setActiveCall(null);
    }, 1000);
  };

  const dialPad = ['1','2','3','4','5','6','7','8','9','*','0','#'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">Dialer</div>
        {onBack && (
          <button onClick={onBack} className="p-1 rounded hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)]">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        <input 
          value={phoneNumber} 
          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
          className="w-full px-2 py-1.5 text-center text-sm font-mono rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
          placeholder="Number"
          disabled={callState !== 'idle'}
        />
        
        <div className="grid grid-cols-3 gap-1">
          {dialPad.map(digit => (
            <button
              key={digit}
              onClick={() => { playMilSimTone(); setPhoneNumber(phoneNumber + digit); }}
              disabled={callState !== 'idle'}
              className="py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] text-xs font-mono hover:bg-[var(--color-hover)] disabled:opacity-50"
            >
              {digit}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {callState === 'idle' ? (
            <button 
              onClick={handleDial}
              disabled={!phoneNumber}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition ${phoneNumber ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'}`}
            >
              <PhoneCall size={12} />
              Call
            </button>
          ) : (
            <button 
              onClick={handleEndCall}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30"
            >
              <PhoneOff size={12} />
              End
            </button>
          )}
        </div>
        
        {callState !== 'idle' && (
          <div className="text-[10px] text-center text-amber-300">
            {callState === 'simulated_ringing' ? 'Ringing...' : callState === 'simulated_connected' ? 'Connected' : callState}
          </div>
        )}
      </div>
    </div>
  );
};

const CallHistoryPage = ({ onBack }) => {
  const [calls, setCalls] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCalls();
  }, []);

  const loadCalls = async () => {
    try {
      const data = await getCallSessionsApi(100);
      setCalls(data);
    } catch (e) {
      console.error('Failed to load calls:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const statusBadge = (status) => {
    const map = {
      'initiated': 'bg-slate-500/20 text-slate-400',
      'simulated_ringing': 'bg-amber-500/20 text-amber-300',
      'simulated_connected': 'bg-emerald-500/20 text-emerald-300',
      'ended': 'bg-slate-500/20 text-slate-400',
      'failed_stub': 'bg-red-500/20 text-red-300'
    };
    return map[status] || 'bg-slate-500/20 text-slate-400';
  };

  if (loading) return <div className="p-6 text-[var(--color-text-tertiary)]">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)]">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Call History</h2>
          <p className="text-xs text-[var(--color-text-tertiary)]">Recent calls (simulated)</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 min-h-[500px]">
        <div className={`${panelClass} overflow-hidden flex flex-col`}>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">History</h3>
          <div className="flex-1 overflow-y-auto space-y-2">
            {calls.length === 0 ? (
              <div className="text-center text-[var(--color-text-tertiary)] py-8 text-sm">No call history yet</div>
            ) : (
              calls.map(call => (
                <button
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className={`w-full text-left p-3 rounded-lg border transition ${selectedCall?.id === call.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-medium uppercase ${call.direction === 'outbound' ? 'text-cyan-400' : 'text-amber-400'}`}>
                      {call.direction === 'outbound' ? 'Outgoing' : 'Incoming'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${statusBadge(call.status)}`}>
                      {call.status?.replace('_', ' ') || 'unknown'}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-mono text-[var(--color-text-primary)]">
                    {call.direction === 'outbound' ? call.recipientNumber || call.phoneNumberId : call.senderNumber || 'Unknown'}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                    {formatTime(call.startTime)} • {formatDuration(call.durationSeconds)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={`${panelClass} md:col-span-2`}>
          {selectedCall ? (
            <>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--color-border)]">
                <h3 className="font-semibold text-[var(--color-text-primary)]">Call Details</h3>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">ID: {selectedCall.id.slice(0, 16)}...</span>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Direction</div>
                    <div className="text-sm text-[var(--color-text-primary)]">{selectedCall.direction}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Status</div>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusBadge(selectedCall.status)}`}>
                      {selectedCall.status?.replace('_', ' ') || 'unknown'}
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Started</div>
                    <div className="text-sm text-[var(--color-text-primary)]">{formatTime(selectedCall.startTime)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Duration</div>
                    <div className="text-sm text-[var(--color-text-primary)]">{formatDuration(selectedCall.durationSeconds)}</div>
                  </div>
                </div>

                {selectedCall.disposition && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Disposition</div>
                    <div className="text-sm text-[var(--color-text-primary)]">{selectedCall.disposition}</div>
                  </div>
                )}

                <div className="pt-4 border-t border-[var(--color-border)]">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">Recording / Transcript</div>
                  <div className="text-sm text-[var(--color-text-tertiary)]">
                    {selectedCall.recordingUrl || selectedCall.transcriptUrl ? (
                      <div className="space-y-1">
                        {selectedCall.recordingUrl && <div>Recording available</div>}
                        {selectedCall.transcriptUrl && <div>Transcript available</div>}
                      </div>
                    ) : (
                      <span className="italic">No recording or transcript linked (simulated)</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--color-text-tertiary)]">
              <div className="text-center">
                <History size={48} className="mx-auto mb-4 opacity-30" />
                <p>Select a call to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CommsModule = () => {
  const [view, setView] = useState('overview');

  const handleNavigate = (target) => {
    setView(target);
  };

  return (
    <div className="h-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">SMS / VoIP</div>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">Dispatch</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
              Internal SMS and VoIP system. Currently running on simulated transport.
            </p>
          </div>
          <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-[var(--color-primary)]">
            <Phone size={20} />
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-2">
        <nav className="flex gap-4">
          <button onClick={() => setView('overview')} className={`px-3 py-2 text-sm font-medium transition ${view === 'overview' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}>
            Overview
          </button>
          <button onClick={() => setView('inbox')} className={`px-3 py-2 text-sm font-medium transition ${view === 'inbox' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}>
            SMS
          </button>
          <button onClick={() => setView('dialer')} className={`px-3 py-2 text-sm font-medium transition ${view === 'dialer' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}>
            Dialer
          </button>
          <button onClick={() => setView('history')} className={`px-3 py-2 text-sm font-medium transition ${view === 'history' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}>
            History
          </button>
          <button onClick={() => setView('phone-numbers')} className={`px-3 py-2 text-sm font-medium transition ${view === 'phone-numbers' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}>
            Numbers
          </button>
          <button onClick={() => setView('sms-plans')} className={`px-3 py-2 text-sm font-medium transition ${view === 'sms-plans' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}>
            Plans
          </button>
        </nav>
      </div>

      <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {view === 'overview' && <CommsOverview onNavigate={handleNavigate} />}
        {view === 'inbox' && <SmsInboxPage onBack={() => setView('overview')} />}
        {view === 'phone-numbers' && <PhoneNumbersPage onBack={() => setView('overview')} />}
        {view === 'sms-plans' && <SmsPlansPage onBack={() => setView('overview')} />}
        {view === 'dialer' && <DialerPage onBack={() => setView('overview')} />}
        {view === 'history' && <CallHistoryPage onBack={() => setView('overview')} />}
      </div>
    </div>
  );
};

export default CommsModule;