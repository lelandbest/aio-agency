import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Mic,
  Play,
  RefreshCw,
  Video,
  Waves,
  Volume2,
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
  Trash2,
  CloudUpload,
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { BullseyeIcon } from '../../components/ui/icons';
import {
  createMediaAudioRenderJobApi,
  createMediaRenderJobApi,
  createMediaRunOfShowJobApi,
  createMediaScriptJobApi,
  createMediaTranscriptJobApi,
  getMediaLibraryApi,
  getMediaAudioRenderJobsApi,
  getMediaPublishJobsApi,
  getMediaRenderJobsApi,
  getMediaJobStatusApi,
  getMediaRunOfShowJobsApi,
  getMediaScriptJobsApi,
  getMediaTranscriptJobsApi,
  ingestMeetingMediaApi,
  createMediaPublishJobApi,
  uploadMediaFileApi,
  runAiCommandApi,
  deleteMediaJobApi,
  deleteMediaArtifactApi,
  deleteMediaAssetApi,
  getApiBaseUrl,
  probeMediaAssetApi,
  withSessionToken,
  saveTranscriptApi,
} from '../../services/backendApi';
import { VISIBLE_SPECIALIST_KEYS, ROW_COLOR_LANES, HQ_AGENT_STYLE, OMEGA_AGENT_STYLE } from '../Agents/data/agentRegistry';
import { templates } from '../Flows/data/templates';
import { ingestFlowSource } from '../Flows/utils/flowIngestion';
import flowRepository from '../Flows/utils/flowRepository';

// Format seconds -> HH:MM:SS:FF (timecode display)
function formatTimecode(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // 30fps display
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
    String(f).padStart(2, '0'),
  ].join(':');
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const QUICK_ACTIONS = [
  { key: 'generateScript', label: 'Generate Script', icon: FileText, provider: 'stub-script' },
  { key: 'generateRunOfShow', label: 'Generate Run of Show', icon: ListChecks, provider: 'stub-run-of-show' },
  { key: 'generateVoice', label: 'Generate Voice', icon: AudioLines, provider: 'elevenlabs_tts' },
  { key: 'generateThumbnail', label: 'Generate Thumbnail', icon: ImageIcon, provider: 'stub-render' },
  { key: 'generateVideo', label: 'Generate Video', icon: Video, provider: 'stub-render' },
  { key: 'scribeMedia', label: 'Transcribe Media', icon: Waves, provider: 'elevenlabs_scribe' },
  { key: 'ingestMeetingArtifacts', label: 'Ingest Meeting Artifacts', icon: Mic, provider: 'zoom' },
  { key: 'publishMedia', label: 'Publish Media', icon: Send, provider: 'internal-publish' },
];

const QUICK_ACTION_MAP = QUICK_ACTIONS.reduce((accumulator, action) => {
  accumulator[action.key] = action;
  return accumulator;
}, {});

const INGESTION_SOURCES = [
  { id: 'zoom', label: 'ZOOM', color: 'bg-emerald-500' },
  { id: 'googleMeetDrive', label: 'MEET', color: 'bg-amber-500' },
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
  rawPayload: '',
  assetId: '',
  publishTarget: '',
};

const NEXUS_TABS = [
  { id: 'file', label: 'FILE INGEST' },
  { id: 'web', label: 'WEB INGEST' },
  { id: 'mcp', label: 'MCP LINK' },
];

function inferMediaFileTypeFromUrl(url) {
  const normalized = String(url || '').trim();
  if (!normalized) return 'mp4';
  const withoutQuery = normalized.split('?')[0] || normalized;
  const extension = withoutQuery.split('.').pop()?.toLowerCase();
  return extension || 'mp4';
}

function normalizeRecordingFile(rawFile, fallbackTitle) {
  if (!rawFile || typeof rawFile !== 'object') return null;
  const downloadUrl = String(
    rawFile.downloadUrl ||
    rawFile.download_url ||
    rawFile.sourceUrl ||
    rawFile.source_url ||
    rawFile.url ||
    ''
  ).trim();
  if (!downloadUrl) return null;
  return {
    downloadUrl,
    fileType: String(rawFile.fileType || rawFile.file_type || rawFile.mimeType || rawFile.mime_type || inferMediaFileTypeFromUrl(downloadUrl)).trim(),
    title: String(rawFile.title || rawFile.file_name || fallbackTitle || 'Nexus Ingest').trim(),
  };
}

function buildUrlIngestPayload({ provider = 'zoom', meetingId = '', meetingTitle = '', mediaUrl = '', title = '' }) {
  const downloadUrl = String(mediaUrl || '').trim();
  if (!downloadUrl) return null;
  const resolvedTitle = String(title || meetingTitle || 'Nexus Ingest').trim() || 'Nexus Ingest';
  return {
    provider,
    meetingId: String(meetingId || `nexus-${Date.now()}`).trim(),
    meetingTitle: String(meetingTitle || resolvedTitle).trim() || resolvedTitle,
    recordingFiles: [
      {
        downloadUrl,
        fileType: inferMediaFileTypeFromUrl(downloadUrl),
        title: resolvedTitle,
      },
    ],
  };
}

function normalizeIngestPayload(rawValue, fallback = {}) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  let payload = rawValue;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
      return buildUrlIngestPayload({ ...fallback, mediaUrl: trimmed });
    }
    try {
      payload = JSON.parse(trimmed);
    } catch {
      throw new Error('Nexus ingest expects a media URL or valid JSON payload.');
    }
  }

  if (typeof payload === 'string') {
    return buildUrlIngestPayload({ ...fallback, mediaUrl: payload });
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Nexus ingest expects structured data.');
  }

  const provider = String(payload.provider || payload.source || fallback.provider || 'zoom').trim() || 'zoom';
  const meetingTitle = String(payload.meetingTitle || payload.meeting_title || payload.title || fallback.meetingTitle || fallback.title || 'Nexus Ingest').trim() || 'Nexus Ingest';
  const meetingId = String(payload.meetingId || payload.meeting_id || payload.id || fallback.meetingId || `nexus-${Date.now()}`).trim();

  const rawFiles = Array.isArray(payload.recordingFiles)
    ? payload.recordingFiles
    : Array.isArray(payload.recording_files)
      ? payload.recording_files
      : [payload];

  const recordingFiles = rawFiles
    .map((item) => normalizeRecordingFile(item, meetingTitle))
    .filter(Boolean);

  return {
    provider,
    meetingId,
    meetingTitle,
    recordingFiles,
    transcriptText: payload.transcriptText || payload.transcript_text || '',
    speakerSegments: payload.speakerSegments || payload.speaker_segments || [],
  };
}

function getDropText(dataTransfer) {
  if (!dataTransfer) return '';
  return (
    dataTransfer.getData('text/uri-list') ||
    dataTransfer.getData('text/plain') ||
    dataTransfer.getData('text')
  ).trim();
}

function normalizeMediaJobType(value) {
  const normalized = String(value || '').trim();
  const typeMap = {
    runOfShow: 'run_of_show',
    'run-of-show': 'run_of_show',
    audioRender: 'audio',
    audio_render: 'audio',
    transcriptJob: 'transcript',
    renderJob: 'render',
    scriptJob: 'script',
    publishJob: 'publish',
  };
  return typeMap[normalized] || normalized;
}

function normalizeMediaArtifactDeleteType(value) {
  const normalized = String(value || '').trim();
  const typeMap = {
    runOfShow: 'run_of_show',
    'run-of-show': 'run_of_show',
  };
  return typeMap[normalized] || normalized;
}

const MEDIA_PILL_BASE =
  'inline-flex min-h-7 items-center gap-2 rounded-full border px-3 py-1 text-[8px] font-black uppercase leading-none tracking-[0.24em]';

function mediaStatusPillTone(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['success', 'complete', 'ready', 'live', 'ok'].includes(normalized)) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  }
  if (['running', 'processing', 'queued', 'loading'].includes(normalized)) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
  if (['failed', 'error', 'not_found'].includes(normalized)) {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  }
  return 'border-cyan-500/20 bg-cyan-500/5 text-cyan-300';
}

function normalizeCanonicalMediaType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'audio' || normalized === 'image') return normalized;
  return 'video';
}

