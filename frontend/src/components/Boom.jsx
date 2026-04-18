import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Camera, Monitor, Mic 
} from 'lucide-react';
import { createMediaTranscriptJobApi } from '../services/backendApi';

export default function Boom({ isOpen, onClose }) {
  if (!isOpen) return null;
  
  const handleClose = () => {
    setBoomMode('screen');
    setBoomRecording(false);
    setBoomSegments([]);
    setBoomCurrentSegment(null);
    onClose && onClose();
  };
  const [boomMode, setBoomMode] = useState('screen');
  const [boomDevices, setBoomDevices] = useState({ mics: [], cameras: [] });
  const [boomSelectedMic, setBoomSelectedMic] = useState('');
  const [boomSelectedCamera, setBoomSelectedCamera] = useState('');
  const [boomAutoTranscribe, setBoomAutoTranscribe] = useState(false);
  const [boomRecording, setBoomRecording] = useState(false);
  const [boomSegments, setBoomSegments] = useState([]);
  const [boomCurrentSegment, setBoomCurrentSegment] = useState(null);
  const [boomSaving, setBoomSaving] = useState(false);

  const boomRecorderRef = useRef(null);
  const boomStreamRef = useRef(null);
  const boomCurrentChunksRef = useRef([]);
  const boomSegmentStartTimeRef = useRef(null);
  const boomFinalizedSegmentsRef = useRef([]);
  const boomRevertedSegmentRef = useRef(null);
  const boomPreviewRef = useRef(null);

  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (boomCurrentSegment instanceof Blob) {
      const url = URL.createObjectURL(boomCurrentSegment);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [boomCurrentSegment]);

  useEffect(() => {
    if (boomRecording && boomPreviewRef.current && boomStreamRef.current) {
      boomPreviewRef.current.srcObject = boomStreamRef.current;
    }
  }, [boomRecording]);

  useEffect(() => {
    if (!isOpen) return;
    const loadDevices = async () => {
      try {
        // Force permission request first to unlock full device list and labels
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          stream.getTracks().forEach(t => t.stop());
        } catch (permErr) {
          console.warn('Permission prompt error:', permErr);
        }

        const devs = await navigator.mediaDevices.enumerateDevices();
        const mics = devs.filter(d => d.kind === 'audioinput');
        const cameras = devs.filter(d => d.kind === 'videoinput');
        
        setBoomDevices({ mics, cameras });
        
        if (mics[0] && !boomSelectedMic) setBoomSelectedMic(mics[0].deviceId);
        if (cameras[0] && !boomSelectedCamera) setBoomSelectedCamera(cameras[0].deviceId);
      } catch (e) {
        console.warn('Boom devices enumeration error:', e);
      }
    };
    loadDevices();
  }, [isOpen]);

  const boomStartRecording = useCallback(async () => {
    try {
      let stream;
      if (boomMode === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { cursor: 'always' }, 
          audio: boomSelectedMic ? { deviceId: { exact: boomSelectedMic } } : true 
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: boomSelectedCamera ? { deviceId: { exact: boomSelectedCamera } } : true,
          audio: boomSelectedMic ? { deviceId: { exact: boomSelectedMic } } : true,
        });
      }

      boomStreamRef.current = stream;
      boomCurrentChunksRef.current = [];
      boomSegmentStartTimeRef.current = Date.now();
      boomFinalizedSegmentsRef.current = [];
      boomRevertedSegmentRef.current = null;

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      boomRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) boomCurrentChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (boomCurrentChunksRef.current.length > 0) {
          const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
          setBoomCurrentSegment(blob);
        }
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(1000);
      setBoomRecording(true);
      setBoomSegments([]);
    } catch (e) {
      console.error('Boom start error:', e);
    }
  }, [boomMode, boomSelectedMic, boomSelectedCamera]);

  const boomMark = useCallback(() => {
    if (!boomRecording || !boomRecorderRef.current) return;
    
    boomRecorderRef.current.stop();
    
    setTimeout(() => {
      if (!boomStreamRef.current) return;
      
      if (boomCurrentChunksRef.current.length > 0) {
        const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
        const duration = Date.now() - boomSegmentStartTimeRef.current;
        boomFinalizedSegmentsRef.current.push({ blob, duration, timestamp: Date.now() });
        setBoomSegments([...boomFinalizedSegmentsRef.current]);
      }
      
      boomCurrentChunksRef.current = [];
      boomSegmentStartTimeRef.current = Date.now();
      
      const newRecorder = new MediaRecorder(boomStreamRef.current, { mimeType: 'video/webm;codecs=vp9,opus' });
      boomRecorderRef.current = newRecorder;
      
      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) boomCurrentChunksRef.current.push(e.data);
      };
      
      newRecorder.onstop = () => {
        if (boomCurrentChunksRef.current.length > 0) {
          const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
          setBoomCurrentSegment(blob);
        }
        boomStreamRef.current?.getTracks().forEach(t => t.stop());
      };
      
      newRecorder.start(1000);
    }, 100);
  }, [boomRecording]);

  const boomRevert = useCallback(() => {
    if (boomFinalizedSegmentsRef.current.length === 0) return;
    const removed = boomFinalizedSegmentsRef.current.pop();
    boomRevertedSegmentRef.current = removed;
    setBoomSegments([...boomFinalizedSegmentsRef.current]);
  }, []);

  const boomStop = useCallback(() => {
    if (!boomRecorderRef.current) return;
    boomRecorderRef.current.stop();
    setBoomRecording(false);
    
    setTimeout(() => {
      if (boomCurrentChunksRef.current.length > 0) {
        const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
        const duration = Date.now() - boomSegmentStartTimeRef.current;
        const currentSeg = { blob, duration, timestamp: Date.now(), isCurrent: true };
        const allSegments = [...boomFinalizedSegmentsRef.current, currentSeg];
        
        if (allSegments.length === 1) {
          setBoomCurrentSegment(allSegments[0].blob);
        } else {
          setBoomCurrentSegment(allSegments[allSegments.length - 1].blob);
        }
      }
    }, 200);
  }, []);

  const boomSaveToVault = useCallback(async () => {
    if (!boomCurrentSegment) return;
    setBoomSaving(true);
    try {
      const file = new File([boomCurrentSegment], `boom-${Date.now()}.webm`, { type: 'video/webm' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tags', 'BOOM');
      
      const { request } = await import('../services/backendApi');
      const response = await request('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      const result = response?.data ? 
        Object.keys(response.data).reduce((acc, key) => {
          const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          acc[camelKey] = response.data[key];
          return acc;
        }, {}) : null;
      
      console.log('Boom saved to vault:', result);
      
      if (boomAutoTranscribe && result?.assetId) {
        try {
          const transcriptResult = await createMediaTranscriptJobApi({
            assetId: result.assetId,
            source: 'BOOM',
          });
          console.log('Boom transcript job created:', transcriptResult);
          
          window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'forge' } }));
          
          if (transcriptResult?.jobId) {
            sessionStorage.setItem('boom_transcript_job_id', transcriptResult.jobId);
            sessionStorage.setItem('boom_asset_id', result.assetId);
          }
        } catch (e) {
          console.error('Boom transcript error:', e);
        }
      }
    } catch (e) {
      console.error('Boom save error:', e);
    } finally {
      setBoomSaving(false);
    }
  }, [boomCurrentSegment, boomAutoTranscribe]);

  const boomReset = useCallback(() => {
    setBoomMode('screen');
    setBoomRecording(false);
    setBoomSegments([]);
    setBoomCurrentSegment(null);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={handleClose}>
      <div 
        className="w-[600px] max-h-[80vh] bg-[#0f1218] border border-[#1e2024] rounded-xl shadow-[0_24px_60px_-15px_rgba(0,0,0,1)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0f1218]">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-cyan-400" />
            <span className="text-[11px] font-black text-slate-200 tracking-[0.15em] uppercase">BOOM</span>
            {boomRecording && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/50">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[7px] font-black text-rose-400 uppercase tracking-wider">REC</span>
              </div>
            )}
          </div>
          <button onClick={handleClose} className="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-[#1e2024]">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {!boomRecording && !boomCurrentSegment && (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">CAPTURE MODE</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setBoomMode('screen')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                      boomMode === 'screen' 
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' 
                        : 'border-[#1e2024] bg-[#0f1218] text-slate-400 hover:border-cyan-500/30'
                    }`}
                  >
                    <Monitor size={18} />
                    <span className="text-[10px] font-black uppercase">SCREEN + MIC</span>
                  </button>
                  <button
                    onClick={() => setBoomMode('camera')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                      boomMode === 'camera' 
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' 
                        : 'border-[#1e2024] bg-[#0f1218] text-slate-400 hover:border-cyan-500/30'
                    }`}
                  >
                    <Camera size={18} />
                    <span className="text-[10px] font-black uppercase">CAMERA + MIC</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">MICROPHONE</span>
                  <select 
                    value={boomSelectedMic} 
                    onChange={(e) => setBoomSelectedMic(e.target.value)}
                    className="w-full p-2 text-[9px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
                  >
                    {boomDevices.mics.map(m => (
                      <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>
                    ))}
                  </select>
                </div>
                {boomMode === 'camera' && (
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">CAMERA</span>
                    <select 
                      value={boomSelectedCamera} 
                      onChange={(e) => setBoomSelectedCamera(e.target.value)}
                      className="w-full p-2 text-[9px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
                    >
                      {boomDevices.cameras.map(c => (
                        <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-2 rounded border border-[#1e2024] bg-[#0f1218]">
                <div>
                  <span className="text-[8px] font-black text-slate-400 uppercase block">AUTO-TRANSCRIBE</span>
                  <span className="text-[7px] text-slate-600 font-mono">Send to Studio after save</span>
                </div>
                <button 
                  onClick={() => setBoomAutoTranscribe(!boomAutoTranscribe)}
                  className={`w-10 h-5 rounded-full transition-all ${boomAutoTranscribe ? 'bg-cyan-500' : 'bg-[#1e2024]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${boomAutoTranscribe ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <button
                onClick={boomStartRecording}
                disabled={!boomMode}
                className="w-full py-3 rounded-lg bg-gradient-to-b from-rose-900/40 to-[#0a0c10] border border-rose-500/30 text-rose-400 text-[11px] font-black uppercase tracking-wider hover:from-rose-800/40 hover:to-[#0f1218] hover:border-rose-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {boomMode === 'screen' ? 'START SCREEN RECORD' : 'START CAMERA RECORD'}
              </button>
            </div>
          )}

          {boomRecording && (
            <div className="space-y-4">
              <div className="aspect-video bg-black rounded-lg border border-[#1e2024] overflow-hidden relative">
                <video 
                  ref={boomPreviewRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/50">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-[7px] font-black text-rose-400 uppercase tracking-wider">LIVE</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={boomMark}
                  className="flex-1 py-2 rounded-lg border border-[#1e2024] bg-[#0f1218] text-slate-400 text-[9px] font-black uppercase hover:border-cyan-500/30 hover:text-cyan-400 transition-all"
                >
                  MARK
                </button>
                <button
                  onClick={boomRevert}
                  className="flex-1 py-2 rounded-lg border border-[#1e2024] bg-[#0f1218] text-slate-400 text-[9px] font-black uppercase hover:border-amber-500/30 hover:text-amber-400 transition-all"
                >
                  REVERT
                </button>
                <button
                  onClick={boomStop}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-b from-rose-900/40 to-[#0a0c10] border border-rose-500/30 text-rose-400 text-[9px] font-black uppercase hover:from-rose-800/40 hover:to-[#0f1218] transition-all"
                >
                  STOP
                </button>
              </div>
            </div>
          )}

          {boomCurrentSegment && !boomRecording && (
            <div className="space-y-4">
              {previewUrl ? (
                <video 
                  src={previewUrl} 
                  controls 
                  className="w-full aspect-video bg-black rounded-lg border border-[#1e2024]"
                />
              ) : (
                <div className="w-full aspect-video bg-black rounded-lg border border-[#1e2024] flex items-center justify-center">
                  <span className="text-[9px] text-slate-500 uppercase">Processing recorded media...</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={boomReset}
                  className="flex-1 py-2 rounded-lg border border-[#1e2024] bg-[#0f1218] text-slate-400 text-[9px] font-black uppercase hover:border-rose-500/30 hover:text-rose-400 transition-all"
                >
                  RE-RECORD
                </button>
                <button
                  onClick={boomSaveToVault}
                  disabled={boomSaving}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-b from-cyan-900/40 to-[#0a0c10] border border-cyan-500/30 text-cyan-400 text-[9px] font-black uppercase hover:from-cyan-800/40 hover:to-[#0f1218] transition-all disabled:opacity-50"
                >
                  {boomSaving ? 'SAVING...' : 'SAVE TO VAULT'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}