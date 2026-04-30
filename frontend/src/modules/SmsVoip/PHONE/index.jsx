import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Activity, History, MessageSquare, Phone, PhoneCall, PhoneOff, Plus, RefreshCw, Send, X, RadioTower, Smartphone, Hash, Delete, Cpu, ArrowUp } from 'lucide-react';
import { useNotice } from '../../contexts/NoticeContext';
import ModuleHeader from '../../components/ModuleHeader';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';
import { CommsService } from '../../services/comms.service';

const shellClass = 'h-full min-h-0 overflow-hidden bg-[#050608] text-[var(--color-text-primary)] font-mono';
const machinedSurface = 'bg-[#0a0c12] border border-white/5 shadow-[inset_0_2px_10px_rgba(255,255,255,0.02),0_20px_50px_rgba(0,0,0,0.5)]';
const islandClass = 'rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,29,0.94),rgba(8,10,14,0.98))]';
const cardClass = 'rounded-xl border border-white/8 bg-white/[0.03]';
const displayClass = 'bg-black border border-white/10 shadow-[inset_0_2px_20px_rgba(0,0,0,0.8)] font-mono text-[#06b6d4] drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]';
const inputClass = 'w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)]/45';
const buttonClass = 'rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

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
const liveProviders = ['telnyx', 'twilio'];

function navigate(detail) {
  window.dispatchEvent(new CustomEvent('aio:navigate', { detail }));
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value || 'Unknown';
}

function formatTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelative(value) {
  if (!value) return 'No activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity';
  const delta = Date.now() - date.getTime();
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '--';
  const total = Number(seconds);
  if (!Number.isFinite(total)) return '--';
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatDateShort(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function peerNumber(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.direction === 'inbound' && message.senderNumber) return message.senderNumber;
    if (message.direction === 'outbound' && message.recipientNumber) return message.recipientNumber;
  }
  return '';
}

function byPhone(contacts, number) {
  const normalized = String(number || '').replace(/\D/g, '');
  return contacts.find((contact) => String(contact.phone || '').replace(/\D/g, '') === normalized) || null;
}

function toneClass(tone) {
  if (tone === 'success') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
  if (tone === 'warning') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  return 'border-white/10 bg-white/5 text-slate-200';
}

function normalizeProvider(record) {
  return {
    id: record?.id || '',
    providerType: record?.providerType || '',
    hasConfig: Boolean(record?.hasConfig),
    isActive: Boolean(record?.isActive),
    status: String(record?.status || '').toLowerCase(),
    healthStatus: String(record?.healthStatus || '').toLowerCase(),
  };
}

function providerState(providerType, activeProviderType, configs) {
    const config = configs.find((item) => item.providerType === providerType);
    if (!config) return { label: 'Not Connected', tone: 'neutral', detail: 'No saved config record exists.' };
    
    // Explicit error or unauthorized states
    if (config.healthStatus === 'unhealthy' || config.healthStatus === 'error' || config.status === 'error') {
        return { label: 'Not Verified', tone: 'warning', detail: 'Credentials provided failed verification check.' };
    }
    
    // Config absence
    if (!config.hasConfig || config.status === 'needs_config') {
        return { label: 'Needs Config', tone: 'warning', detail: 'Credentials were not detected on the saved record.' };
    }

    // Active & Verified
    if (config.isActive && activeProviderType === providerType && config.status === 'verified') {
        return { label: 'Activated', tone: 'success', detail: 'This is the verified active transport.' };
    }

    // Configured but either not active or verification pending
    if (config.status === 'verified') {
        return { label: 'Verified', tone: 'neutral', detail: 'Credentials verified, but this provider is not currently active.' };
    }
    
    return { label: 'Configured', tone: 'neutral', detail: 'Credentials saved, but verification status is uncertain.' };
}

