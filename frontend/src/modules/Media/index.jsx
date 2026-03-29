import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  ingestMeetingMediaApi,
} from '../../services/backendApi';
import { templates } from '../Flows/data/templates';
import { ingestFlowSource } from '../Flows/utils/flowIngestion';
import flowRepository from '../Flows/utils/flowRepository';

const QUICK_ACTIONS = [
  { key: 'generate_script', label: 'Generate Script', icon: FileText, provider: 'stub-script' },
  { key: 'generate_run_of_show', label: 'Generate Run of Show', icon: ListChecks, provider: 'stub-run-of-show' },
  { key: 'generate_voice', label: 'Generate Voice', icon: AudioLines, provider: 'elevenlabs_tts' },
  { key: 'generate_thumbnail', label: 'Generate Thumbnail', icon: ImageIcon, provider: 'stub-render' },
  { key: 'generate_video', label: 'Generate Video', icon: Video, provider: 'stub-render' },
  { key: 'transcribe_media', label: 'Transcribe Media', icon: Waves, provider: 'elevenlabs_scribe' },
  { key: 'ingest_meeting_artifacts', label: 'Ingest Meeting Artifacts', icon: Mic, provider: 'zoom' },
];

const QUICK_ACTION_MAP = QUICK_ACTIONS.reduce((accumulator, action) => {
  accumulator[action.key] = action;
  return accumulator;
}, {});

const INGESTION_SOURCES = [
  {
    id: 'zoom',
    label: 'Zoom',
    status: 'Available',
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    detail: 'Meeting recordings and transcripts can be normalized into media assets and transcript artifacts.',
  },
  {
    id: 'google_meet_drive',
    label: 'Google Meet / Drive',
    status: 'Available',
    tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
    detail: 'Drive-based meeting files can be ingested and attached into the media workflow layer.',
  },
  {
    id: 'jitsi',
    label: 'Jitsi',
    status: 'Stub Only',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    detail: 'Adapter is defined, but live ingestion is intentionally not implemented in this pass.',
  },
];

const DEFAULT_FORM_STATE = {
  title: '',
  topic: '',
  tone: '',
  duration: '',
  context: '',
  text: '',
  voice: 'Rachel',
  style: 'Conversational',
  subtitle: '',
  prompt: '',
  image: '',
  script: '',
  transcript_text: '',
  source_url: '',
  meetingProvider: 'zoom',
  meeting_id: '',
  meeting_title: '',
  mediaUrl: '',
};

const MEDIA_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'script', label: 'Scripts' },
  { value: 'run_of_show', label: 'Run of Show' },
  { value: 'audio', label: 'Voice / Audio' },
  { value: 'render', label: 'Images / Video' },
  { value: 'transcript', label: 'Transcripts' },
  { value: 'publish', label: 'Publish' },
];

const formatTimestamp = (value) => {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const summarizeText = (value, fallback = 'No preview available.') => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 180 ? `${normalized.slice(0, 177).trimEnd()}...` : normalized;
};

const statusTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'complete' || normalized === 'published') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
  if (normalized === 'failed') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  }
  if (normalized === 'processing') {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
  }
  return 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]';
};

const recentMediaTemplates = templates.filter((template) => template.category === 'Media');