function sortWorkspaceOutputs(outputs) {
  return [...outputs].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function sortWorkspaceJobs(jobs) {
  return [...jobs].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function normalizeWorkspaceOutputItem(output) {
  if (!output || typeof output !== 'object') return null;
  const assetId = String(output.assetId || output.id || '').trim();
  if (!assetId) return null;
  const mediaType = normalizeCanonicalMediaType(output.mediaType || output.media_type);
  const inferredArtifactType =
    output.artifactType ||
    (assetId.startsWith('transcript-artifact-')
      ? 'transcript'
      : assetId.startsWith('script-artifact-')
        ? 'script'
        : assetId.startsWith('run-of-show-artifact-')
          ? 'runOfShow'
          : assetId.startsWith('publish-artifact-')
            ? 'publish'
            : null);
  const recordKind = String(output.recordKind || (inferredArtifactType ? 'artifact' : 'asset')).trim() || 'asset';
  const artifactType = inferredArtifactType || null;
  const type = String(
    output.type ||
    (recordKind === 'artifact'
      ? artifactType || 'artifact'
      : mediaType === 'audio'
        ? 'audio'
        : mediaType === 'image'
          ? 'image'
          : 'render')
  ).trim();
  return {
    assetId,
    source: String(output.source || '').trim() || 'generated',
    type,
    status: String(output.status || 'complete').trim().toLowerCase() || 'complete',
    sourceUrl: output.sourceUrl || output.source_url || null,
    title: String(output.title || 'Media Asset').trim() || 'Media Asset',
    recordKind,
    artifactType,
    createdAt: output.createdAt || output.created_at || new Date().toISOString(),
    deleteType: output.deleteType || (recordKind === 'asset' ? 'asset' : artifactType || type),
    mediaType,
    metadata: output.metadata && typeof output.metadata === 'object' ? output.metadata : {},
  };
}

function normalizeWorkspaceJobItem(job, fallbackType = '') {
  if (!job || typeof job !== 'object') return null;
  const id = String(job.id || '').trim();
  if (!id) return null;
  const type = normalizeMediaJobType(job.type || fallbackType || String(id).split('-')[0]);
  return {
    id,
    title: String(job.title || 'Media Job').trim() || 'Media Job',
    type,
    status: String(job.status || 'queued').trim().toLowerCase() || 'queued',
    createdAt: job.createdAt || job.created_at || new Date().toISOString(),
    artifactId: job.artifactId || job.artifact_id || null,
    outputAssetIds: Array.isArray(job.outputAssetIds) ? job.outputAssetIds : (Array.isArray(job.output_asset_ids) ? job.output_asset_ids : []),
    result: job.result || null,
    lastError: job.lastError || job.last_error || null,
  };
}



const MediaModule = () => {
  const { openAIAssist } = useAIAssist();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedAction, setSelectedAction] = useState(null);
  const [nexusMode, setNexusMode] = useState('file');
  const [nexusDragActive, setNexusDragActive] = useState(false);
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isTranscriptModalOpen, setIsTranscriptModalOpen] = useState(false);
  const [transcriptState, setTranscriptState] = useState({
    title: '',
    transcript: '',
    executiveSummary: '',
    keyDecisions: [],
    actionItems: [],
    discussionHighlights: [],
    notesAndObservations: [],
    intentHint: '',
    purposeNote: '',
    priority: '',
    status: 'Draft',
  });
  const transcriptSavedStateRef = useRef(null); // Last saved state for dirty detection + reopen
  const [transcriptSaving, setTranscriptSaving] = useState(false);
  const [launchingAction, setLaunchingAction] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isRunPending, setIsRunPending] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('ALPHA');
  const [activeOutputId, setActiveOutputId] = useState(null);
  const [mediaView, setMediaView] = useState('outputs');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [workspace, setWorkspace] = useState({
    jobs: [],
    outputs: [],
    counts: { jobs: 0, outputs: 0, ingestSources: INGESTION_SOURCES.length },
  });

  // --- REAL PLAYER STATE ---
  const mediaRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef = useRef(null);
  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isLoading: false,
    loadError: null,
  });
  const [audioLevel, setAudioLevel] = useState(0); // 0-1 RMS from Web Audio
  const [probeData, setProbeData] = useState(null);  // result from /api/media/probe
  const [probePending, setProbePending] = useState(false);
  const [lastAction, setLastAction] = useState({ type: null, status: 'idle', result: null, error: null, timestamp: null });

  // --- IMAGE ADJUSTMENTS (applied as CSS filter to the preview) ---
  const [imgAdj, setImgAdj] = useState({ brightness: 100, contrast: 100, saturation: 100, hue: 0, opacity: 100 });
  const [activeJob, setActiveJob] = useState(null); // { id: string, type: string }

  const loadWorkspace = useCallback(async (mode = 'initial') => {
    const setBusy = mode === 'initial' ? setLoading : setRefreshing;
    setBusy(true);
    setError('');
    try {
      const [
        outputs, renderJobs, transcriptJobs,
        scriptJobs, runOfShowJobs,
        audioRenderJobs, publishJobs
      ] = await Promise.all([
        getMediaLibraryApi(), getMediaRenderJobsApi(), getMediaTranscriptJobsApi(),
        getMediaScriptJobsApi(), getMediaRunOfShowJobsApi(),
        getMediaAudioRenderJobsApi(), getMediaPublishJobsApi()
      ]);

      const jobs = [
        ...scriptJobs.map(j => ({ id: j.id, title: j.title || 'Script', type: 'script', status: j.status || 'queued', createdAt: j.createdAt })),
        ...runOfShowJobs.map(j => ({ id: j.id, title: j.title || 'Run of Show', type: 'runOfShow', status: j.status || 'queued', createdAt: j.createdAt })),
        ...audioRenderJobs.map(j => ({ id: j.id, title: j.title || 'Audio', type: 'audio', status: j.status || 'queued', createdAt: j.createdAt })),
        ...renderJobs.map(j => ({ id: j.id, title: j.title || 'Render', type: 'render', status: j.status || 'queued', createdAt: j.createdAt })),
        ...transcriptJobs.map(j => ({ id: j.id, title: j.title || 'Transcript', type: 'transcript', status: j.status || 'queued', createdAt: j.createdAt })),
        ...publishJobs.map(j => ({ id: j.id, title: j.title || 'Publish', type: 'publish', status: j.status || 'queued', createdAt: j.createdAt })),
      ];

      setWorkspace({
        jobs: sortWorkspaceJobs(jobs),
        outputs: sortWorkspaceOutputs(outputs),
        counts: { jobs: jobs.length, outputs: outputs.length, ingestSources: INGESTION_SOURCES.length },
      });
    } catch (e) {
      setError(e.message || 'Unable to load workspace.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const upsertOutputsInWorkspace = useCallback((incomingOutputs) => {
    const normalizedOutputs = incomingOutputs
      .map((output) => normalizeWorkspaceOutputItem(output))
      .filter(Boolean);
    if (!normalizedOutputs.length) return;
    setWorkspace((current) => {
      const outputMap = new Map(current.outputs.map((output) => [output.assetId, output]));
      normalizedOutputs.forEach((output) => {
        outputMap.set(output.assetId, { ...(outputMap.get(output.assetId) || {}), ...output });
      });
      const outputs = sortWorkspaceOutputs(Array.from(outputMap.values()));
      return {
        ...current,
        outputs,
        counts: {
          ...current.counts,
          outputs: outputs.length,
        },
      };
    });
  }, []);

  const upsertJobInWorkspace = useCallback((incomingJob, fallbackType = '') => {
    const normalizedJob = normalizeWorkspaceJobItem(incomingJob, fallbackType);
    if (!normalizedJob) return null;
    setWorkspace((current) => {
      const jobMap = new Map(current.jobs.map((job) => [job.id, job]));
      jobMap.set(normalizedJob.id, { ...(jobMap.get(normalizedJob.id) || {}), ...normalizedJob });
      const jobs = sortWorkspaceJobs(Array.from(jobMap.values()));
      return {
        ...current,
        jobs,
        counts: {
          ...current.counts,
          jobs: jobs.length,
        },
      };
    });
    return normalizedJob;
  }, []);

  const reconcileWorkspace = useCallback(() => {
    void loadWorkspace('refresh');
  }, [loadWorkspace]);

  const handlePollFailure = useCallback(async (message) => {
    setLastAction(prev => ({
      ...prev,
      status: 'failed',
      error: message,
      result: prev?.result || 'JOB STATUS UNAVAILABLE',
    }));
    setError(message);
  }, []);

  // --- PROBE ON ACTIVE OUTPUT CHANGE ---
  useEffect(() => {
    setProbeData(null);
    // Reset player when asset changes
    if (mediaRef.current) {
      mediaRef.current.pause();
      mediaRef.current.currentTime = 0;
    }
    setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0, duration: 0, loadError: null }));
    setAudioLevel(0);
  }, [activeOutputId]);

  useEffect(() => {
    const outputIds = workspace.outputs.map((output) => output.assetId);
    if (!outputIds.length) {
      if (activeOutputId !== null) {
        setActiveOutputId(null);
      }
      return;
    }
    if (activeOutputId && outputIds.includes(activeOutputId)) {
      return;
    }
    setActiveOutputId(outputIds[0]);
  }, [workspace.outputs, activeOutputId]);

  const handleProbeAsset = useCallback(async (output) => {
    if (!output?.sourceUrl) return;
    setProbePending(true);
    setLastAction({ type: 'PROBE', status: 'running', timestamp: Date.now() });
    try {
      const result = await probeMediaAssetApi({ sourceUrl: output.sourceUrl, assetId: output.assetId });
      setProbeData(result);
      setLastAction(prev => ({ ...prev, status: 'success', result: `METADATA RETRIEVED [${result.duration || '??'}s]` }));
    } catch (e) {
      setProbeData({ probeStatus: 'error' });
      setLastAction(prev => ({ ...prev, status: 'failed', error: e.message || 'PROBE FAILED' }));
      setLoading(false);
      setRefreshing(false);
    } finally {
      setProbePending(false);
    }
  }, []);

  // --- JOB POLLING LOOP ---
  useEffect(() => {
    let timer = null;
    if (activeJob) {
      const poll = async () => {
        try {
          const normalizedJobType = normalizeMediaJobType(activeJob.type);
          const job = await getMediaJobStatusApi(normalizedJobType, activeJob.id);
          if (!job) {
            await handlePollFailure('Media job status returned an empty response.');
            timer = setTimeout(poll, 4000);
            return;
          }

          const normalizedJob = upsertJobInWorkspace(job, normalizedJobType) || normalizeWorkspaceJobItem(job, normalizedJobType);
          const completedOutputId = normalizedJob?.outputAssetIds?.[0] || null;
          const completedArtifactId = normalizedJob?.artifactId || null;

          const stateMap = { queued: 'ACCEPTED', accepted: 'ACCEPTED', processing: 'RUNNING', complete: 'COMPLETE', failed: 'FAILED' };
          const displayStatus = stateMap[job.status] || job.status.toUpperCase();

          setLastAction(prev => ({
            ...prev,
            status: displayStatus === 'FAILED' ? 'failed' : (displayStatus === 'COMPLETE' ? 'success' : 'running'),
            result: displayStatus === 'FAILED'
              ? `ERROR: ${job.lastError}`
              : (job.result?.message || job.result || `JOB ID [${job.id.slice(-8)}] — ${displayStatus}`) + (displayStatus === 'COMPLETE' && completedArtifactId ? ` // ARTIFACT [${String(completedArtifactId).slice(-8)}]` : ''),
            error: job.lastError
          }));

          if (job.status === 'complete' || job.status === 'failed') {
            if (completedOutputId) {
              setActiveOutputId(completedOutputId);
            }
            setActiveJob(null);
            if (job.lastError) {
              setError(job.lastError);
            }
            reconcileWorkspace();
          } else {
            timer = setTimeout(poll, 1500);
          }
        } catch (err) {
          console.error("Polling error", err);
          await handlePollFailure(err?.message || 'Unable to fetch media job status.');
          timer = setTimeout(poll, 4000);
        }
      };
      timer = setTimeout(poll, 1500);
    }
    return () => clearTimeout(timer);
  }, [activeJob, handlePollFailure, reconcileWorkspace, upsertJobInWorkspace]);

  // --- REAL OSCILLOSCOPE DRAWING ---
  const drawOscilloscope = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!playerState.isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#06b6d4';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Simple RMS for the bar
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / bufferLength);
      setAudioLevel(prev => (rms > 0.001 ? Math.min(1, rms * 2) : 0)); // Boost slightly for visual impact
    };
    draw();
  }, [playerState.isPlaying]);

  useEffect(() => {
    if (playerState.isPlaying) {
      drawOscilloscope();
    } else {
      cancelAnimationFrame(animFrameRef.current);
      setAudioLevel(0);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playerState.isPlaying, drawOscilloscope]);

  // --- REAL TRANSPORT HANDLERS ---
  const handlePlay = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    // Set up Web Audio analyser if not yet connected
    if (!audioCtxRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        const src = ctx.createMediaElementSource(el);
        src.connect(analyser);
        analyser.connect(ctx.destination);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        sourceNodeRef.current = src;
      } catch (e) {
        console.error('AudioContext fail', e);
      }
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    el.play().catch(() => { });
  }, []);

  const handlePause = useCallback(() => {
    mediaRef.current?.pause();
  }, []);

  const handleStop = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  }, []);

  const handleSeek = useCallback((e) => {
    const el = mediaRef.current;
    if (!el || !playerState.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * playerState.duration;
  }, [playerState.duration]);

  const handleVolume = useCallback((e) => {
    const vol = parseFloat(e.target.value);
    if (mediaRef.current) mediaRef.current.volume = vol;
    setPlayerState(prev => ({ ...prev, volume: vol }));
  }, []);

  // Computed CSS filter string for the preview
  const previewFilter = useMemo(() => [
    `brightness(${imgAdj.brightness}%)`,
    `contrast(${imgAdj.contrast}%)`,
    `saturate(${imgAdj.saturation}%)`,
    `hue-rotate(${imgAdj.hue}deg)`,
    `opacity(${imgAdj.opacity}%)`,
  ].join(' '), [imgAdj]);

  const updateImgAdj = useCallback((key, val) => {
    setImgAdj(prev => ({ ...prev, [key]: val }));
  }, []);

  const activeAction = selectedAction ? QUICK_ACTION_MAP[selectedAction] || null : null;
  const updateField = useCallback((f, v) => setFormState(c => ({ ...c, [f]: v })), []);

  const assetOutputs = useMemo(() => workspace.outputs.filter((output) => output.recordKind === 'asset'), [workspace.outputs]);
  const sourceBackedAssets = useMemo(() => assetOutputs.filter((output) => output.sourceUrl), [assetOutputs]);
  const publishableAssets = useMemo(() => assetOutputs.filter((output) => output.type === 'render' || output.type === 'audio'), [assetOutputs]);

  useEffect(() => {
    if (!formState.assetId) return;
    const assetStillExists = sourceBackedAssets.some((output) => output.assetId === formState.assetId);
    if (assetStillExists) return;
    setFormState((current) => ({
      ...current,
      assetId: '',
      sourceUrl: '',
    }));
  }, [formState.assetId, sourceBackedAssets]);

  const resetActionForm = useCallback((key = null) => {
    const preferredAssetId = activeOutputId && assetOutputs.some((output) => output.assetId === activeOutputId) ? activeOutputId : '';
    const preferredAsset = assetOutputs.find((output) => output.assetId === preferredAssetId) || null;
    setSelectedAction(key);
    if (!key) {
      setNexusMode('file');
    }
    setFormState({
      ...DEFAULT_FORM_STATE,
      meetingProvider: key === 'ingestMeetingArtifacts' ? 'zoom' : DEFAULT_FORM_STATE.meetingProvider,
      assetId: key === 'scribeMedia' || key === 'publishMedia' ? preferredAssetId : '',
      sourceUrl: key === 'scribeMedia' ? (preferredAsset?.sourceUrl || '') : '',
      mediaUrl: key === 'ingestMeetingArtifacts' ? (preferredAsset?.sourceUrl || '') : '',
    });
  }, [activeOutputId, assetOutputs]);

  const toggleAction = useCallback((key) => {
    const next = selectedAction === key ? null : key;
    resetActionForm(next);
  }, [resetActionForm, selectedAction]);

  const activeOutput = useMemo(() => workspace.outputs.find(o => o.assetId === activeOutputId) || workspace.outputs[0], [workspace.outputs, activeOutputId]);
  const activeOutputPlaybackUrl = useMemo(() => {
    const rawUrl = String(activeOutput?.sourceUrl || '').trim();
    if (!rawUrl) return '';
    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }
    if (rawUrl.startsWith('/api/')) {
      return withSessionToken(`${getApiBaseUrl()}${rawUrl}`);
    }
    return rawUrl;
  }, [activeOutput?.sourceUrl]);
  const activeOutputIsAudio = useMemo(() => {
    const mediaType = String(activeOutput?.mediaType || '').toLowerCase();
    const outputType = String(activeOutput?.type || '').toLowerCase();
    return mediaType === 'audio' || outputType === 'audio';
  }, [activeOutput?.mediaType, activeOutput?.type]);
  const activeOutputIsImage = useMemo(() => {
    const mediaType = String(activeOutput?.mediaType || '').toLowerCase();
    const outputType = String(activeOutput?.type || '').toLowerCase();
    return mediaType === 'image' || outputType === 'image';
  }, [activeOutput?.mediaType, activeOutput?.type]);
  const activeOutputHasPlayableMedia = Boolean(activeOutput?.sourceUrl) && !activeOutputIsImage;
  const selectedSourceAsset = useMemo(() => {
    if (!formState.assetId) return null;
    return sourceBackedAssets.find((output) => output.assetId === formState.assetId) || null;
  }, [formState.assetId, sourceBackedAssets]);

  const setDroppedPayload = useCallback((value, nextMode) => {
    if (!value) return;
    if (nextMode) {
      setNexusMode(nextMode);
    }
    if (nextMode === 'web') {
      updateField('mediaUrl', value);
      return;
    }
    updateField('rawPayload', value);
  }, [updateField]);

  const resolveJobType = useCallback((jobId) => {
    const typeMap = {
      'script-job': 'script',
      'run-of-show-job': 'run_of_show',
      'audio-render-job': 'audio',
      'render-job': 'render',
      'transcript-job': 'transcript',
      'publish-job': 'publish',
    };
    const prefix = `${String(jobId || '').split('-').slice(0, 2).join('-')}`;
    return typeMap[prefix] || String(jobId || '').split('-')[0];
  }, []);

  const removeOutputFromWorkspace = useCallback((assetId) => {
    setWorkspace((current) => {
      const nextOutputs = current.outputs.filter((output) => output.assetId !== assetId);
      return {
        ...current,
        outputs: nextOutputs,
        counts: {
          ...current.counts,
          outputs: nextOutputs.length,
        },
      };
    });
  }, []);

  const removeJobFromWorkspace = useCallback((jobId) => {
    setWorkspace((current) => {
      const nextJobs = current.jobs.filter((job) => job.id !== jobId);
      return {
        ...current,
        jobs: nextJobs,
        counts: {
          ...current.counts,
          jobs: nextJobs.length,
        },
      };
    });
  }, []);

  const syncMediaMutation = useCallback(async (result, actionLabel) => {
    const mutationAsset = result?.asset || null;
    const mutationArtifacts = [result?.artifact, result?.transcriptArtifact].filter(Boolean);
    const nextAssets = Array.isArray(result?.assets)
      ? result.assets
      : mutationAsset
        ? [mutationAsset]
        : (result?.assetId ? [result] : []);
    const immediateOutputs = [...nextAssets, ...mutationArtifacts];
    const nextAssetId = nextAssets[0]?.assetId || nextAssets[0]?.id || null;
    const job = result?.job || result?.transcriptJob || null;
    const deduplicated = Boolean(result?.deduplicated);
    const normalizedOutputs = immediateOutputs
      .map((output) => normalizeWorkspaceOutputItem(output))
      .filter(Boolean);
    const normalizedJob = job ? upsertJobInWorkspace(job, resolveJobType(job.id)) : null;

    if (normalizedOutputs.length) {
      upsertOutputsInWorkspace(normalizedOutputs);
    }

    if (nextAssetId) {
      setActiveOutputId(nextAssetId);
    } else if (!job) {
      reconcileWorkspace();
    }

    if (job?.id) {
      setActiveJob({ id: job.id, type: normalizedJob?.type || resolveJobType(job.id) });
      setLastAction({
        type: actionLabel,
        status: 'running',
        result: nextAssetId ? `ASSET READY [${String(nextAssetId).slice(-8)}] // JOB [${String(job.id).slice(-8)}]` : `JOB ACCEPTED [${String(job.id).slice(-8)}]`,
        error: null,
        timestamp: Date.now(),
      });
      reconcileWorkspace();
      return;
    }

    setLastAction({
      type: actionLabel,
      status: 'success',
      result: nextAssetId
        ? `${deduplicated ? 'EXISTING ASSET' : 'ASSET READY'} [${String(nextAssetId).slice(-8)}]`
        : 'ACTION SUCCESSFUL',
      error: null,
      timestamp: Date.now(),
    });
    if (nextAssetId) {
      reconcileWorkspace();
    }
  }, [reconcileWorkspace, resolveJobType, upsertJobInWorkspace, upsertOutputsInWorkspace]);

  const handleNexusIngest = useCallback(async (actionLabel = 'NEXUS INGEST') => {
    const fallback = {
      provider: formState.meetingProvider,
      meetingId: formState.meetingId,
      meetingTitle: formState.meetingTitle,
      title: formState.title || formState.meetingTitle,
    };
    const payload = nexusMode === 'mcp'
      ? normalizeIngestPayload(formState.rawPayload, fallback)
      : nexusMode === 'web'
        ? buildUrlIngestPayload({ ...fallback, mediaUrl: formState.mediaUrl })
        : null;

    if (!payload) {
      throw new Error(nexusMode === 'file'
        ? 'Select or drop a local media file to upload.'
        : 'Provide a media URL or JSON payload to ingest.');
    }

    const result = await ingestMeetingMediaApi(payload);
    await syncMediaMutation(result, actionLabel);
  }, [formState.mediaUrl, formState.meetingId, formState.meetingProvider, formState.meetingTitle, formState.rawPayload, formState.title, nexusMode, syncMediaMutation]);

  const handleFileInputChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLaunchingAction('upload');
    setLastAction({ type: 'FILE INGEST', status: 'running', result: null, error: null, timestamp: Date.now() });
    setError('');
    try {
      const result = await uploadMediaFileApi(file);
      await syncMediaMutation(result, 'FILE INGEST');
    } catch (e) {
      setError(e.message);
      setLastAction(prev => ({ ...prev, status: 'failed', error: e.message || 'UPLOAD FAILED' }));
    } finally {
      event.target.value = '';
      setLaunchingAction('');
    }
  }, [syncMediaMutation]);

  const handleIngestDrop = useCallback(async (event) => {
    event.preventDefault();
    setNexusDragActive(false);
    if (nexusMode === 'file' && event.dataTransfer?.files?.length) {
      const file = event.dataTransfer.files[0];
      setLaunchingAction('upload');
      setLastAction({ type: 'FILE INGEST', status: 'running', result: null, error: null, timestamp: Date.now() });
      setError('');
      try {
        const result = await uploadMediaFileApi(file);
        await syncMediaMutation(result, 'FILE INGEST');
      } catch (e) {
        setError(e.message);
        setLastAction(prev => ({ ...prev, status: 'failed', error: e.message || 'UPLOAD FAILED' }));
      } finally {
        setLaunchingAction('');
      }
      return;
    }
    const droppedText = getDropText(event.dataTransfer);
    if (droppedText) {
      setDroppedPayload(droppedText, /^https?:\/\//i.test(droppedText) ? 'web' : 'mcp');
    }
  }, [nexusMode, setDroppedPayload, syncMediaMutation]);

  const handleSubmitQuickAction = useCallback(async () => {
    if (!selectedAction) {
      if (nexusMode === 'file') {
        fileInputRef.current?.click();
        return;
      }
      setLaunchingAction('nexus');
      setLastAction({ type: 'NEXUS INGEST', status: 'running', result: null, error: null, timestamp: Date.now() });
      setError('');
      try {
        await handleNexusIngest('NEXUS INGEST');
        setFormState((current) => ({ ...current, mediaUrl: '', rawPayload: '', meetingId: '', meetingTitle: '', title: '' }));
      } catch (e) {
        setError(e.message);
        setLastAction(prev => ({ ...prev, status: 'failed', error: e.message || 'INGEST FAILED' }));
      } finally {
        setLaunchingAction('');
      }
      return;
    }

    if (selectedAction === 'publishMedia') { setIsPublishModalOpen(true); return; }
    setLaunchingAction(selectedAction);
    setLastAction({ type: activeAction.label.toUpperCase(), status: 'running', result: null, error: null, timestamp: Date.now() });
    setError('');
    try {
      let r = null;
      if (selectedAction === 'generateScript') r = await createMediaScriptJobApi({ provider: activeAction.provider, title: formState.title || 'Script', topic: formState.topic, tone: formState.tone, duration: formState.duration });
      else if (selectedAction === 'generateRunOfShow') r = await createMediaRunOfShowJobApi({ provider: activeAction.provider, title: formState.title || 'Run of Show', topic: formState.topic });
      else if (selectedAction === 'generateVoice') r = await createMediaAudioRenderJobApi({ provider: activeAction.provider, title: formState.title || 'Voice', text: formState.text, voice: formState.voice, style: formState.style });
      else if (selectedAction === 'generateThumbnail') r = await createMediaRenderJobApi({ provider: activeAction.provider, title: formState.title || 'Thumbnail', mediaType: 'image', script: formState.prompt, metadata: { prompt: formState.prompt } });
      else if (selectedAction === 'generateVideo') r = await createMediaRenderJobApi({ provider: activeAction.provider, title: formState.title || 'Video', mediaType: 'video', script: formState.script, metadata: { prompt: formState.script } });
      else if (selectedAction === 'scribeMedia') {
        r = await createMediaTranscriptJobApi({
          provider: activeAction.provider,
          title: formState.title || 'Transcript',
          assetId: formState.assetId || selectedSourceAsset?.assetId || '',
          sourceAssetIds: formState.assetId || selectedSourceAsset?.assetId ? [formState.assetId || selectedSourceAsset?.assetId].filter(Boolean) : [],
          sourceUrl: formState.sourceUrl || selectedSourceAsset?.sourceUrl || '',
          transcriptText: formState.transcriptText,
        });
      } else if (selectedAction === 'ingestMeetingArtifacts') {
        const ingestPayload = formState.rawPayload
          ? normalizeIngestPayload(formState.rawPayload, {
            provider: formState.meetingProvider,
            meetingId: formState.meetingId,
            meetingTitle: formState.meetingTitle,
            title: formState.title || formState.meetingTitle,
          })
          : buildUrlIngestPayload({
            provider: formState.meetingProvider,
            meetingId: formState.meetingId,
            meetingTitle: formState.meetingTitle,
            title: formState.title || formState.meetingTitle,
            mediaUrl: formState.mediaUrl,
          });
        if (!ingestPayload) {
          throw new Error('Provide a media URL or raw JSON payload to ingest meeting artifacts.');
        }
        r = await ingestMeetingMediaApi(ingestPayload);
      }

      await syncMediaMutation(r, activeAction.label.toUpperCase());
      resetActionForm(selectedAction);
    } catch (e) {
      setError(e.message);
      setLastAction(prev => ({ ...prev, status: 'failed', error: e.message || 'ACTION FAILED' }));
    } finally {
      setLaunchingAction('');
    }
  }, [activeAction, formState, handleNexusIngest, nexusMode, resetActionForm, selectedAction, selectedSourceAsset, syncMediaMutation]);

  const handleDeleteOutput = useCallback(async (output, e) => {
    e?.stopPropagation();
    const targetType = normalizeMediaArtifactDeleteType(
      output.deleteType || (output.recordKind === 'asset' ? 'asset' : output.artifactType || output.type)
    );
    setPendingDelete({ id: output.assetId, type: targetType, subtype: output.type });
  }, []);

  const confirmDeleteOutput = useCallback(async () => {
    if (!pendingDelete) return;
    const deleteTarget = pendingDelete;
    try {
      if (deleteTarget.type === 'asset') {
        await deleteMediaAssetApi(deleteTarget.id);
      } else {
        await deleteMediaArtifactApi(deleteTarget.type, deleteTarget.id);
      }
      removeOutputFromWorkspace(deleteTarget.id);
      if (activeOutputId === deleteTarget.id) setActiveOutputId(null);
      setLastAction({
        type: 'DELETE',
        status: 'success',
        result: `REMOVED [${String(deleteTarget.id).slice(-8)}]`,
        error: null,
        timestamp: Date.now(),
      });
      reconcileWorkspace();
    } catch (err) {
      if (/not found/i.test(String(err?.message || ''))) {
        removeOutputFromWorkspace(deleteTarget.id);
        if (activeOutputId === deleteTarget.id) setActiveOutputId(null);
        setLastAction({
          type: 'DELETE',
          status: 'success',
          result: `ALREADY REMOVED [${String(deleteTarget.id).slice(-8)}]`,
          error: null,
          timestamp: Date.now(),
        });
        reconcileWorkspace();
      } else {
        setError(err.message);
        setLastAction(prev => ({
          ...prev,
          type: 'DELETE',
          status: 'failed',
          error: err.message || 'DELETE FAILED',
          timestamp: Date.now(),
        }));
      }
      return;
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, activeOutputId, reconcileWorkspace, removeOutputFromWorkspace]);

  const handleDeleteJob = useCallback(async (job, e) => {
    e?.stopPropagation();
    const typeMap = { runOfShow: 'run_of_show', transcript: 'transcript', script: 'script', publish: 'publish', audio: 'audio', render: 'render' };
    const jobType = normalizeMediaJobType(typeMap[job.type] || job.type);
    setPendingDelete({ id: job.id, type: jobType, isJob: true });
  }, []);

  const confirmDeleteJob = useCallback(async () => {
    if (!pendingDelete) return;
    const deleteTarget = pendingDelete;
    try {
      await deleteMediaJobApi(deleteTarget.type, deleteTarget.id);
      removeJobFromWorkspace(deleteTarget.id);
      if (activeJob?.id === deleteTarget.id) {
        setActiveJob(null);
      }
      setLastAction({
        type: 'DELETE JOB',
        status: 'success',
        result: `REMOVED JOB [${String(deleteTarget.id).slice(-8)}]`,
        error: null,
        timestamp: Date.now(),
      });
      reconcileWorkspace();
    } catch (err) {
      if (/not found/i.test(String(err?.message || ''))) {
        removeJobFromWorkspace(deleteTarget.id);
        if (activeJob?.id === deleteTarget.id) {
          setActiveJob(null);
        }
        setLastAction({
          type: 'DELETE JOB',
          status: 'success',
          result: `JOB ALREADY REMOVED [${String(deleteTarget.id).slice(-8)}]`,
          error: null,
          timestamp: Date.now(),
        });
        reconcileWorkspace();
      } else {
        setError(err.message);
        setLastAction(prev => ({
          ...prev,
          type: 'DELETE JOB',
          status: 'failed',
          error: err.message || 'JOB DELETE FAILED',
          timestamp: Date.now(),
        }));
      }
      return;
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, activeJob, reconcileWorkspace, removeJobFromWorkspace]);

  const handleConsult = useCallback(async () => {
    if (!chatInput.trim() || isRunPending) return;
    setIsRunPending(true);
    setError('');
    try {
      await runAiCommandApi({
        command: chatInput.trim(),
        agent: selectedAgent,
        context: { module: 'media', surface: 'consult_terminal', activeAssetId: activeOutput?.assetId || null }
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
    const compactButtonClass = "px-2 py-1 text-[7px] font-black uppercase tracking-[0.25em] rounded border transition-all";

    const renderInlineAssetFallback = (actionLabel) => (
      <div
        onDragOver={(event) => { event.preventDefault(); setNexusDragActive(true); }}
        onDragLeave={() => setNexusDragActive(false)}
        onDrop={handleIngestDrop}
        className={`rounded-lg border border-dashed p-3 transition-all ${nexusDragActive ? 'border-cyan-400 bg-cyan-950/10' : 'border-cyan-900/60 bg-black/20'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[8px] font-black uppercase tracking-[0.35em] text-cyan-400">ASSET REQUIRED</div>
            <div className="text-[8px] font-mono text-slate-500 uppercase tracking-[0.18em]">{actionLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => resetActionForm(null)}
            className={`${compactButtonClass} border-cyan-900/60 text-cyan-500 hover:border-cyan-500/40 hover:text-cyan-300`}
          >
            OPEN NEXUS
          </button>
        </div>
        <p className="mt-2 text-[8px] leading-4 text-slate-500">
          Drop or paste a media URL / JSON payload here to seed a real asset for this action.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <label>
            <span className={labelClass}>MEDIA URL</span>
            <input
              value={formState.mediaUrl}
              onChange={(e) => updateField('mediaUrl', e.target.value)}
              className={inputClass}
              placeholder="https://cdn.example.com/meeting.wav"
            />
          </label>
          <label>
            <span className={labelClass}>RAW PAYLOAD</span>
            <textarea
              value={formState.rawPayload}
              onChange={(e) => updateField('rawPayload', e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder='{"provider":"zoom","recordingFiles":[{"downloadUrl":"https://..."}]}'
            ></textarea>
          </label>
        </div>
      </div>
    );

    const renderNexusDropZone = () => (
      <div className="flex h-full flex-col gap-2">
        <div className="flex justify-center gap-1">
          {NEXUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setNexusMode(tab.id)}
              className={`px-2 py-0.5 text-[6px] font-black uppercase tracking-[0.22em] rounded border transition-all ${nexusMode === tab.id ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-[#1E2024] bg-black/20 text-slate-500 hover:text-slate-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {nexusMode === 'file' ? (
          <div
            onDragOver={(event) => { event.preventDefault(); setNexusDragActive(true); }}
            onDragLeave={() => setNexusDragActive(false)}
            onDrop={handleIngestDrop}
            className="flex flex-1 items-center justify-center"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex h-full max-h-[280px] w-full max-w-[208px] cursor-pointer flex-col items-center rounded-[22px] border border-dashed px-3.5 py-3.5 text-center transition-all ${nexusDragActive ? 'border-cyan-400 bg-cyan-950/10 shadow-[0_0_20px_rgba(34,211,238,0.14)]' : 'border-cyan-900/70 bg-[#05070B]'}`}
            >
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-950/80 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.15),rgba(8,15,32,0.96)_70%)] shadow-[inset_0_0_0_1px_rgba(14,165,233,0.06),0_0_18px_rgba(15,23,42,0.6)]">
                  <CloudUpload size={22} className="text-cyan-400" strokeWidth={1.8} />
                </div>
                <div className="mt-4 flex flex-col items-center">
                  <div className="text-[17px] font-black uppercase leading-none tracking-[0.28em] text-slate-100">NEXUS</div>
                  <div className="mt-1 text-[10px] font-black uppercase leading-none tracking-[0.34em] text-[#9fb8d7]">DROP ZONE</div>
                </div>
                <div className="mt-3 text-[7px] font-black uppercase tracking-[0.16em] text-slate-500">
                  DROP ASSETS OR PASTE JSON/RAW DATA
                </div>
              </div>
              <div className="mt-3 rounded-full border border-cyan-900/70 bg-black/30 px-2 py-0.5 text-[6px] font-black uppercase tracking-[0.2em] text-cyan-400">
                EXTENSION AWARE
              </div>
            </button>
          </div>
        ) : nexusMode === 'web' ? (
          <div className="flex flex-1 flex-col rounded-xl border border-[#1E2024] bg-black/25 p-4">
            <div className="mb-3 text-[8px] font-black uppercase tracking-[0.34em] text-cyan-400">WEB INGEST</div>
            <div className="flex flex-1 flex-col gap-2">
              <label>
                <span className={labelClass}>MEDIA URL</span>
                <input
                  value={formState.mediaUrl}
                  onChange={(e) => updateField('mediaUrl', e.target.value)}
                  className={inputClass}
                  placeholder="https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className={labelClass}>MEETING ID</span>
                  <input value={formState.meetingId} onChange={(e) => updateField('meetingId', e.target.value)} className={inputClass} placeholder="NEXUS-INGEST-001" />
                </label>
                <label>
                  <span className={labelClass}>TITLE</span>
                  <input value={formState.meetingTitle} onChange={(e) => updateField('meetingTitle', e.target.value)} className={inputClass} placeholder="Nexus Web Ingest" />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col rounded-xl border border-[#1E2024] bg-black/25 p-4">
            <div className="mb-3 text-[8px] font-black uppercase tracking-[0.34em] text-cyan-400">MCP LINK</div>
            <label className="flex flex-1 flex-col">
              <span className={labelClass}>JSON / RAW DATA</span>
              <textarea
                value={formState.rawPayload}
                onChange={(e) => updateField('rawPayload', e.target.value)}
                rows={8}
                className={`${inputClass} h-full resize-none`}
                placeholder={'https://cdn.example.com/recording.wav\nor\n{"provider":"zoom","recordingFiles":[{"downloadUrl":"https://..."}]}'}
              ></textarea>
            </label>
          </div>
        )}
      </div>
    );

    if (!selectedAction) {
      return renderNexusDropZone();
    }
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
    if (selectedAction === 'generateRunOfShow') {
      return (
        <div className="flex flex-col gap-2">
          <label><span className={labelClass}>PROP // SHOW TITLE</span><input value={formState.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} placeholder="OPS HUDDLE" /></label>
          <label><span className={labelClass}>CORE TOPIC</span><input value={formState.topic} onChange={(e) => updateField('topic', e.target.value)} className={inputClass} placeholder="LAUNCH RECAP" /></label>
        </div>
      );
    }
    if (selectedAction === 'generateVoice') {
      return (
        <div className="flex flex-col gap-2">
          <label><span className={labelClass}>PROP // VOICE TITLE</span><input value={formState.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} placeholder="VOICE RENDER" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label><span className={labelClass}>VOICE</span><input value={formState.voice} onChange={(e) => updateField('voice', e.target.value)} className={inputClass} placeholder="Rachel" /></label>
            <label><span className={labelClass}>STYLE</span><input value={formState.style} onChange={(e) => updateField('style', e.target.value)} className={inputClass} placeholder="Conversational" /></label>
          </div>
          <label><span className={labelClass}>SCRIPT INPUT</span><textarea value={formState.text} onChange={(e) => updateField('text', e.target.value)} rows={4} className={`${inputClass} resize-none`} placeholder="Paste the script to render..."></textarea></label>
        </div>
      );
    }
    if (selectedAction === 'generateThumbnail') {
      return (
        <div className="flex flex-col gap-2">
          <label><span className={labelClass}>PROP // ASSET TITLE</span><input value={formState.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} placeholder="IMG GEN" /></label>
          <label><span className={labelClass}>SUBTITLE</span><input value={formState.subtitle} onChange={(e) => updateField('subtitle', e.target.value)} className={inputClass} placeholder="SUB ATTR" /></label>
          <label><span className={labelClass}>SOURCE URI</span><input value={formState.sourceUrl} onChange={(e) => updateField('sourceUrl', e.target.value)} className={inputClass} placeholder="S3 BUCKET URI" /></label>
          <label><span className={labelClass}>COMMAND PROMPT</span><textarea value={formState.prompt} onChange={(e) => updateField('prompt', e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="GEN PROMPT..."></textarea></label>
        </div>
      );
    }
    if (selectedAction === 'generateVideo') {
      return (
        <div className="flex flex-col gap-2">
          <label><span className={labelClass}>PROP // VIDEO TITLE</span><input value={formState.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} placeholder="MISSION CLIP" /></label>
          <label><span className={labelClass}>SCRIPT / PROMPT</span><textarea value={formState.script} onChange={(e) => updateField('script', e.target.value)} rows={4} className={`${inputClass} resize-none`} placeholder="Describe the render intent..."></textarea></label>
        </div>
      );
    }
    if (selectedAction === 'scribeMedia') {
      if (!sourceBackedAssets.length) {
        return renderInlineAssetFallback('TRANSCRIBE MEDIA');
      }
      return (
        <div className="flex flex-col gap-2">
          <label>
            <span className={labelClass}>TARGET ASSET</span>
            <select value={formState.assetId} onChange={(e) => updateField('assetId', e.target.value)} className={inputClass}>
              <option value="">SELECT SOURCE ASSET</option>
              {sourceBackedAssets.map((output) => (
                <option key={output.assetId} value={output.assetId}>{output.title}</option>
              ))}
            </select>
          </label>
          <label><span className={labelClass}>TRANSCRIPT TITLE</span><input value={formState.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} placeholder="Transcript Job" /></label>
          <label><span className={labelClass}>SOURCE URL</span><input value={formState.sourceUrl || selectedSourceAsset?.sourceUrl || ''} onChange={(e) => updateField('sourceUrl', e.target.value)} className={inputClass} placeholder="Asset URL auto-fills when selected" /></label>
          <label><span className={labelClass}>INLINE TRANSCRIPT OVERRIDE</span><textarea value={formState.transcriptText} onChange={(e) => updateField('transcriptText', e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Optional direct transcript input..."></textarea></label>
        </div>
      );
    }
    if (selectedAction === 'ingestMeetingArtifacts') {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label className="w-24">
              <span className={labelClass}>PROVIDER</span>
              <select value={formState.meetingProvider} onChange={(e) => updateField('meetingProvider', e.target.value)} className={inputClass}>
                <option value="zoom">ZOOM</option>
                <option value="googleMeetDrive">MEET DRIVE</option>
                <option value="jitsi">JITSI</option>
              </select>
            </label>
            <label className="flex-1"><span className={labelClass}>MEETING ID</span><input value={formState.meetingId} onChange={(e) => updateField('meetingId', e.target.value)} className={inputClass} placeholder="NEXUS-INGEST-001" /></label>
          </div>
          <label><span className={labelClass}>MEETING TITLE</span><input value={formState.meetingTitle} onChange={(e) => updateField('meetingTitle', e.target.value)} className={inputClass} placeholder="Nexus Ingest Session" /></label>
          <label><span className={labelClass}>MEDIA URL</span><input value={formState.mediaUrl} onChange={(e) => updateField('mediaUrl', e.target.value)} className={inputClass} placeholder="https://cdn.example.com/meeting.wav" /></label>
          <label><span className={labelClass}>RAW PAYLOAD</span><textarea value={formState.rawPayload} onChange={(e) => updateField('rawPayload', e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder='{"provider":"zoom","recordingFiles":[{"downloadUrl":"https://..."}]}'></textarea></label>
        </div>
      );
    }
    if (selectedAction === 'publishMedia') {
      if (!publishableAssets.length) {
        return renderInlineAssetFallback('PUBLISH MEDIA');
      }
      return (
        <div className="flex flex-col gap-2">
          <label>
            <span className={labelClass}>TARGET ASSET</span>
            <select value={formState.assetId} onChange={(e) => updateField('assetId', e.target.value)} className={inputClass}>
              <option value="">USE ACTIVE ASSET</option>
              {publishableAssets.map((output) => (
                <option key={output.assetId} value={output.assetId}>{output.title}</option>
              ))}
            </select>
          </label>
          <label><span className={labelClass}>PUBLISH TARGET</span><input value={formState.publishTarget} onChange={(e) => updateField('publishTarget', e.target.value)} className={inputClass} placeholder="GOOGLE_DRIVE" /></label>
          <div className="rounded border border-[#1E2024] bg-black/20 px-3 py-2 text-[8px] leading-4 text-slate-500">
            Publish still runs through the existing modal. This panel lets you stage the asset target before execution.
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <label><span className={labelClass}>PROP // MISSION DATA</span><textarea value={formState.text || formState.script || formState.transcriptText} onChange={(e) => updateField('text', e.target.value)} rows={4} className={`${inputClass} resize-none`} placeholder="SYSTEM DATA BUF"></textarea></label>
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

  const hasNexusInput = Boolean(formState.mediaUrl.trim() || formState.rawPayload.trim());
  const canExecuteSelectedAction = (() => {
    if (!selectedAction) {
      return nexusMode === 'file' || hasNexusInput;
    }
    if (selectedAction === 'scribeMedia') {
      return Boolean(formState.transcriptText.trim() || formState.sourceUrl.trim() || selectedSourceAsset?.sourceUrl);
    }
    if (selectedAction === 'ingestMeetingArtifacts') {
      return hasNexusInput;
    }
    if (selectedAction === 'publishMedia') {
      return Boolean(formState.publishTarget.trim() || publishableAssets.length);
    }
    return true;
  })();

  const primaryButtonLabel = launchingAction
    ? 'RUNNING...'
    : !selectedAction
      ? (nexusMode === 'file' ? 'UPLOAD FILE' : 'INGEST')
      : selectedAction === 'publishMedia'
        ? 'OPEN PUBLISH'
        : 'EXECUTE';

  if (loading && !workspace.outputs.length) return <div className="flex h-full items-center justify-center bg-black text-cyan-500 font-mono text-xs uppercase tracking-widest">INITIAL LOADING SEQUENCE...</div>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-[#070708] text-slate-300">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*,image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <div className="shrink-0">
        <ModuleHeader
          title="Media Workstation"
          showTitle={false}
          leftActions={[
            {
              label: 'OPEN FLOWS',
              icon: GitMerge,
              onClick: () => window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'flows' } })),
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
          actions={[
            {
              label: 'REFRESH',
              icon: RefreshCw,
              onClick: () => loadWorkspace('refresh'),
              className: refreshing ? 'animate-spin' : ''
            }
          ]}
        />
        <div
          className="pointer-events-none absolute inset-y-0 hidden lg:block"
          style={{ left: 'calc((((100% - 404px) * 6) / 11) + 202px)' }}
        >
          <div className="pointer-events-auto flex h-full -translate-x-1/2 items-center justify-center">
            <div
              className="flex items-center justify-center gap-3 rounded-lg border border-white/5 bg-black/25 px-3 py-1.5 aio-tooltip"
              data-tooltip={`Monitoring for Zoom, Meet,\nand Jitsi. Active API\nintegrations are required to\nperform proper ingestion / sync.`}
            >
              <span className="text-[8px] font-black text-cyan-500/70 uppercase tracking-[0.28em]">UPLINK STATUS</span>
              <div className="flex items-center gap-3 cursor-help">
                {INGESTION_SOURCES.map((source) => (
                  <div key={source.id} className={`${MEDIA_PILL_BASE} min-h-6 gap-1.5 border-white/5 bg-black/30 px-2.5 py-1 text-[7px] text-slate-300`}>
                    <div className={`h-1.5 w-1.5 rounded-full ${source.color} shadow-[0_0_5px_rgba(0,0,0,0.5)]`} />
                    <span className="font-bold uppercase tracking-[0.18em]">{source.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-4 pe-4 py-4 bg-[#08080A]">
        {/* LEFT WORKSTATION: MONITOR A */}
        <div className="flex-[1.2] min-w-0 flex flex-col bg-[#111318] rounded-xl border border-[#1E2024] relative items-center gap-3">
          <div className="absolute top-4 left-5 flex items-center gap-2 z-10 px-2 py-0.5 rounded bg-black/60 backdrop-blur border border-white/5">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></div>
            <span className="text-[7px] uppercase tracking-[0.4em] text-slate-400 font-black">MON A // PROG</span>
          </div>

          {/* MONITOR A: PLAYER — real browser media element */}
          <div className="w-full aspect-video bg-black rounded-lg border-[6px] border-[#0A0A0C] shadow-[0_12px_24px_rgba(0,0,0,0.82)] overflow-hidden flex flex-col justify-center items-center group relative">
            {activeOutput?.sourceUrl ? (
              <>
                <div className="absolute top-2 left-2 right-2 flex items-center justify-center gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => window.open(activeOutputPlaybackUrl, '_blank')} className={`${MEDIA_PILL_BASE} border-cyan-500/30 bg-black/75 px-3 py-1 text-cyan-300 hover:bg-black`}>
                    <ExternalLink size={10} /> OPEN
                  </button>
                  <a href={activeOutputPlaybackUrl} download={activeOutput.title || 'download'} className={`${MEDIA_PILL_BASE} border-emerald-500/30 bg-black/75 px-3 py-1 text-emerald-300 hover:bg-black`}>
                    <Download size={10} /> DOWNLOAD
                  </a>
                  <button
                    onClick={() => handleProbeAsset(activeOutput)}
                    disabled={probePending}
                    className={`${MEDIA_PILL_BASE} border-amber-500/30 bg-black/75 px-3 py-1 text-amber-300 hover:bg-black disabled:opacity-40`}
                  >
                    {probePending ? <Loader2 size={10} className="animate-spin" /> : <Waves size={10} />} PROBE
                  </button>
                  <button onClick={(e) => handleDeleteOutput(activeOutput, e)} className={`${MEDIA_PILL_BASE} border-red-500/30 bg-black/75 px-3 py-1 text-red-300 hover:bg-black`}>
                    <Trash2 size={10} /> DELETE
                  </button>
                </div>
                {playerState.loadError && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 pointer-events-none">
                    <div className="bg-rose-950/80 border border-rose-700/50 px-4 py-2 rounded text-[9px] font-mono text-rose-300 uppercase tracking-wider">
                      LOAD ERROR: {playerState.loadError}
                    </div>
                  </div>
                )}
                {playerState.isLoading && !playerState.loadError && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 pointer-events-none">
                    <Loader2 size={20} className="text-cyan-500 animate-spin" />
                  </div>
                )}
                {activeOutputIsAudio ? (
                  <>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.08),rgba(0,0,0,0.92)_68%)] pointer-events-none">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-900/60 bg-cyan-950/10 shadow-[0_0_20px_rgba(8,145,178,0.14)]">
                        <AudioLines size={24} className="text-cyan-400" />
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.45em] text-cyan-400">Audio Preview</div>
                        <div className="mt-1.5 text-[8px] font-mono uppercase tracking-[0.22em] text-slate-500">
                          {activeOutput?.title || 'Source Audio'}
                        </div>
                      </div>
                    </div>
                    <audio
                      ref={mediaRef}
                      src={activeOutputPlaybackUrl}
                      crossOrigin="anonymous"
                      className="h-0 w-0 opacity-0"
                      preload="metadata"
                      onPlay={() => setPlayerState(prev => ({ ...prev, isPlaying: true }))}
                      onPause={() => setPlayerState(prev => ({ ...prev, isPlaying: false }))}
                      onEnded={() => setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }))}
                      onTimeUpdate={() => setPlayerState(prev => ({ ...prev, currentTime: mediaRef.current?.currentTime ?? 0 }))}
                      onDurationChange={() => setPlayerState(prev => ({ ...prev, duration: mediaRef.current?.duration ?? 0 }))}
                      onWaiting={() => setPlayerState(prev => ({ ...prev, isLoading: true }))}
                      onCanPlay={() => setPlayerState(prev => ({ ...prev, isLoading: false }))}
                      onError={(e) => setPlayerState(prev => ({ ...prev, loadError: e.target.error?.message || 'Failed to load', isLoading: false }))}
                      onLoadStart={() => setPlayerState(prev => ({ ...prev, isLoading: true, loadError: null }))}
                    />
                  </>
                ) : activeOutputIsImage ? (
                  <div className="relative flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.06),rgba(0,0,0,0.94)_70%)]">
                    <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full border border-cyan-900/40 bg-black/45 px-3 py-1 text-[8px] font-black uppercase tracking-[0.28em] text-cyan-300">
                      <ImageIcon size={12} />
                      IMAGE PREVIEW
                    </div>
                    <img
                      src={activeOutputPlaybackUrl}
                      alt={activeOutput?.title || 'Image preview'}
                      className="max-h-full max-w-full object-contain"
                      style={{ filter: previewFilter }}
                      onLoad={() => setPlayerState(prev => ({ ...prev, isLoading: false, loadError: null }))}
                      onError={() => setPlayerState(prev => ({ ...prev, loadError: 'Failed to load image', isLoading: false }))}
                    />
                  </div>
                ) : (
                  <video
                    ref={mediaRef}
                    src={activeOutputPlaybackUrl}
                    crossOrigin="anonymous"
                    className="w-full h-full object-contain"
                    controls={false}
                    preload="metadata"
                    style={{ filter: previewFilter }}
                    onPlay={() => setPlayerState(prev => ({ ...prev, isPlaying: true }))}
                    onPause={() => setPlayerState(prev => ({ ...prev, isPlaying: false }))}
                    onEnded={() => setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }))}
                    onTimeUpdate={() => setPlayerState(prev => ({ ...prev, currentTime: mediaRef.current?.currentTime ?? 0 }))}
                    onDurationChange={() => setPlayerState(prev => ({ ...prev, duration: mediaRef.current?.duration ?? 0 }))}
                    onWaiting={() => setPlayerState(prev => ({ ...prev, isLoading: true }))}
                    onCanPlay={() => setPlayerState(prev => ({ ...prev, isLoading: false }))}
                    onError={(e) => setPlayerState(prev => ({ ...prev, loadError: e.target.error?.message || 'Failed to load', isLoading: false }))}
                    onLoadStart={() => setPlayerState(prev => ({ ...prev, isLoading: true, loadError: null }))}
                  />
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="flex flex-col w-full h-48 border border-white/5 overflow-hidden">
                  <div className="flex h-[60%] w-full">
                    {['bg-[#C0C0C0]', 'bg-[#C0C000]', 'bg-[#00C0C0]', 'bg-[#00C000]', 'bg-[#C000C0]', 'bg-[#C00000]', 'bg-[#0000C0]'].map((c, i) => (
                      <div key={i} className={`flex-1 ${c}`}></div>
                    ))}
                  </div>
                  <div className="flex h-[10%] w-full">
                    {['bg-[#0000C0]', 'bg-[#131313]', 'bg-[#C000C0]', 'bg-[#131313]', 'bg-[#00C0C0]', 'bg-[#131313]', 'bg-[#C0C0C0]'].map((c, i) => (
                      <div key={i} className={`flex-1 ${c}`}></div>
                    ))}
                  </div>
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

          {/* COMPACT PLAYER TRANSPORT — wired to real mediaRef */}
          <div className="w-full bg-[#0A0A0C] rounded-lg border border-[#1E2024] flex flex-col shadow-inner overflow-hidden">
            {/* Seek bar */}
            {activeOutputHasPlayableMedia && (
              <div
                className="w-full h-1.5 bg-black/60 cursor-pointer group relative"
                onClick={handleSeek}
              >
                <div
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-none"
                  style={{ width: `${playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0}%` }}
                />
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </div>
            )}
            <div className="h-10 flex items-center px-3 justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={playerState.isPlaying ? handlePause : handlePlay}
                  disabled={!activeOutputHasPlayableMedia}
                  className="w-8 h-8 rounded-md bg-[#1A1C21] border border-white/5 flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-colors disabled:opacity-30"
                >
                  {playerState.isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                </button>
                <button
                  onClick={handleStop}
                  disabled={!activeOutputHasPlayableMedia}
                  className="w-8 h-8 rounded-md bg-[#1A1C21] border border-white/5 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-30"
                >
                  <Square size={10} fill="currentColor" />
                </button>
                <div className="h-4 w-px bg-white/5 mx-1" />
                <Volume2 size={10} className="text-slate-600" />
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={playerState.volume}
                  onChange={handleVolume}
                  disabled={!activeOutputHasPlayableMedia}
                  className="w-14 media-range cursor-pointer disabled:opacity-30"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-slate-500">{formatDuration(playerState.currentTime)}</span>
                <span className="text-[7px] font-mono text-slate-700">/</span>
                <span className="text-[8px] font-mono text-slate-500">{formatDuration(playerState.duration)}</span>
                <div className={`${MEDIA_PILL_BASE} min-h-6 gap-1 border-cyan-500/15 bg-cyan-500/5 px-2.5 py-1 text-[7px] text-cyan-400 ml-2`}>
                  {formatTimecode(playerState.currentTime)}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full min-h-10 bg-[#0A0A0C] rounded-md border border-[#1E2024] flex items-center px-3 justify-between shadow-inner gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[9px] text-cyan-500 font-mono uppercase tracking-[0.22em]">{activeOutput?.title || 'NO ASSET'}</div>
              {probeData?.duration && (
                <div className={`${MEDIA_PILL_BASE} min-h-6 gap-1.5 border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[7px] text-emerald-300`}>
                  <span className="text-slate-500">DUR</span>
                  <span>{formatDuration(probeData.duration)}</span>
                </div>
              )}
              {probeData?.codecSummary && (
                <div className={`${MEDIA_PILL_BASE} min-h-6 gap-1.5 border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[7px] text-sky-300`}>
                  <span className="text-slate-500">CODEC</span>
                  <span>{probeData.codecSummary.toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className={`${MEDIA_PILL_BASE} ${playerState.isPlaying ? mediaStatusPillTone('live') : playerState.isLoading ? mediaStatusPillTone('loading') : activeOutputHasPlayableMedia || activeOutputIsImage ? mediaStatusPillTone('ready') : 'border-slate-700 bg-black/30 text-slate-600'}`}>
              {playerState.isPlaying ? 'LIVE' : playerState.isLoading ? 'LOADING...' : activeOutputHasPlayableMedia || activeOutputIsImage ? 'READY' : 'STANDBY'}
            </div>
          </div>

          {/* AUDIO WORKSTATION ISLAND — MONITORING ONLY */}
          <div className="w-full flex-1 min-h-[124px] bg-[#0A0A0C] rounded-xl border border-[#1E2024] flex flex-col p-2.5 gap-2.5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <AudioLines size={12} className="text-emerald-500" />
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">AUDIO MONITOR</span>
              </div>
              <span className={`${MEDIA_PILL_BASE} min-h-6 gap-1 border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[7px] text-emerald-300`}>MONITORING</span>
            </div>

            {/* Asset ticker */}
            {activeOutput && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-[7px] font-black text-slate-700 uppercase tracking-widest">SRC</span>
                <span className="text-[8px] font-mono text-cyan-400 truncate">{activeOutput.title || 'Source Audio'}</span>
              </div>
            )}

            <div className="flex-1 flex flex-col gap-2.5">
              {/* TRUTHFUL REAL-TIME OSCILLOSCOPE — canvas-based analysis */}
              <div className="flex-1 h-9 bg-black/40 rounded border border-white/5 relative overflow-hidden flex items-center shadow-inner">
                <canvas ref={canvasRef} width={200} height={40} className="w-full h-full" />
                {!playerState.isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[7px] font-mono text-slate-700 uppercase tracking-widest">NO SIGNAL — IDLE</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />
              </div>

              <div className="flex-1 flex flex-col justify-end gap-1.5">
                <div className="flex justify-between items-center text-[7px] font-black text-slate-600 tracking-widest px-1">
                  <span>INPUT LEVEL</span>
                  <span className={audioLevel > 0 ? 'text-emerald-400' : 'text-slate-700'}>
                    {audioLevel > 0 ? `${Math.round(audioLevel * 100)}%` : '--- (no signal)'}
                  </span>
                </div>
                <div className="h-2 bg-black/60 rounded-full border border-white/5 relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600/60 to-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-none"
                    style={{ width: `${audioLevel * 100}%` }}
                  />
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_2px,rgba(0,0,0,0.4)_2px,rgba(0,0,0,0.4)_4px)]" />
                </div>
              </div>

              {/* Probe metadata — honest: only show what we actually know */}
              <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-tighter gap-3">
                <div className="flex gap-2 text-slate-700 flex-wrap">
                  {probeData?.probeStatus === 'ok' ? (
                    <>
                      {probeData.width && probeData.height && <span className={`${MEDIA_PILL_BASE} min-h-6 gap-1 border-slate-700 bg-black/40 px-2 py-1 text-[7px] text-slate-400`}>{probeData.width}×{probeData.height}</span>}
                      {probeData.codecSummary && <span className={`${MEDIA_PILL_BASE} min-h-6 gap-1 border-slate-700 bg-black/40 px-2 py-1 text-[7px] text-slate-400`}>{probeData.codecSummary.toUpperCase()}</span>}
                    </>
                  ) : probeData?.probeStatus === 'ffprobe_not_installed' ? (
                    <span className={`${MEDIA_PILL_BASE} ${mediaStatusPillTone('loading')} min-h-6 px-2 py-1 text-[7px]`}>FFPROBE NOT AVAILABLE</span>
                  ) : probeData ? (
                    <span className={`${MEDIA_PILL_BASE} ${mediaStatusPillTone('failed')} min-h-6 px-2 py-1 text-[7px]`}>{probeData.probeStatus?.toUpperCase()}</span>
                  ) : (
                    <span className={`${MEDIA_PILL_BASE} min-h-6 gap-1 border-slate-700 bg-black/30 px-2 py-1 text-[7px] text-slate-600`}>PROBE NOT RUN</span>
                  )}
                </div>
                <span className={`${MEDIA_PILL_BASE} ${playerState.isPlaying ? mediaStatusPillTone('live') : 'border-slate-700 bg-black/30 text-slate-600'} min-h-6 px-2 py-1 text-[7px]`}>
                  {playerState.isPlaying ? 'LIVE' : 'IDLE'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER CONTROL DECK */}
        <div className="w-[340px] flex-none flex flex-col bg-[#111318] border border-[#1E2024] rounded-xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)] relative z-10">
          <div className="h-10 border-b border-black flex items-center justify-center bg-[#1A1C21] rounded-t-xl relative z-0">
            <span className="text-[10px] uppercase tracking-[0.5em] text-cyan-500/80 font-black">CONTROL DECK</span>
          </div>

          <div className="flex-1 min-h-0 p-4 flex flex-col gap-4 relative z-10 overflow-hidden">
            {/* IMAGE ADJUSTMENTS */}
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-[#0A0A0C] p-2 rounded-lg border border-[#1E2024] flex flex-col gap-1.5 shadow-inner shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[7px] font-black text-cyan-500/60 uppercase tracking-[0.2em]">IMG ADJ</span>
                  {!activeOutput?.sourceUrl && (
                    <span className="text-[5px] font-mono text-slate-700 uppercase">PREVIEW ONLY</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {[
                    { key: 'brightness', label: 'BRI', min: 0, max: 200, unit: '%', default: 100 },
                    { key: 'contrast', label: 'CON', min: 0, max: 200, unit: '%', default: 100 },
                    { key: 'saturation', label: 'SAT', min: 0, max: 200, unit: '%', default: 100 },
                    { key: 'hue', label: 'HUE', min: -180, max: 180, unit: '°', default: 0 },
                    { key: 'opacity', label: 'OPA', min: 0, max: 100, unit: '%', default: 100 },
                  ].map((adj) => (
                    <div key={adj.key} className="flex items-center gap-2 group">
                      <span className="w-6 text-[6px] font-black text-slate-600 tracking-tight uppercase group-hover:text-slate-400 transition-colors shrink-0">{adj.label}</span>
                      <input
                        type="range"
                        min={adj.min}
                        max={adj.max}
                        step="1"
                        value={imgAdj[adj.key]}
                        onChange={(e) => updateImgAdj(adj.key, Number(e.target.value))}
                        className="flex-1 media-range cursor-pointer"
                      />
                      <span className={`w-8 text-[6px] font-mono text-right transition-colors ${imgAdj[adj.key] !== adj.default ? 'text-cyan-400' : 'text-slate-800'}`}>
                        {imgAdj[adj.key]}{adj.unit}
                      </span>
                    </div>
                  ))}
                  {Object.values(imgAdj).some((v, i) => v !== [100, 100, 100, 0, 100][i]) && (
                    <button
                      onClick={() => setImgAdj({ brightness: 100, contrast: 100, saturation: 100, hue: 0, opacity: 100 })}
                      className="mt-1 text-[6px] font-black uppercase tracking-widest text-slate-700 hover:text-rose-500 py-0.5 border border-white/5 rounded transition-all"
                    >
                      RESET
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* MATRIX PADS */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">MATRIX PADS</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[6px] font-mono text-slate-700 uppercase">TARGET //</span>
                  <span className="text-[6px] font-mono text-cyan-600 truncate max-w-[80px]">{activeOutput?.title || 'GLOBAL_BUS'}</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {QUICK_ACTIONS.map(a => {
                  const isSelected = selectedAction === a.key;
                  return (
                    <button
                      key={a.key}
                      onClick={() => toggleAction(a.key)}
                      className={`h-11 rounded border-t border-white/10 border-b border-black transition-all active:translate-y-0.5 flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${isSelected ? 'bg-gradient-to-b from-[#1a2b3c] to-[#0a0f14] border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.3)] text-cyan-400' : 'bg-gradient-to-b from-[#2A2D35] to-[#121418] text-slate-500 hover:text-slate-300'}`}
                    >
                      <a.icon size={18} className={isSelected ? 'drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]' : ''} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 bg-black/60 border border-white/5 rounded h-8 px-3">
                <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-[0.3em] truncate">
                  {activeAction?.label || 'Nexus Drop Zone'}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[7px] font-mono text-slate-700 uppercase tracking-tighter">
                    [{(activeAction?.provider || 'default').toUpperCase()}]
                  </span>
                  {selectedAction && (
                    <button
                      type="button"
                      onClick={() => resetActionForm(null)}
                      className="text-[7px] font-black uppercase tracking-[0.25em] text-slate-500 hover:text-cyan-300 transition-colors"
                    >
                      CLEAR
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* TACTICAL FORM */}
            <div className="flex-1 min-h-0 flex flex-col bg-[#0A0A0C] border border-white/5 rounded-lg p-4 shadow-inner relative">
              <div className="flex-1 overflow-y-auto no-scrollbar">{renderTacticalForm()}</div>
              {error && <div className="mt-2 text-[7px] text-rose-500 font-mono uppercase bg-rose-900/10 p-2 border border-rose-900/20 rounded leading-tight">{error}</div>}
            </div>
          </div>

          <div className="shrink-0 border-t border-[#1E2024] bg-[#0A0A0C] px-4 py-3 rounded-b-xl">
            <button
              onClick={handleSubmitQuickAction}
              disabled={Boolean(launchingAction) || !canExecuteSelectedAction}
              className={`h-11 w-full bg-gradient-to-b border-t border-white/15 border-b border-black rounded-md flex items-center justify-center gap-4 shadow-[0_8px_16px_rgba(0,0,0,0.8)] group active:translate-y-0.5 transition-all
                ${launchingAction ? 'from-amber-900/40 to-black cursor-wait opacity-80' : 'from-[#2A3442] to-[#0A0F14] hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]'}
              `}
            >
              <div className="relative">
                <BullseyeIcon size={14} className={`${launchingAction ? 'text-amber-500 animate-spin' : 'text-slate-300 group-hover:text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]'}`} />
                {launchingAction && <div className="absolute inset-0 bg-amber-500/20 blur-md rounded-full animate-pulse" />}
              </div>
              <span className={`text-[11px] font-black uppercase tracking-[0.6em] ${launchingAction ? 'text-amber-400 animate-pulse' : 'text-white'}`}>
                {primaryButtonLabel}
              </span>
            </button>
          </div>
        </div>

        {/* RIGHT ZONE: PRODUCTION ISLAND + CONSULT */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* MONITOR B: REVIEW */}
          <div className="flex-1 flex flex-col bg-[#111318] rounded-xl border border-[#1E2024] p-4 relative gap-2 overflow-hidden">
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
                <div className="flex items-center gap-2 text-[7px] font-mono font-black text-slate-600 uppercase tracking-widest flex-wrap justify-end">
                  <span className={`${MEDIA_PILL_BASE} min-h-6 gap-1 border-slate-700 bg-black/40 px-2.5 py-1 text-[7px] text-slate-400`}>
                    TARGET {activeOutput?.metadata?.publishTarget || 'UNKNOWN'}
                  </span>
                  <span className={`${MEDIA_PILL_BASE} ${mediaStatusPillTone(activeOutput?.status || 'unknown')} min-h-6 gap-1 px-2.5 py-1 text-[7px]`}>
                    STATUS {activeOutput?.status || 'UNKNOWN'}
                  </span>
                  <button className={`${MEDIA_PILL_BASE} min-h-6 gap-1 border-sky-500/30 bg-sky-500/5 px-2.5 py-1 text-[7px] text-sky-400`}>COPY DATA</button>
                  <button
                    onClick={() => {
                      const saved = transcriptSavedStateRef.current;
                      if (saved) {
                        setTranscriptState(saved);
                      } else {
                        const initialState = {
                          ...transcriptState,
                          title: activeOutput?.title || '',
                          transcript: activeOutput?.content || activeOutput?.transcriptText || '',
                          status: 'Draft',
                        };
                        setTranscriptState(initialState);
                        transcriptSavedStateRef.current = initialState;
                      }
                      setIsTranscriptModalOpen(true);
                    }}
                    className={`${MEDIA_PILL_BASE} min-h-6 gap-1 border-cyan-500/30 bg-cyan-500/5 px-2.5 py-1 text-[7px] text-cyan-400 hover:bg-cyan-500/10 transition`}
                  >
                    OPEN EDITOR
                  </button>
                </div>
              </div>

              {/* VIEW TOGGLE */}
              <div className="flex gap-1 mb-2">
                <button onClick={() => setMediaView('outputs')} className={`px-3 py-1 text-[8px] uppercase tracking-wider rounded ${mediaView === 'outputs' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 border border-transparent'}`}>OUTPUTS</button>
                <button onClick={() => setMediaView('library')} className={`px-3 py-1 text-[8px] uppercase tracking-wider rounded ${mediaView === 'library' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 border border-transparent'}`}>LIBRARY</button>
              </div>

              {/* ASSET CACHE + JOB QUEUE GRID */}
              <div className="flex-1 bg-black/40 border-x border-b border-[#1E2024] rounded-b-lg p-2 flex overflow-hidden gap-2">
                {mediaView === 'outputs' ? (
                  <>
                    <div className="flex-1 flex flex-col min-w-0">
                      <span className="text-[6px] font-black text-slate-700 uppercase tracking-widest mb-1 ml-1">JOB QUEUE</span>
                      <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                        {workspace.jobs.slice(0, 10).map(j => (
                          <div key={j.id} className="p-2 rounded bg-black/40 border border-[#1E2024] flex items-center justify-between group">
                            <div className="flex flex-col min-w-0">
                              <span className="text-[9px] font-bold text-slate-500 truncate uppercase">{j.title}</span>
                              <span className="text-[6px] font-mono text-slate-700 uppercase">{j.type}</span>
                            </div>
                            <span className={`${MEDIA_PILL_BASE} ${mediaStatusPillTone(j.status || 'complete')} min-h-6 gap-1 px-2 py-1 text-[7px]`}>{j.status || 'COMPLETE'}</span>
                            <button onClick={(e) => handleDeleteJob(j, e)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col min-w-0 border-l border-[#1E2024] pl-2">
                      <span className="text-[6px] font-black text-slate-700 uppercase tracking-widest mb-1 ml-1">ASSET CACHE</span>
                      <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                        {workspace.outputs.slice(0, 10).map((o, idx) => (
                          <div key={o.assetId} onClick={() => setActiveOutputId(o.assetId)} className={`p-2 rounded border transition-all cursor-pointer group ${activeOutputId === o.assetId ? 'bg-sky-950/20 border-sky-500/50' : 'bg-[#111318] border-[#1E2024]'}`}>
                            <div className="flex justify-between items-start">
                              <span className="text-[9px] font-bold text-slate-300 truncate lowercase">{o.title}</span>
                              {idx === 0 && <span className={`${MEDIA_PILL_BASE} min-h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[6px] text-emerald-400`}>LATEST</span>}
                              {o.mediaType === 'audio' && <AudioLines size={10} className="text-sky-400" />}
                              <button onClick={(e) => handleDeleteOutput(o, e)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity">
                                <Trash2 size={10} />
                              </button>
                            </div>
                            <div className="flex justify-between mt-0.5 text-[6px] font-mono text-slate-600 uppercase tracking-widest">
                              <span>{o.type}</span>
                              <span>{new Date(o.createdAt).toLocaleTimeString([], { hour12: false })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col min-w-0">
                    <span className="text-[6px] font-black text-slate-700 uppercase tracking-widest mb-1 ml-1">LIBRARY</span>
                    <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1">
                      {workspace.outputs.slice(0, 20).map((o) => (
                        <div key={o.assetId} onClick={() => setActiveOutputId(o.assetId)} className={`p-2 rounded border transition-all cursor-pointer group ${activeOutputId === o.assetId ? 'bg-sky-950/20 border-sky-500/50' : 'bg-[#111318] border-[#1E2024]'}`}>
                          <div className="flex justify-between items-start">
                            <span className="text-[9px] font-bold text-slate-300 truncate lowercase">{o.title}</span>
                            <button onClick={(e) => handleDeleteOutput(o, e)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity">
                              <Trash2 size={10} />
                            </button>
                          </div>
                          <div className="flex justify-between mt-0.5 text-[6px] font-mono text-slate-600 uppercase tracking-widest">
                            <span>{o.type}</span>
                            <span>{new Date(o.createdAt).toLocaleTimeString([], { hour12: false })}</span>
                          </div>
                        </div>
                      ))}
                      {workspace.outputs.length === 0 && (
                        <div className="text-[10px] text-slate-600 text-center py-8">No items in library</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* LOWER STATUS BAR */}
            <div className="h-9 mt-2 border-t border-[#1E2024] flex items-center justify-between text-[7px] font-black uppercase tracking-[0.2em] px-2 text-slate-600">
              <div className="flex items-center gap-2 flex-wrap">
                {activeOutput ? (
                  <>
                    <span className={`${MEDIA_PILL_BASE} min-h-6 gap-1 px-2.5 py-1 text-[7px] border-cyan-500/20 bg-cyan-500/5 text-cyan-300`}>{activeOutput.type.toUpperCase()}</span>
                    <span className={`${MEDIA_PILL_BASE} ${mediaStatusPillTone(activeOutput.status?.toLowerCase() || 'unknown')} min-h-6 gap-1 px-2.5 py-1 text-[7px]`}>STATUS {activeOutput.status?.toUpperCase() || 'UNKNOWN'}</span>
                  </>
                ) : (
                  <>
                    <span className={`${MEDIA_PILL_BASE} min-h-6 gap-1 px-2.5 py-1 text-[7px] border-slate-700 bg-black/30 text-slate-600`}>NO OUTPUT</span>
                    <span className={`${MEDIA_PILL_BASE} min-h-6 gap-1 px-2.5 py-1 text-[7px] border-slate-700 bg-black/30 text-slate-600`}>STATUS --</span>
                  </>
                )}
              </div>
              <div className={`${MEDIA_PILL_BASE} min-h-6 gap-2 px-2.5 py-1 text-[7px] border-cyan-500/20 bg-cyan-500/5 text-cyan-300`}>
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.8)]"></div>
                <span>AI ASSIST ENABLED</span>
              </div>
            </div>
          </div>

          {/* TERMINAL + CONSULT (ADDITIVE) */}
          <div className="h-[212px] flex-none flex flex-col bg-[#0A0A0C] border border-[#2A2D35] rounded-xl overflow-hidden shadow-2xl relative">
            {/* LAST ACTION SUMMARY — Truthful Execution Feedback */}
            <div className="shrink-0 bg-black/20 border-b border-[#1E2024] px-4 py-3 overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest shrink-0">LAST ACTION //</span>
                    <span className={`text-[8px] font-bold uppercase tracking-tight truncate ${lastAction.status === 'success' ? 'text-emerald-500' :
                        lastAction.status === 'failed' ? 'text-rose-500' :
                          lastAction.status === 'running' ? 'text-amber-500 animate-pulse' : 'text-slate-500'
                      }`}>
                      {lastAction.type ? `${lastAction.type} — ${lastAction.status.toUpperCase()}` : 'SYSTEM READY'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity whitespace-nowrap overflow-hidden">
                    <span className="text-[6px] font-mono text-slate-700 uppercase tracking-tighter shrink-0">RESULT BUF //</span>
                    <span className={`text-[7px] font-mono truncate ${lastAction.status === 'failed' ? 'text-rose-800' : 'text-indigo-400'}`}>
                      {lastAction.error || lastAction.result || (lastAction.status === 'running' ? 'EXECUTING PIPELINE...' : 'NO ACTION PENDING')}
                    </span>
                  </div>
                </div>
                {lastAction.timestamp && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="text-[6px] font-mono text-slate-800 uppercase tracking-tighter">TIC_{Math.floor(lastAction.timestamp / 1000)}</div>
                    <div className={`w-1.5 h-1.5 rounded-full ${lastAction.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                        lastAction.status === 'failed' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' :
                          lastAction.status === 'running' ? 'bg-amber-500 animate-pulse' : 'bg-slate-800'
                      }`} />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[#111318] h-7 border-b border-[#2A2D35] flex items-center px-4 justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">STDOUT // CONSULT</span>
              </div>
              <div className="text-[7px] font-mono text-slate-600 tracking-widest uppercase">SYSCAP: STABLE</div>
            </div>
            <div className="flex-1 p-4 font-mono text-[10px] text-indigo-300/80 overflow-y-auto no-scrollbar">
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
          <div className="flex-1 overflow-y-auto no-scrollbar pt-0.5">
            <div className="flex flex-col gap-0">
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
                    className={`flex flex-col items-center justify-center px-0.5 py-1 cursor-pointer transition-all duration-300 group outline-none rounded-[var(--radius-card)] ${isSelected ? 'bg-white/5' : 'hover:bg-white/5'}`}
                  >
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 transform-gpu
                             ${isSelected
                        ? `${c.bg.replace('950/50', '600/95').replace('950/45', '600/95').replace('900/50', '500/95').replace('900/45', '500/95').replace('800/45', '400/95').replace('500/10', '500/80')} ${c.border.replace('600/40', '400/95').replace('500/40', '400/95').replace('400/40', '300/95')} text-white shadow-[0_0_20px_${c.shadow.replace('0.2', '0.5')}] scale-110 ring-1 ring-white/20`
                        : `opacity-60 group-hover:opacity-100 ${c.bg} ${c.border} ${c.icon || c.text} shadow-[0_0_8px_${c.shadow}] group-hover:shadow-[0_0_15px_${c.shadow.replace('0.2', '0.4')}] group-hover:scale-105`
                      } text-[9px] font-black tracking-tighter shrink-0`}>
                      {key.substring(0, 2).toUpperCase()}
                    </div>
                    <span className={`mt-0.5 text-[6px] leading-none uppercase tracking-[0.14em] ${isSelected ? 'text-white' : 'text-slate-600 group-hover:text-slate-300'}`}>
                      {key}
                    </span>
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
                  {workspace.outputs.filter(o => o.recordKind === 'asset' && (o.type === 'render' || o.type === 'audio')).map(o => (<option key={o.assetId} value={o.assetId}>{o.title}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest block ml-0.5">DESTINATION ID</label>
                <input value={formState.publishTarget} onChange={e => updateField('publishTarget', e.target.value)} className="w-full rounded bg-black border border-[#2A2D35] px-3 py-2 text-[11px] text-white focus:outline-none font-mono" placeholder="GOOGLE DRIVE" />
              </div>
              <button onClick={async () => { const selectedAssetId = formState.assetId || (activeOutput?.recordKind === 'asset' ? activeOutput.assetId : ''); setLaunchingAction('publish'); try { await createMediaPublishJobApi({ assetIds: selectedAssetId ? [selectedAssetId] : [], publishTarget: formState.publishTarget || 'GOOGLE_DRIVE' }); setIsPublishModalOpen(false); await loadWorkspace('refresh'); } catch (e) { setError(e.message); } finally { setLaunchingAction(''); } }} disabled={!formState.publishTarget || Boolean(launchingAction)} className="w-full h-11 rounded bg-sky-900 border border-sky-500 text-white text-[11px] font-black tracking-widest uppercase active:translate-y-0.5 shadow-xl transition-all disabled:opacity-40">INITIATE UPLINK</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-[320px] bg-[#111318] border border-red-900/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-red-900/30 pb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-400">CONFIRM DELETE</span>
              <button onClick={() => setPendingDelete(null)} className="text-slate-500 hover:text-white transition-all"><X size={16} /></button>
            </div>
            <div className="text-[11px] text-slate-300 font-mono">
              Delete {pendingDelete.isJob ? 'job' : 'output'}?
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPendingDelete(null)} className="flex-1 h-10 rounded bg-black border border-[#2A2D35] text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-[#1A1C21] transition-all">CANCEL</button>
              <button onClick={() => pendingDelete.isJob ? confirmDeleteJob() : confirmDeleteOutput()} className="flex-1 h-10 rounded bg-red-900/50 border border-red-500/50 text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-900/70 transition-all">DELETE</button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSCRIPT EDITOR MODAL */}
      {isTranscriptModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#111318] border border-[#1E2024] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1E2024] px-5 py-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-tight">Transcript Editor</h3>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{transcriptState.status}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  const isDirty = JSON.stringify(transcriptState) !== JSON.stringify(transcriptSavedStateRef.current);
                  if (isDirty) {
                    if (confirm('Unsaved changes will be lost. Discard and close?')) {
                      setIsTranscriptModalOpen(false);
                    }
                  } else {
                    setIsTranscriptModalOpen(false);
                  }
                }}
                className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)] opacity-60 hover:opacity-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Asset info */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">TITLE</label>
                  <input
                    value={transcriptState.title}
                    onChange={(e) => setTranscriptState(s => ({ ...s, title: e.target.value, status: 'Draft' }))}
                    className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition font-mono"
                    placeholder="Meeting title..."
                  />
                </div>
                <div className="w-32">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">INTENT</label>
                  <select
                    value={transcriptState.intentHint}
                    onChange={(e) => setTranscriptState(s => ({ ...s, intentHint: e.target.value, status: 'Draft' }))}
                    className="w-full rounded bg-black/60 border border-[#2A2D35] px-2 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition"
                  >
                    <option value="">Auto</option>
                    <option value="meeting">Meeting</option>
                    <option value="interview">Interview</option>
                    <option value="presentation">Presentation</option>
                    <option value="call">Call</option>
                    <option value="document">Document</option>
                  </select>
                </div>
              </div>

              {/* Executive Summary */}
              <div>
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">EXECUTIVE SUMMARY</label>
                <textarea
                  value={transcriptState.executiveSummary}
                  onChange={(e) => setTranscriptState(s => ({ ...s, executiveSummary: e.target.value, status: 'Draft' }))}
                  className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition resize-none"
                  rows={2}
                  placeholder="Brief summary..."
                />
              </div>

              {/* Key Decisions */}
              <div>
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">KEY DECISIONS</label>
                <textarea
                  value={transcriptState.keyDecisions.join('\n')}
                  onChange={(e) => setTranscriptState(s => ({ ...s, keyDecisions: e.target.value.split('\n').filter(Boolean), status: 'Draft' }))}
                  className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition resize-none font-mono"
                  rows={2}
                  placeholder="One per line..."
                />
              </div>

              {/* Action Items */}
              <div>
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">ACTION ITEMS</label>
                <textarea
                  value={transcriptState.actionItems.join('\n')}
                  onChange={(e) => setTranscriptState(s => ({ ...s, actionItems: e.target.value.split('\n').filter(Boolean), status: 'Draft' }))}
                  className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition resize-none font-mono"
                  rows={2}
                  placeholder="One per line..."
                />
              </div>

              {/* Transcript body */}
              <div>
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">TRANSCRIPT</label>
                <textarea
                  value={transcriptState.transcript}
                  onChange={(e) => setTranscriptState(s => ({ ...s, transcript: e.target.value, status: 'Draft' }))}
                  className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition resize-none font-mono"
                  rows={6}
                  placeholder="Full transcript text..."
                />
              </div>

              {/* Discussion Highlights */}
              <div>
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">DISCUSSION HIGHLIGHTS</label>
                <textarea
                  value={transcriptState.discussionHighlights.join('\n')}
                  onChange={(e) => setTranscriptState(s => ({ ...s, discussionHighlights: e.target.value.split('\n').filter(Boolean), status: 'Draft' }))}
                  className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition resize-none font-mono"
                  rows={2}
                  placeholder="One per line..."
                />
              </div>

              {/* Notes & Observations */}
              <div>
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">NOTES & OBSERVATIONS</label>
                <textarea
                  value={transcriptState.notesAndObservations.join('\n')}
                  onChange={(e) => setTranscriptState(s => ({ ...s, notesAndObservations: e.target.value.split('\n').filter(Boolean), status: 'Draft' }))}
                  className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition resize-none font-mono"
                  rows={2}
                  placeholder="One per line..."
                />
              </div>

              {/* Purpose & Priority */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">PURPOSE NOTE</label>
                  <input
                    value={transcriptState.purposeNote}
                    onChange={(e) => setTranscriptState(s => ({ ...s, purposeNote: e.target.value, status: 'Draft' }))}
                    className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition font-mono"
                    placeholder="Optional context..."
                  />
                </div>
                <div className="w-32">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">PRIORITY</label>
                  <select
                    value={transcriptState.priority}
                    onChange={(e) => setTranscriptState(s => ({ ...s, priority: e.target.value, status: 'Draft' }))}
                    className="w-full rounded bg-black/60 border border-[#2A2D35] px-2 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition"
                  >
                    <option value="">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-end gap-2 border-t border-[#1E2024] px-5 py-3 flex-shrink-0 bg-[#0A0A0C]">
              <button
                onClick={() => {
                  const s = transcriptState;
                  const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(s.title || 'Transcript')}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;line-height:1.6}h1{border-bottom:2px solid #0ea5e9;padding-bottom:0.5rem}h2{color:#0369a1;margin-top:2rem}ul{padding-left:1.5rem}li{margin-bottom:0.25rem}.meta{color:#666;font-size:0.85rem}</style></head><body><h1>${escapeHtml(s.title || 'Untitled Transcript')}</h1>${s.intentHint ? `<p class="meta">Intent: ${escapeHtml(s.intentHint)}${s.priority ? ` · Priority: ${escapeHtml(s.priority)}` : ''}</p>` : ''}${s.executiveSummary ? `<h2>Executive Summary</h2><p>${escapeHtml(s.executiveSummary)}</p>` : ''}${s.keyDecisions.length ? `<h2>Key Decisions</h2><ul>${s.keyDecisions.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}${s.actionItems.length ? `<h2>Action Items</h2><ul>${s.actionItems.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''}${s.transcript ? `<h2>Transcript</h2><pre style="white-space:pre-wrap;background:#f5f5f5;padding:1rem;border-radius:4px">${escapeHtml(s.transcript)}</pre>` : ''}${s.discussionHighlights.length ? `<h2>Discussion Highlights</h2><ul>${s.discussionHighlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>` : ''}${s.notesAndObservations.length ? `<h2>Notes & Observations</h2><ul>${s.notesAndObservations.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}</body></html>`;
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${(s.title || 'transcript').replace(/[^a-zA-Z0-9]/g, '_')}.html`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 rounded border border-[#2A2D35] text-[10px] font-bold text-slate-400 hover:text-white hover:border-[#3A3D45] transition uppercase tracking-widest"
              >
                Export .html
              </button>
              <button
                onClick={() => {
                  const md = [
                    `# ${transcriptState.title || 'Untitled Transcript'}`,
                    '',
                    transcriptState.executiveSummary ? `## Executive Summary\n${transcriptState.executiveSummary}` : '',
                    transcriptState.keyDecisions.length ? `## Key Decisions\n${transcriptState.keyDecisions.map(d => `- ${d}`).join('\n')}` : '',
                    transcriptState.actionItems.length ? `## Action Items\n${transcriptState.actionItems.map(a => `- ${a}`).join('\n')}` : '',
                    transcriptState.transcript ? `## Transcript\n${transcriptState.transcript}` : '',
                    transcriptState.discussionHighlights.length ? `## Discussion Highlights\n${transcriptState.discussionHighlights.map(h => `- ${h}`).join('\n')}` : '',
                    transcriptState.notesAndObservations.length ? `## Notes & Observations\n${transcriptState.notesAndObservations.map(n => `- ${n}`).join('\n')}` : '',
                  ].filter(Boolean).join('\n\n');
                  const blob = new Blob([md], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${(transcriptState.title || 'transcript').replace(/[^a-zA-Z0-9]/g, '_')}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 rounded border border-[#2A2D35] text-[10px] font-bold text-slate-400 hover:text-white hover:border-[#3A3D45] transition uppercase tracking-widest"
              >
                Export .md
              </button>
              <button
                onClick={() => {
                  const json = JSON.stringify(transcriptState, null, 2);
                  const blob = new Blob([json], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${(transcriptState.title || 'transcript').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 rounded border border-[#2A2D35] text-[10px] font-bold text-slate-400 hover:text-white hover:border-[#3A3D45] transition uppercase tracking-widest"
              >
                Export .json
              </button>
              <button
                onClick={async () => {
                  if (transcriptSaving) return;
                  setTranscriptSaving(true);
                  try {
                    const payload = {
                      title: transcriptState.title || 'Meeting Transcript',
                      transcript: transcriptState.transcript,
                      executiveSummary: transcriptState.executiveSummary,
                      keyDecisions: transcriptState.keyDecisions,
                      actionItems: transcriptState.actionItems,
                      discussionHighlights: transcriptState.discussionHighlights,
                      notesAndObservations: transcriptState.notesAndObservations,
                      intentHint: transcriptState.intentHint || undefined,
                      purposeNote: transcriptState.purposeNote || undefined,
                      priority: transcriptState.priority || undefined,
                      assetId: activeOutput?.assetId,
                      filename: activeOutput?.title,
                    };
                    const result = await saveTranscriptApi(payload);
                    if (!result) {
                      showNotice({ type: 'error', message: 'Save failed — push aborted.' });
                      setTranscriptSaving(false);
                      return;
                    }
                    transcriptSavedStateRef.current = { ...transcriptState, status: 'Pushed' };
                    setTranscriptState(s => ({ ...s, status: 'Pushed' }));
                    showNotice({ type: 'success', message: 'Transcript pushed to Brain.' });
                  } catch (e) {
                    showNotice({ type: 'error', message: e.message || 'Failed to save transcript.' });
                  } finally {
                    setTranscriptSaving(false);
                  }
                }}
                disabled={transcriptSaving}
                className="btn-toolbar-lead !px-4 !py-1.5 !text-[10px] disabled:opacity-50"
              >
                {transcriptSaving ? 'PUSHING...' : 'PUSH TO BRAIN'}
              </button>
              <button
                onClick={() => {
                  transcriptSavedStateRef.current = { ...transcriptState, status: 'Draft' };
                  setTranscriptState(s => ({ ...s, status: 'Draft' }));
                  showNotice({ type: 'success', message: 'Draft saved locally.' });
                }}
                className="btn-toolbar-lead !px-4 !py-1.5 !text-[10px]"
                title="Stores draft locally. Use 'Push to Brain' to persist."
              >
                SAVE DRAFT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaModule;
