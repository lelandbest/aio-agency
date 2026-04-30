import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Camera, Monitor, Mic 
} from 'lucide-react';
import { MediaService } from '../services/media.service';

export default function Boom({ isOpen, onClose }) {
  if (!isOpen) return null;
  
  const stopStream = useCallback(() => {
    if (boomStreamRef.current) {
      boomStreamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      boomStreamRef.current = null;
    }
  }, []);

  const handleClose = () => {
    stopStream();
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
    return () => {
      stopStream();
      if (recorderPreviewUrl.current) {
        URL.revokeObjectURL(recorderPreviewUrl.current);
      }
    };
  }, [stopStream]);

  const recorderPreviewUrl = useRef(null);
  const getSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  };

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
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { cursor: 'always' }, 
          audio: true // Capture system audio if available
        });

        if (boomSelectedMic) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: boomSelectedMic } }
            });
            
            const tracks = [...displayStream.getVideoTracks()];
            // If we have both system audio and mic audio, we only take the mic for "SCREEN + MIC" clarity,
            // or we could mix them. Standard AIO protocol is Mic priority for narration.
            if (micStream.getAudioTracks().length > 0) {
              tracks.push(micStream.getAudioTracks()[0]);
              // Stop unused system audio tracks from displayStream to prevent hardware leaks
              displayStream.getAudioTracks().forEach(t => t.stop());
            } else if (displayStream.getAudioTracks().length > 0) {
              tracks.push(displayStream.getAudioTracks()[0]);
            }
            
            stream = new MediaStream(tracks);
            
            // Ensure displayStream tracks are stopped if the screen recording ends
            displayStream.getVideoTracks()[0].onended = () => {
              stopStream();
              setBoomRecording(false);
            };
          } catch (micErr) {
            console.warn('Mic acquisition failed, falling back to system audio:', micErr);
            stream = displayStream;
          }
        } else {
          stream = displayStream;
        }
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

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      boomRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          boomCurrentChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (boomCurrentChunksRef.current.length > 0) {
          const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
          if (blob.size > 0) {
            setBoomCurrentSegment(blob);
          }
        }
      };

      recorder.start(1000);
      setBoomRecording(true);
      setBoomSegments([]);
    } catch (e) {
      console.error('Boom start error:', e);
      stopStream();
      setBoomRecording(false);
    }
  }, [boomMode, boomSelectedMic, boomSelectedCamera, stopStream]);

  const boomMark = useCallback(() => {
    if (!boomRecording || !boomRecorderRef.current || !boomStreamRef.current) return;
    
    // Captured data is handled by ondataavailable and collected on stop
    const currentRecorder = boomRecorderRef.current;
    
    currentRecorder.onstop = () => {
      if (boomCurrentChunksRef.current.length > 0) {
        const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
        const duration = Date.now() - boomSegmentStartTimeRef.current;
        if (blob.size > 0) {
          boomFinalizedSegmentsRef.current.push({ blob, duration, timestamp: Date.now() });
          setBoomSegments([...boomFinalizedSegmentsRef.current]);
        }
      }
      
      boomCurrentChunksRef.current = [];
      boomSegmentStartTimeRef.current = Date.now();
      
      if (boomRecording && boomStreamRef.current) {
        const nextRecorder = new MediaRecorder(boomStreamRef.current, { mimeType: getSupportedMimeType() });
        boomRecorderRef.current = nextRecorder;
        nextRecorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) boomCurrentChunksRef.current.push(ev.data);
        };
        nextRecorder.start(1000);
      }
    };

    currentRecorder.stop();
  }, [boomRecording]);

  const boomRevert = useCallback(() => {
    if (boomFinalizedSegmentsRef.current.length === 0) return;
    const removed = boomFinalizedSegmentsRef.current.pop();
    boomRevertedSegmentRef.current = removed;
    setBoomSegments([...boomFinalizedSegmentsRef.current]);
  }, []);

  const boomStop = useCallback(() => {
    if (!boomRecorderRef.current) return;
    
    setBoomRecording(false);
    const finalRecorder = boomRecorderRef.current;
    
    finalRecorder.onstop = () => {
      if (boomCurrentChunksRef.current.length > 0) {
        const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
        const duration = Date.now() - boomSegmentStartTimeRef.current;
        if (blob.size > 0) {
          const currentSeg = { blob, duration, timestamp: Date.now(), isCurrent: true };
          const allSegments = [...boomFinalizedSegmentsRef.current, currentSeg];
          setBoomCurrentSegment(allSegments[allSegments.length - 1].blob);
        }
      }
      stopStream();
    };

    finalRecorder.stop();
  }, [stopStream]);

  const boomSaveToVault = useCallback(async () => {
    if (!boomCurrentSegment) return;
    setBoomSaving(true);
    try {
      const file = new File([boomCurrentSegment], `boom-${Date.now()}.webm`, { type: 'video/webm' });
      
      const result = await MediaService.uploadMediaFile(file, 'BOOM');
      
      console.log('Boom saved to vault:', result);
      
      if (boomAutoTranscribe && result?.assetId) {
        try {
          const transcriptResult = await MediaService.createMediaTranscriptJob({
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
    stopStream();
    setBoomMode('screen');
    setBoomRecording(false);
    setBoomSegments([]);
    setBoomCurrentSegment(null);
  }, [stopStream]);

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