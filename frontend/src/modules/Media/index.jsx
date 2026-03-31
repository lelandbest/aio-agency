import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Brain,
  Clapperboard,
  Crosshair,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Mic,
  Play,
  RefreshCw,
  Target,
  Video,
  Waves,
  X,
  Send,
  Loader2,
  Download,
  Copy,
  GitMerge,
  ExternalLink,
  Square,
  RotateCcw,
  FastForward,
  Pause,
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useAIAssist } from '../../contexts/AIAssistContext';
import {
  createMediaAudioRenderJobApi,
  createMediaRenderJobApi,
  createMediaRunOfShowJobApi,
  createMediaScriptJobApi,
  createMediaTranscriptJobApi,
  getMediaAssetsApi,
  getMediaAudioRenderJobsApi,
  getMediaPublishArtifactsApi,
  getMediaPublishJobsApi,
  getMediaRenderJobsApi,
  getMediaRunOfShowArtifactsApi,
  getMediaRunOfShowJobsApi,
  getMediaScriptArtifactsApi,
  getMediaScriptJobsApi,
  getMediaTranscriptArtifactsApi,
  getMediaTranscriptJobsApi,
  getMediaProviderConfigsApi,
  ingestMeetingMediaApi,
  createMediaPublishJobApi,
  runAiCommandApi,
} from '../../services/backendApi';
import { VISIBLE_SPECIALIST_KEYS, ROW_COLOR_LANES, HQ_AGENT_STYLE, OMEGA_AGENT_STYLE } from '../Agents/data/agentRegistry';
import { templates } from '../Flows/data/templates';
import { ingestFlowSource } from '../Flows/utils/flowIngestion';
import flowRepository from '../Flows/utils/flowRepository';

const QUICK_ACTIONS = [
  { key: 'generateScript', label: 'Generate Script', icon: FileText, provider: 'stub-script' },
  { key: 'generateRunOfShow', label: 'Generate Run of Show', icon: ListChecks, provider: 'stub-run-of-show' },
  { key: 'generateVoice', label: 'Generate Voice', icon: AudioLines, provider: 'elevenlabs_tts' },
  { key: 'generateThumbnail', label: 'Generate Thumbnail', icon: ImageIcon, provider: 'stub-render' },
  { key: 'generateVideo', label: 'Generate Video', icon: Video, provider: 'stub-render' },
  { key: 'scribeMedia', label: 'Transcribe Media', icon: Waves, provider: 'elevenlabs_scribe' },
  { key: 'ingestMeetingArtifacts', label: 'Ingest Meeting Artifacts', icon: Mic, provider: 'zoom' },
  { key: 'publishMedia', label: 'Publish Media', icon: Target, provider: 'internal-publish' },
];

const QUICK_ACTION_MAP = QUICK_ACTIONS.reduce((accumulator, action) => {
  accumulator[action.key] = action;
  return accumulator;
}, {});

const INGESTION_SOURCES = [
  { id: 'zoom', label: 'ZOOM', color: 'bg-emerald-500' },
  { id: 'googleMeetDrive', label: 'GOOGLE MEET / DRIVE', color: 'bg-amber-500' },
  { id: 'jitsi', label: 'JITSI', color: 'bg-slate-500' },
];

const DEFAULT_FORM_STATE = {
  title: '',
  topic: '',
  tone: '',
  duration: '',
  text: '',
  voice: 'Rachel',
  style: 'Conversational',
  subtitle: '',
  prompt: '',
  script: '',
  transcriptText: '',
  sourceUrl: '',
  meetingProvider: 'zoom',
  meetingId: '',
  meetingTitle: '',
  mediaUrl: '',
  assetId: '',
  publishTarget: '',
};



