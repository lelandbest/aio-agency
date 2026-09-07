import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Mic,
  ListOrdered,
  Camera,
  LayoutDashboard,
  Calendar,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import PocketApprovals from './PocketApprovals';
import PocketVoice from './PocketVoice';
import PocketCueSheet from './PocketCueSheet';
import PocketCapture from './PocketCapture';
import { PocketService } from '../../services/pocket.service';

export default function PocketPortal({ initialTab = 'brief' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [briefData, setBriefData] = useState(null);
  const [loadingBrief, setLoadingBrief] = useState(true);
  const [approvalsCount, setApprovalsCount] = useState(0);

  const fetchBrief = useCallback(async () => {
    try {
      setLoadingBrief(true);
      const res = await PocketService.getBrief();
      const data = res?.data || res || {};
      setBriefData(data);
      if (typeof data.pendingApprovalsCount === 'number') {
        setApprovalsCount(data.pendingApprovalsCount);
      }
    } catch {
      // Offline / error
    } finally {
      setLoadingBrief(false);
    }
  }, []);

  useEffect(() => {
    fetchBrief();
    const interval = setInterval(fetchBrief, 15000);
    return () => clearInterval(interval);
  }, [fetchBrief]);

  return (
    <div className="bg-zinc-950 text-white min-h-screen flex flex-col font-sans">
      {/* Top Pocket Header */}
      <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
            NX
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none">
              AIO Pocket
            </h1>
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              System Online (Local)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchBrief}
            disabled={loadingBrief}
            className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 active:scale-95 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBrief ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'brief' && (
          <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
            {/* Quick Status Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setActiveTab('approvals')}
                className="bg-gradient-to-br from-amber-950/40 to-zinc-900 border border-amber-800/40 rounded-2xl p-3.5 cursor-pointer active:scale-98 transition shadow-lg space-y-1"
              >
                <div className="flex items-center justify-between text-amber-400">
                  <ShieldAlert className="w-4 h-4" />
                  <span className="font-mono text-xl font-bold">{approvalsCount}</span>
                </div>
                <div className="text-xs font-semibold text-zinc-200">Approvals Required</div>
                <p className="text-[10px] text-zinc-400">Guarded execution pauses</p>
              </div>

              <div
                onClick={() => setActiveTab('cues')}
                className="bg-gradient-to-br from-blue-950/40 to-zinc-900 border border-blue-800/40 rounded-2xl p-3.5 cursor-pointer active:scale-98 transition shadow-lg space-y-1"
              >
                <div className="flex items-center justify-between text-blue-400">
                  <ListOrdered className="w-4 h-4" />
                  <span className="font-mono text-xl font-bold">
                    {briefData?.activeCues?.length || 5}
                  </span>
                </div>
                <div className="text-xs font-semibold text-zinc-200">Run-Of-Show Cues</div>
                <p className="text-[10px] text-zinc-400">Production timeline</p>
              </div>
            </div>

            {/* Today's Schedule Card */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-lg space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  Today's Timeline
                </span>
                <span className="text-zinc-500 font-mono text-[11px]">
                  {briefData?.todayEvents?.length || 0} items
                </span>
              </div>

              {briefData?.todayEvents && briefData.todayEvents.length > 0 ? (
                <div className="space-y-2">
                  {briefData.todayEvents.map((evt, idx) => (
                    <div key={evt.id || idx} className="bg-zinc-800/60 p-2.5 rounded-xl text-xs space-y-0.5 border border-zinc-700/50">
                      <div className="flex justify-between font-medium text-white">
                        <span>{evt.title}</span>
                        <span className="font-mono text-zinc-400 text-[10px]">
                          {evt.startTime ? new Date(evt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      {evt.guestName && (
                        <p className="text-[11px] text-zinc-400">Guest: {evt.guestName}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 text-center py-2">
                  No upcoming meetings or events scheduled for today.
                </p>
              )}
            </div>

            {/* Quick Action Shortcuts */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 px-1">
                Quick Actions
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveTab('voice')}
                  className="p-3 bg-purple-950/40 hover:bg-purple-900/40 border border-purple-800/40 rounded-xl text-left transition active:scale-98 flex items-center gap-2.5"
                >
                  <Mic className="w-5 h-5 text-purple-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-white">Voice Directive</div>
                    <div className="text-[10px] text-zinc-400">Speak to Charlie</div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('capture')}
                  className="p-3 bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-800/40 rounded-xl text-left transition active:scale-98 flex items-center gap-2.5"
                >
                  <Camera className="w-5 h-5 text-indigo-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-white">Capture Ingest</div>
                    <div className="text-[10px] text-zinc-400">Add to Vault</div>
                  </div>
                </button>
              </div>
            </div>

            {/* System Telemetry Badge */}
            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                Local SQLite Storage
              </span>
              <span className="font-mono text-emerald-400 font-semibold">$0.00 Cloud Rent</span>
            </div>
          </div>
        )}

        {activeTab === 'approvals' && (
          <PocketApprovals onCountChange={(c) => setApprovalsCount(c)} />
        )}

        {activeTab === 'voice' && <PocketVoice />}

        {activeTab === 'cues' && <PocketCueSheet />}

        {activeTab === 'capture' && <PocketCapture />}
      </main>

      {/* Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 px-2 py-2 flex items-center justify-around max-w-lg mx-auto">
        <button
          onClick={() => setActiveTab('brief')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
            activeTab === 'brief' ? 'text-purple-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Brief</span>
        </button>

        <button
          onClick={() => setActiveTab('approvals')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl relative transition ${
            activeTab === 'approvals' ? 'text-amber-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <ShieldAlert className="w-5 h-5" />
          {approvalsCount > 0 && (
            <span className="absolute -top-0.5 right-2 w-4 h-4 bg-amber-500 text-black text-[9px] font-black rounded-full flex items-center justify-center">
              {approvalsCount}
            </span>
          )}
          <span className="text-[10px]">Approvals</span>
        </button>

        <button
          onClick={() => setActiveTab('voice')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
            activeTab === 'voice' ? 'text-purple-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-purple-600/30 flex items-center justify-center">
            <Mic className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-[10px]">Voice</span>
        </button>

        <button
          onClick={() => setActiveTab('cues')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
            activeTab === 'cues' ? 'text-yellow-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <ListOrdered className="w-5 h-5" />
          <span className="text-[10px]">Cues</span>
        </button>

        <button
          onClick={() => setActiveTab('capture')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
            activeTab === 'capture' ? 'text-indigo-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[10px]">Capture</span>
        </button>
      </nav>
    </div>
  );
}