function providerFields(providerType) {
  if (providerType === 'telnyx') {
    return [
      { name: 'label', label: 'Connection Label', required: true, defaultValue: 'Telnyx' },
      { name: 'apiKey', label: 'API Key', required: true },
      { name: 'publicApiKey', label: 'Public Key' },
      { name: 'phoneNumber', label: 'Default From Number' },
      { name: 'connectionId', label: 'Connection ID' },
      { name: 'messagingProfileId', label: 'Messaging Profile ID' },
    ];
  }
  return [
    { name: 'label', label: 'Connection Label', required: true, defaultValue: 'Twilio' },
    { name: 'apiKey', label: 'Account SID', required: true },
    { name: 'apiSecret', label: 'Auth Token', required: true, type: 'password' },
    { name: 'phoneNumber', label: 'Default From Number', required: true },
  ];
}

function emptyProviderForm(providerType) {
  return providerFields(providerType).reduce((accumulator, field) => {
    accumulator[field.name] = field.defaultValue || '';
    return accumulator;
  }, {});
}

function providerPayload(form) {
  const mapping = {
    apiKey: 'api_key',
    apiSecret: 'api_secret',
    phoneNumber: 'phone_number',
    publicApiKey: 'public_key',
    connectionId: 'connection_id',
    messagingProfileId: 'messaging_profile_id',
  };
  const payload = {};
  Object.entries(form || {}).forEach(([key, value]) => {
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '' || normalized === null || normalized === undefined) return;
    payload[mapping[key] || key] = normalized;
  });
  return payload;
}

