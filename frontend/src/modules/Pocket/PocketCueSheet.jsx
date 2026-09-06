import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react';
import { PocketService } from '../../services/pocket.service';

export default function PocketCueSheet() {
  const [cues, setCues] = useState([]);
  const [currentCueIndex, setCurrentCueIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timerActive, setTimerActive] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const timerRef = useRef(null);

  const fetchCues = useCallback(async () => {
    try {
      setLoading(true);
      const res = await PocketService.getCues();
      const data = res?.data || res || [];
      if (Array.isArray(data) && data.length > 0) {
        setCues(data);
        return;
      }
    } catch {
      // Fall through to default production schedule
    } finally {
      setLoading(false);
    }

    // Default production run-of-show schedule if none loaded
    setCues([
      { id: 'CUE-01', time: '00:00', duration: '02:00', title: 'Pre-Show Countdown & Bed', talent: 'Playback Encoders', techAction: 'Roll VT Countdown, Bed audio at -12dB', status: 'ready' },
      { id: 'CUE-02', time: '02:00', duration: '05:00', title: 'Host Opening & Welcome', talent: 'Lead Host', techAction: 'Cam 1 Wide, Mic 1 Live, Graphic: Host Name', status: 'pending' },
      { id: 'CUE-03', time: '07:00', duration: '20:00', title: 'Keynote Presentation & Slides', talent: 'Guest Speaker', techAction: 'Cam 2 Tight, Slide PIP right, Lower third', status: 'pending' },
      { id: 'CUE-04', time: '27:00', duration: '10:00', title: 'Audience Q&A', talent: 'Host & Guest', techAction: 'Cam 3 Roving Mic, 2-box layout', status: 'pending' },
      { id: 'CUE-05', time: '37:00', duration: '03:00', title: 'Show Wrap & Outro Credits', talent: 'Lead Host', techAction: 'Roll credits, Playback outro theme, Fade to Black', status: 'pending' },
    ]);
  }, []);

  useEffect(() => {
    fetchCues();
  }, [fetchCues]);

  // Show elapsed timer
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setSecondsElapsed((s) => s + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const advanceCue = () => {
    if (currentCueIndex < cues.length - 1) {
      setCurrentCueIndex((i) => i + 1);
    }
  };

  const activeCue = cues[currentCueIndex];
  const nextCue = cues[currentCueIndex + 1];

  return (
    <div className="bg-black text-white min-h-screen p-4 space-y-4 max-w-lg mx-auto pb-28">
      {/* High-Contrast Production Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
          <h2 className="text-lg font-black tracking-wider uppercase text-yellow-400">
            Run-Of-Show
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="font-mono text-2xl font-black text-white tracking-widest bg-zinc-900 px-3 py-1 rounded-xl border border-zinc-700">
            {formatTimer(secondsElapsed)}
          </div>
          <button
            onClick={() => setTimerActive(!timerActive)}
            className={`p-2 rounded-xl font-bold ${
              timerActive ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-black'
            } active:scale-95 transition`}
            title={timerActive ? 'Pause' : 'Start'}
          >
            {timerActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
          </button>
          <button
            onClick={() => {
              setTimerActive(false);
              setSecondsElapsed(0);
              setCurrentCueIndex(0);
            }}
            className="p-2 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl active:scale-95"
            title="Reset"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active "LIVE ON AIR" Banner */}
      {activeCue && (
        <div className="bg-gradient-to-r from-rose-950 to-zinc-900 border-2 border-rose-500 p-4 rounded-2xl space-y-2 shadow-2xl">
          <div className="flex items-center justify-between text-xs">
            <span className="bg-rose-600 text-white font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider text-[11px]">
              ON AIR NOW
            </span>
            <span className="font-mono text-rose-300 font-bold">{activeCue.id} • {activeCue.time}</span>
          </div>

          <h3 className="text-xl font-black text-white leading-tight">
            {activeCue.title}
          </h3>

          <div className="text-xs text-zinc-300 font-medium">
            <span className="text-yellow-400 font-bold">Talent:</span> {activeCue.talent}
          </div>

          <div className="bg-black/60 p-2.5 rounded-xl border border-rose-500/30 text-xs font-mono text-rose-200">
            <span className="text-yellow-400 font-bold">TECH CUE:</span> {activeCue.techAction}
          </div>

          {/* Big GO / Advance Button */}
          <button
            onClick={advanceCue}
            disabled={currentCueIndex >= cues.length - 1}
            className="w-full mt-2 py-3 bg-yellow-400 hover:bg-yellow-300 active:scale-98 disabled:opacity-30 text-black font-black text-base rounded-xl tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-xl shadow-yellow-950/40"
          >
            GO TO NEXT CUE
            <ChevronRight className="w-5 h-5 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Standby / Next Cue Indicator */}
      {nextCue && (
        <div className="bg-zinc-900/90 border border-zinc-700 p-3 rounded-xl flex items-center justify-between text-xs">
          <div>
            <span className="text-zinc-500 uppercase tracking-wider font-bold text-[10px]">STANDBY NEXT:</span>
            <p className="font-bold text-white text-sm truncate max-w-[240px]">{nextCue.title}</p>
          </div>
          <span className="font-mono text-zinc-400 font-semibold">{nextCue.time}</span>
        </div>
      )}

      {/* Cue Table List */}
      <div className="space-y-1.5 pt-2">
        <div className="flex justify-between text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-2">
          <span>Schedule Timeline</span>
          <span>{cues.length} segments</span>
        </div>

        {cues.map((cue, idx) => {
          const isCurrent = idx === currentCueIndex;
          const isPassed = idx < currentCueIndex;

          return (
            <div
              key={cue.id || idx}
              onClick={() => setCurrentCueIndex(idx)}
              className={`p-3 rounded-xl cursor-pointer transition border text-xs flex items-center justify-between ${
                isCurrent
                  ? 'bg-zinc-800/90 border-yellow-400/80 shadow-md'
                  : isPassed
                  ? 'bg-zinc-950/40 border-zinc-900 opacity-40'
                  : 'bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-yellow-400 animate-ping' : isPassed ? 'bg-zinc-600' : 'bg-zinc-500'}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-400 text-[11px] font-bold">{cue.time}</span>
                    <span className={`font-bold ${isCurrent ? 'text-yellow-300' : 'text-white'}`}>
                      {cue.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[220px]">{cue.talent}</p>
                </div>
              </div>
              <span className="font-mono text-zinc-500 text-[10px] shrink-0">{cue.duration}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
