import React, { useEffect, useMemo, useState, useRef } from 'react';
import { 
  Activity, History, MessageSquare, Phone, PhoneCall, PhoneOff, 
  Plus, RefreshCw, Send, X, RadioTower, Smartphone,
  Hash, Delete
} from 'lucide-react';
import { useNotice } from '../../contexts/NoticeContext';
import ModuleHeader from '../../components/ModuleHeader';
import {
  endCallSessionApi,
  getCallSessionsApi,
  getCommsIntegrationInfoApi,
  getCommsRoutesApi,
  getContactsWithPhoneApi,
  getSmsThreadsApi,
  startOutboundCallApi,
} from '../../services/backendApi';

// --- STYLING TOKENS (MACHINED APPLIANCE AESTHETIC) ---
const shellClass = 'h-full min-h-0 overflow-hidden bg-[#050608] text-[var(--color-text-primary)] font-mono';
const machinedSurface = 'bg-[#0a0c12] border border-white/5 shadow-[inset_0_2px_10px_rgba(255,255,255,0.02),0_20px_50px_rgba(0,0,0,0.5)]';
const islandClass = 'rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,29,0.94),rgba(8,10,14,0.98))]';
const displayClass = 'bg-black border border-white/10 shadow-[inset_0_2px_20px_rgba(0,0,0,0.8)] font-mono text-[#06b6d4] drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]';

// --- HELPERS ---
function navigate(detail) {
  window.dispatchEvent(new CustomEvent('aio:navigate', { detail }));
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value || '';
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '0:00';
  const total = Number(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const MachinedButton = ({ children, onClick, active, disabled, variant = 'number', glow = 'cyan' }) => {
  const glowShadow = glow === 'emerald' ? 'var(--color-success-glow)' : 'var(--color-primary-glow)';
  const activeColor = glow === 'emerald' ? 'rgba(16,185,129,0.2)' : 'rgba(6,182,212,0.2)';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex items-center justify-center transition-all duration-75 active:scale-95 active:translate-y-0.5
        ${variant === 'action' ? 'h-14 w-14 rounded-full' : 'h-16 w-16 rounded-[1.2rem]'}
        ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:brightness-110'}
      `}
      style={{
        background: active 
          ? `linear-gradient(135deg, ${activeColor} 0%, #0d0f14 100%)` 
          : 'linear-gradient(135deg, #1e242e 0%, #090b0f 100%)',
        boxShadow: active
          ? `0 0 20px ${glowShadow}, inset 0 2px 4px rgba(0,0,0,0.8)`
          : '5px 5px 12px rgba(0,0,0,0.6), inset 1px 1px 2px rgba(255,255,255,0.08)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        borderLeft: '1px solid rgba(255,255,255,0.06)'
      }}
    >
      <div className={`flex flex-col items-center justify-center ${active ? (glow === 'emerald' ? 'text-emerald-400' : 'text-cyan-400') : 'text-slate-300'}`}>
        {children}
      </div>
      <div className="absolute top-1.5 left-1.5 h-1 w-1 rounded-full bg-white/5 shadow-inner" />
    </button>
  );
};

