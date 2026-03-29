import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useSignal } from '../contexts/SignalContext';


const ICON_MAP = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  critical: AlertCircle,
  info: Info,
};

const STYLE_MAP = {
  success: 'bg-green-500/10 border-green-500/20 text-green-400',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  error: 'bg-red-500/10 border-red-500/20 text-red-400',
  critical: 'bg-red-600/20 border-red-500/30 text-red-300',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
};

const StatusItem = ({ signal, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);
  const Icon = ICON_MAP[signal.type] || Info;
  const canDismiss = signal.type === 'warning' || signal.type === 'error' || signal.type === 'critical';

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm text-xs font-medium
        transition-all duration-200 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
        ${STYLE_MAP[signal.type] || STYLE_MAP.info}
      `}
    >
      <Icon size={14} className="flex-shrink-0" />
      <span className="flex-1 min-w-0 truncate">{signal.message}</span>
      {canDismiss && (
        <button
          onClick={() => onDismiss(signal.id)}
          className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 transition"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};

export default function StatusBar() {
  const { signals, removeSignal } = useSignal();

  if (signals.length === 0) {
    return null;
  }

  // Group by type for priority display
  const warnings = signals.filter(s => s.type === 'warning');
  const errors = signals.filter(s => s.type === 'error' || s.type === 'critical');
  const success = signals.filter(s => s.type === 'success');
  const info = signals.filter(s => s.type === 'info');

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {errors.map(s => <StatusItem key={s.id} signal={s} onDismiss={removeSignal} />)}
      {warnings.map(s => <StatusItem key={s.id} signal={s} onDismiss={removeSignal} />)}
      {success.map(s => <StatusItem key={s.id} signal={s} onDismiss={removeSignal} />)}
      {info.map(s => <StatusItem key={s.id} signal={s} onDismiss={removeSignal} />)}
    </div>
  );
}
