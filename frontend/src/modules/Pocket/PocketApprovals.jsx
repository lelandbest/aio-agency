import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import { PocketService } from '../../services/pocket.service';

export default function PocketApprovals({ onCountChange }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState(null);

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await PocketService.getApprovals();
      const items = res?.data || res || [];
      const list = Array.isArray(items) ? items : [];
      setApprovals(list);
      if (onCountChange) onCountChange(list.length);
    } catch (err) {
      setError(err.message || 'Unable to connect to appliance.');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 10000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const handleAction = async (runId, action, reason = '') => {
    try {
      setProcessingId(runId);
      await PocketService.takeApprovalAction(runId, action, reason);
      setRejectingId(null);
      setRejectReason('');
      await fetchApprovals();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            Execution Approvals
          </h2>
          <p className="text-xs text-zinc-400">
            {approvals.length} action{approvals.length === 1 ? '' : 's'} awaiting operator clearance
          </p>
        </div>
        <button
          onClick={fetchApprovals}
          disabled={loading}
          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition active:scale-95"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="bg-rose-950/50 border border-rose-800/60 p-3 rounded-2xl flex items-center gap-3 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && approvals.length === 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-8 text-center space-y-3 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">All Pipelines Clear</h3>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
            Zero guarded actions currently blocked. Autonomous agents are executing within approved boundaries.
          </p>
        </div>
      )}

      {/* Approval Cards */}
      <div className="space-y-3">
        {approvals.map((item) => {
          const isRejectOpen = rejectingId === item.runId;
          const isBusy = processingId === item.runId;
          const agent = item.assignedAgent || 'ALPHA';

          return (
            <div
              key={item.runId}
              className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 hover:border-amber-500/30 rounded-2xl p-4 shadow-lg space-y-3 transition-all"
            >
              {/* Top Meta */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {agent}
                  </span>
                  <span className="text-zinc-400 font-mono text-[11px] truncate max-w-[120px]">
                    {item.runId}
                  </span>
                </div>
                <span className="text-zinc-500 text-[10px]">
                  {item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                </span>
              </div>

              {/* Command text */}
              <div>
                <p className="text-sm font-medium text-zinc-100 leading-snug">
                  {item.command || 'Autonomous workflow step'}
                </p>
                {item.pauseReason && (
                  <p className="text-xs text-amber-400/90 mt-1 flex items-start gap-1.5 bg-amber-950/30 px-2 py-1 rounded-lg border border-amber-800/30">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{item.pauseReason}</span>
                  </p>
                )}
              </div>

              {/* Staged step parameters excerpt */}
              {item.stagedStep?.parameters && (
                <div className="bg-black/40 rounded-xl p-2 text-[11px] text-zinc-400 font-mono overflow-x-auto border border-zinc-800/50">
                  <span className="text-zinc-500">Action:</span> {item.stagedStep.intent || 'execute'}
                  {Object.entries(item.stagedStep.parameters).map(([k, v]) => (
                    <div key={k} className="truncate">
                      <span className="text-zinc-500">{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </div>
                  ))}
                </div>
              )}

              {/* Reject Reason Inline */}
              {isRejectOpen && (
                <div className="pt-2 space-y-2 border-t border-zinc-800/60">
                  <input
                    type="text"
                    placeholder="Reason for rejection (optional)..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(item.runId, 'reject', rejectReason)}
                      disabled={isBusy}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-semibold rounded-xl transition"
                    >
                      {isBusy ? 'Processing...' : 'Confirm Rejection'}
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-xl"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {!isRejectOpen && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleAction(item.runId, 'approve')}
                    disabled={isBusy}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-950/50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isBusy ? 'Clearing...' : 'Approve & Run'}
                  </button>
                  <button
                    onClick={() => setRejectingId(item.runId)}
                    disabled={isBusy}
                    className="px-4 py-2.5 bg-zinc-800 hover:bg-rose-900/40 hover:text-rose-300 active:scale-95 text-zinc-400 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