const MediaModule = () => {
  const { openAIAssist } = useAIAssist();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedAction, setSelectedAction] = useState('generateScript');
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [launchingAction, setLaunchingAction] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isRunPending, setIsRunPending] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('ALPHA');
  const [activeOutputId, setActiveOutputId] = useState(null);
  const [workspace, setWorkspace] = useState({
    jobs: [],
    outputs: [],
    counts: { jobs: 0, outputs: 0, ingestSources: INGESTION_SOURCES.length },
  });

  const loadWorkspace = useCallback(async (mode = 'initial') => {
    const setBusy = mode === 'initial' ? setLoading : setRefreshing;
    setBusy(true);
    setError('');
    try {
      const [
        assets, renderJobs, transcriptJobs, transcriptArtifacts,
        scriptJobs, scriptArtifacts, runOfShowJobs, runOfShowArtifacts,
        audioRenderJobs, publishJobs, publishArtifacts
      ] = await Promise.all([
        getMediaAssetsApi(), getMediaRenderJobsApi(), getMediaTranscriptJobsApi(), getMediaTranscriptArtifactsApi(),
        getMediaScriptJobsApi(), getMediaScriptArtifactsApi(), getMediaRunOfShowJobsApi(), getMediaRunOfShowArtifactsApi(),
        getMediaAudioRenderJobsApi(), getMediaPublishJobsApi(), getMediaPublishArtifactsApi()
      ]);

      const jobs = [
        ...scriptJobs.map(j => ({ id: j.id, title: j.title || 'Script', type: 'script', status: j.status || 'queued', createdAt: j.createdAt })),
        ...runOfShowJobs.map(j => ({ id: j.id, title: j.title || 'Run of Show', type: 'runOfShow', status: j.status || 'queued', createdAt: j.createdAt })),
        ...audioRenderJobs.map(j => ({ id: j.id, title: j.title || 'Audio', type: 'audio', status: j.status || 'queued', createdAt: j.createdAt })),
        ...renderJobs.map(j => ({ id: j.id, title: j.title || 'Render', type: 'render', status: j.status || 'queued', createdAt: j.createdAt })),
        ...transcriptJobs.map(j => ({ id: j.id, title: j.title || 'Transcript', type: 'transcript', status: j.status || 'queued', createdAt: j.createdAt })),
        ...publishJobs.map(j => ({ id: j.id, title: j.title || 'Publish', type: 'publish', status: j.status || 'queued', createdAt: j.createdAt })),
      ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      const outputs = [
        ...scriptArtifacts.map(a => ({ id: a.id, title: a.title || 'Script', type: 'script', createdAt: a.createdAt, previewText: a.scriptText || '', mediaType: 'text', status: 'complete' })),
        ...runOfShowArtifacts.map(a => ({ id: a.id, title: a.title || 'Run of Show', type: 'runOfShow', createdAt: a.createdAt, previewText: a.runOfShowText || '', mediaType: 'text', status: 'complete' })),
        ...transcriptArtifacts.map(a => ({ id: a.id, title: a.title || 'Transcript', type: 'transcript', createdAt: a.createdAt, previewText: a.transcriptText || '', mediaType: 'text', status: 'complete' })),
        ...publishArtifacts.map(a => ({ id: a.id, title: a.title || 'Publish', type: 'publish', createdAt: a.createdAt, previewText: `Target: ${a.publishTarget}`, mediaType: 'text', status: a.publicationStatus || 'published' })),
        ...assets.map(a => ({ id: a.id, title: a.title || 'Media', type: a.mediaType === 'audio' ? 'audio' : 'render', createdAt: a.createdAt, previewText: a.metadata?.scriptExcerpt || '', sourceUrl: a.sourceUrl || null, mediaType: a.mediaType || 'video', status: 'complete', metadata: a.metadata || {} })),
      ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      setWorkspace({ jobs, outputs, counts: { jobs: jobs.length, outputs: outputs.length, ingestSources: INGESTION_SOURCES.length } });
    } catch (e) {
      setError(e.message || 'Unable to load workspace.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const activeAction = QUICK_ACTION_MAP[selectedAction] || QUICK_ACTIONS[0];
  const updateField = useCallback((f, v) => setFormState(c => ({ ...c, [f]: v })), []);

  const resetActionForm = useCallback((key) => {
    const next = key || selectedAction;
    setSelectedAction(next);
    setFormState({ ...DEFAULT_FORM_STATE, meetingProvider: next === 'ingestMeetingArtifacts' ? 'zoom' : DEFAULT_FORM_STATE.meetingProvider });
  }, [selectedAction]);

  const activeOutput = useMemo(() => workspace.outputs.find(o => o.id === activeOutputId) || workspace.outputs[0], [workspace.outputs, activeOutputId]);

  const handleSubmitQuickAction = useCallback(async () => {
    if (selectedAction === 'publishMedia') { setIsPublishModalOpen(true); return; }
    setLaunchingAction(selectedAction);
    setError('');
    try {
      let r = null;
      if (selectedAction === 'generateScript') r = await createMediaScriptJobApi({ provider: activeAction.provider, title: formState.title || 'Script', topic: formState.topic, tone: formState.tone, duration: formState.duration });
      else if (selectedAction === 'generateRunOfShow') r = await createMediaRunOfShowJobApi({ provider: activeAction.provider, title: formState.title || 'Run of Show', topic: formState.topic });
      else if (selectedAction === 'generateVoice') r = await createMediaAudioRenderJobApi({ provider: activeAction.provider, title: formState.title || 'Voice', text: formState.text, voice: formState.voice, style: formState.style });
      else if (selectedAction === 'generateThumbnail') r = await createMediaRenderJobApi({ provider: activeAction.provider, title: formState.title || 'Thumbnail', mediaType: 'image', script: formState.prompt, metadata: { prompt: formState.prompt } });
      else if (selectedAction === 'generateVideo') r = await createMediaRenderJobApi({ provider: activeAction.provider, title: formState.title || 'Video', mediaType: 'video', script: formState.script, metadata: { prompt: formState.script } });
      else if (selectedAction === 'scribeMedia') r = await createMediaTranscriptJobApi({ provider: activeAction.provider, title: formState.title || 'Transcript', sourceUrl: formState.sourceUrl, transcriptText: formState.transcriptText });
      else if (selectedAction === 'ingestMeetingArtifacts') r = await ingestMeetingMediaApi({ provider: formState.meetingProvider, meetingId: formState.meetingId, meetingTitle: formState.meetingTitle });

      await loadWorkspace('refresh');
      resetActionForm();
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunchingAction('');
    }
  }, [activeAction, formState, loadWorkspace, resetActionForm, selectedAction]);

  const handleConsult = useCallback(async () => {
    if (!chatInput.trim() || isRunPending) return;
    setIsRunPending(true);
    setError('');
    try {
      await runAiCommandApi({
        command: chatInput.trim(),
        agent: selectedAgent,
        context: { module: 'media', surface: 'consult_terminal', activeAssetId: activeOutput?.id || null }
      });
      setChatInput('');
      await loadWorkspace('refresh');
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRunPending(false);
    }
  }, [chatInput, isRunPending, selectedAgent, activeOutput, loadWorkspace]);

  const renderTacticalForm = () => {
    const inputClass = "w-full rounded bg-black/40 border border-[#2A2D35] px-2 py-1.5 text-[10px] text-indigo-100 focus:border-cyan-500 font-mono focus:outline-none transition-all";
    const labelClass = "text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1";
    if (selectedAction === 'generateScript') {
      return (
        <div className="flex flex-col gap-2">
          <label><span className={labelClass}>PROP // MISSION TITLE</span><input value={formState.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} placeholder="PODCAST OPEN" /></label>
          <label><span className={labelClass}>CORE TOPIC</span><input value={formState.topic} onChange={(e) => updateField('topic', e.target.value)} className={inputClass} placeholder="TOPIC REF" /></label>
          <div className="flex gap-2">
            <label className="flex-1"><span className={labelClass}>OBJECTIVE TONE</span><input value={formState.tone} onChange={(e) => updateField('tone', e.target.value)} className={inputClass} placeholder="PROFESSIONAL" /></label>
            <label className="w-20"><span className={labelClass}>DUR TARGET</span><input value={formState.duration} onChange={(e) => updateField('duration', e.target.value)} className={inputClass} placeholder="300S" /></label>
          </div>
        </div>
      );
    }
    if (selectedAction === 'generateThumbnail') {
      return (
        <div className="flex flex-col gap-2">
          <label><span className={labelClass}>PROP // ASSET TITLE</span><input value={formState.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} placeholder="IMG GEN" /></label>
          <label><span className={labelClass}>SUBTITLE</span><input value={formState.subtitle} onChange={(e) => updateField('subtitle', e.target.value)} className={inputClass} placeholder="SUB ATTR" /></label>
          <label><span className={labelClass}>SOURCE URI</span><input value={formState.sourceUrl} onChange={(e) => updateField('sourceUrl', e.target.value)} className={inputClass} placeholder="S3 BUCKET URI" /></label>
          <label><span className={labelClass}>COMMAND PROMPT</span><textarea value={formState.prompt} onChange={(e) => updateField('prompt', e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="GEN PROMPT..." /></label>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <label><span className={labelClass}>PROP // MISSION DATA</span><textarea value={formState.text || formState.script || formState.transcriptText} onChange={(e) => updateField('text', e.target.value)} rows={4} className={`${inputClass} resize-none`} placeholder="SYSTEM DATA BUF" /></label>
      </div>
    );
  };

  const handleModuleAiAssist = useCallback(async () => {
    if (isRunPending) return;
    setIsRunPending(true);
    try {
      await runAiCommandApi({
        command: "Assist with current mission parameters and optimize tactical form fields.",
        agent: "ALPHA",
        context: { module: 'media', surface: 'toolbar_assist', formState }
      });
      await loadWorkspace('refresh');
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRunPending(false);
    }
  }, [formState, isRunPending, loadWorkspace]);

  if (loading && !workspace.outputs.length) return <div className="flex h-full items-center justify-center bg-black text-cyan-500 font-mono text-xs uppercase tracking-widest">INITIAL LOADING SEQUENCE...</div>;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#070708] text-slate-300">
      <ModuleHeader
        title="Media Workstation"
        showTitle={false}
        leftActions={[
          {
            label: 'OPEN MEDIA PIPELINE',
            icon: GitMerge,
            onClick: () => window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'pipeline' } })),
            variant: 'secondary',
          },
        ]}
        toolbarLeftSlot={
          <div className="ml-4 flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">JOBS:</span>
            <span className="text-[9px] font-mono text-cyan-500">{workspace.counts.jobs}</span>
          </div>
        }
        onModuleAi={handleModuleAiAssist}
        toolbarRightSlot={(
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 border-r border-white/5 pr-4 mr-2">
              {INGESTION_SOURCES.map((stat) => (
                <div key={stat.id} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${stat.color} shadow-sm`} />
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{stat.label}:</span>
                  <span className="text-[9px] font-mono text-cyan-500">{(workspace.counts?.[stat.id] || 0)}</span>
                </div>
              ))}
            </div>

            <RefreshCw
              size={14}
              className={`text-slate-400 hover:text-cyan-500 cursor-pointer transition-all ml-2 ${refreshing ? 'animate-spin' : ''}`}
              onClick={() => loadWorkspace('refresh')}
            />
          </div>
        )}
      />

      <div className="flex-1 min-h-0 flex gap-0.5 p-1 bg-[#08080A] overflow-hidden">
        {/* LEFT WORKSTATION: MONITOR A */}
        <div className="flex-[1.2] min-w-0 flex flex-col bg-[#111318] rounded-xl border border-[#1E2024] p-3 relative items-center gap-2">
          <div className="absolute top-4 left-5 flex items-center gap-2 z-10 px-2 py-0.5 rounded bg-black/60 backdrop-blur border border-white/5">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></div>
            <span className="text-[7px] uppercase tracking-[0.4em] text-slate-400 font-black">MON A // PROG</span>
          </div>

          <div className="w-full flex-1 flex items-center justify-center relative mt-8">
            <div className="w-full aspect-video bg-black rounded border-8 border-[#0A0A0C] shadow-[0_15px_30px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col justify-center items-center group">
              {activeOutput?.sourceUrl ? (
                <video src={activeOutput.sourceUrl} className="w-full h-full object-contain" controls />
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex flex-col w-full h-48 border border-white/5 overflow-hidden">
                    {/* Top Row: SMPTE Standard Colors */}
                    <div className="flex h-[60%] w-full">
                      {['bg-[#C0C0C0]', 'bg-[#C0C000]', 'bg-[#00C0C0]', 'bg-[#00C000]', 'bg-[#C000C0]', 'bg-[#C00000]', 'bg-[#0000C0]'].map((c, i) => (
                        <div key={i} className={`flex-1 ${c}`}></div>
                      ))}
                    </div>
                    {/* Middle Row: Reversed/Modified Colors */}
                    <div className="flex h-[10%] w-full">
                      {['bg-[#0000C0]', 'bg-[#131313]', 'bg-[#C000C0]', 'bg-[#131313]', 'bg-[#00C0C0]', 'bg-[#131313]', 'bg-[#C0C0C0]'].map((c, i) => (
                        <div key={i} className={`flex-1 ${c}`}></div>
                      ))}
                    </div>
                    {/* Bottom Row: Black/White/Grey/Blue Blocks */}
                    <div className="flex h-[30%] w-full">
                      <div className="flex-[1.25] bg-[#002147]"></div>
                      <div className="flex-[1.25] bg-[#FFFFFF]"></div>
                      <div className="flex-[1.25] bg-[#32006A]"></div>
                      <div className="flex-[1.25] bg-[#131313]"></div>
                      <div className="flex-[0.5] bg-[#000000]"></div>
                      <div className="flex-[0.5] bg-[#131313]"></div>
                      <div className="flex-[0.5] bg-[#1D1D1D]"></div>
                      <div className="flex-[1.25] bg-[#131313]"></div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/90 px-6 py-2 border border-white/20 rounded shadow-[0_0_30px_rgba(0,0,0,0.8)] text-[10px] font-mono uppercase tracking-[0.6em] text-white backdrop-blur-sm animate-pulse">NO SIGNAL // STANDBY</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-10 bg-[#0A0A0C] rounded-md border border-[#1E2024] flex items-center px-4 justify-between shadow-inner mt-2">
            <div className="flex items-center gap-4">
              <div className="text-[10px] text-cyan-600 font-mono uppercase tracking-[0.2em]">{activeOutput?.title || 'PODCAST PIPELINE'}</div>
              <div className="flex items-center gap-1.5 border-l border-[#2A2D35] pl-3 text-[8px] font-black uppercase tracking-widest">
                <span className="text-slate-500">DEST:</span>
                <span className="text-emerald-500/90">{activeOutput?.metadata?.publishTarget || 'LOCAL'}</span>
              </div>
            </div>
            <div className="text-[8px] font-black text-slate-600 uppercase tracking-[0.4em]">STANDBY</div>
          </div>
        </div>

        {/* CENTER CONTROL DECK */}
        <div className="w-[340px] flex-none flex flex-col bg-[#111318] border border-[#1E2024] rounded-xl overflow-hidden shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)] relative z-10">
          <div className="h-10 border-b border-black flex items-center justify-center bg-[#1A1C21]">
            <span className="text-[10px] uppercase tracking-[0.5em] text-cyan-500/80 font-black">CONTROL DECK</span>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col gap-4">
            {/* LINK STATUS & MASTER SYS */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0A0A0C] p-3 rounded-lg border border-[#1E2024] flex flex-col gap-2.5 shadow-inner">
                <span className="text-[8px] font-black text-cyan-500/60 uppercase tracking-widest">LINK STATUS</span>
                <div className="flex flex-col gap-2">
                  {INGESTION_SOURCES.map(s => (
                    <div key={s.id} className="flex items-center gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${s.color} shadow-[0_0_8px_rgba(0,0,0,1)]`}></div>
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tight">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#0A0A0C] p-3 rounded-lg border border-[#1E2024] flex flex-col items-center justify-center relative shadow-inner">
                <span className="text-[8px] font-black text-cyan-500/60 uppercase tracking-widest absolute top-2 left-3">MASTER SYS</span>
                <div className="flex gap-4 mt-3">
                  <button className="w-11 h-11 rounded-xl border-t border-white/5 bg-[#1E2024] flex items-center justify-center shadow-[0_6px_12px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] active:translate-y-0.5 active:shadow-inner transition-all group">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-600 group-hover:bg-rose-500 transition-colors shadow-[0_0_8px_rgba(244,63,94,0.3)]"></div>
                  </button>
                  <button className="w-11 h-11 rounded-xl border-t border-white/5 bg-[#1E2024] flex items-center justify-center shadow-[0_6px_12px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] active:translate-y-0.5 active:shadow-inner transition-all group">
                    <Play size={16} className="text-slate-500 group-hover:text-sky-400 fill-current ml-0.5" />
                  </button>
                </div>
                <div className="mt-4 w-20 h-1.5 bg-[#08080A] rounded-full border border-white/5 shadow-inner relative">
                  <div className="h-full w-2/3 bg-sky-500/40 rounded-full"></div>
                  <div className="absolute top-1/2 left-[66%] -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-slate-500 rounded-full border-t border-white/20 border-b border-black shadow-lg cursor-pointer"></div>
                </div>
              </div>
            </div>

            {/* MATRIX PADS */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] text-center">MATRIX PADS</span>
              <div className="grid grid-cols-4 gap-2.5">
                {QUICK_ACTIONS.map(a => {
                  const isSelected = selectedAction === a.key;
                  return (
                    <button
                      key={a.key}
                      onClick={() => resetActionForm(a.key)}
                      className={`h-11 rounded border-t border-white/10 border-b border-black transition-all active:translate-y-0.5 flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${isSelected ? 'bg-gradient-to-b from-[#1a2b3c] to-[#0a0f14] border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.3)] text-cyan-400' : 'bg-gradient-to-b from-[#2A2D35] to-[#121418] text-slate-500'}`}
                    >
                      <a.icon size={18} className={isSelected ? 'drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]' : ''} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-center bg-black/60 border border-white/5 rounded h-8">
                <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-[0.3em] truncate">{activeAction.label}</span>
              </div>
            </div>

            {/* TACTICAL FORM */}
            <div className="flex-1 flex flex-col bg-[#0A0A0C] border border-white/5 rounded-lg p-4 shadow-inner relative min-h-[180px]">
              <div className="flex-1 overflow-y-auto no-scrollbar">{renderTacticalForm()}</div>
              {error && <div className="mt-2 text-[7px] text-rose-500 font-mono uppercase bg-rose-900/10 p-2 border border-rose-900/20 rounded leading-tight">{error}</div>}
            </div>

            <button
              onClick={handleSubmitQuickAction}
              disabled={Boolean(launchingAction)}
              className="h-11 bg-gradient-to-b from-[#2A3442] to-[#0A0F14] border-t border-white/15 border-b border-black rounded-md flex items-center justify-center gap-4 shadow-[0_8px_16px_rgba(0,0,0,0.8)] group active:translate-y-0.5 transition-all"
            >
              <Crosshair size={14} className="text-slate-300 group-hover:text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
              <span className="text-[11px] font-black text-white uppercase tracking-[0.6em]">EXECUTE</span>
            </button>
          </div>
        </div>

        {/* RIGHT ZONE: PRODUCTION ISLAND + CONSULT */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {/* MONITOR B: REVIEW */}
          <div className="flex-1 flex flex-col bg-[#111318] rounded-xl border border-[#1E2024] p-2 relative gap-2 overflow-hidden">
            <div className="absolute top-2 left-3 flex items-center gap-2 z-10 px-2 py-0.5 rounded bg-black/60 backdrop-blur border border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]"></div>
              <span className="text-[7px] uppercase tracking-[0.4em] text-slate-400 font-black">MON B // REVIEW</span>
            </div>

            {/* TXT READOUT BAR */}
            <div className="mt-8 flex flex-col flex-1 gap-2 overflow-hidden">
              <div className="h-10 bg-[#0A0A0C] border border-[#1E2024] rounded-t-lg flex items-center px-4 justify-between shrink-0 shadow-inner">
                <div className="flex items-center gap-2">
                  <FileText size={12} className="text-sky-500" />
                  <span className="text-[9px] font-black text-sky-700 uppercase tracking-widest">TXT READOUT</span>
                </div>
                <div className="flex items-center gap-4 text-[7px] font-mono font-black text-slate-600 uppercase tracking-widest">
                  <span>TARGET: {activeOutput?.metadata?.publishTarget || 'UNKNOWN'} | STATUS: {activeOutput?.status || 'UNKNOWN'}</span>
                  <button className="px-2 py-0.5 border border-sky-500/30 rounded text-sky-500">COPY DATA</button>
                </div>
              </div>

              {/* ASSET CACHE + JOB QUEUE GRID */}
              <div className="flex-1 bg-black/40 border-x border-b border-[#1E2024] rounded-b-lg p-2 flex overflow-hidden gap-2">
                <div className="flex-1 flex flex-col min-w-0">
                  <span className="text-[6px] font-black text-slate-700 uppercase tracking-widest mb-1 ml-1">ASSET CACHE</span>
                  <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                    {workspace.outputs.slice(0, 10).map((o, idx) => (
                      <div key={o.id} onClick={() => setActiveOutputId(o.id)} className={`p-2 rounded border transition-all cursor-pointer ${activeOutputId === o.id ? 'bg-sky-950/20 border-sky-500/50' : 'bg-[#111318] border-[#1E2024]'}`}>
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] font-bold text-slate-300 truncate lowercase">{o.title}</span>
                          {idx === 0 && <span className="text-[5px] bg-emerald-500/20 text-emerald-500 px-1 rounded font-black border border-emerald-500/30 uppercase tracking-tighter">LATEST</span>}
                          {o.mediaType === 'audio' && <AudioLines size={10} className="text-sky-400" />}
                        </div>
                        <div className="flex justify-between mt-0.5 text-[6px] font-mono text-slate-600 uppercase tracking-widest">
                          <span>{o.type}</span>
                          <span>{new Date(o.createdAt).toLocaleTimeString([], { hour12: false })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex flex-col min-w-0 border-l border-[#1E2024] pl-2">
                  <span className="text-[6px] font-black text-slate-700 uppercase tracking-widest mb-1 ml-1">JOB QUEUE</span>
                  <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                    {workspace.jobs.slice(0, 10).map(j => (
                      <div key={j.id} className="p-2 rounded bg-black/40 border border-[#1E2024] flex items-center justify-between">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-bold text-slate-500 truncate uppercase">{j.title}</span>
                          <span className="text-[6px] font-mono text-slate-700 uppercase">{j.type}</span>
                        </div>
                        <span className="text-[6px] font-black uppercase text-emerald-500">{j.status || 'COMPLETE'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* LOWER STATUS BAR */}
            <div className="h-8 mt-2 border-t border-[#1E2024] flex items-center justify-between text-[7px] font-black uppercase tracking-[0.2em] px-2 text-slate-600">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">PUBLISHARTIFACT</span>
                <span className="h-2 w-px bg-slate-800"></span>
                <span>STATUS: PUBLISHED</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.8)]"></div>
                <span className="text-cyan-600">AI ASSIST ENABLED</span>
              </div>
            </div>
          </div>

          {/* TERMINAL + CONSULT (ADDITIVE) */}
          <div className="h-[220px] flex-none flex flex-col bg-[#0A0A0C] border border-[#2A2D35] rounded-xl overflow-hidden shadow-2xl relative">
            <div className="bg-[#111318] h-7 border-b border-[#2A2D35] flex items-center px-4 justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">STDOUT // CONSULT</span>
              </div>
              <div className="text-[7px] font-mono text-slate-600 tracking-widest uppercase">SYSCAP: STABLE</div>
            </div>
            <div className="flex-1 p-3 font-mono text-[10px] text-indigo-300/80 overflow-y-auto no-scrollbar">
              <div className="opacity-30">
                <div>{'>'} INITIALIZING OS LAYER... [OK]</div>
                <div>{'>'} MOUNTING MEDIA DRIVE... [OK]</div>
                <div className="mt-2 text-indigo-500/50 italic selection:bg-indigo-500/20">Waiting for operator input sequence...</div>
              </div>
            </div>
            <div className="h-12 bg-black border-t border-[#2A2D35] flex items-center gap-2 px-2 p-1.5">
              <div className="flex-1 relative h-full">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConsult()}
                  disabled={isRunPending}
                  placeholder={`DISPATCH CMD // ${selectedAgent}...`}
                  className="w-full h-full bg-transparent px-4 py-2 text-[11px] text-white placeholder:text-slate-900 font-mono focus:outline-none"
                />
              </div>
              <button onClick={handleConsult} disabled={!chatInput.trim() || isRunPending} className="h-full px-5 bg-[#111318] border border-[#2A2D35] rounded text-[9px] font-black text-indigo-500 uppercase tracking-widest hover:bg-[#1A1C21] transition-all disabled:opacity-20 flex items-center gap-3">
                {isRunPending ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> SEND</>}
              </button>
            </div>
          </div>
        </div>

        {/* FAR RIGHT: AGENT SIDEBAR (Minimalist Column) */}
        <div className="w-16 flex-none flex flex-col bg-transparent p-0 relative overflow-hidden">
              <div className="py-2 flex items-center justify-center shrink-0">
                <span className="text-[7.5px] uppercase tracking-[0.4em] text-slate-700 font-bold">AGENTS</span>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar pt-1">
                <div className="flex flex-col gap-1">
                  {VISIBLE_SPECIALIST_KEYS.slice(0, 13).map((key) => {
                    const isSelected = selectedAgent === key;
                    let c;
                    if (key === 'ALPHA') {
                       c = HQ_AGENT_STYLE;
                    } else {
                       const regularKeys = VISIBLE_SPECIALIST_KEYS.filter(k => k !== 'ALPHA' && k !== 'OMEGA');
                       const idx = regularKeys.indexOf(key);
                       const row = Math.floor(idx / 4);
                       const col = idx % 4;
                       const lane = ROW_COLOR_LANES[row] || ROW_COLOR_LANES[0];
                       c = lane[col % lane.length] || lane[0];
                    }

                    return (
                       <button 
                          onClick={() => setSelectedAgent(key)} 
                          key={key} 
                          title={key}
                          className={`flex flex-col items-center justify-center p-1 cursor-pointer transition-all duration-300 group outline-none rounded-[var(--radius-card)] ${isSelected ? 'bg-white/5' : 'hover:bg-white/5'}`}
                       >
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center mb-0.5 transition-all duration-300 transform-gpu
                             ${isSelected 
                                ? `${c.bg.replace('950/50', '600/95').replace('950/45', '600/95').replace('900/50', '500/95').replace('900/45', '500/95').replace('800/45', '400/95').replace('500/10', '500/80')} ${c.border.replace('600/40', '400/95').replace('500/40', '400/95').replace('400/40', '300/95')} text-white shadow-[0_0_20px_${c.shadow.replace('0.2', '0.5')}] scale-110 ring-1 ring-white/20` 
                                : `opacity-60 group-hover:opacity-100 ${c.bg} ${c.border} ${c.icon || c.text} shadow-[0_0_8px_${c.shadow}] group-hover:shadow-[0_0_15px_${c.shadow.replace('0.2', '0.4')}] group-hover:scale-105`
                             } text-[9px] font-black tracking-tighter shrink-0`}>
                             {key.substring(0, 2).toUpperCase()}
                          </div>
                          <span className={`text-[6px] font-black uppercase tracking-tighter truncate w-full text-center transition-all duration-300 ${isSelected ? 'text-white scale-110' : 'text-slate-800'}`}>{key}</span>
                       </button>
                    );
                 })}
              </div>
           </div>
        </div>
      </div>

      {isPublishModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-[380px] bg-[#111318] border border-[#2A2D35] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#2A2D35] pb-4 -mx-6 px-6 bg-[#0A0A0C] h-12">
              <span className="text-[10px] font-black uppercase tracking-widest text-white">PUBLISH ARTIFACT</span>
              <button onClick={() => setIsPublishModalOpen(false)} className="text-slate-500 hover:text-white transition-all"><X size={16} /></button>
            </div>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block ml-0.5">TARGET ASSET</label>
                <select value={formState.assetId} onChange={e => updateField('assetId', e.target.value)} className="w-full rounded bg-black border border-[#2A2D35] px-3 py-2 text-[11px] text-white focus:outline-none font-mono">
                  <option value="">SELECT ARTIFACT</option>
                  {workspace.outputs.filter(o => o.type === 'render' || o.type === 'audio').map(o => (<option key={o.id} value={o.id}>{o.title}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block ml-0.5">DESTINATION ID</label>
                <input value={formState.publishTarget} onChange={e => updateField('publishTarget', e.target.value)} className="w-full rounded bg-black border border-[#2A2D35] px-3 py-2 text-[11px] text-white focus:outline-none font-mono" placeholder="GOOGLE DRIVE" />
              </div>
              <button onClick={async () => { setLaunchingAction('publish'); try { await createMediaPublishJobApi({ assetId: formState.assetId || activeOutput?.id, publishTarget: formState.publishTarget || 'GOOGLE_DRIVE' }); setIsPublishModalOpen(false); await loadWorkspace('refresh'); } catch (e) { setError(e.message); } finally { setLaunchingAction(''); } }} disabled={!formState.publishTarget || Boolean(launchingAction)} className="w-full h-11 rounded bg-sky-900 border border-sky-500 text-white text-[11px] font-black tracking-widest uppercase active:translate-y-0.5 shadow-xl transition-all disabled:opacity-40">INITIATE UPLINK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaModule;