const MediaModule = () => {
  const { openAIAssist } = useAIAssist();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedAction, setSelectedAction] = useState('generate_script');
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE);
  const [launchingAction, setLaunchingAction] = useState('');
  const [launchingTemplate, setLaunchingTemplate] = useState('');
  const [lastLaunchResult, setLastLaunchResult] = useState(null);
  const [workspace, setWorkspace] = useState({
    jobs: [],
    outputs: [],
    counts: {
      jobs: 0,
      outputs: 0,
      ingestSources: INGESTION_SOURCES.length,
    },
  });

  const loadWorkspace = useCallback(async (mode = 'initial') => {
    const setBusy = mode === 'initial' ? setLoading : setRefreshing;
    setBusy(true);
    setError('');
    try {
      const [
        assets,
        renderJobs,
        transcriptJobs,
        transcriptArtifacts,
        scriptJobs,
        scriptArtifacts,
        runOfShowJobs,
        runOfShowArtifacts,
        audioRenderJobs,
        publishJobs,
        publishArtifacts,
      ] = await Promise.all([
        getMediaAssetsApi(),
        getMediaRenderJobsApi(),
        getMediaTranscriptJobsApi(),
        getMediaTranscriptArtifactsApi(),
        getMediaScriptJobsApi(),
        getMediaScriptArtifactsApi(),
        getMediaRunOfShowJobsApi(),
        getMediaRunOfShowArtifactsApi(),
        getMediaAudioRenderJobsApi(),
        getMediaPublishJobsApi(),
        getMediaPublishArtifactsApi(),
      ]);

      const jobs = [
        ...scriptJobs.map((job) => ({
          id: job.id,
          title: job.title || 'Script Job',
          type: 'script',
          typeLabel: 'ScriptJob',
          status: job.status || 'queued',
          provider: job.provider || 'stub-script',
          createdAt: job.created_at,
          artifactId: job.artifact_id || null,
          assetId: null,
          lastError: job.last_error || '',
        })),
        ...runOfShowJobs.map((job) => ({
          id: job.id,
          title: job.title || 'Run of Show Job',
          type: 'run_of_show',
          typeLabel: 'RunOfShowJob',
          status: job.status || 'queued',
          provider: job.provider || 'stub-run-of-show',
          createdAt: job.created_at,
          artifactId: job.artifact_id || null,
          assetId: null,
          lastError: job.last_error || '',
        })),
        ...audioRenderJobs.map((job) => ({
          id: job.id,
          title: job.title || 'Audio Render Job',
          type: 'audio',
          typeLabel: 'AudioRenderJob',
          status: job.status || 'queued',
          provider: job.provider || 'elevenlabs_tts',
          createdAt: job.created_at,
          artifactId: null,
          assetId: Array.isArray(job.output_asset_ids) ? job.output_asset_ids[0] || null : null,
          lastError: job.last_error || '',
        })),
        ...renderJobs.map((job) => ({
          id: job.id,
          title: job.title || 'Render Job',
          type: 'render',
          typeLabel: 'RenderJob',
          status: job.status || 'queued',
          provider: job.provider || 'stub-render',
          createdAt: job.created_at,
          artifactId: null,
          assetId: Array.isArray(job.output_asset_ids) ? job.output_asset_ids[0] || null : null,
          lastError: job.last_error || '',
        })),
        ...transcriptJobs.map((job) => ({
          id: job.id,
          title: job.title || 'Transcript Job',
          type: 'transcript',
          typeLabel: 'TranscriptJob',
          status: job.status || 'queued',
          provider: job.provider || 'elevenlabs_scribe',
          createdAt: job.created_at,
          artifactId: job.artifact_id || null,
          assetId: null,
          lastError: job.last_error || '',
        })),
        ...publishJobs.map((job) => ({
          id: job.id,
          title: job.title || 'Publish Job',
          type: 'publish',
          typeLabel: 'PublishJob',
          status: job.status || 'queued',
          provider: job.provider || 'internal-publish',
          createdAt: job.created_at,
          artifactId: job.artifact_id || null,
          assetId: null,
          lastError: job.last_error || '',
        })),
      ].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());

      const outputs = [
        ...scriptArtifacts.map((artifact) => ({
          id: artifact.id,
          title: artifact.title || 'Script Artifact',
          type: 'script',
          typeLabel: 'ScriptArtifact',
          provider: artifact.provider || 'stub-script',
          createdAt: artifact.created_at,
          previewText: artifact.script_text || '',
          sourceUrl: null,
          mediaType: 'text',
          status: 'complete',
        })),
        ...runOfShowArtifacts.map((artifact) => ({
          id: artifact.id,
          title: artifact.title || 'Run of Show Artifact',
          type: 'run_of_show',
          typeLabel: 'RunOfShowArtifact',
          provider: artifact.provider || 'stub-run-of-show',
          createdAt: artifact.created_at,
          previewText: artifact.run_of_show_text || '',
          sourceUrl: null,
          mediaType: 'text',
          status: 'complete',
        })),
        ...transcriptArtifacts.map((artifact) => ({
          id: artifact.id,
          title: artifact.title || 'Transcript Artifact',
          type: 'transcript',
          typeLabel: 'TranscriptArtifact',
          provider: artifact.provider || 'elevenlabs_scribe',
          createdAt: artifact.created_at,
          previewText: artifact.transcript_text || '',
          sourceUrl: null,
          mediaType: 'text',
          status: 'complete',
        })),
        ...publishArtifacts.map((artifact) => ({
          id: artifact.id,
          title: artifact.title || 'Publish Artifact',
          type: 'publish',
          typeLabel: 'PublishArtifact',
          provider: artifact.provider || 'internal-publish',
          createdAt: artifact.created_at,
          previewText: `Target: ${artifact.publish_target || 'Unknown'} | Status: ${artifact.publication_status || 'unknown'}`,
          sourceUrl: null,
          mediaType: 'text',
          status: artifact.publication_status || 'published',
        })),
        ...assets.map((asset) => ({
          id: asset.id,
          title: asset.title || 'Media Asset',
          type: asset.media_type === 'audio' ? 'audio' : 'render',
          typeLabel:
            asset.media_type === 'audio'
              ? 'AudioAsset'
              : asset.media_type === 'image'
                ? 'ImageAsset'
                : asset.media_type === 'video'
                  ? 'VideoAsset'
                  : 'MediaAsset',
          provider: asset.provider || 'stub-render',
          createdAt: asset.created_at,
          previewText: asset.metadata?.script_excerpt || asset.metadata?.script || asset.metadata?.prompt || '',
          sourceUrl: asset.source_url || null,
          mediaType: asset.media_type || 'video',
          status: 'complete',
        })),
      ].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());

      setWorkspace({
        jobs,
        outputs,
        counts: {
          jobs: jobs.length,
          outputs: outputs.length,
          ingestSources: INGESTION_SOURCES.length,
        },
      });
    } catch (loadError) {
      setWorkspace({
        jobs: [],
        outputs: [],
        counts: { jobs: 0, outputs: 0, ingestSources: INGESTION_SOURCES.length },
      });
      setError(loadError.message || 'Unable to load the media workspace.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workspace.jobs.filter((job) => {
      if (typeFilter !== 'all' && job.type !== typeFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [job.id, job.title, job.provider, job.typeLabel, job.status].join(' ').toLowerCase().includes(query);
    });
  }, [search, typeFilter, workspace.jobs]);

  const filteredOutputs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workspace.outputs.filter((output) => {
      if (typeFilter !== 'all' && output.type !== typeFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [output.id, output.title, output.provider, output.typeLabel, output.previewText].join(' ').toLowerCase().includes(query);
    });
  }, [search, typeFilter, workspace.outputs]);

  const activeAction = QUICK_ACTION_MAP[selectedAction] || QUICK_ACTIONS[0];
  const mediaTemplate = recentMediaTemplates.find((template) => template.id === 'podcast-pipeline') || recentMediaTemplates[0] || null;

  const updateField = useCallback((field, value) => {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const resetActionForm = useCallback((actionKey) => {
    const nextAction = actionKey || selectedAction;
    setSelectedAction(nextAction);
    setFormState({
      ...DEFAULT_FORM_STATE,
      meetingProvider: nextAction === 'ingest_meeting_artifacts' ? 'zoom' : DEFAULT_FORM_STATE.meetingProvider,
    });
  }, [selectedAction]);

  const handleLaunchTemplate = useCallback(async (template) => {
    if (!template) {
      return;
    }
    setLaunchingTemplate(template.id);
    setError('');
    try {
      const baseFlow = await flowRepository.createNewFlow(template.name || 'Template Flow');
      const result = ingestFlowSource({ ...template, source: 'template' });
      const savedFlow = await flowRepository.saveFlow({
        ...baseFlow,
        name: template.name || baseFlow.name,
        nodes: result.nodes,
        edges: result.edges,
        spec: result.spec,
        metadata: {
          ...(baseFlow.metadata || {}),
          nodeCount: result.nodes.length,
          sourceTemplateId: template.id || null,
          sourceTemplateName: template.name || null,
          sourceTemplateCategory: template.category || null,
          createdFromTemplate: true,
        },
      });
      window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'flows', flowId: savedFlow.id, action: null, intent: null } }));
    } catch (templateError) {
      setError(templateError.message || 'Unable to open the media template in Flows.');
    } finally {
      setLaunchingTemplate('');
    }
  }, []);

  const canSubmitQuickAction = useMemo(() => {
    if (selectedAction === 'generate_script') return Boolean(formState.topic.trim());
    if (selectedAction === 'generate_run_of_show') return Boolean((formState.title || formState.topic).trim());
    if (selectedAction === 'generate_voice') return Boolean(formState.text.trim());
    if (selectedAction === 'generate_thumbnail') return Boolean((formState.title || formState.prompt).trim());
    if (selectedAction === 'generate_video') return Boolean((formState.title || formState.script).trim());
    if (selectedAction === 'transcribe_media') return Boolean(formState.transcript_text.trim() || formState.source_url.trim());
    if (selectedAction === 'ingest_meeting_artifacts') return Boolean((formState.meeting_title || formState.meeting_id).trim());
    return false;
  }, [formState, selectedAction]);

  const handleSubmitQuickAction = useCallback(async () => {
    setLaunchingAction(selectedAction);
    setError('');
    setLastLaunchResult(null);
    try {
      let result = null;
      if (selectedAction === 'generate_script') {
        result = await createMediaScriptJobApi({
          provider: activeAction.provider,
          title: formState.title || formState.topic || 'Media Script',
          topic: formState.topic,
          tone: formState.tone,
          duration: formState.duration,
          context: formState.context,
        });
      } else if (selectedAction === 'generate_run_of_show') {
        result = await createMediaRunOfShowJobApi({
          provider: activeAction.provider,
          title: formState.title || formState.topic || 'Run of Show',
          topic: formState.topic,
          duration: formState.duration,
          context: formState.context,
        });
      } else if (selectedAction === 'generate_voice') {
        result = await createMediaAudioRenderJobApi({
          provider: activeAction.provider,
          title: formState.title || 'Voice Render',
          text: formState.text,
          voice: formState.voice,
          style: formState.style,
        });
      } else if (selectedAction === 'generate_thumbnail') {
        result = await createMediaRenderJobApi({
          provider: activeAction.provider,
          title: formState.title || 'Thumbnail Render',
          media_type: 'image',
          render_profile: 'thumbnail',
          asset_type: 'thumbnail',
          script: [formState.title, formState.subtitle, formState.prompt, formState.image].filter(Boolean).join(' · '),
          metadata: { subtitle: formState.subtitle, prompt: formState.prompt, image: formState.image },
        });
      } else if (selectedAction === 'generate_video') {
        result = await createMediaRenderJobApi({
          provider: activeAction.provider,
          title: formState.title || 'Video Render',
          media_type: 'video',
          render_profile: 'foundation',
          script: formState.script,
          metadata: { prompt: formState.prompt },
        });
      } else if (selectedAction === 'transcribe_media') {
        result = await createMediaTranscriptJobApi({
          provider: activeAction.provider,
          title: formState.title || 'Transcript Job',
          source_url: formState.source_url || null,
          transcript_text: formState.transcript_text || null,
        });
      } else if (selectedAction === 'ingest_meeting_artifacts') {
        const provider = formState.meetingProvider || 'zoom';
        const mediaUrl = formState.mediaUrl.trim();
        result = await ingestMeetingMediaApi({
          provider,
          source: provider,
          meeting_id: formState.meeting_id,
          meeting_title: formState.meeting_title || 'Meeting Ingest',
          transcript_text: formState.transcript_text || null,
          auto_transcribe: Boolean(formState.transcript_text),
          recording_files: provider === 'zoom' && mediaUrl ? [{ file_name: formState.meeting_title || 'Zoom Recording', url: mediaUrl, media_type: 'video' }] : [],
          drive_files: provider === 'google_meet_drive' && mediaUrl ? [{ name: formState.meeting_title || 'Drive Recording', url: mediaUrl, mime_type: 'video/mp4' }] : [],
        });
      }

      const job = result?.job || null;
      const artifact = result?.artifact || null;
      const assets = Array.isArray(result?.assets) ? result.assets : [];
      setLastLaunchResult({
        action: activeAction.label,
        jobId: job?.id || '',
        artifactId: artifact?.id || '',
        assetIds: assets.map((asset) => asset?.id).filter(Boolean),
        status: job?.status || (artifact ? 'complete' : ''),
      });
      await loadWorkspace('refresh');
    } catch (launchError) {
      setError(launchError.message || 'Unable to launch the media action.');
    } finally {
      setLaunchingAction('');
    }
  }, [activeAction.label, activeAction.provider, formState, loadWorkspace, selectedAction]);

  const renderQuickActionForm = () => {
    if (selectedAction === 'generate_script') {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Title</span>
            <input value={formState.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Launch brief" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Topic</span>
            <input value={formState.topic} onChange={(event) => updateField('topic', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Product update" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Tone</span>
            <input value={formState.tone} onChange={(event) => updateField('tone', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Direct" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Duration</span>
            <input value={formState.duration} onChange={(event) => updateField('duration', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="12 minutes" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
            <span>Context</span>
            <textarea value={formState.context} onChange={(event) => updateField('context', event.target.value)} rows={3} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Media brief for a campaign-ready asset package." />
          </label>
        </div>
      );
    }

    if (selectedAction === 'generate_run_of_show') {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Title</span>
            <input value={formState.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Weekly operator sync" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Topic</span>
            <input value={formState.topic} onChange={(event) => updateField('topic', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Campaign handoff" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Duration</span>
            <input value={formState.duration} onChange={(event) => updateField('duration', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="30 minutes" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
            <span>Context</span>
            <textarea value={formState.context} onChange={(event) => updateField('context', event.target.value)} rows={3} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Live production handoff" />
          </label>
        </div>
      );
    }

    if (selectedAction === 'generate_voice') {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Title</span>
            <input value={formState.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Voice render" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Voice</span>
            <input value={formState.voice} onChange={(event) => updateField('voice', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Rachel" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
            <span>Text</span>
            <textarea value={formState.text} onChange={(event) => updateField('text', event.target.value)} rows={5} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Paste the script or talking track here." />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
            <span>Style</span>
            <input value={formState.style} onChange={(event) => updateField('style', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Conversational" />
          </label>
        </div>
      );
    }

    if (selectedAction === 'generate_thumbnail') {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Title</span>
            <input value={formState.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Product update" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Subtitle</span>
            <input value={formState.subtitle} onChange={(event) => updateField('subtitle', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Feature spotlight" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Background</span>
            <input value={formState.image} onChange={(event) => updateField('image', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Bold studio backdrop" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
            <span>Prompt</span>
            <textarea value={formState.prompt} onChange={(event) => updateField('prompt', event.target.value)} rows={4} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Create a bold media thumbnail with clean title space." />
          </label>
        </div>
      );
    }

    if (selectedAction === 'generate_video') {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Title</span>
            <input value={formState.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Media teaser" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
            <span>Script</span>
            <textarea value={formState.script} onChange={(event) => updateField('script', event.target.value)} rows={5} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Create a short teaser video for the asset package." />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
            <span>Prompt</span>
            <input value={formState.prompt} onChange={(event) => updateField('prompt', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="High-energy teaser with clean CTA framing." />
          </label>
        </div>
      );
    }

    if (selectedAction === 'transcribe_media') {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Title</span>
            <input value={formState.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Meeting transcript" />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <span>Source URL</span>
            <input value={formState.source_url} onChange={(event) => updateField('source_url', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="https://..." />
          </label>
          <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
            <span>Transcript Text</span>
            <textarea value={formState.transcript_text} onChange={(event) => updateField('transcript_text', event.target.value)} rows={5} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Paste transcript text for normalized artifact creation." />
          </label>
        </div>
      );
    }

    return (
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <span>Meeting Provider</span>
          <select value={formState.meetingProvider} onChange={(event) => updateField('meetingProvider', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none">
            <option value="zoom">Zoom</option>
            <option value="google_meet_drive">Google Meet / Drive</option>
            <option value="jitsi">Jitsi (Stub)</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <span>Meeting ID</span>
          <input value={formState.meeting_id} onChange={(event) => updateField('meeting_id', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="meeting-447" />
        </label>
        <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <span>Meeting Title</span>
          <input value={formState.meeting_title} onChange={(event) => updateField('meeting_title', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Weekly operator sync" />
        </label>
        <label className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <span>Media URL</span>
          <input value={formState.mediaUrl} onChange={(event) => updateField('mediaUrl', event.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="https://..." />
        </label>
        <label className="space-y-2 text-sm text-[var(--color-text-secondary)] md:col-span-2">
          <span>Transcript Text</span>
          <textarea value={formState.transcript_text} onChange={(event) => updateField('transcript_text', event.target.value)} rows={4} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" placeholder="Optional transcript text for immediate normalization." />
        </label>
      </div>
    );
  };

  const ActiveActionIcon = activeAction.icon;

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="text-sm text-[var(--color-text-secondary)]">Loading media workspace...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <ModuleHeader
        title="Media"
        showTitle={false}
        leftActions={[
          {
            label: 'Open Media Pipeline',
            icon: Play,
            onClick: () => handleLaunchTemplate(mediaTemplate),
            disabled: !mediaTemplate || Boolean(launchingTemplate),
            variant: 'primary',
            color: 'primary',
          }
        ]}
        toolbarLeftSlot={(
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar ml-2">
            <span className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-secondary)] shadow-island-sm h-7 flex items-center">
              Jobs: {workspace.counts.jobs}
            </span>
            <span className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-secondary)] shadow-island-sm h-7 flex items-center">
              Outputs: {workspace.counts.outputs}
            </span>
          </div>
        )}
        actions={[
          {
            label: refreshing ? 'Refreshing...' : 'Refresh',
            icon: RefreshCw,
            onClick: () => loadWorkspace('refresh'),
            disabled: refreshing,
          },
        ]}
        aiAssistSlot={(
          <button
            onClick={openAIAssist}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-hover)] transition"
            title="Brain"
          >
            <Brain size={16} />
          </button>
        )}
        executeSlot={(
          <button
            disabled={true}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-hover)] transition disabled:opacity-40"
            title="Execute"
          >
            <Crosshair size={16} />
          </button>
        )}
        hasSelection={false}
      />

      <div className="flex-1 min-h-0 p-2">
        <div className="h-full flex-1 min-h-0 overflow-y-auto no-scrollbar p-4">
        <div className="flex flex-col gap-4">
          {error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {lastLaunchResult ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              <div className="font-semibold text-emerald-200">{lastLaunchResult.action} launched</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-emerald-100/80">
                {lastLaunchResult.jobId ? `Job ${lastLaunchResult.jobId}` : 'No job id returned'}
                {lastLaunchResult.artifactId ? ` | Artifact ${lastLaunchResult.artifactId}` : ''}
                {lastLaunchResult.assetIds.length ? ` | Assets ${lastLaunchResult.assetIds.join(', ')}` : ''}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Quick Actions</div>
                  <div className="mt-1 text-sm text-[var(--color-text-secondary)]">Launch system-native media jobs from the existing media engine contracts.</div>
                </div>
                <button
                  type="button"
                  onClick={() => resetActionForm(selectedAction)}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)]"
                >
                  Reset
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {QUICK_ACTIONS.map((action) => {
                  const ActionIcon = action.icon;
                  const isActive = action.key === selectedAction;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => resetActionForm(action.key)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/15 text-[var(--color-text-primary)]'
                          : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]'
                      }`}
                    >
                      <ActionIcon size={14} />
                      {action.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  <ActiveActionIcon size={16} />
                  {activeAction.label}
                </div>
                <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Runs against the current media engine and writes back into the same job and artifact state used by Flows.</div>
                <div className="mt-4">{renderQuickActionForm()}</div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => resetActionForm(selectedAction)}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)]"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitQuickAction}
                    disabled={!canSubmitQuickAction || Boolean(launchingAction)}
                    className="btn-primary-skeuo shrink-0 text-xs"
                  >
                    <Target size={14} />
                    {launchingAction === selectedAction ? 'Launching...' : 'Launch Action'}
                  </button>
                </div>
              </div>
            </section>

            <div className="flex flex-col gap-4">
              <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Flow Templates / Presets</div>
                <div className="mt-1 text-sm text-[var(--color-text-secondary)]">Open reusable flow templates in the builder without leaving the system.</div>
                {mediaTemplate ? (
                  <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                      <Clapperboard size={16} />
                      {mediaTemplate.name}
                    </div>
                    <div className="mt-2 text-sm text-[var(--color-text-secondary)]">{mediaTemplate.description}</div>
                    <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                      <span>{mediaTemplate.category}</span>
                      <span>·</span>
                      <span>{mediaTemplate.complexity}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleLaunchTemplate(mediaTemplate)}
                        disabled={Boolean(launchingTemplate)}
                        className="btn-primary-skeuo text-xs"
                      >
                        <Play size={14} />
                        {launchingTemplate === mediaTemplate.id ? 'Opening...' : 'Open in Flows'}
                      </button>
                      <button type="button" onClick={() => resetActionForm('generate_script')} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)]">Script Preset</button>
                      <button type="button" onClick={() => resetActionForm('generate_voice')} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)]">Voice Preset</button>
                      <button type="button" onClick={() => resetActionForm('transcribe_media')} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)]">Transcript Preset</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">No media template is available yet.</div>
                )}
              </section>

              <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Ingestion / Source Status</div>
                <div className="mt-1 text-sm text-[var(--color-text-secondary)]">Operational adapter availability inside the media workflow layer.</div>
                <div className="mt-4 space-y-3">
                  {INGESTION_SOURCES.map((source) => (
                    <div key={source.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{source.label}</div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${source.tone}`}>
                          {source.status}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-[var(--color-text-secondary)]">{source.detail}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Recent Media Jobs</div>
                <div className="mt-1 text-sm text-[var(--color-text-secondary)]">Live job state from the current media engine store.</div>
              </div>
              <div className="flex items-center gap-1">
                {MEDIA_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTypeFilter(option.value)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition whitespace-nowrap ${
                      typeFilter === option.value
                        ? 'text-[var(--color-text-primary)] border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'text-[var(--color-text-secondary)] border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/30'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-[0.18em]">{filteredJobs.length} visible</div>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--color-border)]">
              <div className="overflow-x-auto no-scrollbar">
                <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
                  <thead className="bg-[var(--color-bg-primary)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Job</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Provider</th>
                      <th className="px-4 py-3 text-left font-semibold">Created</th>
                      <th className="px-4 py-3 text-left font-semibold">Artifact / Asset</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                    {filteredJobs.slice(0, 10).map((job) => (
                      <tr key={job.id}>
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-[var(--color-text-primary)]">{job.title}</div>
                          <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{job.typeLabel} | {job.id}</div>
                          {job.lastError ? <div className="mt-2 text-xs text-rose-200">{job.lastError}</div> : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusTone(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-[var(--color-text-secondary)]">{job.provider}</td>
                        <td className="px-4 py-3 align-top text-[var(--color-text-secondary)]">{formatTimestamp(job.createdAt)}</td>
                        <td className="px-4 py-3 align-top text-xs text-[var(--color-text-secondary)]">
                          {job.artifactId ? `Artifact ${job.artifactId}` : job.assetId ? `Asset ${job.assetId}` : 'Pending'}
                        </td>
                      </tr>
                    ))}
                    {!filteredJobs.length ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-[var(--color-text-secondary)]">
                          No media jobs match the current search and filter state.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Recent Outputs / Artifacts</div>
                <div className="mt-1 text-sm text-[var(--color-text-secondary)]">Recent assets and artifacts from the existing media workflow store.</div>
              </div>
              <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-[0.18em]">{filteredOutputs.length} visible</div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredOutputs.slice(0, 9).map((output) => (
                <article key={output.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{output.title}</div>
                      <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{output.typeLabel} | {output.id}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusTone(output.status)}`}>
                      {output.mediaType === 'text' ? 'Artifact' : output.mediaType}
                    </span>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{output.provider} | {formatTimestamp(output.createdAt)}</div>
                  <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                    {output.mediaType === 'audio' && output.sourceUrl ? (
                      <audio controls className="w-full">
                        <source src={output.sourceUrl} />
                      </audio>
                    ) : output.mediaType === 'image' && output.sourceUrl ? (
                      <img src={output.sourceUrl} alt={output.title} className="h-40 w-full rounded-lg object-cover" />
                    ) : output.mediaType === 'video' && output.sourceUrl ? (
                      <video controls className="h-40 w-full rounded-lg bg-black object-cover">
                        <source src={output.sourceUrl} />
                      </video>
                    ) : (
                      <div className="text-sm text-[var(--color-text-secondary)]">{summarizeText(output.previewText)}</div>
                    )}
                  </div>
                  {output.sourceUrl ? (
                    <a href={output.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                      Open Source
                    </a>
                  ) : null}
                </article>
              ))}
              {!filteredOutputs.length ? (
                <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-text-secondary)] md:col-span-2 2xl:col-span-3">
                  No outputs match the current search and filter state.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default MediaModule;