// --- DIALER TAB ---
function DialerTab({ routes, providerInfo, contacts }) {
  const { showNotice } = useNotice();
  const [number, setNumber] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [extensionId, setExtensionId] = useState('');
  const [pending, setPending] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [callTime, setCallTime] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (activeCall) {
      timerRef.current = setInterval(() => setCallTime(prev => prev + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setCallTime(0);
    }
    return () => clearInterval(timerRef.current);
  }, [activeCall]);

  const voiceNumbers = useMemo(() => {
    return (routes?.phoneNumbers || []).filter(n => n.callsEnabled);
  }, [routes]);
  
  useEffect(() => {
    if (voiceNumbers.length > 0 && !fromNumber) {
      setFromNumber(voiceNumbers[0].number);
    }
  }, [voiceNumbers, fromNumber]);

  const handlePress = (val) => {
    if (activeCall) return;
    setNumber(prev => (prev + val).slice(0, 15));
  };

  const handleBackspace = () => {
    setNumber(prev => prev.slice(0, -1));
  };

  const startCall = async () => {
    if (!number.trim() || pending) return;
    setPending(true);
    try {
      const contact = contacts.find(c => String(c.phone || '').replace(/\D/g, '') === number.replace(/\D/g, ''));
      const result = await startOutboundCallApi({
        phoneNumber: number.trim(),
        fromNumber: fromNumber || '',
        contactId: contact?.id || null,
        extensionId: extensionId || null
      });
      setActiveCall(result);
      showNotice({ 
        type: providerInfo?.providerStatus === 'stub' ? 'info' : 'success', 
        message: 'Outbound request initiated.' 
      });
    } catch (e) {
      showNotice({ type: 'error', message: e.message });
    } finally {
      setPending(false);
    }
  };

  const endCall = async () => {
    if (!activeCall?.id || pending) return;
    setPending(true);
    try {
      await endCallSessionApi(activeCall.id, { disposition: 'completed', durationSeconds: callTime });
      setActiveCall(null);
      showNotice({ type: 'success', message: 'Call session ended.' });
    } catch (e) {
      showNotice({ type: 'error', message: e.message });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className={`${machinedSurface} relative overflow-hidden rounded-[2.5rem] p-10 max-w-md w-full`}>
        {/* Bolt decorations */}
        <div className="absolute top-4 left-4 h-2 w-2 rounded-full bg-white/10 shadow-inner" />
        <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-white/10 shadow-inner" />
        <div className="absolute bottom-4 left-4 h-2 w-2 rounded-full bg-white/10 shadow-inner" />
        <div className="absolute bottom-4 right-4 h-2 w-2 rounded-full bg-white/10 shadow-inner" />

        <div className="space-y-8">
          {/* Status Display */}
          <div className={`${displayClass} rounded-2xl p-6 text-center`}>
            <div className="flex justify-between items-center mb-1 text-[10px] uppercase tracking-[0.2em] opacity-60">
              <span className="flex items-center gap-1.5">
                <RadioTower size={10} className={providerInfo?.providerStatus === 'stub' ? 'text-amber-500' : 'text-emerald-500'} />
                {providerInfo?.providerName || 'Stub'}
              </span>
              <span>{activeCall ? 'Live Session' : 'Ready'}</span>
            </div>
            <div className="text-3xl font-bold tracking-widest min-h-[2.5rem] flex items-center justify-center">
              {formatPhone(number) || '--- --- ----'}
            </div>
            <div className="mt-2 text-[10px] font-semibold text-cyan-400/60 uppercase tracking-widest">
              {activeCall ? `Duration: ${formatDuration(callTime)}` : (fromNumber ? `From: ${formatPhone(fromNumber)}` : 'Select Line')}
            </div>
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-2 gap-3">
             <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-slate-500 ml-1">Line Selection</label>
                <select 
                  value={fromNumber} 
                  onChange={e => setFromNumber(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-cyan-100/80 outline-none focus:border-cyan-500/40"
                  disabled={Boolean(activeCall)}
                >
                  <option value="">No Line Selected</option>
                  {voiceNumbers.map(n => <option key={n.id} value={n.number}>{formatPhone(n.number)}</option>)}
                </select>
             </div>
             <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-slate-500 ml-1">Extension</label>
                <select 
                  value={extensionId} 
                  onChange={e => setExtensionId(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-cyan-100/80 outline-none focus:border-cyan-500/40"
                  disabled={Boolean(activeCall)}
                >
                  <option value="">Local Only</option>
                  {(routes?.extensions || []).map(e => <option key={e.id} value={e.id}>{e.extensionNumber}</option>)}
                </select>
             </div>
          </div>

          {/* Dialpad Grid */}
          <div className="grid grid-cols-3 gap-6 justify-items-center">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(val => (
              <MachinedButton 
                key={val} 
                onClick={() => handlePress(val)} 
                disabled={Boolean(activeCall)}
              >
                <span className="text-2xl font-bold">{val}</span>
                <span className="text-[9px] opacity-40 mt-0.5">
                  {val === '2' && 'ABC'}
                  {val === '3' && 'DEF'}
                  {val === '4' && 'GHI'}
                  {val === '5' && 'JKL'}
                  {val === '6' && 'MNO'}
                  {val === '7' && 'PQRS'}
                  {val === '8' && 'TUV'}
                  {val === '9' && 'WXYZ'}
                </span>
              </MachinedButton>
            ))}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-center gap-10">
            <MachinedButton onClick={handleBackspace} disabled={Boolean(activeCall) || !number}>
              <Delete size={20} />
            </MachinedButton>
            
            {activeCall ? (
              <MachinedButton glow="emerald" active={true} onClick={endCall}>
                <div className="h-20 w-20 rounded-full border border-red-500/40 bg-red-500/10 flex items-center justify-center animate-pulse">
                  <PhoneOff className="text-red-400" size={32} />
                </div>
              </MachinedButton>
            ) : (
              <MachinedButton glow="emerald" active={number.length >= 10} onClick={startCall} disabled={!number || !fromNumber}>
                <div className={`h-20 w-20 rounded-full border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center ${number.length >= 10 ? 'animate-pulse' : 'opacity-40'}`}>
                  <PhoneCall className={number.length >= 10 ? 'text-emerald-400' : 'text-slate-500'} size={32} />
                </div>
              </MachinedButton>
            )}

            <MachinedButton onClick={() => setNumber('')} disabled={Boolean(activeCall) || !number}>
              <RefreshCw size={20} />
            </MachinedButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- MAIN WRAPPER ---
export default function CommsReviewModule() {
  const { showNotice } = useNotice();
  const [tab, setTab] = useState('dialer');
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState({ extensions: [], ringGroups: [], phoneNumbers: [] });
  const [contacts, setContacts] = useState([]);
  const [providerInfo, setProviderInfo] = useState({});
  const [threads, setThreads] = useState([]);
  const [calls, setCalls] = useState([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [r, c, i, t, h] = await Promise.all([
        getCommsRoutesApi(),
        getContactsWithPhoneApi(),
        getCommsIntegrationInfoApi(),
        getSmsThreadsApi(50),
        getCallSessionsApi(50)
      ]);
      setRoutes(r || { extensions: [], ringGroups: [], phoneNumbers: [] });
      setContacts(c || []);
      setProviderInfo(i || {});
      setThreads(t || []);
      setCalls(h || []);
    } catch (e) {
      showNotice({ type: 'warning', message: 'Sync limited: check active transports.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const menuItems = [
    { id: 'dialer', label: 'Dialer', icon: PhoneCall },
    { id: 'inbox', label: 'SMS', icon: MessageSquare },
    { id: 'history', label: 'History', icon: History },
    { id: 'numbers', label: 'Lines', icon: Hash },
    { id: 'overview', label: 'Dashboard', icon: Activity },
  ];

  return (
    <div className={shellClass}>
      <ModuleHeader 
        showTitle={false}
        toolbarCenterSlot={(
          <div className="flex items-center gap-1.5">
            {menuItems.map(item => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all
                    ${active ? 'border-cyan-500/40 bg-cyan-500/10 text-white shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-white/5 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10'}
                  `}
                >
                  <Icon size={12} />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
        actions={[
          { label: 'Sync Layout', onClick: loadAll, variant: 'primary' }
        ]}
      />

      <div className="h-full overflow-auto p-4 custom-scrollbar">
        {loading && <div className="flex h-full items-center justify-center text-cyan-500/40 animate-pulse font-mono tracking-widest text-xs">REVIEWING COMMS CONTROL LAYER...</div>}
        
        {!loading && tab === 'dialer' && <DialerTab routes={routes} providerInfo={providerInfo} contacts={contacts} />}
        
        {!loading && tab === 'inbox' && (
           <div className="grid h-full grid-cols-[320px_1fr] gap-4">
              <div className={`${islandClass} p-4 overflow-hidden flex flex-col`}>
                 <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-4 px-2">Conversations</div>
                 <div className="flex-1 overflow-auto space-y-2 px-2 scrollbar-hide">
                    {threads.map(t => (
                       <button key={t.id} className="w-full text-left p-3 rounded-xl border border-white/5 bg-white/5 hover:border-cyan-500/30 transition-all group">
                          <div className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">{t.subject || 'Thread'}</div>
                          <div className="text-[10px] text-slate-500 mt-1">{t.messageCount} messages</div>
                       </button>
                    ))}
                 </div>
              </div>
              <div className={`${islandClass} flex flex-col p-8 items-center justify-center text-slate-600`}>
                 <MessageSquare size={48} className="opacity-20 mb-4" />
                 <div className="text-sm font-bold uppercase tracking-widest opacity-40">Surface Detail (Review Mode)</div>
              </div>
           </div>
        )}

        {!loading && tab === 'history' && (
           <div className={`${islandClass} p-6`}>
              <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-6">Master Call Log</div>
              <div className="space-y-3">
                 {calls.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                       <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                             {c.direction === 'outbound' ? <PhoneCall size={16} className="text-emerald-500" /> : <Smartphone size={16} className="text-cyan-500" />}
                          </div>
                          <div>
                             <div className="text-sm font-bold text-white uppercase tracking-wider">{c.direction === 'outbound' ? 'Outbound Session' : 'Inbound Capture'}</div>
                             <div className="text-[10px] text-slate-500 mt-0.5">{new Date(c.startTime).toLocaleString()}</div>
                          </div>
                       </div>
                       <div className="text-right">
                          <div className="text-xs font-mono text-cyan-400">{formatDuration(c.durationSeconds)}</div>
                          <div className="text-[9px] uppercase tracking-widest text-slate-600 mt-0.5">{c.status}</div>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {!loading && tab === 'numbers' && (
           <div className="max-w-4xl mx-auto space-y-4">
              <div className={`${islandClass} p-8`}>
                 <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-4">Line Inventory</div>
                 <div className="grid gap-4 sm:grid-cols-2">
                    {routes?.phoneNumbers?.map(n => (
                       <div key={n.id} className="p-5 rounded-2xl border border-white/5 bg-white/5 relative overflow-hidden group">
                          <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/20 group-hover:bg-cyan-500 transition-all" />
                          <div className="text-xl font-bold text-white tracking-widest mb-1">{formatPhone(n.number)}</div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-500">{n.displayLabel || 'Primary Line'}</div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        )}

        {!loading && tab === 'overview' && (
           <div className="flex h-full items-center justify-center opacity-40 flex-col gap-4 py-20">
              <RadioTower size={64} strokeWidth={1} />
              <div className="text-xs uppercase tracking-[0.4em] font-bold">Review Mode: Surface Monitoring</div>
              <div className="text-[10px] text-slate-600 max-w-xs text-center leading-loose">This is a sandbox module for design verification. Logic is fully connected to the active Comms transport.</div>
           </div>
        )}
      </div>
    </div>
  );
}