function SectionTitle({ eyebrow, title, detail, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[9px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">{eyebrow}</div>
        <div className="mt-0.5 text-sm font-semibold text-white leading-tight">{title}</div>
        {detail ? <div className="mt-1.5 text-[10px] text-[var(--color-text-secondary)] leading-tight">{detail}</div> : null}
      </div>
      {action}
    </div>
  );
}

function DialerTab({ 
  routes, 
  integrationInfo, 
  contacts, 
  threads, 
  messages, 
  calls, 
  overview,
  selectedThreadId,
  setSelectedThreadId,
  selectedCallId,
  setSelectedCallId,
  replyBody,
  setReplyBody,
  sendSms,
  sendingSms,
  dialer,
  setDialer,
  activeCall,
  setActiveCall,
  callTime,
  startCall,
  endCall,
  numForm,
  setNumForm,
  savingNum,
  attachNumber,
  refreshData
}) {
  const { showNotice } = useNotice();

  const selectedCall = useMemo(() => calls.find(c => c.id === selectedCallId), [calls, selectedCallId]);

  const voiceNumbers = useMemo(() => (routes?.phoneNumbers || []).filter((item) => item.callsEnabled), [routes]);

  const handlePress = (val) => {
    if (activeCall) return;
    setDialer(prev => ({ ...prev, phoneNumber: (prev.phoneNumber + val).slice(0, 15) }));
  };

  const handleBackspace = () => {
    setDialer(prev => ({ ...prev, phoneNumber: prev.phoneNumber.slice(0, -1) }));
  };

  const attachNumberLocal = async (e) => {
    e.preventDefault();
    await attachNumber();
  };

  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.2fr)]">
      <div className="grid grid-cols-2 grid-rows-2 gap-3 min-h-0">
        <div className={`${islandClass} flex flex-col p-4 shadow-xl overflow-hidden`}>
           <SectionTitle eyebrow="Signals" title="SMS Inbox" />
           <div className="mt-4 flex-1 overflow-auto no-scrollbar space-y-2">
              {threads.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                  className={`w-full text-left p-2 rounded-xl border transition-all ${selectedThreadId === t.id ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/5 bg-white/5 hover:border-white/10'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-white tracking-widest">{formatPhone(t.remoteNumber)}</span>
                    <span className="text-[8px] text-slate-500 uppercase">{formatDateShort(t.updatedAt)}</span>
                  </div>
                  <div className="mt-1 text-[9px] text-slate-400 truncate opacity-60 leading-tight">{t.lastMessageBody}</div>
                </button>
              ))}
              {threads.length === 0 && <div className="text-[10px] text-slate-600 italic px-2">No threads.</div>}
           </div>
        </div>

        <div className={`${islandClass} flex flex-col p-4 shadow-xl overflow-hidden`}>
           <SectionTitle eyebrow="Mesh" title="Thread Out" />
           <div className="mt-4 flex-1 overflow-auto no-scrollbar flex flex-col gap-3">
              {messages.map((m, i) => (
                <div key={i} className={`max-w-[90%] p-2 rounded-xl text-[10px] leading-tight ${m.direction === 'outbound' ? 'self-end bg-cyan-500/10 border border-cyan-500/20 text-cyan-100' : 'self-start bg-white/5 border border-white/10 text-slate-300'}`}>
                   {m.body}
                </div>
              ))}
           </div>
           {selectedThreadId && (
              <div className="mt-3 flex gap-1.5 pt-2 border-t border-white/5">
                <input value={replyBody} onChange={e => setReplyBody(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendSms()} placeholder="Reply..." className={`${inputClass} !py-1 flex-1 text-[10px] !bg-black/20`} />
                <button onClick={sendSms} disabled={sendingSms} className="px-2.5 rounded-lg bg-cyan-600 text-white hover:brightness-110 active:scale-95 transition-all"><ArrowUp size={12}/></button>
              </div>
           )}
        </div>

        <div className={`${islandClass} flex flex-col p-4 shadow-xl overflow-hidden`}>
           <SectionTitle eyebrow="Archive" title="Call Log" />
           <div className="mt-4 flex-1 overflow-auto no-scrollbar space-y-2">
              {calls.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCallId(c.id)}
                  className={`w-full text-left p-2 rounded-xl border transition-all ${selectedCallId === c.id ? 'border-amber-500/40 bg-amber-500/10' : 'border-white/5 bg-white/5 hover:border-white/10'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-white tracking-widest">{formatPhone(c.phoneNumber)}</span>
                    <span className={`text-[7px] font-bold px-1 rounded uppercase ${c.direction === 'inbound' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                      {c.direction === 'inbound' ? 'In' : 'Out'}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-[8px] text-slate-500 font-mono">
                    <span>{formatDateShort(c.createdAt)}</span>
                    <span>{formatDuration(c.durationSeconds)}</span>
                  </div>
                </button>
              ))}
              {calls.length === 0 && <div className="text-[10px] text-slate-600 italic px-2">No calls.</div>}
           </div>
        </div>

        <div className={`${islandClass} flex flex-col p-4 shadow-xl overflow-hidden`}>
           <SectionTitle eyebrow="Meta" title="Call Intel" />
           <div className="mt-4 flex-1 overflow-auto no-scrollbar">
              {selectedCall ? (
                <div className="space-y-3">
                   <div className="p-2 bg-black/40 rounded-lg border border-white/5 space-y-1">
                      <div className="text-[8px] text-slate-500 uppercase tracking-widest">Disposition</div>
                      <div className="text-[10px] text-white font-bold">{selectedCall.disposition || 'Connected'}</div>
                   </div>
                   <div className="p-2 bg-black/40 rounded-lg border border-white/5 space-y-1">
                      <div className="text-[8px] text-slate-500 uppercase tracking-widest">Recording Track</div>
                      <div className="text-[9px] text-cyan-400 truncate opacity-60 font-mono leading-none">{selectedCall.recordingUrl || 'Non-encrypted path'}</div>
                   </div>
                   <div className="p-2 bg-white/5 rounded-lg border border-white/5 text-[9px] text-slate-500 italic leading-tight pb-3">
                     No AI transcript generated for this session. Inspect backend event-bridge for raw SIP metadata.
                   </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-[10px] text-slate-600 italic text-center px-4">Select log to inspect session metrics.</div>
              )}
           </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-4">
        <div className={`${machinedSurface} relative overflow-hidden rounded-[2.5rem] p-8 w-full max-w-[390px] shadow-2xl border-white/10 border`}>
          <div className="absolute top-4 left-4 h-2 w-2 rounded-full bg-white/10 shadow-inner" />
          <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-white/10 shadow-inner" />
          <div className="absolute bottom-4 left-4 h-2 w-2 rounded-full bg-white/10 shadow-inner" />
          <div className="absolute bottom-4 right-4 h-2 w-2 rounded-full bg-white/10 shadow-inner" />

          <div className="space-y-6">
            <div className={`${displayClass} rounded-2xl p-5 text-center shadow-[0_0_25px_rgba(6,182,212,0.2)]`}>
              <div className="flex justify-between items-center mb-1 text-[9px] uppercase tracking-[0.2em] opacity-60 font-bold">
                <span className="flex items-center gap-1.5">
                  <RadioTower size={10} className={integrationInfo?.providerStatus === 'stub' ? 'text-amber-500' : 'text-emerald-500'} />
                  {integrationInfo?.providerName || 'Stub'}
                </span>
                <span>{activeCall ? 'Live Session' : 'Ready'}</span>
              </div>
              <div className="text-3xl font-bold tracking-[0.15em] min-h-[2.5rem] flex items-center justify-center">
                {formatPhone(dialer.phoneNumber) || '--- --- ----'}
              </div>
              <div className="mt-2 text-[9px] font-semibold text-cyan-400/60 uppercase tracking-widest flex justify-between px-1">
                <span>{activeCall ? `Time: ${formatDuration(callTime)}` : (dialer.fromNumber ? `From: ${formatPhone(dialer.fromNumber)}` : 'No Line')}</span>
                {activeCall && activeCall.status === 'connected' && <span className="animate-pulse text-emerald-400">Live</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
               <div className="space-y-1">
                  <label className="text-[8px] uppercase tracking-widest text-slate-500 ml-1 font-bold">Line Selection</label>
                  <select 
                    value={dialer.fromNumber} 
                    onChange={e => setDialer(prev => ({ ...prev, fromNumber: e.target.value }))}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 text-[10px] text-cyan-100/80 outline-none focus:border-cyan-500/40"
                    disabled={Boolean(activeCall)}
                  >
                    <option value="">No Line Selected</option>
                    {voiceNumbers.map(n => <option key={n.id} value={n.number}>{formatPhone(n.number)}</option>)}
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[8px] uppercase tracking-widest text-slate-500 ml-1 font-bold">Extension</label>
                  <select 
                    value={dialer.extensionId} 
                    onChange={e => setDialer(prev => ({ ...prev, extensionId: e.target.value }))}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 text-[10px] text-cyan-100/80 outline-none focus:border-cyan-500/40"
                    disabled={Boolean(activeCall)}
                  >
                    <option value="">Local Only</option>
                    {(routes?.extensions || []).map(e => <option key={e.id} value={e.id}>{e.extensionNumber}</option>)}
                  </select>
               </div>
            </div>

            <div className="grid grid-cols-3 gap-5 justify-items-center px-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(val => (
                <MachinedButton 
                  key={val} 
                  onClick={() => handlePress(val)} 
                  disabled={Boolean(activeCall)}
                >
                  <span className="text-xl font-bold">{val}</span>
                  <span className="text-[8px] opacity-30 mt-0.5">
                    {val === '2' && 'ABC'} {val === '3' && 'DEF'}
                    {val === '4' && 'GHI'} {val === '5' && 'JKL'}
                    {val === '6' && 'MNO'}
                    {val === '7' && 'PQRS'} {val === '8' && 'TUV'}
                    {val === '9' && 'WXYZ'}
                  </span>
                </MachinedButton>
              ))}
            </div>

            <div className="flex items-center justify-center gap-8 pt-2">
              <MachinedButton onClick={handleBackspace} disabled={Boolean(activeCall) || !dialer.phoneNumber}>
                <Delete size={18} />
              </MachinedButton>
              
              {activeCall ? (
                <MachinedButton glow="emerald" active={true} onClick={endCall}>
                  <div className="h-16 w-16 rounded-full border border-red-500/40 bg-red-500/10 flex items-center justify-center animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    <PhoneOff className="text-red-400" size={28} />
                  </div>
                </MachinedButton>
              ) : (
                <MachinedButton 
                  glow="emerald" 
                  active={dialer.phoneNumber.length >= 10} 
                  onClick={startCall} 
                  disabled={!dialer.phoneNumber || !dialer.fromNumber || activeProviderType === 'stub' || providerConfigs.find(c => c.providerType === activeProviderType)?.status !== 'verified'}
                >
                  <div className={`h-16 w-16 rounded-full border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center ${dialer.phoneNumber.length >= 10 ? 'animate-pulse' : 'opacity-25'} shadow-[0_0_15px_rgba(16,185,129,0.2)]`}>
                    <PhoneCall className={dialer.phoneNumber.length >= 10 ? 'text-emerald-400' : 'text-slate-500'} size={28} />
                  </div>
                </MachinedButton>
              )}

              <MachinedButton onClick={() => setDialer(prev => ({ ...prev, phoneNumber: '' }))} disabled={Boolean(activeCall) || !dialer.phoneNumber}>
                <RefreshCw size={18} />
              </MachinedButton>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 grid-rows-2 gap-3 min-h-0">
        <div className={`${islandClass} flex flex-col p-4 shadow-xl overflow-hidden`}>
           <SectionTitle eyebrow="Inventory" title="Active Lines" action={<button onClick={refreshData} className="text-slate-500 hover:text-white transition"><RefreshCw size={10}/></button>} />
           <div className="mt-4 flex-1 overflow-auto no-scrollbar space-y-2">
              {(routes?.phoneNumbers || []).map(num => (
                <div key={num.id} className={`${cardClass} p-2 flex justify-between items-center transition hover:border-cyan-500/20`}>
                  <div>
                    <div className="text-[11px] font-bold text-white tracking-widest">{formatPhone(num.number)}</div>
                    <div className="text-[8px] uppercase text-slate-500 leading-none mt-0.5">{num.displayLabel || 'Unlabeled'}</div>
                  </div>
                  <button onClick={() => setDialer(prev => ({ ...prev, fromNumber: num.number }))} className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/5 text-[8px] font-bold uppercase text-slate-400 hover:text-cyan-400 transition-all leading-none">Use</button>
                </div>
              ))}
              {(!routes?.phoneNumbers || routes.phoneNumbers.length === 0) && <div className="text-[10px] text-slate-600 italic px-2">No lines.</div>}
           </div>
        </div>

        <div className={`${islandClass} p-4 shadow-xl flex flex-col`}>
           <SectionTitle eyebrow="Quick Attach" title="New Mapping" />
           <form onSubmit={attachNumberLocal} className="mt-4 space-y-2 flex-1">
              <input value={numForm.number} onChange={e => setNumForm(p => ({ ...p, number: e.target.value }))} className={`${inputClass} !py-1 text-[10px] !bg-black/20`} placeholder="+15551234567" required />
              <input value={numForm.displayLabel} onChange={e => setNumForm(p => ({ ...p, displayLabel: e.target.value }))} className={`${inputClass} !py-1 text-[10px] !bg-black/20`} placeholder="Label" />
              <button type="submit" disabled={savingNum} className="w-full py-1 rounded-lg bg-cyan-600 text-[9px] font-bold uppercase tracking-widest text-white shadow-lg hover:brightness-110 active:scale-95 transition-all">
                {savingNum ? 'Linking...' : 'Register Local Line'}
              </button>
              <div className="mt-1 p-1.5 bg-black/20 rounded-lg border border-white/5">
                <div className="text-[8px] text-slate-500 uppercase tracking-widest">SIP Extensions</div>
                <div className="text-[9px] text-slate-400 font-mono mt-0.5">Found: {(routes?.extensions || []).length}</div>
              </div>
           </form>
        </div>

        <div className={`${islandClass} p-4 shadow-xl`}>
           <SectionTitle eyebrow="Realtime" title="Traffic Totals" />
           <div className="mt-4 grid grid-cols-2 gap-2">
              <div className={`${cardClass} p-2 text-center`}>
                <div className="text-[8px] text-slate-500 uppercase">SMS</div>
                <div className="text-lg font-bold text-white leading-tight">{overview?.recentThreadsCount || 0}</div>
              </div>
              <div className={`${cardClass} p-2 text-center`}>
                <div className="text-[8px] text-slate-500 uppercase">Calls</div>
                <div className="text-lg font-bold text-white leading-tight">{overview?.recentCallsCount || 0}</div>
              </div>
              <div className={`${cardClass} p-2 text-center`}>
                <div className="text-[8px] text-slate-500 uppercase">Exts</div>
                <div className="text-lg font-bold text-white leading-tight">{routes?.extensions?.length || 0}</div>
              </div>
              <div className={`${cardClass} p-2 text-center`}>
                <div className="text-[8px] text-slate-500 uppercase">Groups</div>
                <div className="text-lg font-bold text-white leading-tight">{routes?.ringGroups?.length || 0}</div>
              </div>
           </div>
        </div>

        <div className={`${islandClass} p-4 shadow-xl flex flex-col`}>
           <SectionTitle eyebrow="Authority" title="System Health" />
           <div className="mt-4 space-y-1.5 flex-1">
              <div className="flex justify-between items-center p-1.5 bg-white/5 rounded-lg border border-white/5">
                <span className="text-[9px] text-slate-500">CRM</span>
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">{integrationInfo?.crmIntegration || 'Connected'}</span>
              </div>
              <div className="flex justify-between items-center p-1.5 bg-white/5 rounded-lg border border-white/5">
                <span className="text-[9px] text-slate-500">Signals</span>
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">{integrationInfo?.signalsIntegration || 'Live'}</span>
              </div>
              <div className="flex justify-between items-center p-1.5 bg-white/5 rounded-lg border border-white/5">
                <span className="text-[9px] text-slate-500">Flows</span>
                <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">Ready</span>
              </div>
              <div className="mt-1 p-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-[7px] text-emerald-200/50 uppercase tracking-widest text-center">
                Transport Nominal
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

const tabs = [
  { id: 'dialer', label: 'Operator', icon: Cpu },
];

export default function PhoneModule() {
  const { showNotice } = useNotice();
  const [tab, setTab] = useState('dialer');
  
  // Unified Comms Domain State
  const [integrationInfo, setIntegrationInfo] = useState({});
  const [providerConfigs, setProviderConfigs] = useState([]);
  const [routes, setRoutes] = useState({ extensions: [], ringGroups: [], phoneNumbers: [] });
  const [contacts, setContacts] = useState([]);
  const [overview, setOverview] = useState({});
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [calls, setCalls] = useState([]);
  
  // UI Selection State
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [dialer, setDialer] = useState({ phoneNumber: '', fromNumber: '', extensionId: '' });
  const [activeCall, setActiveCall] = useState(null);
  const [callTime, setCallTime] = useState(0);
  const [numForm, setNumForm] = useState({ number: '', displayLabel: '', owner: '' });
  const [savingNum, setSavingNum] = useState(false);
  const timerRef = useRef(null);

  const loadAll = async () => {
    try {
      const [integration, configs, routesData, contactsData, overviewData, smsData, callData] = await Promise.all([
        CommsService.getCommsIntegrationInfo(),
        CommsService.getCommsProviderConfigs(),
        CommsService.getCommsRoutes(),
        CommsService.getContactsWithPhone(),
        CommsService.getCommsOverview(),
        CommsService.getSmsThreads(50),
        CommsService.getCallSessions(50)
      ]);
      setIntegrationInfo(integration || {});
      setProviderConfigs((configs || []).map(normalizeProvider));
      setRoutes(routesData || { extensions: [], ringGroups: [], phoneNumbers: [] });
      setContacts(contactsData || []);
      setOverview(overviewData || {});
      setThreads(smsData || []);
      setCalls(callData || []);
      
      // Auto-select first number if none selected
      if (!dialer.fromNumber && routesData?.phoneNumbers?.length > 0) {
        setDialer(prev => ({ ...prev, fromNumber: routesData.phoneNumbers[0].number }));
      }
    } catch (e) {
      console.error("Failed to load comms state", e);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedThreadId) {
       CommsService.getSmsMessages(selectedThreadId).then(setMessages).catch(() => setMessages([]));
    } else {
       setMessages([]);
    }
  }, [selectedThreadId]);

  useEffect(() => {
    if (activeCall) {
      timerRef.current = setInterval(() => setCallTime(prev => prev + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setCallTime(0);
    }
    return () => clearInterval(timerRef.current);
  }, [activeCall]);

  const sendSms = async () => {
    if (!selectedThreadId || !replyBody.trim()) return;
    setSendingSms(true);
    try {
      await CommsService.sendSms({ threadId: selectedThreadId, body: replyBody.trim() });
      setReplyBody('');
      const updated = await CommsService.getSmsMessages(selectedThreadId);
      setMessages(updated);
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Failed to send SMS.' });
    } finally {
      setSendingSms(false);
    }
  };

  const callPollRef = useRef(null);

  const startCall = async () => {
    if (!dialer.phoneNumber.trim()) return;
    try {
      const contact = contacts.find(c => c.phone === dialer.phoneNumber);
      const result = await CommsService.startOutboundCall({ 
        phoneNumber: dialer.phoneNumber.trim(), 
        fromNumber: dialer.fromNumber || '', 
        contactId: contact?.id || null, 
        extensionId: dialer.extensionId || null 
      });
      setActiveCall(result);
      showNotice({ type: 'success', message: `Call initiated. Status: ${result.status || 'unknown'}` });

      if (result.id && result.status !== 'ended' && result.status !== 'failed') {
        callPollRef.current = setInterval(async () => {
          try {
            const session = await CommsService.getCallSession(result.id);
            if (session) {
              setActiveCall(prev => prev ? { ...prev, ...session } : null);
              if (session.status === 'ended' || session.status === 'failed') {
                clearInterval(callPollRef.current);
                callPollRef.current = null;
              }
            }
          } catch { clearInterval(callPollRef.current); callPollRef.current = null; }
        }, 2000);
      }
    } catch (error) {
      setActiveCall(null);
      showNotice({ type: 'error', message: error.message || 'Unable to start outbound call.' });
    }
  };

  const endCall = async () => {
    if (!activeCall?.id) return;
    if (callPollRef.current) { clearInterval(callPollRef.current); callPollRef.current = null; }
    try {
      await CommsService.endCallSession(activeCall.id, { disposition: 'completed', durationSeconds: callTime });
      setActiveCall(null);
      showNotice({ type: 'success', message: 'Session ended.' });
      loadAll();
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to end call session.' });
    }
  };

  const attachNumber = async () => {
    if (!numForm.number.trim()) return;
    setSavingNum(true);
    try {
      await CommsService.createPhoneNumber({ number: numForm.number.trim(), displayLabel: numForm.displayLabel.trim(), owner: numForm.owner.trim() });
      setNumForm({ number: '', displayLabel: '', owner: '' });
      await loadAll();
      showNotice({ type: 'success', message: 'Number registered.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Failed to attach number.' });
    } finally {
      setSavingNum(false);
    }
  };

  const activateProvider = async (providerType) => {
    const config = providerConfigs.find(c => c.providerType === providerType);
    if (!config || !config.hasConfig) {
      showNotice({ type: 'warning', message: `Please configure ${providerType} in Integrations first.` });
      return;
    }
    try {
      const result = await CommsService.saveCommsProviderConfig(providerType, {}, true);
      await loadAll();
      
      if (result.status === 'verified') {
        showNotice({ type: 'success', message: `${providerType.charAt(0).toUpperCase() + providerType.slice(1)} activated and verified.` });
      } else {
        showNotice({ type: 'warning', message: `${providerType.charAt(0).toUpperCase() + providerType.slice(1)} saved, but verification failed: ${result.message || 'unknown error'}` });
      }
    } catch (e) {
      showNotice({ type: 'error', message: 'Failed to switch provider.' });
    }
  };

  const activeProviderType = integrationInfo.providerStatus && integrationInfo.providerStatus !== 'stub'
    ? integrationInfo.providerStatus
    : providerConfigs.find((config) => config.isActive)?.providerType || 'stub';

  const telnyxState = providerState('telnyx', activeProviderType, providerConfigs);
  const twilioState = providerState('twilio', activeProviderType, providerConfigs);

  return (
    <div className={shellClass}>
      <ModuleHeader
        showTitle={false}
        leftActions={[
          { label: 'Comms', onClick: () => navigate({ module: 'comms' }), variant: 'secondary' }
        ]}
        actions={[
          { label: 'Integrations', onClick: () => navigate({ module: 'integrations', integrationCategory: 'communications' }), variant: 'primary' }
        ]}
        toolbarCenterSlot={(
          <div className="flex items-center gap-6">
            <div className="flex items-center justify-center gap-1.5">
              {tabs.map((entry) => {
                const Icon = entry.icon;
                const active = entry.id === tab;
                return (
                  <button
                    key={entry.id}
                    onClick={() => setTab(entry.id)}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all
                      ${active ? 'border-cyan-500/40 bg-cyan-500/10 text-white shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-white/5 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10'}
                    `}
                  >
                    <Icon size={12} />
                    {entry.label}
                  </button>
                );
              })}
            </div>

            {/* Status Pills - NOW FUNCTIONAL */}
            <div className="flex items-center gap-2 border-l border-white/5 pl-6">
               <button 
                 onClick={() => activateProvider('telnyx')}
                 className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95 ${toneClass(telnyxState.tone)} ${telnyxState.tone === 'muted' ? 'opacity-40 hover:opacity-100' : ''}`}
                 title={telnyxState.tone === 'muted' ? 'Click to activate' : 'Currently Active'}
               >
                 <RadioTower size={10} />
                 Telnyx: {telnyxState.label}
               </button>
               <button 
                 onClick={() => activateProvider('twilio')}
                 className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95 ${toneClass(twilioState.tone)} ${twilioState.tone === 'muted' ? 'opacity-40 hover:opacity-100' : ''}`}
                 title={twilioState.tone === 'muted' ? 'Click to activate' : 'Currently Active'}
               >
                 <Smartphone size={10} />
                 Twilio: {twilioState.label}
               </button>
            </div>
          </div>
        )}
      />

<style>{`
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`}</style>
<div className="flex-1 overflow-auto p-2 custom-scrollbar">
  <DialerTab 
    routes={routes}
    integrationInfo={integrationInfo}
    contacts={contacts}
    threads={threads}
    messages={messages}
    calls={calls}
    overview={overview}
    selectedThreadId={selectedThreadId}
    setSelectedThreadId={setSelectedThreadId}
    selectedCallId={selectedCallId}
    setSelectedCallId={setSelectedCallId}
    replyBody={replyBody}
    setReplyBody={setReplyBody}
    sendSms={sendSms}
    sendingSms={sendingSms}
    dialer={dialer}
    setDialer={setDialer}
    activeCall={activeCall}
    setActiveCall={setActiveCall}
    callTime={callTime}
    startCall={startCall}
    endCall={endCall}
    numForm={numForm}
    setNumForm={setNumForm}
    savingNum={savingNum}
    attachNumber={attachNumber}
    refreshData={loadAll}
  />
</div>
    </div>
  );
}
